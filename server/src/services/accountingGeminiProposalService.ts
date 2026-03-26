import { z } from 'zod';
import { env } from '../config/env';
import { generateGeminiContent, GeminiClientError } from '../integrations/google/gemini.client';
import { getStorageClient } from '../integrations/google/storage.client';
import {
  buildCheckGeminiPath,
  buildGeminiPath
} from './accountingStorageService';
import { buildMatchingProposal } from './matchingEngine';
import { quickbooksTxnTypeSchema, proposalSchema } from '@retailsync/shared';

type MatchingProposal = Awaited<ReturnType<typeof buildMatchingProposal>>;

const entitySchema = z.object({
  qbId: z.string().trim().min(1),
  displayName: z.string().trim().min(1),
  entityType: z.enum(['vendor', 'customer', 'employee'])
});

const historicalSignalSchema = z.object({
  description: z.string().trim().min(1),
  proposal: proposalSchema.partial().optional()
});

const geminiProposalSchema = z.object({
  qbTxnType: quickbooksTxnTypeSchema.optional(),
  bankAccountId: z.string().trim().optional(),
  categoryAccountId: z.string().trim().optional(),
  payeeType: z.enum(['vendor', 'customer', 'employee', 'other']).optional(),
  payeeId: z.string().trim().optional(),
  payeeName: z.string().trim().optional(),
  transferTargetAccountId: z.string().trim().optional(),
  memo: z.string().trim().optional(),
  confidence: z.number().min(0).max(1).optional(),
  reasons: z.array(z.string().trim()).default([]),
  version: z.literal('v1').default('v1')
}).strict();

const geminiProposalEnvelopeSchema = z.object({
  proposal: geminiProposalSchema.optional(),
  status: z.enum(['approved', 'needs_review', 'deferred']).optional(),
  explanation: z.string().trim().optional()
}).strict();

const geminiResponseSchema = z.union([geminiProposalEnvelopeSchema, geminiProposalSchema]);

type GeminiProposal = z.infer<typeof geminiProposalSchema>;
type ArtifactPaths = {
  promptPath?: string;
  rawPath?: string;
  normalizedPath?: string;
};

export class AccountingGeminiProposalError extends Error {
  code: string;

  retryable: boolean;

  constructor(
    code: string,
    message: string,
    options: {
      retryable?: boolean;
      cause?: unknown;
    } = {}
  ) {
    super(message);
    this.name = 'AccountingGeminiProposalError';
    this.code = code;
    this.retryable = Boolean(options.retryable ?? false);
    if (options.cause instanceof Error && options.cause.stack) {
      this.stack = `${this.stack}\nCaused by: ${options.cause.stack}`;
    }
  }
}

export type AccountingGeminiProposalInput = {
  companyId: string;
  description: string;
  merchant?: string;
  amount: number;
  type: 'debit' | 'credit';
  check?: {
    payeeName?: string;
    amount?: number;
    extracted?: {
      checkNumber?: string;
      date?: string;
      payeeName?: string;
      amount?: number;
      memo?: string;
    };
  };
  statementMonth?: string;
  pageContext?: string;
  referenceEntities?: Array<z.infer<typeof entitySchema>>;
  historicalSignals?: Array<z.infer<typeof historicalSignalSchema>>;
  fallbackProposal?: MatchingProposal;
  checkKey?: string;
  persistArtifacts?: boolean;
  bucketName?: string;
  rootPrefix?: string;
  promptVersion?: string;
};

export type AccountingGeminiProposalResult = {
  provider: 'gemini';
  providerStatus: 'healthy' | 'degraded' | 'unavailable';
  degraded: boolean;
  degradedReason?: string;
  source: 'gemini' | 'fallback' | 'hybrid';
  confidence: number;
  proposal: MatchingProposal;
  fallbackProposal: MatchingProposal;
  geminiProposal?: Partial<MatchingProposal>;
  rawResponse?: unknown;
  normalizedResponse?: unknown;
  reasons: string[];
  artifacts: {
    promptPath?: string;
    rawPath?: string;
    normalizedPath?: string;
  };
};

const normalizeText = (value: string) => String(value ?? '').replace(/\s+/g, ' ').trim();

const extractJsonCandidate = (text: string) => {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const trimmed = text.trim();
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return trimmed;
};

const buildArtifactPaths = (args: { rootPrefix: string; checkKey?: string }) => {
  if (args.checkKey) {
    return {
      promptPath: buildCheckGeminiPath(args.rootPrefix, args.checkKey, 'proposal.prompt.v1.txt'),
      rawPath: buildCheckGeminiPath(args.rootPrefix, args.checkKey, 'proposal.raw.v1.json'),
      normalizedPath: buildCheckGeminiPath(args.rootPrefix, args.checkKey, 'proposal.normalized.v1.json')
    };
  }

  return {
    promptPath: buildGeminiPath(args.rootPrefix, 'proposal.prompt.v1.txt'),
    rawPath: buildGeminiPath(args.rootPrefix, 'proposal.raw.v1.json'),
    normalizedPath: buildGeminiPath(args.rootPrefix, 'proposal.normalized.v1.json')
  };
};

const saveText = async (bucketName: string, objectPath: string, text: string) => {
  const storage = getStorageClient();
  await storage.bucket(bucketName).file(objectPath).save(text, {
    contentType: 'text/plain'
  });
};

const saveJson = async (bucketName: string, objectPath: string, value: unknown) => {
  const storage = getStorageClient();
  await storage.bucket(bucketName).file(objectPath).save(JSON.stringify(value, null, 2), {
    contentType: 'application/json'
  });
};

const buildPrompt = (args: AccountingGeminiProposalInput & { fallbackProposal: MatchingProposal }) => {
  const payload = {
    companyId: args.companyId,
    statementMonth: args.statementMonth ?? null,
    transaction: {
      description: normalizeText(args.description),
      merchant: args.merchant ? normalizeText(args.merchant) : null,
      amount: args.amount,
      type: args.type,
      check: args.check
        ? {
          payeeName: args.check.payeeName ?? null,
          amount: args.check.amount ?? null,
          extracted: args.check.extracted ?? null
        }
        : null
    },
    fallbackProposal: args.fallbackProposal,
    referenceEntities: args.referenceEntities ?? [],
    historicalSignals: args.historicalSignals ?? []
  };

  return [
    'You are helping classify a bank-statement transaction for bookkeeping.',
    'Return JSON only. Do not wrap the response in markdown fences.',
    'Choose the most likely QuickBooks transaction type and supporting fields.',
    'Prefer real evidence from the provided transaction and reference entities.',
    'If uncertain, lower confidence and keep reasons specific.',
    'Use the fallback proposal as a baseline, not as a blind copy.',
    'Output schema:',
    '{',
    '  "qbTxnType": "Expense|Deposit|Transfer|Check",',
    '  "bankAccountId": "string|null",',
    '  "categoryAccountId": "string|null",',
    '  "payeeType": "vendor|customer|employee|other|null",',
    '  "payeeId": "string|null",',
    '  "payeeName": "string|null",',
    '  "transferTargetAccountId": "string|null",',
    '  "memo": "string|null",',
    '  "confidence": 0.0,',
    '  "reasons": ["string"],',
    '  "version": "v1"',
    '}',
    'Context JSON:',
    JSON.stringify(payload, null, 2)
  ].join('\n');
};

const mergeProposals = (
  fallback: MatchingProposal,
  gemini: GeminiProposal
): MatchingProposal => {
  const reasons = Array.from(
    new Set([
      ...fallback.reasons,
      ...(gemini.reasons ?? []),
      'Gemini-assisted proposal merged with deterministic fallback'
    ])
  );

  return {
    ...fallback,
    ...(gemini.qbTxnType ? { qbTxnType: gemini.qbTxnType } : {}),
    ...(gemini.bankAccountId ? { bankAccountId: gemini.bankAccountId } : {}),
    ...(gemini.categoryAccountId ? { categoryAccountId: gemini.categoryAccountId } : {}),
    ...(gemini.payeeType ? { payeeType: gemini.payeeType } : {}),
    ...(gemini.payeeId ? { payeeId: gemini.payeeId } : {}),
    ...(gemini.payeeName ? { payeeName: gemini.payeeName } : {}),
    ...(gemini.transferTargetAccountId ? { transferTargetAccountId: gemini.transferTargetAccountId } : {}),
    ...(gemini.memo ? { memo: gemini.memo } : {}),
    confidence: Number(Math.min(0.98, Math.max(fallback.confidence, gemini.confidence ?? 0)).toFixed(2)),
    reasons,
    version: gemini.version ?? fallback.version
  };
};

export const runAccountingGeminiProposal = async (
  input: AccountingGeminiProposalInput
): Promise<AccountingGeminiProposalResult> => {
  const fallbackProposal = input.fallbackProposal ?? (await buildMatchingProposal(input));
  const minConfidence = Number.isFinite(env.statementGeminiMinConfidence)
    ? env.statementGeminiMinConfidence
    : 0.65;
  const promptVersion = input.promptVersion ?? 'v1';
  const prompt = buildPrompt({ ...input, fallbackProposal });
  const artifactPaths: ArtifactPaths | undefined =
    input.persistArtifacts && input.bucketName && input.rootPrefix
      ? buildArtifactPaths({ rootPrefix: input.rootPrefix, checkKey: input.checkKey })
      : undefined;

  const providerStatusBase: AccountingGeminiProposalResult['providerStatus'] = 'unavailable';
  if (!env.statementGeminiApiKey) {
    if (artifactPaths && input.bucketName) {
      await Promise.all([
        saveText(input.bucketName, artifactPaths.promptPath as string, prompt),
        saveJson(input.bucketName, artifactPaths.rawPath as string, {
          provider: 'gemini',
          model: env.statementGeminiModel,
          promptVersion,
          response: null,
          error: {
            name: 'GeminiClientError',
            message: 'Gemini API key is not configured',
            retryable: false
          }
        }),
        saveJson(input.bucketName, artifactPaths.normalizedPath as string, {
          provider: 'gemini',
          promptVersion,
          providerStatus: providerStatusBase,
          source: 'fallback',
          proposal: fallbackProposal,
          fallbackProposal,
          degradedReason: 'Gemini API key is not configured'
        })
      ]);
    }

    return {
      provider: 'gemini',
      providerStatus: providerStatusBase,
      degraded: true,
      degradedReason: 'Gemini API key is not configured',
      source: 'fallback',
      confidence: fallbackProposal.confidence,
      proposal: fallbackProposal,
      fallbackProposal,
      rawResponse: null,
      normalizedResponse: null,
      reasons: [...fallbackProposal.reasons, 'Gemini unavailable; deterministic fallback used'],
      artifacts: artifactPaths ?? {}
    };
  }

  try {
    const response = await generateGeminiContent({
      prompt,
      systemInstruction: [
        'You are a financial classification assistant.',
        'Return valid JSON only.',
        'Do not include markdown fences or prose.'
      ].join(' '),
      model: env.statementGeminiModel,
      endpoint: env.statementGeminiEndpoint,
      apiKey: env.statementGeminiApiKey,
      timeoutMs: env.statementGeminiTimeoutMs,
      temperature: env.statementGeminiTemperature,
      maxOutputTokens: env.statementGeminiMaxOutputTokens,
      responseMimeType: 'application/json'
    });

    const jsonText = extractJsonCandidate(response.text);
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch (error) {
      throw new AccountingGeminiProposalError('GEMINI_BAD_JSON', 'Gemini output was not valid JSON', {
        retryable: true,
        cause: error
      });
    }

    const normalized = geminiResponseSchema.parse(parsed);
    const geminiProposal = ('proposal' in normalized && normalized.proposal ? normalized.proposal : normalized) as GeminiProposal;
    const proposalConfidence = Number(geminiProposal.confidence ?? 0);
    const isConfident = proposalConfidence >= minConfidence;

    const proposal = isConfident
      ? mergeProposals(fallbackProposal, geminiProposal)
      : fallbackProposal;
    const source: AccountingGeminiProposalResult['source'] = isConfident ? 'hybrid' : 'fallback';

    if (artifactPaths && input.bucketName) {
      await Promise.all([
        saveText(input.bucketName, artifactPaths.promptPath as string, prompt),
        saveJson(input.bucketName, artifactPaths.rawPath as string, {
          provider: 'gemini',
          model: env.statementGeminiModel,
          promptVersion,
          response: response.raw
        }),
        saveJson(input.bucketName, artifactPaths.normalizedPath as string, {
          provider: 'gemini',
          promptVersion,
          providerStatus: isConfident ? 'healthy' : 'degraded',
          source,
          proposal,
          fallbackProposal,
          geminiProposal,
          confidence: proposal.confidence,
          reasons: proposal.reasons
        })
      ]);
    }

    return {
      provider: 'gemini',
      providerStatus: isConfident ? 'healthy' : 'degraded',
      degraded: !isConfident,
      degradedReason: isConfident ? undefined : 'Gemini confidence below threshold; deterministic fallback used',
      source,
      confidence: proposal.confidence,
      proposal,
      fallbackProposal,
      geminiProposal,
      rawResponse: response.raw,
      normalizedResponse: normalized,
      reasons: proposal.reasons,
      artifacts: artifactPaths ?? {}
    };
  } catch (error) {
    const retryable =
      error instanceof GeminiClientError
        ? error.retryable
        : error instanceof AccountingGeminiProposalError
          ? error.retryable
          : true;
    const degradedReason = error instanceof Error ? error.message : 'Gemini request failed';

    if (artifactPaths && input.bucketName) {
      await Promise.all([
        saveText(input.bucketName, artifactPaths.promptPath as string, prompt),
        saveJson(input.bucketName, artifactPaths.rawPath as string, {
          provider: 'gemini',
          model: env.statementGeminiModel,
          promptVersion,
          error: {
            name: error instanceof Error ? error.name : 'Error',
            message: degradedReason,
            retryable
          }
        }),
        saveJson(input.bucketName, artifactPaths.normalizedPath as string, {
          provider: 'gemini',
          promptVersion,
          providerStatus: 'unavailable',
          source: 'fallback',
          proposal: fallbackProposal,
          fallbackProposal,
          degradedReason
        })
      ]);
    }

    return {
      provider: 'gemini',
      providerStatus: 'unavailable',
      degraded: true,
      degradedReason,
      source: 'fallback',
      confidence: fallbackProposal.confidence,
      proposal: fallbackProposal,
      fallbackProposal,
      rawResponse: null,
      normalizedResponse: null,
      reasons: [...fallbackProposal.reasons, `Gemini unavailable: ${degradedReason}`],
      artifacts: artifactPaths ?? {}
    };
  }
};
