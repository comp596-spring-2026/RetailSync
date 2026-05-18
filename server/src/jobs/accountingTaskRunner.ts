import {
  AccountingJobType,
  AccountingTaskPayload,
  accountingTaskPayloadSchema
} from '@retailsync/shared';
import { Types } from 'mongoose';
import { env } from '../config/env';
import { setRequestContext } from '../config/requestContext';
import { getStorageClient } from '../integrations/google/storage.client';
import { BankStatement } from '../models/BankStatement';
import { LedgerEntryModel } from '../models/LedgerEntry';
import { RunModel } from '../models/Run';
import { StatementCheckModel } from '../models/StatementCheck';
import { StatementTransactionModel } from '../models/StatementTransaction';
import type { CheckRegionCandidate, StatementPageObservation } from '../services/accountingStatementOcrService';
import { extractStatementPagesFromPdfBuffer } from '../services/accountingPdfTextExtractionService';
import {
  deriveSectionBoundsFromLayout,
  applyLayoutSectionsToParsedTransactions,
  extractChecksClearedFromLayout,
  extractDailyBalancesFromLayout,
  extractStatementPagesLayoutFromPdfBuffer,
  type ExtractedCheckRow,
  type ExtractedDailyBalance,
  type StatementPageSectionBounds
} from '../services/accountingPdfLayoutExtractionService';
import {
  buildFallbackManualCheckSlots,
  computeManualCheckSlot,
  detectCheckImagePages,
  DEFAULT_CHECK_IMAGE_PRESET,
  isCheckImagePageText,
  isLikelyChecksClearedTableCrop,
  resolveCheckImageCropPlacement
} from '../services/accountingCheckLayoutService';
import {
  buildCheckCropPath,
  buildCheckOcrPath,
  buildCheckStructuredPath,
  buildStatementJsonPath,
  buildStatementChecksClearedTablePath,
  buildStatementClassificationOutputPath,
  buildStatementExtractedChecksPath,
  buildGeminiPath,
  buildOcrPath,
  buildPageImagePath,
  buildStatementProcessingSummaryPath,
  buildStatementStructuredModelPath,
  buildStatementEvidencePath,
  buildStatementValidationReportPath,
  buildStatementInternalSuggestionPath,
  buildStatementPdfLayoutPath,
  buildStatementSuggestionsOutputPath,
  buildStatementTransactionSectionsPath,
  buildStatementTransactionsTablePath,
  buildStatementOcrTextPath
} from '../services/accountingStorageService';
import { persistStatementFailure, persistStatementPatch } from '../services/bankStatementPersistence';
import { renderAndPersistStatementPages } from '../services/accountingPdfRenderService';
import { runStatementCheckExtraction } from '../services/accountingCheckExtractionService';
import { extractOfflineStatement } from '../statement-extraction/offline';
import { buildMatchingProposal } from '../services/matchingEngine';
import { buildStatementEvidenceRows, buildStatementValidationReport } from '../services/statementValidationService';
import {
  markQuickBooksSyncFailure,
  postApprovedLedgerEntriesToQuickBooks,
  syncQuickBooksReferenceData
} from '../services/quickbooksSyncService';

export type AccountingTaskRunResult = {
  taskId: string;
  companyId: string;
  statementId?: string;
  checkId?: string;
  jobType: AccountingJobType;
  status: 'completed' | 'failed';
  nextJobType?: AccountingJobType;
};

const nextJobMap: Partial<Record<AccountingJobType, AccountingJobType>> = {
  'statement.extract': 'statement.structure',
  'statement.structure': 'checks.spawn'
};

const statementJobTypes: AccountingJobType[] = [
  'statement.extract',
  'statement.structure',
  'checks.spawn',
  'check.process',
  'matching.refresh'
];

const syncJobTypes: AccountingJobType[] = [
  'quickbooks.refresh_reference_data',
  'quickbooks.post_approved'
];

const storage = getStorageClient();
const nowIso = () => new Date().toISOString();

const withTimeout = async <T>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
  if (!Number.isFinite(ms) || ms <= 0) {
    return promise;
  }
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`));
    }, ms);
  });
  try {
    return (await Promise.race([promise, timeoutPromise])) as T;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

const logStage = (
  label: string,
  payload: { statementId?: string; companyId?: string } & Record<string, unknown>
) => {
  // eslint-disable-next-line no-console
  console.info(`[accounting.extract] ${label}`, {
    at: nowIso(),
    ...payload
  });
};

const statementStageTimestampKeys = {
  uploaded: 'uploadedAt',
  extracting: 'extractingAt',
  structuring: 'structuringAt',
  checks_queued: 'checksQueuedAt',
  needs_parser_review: 'parserReviewAt',
  ready_for_review: 'readyForReviewAt',
  failed: 'failedAt'
} as const;

type StatementProgressCounts = {
  totalChecks?: number;
  checksQueued?: number;
  checksProcessing?: number;
  checksReady?: number;
  checksFailed?: number;
};

const buildStatementProgress = (phase: string, counts: StatementProgressCounts = {}) => {
  const totalChecks = Number(counts.totalChecks ?? 0);
  const checksQueued = Number(counts.checksQueued ?? 0);
  const checksProcessing = Number(counts.checksProcessing ?? 0);
  const checksReady = Number(counts.checksReady ?? 0);
  const checksFailed = Number(counts.checksFailed ?? 0);
  const completedChecks = checksReady + checksFailed;

  return {
    phase,
    totalChecks,
    checksQueued,
    checksProcessing,
    checksReady,
    checksFailed,
    completedChecks,
    remainingChecks: Math.max(totalChecks - completedChecks, 0)
  };
};

const mergeStageTimestamps = (
  existing: Record<string, unknown> | undefined,
  patch: Record<string, unknown> | undefined
) => {
  const next: Record<string, unknown> = { ...(existing ?? {}) };
  if (patch) {
    for (const [key, value] of Object.entries(patch)) {
      // Explicit `undefined` is treated as "leave existing value alone" so we
      // never clobber prior stage timestamps (e.g. readyForReviewAt) when a
      // later phase merges an unrelated patch.
      if (value === undefined) continue;
      next[key] = value;
    }
  }
  return next;
};

const mergeStatementArtifacts = (statement: any, patch: Record<string, unknown>) => {
  const currentArtifacts = statement.artifacts ?? {};
  const nextArtifacts = {
    ...currentArtifacts,
    ...patch,
    stageTimestamps: mergeStageTimestamps(
      currentArtifacts.stageTimestamps,
      patch.stageTimestamps as Record<string, unknown> | undefined
    )
  };
  statement.artifacts = nextArtifacts;
  return nextArtifacts;
};

const mergeCheckArtifacts = (check: any, patch: Record<string, unknown>) => {
  const currentArtifacts = check.artifacts ?? {};
  const nextArtifacts = {
    ...currentArtifacts,
    ...patch,
    stageTimestamps: mergeStageTimestamps(
      currentArtifacts.stageTimestamps,
      patch.stageTimestamps as Record<string, unknown> | undefined
    )
  };
  check.artifacts = nextArtifacts;
  return nextArtifacts;
};

const mergeCheckProcessing = (check: any, patch: Record<string, unknown>) => {
  const currentProcessing = check.processing ?? {};
  const nextProcessing = {
    ...currentProcessing,
    ...patch
  };
  check.processing = nextProcessing;
  return nextProcessing;
};

const resolveStatementPageImagePath = (
  statement: any,
  rootPrefix: string,
  pageNumber?: number | null
) => {
  const pageImagePaths = Array.isArray(statement?.artifacts?.pageImagePaths)
    ? statement.artifacts.pageImagePaths.map((value: unknown) => String(value))
    : [];

  if (typeof pageNumber === 'number' && Number.isFinite(pageNumber) && pageNumber > 0) {
    return pageImagePaths[pageNumber - 1] ?? buildPageImagePath(rootPrefix, pageNumber);
  }

  return pageImagePaths[0] ?? buildPageImagePath(rootPrefix, 1);
};

const updateStatementStage = (
  statement: any,
  stage: keyof typeof statementStageTimestampKeys,
  patch: Record<string, unknown> = {}
) => {
  const timestampKey = statementStageTimestampKeys[stage];
  mergeStatementArtifacts(statement, {
    ...patch,
    stageTimestamps: {
      [timestampKey]: nowIso()
    }
  });
  statement.status = stage as any;
  return statement;
};

const updateStatementProgress = (statement: any, phase: string, counts?: StatementProgressCounts) => {
  statement.progress = buildStatementProgress(phase, counts ?? statement.progress ?? {});
  return statement.progress;
};

const ensureGcsConfigured = () => {
  if (!env.gcsBucketName) {
    throw new Error('GCS_BUCKET_NAME is required for accounting worker pipeline');
  }
  return env.gcsBucketName;
};

const saveJson = async (bucketName: string, objectPath: string, value: unknown) => {
  const file = storage.bucket(bucketName).file(objectPath);
  await file.save(JSON.stringify(value, null, 2), {
    contentType: 'application/json'
  });
};

const saveText = async (bucketName: string, objectPath: string, text: string) => {
  const file = storage.bucket(bucketName).file(objectPath);
  await file.save(text, {
    contentType: 'text/plain'
  });
};

const saveBuffer = async (bucketName: string, objectPath: string, buffer: Buffer, contentType: string) => {
  const file = storage.bucket(bucketName).file(objectPath);
  await file.save(buffer, {
    contentType,
    resumable: false,
    validation: false
  });
};

const downloadFileAsText = async (bucketName: string, objectPath: string) => {
  const file = storage.bucket(bucketName).file(objectPath);
  const [buffer] = await file.download();
  return buffer.toString('utf-8');
};

const downloadFileBuffer = async (bucketName: string, objectPath: string) => {
  const file = storage.bucket(bucketName).file(objectPath);
  const [buffer] = await file.download();
  return buffer;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isGcsObjectMutationRateLimitError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const statusCode =
    typeof error === 'object' && error && 'code' in error
      ? Number((error as { code?: unknown }).code)
      : NaN;
  const normalized = message.toLowerCase();
  return (
    statusCode === 429 ||
    normalized.includes('rate limit') ||
    normalized.includes('ratelimitexceeded') ||
    normalized.includes('too many requests') ||
    normalized.includes('quota exceeded') ||
    (normalized.includes('object') && normalized.includes('mutation'))
  );
};

const saveJsonWithRateLimitBackoff = async (
  bucketName: string,
  objectPath: string,
  value: unknown,
  attempts = 5
) => {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await saveJson(bucketName, objectPath, value);
      return;
    } catch (error) {
      lastError = error;
      if (!isGcsObjectMutationRateLimitError(error) || attempt === attempts - 1) {
        throw error;
      }
      const backoffMs = Math.min(8000, 1200 * 2 ** attempt) + Math.floor(Math.random() * 350);
      // eslint-disable-next-line no-console
      console.warn('[gcs] object mutation rate limit hit, retrying extracted-checks write', {
        objectPath,
        attempt: attempt + 1,
        backoffMs
      });
      await sleep(backoffMs);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError ?? 'Unknown GCS write failure'));
};

const normalizeDate = (value: string) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const slash = value.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (slash) {
    const yearRaw = slash[3] ? slash[3] : new Date().getFullYear().toString();
    const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
    return `${year}-${slash[1].padStart(2, '0')}-${slash[2].padStart(2, '0')}`;
  }
  return new Date().toISOString().slice(0, 10);
};

export type ParsedTransaction = {
  localId: string;
  postDate: string;
  description: string;
  merchant: string;
  amount: number;
  type: 'debit' | 'credit';
  rowType:
    | 'beginning_balance'
    | 'ending_balance'
    | 'daily_balance'
    | 'summary_total'
    | 'deposit'
    | 'electronic_credit'
    | 'other_credit'
    | 'electronic_debit'
    | 'check_cleared'
    | 'noise';
  section:
    | 'account_summary'
    | 'deposits'
    | 'electronic_credits'
    | 'other_credits'
    | 'electronic_debits'
    | 'checks_cleared'
    | 'daily_balances'
    | 'unknown';
  transactionFamily:
    | 'transfer'
    | 'vendor_payment'
    | 'tax_payment'
    | 'software'
    | 'refund'
    | 'check'
    | 'settlement'
    | 'other';
  isPostingCandidate: boolean;
  checkNumber?: string;
  sourceLocator: {
    rowIndex: number;
    pageNumber?: number;
    section?: string;
    sourceText?: string;
    bbox?: [number, number, number, number];
  };
};

type StatementClassification =
  | 'check'
  | 'deposit'
  | 'expense'
  | 'payment'
  | 'transfer'
  | 'fee'
  | 'adjustment'
  | 'unknown';

type StatementSuggestedAction =
  | 'create_check'
  | 'create_expense'
  | 'create_receive_payment'
  | 'create_deposit'
  | 'create_transfer'
  | 'link_existing'
  | 'ignore';

export type StatementPageObservationWithRegions = StatementPageObservation & {
  checkRegions?: CheckRegionCandidate[];
};

const parseMoney = (value: string) => Number(String(value).replace(/[$,]/g, '').replace(/^\((.*)\)$/, '-$1'));

const normalizeText = (value: string) => String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

const normalizeOcrTransactionLine = (line: string) =>
  String(line ?? '')
    // Split fused date + text, e.g. 2/03/2025West...
    .replace(
      /(\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\b\d{4}-\d{2}-\d{2})(?=[A-Za-z])/g,
      '$1 '
    )
    // Split fused description + amount, e.g. ...ENT0508A$5,323.96
    .replace(/([A-Za-z])(?=\$?\d)/g, '$1 ')
    // Split fused lowercase->Uppercase token boundaries from OCR joins.
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();

const splitJoinedTransactionLine = (line: string) => {
  const normalized = String(line ?? '').trim();
  if (!normalized) return [] as string[];

  const dateTokenPattern = /\b(?:\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\d{4}-\d{2}-\d{2})\b/g;
  const dateMatches = [...normalized.matchAll(dateTokenPattern)];
  if (dateMatches.length <= 1) return [normalized];

  const segments: string[] = [];
  for (let index = 0; index < dateMatches.length; index += 1) {
    const start = dateMatches[index].index ?? 0;
    const end =
      index + 1 < dateMatches.length
        ? (dateMatches[index + 1].index ?? normalized.length)
        : normalized.length;
    const segment = normalized.slice(start, end).trim();
    if (/\$?\d[\d,]*\.\d{2}/.test(segment)) {
      segments.push(segment);
    }
  }

  return segments.length > 0 ? segments : [normalized];
};

const sectionHeadingMatchers: Array<{
  section:
    | 'account_summary'
    | 'deposits'
    | 'electronic_credits'
    | 'other_credits'
    | 'electronic_debits'
    | 'checks_cleared'
    | 'daily_balances';
  pattern: RegExp;
}> = [
  { section: 'account_summary', pattern: /^account\s+summary(\s+\(continued\))?$/i },
  { section: 'deposits', pattern: /^deposits?(\s+\(continued\))?$/i },
  {
    section: 'electronic_credits',
    pattern: /^electronic\s+(?:deposits|credits)(\s+\(continued\))?$/i
  },
  { section: 'other_credits', pattern: /^other\s+credits(\s+\(continued\))?$/i },
  { section: 'electronic_debits', pattern: /^electronic\s+debits(\s+\(continued\))?$/i },
  { section: 'checks_cleared', pattern: /^checks?\s+(?:cleared|paid)(\s+\(continued\))?$/i },
  { section: 'daily_balances', pattern: /^daily\s+balances?(\s+\(continued\))?$/i }
];

const detectSectionHeading = (line: string) =>
  sectionHeadingMatchers.find((entry) => entry.pattern.test(line))?.section;

const mapSectionToRowType = (
  section:
    | 'account_summary'
    | 'deposits'
    | 'electronic_credits'
    | 'other_credits'
    | 'electronic_debits'
    | 'checks_cleared'
    | 'daily_balances'
    | 'unknown'
):
  | 'daily_balance'
  | 'deposit'
  | 'electronic_credit'
  | 'other_credit'
  | 'electronic_debit'
  | 'check_cleared'
  | 'noise' => {
  if (section === 'daily_balances') return 'daily_balance';
  if (section === 'deposits') return 'deposit';
  if (section === 'electronic_credits') return 'electronic_credit';
  if (section === 'other_credits') return 'other_credit';
  if (section === 'electronic_debits') return 'electronic_debit';
  if (section === 'checks_cleared') return 'check_cleared';
  return 'noise';
};

const deriveTransactionFamily = (line: string, hasCheckNumber: boolean): ParsedTransaction['transactionFamily'] => {
  const normalized = normalizeText(line);
  if (hasCheckNumber) return 'check';
  if (/internet transfer|transfer to|transfer from|\btransfer\b/.test(normalized)) return 'transfer';
  if (/georgia its tax|irs usa|troup co/.test(normalized)) return 'tax_payment';
  if (/intuit|qbooks|acctverify/.test(normalized)) return 'software';
  if (/return/.test(normalized)) return 'refund';
  if (/west georgia man payment|hackney/.test(normalized)) return 'settlement';
  if (/payment|ach|bill pay/.test(normalized)) return 'vendor_payment';
  return 'other';
};

const classifyStatementTransaction = (txn: ParsedTransaction): {
  classification: StatementClassification;
  confidence: number;
  suggestedAction: StatementSuggestedAction;
} => {
  if (!txn.isPostingCandidate) {
    return { classification: 'unknown', confidence: 0.6, suggestedAction: 'ignore' };
  }
  if (txn.rowType === 'check_cleared') {
    return { classification: 'check', confidence: 0.95, suggestedAction: 'create_check' };
  }
  if (txn.rowType === 'electronic_debit') {
    return { classification: 'expense', confidence: 0.88, suggestedAction: 'create_expense' };
  }
  if (txn.rowType === 'deposit' || txn.rowType === 'electronic_credit' || txn.rowType === 'other_credit') {
    return { classification: 'deposit', confidence: 0.85, suggestedAction: 'create_deposit' };
  }
  const text = normalizeText(`${txn.description} ${txn.merchant ?? ''}`);
  if (txn.checkNumber) {
    return { classification: 'check', confidence: 0.95, suggestedAction: 'create_check' };
  }
  if (/\btransfer\b|\bach\b.*\btransfer\b/.test(text)) {
    return { classification: 'transfer', confidence: 0.88, suggestedAction: 'create_transfer' };
  }
  if (/\bdeposit\b|\bcredit\b|\bcash\s+dep\b/.test(text)) {
    return { classification: 'deposit', confidence: 0.78, suggestedAction: 'create_deposit' };
  }
  if (/\bfee\b|\bservice\s+charge\b|\boverdraft\b/.test(text)) {
    return { classification: 'fee', confidence: 0.86, suggestedAction: 'create_expense' };
  }
  if (/\badjustment\b|\breversal\b/.test(text)) {
    return { classification: 'adjustment', confidence: 0.72, suggestedAction: 'ignore' };
  }
  if (/\bpayment\b|\bautopay\b/.test(text)) {
    return {
      classification: 'payment',
      confidence: 0.75,
      suggestedAction: 'create_expense'
    };
  }
  return {
    classification: 'unknown',
    confidence: 0.4,
    suggestedAction: 'link_existing'
  };
};

const buildGeminiProposalKey = (value: string) => value.replace(/[^a-zA-Z0-9._-]/g, '_');

const buildStatementTransactionGeminiKey = (txn: ParsedTransaction) =>
  buildGeminiProposalKey(txn.localId);

type MatchingProposalResult = Awaited<ReturnType<typeof buildMatchingProposal>>;

const persistInternalMatchingSuggestion = async (args: {
  bucketName: string;
  rootPrefix: string;
  proposal: MatchingProposalResult;
  key: string;
}) => {
  const suggestionPath = buildStatementInternalSuggestionPath(args.rootPrefix, args.key);
  await saveJson(args.bucketName, suggestionPath, {
    schemaVersion: 'v1',
    source: 'internal_matching',
    generatedAt: nowIso(),
    proposal: args.proposal
  });
  return { suggestionPath };
};

const scoreRegionForTransaction = (
  txn: ParsedTransaction,
  region: CheckRegionCandidate
) => {
  const regionText = normalizeText(region.text);
  let score = Number(region.score ?? 0);
  if (txn.checkNumber && regionText.includes(txn.checkNumber.toLowerCase())) {
    score += 5;
  }
  if (regionText.includes(txn.amount.toFixed(2)) || regionText.includes(txn.amount.toFixed(0))) {
    score += 3;
  }
  if (regionText.includes(normalizeText(txn.merchant)) || regionText.includes(normalizeText(txn.description))) {
    score += 2;
  }
  if (regionText.includes(normalizeText(txn.postDate))) {
    score += 1;
  }
  return score;
};

const findBestRegionForTransaction = (
  txn: ParsedTransaction,
  regions: CheckRegionCandidate[] = []
) => {
  let best: CheckRegionCandidate | null = null;
  let bestScore = 0;
  for (const region of regions) {
    const score = scoreRegionForTransaction(txn, region);
    if (score > bestScore) {
      best = region;
      bestScore = score;
    }
  }
  return best;
};

const parseTransactionsFromPage = (page: StatementPageObservation) => {
  const lines = page.text
    .split(/\r?\n/)
    .map((line) => normalizeOcrTransactionLine(line))
    .filter(Boolean)
    .slice(0, 500);

  const transactions: ParsedTransaction[] = [];
  let activeSection:
    | 'account_summary'
    | 'deposits'
    | 'electronic_credits'
    | 'other_credits'
    | 'electronic_debits'
    | 'checks_cleared'
    | 'daily_balances'
    | 'unknown' = 'unknown';
  const pattern =
    /(?<date>\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?).*?(?<amount>-?\$?\d{1,3}(?:,\d{3})*(?:\.\d{2})|-?\$?\d+(?:\.\d{2}))/;
  const checkPattern = /check\s*#?\s*(\d{2,8})/i;
  const checksClearedNumberPattern = /^(\d{2,8})\b/;
  const debitHintPattern = /payment|purchase|withdraw|debit|check\s*#|fee|bill\s*pay|ach\s*debit|transfer to/i;
  const creditHintPattern = /deposit|credit|return|refund|transfer from|ach\s*credit|interest/i;
  const balanceNoisePattern =
    /(?:^|[\s:])(available|current|running|ledger|ending|beginning|daily)\s+balance(?:$|[\s:])/i;
  const statementEndingPattern = /statement ending/i;
  const dateTokenPattern = /\b(?:\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\d{4}-\d{2}-\d{2})\b/;
  const amountOnlyPattern = /^\$?-?\d{1,3}(?:,\d{3})*(?:\.\d{2})$/;
  const timeOnlyPattern = /^\d{1,2}:\d{2}$/;
  let pendingSplitRow:
    | {
        rowIndex: number;
        sourceText: string;
      }
    | null = null;

  lines.forEach((line, index) => {
    const detectedSection = detectSectionHeading(line);
    if (detectedSection) {
      activeSection = detectedSection;
      pendingSplitRow = null;
      return;
    }

    const lineVariants = splitJoinedTransactionLine(line);
    const variants = lineVariants.length > 0 ? lineVariants : [line];
    variants.forEach((variant, variantIndex) => {
      const logicalLine = normalizeOcrTransactionLine(variant);
      if (!logicalLine) return;

      if (/item\(s\)\s+totaling/i.test(logicalLine)) {
        pendingSplitRow = null;
        const summaryAmount = logicalLine.match(/-?\$?\d{1,3}(?:,\d{3})*(?:\.\d{2})|-?\$?\d+(?:\.\d{2})/);
        const amount = summaryAmount ? Math.abs(parseMoney(summaryAmount[0])) : 0;
        transactions.push({
          localId: `txn-${page.pageNumber}-${index + 1}-${variantIndex + 1}`,
          postDate: new Date().toISOString().slice(0, 10),
          description: logicalLine.trim(),
          merchant: '',
          amount,
          type: 'credit',
          rowType: 'summary_total',
          section: activeSection,
          transactionFamily: 'other',
          isPostingCandidate: false,
          sourceLocator: {
            rowIndex: index,
            pageNumber: page.pageNumber,
            section: activeSection,
            sourceText: logicalLine
          }
        });
        return;
      }

      let workingLine = logicalLine;
      let match = workingLine.match(pattern);
      if (!match?.groups) {
        const isAmountOnly = amountOnlyPattern.test(workingLine);
        const isTimeOnly = timeOnlyPattern.test(workingLine);
        const hasDateToken = dateTokenPattern.test(workingLine);
        const hasAmountToken = /-?\$?\d{1,3}(?:,\d{3})*(?:\.\d{2})|-?\$?\d+(?:\.\d{2})/.test(workingLine);

        if (pendingSplitRow && isTimeOnly) {
          pendingSplitRow = {
            ...pendingSplitRow,
            sourceText: `${pendingSplitRow.sourceText} ${workingLine}`.trim()
          };
          return;
        }

        if (pendingSplitRow && isAmountOnly) {
          workingLine = `${pendingSplitRow.sourceText} ${workingLine}`.trim();
          match = workingLine.match(pattern);
          pendingSplitRow = null;
        } else if (hasDateToken && !hasAmountToken) {
          pendingSplitRow = {
            rowIndex: index,
            sourceText: workingLine
          };
          return;
        } else {
          pendingSplitRow = null;
          return;
        }
      }
      if (!match?.groups) return;

    const amountNumeric = parseMoney(match.groups.amount);
    if (!Number.isFinite(amountNumeric)) return;

      const checkMatch = workingLine.match(checkPattern);
    const checksClearedMatch =
      activeSection === 'checks_cleared'
        ? workingLine
            .replace(match.groups.date, '')
            .trim()
            .match(checksClearedNumberPattern)
        : null;
    const checkNumber = checkMatch
      ? String(checkMatch[1])
      : checksClearedMatch
        ? String(checksClearedMatch[1])
        : undefined;
      const description = workingLine.slice(0, 140);
    const merchant = description
      .replace(match.groups.date, '')
      .replace(match.groups.amount, '')
      .trim()
      .slice(0, 80);
    const explicitSignType = amountNumeric < 0 ? 'debit' : null;
      const hintedType = debitHintPattern.test(workingLine)
      ? 'debit'
      : creditHintPattern.test(workingLine)
        ? 'credit'
        : null;
    const txnType = explicitSignType ?? hintedType ?? 'debit';

      const lowerLine = workingLine.toLowerCase();
    const isBeginningBalance = lowerLine.includes('beginning balance');
    const isEndingBalance = lowerLine.includes('ending balance');
    // Statement summary / subtotal / count-style lines must NEVER be treated as
    // posting candidates. The SouthState-style summary box on page 1 contains
    // lines like "Checks Cleared 44 Subtotal $32,744.00" or
    // "CONSUMER LINE OF CREDIT 44 $32,744.00" — if those slip through they get
    // spawned as a "Check 44 / $32,744.00" candidate that is then duplicated
    // for every check on the statement.
    const isSummaryTotal =
      /item\(s\)\s+totaling/.test(lowerLine) ||
      /totaling\s+\$/.test(lowerLine) ||
      /\bsubtotal\b/.test(lowerLine) ||
      /\b(?:total|grand\s+total)\b\s*[:$]/.test(lowerLine) ||
      /\bchecks?\s+cleared\b/.test(lowerLine) ||
      /\bconsumer\s+line\s+of\s+credit\b/.test(lowerLine) ||
      /\baccount\s+summary\b/.test(lowerLine) ||
      /\bstatement\s+summary\b/.test(lowerLine);
    const isDailyBalanceBySection = activeSection === 'daily_balances';
    const likelyBalanceOnlyLine =
      !checkNumber &&
      merchant.length < 3 &&
      (balanceNoisePattern.test(workingLine) || statementEndingPattern.test(workingLine));
    const baseRowType = mapSectionToRowType(activeSection);
    const inferredUnknownRowType: ParsedTransaction['rowType'] = checkNumber
      ? 'check_cleared'
      : txnType === 'credit'
        ? 'other_credit'
        : 'electronic_debit';
    const rowType: ParsedTransaction['rowType'] = isBeginningBalance
      ? 'beginning_balance'
      : isEndingBalance
        ? 'ending_balance'
        : isSummaryTotal
          ? 'summary_total'
          : isDailyBalanceBySection || likelyBalanceOnlyLine
            ? 'daily_balance'
            : baseRowType === 'noise' && activeSection === 'unknown'
              ? inferredUnknownRowType
              : baseRowType;

    const sectionBasedType: ParsedTransaction['type'] =
      activeSection === 'electronic_debits' || activeSection === 'checks_cleared'
        ? 'debit'
        : activeSection === 'deposits' ||
            activeSection === 'electronic_credits' ||
            activeSection === 'other_credits'
          ? 'credit'
          : txnType;
    const isPostingCandidate = ['deposit', 'electronic_credit', 'other_credit', 'electronic_debit', 'check_cleared'].includes(rowType);
      const family = deriveTransactionFamily(workingLine, Boolean(checkNumber));
    if (rowType === 'noise' && !checkNumber) return;

    transactions.push({
      localId: `txn-${page.pageNumber}-${index + 1}-${variantIndex + 1}`,
      postDate: normalizeDate(match.groups.date),
      description,
      merchant,
      amount: Math.abs(amountNumeric),
      type: sectionBasedType,
      rowType,
      section: activeSection,
      transactionFamily: family,
      isPostingCandidate,
      checkNumber,
      sourceLocator: {
        rowIndex: index,
        pageNumber: page.pageNumber,
        section: activeSection,
        sourceText: workingLine
      }
    });
      pendingSplitRow = null;
    });
  });

  return transactions;
};

export const parseTransactionsFromOcrPages = (pages: StatementPageObservationWithRegions[]) => {
  const transactions: ParsedTransaction[] = [];

  for (const page of pages) {
    const pageTransactions = parseTransactionsFromPage(page);
    const pageIsChecksClearedTable = /checks\s+cleared/i.test(page.text ?? '');
    for (const txn of pageTransactions) {
      const isClearedTableRow =
        txn.rowType === 'check_cleared' || txn.section === 'checks_cleared';
      const skipTableRowBbox = isClearedTableRow && pageIsChecksClearedTable;
      if (!skipTableRowBbox) {
        const bestRegion = findBestRegionForTransaction(txn, page.checkRegions);
        if (bestRegion) {
          txn.sourceLocator.bbox = [
            bestRegion.bbox.left,
            bestRegion.bbox.top,
            bestRegion.bbox.right,
            bestRegion.bbox.bottom
          ];
        }
      }
      transactions.push(txn);
    }
  }

  return transactions.slice(0, 500);
};

const layoutSectionsForPage = (
  pageNumber: number,
  layoutSectionBounds?: StatementPageSectionBounds[]
) =>
  (layoutSectionBounds ?? [])
    .filter((bound) => bound.pageNumber === pageNumber)
    .map((bound) => ({
      section: bound.section,
      yStart: bound.yStart,
      yEnd: bound.yEnd,
      headerText: bound.headerText
    }));

const pickLayoutSectionForRow = (
  row: ParsedTransaction,
  layoutSectionBounds?: StatementPageSectionBounds[]
) => {
  if (!layoutSectionBounds || layoutSectionBounds.length === 0) return undefined;

  const availableSections = new Set(layoutSectionBounds.map((bound) => bound.section));
  const classifierSection = row.section;

  // Trust the classifier's section when the layout confirms that section exists anywhere
  // in the document. pdf-parse page indices do not always align with pdf.js-extract page
  // indices, so we do not require same-page containment.
  if (classifierSection && availableSections.has(classifierSection)) {
    return classifierSection;
  }

  if (row.rowType === 'check_cleared' && availableSections.has('checks_cleared')) {
    return 'checks_cleared';
  }

  return undefined;
};

export const buildTransactionSections = (
  transactions: ParsedTransaction[],
  layoutSectionBounds?: StatementPageSectionBounds[]
) => {
  const byPage = new Map<number, ParsedTransaction[]>();
  for (const txn of transactions) {
    const pageNumber = Number(txn.sourceLocator.pageNumber ?? 1);
    const pageTransactions = byPage.get(pageNumber) ?? [];
    pageTransactions.push(txn);
    byPage.set(pageNumber, pageTransactions);
  }

  // Include pages that have layout-derived section bounds so coordinate-derived structure
  // is surfaced even when the text parser didn't emit any rows for that page.
  for (const bound of layoutSectionBounds ?? []) {
    if (!byPage.has(bound.pageNumber)) {
      byPage.set(bound.pageNumber, []);
    }
  }

  return Array.from(byPage.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([pageNumber, pageTransactions]) => ({
      pageNumber,
      transactionCount: pageTransactions.length,
      firstRowIndex: pageTransactions.length
        ? Math.min(...pageTransactions.map((txn) => Number(txn.sourceLocator.rowIndex ?? 0)))
        : null,
      lastRowIndex: pageTransactions.length
        ? Math.max(...pageTransactions.map((txn) => Number(txn.sourceLocator.rowIndex ?? 0)))
        : null,
      layoutSections: layoutSectionsForPage(pageNumber, layoutSectionBounds)
    }));
};

export const buildChecksClearedRows = (
  transactions: ParsedTransaction[],
  layoutSectionBounds?: StatementPageSectionBounds[],
  layoutChecks?: ExtractedCheckRow[]
) => {
  const anchored = transactions.filter((txn) => {
    if (txn.rowType !== 'check_cleared') return false;
    const hasCheckNumber = typeof txn.checkNumber === 'string' && txn.checkNumber.trim().length > 0;
    if (hasCheckNumber) return true;
    return pickLayoutSectionForRow(txn, layoutSectionBounds) === 'checks_cleared';
  });

  // Build an amount+date lookup from the coordinate table so we can fill in check
  // numbers that the text pass missed. Multiple rows can share amount+date, so we
  // hand out entries on a first-come-first-served basis per key.
  const layoutLookup = new Map<string, ExtractedCheckRow[]>();
  for (const row of layoutChecks ?? []) {
    const key = `${row.date ?? ''}:${row.amount.toFixed(2)}`;
    const bucket = layoutLookup.get(key) ?? [];
    bucket.push(row);
    layoutLookup.set(key, bucket);
  }

  const consumeLayoutMatch = (txn: ParsedTransaction) => {
    const key = `${txn.postDate ?? ''}:${Number(txn.amount ?? 0).toFixed(2)}`;
    const bucket = layoutLookup.get(key);
    if (!bucket || bucket.length === 0) return null;
    return bucket.shift() ?? null;
  };

  if (anchored.length > 0) {
    return anchored.map((txn) => {
      const layoutMatch = (typeof txn.checkNumber === 'string' && txn.checkNumber.trim().length > 0)
        ? null
        : consumeLayoutMatch(txn);
      const resolvedCheckNumber =
        (typeof txn.checkNumber === 'string' && txn.checkNumber.trim().length > 0
          ? txn.checkNumber
          : layoutMatch?.checkNumber) ?? null;
      return {
        localId: txn.localId,
        pageNumber: layoutMatch?.pageNumber ?? txn.sourceLocator.pageNumber ?? null,
        postDate: txn.postDate,
        checkNumber: resolvedCheckNumber,
        description: txn.description,
        merchant: txn.merchant,
        amount: txn.amount,
        type: txn.type,
        bbox: txn.sourceLocator.bbox ?? undefined,
        layoutSection: pickLayoutSectionForRow(txn, layoutSectionBounds) ?? null,
        checkNumberSource: resolvedCheckNumber
          ? (typeof txn.checkNumber === 'string' && txn.checkNumber.trim().length > 0
              ? 'text_parser'
              : 'pdf_layout')
          : 'missing'
      };
    });
  }

  if ((layoutChecks ?? []).length > 0) {
    return (layoutChecks ?? []).map((row) => ({
      localId: `layout-check-${row.checkNumber}`,
      pageNumber: row.pageNumber,
      postDate: row.date,
      checkNumber: row.checkNumber,
      description: `Check ${row.checkNumber}`,
      merchant: `Check ${row.checkNumber}`,
      amount: row.amount,
      type: 'debit' as const,
      bbox: undefined,
      layoutSection: 'checks_cleared',
      checkNumberSource: 'pdf_layout'
    }));
  }

  return [];
};

export const buildExtractionIssues = (transactions: ParsedTransaction[]) => {
  const issues: string[] = [];
  const malformedRows = transactions.filter((txn) => !txn.postDate || !Number.isFinite(Number(txn.amount)));
  if (malformedRows.length > 0) {
    issues.push(`${malformedRows.length} malformed extracted row(s) skipped or marked noise.`);
  }
  return issues;
};

const saveExtractedChecksArtifact = async (args: {
  bucketName: string;
  companyId: string;
  statementId: string;
  rootPrefix: string;
}) => {
  const extractedChecksPath = buildStatementExtractedChecksPath(args.rootPrefix);
  const checks = await StatementCheckModel.find({
    companyId: args.companyId,
    statementId: args.statementId
  })
    .sort({ createdAt: 1 })
    .lean();

  await saveJsonWithRateLimitBackoff(
    args.bucketName,
    extractedChecksPath,
    checks.map((check) => ({
      id: String(check._id),
      status: check.status,
      pageNumber: check.artifacts?.pageNumber ?? undefined,
      cropBBox: Array.isArray(check.artifacts?.cropBBox) ? check.artifacts.cropBBox : undefined,
      cropImagePath: check.artifacts?.cropImagePath ?? undefined,
      ocrTextPath: check.artifacts?.ocrTextPath ?? undefined,
      ocrJsonPath: check.artifacts?.ocrJsonPath ?? check.gcs?.ocrPath ?? undefined,
      structuredPath: check.artifacts?.structuredPath ?? check.gcs?.structuredPath ?? undefined,
      geminiPath: check.artifacts?.geminiPath ?? undefined,
      extracted: check.extracted ?? undefined,
      autoFill: check.autoFill ?? undefined,
      confidence: check.confidence ?? undefined,
      match: check.match ?? undefined,
      processing: check.processing ?? undefined
    }))
  );

  return extractedChecksPath;
};

const EXTRACTED_CHECKS_FINALIZATION_LEASE_MS = 90_000;

const tryClaimExtractedChecksFinalization = async (companyId: string, statementId: string) => {
  const now = new Date();
  const leaseCutoff = new Date(now.getTime() - EXTRACTED_CHECKS_FINALIZATION_LEASE_MS).toISOString();
  const nowValue = now.toISOString();

  const claimed = await BankStatement.findOneAndUpdate(
    {
      _id: statementId,
      companyId,
      $and: [
        {
          $or: [
            { 'artifacts.extractedChecksFinalizedAt': { $exists: false } },
            { 'artifacts.extractedChecksFinalizedAt': null }
          ]
        },
        {
          $or: [
            { 'artifacts.extractedChecksFinalizingAt': { $exists: false } },
            { 'artifacts.extractedChecksFinalizingAt': null },
            { 'artifacts.extractedChecksFinalizingAt': { $lt: leaseCutoff } }
          ]
        }
      ]
    },
    {
      $set: { 'artifacts.extractedChecksFinalizingAt': nowValue }
    },
    {
      new: true
    }
  ).lean();

  return claimed;
};

const markExtractedChecksFinalized = async (
  companyId: string,
  statementId: string,
  extractedChecksPath: string
) => {
  await BankStatement.updateOne(
    { _id: statementId, companyId },
    {
      $set: {
        'artifacts.extractedChecksPath': extractedChecksPath,
        'artifacts.extractedChecksFinalizedAt': nowIso()
      },
      $unset: {
        'artifacts.extractedChecksFinalizingAt': 1
      }
    }
  );
};

const releaseExtractedChecksFinalizationClaim = async (companyId: string, statementId: string) => {
  await BankStatement.updateOne(
    { _id: statementId, companyId },
    {
      $unset: {
        'artifacts.extractedChecksFinalizingAt': 1
      }
    }
  );
};

const detectStatementMonthEvidence = (pages: StatementPageObservation[]) => {
  const evidence: Array<{
    pageNumber: number;
    date: string;
    month: string;
    snippet: string;
  }> = [];

  for (const page of pages) {
    const lines = page.text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    for (const line of lines) {
      const match = line.match(/\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|20\d{2}-\d{2}-\d{2})\b/);
      if (!match?.[0]) continue;
      const detected = normalizeDate(match[0]);
      if (!detected) continue;
      evidence.push({
        pageNumber: page.pageNumber,
        date: detected,
        month: detected.slice(0, 7),
        snippet: line.slice(0, 240)
      });
    }
  }

  const first = evidence[0];
  return {
    detectedStatementDate: first?.date,
    detectedStatementMonth: first?.month,
    evidence
  };
};

const readStatementOcrPages = async (bucketName: string, ocrPath: string) => {
  const raw = await downloadFileAsText(bucketName, ocrPath);
  const payload = JSON.parse(raw) as {
    pages?: StatementPageObservationWithRegions[];
    combinedText?: string;
  };

  const pages = Array.isArray(payload.pages) ? payload.pages : [];
  if (pages.length === 0) {
    return { pages: [] as StatementPageObservation[], combinedText: payload.combinedText ?? '' };
  }

  return {
    pages: pages.map((page) => ({
      ...page,
      pageNumber: Number(page.pageNumber),
      checkRegions: Array.isArray(page.checkRegions) ? page.checkRegions : []
    })),
    combinedText: payload.combinedText ?? pages.map((page) => page.text).join('\n\n')
  };
};

const loadStatementPageTextFromStoredOcr = async (
  bucketName: string,
  ocrPath: string,
  pageNumber: number
) => {
  const { pages } = await readStatementOcrPages(bucketName, ocrPath);
  const match = pages.find((page) => Number(page.pageNumber) === Number(pageNumber));
  return String(match?.text ?? '');
};

const extractedChecksFinalizedStatements = new Set<string>();

const updateStatementProgressFromChecks = async (companyId: string, statementId: string) => {
  const [queued, processing, ready, needsReview, failed, total] = await Promise.all([
    StatementCheckModel.countDocuments({ companyId, statementId, status: 'queued' }),
    StatementCheckModel.countDocuments({ companyId, statementId, status: 'processing' }),
    StatementCheckModel.countDocuments({ companyId, statementId, status: 'ready' }),
    StatementCheckModel.countDocuments({ companyId, statementId, status: 'needs_review' }),
    StatementCheckModel.countDocuments({ companyId, statementId, status: 'failed' }),
    StatementCheckModel.countDocuments({ companyId, statementId })
  ]);

  const statement = await BankStatement.findOne({ _id: statementId, companyId });
  if (!statement) return;

  const currentStatus = String(statement.status ?? '');
  const nextStatus =
    total > 0 && queued === 0 && processing === 0
      ? 'ready_for_review'
      : total === 0 && currentStatus === 'checks_queued'
        ? 'ready_for_review'
        : currentStatus;

  const progress = buildStatementProgress(nextStatus, {
    totalChecks: total,
    checksQueued: queued,
    checksProcessing: processing,
    checksReady: ready + needsReview,
    checksFailed: failed
  });

  const artifactsPatch: Record<string, unknown> = {};
  if (nextStatus !== currentStatus) {
    const timestampKey = statementStageTimestampKeys[nextStatus as keyof typeof statementStageTimestampKeys];
    if (timestampKey) {
      artifactsPatch.stageTimestamps = {
        [timestampKey]: nowIso()
      };
    }
  } else if (nextStatus === 'ready_for_review') {
    artifactsPatch.stageTimestamps = {
      readyForReviewAt: statement.artifacts?.stageTimestamps?.readyForReviewAt ?? nowIso()
    };
  }

  await persistStatementPatch(companyId, statementId, {
    status: nextStatus,
    progress,
    artifacts: Object.keys(artifactsPatch).length > 0 ? artifactsPatch : undefined
  });

  const statementForFinalization = await BankStatement.findOne({ _id: statementId, companyId });

  // Finalize the consolidated extracted-checks artifact EXACTLY ONCE per
  // statement run, once all checks have reached a terminal state. Writing it
  // from every check.process caused GCS 429 rate-limit errors on the same
  // object (see https://cloud.google.com/storage/docs/gcs429).
  const allChecksTerminal = total > 0 && queued === 0 && processing === 0;
  const finalizationKey = String(statementId);
  if (allChecksTerminal && !extractedChecksFinalizedStatements.has(finalizationKey)) {
    extractedChecksFinalizedStatements.add(finalizationKey);
    try {
      const bucketName = env.gcsBucketName;
      const rootPrefix = String(statementForFinalization?.gcs?.rootPrefix ?? '');
      if (bucketName && rootPrefix) {
        const claimedStatement = await tryClaimExtractedChecksFinalization(companyId, statementId);
        if (!claimedStatement) {
          extractedChecksFinalizedStatements.delete(finalizationKey);
          return;
        }
        const extractedChecksPath = await saveExtractedChecksArtifact({
          bucketName,
          companyId,
          statementId,
          rootPrefix
        });
        await markExtractedChecksFinalized(companyId, statementId, extractedChecksPath);
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('[checks] failed to finalize extracted-checks artifact', {
        statementId,
        companyId,
        error: error instanceof Error ? error.message : String(error)
      });
      await releaseExtractedChecksFinalizationClaim(companyId, statementId);
      // Allow a retry on the next progress tick if the write failed.
      extractedChecksFinalizedStatements.delete(finalizationKey);
    }
  } else if (!allChecksTerminal) {
    // Clear the finalized flag so a fresh run (e.g. Reprocess) can write
    // again when it reaches terminal.
    extractedChecksFinalizedStatements.delete(finalizationKey);
  }
};

const createRun = async (payload: AccountingTaskPayload) => {
  const runType = syncJobTypes.includes(payload.jobType) ? 'sync' : 'pipeline';
  const run = await RunModel.create({
    companyId: payload.companyId,
    statementId: payload.statementId,
    runType,
    job: payload.jobType,
    status: 'running',
    traceId: String(payload.meta.traceId ?? payload.meta.taskId ?? ''),
    errors: []
  });
  return run;
};

const completeRun = async (
  runId: string,
  status: 'success' | 'failed',
  details?: {
    errors?: string[];
    artifacts?: Record<string, string>;
    metrics?: Record<string, unknown>;
  }
) => {
  await RunModel.updateOne(
    { _id: runId },
    {
      $set: {
        status,
        errors: details?.errors ?? [],
        artifacts: details?.artifacts,
        metrics: details?.metrics
      }
    }
  );
};

const runTaskLogic = async (payload: AccountingTaskPayload) => {
  const bucketName = ensureGcsConfigured();
  const statement = payload.statementId
    ? await BankStatement.findOne({
      _id: payload.statementId,
      companyId: payload.companyId
    })
    : null;

  const artifacts: Record<string, string> = {};

  switch (payload.jobType) {
    case 'statement.extract': {
      if (!statement || !payload.statementId) {
        throw new Error('statement.extract requires a valid statementId');
      }
      const rootPrefix = String(statement.gcs?.rootPrefix ?? '');
      const pdfPath = String(statement.gcs?.pdfPath ?? '');
      if (!rootPrefix || !pdfPath) {
        throw new Error('Statement is missing gcs.rootPrefix or gcs.pdfPath');
      }
      const logCtx = {
        statementId: payload.statementId,
        companyId: payload.companyId
      };
      const DOWNLOAD_TIMEOUT_MS = 60_000;
      const RENDER_TIMEOUT_MS = 180_000;
      const PDF_PARSE_TIMEOUT_MS = 60_000;
      const GCS_WRITE_TIMEOUT_MS = 45_000;

      updateStatementStage(statement, 'extracting', {
        stageTimestamps: {
          extractingAt: nowIso()
        }
      });
      updateStatementProgress(statement, 'extracting', statement.progress);
      await persistStatementPatch(payload.companyId, payload.statementId, {
        status: statement.status,
        progress: statement.progress,
        artifacts: statement.artifacts
      });
      logStage('start', { ...logCtx, pdfPath, rootPrefix });

      logStage('downloading pdf', { ...logCtx, pdfPath });
      const pdfBuffer = await withTimeout(
        downloadFileBuffer(bucketName, pdfPath),
        DOWNLOAD_TIMEOUT_MS,
        'Downloading statement PDF'
      );
      logStage('downloaded pdf', { ...logCtx, bytes: pdfBuffer.byteLength });

      logStage('rendering pages', logCtx);
      const rendered = await withTimeout(
        renderAndPersistStatementPages({
          bucketName,
          rootPrefix,
          pdfBuffer
        }),
        RENDER_TIMEOUT_MS,
        'Rendering and persisting statement PDF pages'
      );
      logStage('rendered pages', { ...logCtx, pageCount: rendered.pageCount });

      logStage('parsing pdf text', logCtx);
      const ocrPages = await withTimeout(
        extractStatementPagesFromPdfBuffer(pdfBuffer),
        PDF_PARSE_TIMEOUT_MS,
        'Parsing statement PDF text'
      );
      logStage('parsed pdf text', { ...logCtx, pageCount: ocrPages.length });

      const combinedText = ocrPages.map((page) => page.text).filter(Boolean).join('\n\n');
      const detection = detectStatementMonthEvidence(ocrPages);

      const ocrJsonPath = buildOcrPath(rootPrefix, 'docai.json');
      const ocrTextPath = buildStatementOcrTextPath(rootPrefix, 'text.txt');
      logStage('saving ocr artifacts', { ...logCtx, ocrJsonPath, ocrTextPath });
      await withTimeout(
        saveJson(bucketName, ocrJsonPath, {
          provider: 'pdf_text',
          extractedAt: nowIso(),
          pages: ocrPages,
          combinedText,
          detection: {
            ...detection,
            evidence: JSON.stringify(detection.evidence)
          }
        }),
        GCS_WRITE_TIMEOUT_MS,
        'Saving OCR JSON artifact'
      );
      await withTimeout(
        saveText(bucketName, ocrTextPath, combinedText),
        GCS_WRITE_TIMEOUT_MS,
        'Saving OCR text artifact'
      );
      logStage('saved ocr artifacts', logCtx);

      mergeStatementArtifacts(statement, {
        pageImagePaths: rendered.pageImagePaths,
        ocrPath: ocrJsonPath,
        ocrTextPath,
        detectedStatementDate: detection.detectedStatementDate,
        detectedStatementMonth: detection.detectedStatementMonth,
        autoAppliedStatementMonth: Boolean(detection.detectedStatementMonth),
        detectionEvidence: JSON.stringify(detection.evidence),
        stageTimestamps: {
          extractingAt: statement.artifacts?.stageTimestamps?.extractingAt ?? nowIso(),
          structuringAt: nowIso()
        }
      });
      updateStatementProgress(statement, 'structuring', statement.progress);
      statement.status = 'structuring' as any;
      await persistStatementPatch(payload.companyId, payload.statementId, {
        status: statement.status,
        progress: statement.progress,
        artifacts: statement.artifacts
      });
      logStage('completed, advancing to structuring', logCtx);

      artifacts.statementPageImages = rendered.pageImagePaths.join(',');
      artifacts.statementOcr = ocrJsonPath;
      artifacts.statementOcrText = ocrTextPath;
      return { artifacts };
    }
    case 'statement.structure': {
      if (!statement || !payload.statementId) {
        throw new Error('statement.structure requires a valid statementId');
      }
      const rootPrefix = String(statement.gcs?.rootPrefix ?? '');
      const pdfPath = String(statement.gcs?.pdfPath ?? '');
      if (!rootPrefix || !pdfPath) {
        throw new Error('Statement is missing gcs.rootPrefix or gcs.pdfPath');
      }
      updateStatementStage(statement, 'structuring', {
        stageTimestamps: {
          structuringAt: nowIso()
        }
      });
      updateStatementProgress(statement, 'structuring', statement.progress);
      await persistStatementPatch(payload.companyId, payload.statementId, {
        status: statement.status,
        progress: statement.progress,
        artifacts: statement.artifacts
      });

      const ocrPath = String(statement.artifacts?.ocrPath ?? buildOcrPath(rootPrefix, 'docai.json'));
      const ocrTextPath = String(
        statement.artifacts?.ocrTextPath ?? buildStatementOcrTextPath(rootPrefix, 'text.txt')
      );
      const { pages: ocrPages, combinedText } = await readStatementOcrPages(bucketName, ocrPath);
      const parsed = parseTransactionsFromOcrPages(ocrPages);

      let pdfLayoutPages: Awaited<ReturnType<typeof extractStatementPagesLayoutFromPdfBuffer>> = [];
      let pdfLayoutSectionBounds: StatementPageSectionBounds[] = [];
      let pdfLayoutChecks: ExtractedCheckRow[] = [];
      let pdfLayoutDailyBalances: ExtractedDailyBalance[] = [];
      let offlineExtraction: Awaited<ReturnType<typeof extractOfflineStatement>> | null = null;
      const offlineExtractionPath = buildStatementJsonPath(rootPrefix, 'tables/offline-extraction.v1.json');
      try {
        const pdfBuffer = await downloadFileBuffer(bucketName, pdfPath);
        pdfLayoutPages = await extractStatementPagesLayoutFromPdfBuffer(pdfBuffer);
        pdfLayoutSectionBounds = deriveSectionBoundsFromLayout(pdfLayoutPages);
        pdfLayoutChecks = extractChecksClearedFromLayout(pdfLayoutPages, pdfLayoutSectionBounds);
        pdfLayoutDailyBalances = extractDailyBalancesFromLayout(pdfLayoutPages, pdfLayoutSectionBounds);
        offlineExtraction = await extractOfflineStatement({
          pdfBuffer,
          layoutChecks: pdfLayoutChecks,
          persistCrop: async ({ checkNumber, imageBuffer, reviewBuffer }) => {
            const checkKey = `caption-${String(checkNumber).padStart(4, '0')}`;
            const imageCropPath = buildCheckCropPath(rootPrefix, checkKey, 'tight.png');
            const reviewCropPath = buildCheckCropPath(rootPrefix, checkKey, 'front.png');
            await Promise.all([
              saveBuffer(bucketName, imageCropPath, imageBuffer, 'image/png'),
              saveBuffer(bucketName, reviewCropPath, reviewBuffer, 'image/png')
            ]);
            return { imageCropPath, reviewCropPath };
          }
        });
      } catch (error) {
        console.warn('[accountingTaskRunner] pdf layout extraction failed', {
          statementId: payload.statementId,
          error: (error as Error).message
        });
      }

      if (pdfLayoutSectionBounds.length > 0) {
        applyLayoutSectionsToParsedTransactions(parsed, pdfLayoutPages, pdfLayoutSectionBounds);
      }

      const transactionSections = buildTransactionSections(parsed, pdfLayoutSectionBounds);
      const checksClearedRows = buildChecksClearedRows(parsed, pdfLayoutSectionBounds, pdfLayoutChecks);
      const extractionIssues = buildExtractionIssues(parsed);
      const parserVersion = 'statement-parser.v2';
      const validationReport = buildStatementValidationReport({
        statementId: payload.statementId,
        rows: parsed as any,
        profile: 'reconciliation_only'
      });
      const evidenceRows = buildStatementEvidenceRows({
        statementId: payload.statementId,
        sourceDocumentId: String(statement.gcs?.pdfPath ?? ''),
        parserVersion,
        rows: parsed as any
      });
      if (!validationReport.passed) {
        extractionIssues.push(
          ...validationReport.mismatches.map((mismatch) => {
            if (mismatch.code === 'balance_reconciliation_drift') {
              return `Balance reconciliation drift detected (${Number(mismatch.actual ?? 0).toFixed(2)}).`;
            }
            return `[validation] ${mismatch.message} (expected ${mismatch.expected}, actual ${mismatch.actual})`;
          })
        );
      }
      const statementMonth = String(
        statement.statementMonth ?? statement.artifacts?.detectedStatementMonth ?? ''
      );

      const normalizedPath = buildGeminiPath(rootPrefix, 'normalized.v1.json');
      const transactionsTablePath = buildStatementTransactionsTablePath(rootPrefix);
      const checksClearedTablePath = buildStatementChecksClearedTablePath(rootPrefix);
      const transactionSectionsPath = buildStatementTransactionSectionsPath(rootPrefix);
      const classificationOutputPath = buildStatementClassificationOutputPath(rootPrefix);
      const suggestionsOutputPath = buildStatementSuggestionsOutputPath(rootPrefix);
      const processingSummaryPath = buildStatementProcessingSummaryPath(rootPrefix);
      const structuredStatementPath = buildStatementStructuredModelPath(rootPrefix);
      const evidencePath = buildStatementEvidencePath(rootPrefix);
      const validationReportPath = buildStatementValidationReportPath(rootPrefix);
      const pdfLayoutPath = buildStatementPdfLayoutPath(rootPrefix);
      await saveJson(bucketName, normalizedPath, {
        schemaVersion: 'v1',
        statementId: payload.statementId,
        statementMonth: statementMonth || undefined,
        combinedText,
        detectionEvidence: statement.artifacts?.detectionEvidence ?? [],
        transactionCount: parsed.length,
        transactions: parsed
      });
      await Promise.all([
        saveJson(bucketName, transactionsTablePath, parsed),
        saveJson(bucketName, checksClearedTablePath, checksClearedRows),
        saveJson(bucketName, transactionSectionsPath, transactionSections),
        saveJson(bucketName, structuredStatementPath, {
          schemaVersion: 'v1',
          parserVersion,
          statementId: payload.statementId,
          sourceDocumentId: String(statement.gcs?.pdfPath ?? ''),
          sections: transactionSections,
          transactions: parsed
        }),
        saveJson(bucketName, evidencePath, evidenceRows),
        saveJson(bucketName, validationReportPath, validationReport),
        saveJson(bucketName, pdfLayoutPath, {
          schemaVersion: 'v1',
          statementId: payload.statementId,
          pages: pdfLayoutPages,
          sectionBounds: pdfLayoutSectionBounds,
          coordinateTables: {
            checksCleared: pdfLayoutChecks,
            dailyBalances: pdfLayoutDailyBalances
          }
        }),
        offlineExtraction
          ? saveJson(bucketName, offlineExtractionPath, {
              schemaVersion: 'v1',
              statementId: payload.statementId,
              extraction: offlineExtraction
            })
          : Promise.resolve()
      ]);

      await Promise.all([
        StatementTransactionModel.deleteMany({
          companyId: payload.companyId,
          statementId: payload.statementId
        }),
        LedgerEntryModel.deleteMany({
          companyId: payload.companyId,
          statementId: payload.statementId
        })
      ]);

      const pageImagePaths = Array.isArray(statement.artifacts?.pageImagePaths)
        ? statement.artifacts.pageImagePaths.map((value: unknown) => String(value))
        : [];
      const classificationRows: Array<Record<string, unknown>> = [];
      const suggestionRows: Array<Record<string, unknown>> = [];

      for (const txn of parsed) {
        const proposal = await buildMatchingProposal({
          companyId: payload.companyId,
          description: txn.description,
          merchant: txn.merchant,
          amount: txn.amount,
          type: txn.type,
          check: txn.checkNumber
            ? {
                payeeName: txn.merchant ?? txn.description,
                amount: txn.amount,
                extracted: {
                  checkNumber: txn.checkNumber,
                  date: txn.postDate,
                  payeeName: txn.merchant ?? txn.description,
                  amount: txn.amount,
                  memo: txn.description
                }
              }
            : undefined
        });

        const { suggestionPath } = await persistInternalMatchingSuggestion({
          bucketName,
          rootPrefix,
          proposal,
          key: buildStatementTransactionGeminiKey(txn)
        });

        const pageImagePath = resolveStatementPageImagePath(
          statement,
          rootPrefix,
          txn.sourceLocator.pageNumber
        );
        const derived = classifyStatementTransaction(txn);
        classificationRows.push({
          localId: txn.localId,
          classification: derived.classification,
          confidence: derived.confidence,
          suggestedAction: derived.suggestedAction
        });
        suggestionRows.push({
          localId: txn.localId,
          type: proposal.qbTxnType ?? null,
          confidence: proposal.confidence ?? 0,
          reasons: proposal.reasons ?? [],
          path: suggestionPath
        });

        const createdTxn = await StatementTransactionModel.create({
          statementId: payload.statementId,
          companyId: payload.companyId,
          postDate: txn.postDate,
          description: txn.description,
          merchant: txn.merchant,
          amount: txn.amount,
          type: txn.type,
          rowType: txn.rowType,
          section: txn.section,
          transactionFamily: txn.transactionFamily,
          isPostingCandidate: txn.isPostingCandidate,
          normalizedDescription: normalizeText(txn.description),
          counterparty: txn.merchant || undefined,
          classification: derived.classification,
          classificationConfidence: derived.confidence,
          suggestedAction: derived.suggestedAction,
          checkNumber: txn.checkNumber,
          statementCheckId: undefined,
          sourceLocator: txn.sourceLocator,
          evidence: {
            statementPdfPath: pdfPath,
            pageImagePath,
            ocrPath,
            geminiPath: suggestionPath
          },
          proposal: {
            ...proposal,
            status: 'proposed'
          },
          reviewStatus: 'proposed',
          posting: {
            status: 'not_posted'
          }
        });

        await LedgerEntryModel.create({
          companyId: payload.companyId,
          sourceType: 'statement',
          statementId: payload.statementId,
          statementTransactionId: createdTxn._id.toString(),
          date: txn.postDate,
          description: txn.description,
          merchant: txn.merchant,
          amount: txn.amount,
          type: txn.type,
          attachments: {
            statementPdfPath: pdfPath,
            statementPageImagePath: pageImagePath,
            geminiPath: suggestionPath
          },
          confidence: {
            overall: proposal.confidence,
            crossValidation: proposal.confidence
          },
          proposal: {
            ...proposal,
            status: 'proposed'
          },
          reviewStatus: 'proposed',
          posting: {
            status: 'not_posted'
          }
        });
      }

      mergeStatementArtifacts(statement, {
        pageImagePaths: pageImagePaths.length > 0 ? pageImagePaths : statement.artifacts?.pageImagePaths ?? [],
        ocrPath,
        ocrTextPath,
        transactionsTablePath,
        checksClearedTablePath,
        transactionSectionsPath,
        classificationOutputPath,
        suggestionsOutputPath,
        processingSummaryPath,
        structuredStatementPath,
        offlineExtractionPath: offlineExtraction ? offlineExtractionPath : statement.artifacts?.offlineExtractionPath ?? undefined,
        evidencePath,
        validationReportPath,
        pdfLayoutPath,
        geminiPath: normalizedPath,
        stageTimestamps: {
          structuringAt: statement.artifacts?.stageTimestamps?.structuringAt ?? nowIso(),
          parserReviewAt: validationReport.passed ? undefined : nowIso()
        }
      });
      const nextPhase = validationReport.passed ? 'checks_queued' : 'needs_parser_review';
      updateStatementProgress(statement, nextPhase, {
        totalChecks: 0,
        checksQueued: 0,
        checksProcessing: 0,
        checksReady: 0,
        checksFailed: 0
      });
      statement.status = nextPhase as any;
      (statement as any).validationReport = validationReport;
      statement.issues = extractionIssues.length > 0 ? extractionIssues : [];
      await persistStatementPatch(payload.companyId, payload.statementId, {
        status: statement.status,
        progress: statement.progress,
        issues: statement.issues,
        artifacts: statement.artifacts
      });

      artifacts.normalized = normalizedPath;
      artifacts.transactionsTable = transactionsTablePath;
      artifacts.checksClearedTable = checksClearedTablePath;
      artifacts.transactionSections = transactionSectionsPath;
      artifacts.classificationOutput = classificationOutputPath;
      artifacts.suggestionsOutput = suggestionsOutputPath;
      artifacts.processingSummary = processingSummaryPath;
      artifacts.structuredStatement = structuredStatementPath;
      artifacts.evidence = evidencePath;
      artifacts.validationReport = validationReportPath;
      artifacts.statementOcrText = ocrTextPath;

      await Promise.all([
        saveJson(bucketName, classificationOutputPath, classificationRows),
        saveJson(bucketName, suggestionsOutputPath, suggestionRows),
        saveJson(bucketName, processingSummaryPath, {
          statementId: payload.statementId,
          stage: 'statement_generate_suggestions',
          extractedRows: parsed.length,
          postingCandidates: parsed.filter((row) => row.isPostingCandidate).length,
          checksDetected: checksClearedRows.length,
          validationPassed: validationReport.passed,
          validationMismatchCount: validationReport.mismatches.length,
          extractionIssues,
          generatedSuggestions: suggestionRows.length,
          generatedAt: nowIso()
        })
      ]);
      return { artifacts };
    }
    case 'checks.spawn': {
      if (!statement || !payload.statementId) {
        throw new Error('checks.spawn requires a valid statementId');
      }
      const freshStatement = await BankStatement.findOne({
        _id: payload.statementId,
        companyId: payload.companyId
      });
      if (!freshStatement) {
        throw new Error('Statement not found for checks.spawn');
      }
      const rootPrefix = String(freshStatement.gcs?.rootPrefix ?? '');
      if (!rootPrefix) {
        throw new Error('Statement is missing gcs.rootPrefix');
      }

      await StatementCheckModel.deleteMany({
        companyId: payload.companyId,
        statementId: payload.statementId
      });

      // Source of truth for "what checks cleared on this statement" is the
      // `checks-cleared.json` table the extract step builds. That table is
      // produced by `buildChecksClearedRows()` from layout-anchored rows
      // (each carries a unique check number, date, amount, and bbox), so it
      // is already free of the noisy summary/subtotal rows that pollute
      // StatementTransactionModel. Reading it directly avoids re-doing the
      // candidate filtering we used to do against StatementTransactionModel.
      const checksClearedTablePath = String(freshStatement.artifacts?.checksClearedTablePath ?? '');
      type ClearedCheckRow = {
        localId?: string;
        pageNumber?: number | null;
        postDate?: string | null;
        checkNumber?: string | null;
        description?: string | null;
        merchant?: string | null;
        amount?: number | null;
        type?: 'debit' | 'credit' | null;
        bbox?: number[] | null;
        layoutSection?: string | null;
        checkNumberSource?: string | null;
      };
      let clearedRows: ClearedCheckRow[] = [];
      if (checksClearedTablePath) {
        try {
          const rawJson = await downloadFileBuffer(bucketName, checksClearedTablePath);
          const parsedJson = JSON.parse(rawJson.toString('utf-8')) as unknown;
          if (Array.isArray(parsedJson)) {
            clearedRows = parsedJson as ClearedCheckRow[];
          }
        } catch (loadError) {
          // eslint-disable-next-line no-console
          console.warn('[checks.spawn] failed to load checks-cleared table; falling back to StatementTransaction', {
            statementId: payload.statementId,
            checksClearedTablePath,
            error: loadError instanceof Error ? loadError.message : String(loadError)
          });
        }
      }

      if (clearedRows.length === 0) {
        const pdfLayoutPath = String(freshStatement.artifacts?.pdfLayoutPath ?? buildStatementPdfLayoutPath(rootPrefix));
        try {
          const rawLayout = await downloadFileBuffer(bucketName, pdfLayoutPath);
          const parsedLayout = JSON.parse(rawLayout.toString('utf-8')) as {
            coordinateTables?: { checksCleared?: ExtractedCheckRow[] };
          };
          const layoutChecks = parsedLayout?.coordinateTables?.checksCleared ?? [];
          if (layoutChecks.length > 0) {
            clearedRows = layoutChecks.map((row) => ({
              localId: `layout-check-${row.checkNumber}`,
              pageNumber: row.pageNumber,
              postDate: row.date,
              checkNumber: row.checkNumber,
              amount: row.amount,
              type: 'debit' as const,
              layoutSection: 'checks_cleared',
              checkNumberSource: 'pdf_layout'
            }));
            // eslint-disable-next-line no-console
            console.info('[checks.spawn] loaded cleared checks from pdf layout artifact', {
              statementId: payload.statementId,
              count: clearedRows.length,
              pdfLayoutPath
            });
          }
        } catch (layoutLoadError) {
          // eslint-disable-next-line no-console
          console.warn('[checks.spawn] failed to load cleared checks from pdf layout artifact', {
            statementId: payload.statementId,
            pdfLayoutPath,
            error: layoutLoadError instanceof Error ? layoutLoadError.message : String(layoutLoadError)
          });
        }
      }

      // Build a (postDate, amount, checkNumber) → StatementTransaction _id
      // lookup so we can backfill match.statementTransactionId on each
      // spawned check without re-filtering the noisy transactions list.
      const transactionsForLookup = await StatementTransactionModel.find({
        companyId: payload.companyId,
        statementId: payload.statementId,
        rowType: 'check_cleared'
      })
        .select('_id postDate amount checkNumber sourceLocator')
        .lean();
      const txnLookup = new Map<string, typeof transactionsForLookup[number]>();
      for (const txn of transactionsForLookup) {
        const key = `${(txn.checkNumber ?? '').toString().trim()}::${Number(txn.amount ?? 0).toFixed(2)}::${txn.postDate ?? ''}`;
        if (!txnLookup.has(key)) txnLookup.set(key, txn);
      }

      // Final candidate set comes straight from the cleared-checks table,
      // deduped by (checkNumber, amount, postDate) as a final safety belt.
      const candidateKeySeen = new Set<string>();
      const candidates = clearedRows
        .filter((row) => {
          const checkNumber = (row.checkNumber ?? '').toString().trim();
          const amount = Number(row.amount ?? 0);
          const postDate = (row.postDate ?? '').toString();
          if (!checkNumber && !Number.isFinite(amount)) return false;
          const key = `${checkNumber}::${amount.toFixed(2)}::${postDate}`;
          if (candidateKeySeen.has(key)) return false;
          candidateKeySeen.add(key);
          return true;
        })
        .map((row) => {
          const checkNumber = (row.checkNumber ?? '').toString().trim();
          const amount = Number(row.amount ?? 0);
          const postDate = (row.postDate ?? '').toString();
          const lookupKey = `${checkNumber}::${amount.toFixed(2)}::${postDate}`;
          const matchedTxn = txnLookup.get(lookupKey);
          return {
            checkNumber: checkNumber || undefined,
            postDate: postDate || undefined,
            description: row.description ?? '',
            merchant: row.merchant ?? '',
            amount,
            type: row.type ?? 'debit',
            bbox: Array.isArray(row.bbox) && row.bbox.length === 4 ? row.bbox : undefined,
            pageNumber: row.pageNumber != null ? Number(row.pageNumber) : undefined,
            statementTransactionId: matchedTxn?._id?.toString() ?? null,
            sourceLocator: matchedTxn?.sourceLocator ?? null
          };
        });

      // eslint-disable-next-line no-console
      console.info('[checks.spawn] seeded candidates from checks-cleared table', {
        statementId: payload.statementId,
        clearedRowsLoaded: clearedRows.length,
        finalCandidateCount: candidates.length,
        matchedToTransactions: candidates.filter((row) => row.statementTransactionId).length
      });

      // Pre-compute manual crop-box slots for any candidate that has a check
      // number but no per-row bbox from the text parser. We dynamically
      // detect which pages of the statement are "check image pages" from
      // stored OCR text (a page with many `#1234` tokens + currency tokens,
      // no transactions/checks-cleared header) and then apply the shared 3x6
      // grid preset to each detected page. Without this fallback, check.process
      // bails out with "crop box missing" and every check ends up in manual
      // review even though we can safely infer a bbox from ordering.
      const orderedCheckNumbers = candidates
        .map((txn) => (txn.checkNumber ? String(txn.checkNumber).trim() : ''))
        .filter((value) => value.length > 0 && value !== '0000')
        .sort((left, right) => Number(left) - Number(right));
      const uniqueOrderedCheckNumbers = Array.from(new Set(orderedCheckNumbers));

      let detectedCheckPages: number[] = [];
      const statementOcrPathForChecks = String(freshStatement.artifacts?.ocrPath ?? '');
      if (uniqueOrderedCheckNumbers.length > 0 && statementOcrPathForChecks) {
        try {
          const { pages: ocrPages } = await readStatementOcrPages(
            bucketName,
            statementOcrPathForChecks
          );
          detectedCheckPages = detectCheckImagePages(
            ocrPages.map((page) => ({
              pageNumber: Number(page.pageNumber),
              text: String(page.text ?? '')
            }))
          );
        } catch (detectError) {
          // eslint-disable-next-line no-console
          console.warn('[checks.spawn] failed to detect check-image pages from OCR', {
            statementId: payload.statementId,
            error: detectError instanceof Error ? detectError.message : String(detectError)
          });
        }
      }

      // eslint-disable-next-line no-console
      console.info('[checks.spawn] detected check-image pages', {
        statementId: payload.statementId,
        pages: detectedCheckPages,
        checkCount: uniqueOrderedCheckNumbers.length
      });

      const manualSlots =
        detectedCheckPages.length > 0
          ? buildFallbackManualCheckSlots(uniqueOrderedCheckNumbers, {
              pages: detectedCheckPages,
              defaultPreset: DEFAULT_CHECK_IMAGE_PRESET
            })
          : buildFallbackManualCheckSlots(uniqueOrderedCheckNumbers);
      const manualSlotByCheckNumber = new Map<string, (typeof manualSlots)[number]>();
      for (const slot of manualSlots) {
        if (!manualSlotByCheckNumber.has(slot.checkNumber)) {
          manualSlotByCheckNumber.set(slot.checkNumber, slot);
        }
      }
      const checkNumberOrderIndex = new Map<string, number>();
      uniqueOrderedCheckNumbers.forEach((value, orderIndex) => {
        if (!checkNumberOrderIndex.has(value)) {
          checkNumberOrderIndex.set(value, orderIndex);
        }
      });

      type OfflineCheckImageArtifact = {
        page?: number;
        checkNumber?: string;
        amount?: number;
        imageBox?: { left?: number; top?: number; width?: number; height?: number };
        reviewCropPath?: string;
        alignment?: { status?: string; matchedBy?: string };
      };
      let offlineCheckImages: OfflineCheckImageArtifact[] = [];
      const offlineExtractionPath = String(freshStatement.artifacts?.offlineExtractionPath ?? '');
      if (offlineExtractionPath) {
        try {
          const rawJson = await downloadFileBuffer(bucketName, offlineExtractionPath);
          const parsedJson = JSON.parse(rawJson.toString('utf-8')) as {
            extraction?: { checkImages?: OfflineCheckImageArtifact[] };
          };
          if (Array.isArray(parsedJson?.extraction?.checkImages)) {
            offlineCheckImages = parsedJson.extraction.checkImages;
          }
        } catch (loadError) {
          console.warn('[checks.spawn] failed to load offline extraction artifact', {
            statementId: payload.statementId,
            offlineExtractionPath,
            error: loadError instanceof Error ? loadError.message : String(loadError)
          });
        }
      }
      const offlineImageByCheckNumber = new Map<string, OfflineCheckImageArtifact[]>();
      for (const image of offlineCheckImages) {
        const key = String(image.checkNumber ?? '').trim();
        if (!key) continue;
        const bucket = offlineImageByCheckNumber.get(key) ?? [];
        bucket.push(image);
        offlineImageByCheckNumber.set(key, bucket);
      }

      const checks = [] as Array<{ id: string; frontPath: string }>;
      const queuedAt = nowIso();
      // Running counter for candidates that don't have a parser bbox and
      // don't map to a named slot — they get a deterministic slot based on
      // their sequential position in the unmapped set. This guarantees every
      // check.process job receives a crop bbox and never has to bail out
      // with "crop box missing".
      let unmappedSlotCursor = 0;
      for (let index = 0; index < candidates.length; index += 1) {
        const candidate = candidates[index];
        const checkId = new Types.ObjectId().toString();
        const rowBBox = candidate.bbox;
        const txnBBox = candidate.sourceLocator?.bbox;
        const parserBBox =
          rowBBox && rowBBox.length === 4
            ? ([rowBBox[0], rowBBox[1], rowBBox[2], rowBBox[3]] as [number, number, number, number])
            : txnBBox && txnBBox.length === 4
              ? ([txnBBox[0], txnBBox[1], txnBBox[2], txnBBox[3]] as [number, number, number, number])
              : undefined;
        const parserPageNumber =
          candidate.pageNumber != null
            ? Number(candidate.pageNumber)
            : candidate.sourceLocator?.pageNumber != null
              ? Number(candidate.sourceLocator.pageNumber)
              : undefined;
        const checkNumberKey = candidate.checkNumber ? String(candidate.checkNumber).trim() : '';
        const namedSlot = (checkNumberKey ? manualSlotByCheckNumber.get(checkNumberKey) : null) ?? null;
        const offlineMatch = checkNumberKey
          ? (offlineImageByCheckNumber.get(checkNumberKey) ?? []).find(
              (image) => image.amount == null || Math.abs(Number(image.amount) - Number(candidate.amount ?? 0)) < 0.01
            ) ?? null
          : null;

        let computedSlot = null as ReturnType<typeof computeManualCheckSlot> | null;
        const orderIndex = checkNumberKey ? checkNumberOrderIndex.get(checkNumberKey) : undefined;
        if (!namedSlot) {
          const slotIndex = orderIndex != null ? orderIndex : unmappedSlotCursor;
          computedSlot = computeManualCheckSlot(slotIndex, {
            pages: detectedCheckPages.length > 0 ? detectedCheckPages : undefined,
            fallbackStartPage: 4,
            preset: DEFAULT_CHECK_IMAGE_PRESET
          });
          if (orderIndex == null) unmappedSlotCursor += 1;
        }

        const placement = resolveCheckImageCropPlacement({
          checkNumber: checkNumberKey || undefined,
          detectedCheckPages,
          manualSlot: namedSlot ?? computedSlot,
          offlineImage: offlineMatch,
          parserBBox,
          parserPageNumber,
          parserRegionText: candidate.description
        });

        const cropBBox = placement?.cropBBox;
        const pageNumber = placement?.pageNumber;
        const frontPath = String(
          placement?.cropImagePath ?? offlineMatch?.reviewCropPath ?? buildCheckCropPath(rootPrefix, checkId, 'front.png')
        );

        if (!cropBBox) {
          // eslint-disable-next-line no-console
          console.warn('[checks.spawn] no crop bbox computed for candidate', {
            statementId: payload.statementId,
            checkNumber: checkNumberKey,
            hadParserBBox: Boolean(parserBBox),
            hadNamedSlot: Boolean(namedSlot),
            hadComputedSlot: Boolean(computedSlot),
            detectedCheckPages
          });
        } else if (placement?.source === 'grid' && parserBBox) {
          // eslint-disable-next-line no-console
          console.info('[checks.spawn] ignored checks-cleared table bbox in favor of grid slot', {
            statementId: payload.statementId,
            checkNumber: checkNumberKey,
            parserPageNumber
          });
        }

        const matchReasons = candidate.statementTransactionId
          ? ['Seeded from cleared-checks table', 'Matched to statement transaction by (checkNumber, amount, postDate)']
          : ['Seeded from cleared-checks table'];
        if (offlineMatch?.alignment?.status) {
          matchReasons.push(
            `Offline thumbnail match ${String(offlineMatch.alignment.status).toLowerCase()} via ${String(
              offlineMatch.alignment.matchedBy ?? 'caption'
            )}`
          );
        }

        const created = await StatementCheckModel.create({
          _id: checkId,
          statementId: payload.statementId,
          companyId: payload.companyId,
          status: 'queued',
          artifacts: {
            pageNumber,
            cropBBox,
            cropImagePath: offlineMatch?.reviewCropPath ?? undefined,
            stageTimestamps: {
              queuedAt
            }
          },
          extracted: {
            checkNumber: candidate.checkNumber ?? undefined,
            date: candidate.postDate ?? undefined,
            payeeName: candidate.merchant || candidate.description || undefined,
            amount: Number.isFinite(candidate.amount) ? Number(candidate.amount) : undefined,
            memo: candidate.description || undefined,
            source: 'deterministic'
          },
          processing: {
            retryCount: 0,
            queuedAt,
            processedAt: undefined
          },
          gcs: {
            frontPath
          },
          match: {
            statementTransactionId: candidate.statementTransactionId ?? undefined,
            reasons: matchReasons,
            matchConfidence: candidate.statementTransactionId ? 0.7 : 0.55
          }
        });

        checks.push({ id: created._id.toString(), frontPath });
      }

      if (checks.length > 0) {
        mergeStatementArtifacts(freshStatement, {
          stageTimestamps: {
            checksQueuedAt: queuedAt
          }
        });
      } else {
        mergeStatementArtifacts(freshStatement, {
          stageTimestamps: {
            readyForReviewAt: queuedAt
          }
        });
      }
      updateStatementProgress(freshStatement, checks.length > 0 ? 'checks_queued' : 'ready_for_review', {
        totalChecks: checks.length,
        checksQueued: checks.length,
        checksProcessing: 0,
        checksReady: 0,
        checksFailed: 0
      });
      freshStatement.status = checks.length > 0 ? ('checks_queued' as any) : ('ready_for_review' as any);
      await persistStatementPatch(payload.companyId, payload.statementId, {
        status: freshStatement.status,
        progress: freshStatement.progress,
        artifacts: freshStatement.artifacts
      });

      if (checks.length > 0) {
        const { enqueueAccountingJob } = await import('./accountingQueue');
        for (const [index, check] of checks.entries()) {
          await enqueueAccountingJob({
            companyId: payload.companyId,
            statementId: payload.statementId,
            checkId: check.id,
            jobType: 'check.process',
            delaySeconds: Math.floor(index / 2),
            meta: {
              parentJob: 'checks.spawn',
              fanoutIndex: index,
              fanoutCount: checks.length
            }
          });
        }
      }

      // Do not eagerly write `extracted-checks.json` here. GCS enforces a
      // per-object mutation limit, and writing once in `checks.spawn` and
      // again when checks finalize can produce 429s on the same object path.
      // We still persist the deterministic final path immediately so the
      // statement metadata knows where the consolidated artifact will land.
      const extractedChecksPath = buildStatementExtractedChecksPath(rootPrefix);
      await BankStatement.updateOne(
        { _id: payload.statementId, companyId: payload.companyId },
        {
          $set: {
            'artifacts.extractedChecksPath': extractedChecksPath
          }
        }
      );

      artifacts.checks = checks.map((check) => check.frontPath).join(',');
      artifacts.extractedChecks = extractedChecksPath;
      artifacts.statementChecksQueuedAt = queuedAt;
      return {
        artifacts,
        metrics: {
          checksSpawned: checks.length
        }
      };
    }
    case 'check.process': {
      if (!payload.statementId || !payload.checkId) {
        throw new Error('check.process requires statementId and checkId');
      }
      const parentStatement = await BankStatement.findOne({
        _id: payload.statementId,
        companyId: payload.companyId
      });
      const rootPrefix = String(parentStatement?.gcs?.rootPrefix ?? '');
      if (!rootPrefix) {
        throw new Error('Statement missing rootPrefix for check.process');
      }

      const check = await StatementCheckModel.findOne({
        _id: payload.checkId,
        statementId: payload.statementId,
        companyId: payload.companyId
      });
      if (!check) {
        throw new Error('Check not found for check.process');
      }

      const processingAt = nowIso();
      mergeCheckArtifacts(check, {
        // Do not pre-populate cropImagePath — it becomes the source of truth
        // for "the crop PNG exists in GCS" and must only be set after
        // runStatementCheckExtraction has actually uploaded the image below.
        stageTimestamps: {
          processingAt
        }
      });
      mergeCheckProcessing(check, {
        processingAt,
        queuedAt: check.processing?.queuedAt ?? processingAt
      });
      check.status = 'processing' as any;
      await check.save();
      await updateStatementProgressFromChecks(payload.companyId, payload.statementId);

      const statementTxn = check.match?.statementTransactionId
        ? await StatementTransactionModel.findOne({
          _id: check.match.statementTransactionId,
          companyId: payload.companyId,
          statementId: payload.statementId
        })
        : null;
      let cropBox = check.artifacts?.cropBBox
        ? {
          left: Number(check.artifacts.cropBBox[0]),
          top: Number(check.artifacts.cropBBox[1]),
          right: Number(check.artifacts.cropBBox[2]),
          bottom: Number(check.artifacts.cropBBox[3])
        }
        : statementTxn?.sourceLocator?.bbox
          ? {
            left: Number(statementTxn.sourceLocator.bbox[0]),
            top: Number(statementTxn.sourceLocator.bbox[1]),
            right: Number(statementTxn.sourceLocator.bbox[2]),
            bottom: Number(statementTxn.sourceLocator.bbox[3])
          }
          : null;
      let derivedPageNumber: number | undefined;

      if (
        cropBox &&
        isLikelyChecksClearedTableCrop({
          bbox: cropBox,
          regionText: statementTxn?.description ?? check.extracted?.memo ?? undefined
        })
      ) {
        // eslint-disable-next-line no-console
        console.info('[check.process] discarding checks-cleared table bbox; will use check-image grid', {
          statementId: payload.statementId,
          checkId: payload.checkId,
          checkNumber: check.extracted?.checkNumber ?? null
        });
        cropBox = null;
      }

      // Final safety net: if the StatementCheck doc was created before the
      // checks.spawn layout fix landed and has no bbox, derive one from the
      // check's ordered position using the hardcoded SouthState 3x6 grid.
      // We prefer ordering by check number when available (so checks physically
      // laid out in ascending order on the pages line up) but fall back to
      // createdAt-order so checks without check numbers still get a bbox.
      if (!cropBox) {
        let detectedCheckPages: number[] = [];
        const statementOcrPathForCrop = String(parentStatement?.artifacts?.ocrPath ?? '');
        if (statementOcrPathForCrop) {
          try {
            const { pages: ocrPages } = await readStatementOcrPages(bucketName, statementOcrPathForCrop);
            detectedCheckPages = detectCheckImagePages(
              ocrPages.map((page) => ({
                pageNumber: Number(page.pageNumber),
                text: String(page.text ?? '')
              }))
            );
          } catch {
            detectedCheckPages = [];
          }
        }

        const peerChecks = await StatementCheckModel.find({
          companyId: payload.companyId,
          statementId: payload.statementId
        })
          .sort({ createdAt: 1 })
          .select('_id extracted.checkNumber createdAt')
          .lean();
        const orderedKeys: string[] = [];
        const createdOrder: string[] = [];
        for (const peer of peerChecks) {
          createdOrder.push(String(peer._id));
          const key = peer.extracted?.checkNumber ? String(peer.extracted.checkNumber).trim() : '';
          if (key && key !== '0000' && !orderedKeys.includes(key)) {
            orderedKeys.push(key);
          }
        }
        orderedKeys.sort((left, right) => Number(left) - Number(right));

        const checkNumberKey = check.extracted?.checkNumber
          ? String(check.extracted.checkNumber).trim()
          : '';
        const byCheckNumberIndex = checkNumberKey ? orderedKeys.indexOf(checkNumberKey) : -1;
        const byCreatedIndex = createdOrder.indexOf(String(check._id));
        const orderIndex = byCheckNumberIndex >= 0 ? byCheckNumberIndex : byCreatedIndex;

        if (orderIndex >= 0) {
          const computed = computeManualCheckSlot(orderIndex, {
            pages: detectedCheckPages.length > 0 ? detectedCheckPages : undefined,
            fallbackStartPage: Number(check.artifacts?.pageNumber ?? 4) || 4,
            preset: DEFAULT_CHECK_IMAGE_PRESET
          });
          if (computed) {
            cropBox = {
              left: computed.bbox.left,
              top: computed.bbox.top,
              right: computed.bbox.right,
              bottom: computed.bbox.bottom
            };
            derivedPageNumber = computed.pageNumber;
            mergeCheckArtifacts(check, {
              pageNumber: derivedPageNumber,
              cropBBox: [cropBox.left, cropBox.top, cropBox.right, cropBox.bottom]
            });
            // Clear the stale "missing crop bbox" reason so the UI no longer
            // reports it once we've successfully produced a crop.
            check.match = {
              ...(check.match ?? {}),
              reasons: (Array.isArray(check.match?.reasons)
                ? check.match.reasons.map((reason: unknown) => String(reason))
                : []
              ).filter((reason) => !/missing check crop bounding box/i.test(reason))
            } as any;
            await check.save();
            // eslint-disable-next-line no-console
            console.info('[check.process] derived crop bbox from fallback grid', {
              statementId: payload.statementId,
              checkId: payload.checkId,
              checkNumber: checkNumberKey,
              orderStrategy: byCheckNumberIndex >= 0 ? 'check_number' : 'created_at',
              orderIndex,
              pageNumber: derivedPageNumber
            });
          }
        }
      }

      if (!cropBox) {
        const needsReviewAt = nowIso();
        mergeCheckProcessing(check, {
          processedAt: needsReviewAt,
          lastError: 'Check crop box is missing; manual review required'
        });
        mergeCheckArtifacts(check, {
          stageTimestamps: {
            processedAt: needsReviewAt
          }
        });
        check.status = 'needs_review' as any;
        check.match = {
          ...(check.match ?? {}),
          reasons: Array.from(
            new Set([
              ...(Array.isArray(check.match?.reasons)
                ? check.match.reasons.map((reason: unknown) => String(reason))
                : []),
              'Missing check crop bounding box; moved to manual review'
            ])
          )
        } as any;
        await check.save();
        await updateStatementProgressFromChecks(payload.companyId, payload.statementId);
        return {
          artifacts: {
            checkStructured: String(check.gcs?.structuredPath ?? ''),
            checkOcr: String(check.gcs?.ocrPath ?? ''),
            checkOcrText: String(check.artifacts?.ocrTextPath ?? '')
          },
          metrics: {
            checkNeedsReview: 1,
            reason: 'missing_crop_bbox'
          }
        };
      }

      const pdfBuffer = await downloadFileBuffer(bucketName, String(parentStatement?.gcs?.pdfPath ?? ''));
      const statementOcrPath = String(parentStatement?.artifacts?.ocrPath ?? '');
      const pageNo = Number(check.artifacts?.pageNumber ?? statementTxn?.sourceLocator?.pageNumber ?? 1);
      const internalPdfPageText =
        statementOcrPath.length > 0
          ? await loadStatementPageTextFromStoredOcr(bucketName, statementOcrPath, pageNo)
          : '';

      const extraction = await runStatementCheckExtraction({
        pdfBuffer,
        pageNumber: pageNo,
        cropBox,
        checkKey: check._id.toString(),
        pageContext: [statementTxn?.merchant, statementTxn?.description].filter(Boolean).join(' '),
        fallback: {
          checkNumber: check.extracted?.checkNumber ?? statementTxn?.checkNumber ?? undefined,
          date: check.extracted?.date ?? statementTxn?.postDate ?? undefined,
          amount: check.extracted?.amount ?? statementTxn?.amount ?? undefined,
          memo: check.extracted?.memo ?? statementTxn?.description ?? undefined,
          payeeName: check.extracted?.payeeName ?? statementTxn?.merchant ?? statementTxn?.description ?? undefined,
          source:
            check.extracted?.source && check.extracted.source !== 'gemini'
              ? check.extracted.source
              : 'deterministic'
        },
        internalPdfPageText,
        bucketName,
        rootPrefix,
        persistArtifacts: true
      });

      const ocrPath = extraction.artifacts.ocrJsonPath ?? buildCheckOcrPath(rootPrefix, check._id.toString());
      const ocrTextPath = extraction.artifacts.ocrTextPath ?? buildCheckOcrPath(rootPrefix, check._id.toString(), 'ocr.txt');
      const structuredPath = extraction.artifacts.structuredPath ?? buildCheckStructuredPath(rootPrefix, check._id.toString());
      const frontPath = extraction.artifacts.cropImagePath ?? check.gcs?.frontPath ?? buildCheckCropPath(rootPrefix, check._id.toString(), 'front.png');

      // eslint-disable-next-line no-console
      console.info('[check.process] extraction result', {
        statementId: payload.statementId,
        checkId: payload.checkId,
        pageNumber: pageNo,
        cropBox,
        detectedCheckNumber: extraction.extracted.checkNumber ?? null,
        seededCheckNumber: check.extracted?.checkNumber ?? statementTxn?.checkNumber ?? null,
        ocrProvider: extraction.ocr.provider,
        ocrTextPreview: extraction.ocr.text.slice(0, 240)
      });

      const extracted = {
        checkNumber:
          check.extracted?.checkNumber ??
          statementTxn?.checkNumber ??
          extraction.extracted.checkNumber,
        date: extraction.extracted.date ?? statementTxn?.postDate ?? check.extracted?.date,
        payeeName: extraction.extracted.payeeName ?? statementTxn?.merchant ?? statementTxn?.description ?? check.extracted?.payeeName,
        amount: extraction.extracted.amount ?? statementTxn?.amount ?? check.extracted?.amount,
        memo: extraction.extracted.memo ?? statementTxn?.description ?? check.extracted?.memo
      };
      const autoFill = { ...extracted };
      const confidence = extraction.confidence;

      const checkGcs: any = check.gcs ?? ((check.gcs = { frontPath } as any), check.gcs);
      checkGcs.frontPath = frontPath;
      checkGcs.ocrPath = ocrPath;
      checkGcs.structuredPath = structuredPath;

      mergeCheckArtifacts(check, {
        pageNumber: Number(check.artifacts?.pageNumber ?? statementTxn?.sourceLocator?.pageNumber ?? 1),
        cropBBox: [cropBox.left, cropBox.top, cropBox.right, cropBox.bottom],
        cropImagePath: frontPath,
        ocrTextPath,
        ocrJsonPath: ocrPath,
        structuredPath,
        stageTimestamps: {
          processingAt,
          processedAt: nowIso()
        }
      });
      mergeCheckProcessing(check, {
        processedAt: nowIso(),
        lastError: undefined
      });
      check.extracted = {
        checkNumber: extracted.checkNumber ?? undefined,
        date: extracted.date ?? undefined,
        payeeName: extracted.payeeName ?? undefined,
        amount: extracted.amount ?? undefined,
        memo: extracted.memo ?? undefined,
        source: extraction.extracted.source
      } as any;
      check.autoFill = autoFill as any;
      check.confidence = confidence as any;
      check.match = {
        ...(check.match ?? {}),
        statementTransactionId: statementTxn?._id?.toString() ?? check.match?.statementTransactionId,
        matchConfidence: statementTxn ? 0.92 : 0.58,
        reasons: [
          ...extraction.reasons,
          statementTxn ? 'Matched from statement transaction candidate' : 'No strong transaction candidate found'
        ]
      } as any;
      check.status = confidence.overall >= 0.75 ? ('ready' as any) : ('needs_review' as any);
      await check.save();

      const proposalSource = statementTxn ?? {
        description: extracted.memo ?? check.extracted?.memo ?? extracted.payeeName ?? 'Bank statement check',
        merchant: extracted.payeeName ?? check.extracted?.payeeName ?? undefined,
        amount: Number(extracted.amount ?? check.extracted?.amount ?? 0),
        type: 'debit' as const
      };

      const proposal = await buildMatchingProposal({
        companyId: payload.companyId,
        description: proposalSource.description,
        merchant: proposalSource.merchant ?? undefined,
        amount: proposalSource.amount,
        type: proposalSource.type,
        check: {
          payeeName: extracted.payeeName ?? undefined,
          amount: extracted.amount ?? undefined,
          extracted: {
            checkNumber: extracted.checkNumber ?? undefined,
            date: extracted.date ?? undefined,
            payeeName: extracted.payeeName ?? undefined,
            amount: extracted.amount ?? undefined,
            memo: extracted.memo ?? undefined
          }
        }
      });

      const { suggestionPath: checkSuggestionPath } = await persistInternalMatchingSuggestion({
        bucketName,
        rootPrefix,
        proposal,
        key: check._id.toString()
      });

      mergeCheckArtifacts(check, {
        geminiPath: checkSuggestionPath ?? check.artifacts?.geminiPath ?? undefined
      });

      check.match = {
        ...(check.match ?? {}),
        statementTransactionId: statementTxn?._id?.toString() ?? check.match?.statementTransactionId,
        matchConfidence: statementTxn ? 0.92 : 0.58,
        reasons: Array.from(
          new Set([
            ...extraction.reasons,
            ...proposal.reasons,
            statementTxn ? 'Matched from statement transaction candidate' : 'No strong transaction candidate found'
          ])
        )
      } as any;
      await check.save();

      if (statementTxn) {
        await Promise.all([
          StatementTransactionModel.updateOne(
            { _id: statementTxn._id, companyId: payload.companyId },
            {
              $set: {
                statementCheckId: check._id.toString(),
                evidence: {
                  statementPdfPath: statementTxn.evidence?.statementPdfPath ?? parentStatement?.gcs?.pdfPath ?? undefined,
                  pageImagePath: statementTxn.evidence?.pageImagePath ?? resolveStatementPageImagePath(parentStatement, rootPrefix, statementTxn.sourceLocator?.pageNumber),
                  checkCropPath: frontPath,
                  ocrPath,
                  geminiPath: checkSuggestionPath ?? undefined
                },
                proposal: {
                  ...proposal,
                  status: 'proposed'
                },
                reviewStatus: 'proposed'
              }
            }
          ),
          LedgerEntryModel.updateOne(
            {
              companyId: payload.companyId,
              statementId: payload.statementId,
              statementTransactionId: statementTxn._id.toString()
            },
            {
              $set: {
                statementCheckId: check._id.toString(),
                'attachments.checkFrontPath': frontPath,
                'attachments.checkBackPath': check.gcs?.backPath ?? null,
                'attachments.checkCropPath': frontPath,
                'attachments.ocrPath': ocrPath,
                'attachments.geminiPath': checkSuggestionPath ?? undefined,
                confidence,
                proposal: {
                  ...proposal,
                  status: 'proposed'
                },
                reviewStatus: 'proposed'
              }
            }
          )
        ]);
      }

      // NOTE: `extracted-checks.json` is intentionally NOT written here on
      // every check.process run. GCS imposes a ~1 write/second per-object
      // rate limit, and fan-out of 40+ concurrent check jobs produces 429
      // rate-limit errors when each writes to the same object. The
      // consolidated artifact is finalized once from
      // `updateStatementProgressFromChecks` after the last check reaches a
      // terminal state, and once again on-demand from `matching.refresh` or
      // the reprocess flow.
      await updateStatementProgressFromChecks(payload.companyId, payload.statementId);

      artifacts.checkOcr = ocrPath;
      artifacts.checkOcrText = ocrTextPath;
      artifacts.checkStructured = structuredPath;
      return { artifacts };
    }
    case 'matching.refresh': {
      if (!payload.statementId) {
        throw new Error('matching.refresh requires statementId');
      }
      const currentStatement = statement;
      if (!currentStatement) {
        throw new Error('matching.refresh requires a valid statement');
      }
      const txns = await StatementTransactionModel.find({
        companyId: payload.companyId,
        statementId: payload.statementId
      });

      for (const txn of txns) {
        const check = await StatementCheckModel.findOne({
          companyId: payload.companyId,
          statementId: payload.statementId,
          'match.statementTransactionId': txn._id.toString(),
          status: { $in: ['ready', 'needs_review'] }
        });

        const fallbackProposal = await buildMatchingProposal({
          companyId: payload.companyId,
          description: txn.description,
          merchant: txn.merchant ?? undefined,
          amount: txn.amount,
          type: txn.type,
          check: {
            payeeName: check?.extracted?.payeeName ?? check?.autoFill?.payeeName ?? undefined,
            amount: check?.extracted?.amount ?? check?.autoFill?.amount ?? undefined,
            extracted: check?.extracted
              ? {
                checkNumber: check.extracted.checkNumber ?? undefined,
                date: check.extracted.date ?? undefined,
                payeeName: check.extracted.payeeName ?? undefined,
                amount: check.extracted.amount ?? undefined,
                memo: check.extracted.memo ?? undefined
              }
            : undefined
          }
        });

        const proposal = fallbackProposal;

        txn.proposal = {
          ...proposal,
          status: 'proposed'
        } as any;
        await txn.save();

        await LedgerEntryModel.updateOne(
          {
            companyId: payload.companyId,
            statementId: payload.statementId,
            statementTransactionId: txn._id.toString()
          },
          {
            $set: {
              proposal: {
                ...proposal,
                status: 'proposed'
              },
              confidence: {
                overall: proposal.confidence,
                crossValidation: proposal.confidence
              }
            }
          }
        );
      }

      return {
        metrics: {
          refreshed: txns.length
        }
      };
    }
    case 'quickbooks.refresh_reference_data': {
      const result = await syncQuickBooksReferenceData(payload.companyId);
      return {
        metrics: result as Record<string, unknown>
      };
    }
    case 'quickbooks.post_approved': {
      const result = await postApprovedLedgerEntriesToQuickBooks(payload.companyId);
      return {
        metrics: result as Record<string, unknown>
      };
    }
    default: {
      const exhaustive: never = payload.jobType;
      throw new Error(`Unhandled accounting job type: ${String(exhaustive)}`);
    }
  }
};

export const runAccountingTask = async (input: unknown): Promise<AccountingTaskRunResult> => {
  const parsed = accountingTaskPayloadSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error('Invalid accounting task payload');
  }

  const payload = parsed.data;
  setRequestContext({ tenantId: payload.companyId, userId: 'system-accounting-task' });

  const run = await createRun(payload);

  try {
    const startedAt = Date.now();
    const result = await runTaskLogic(payload);
    await completeRun(run._id.toString(), 'success', {
      artifacts: result?.artifacts,
      metrics: {
        ...(result?.metrics ?? {}),
        durationMs: Date.now() - startedAt
      }
    });

    // eslint-disable-next-line no-console
    console.info('[accounting.task.completed]', {
      companyId: payload.companyId,
      statementId: payload.statementId,
      checkId: payload.checkId,
      jobType: payload.jobType
    });

    let nextJobType = nextJobMap[payload.jobType];
    if (payload.jobType === 'statement.structure' && payload.statementId) {
      const latest = await BankStatement.findOne({
        _id: payload.statementId,
        companyId: payload.companyId
      });
      if (latest && String(latest.status) === 'needs_parser_review') {
        nextJobType = undefined;
      }
    }

    return {
      taskId: String(payload.meta.taskId ?? `${payload.jobType}-${Date.now()}`),
      companyId: payload.companyId,
      statementId: payload.statementId,
      checkId: payload.checkId,
      jobType: payload.jobType,
      status: 'completed',
      nextJobType
    };
  } catch (error) {
    const message = String((error as Error).message);

    await completeRun(run._id.toString(), 'failed', {
      errors: [message]
    });

    if (statementJobTypes.includes(payload.jobType) && payload.statementId) {
      await persistStatementFailure({
        companyId: payload.companyId,
        statementId: payload.statementId,
        message
      });

      if (payload.jobType === 'check.process' && payload.checkId) {
        const currentCheck = await StatementCheckModel.findOne({
          _id: payload.checkId,
          statementId: payload.statementId,
          companyId: payload.companyId
        });
        const failedAt = nowIso();
        await StatementCheckModel.updateOne(
          { _id: payload.checkId, statementId: payload.statementId, companyId: payload.companyId },
          {
            $set: {
              status: 'failed',
              errors: [message],
              processing: {
                retryCount: Number(currentCheck?.processing?.retryCount ?? 0),
                lastError: message,
                queuedAt: currentCheck?.processing?.queuedAt ?? failedAt,
                processingAt: currentCheck?.processing?.processingAt ?? failedAt,
                processedAt: failedAt
              },
              artifacts: {
                stageTimestamps: {
                  failedAt
                }
              }
            }
          }
        );
        await updateStatementProgressFromChecks(payload.companyId, payload.statementId);
      }
    } else if (syncJobTypes.includes(payload.jobType)) {
      await markQuickBooksSyncFailure(
        payload.companyId,
        payload.jobType as 'quickbooks.refresh_reference_data' | 'quickbooks.post_approved',
        message
      );
    }

    // eslint-disable-next-line no-console
    console.error('[accounting.task.failed]', {
      companyId: payload.companyId,
      statementId: payload.statementId,
      checkId: payload.checkId,
      jobType: payload.jobType,
      error: message
    });
    throw error;
  }
};
