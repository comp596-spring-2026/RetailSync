import {
  accountingAiStatusSchema,
  bankStatementDetailSchema,
  bankStatementListItemSchema,
  bankStatementStatusResponseSchema,
  assignStatementBankAccountSchema,
  createBankStatementSchema,
  detectStatementMonthResponseSchema,
  listBankStatementsQuerySchema,
  listStatementMonthsQuerySchema,
  listChecksQuerySchema,
  createStatementRuleSchema,
  updateStatementRuleSchema,
  statementRuleSchema,
  inferDefaultQuickBooksTxnType,
  resolveTransferSuggestionSchema,
  updateStatementEntryReviewSchema,
  updateStatementSuggestionReviewSchema,
  reprocessBankStatementSchema,
  statementSuggestionsResponseSchema,
  requestStatementUploadUrlResponseSchema,
  requestStatementUploadUrlSchema
} from '@retailsync/shared';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { Request, Response } from 'express';
import { Types, type HydratedDocument } from 'mongoose';
import { env } from '../config/env';
import { getStorageClient } from '../integrations/google/storage.client';
import { enqueueAccountingJob } from '../jobs/accountingQueue';
import { BankStatement } from '../models/BankStatement';
import { ChartOfAccountModel } from '../models/ChartOfAccount';
import { LedgerEntryModel } from '../models/LedgerEntry';
import { RunModel } from '../models/Run';
import { StatementTransactionModel, type StatementTransactionDoc } from '../models/StatementTransaction';
import { StatementCheckModel } from '../models/StatementCheck';
import { StatementRuleModel } from '../models/StatementRule';
import { createQuickBooksHubChartAccount } from '../services/quickbooksTaxService';
import {
  buildStatementPdfPath,
  buildStatementRootPrefix
} from '../services/accountingStorageService';
import { detectStatementMonthFromPdf } from '../services/accountingPdfAnalysisService';
import {
  deriveSectionBoundsFromLayout,
  extractChecksClearedFromLayout,
  extractStatementPagesLayoutFromPdfBuffer
} from '../services/accountingPdfLayoutExtractionService';
import { runStatementCheckExtraction } from '../services/accountingCheckExtractionService';
import { buildCheckRowsFromLayout } from '../statement-extraction/offline';
import { extractChecks } from '../statement-extraction/offline/extractChecks';
import { extractPdfTextItemsFromBuffer, groupItemsIntoLines } from '../statement-extraction/offline/extractText';
import { parseStatementLines } from '../statement-extraction/offline/parseStatement';
import { getPdfPageCount, scalePdfBoxToImageBox } from '../statement-extraction/offline/renderPdfPage';
import type { Box, CheckCaption, CheckRow, DetectedCheckImage, StatementTransaction } from '../statement-extraction/offline/types';
import { persistStatementFailure } from '../services/bankStatementPersistence';
import { mergeStatementProposal } from '../services/chartAccountPostingResolve';
import { resolveStatementEntryForCheckSuggestion } from '../services/statementCheckLinkService';
import { postApprovedLedgerEntryByStatementTransactionId } from '../services/quickbooksSyncService';
import { evaluateStatementRules, listStatementRules } from '../services/statementRuleService';
import { fail, ok } from '../utils/apiResponse';

const storage = getStorageClient();

const parseMaskedAccountHint = (value: string): string | undefined => {
  const match = value.match(/(?:x{2,}|\*{2,})\s*(\d{3,4})/i);
  if (match?.[1]) return `xxx${match[1]}`;
  const explicitTail = value.match(/\b(\d{4})\b/);
  return explicitTail?.[1] ? `xxx${explicitTail[1]}` : undefined;
};

const sanitizeFileName = (name: string) => name.trim().replace(/[^a-zA-Z0-9._-]/g, '_');

const bufferToDataUrl = (buffer: Buffer, mimeType = 'image/png') =>
  `data:${mimeType};base64,${buffer.toString('base64')}`;

const roundMoney = (value: number) => Number(Number(value ?? 0).toFixed(2));

const sumTransactionAmounts = (rows: Array<{ amount?: number }>) =>
  roundMoney(rows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0));

const formatSectionLabel = (value: string) =>
  value
    .split('_')
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ');

type PlaygroundExtractionPageBox = {
  kind: 'image' | 'review' | 'caption';
  label: string;
  box: Box;
  status?: string;
};

type PlaygroundExtractionPage = {
  page: number;
  width: number;
  height: number;
  scale: number;
  imageDataUrl: string;
  boxes: PlaygroundExtractionPageBox[];
};

type PlaygroundExtractionImage = DetectedCheckImage & {
  imageDataUrl: string;
  reviewImageDataUrl: string;
};

type PlaygroundExtractionTotalsAnalysis = {
  checksTableCount: number;
  detectedCheckImageCount: number;
  matchedCheckImageCount: number;
  unmatchedCheckRows: string[];
  unmatchedCheckImages: string[];
  checksTableTotal: number;
  matchedCheckImageTotal: number;
  countsMatch: boolean;
  totalsMatch: boolean;
};

type PlaygroundCheckProcessResult = {
  checkNumber?: string;
  amount?: number;
  page: number;
  cropBox: Box;
  status: 'ready' | 'needs_review';
  ocrProvider: 'tesseract' | 'pdf_text';
  extractionSource: 'ocr' | 'deterministic' | 'legacy' | 'pdf_text';
  extracted: {
    checkNumber?: string;
    date?: string;
    payeeName?: string;
    amount?: number;
    memo?: string;
  };
  confidence: {
    imageQuality: number;
    ocrConfidence: number;
    fieldConfidence: number;
    crossValidation: number;
    overall: number;
  };
  reasons: string[];
  implementation: {
    cropRendered: boolean;
    ocrProduced: boolean;
    structuredFieldsPresent: boolean;
    mirrorsCheckProcess: boolean;
  };
};

type PlaygroundExtractionResponse = {
  fileName: string;
  pageCount: number;
  warnings: string[];
  summary: {
    transactionCount: number;
    sectionCount: number;
    checkRowCount: number;
    detectedCheckImageCount: number;
    matchedCheckImageCount: number;
    unmatchedCheckRowCount: number;
    unmatchedCheckImageCount: number;
    transactionTotal: number;
    checksTableTotal: number;
    matchedCheckImageTotal: number;
    countsMatch: boolean;
    totalsMatch: boolean;
    processedCheckCount: number;
    readyCheckCount: number;
    needsReviewCheckCount: number;
    averageCheckConfidence: number;
  };
  checkProcessSummary: {
    processedCheckCount: number;
    readyCheckCount: number;
    needsReviewCheckCount: number;
    averageConfidence: number;
    ocrProviders: {
      pdfText: number;
      tesseract: number;
    };
    mirrorsImplementation: boolean;
  };
  sectionSummary: Array<{
    section: string;
    count: number;
    total: number;
  }>;
  totalsAnalysis: PlaygroundExtractionTotalsAnalysis;
  transactions: StatementTransaction[];
  checks: CheckRow[];
  captions: CheckCaption[];
  checkImages: PlaygroundExtractionImage[];
  checkProcessResults: PlaygroundCheckProcessResult[];
  pages: PlaygroundExtractionPage[];
};

type UploadUrlFailure = {
  reason:
    | 'missing_google_credentials'
    | 'storage_signing_permission_denied'
    | 'storage_signing_not_configured'
    | 'storage_access_denied'
    | 'storage_bucket_not_found'
    | 'upload_url_generation_failed';
  clientMessage: string;
  hint: string;
  errorCode: number | null;
  errorMessage: string;
};

type CreateStatementFailure = {
  reason:
    | 'statement_pdf_missing'
    | 'statement_storage_access_denied'
    | 'statement_hash_failed'
    | 'statement_queue_failed'
    | 'statement_create_failed';
  clientMessage: string;
  errorCode: number | null;
  errorMessage: string;
};

const extractErrorCode = (error: unknown) => {
  const value =
    typeof error === 'object' && error && 'code' in error
      ? (error as { code?: unknown }).code
      : undefined;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const extractErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error) {
    if ('message' in error && typeof (error as { message?: unknown }).message === 'string') {
      return String((error as { message?: unknown }).message);
    }
    try {
      return JSON.stringify(error);
    } catch {
      return 'Unknown error';
    }
  }
  return 'Unknown error';
};

const classifyUploadUrlFailure = (error: unknown): UploadUrlFailure => {
  const errorCode = extractErrorCode(error);
  const errorMessage = extractErrorMessage(error);
  const normalized = errorMessage.toLowerCase();

  if (normalized.includes('could not load the default credentials')) {
    return {
      reason: 'missing_google_credentials',
      clientMessage: 'Google Cloud credentials are not configured on the server',
      hint:
        'Attach a Cloud Run service account with the required roles or provide GOOGLE_SERVICE_ACCOUNT_JSON.',
      errorCode,
      errorMessage
    };
  }

  if (
    normalized.includes('iam.serviceaccounts.signblob') ||
    normalized.includes('signblob') ||
    normalized.includes('cannot sign data') ||
    normalized.includes('private_key') ||
    normalized.includes('private key')
  ) {
    return {
      reason: normalized.includes('iam.serviceaccounts.signblob')
        ? 'storage_signing_permission_denied'
        : 'storage_signing_not_configured',
      clientMessage: 'Storage URL signing is not configured on the server',
      hint:
        'Grant roles/iam.serviceAccountTokenCreator to the runtime service account or provide GOOGLE_SERVICE_ACCOUNT_JSON with a signing key.',
      errorCode,
      errorMessage
    };
  }

  if (
    errorCode === 404 ||
    normalized.includes('no such bucket') ||
    normalized.includes('bucket') && normalized.includes('not found')
  ) {
    return {
      reason: 'storage_bucket_not_found',
      clientMessage: 'Accounting storage bucket was not found',
      hint: `Verify GCS_BUCKET_NAME and ensure the bucket exists.`,
      errorCode,
      errorMessage
    };
  }

  if (
    errorCode === 403 ||
    normalized.includes('permission denied') ||
    normalized.includes('forbidden') ||
    normalized.includes('does not have storage.objects') ||
    normalized.includes('access denied')
  ) {
    return {
      reason: 'storage_access_denied',
      clientMessage: 'Storage access is denied for the configured server identity',
      hint:
        'Grant the runtime service account access to the configured GCS bucket in addition to URL-signing permissions.',
      errorCode,
      errorMessage
    };
  }

  return {
    reason: 'upload_url_generation_failed',
    clientMessage: 'Failed to generate upload URL',
    hint: 'Check GCS bucket configuration, service account permissions, and signed URL support.',
    errorCode,
    errorMessage
  };
};

const classifyCreateStatementFailure = (error: unknown): CreateStatementFailure => {
  const errorCode = extractErrorCode(error);
  const errorMessage = extractErrorMessage(error);
  const normalized = errorMessage.toLowerCase();

  if (
    errorCode === 404 ||
    normalized.includes('no such object') ||
    normalized.includes('object not found') ||
    normalized.includes('file not found')
  ) {
    return {
      reason: 'statement_pdf_missing',
      clientMessage: 'Uploaded statement PDF was not found in secure storage. Please upload the file again.',
      errorCode,
      errorMessage
    };
  }

  if (
    errorCode === 403 ||
    normalized.includes('permission denied') ||
    normalized.includes('forbidden') ||
    normalized.includes('access denied')
  ) {
    return {
      reason: 'statement_storage_access_denied',
      clientMessage: 'The server cannot read the uploaded statement from secure storage.',
      errorCode,
      errorMessage
    };
  }

  if (normalized.includes('queue dispatch failed')) {
    return {
      reason: 'statement_queue_failed',
      clientMessage: 'The statement was saved, but processing could not be started.',
      errorCode,
      errorMessage
    };
  }

  if (normalized.includes('sha') || normalized.includes('hash')) {
    return {
      reason: 'statement_hash_failed',
      clientMessage: 'The server could not verify the uploaded statement PDF.',
      errorCode,
      errorMessage
    };
  }

  return {
    reason: 'statement_create_failed',
    clientMessage: 'Failed to create statement',
    errorCode,
    errorMessage
  };
};

const buildAccountingEnvSnapshot = () => ({
  nodeEnv: env.nodeEnv,
  clientUrl: env.clientUrl,
  gcsBucketConfigured: Boolean(env.gcsBucketName),
  gcsBucketName: env.gcsBucketName ?? null,
  gcpProjectId: env.gcpProjectId ?? null,
  gcpRegion: env.gcpRegion ?? null,
  tasksMode: env.tasksMode,
  internalTasksEndpointConfigured: Boolean(env.internalTasksEndpoint),
  googleCredentialsConfigured: Boolean(env.googleServiceAccountJson),
  statementOcrProvider: env.statementOcrProvider,
  statementGeminiConfigured: Boolean(env.statementGeminiApiKey)
});

const resolveStatementBankAccountQbId = async (
  companyId: string,
  ref: string | undefined
): Promise<string | undefined> => {
  const trimmed = ref?.trim();
  if (!trimmed) return undefined;

  const accountQuery: Record<string, unknown> = { companyId };
  if (Types.ObjectId.isValid(trimmed)) {
    accountQuery._id = new Types.ObjectId(trimmed);
  } else {
    accountQuery.qbAccountId = trimmed;
  }

  const account = await ChartOfAccountModel.findOne(accountQuery).select('qbAccountId').lean();
  return account?.qbAccountId?.trim() || trimmed;
};

const statementBankAccountIdFilter = async (
  companyId: string,
  ref: string
): Promise<Record<string, unknown>> => {
  const trimmed = ref.trim();
  const candidates = new Set<string>([trimmed]);

  const accountQuery: Record<string, unknown> = { companyId };
  if (Types.ObjectId.isValid(trimmed)) {
    accountQuery._id = new Types.ObjectId(trimmed);
  } else {
    accountQuery.qbAccountId = trimmed;
  }

  const account = await ChartOfAccountModel.findOne(accountQuery).select('_id qbAccountId').lean();
  if (account?.qbAccountId) candidates.add(String(account.qbAccountId).trim());
  if (account?._id) candidates.add(String(account._id));

  const values = [...candidates].filter(Boolean);
  return values.length === 1 ? { bankAccountId: values[0] } : { bankAccountId: { $in: values } };
};

const purgeStatementsFromMongo = async (args: {
  companyId: string;
  statementIds: string[];
}) => {
  const statementIds = Array.from(new Set(args.statementIds.filter(Boolean)));
  if (statementIds.length === 0) {
    return;
  }

  await Promise.all([
    StatementCheckModel.deleteMany({
      companyId: args.companyId,
      statementId: { $in: statementIds }
    }),
    StatementTransactionModel.deleteMany({
      companyId: args.companyId,
      statementId: { $in: statementIds }
    }),
    LedgerEntryModel.deleteMany({
      companyId: args.companyId,
      statementId: { $in: statementIds }
    }),
    RunModel.deleteMany({
      companyId: args.companyId,
      statementId: { $in: statementIds }
    }),
    BankStatement.deleteMany({
      companyId: args.companyId,
      _id: { $in: statementIds }
    })
  ]);
};

const purgeStatementRelatedRecords = async (args: {
  companyId: string;
  statementId: string;
}) => {
  await Promise.all([
    StatementCheckModel.deleteMany({
      companyId: args.companyId,
      statementId: args.statementId
    }),
    StatementTransactionModel.deleteMany({
      companyId: args.companyId,
      statementId: args.statementId
    }),
    LedgerEntryModel.deleteMany({
      companyId: args.companyId,
      statementId: args.statementId
    }),
    RunModel.deleteMany({
      companyId: args.companyId,
      statementId: args.statementId
    })
  ]);
};

const purgeStatementStorage = async (bucketName: string, rootPrefix: string) => {
  try {
    const bucket = storage.bucket(bucketName) as unknown as {
      deleteFiles?: (options: { prefix: string; force?: boolean }) => Promise<unknown>;
    };

    if (typeof bucket.deleteFiles === 'function') {
      await bucket.deleteFiles({ prefix: `${rootPrefix}/`, force: true });
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('[accounting.delete-statement.storage] failed', {
      rootPrefix,
      bucketName,
      errorMessage: extractErrorMessage(error)
    });
  }
};

const computeStatementHash = async (bucketName: string, objectPath: string) => {
  const file = storage.bucket(bucketName).file(objectPath);
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const [buffer] = await file.download();
      return createHash('sha256').update(buffer).digest('hex');
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
  }

  throw lastError;
};

const nowIso = () => new Date().toISOString();

const readTextObject = async (objectPath?: string | null) => {
  if (!env.gcsBucketName || !objectPath) return null;
  try {
    const [buffer] = await storage.bucket(env.gcsBucketName).file(objectPath).download();
    return buffer.toString('utf-8');
  } catch {
    return null;
  }
};

const inferArtifactContentType = (objectPath: string) => {
  const extension = path.extname(objectPath).toLowerCase();

  switch (extension) {
    case '.pdf':
      return 'application/pdf';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.txt':
      return 'text/plain; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    default:
      return 'application/octet-stream';
  }
};

const isStatementScopedArtifactPath = (rootPrefix: string, objectPath: string, pdfPath: string) => {
  if (!objectPath || objectPath.includes('..')) {
    return false;
  }

  return objectPath === pdfPath || objectPath.startsWith(`${rootPrefix}/`);
};

const buildGeminiArtifactPaths = (normalizedPath?: string | null) => {
  if (!normalizedPath) return undefined;
  return {
    normalizedPath,
    promptPath: normalizedPath.replace(/\/proposal\.normalized\.v1\.json$/, '/proposal.prompt.v1.txt'),
    rawPath: normalizedPath.replace(/\/proposal\.normalized\.v1\.json$/, '/proposal.raw.v1.json')
  };
};

const readGeminiAiStatus = async (geminiPath?: string | null) => {
  const raw = await readTextObject(geminiPath ?? undefined);
  if (!raw) return undefined;

  try {
    const parsed = JSON.parse(raw) as any;
    const providerStatus = ['healthy', 'degraded', 'unavailable'].includes(String(parsed.providerStatus))
      ? (String(parsed.providerStatus) as 'healthy' | 'degraded' | 'unavailable')
      : 'unavailable';
    const source = ['gemini', 'fallback', 'hybrid'].includes(String(parsed.source))
      ? (String(parsed.source) as 'gemini' | 'fallback' | 'hybrid')
      : 'fallback';
    return accountingAiStatusSchema.parse({
      provider: 'gemini',
      providerStatus,
      degraded: providerStatus !== 'healthy',
      degradedReason: typeof parsed.degradedReason === 'string' ? parsed.degradedReason : undefined,
      source,
      confidence: Number(parsed.confidence ?? parsed.proposal?.confidence ?? parsed.fallbackProposal?.confidence ?? 0),
      reasons: Array.isArray(parsed.reasons)
        ? parsed.reasons.map((value: unknown) => String(value))
        : Array.isArray(parsed.proposal?.reasons)
          ? parsed.proposal.reasons.map((value: unknown) => String(value))
          : [],
      artifacts: buildGeminiArtifactPaths(geminiPath ?? undefined)
    });
  } catch {
    return undefined;
  }
};

const buildStatementProgress = (statement: any) => {
  const totalChecks = Number(statement.progress?.totalChecks ?? 0);
  const checksQueued = Number(statement.progress?.checksQueued ?? 0);
  const checksProcessing = Number(statement.progress?.checksProcessing ?? 0);
  const checksReady = Number(statement.progress?.checksReady ?? 0);
  const checksFailed = Number(statement.progress?.checksFailed ?? 0);
  const completedChecks = checksReady + checksFailed;
  const remainingChecks = Math.max(totalChecks - completedChecks, 0);

  return {
    phase: statement.status,
    totalChecks,
    checksQueued,
    checksProcessing,
    checksReady,
    checksFailed,
    completedChecks,
    remainingChecks
  };
};

const buildStatementLiveMetrics = async (statementId: string, companyId: unknown) => {
  const transactions = await StatementTransactionModel.find({
    statementId,
    companyId
  })
    .select('type amount balanceAfter postDate')
    .sort({ postDate: 1, createdAt: 1 })
    .lean();

  const entryCount = transactions.length;
  const debitCount = transactions.filter((txn: any) => String(txn.type) === 'debit').length;
  const creditCount = transactions.filter((txn: any) => String(txn.type) === 'credit').length;

  const balanceRows = transactions.filter(
    (txn: any) => typeof txn.balanceAfter === 'number' && Number.isFinite(txn.balanceAfter)
  );
  const startingBalance = balanceRows.length > 0 ? Number(balanceRows[0].balanceAfter) : null;
  const endingBalance = balanceRows.length > 0 ? Number(balanceRows[balanceRows.length - 1].balanceAfter) : null;

  return {
    entryCount,
    debitCount,
    creditCount,
    startingBalance,
    endingBalance
  };
};

const serializeStatementRule = (rule: any) =>
  statementRuleSchema.parse({
    id: String(rule._id),
    statementId: String(rule.statementId),
    companyId: String(rule.companyId),
    name: String(rule.name ?? ''),
    enabled: Boolean(rule.enabled),
    hardness: rule.hardness === 'hard' ? 'hard' : 'soft',
    conditions: {
      contains: rule.conditions?.contains ?? undefined,
      direction: rule.conditions?.direction ?? undefined,
      minAmount: rule.conditions?.minAmount ?? undefined,
      maxAmount: rule.conditions?.maxAmount ?? undefined,
      dateFrom: rule.conditions?.dateFrom ?? undefined,
      dateTo: rule.conditions?.dateTo ?? undefined
    },
    action: {
      type: rule.action?.type,
      proposedTxnType: rule.action?.proposedTxnType ?? undefined,
      bankAccountId: rule.action?.bankAccountId ?? undefined,
      payeeName: rule.action?.payeeName ?? undefined,
      categoryAccountId: rule.action?.categoryAccountId ?? undefined,
      memo: rule.action?.memo ?? undefined
    },
    createdAt: rule.createdAt instanceof Date ? rule.createdAt.toISOString() : String(rule.createdAt),
    updatedAt: rule.updatedAt instanceof Date ? rule.updatedAt.toISOString() : String(rule.updatedAt)
  });

const buildStatementArtifacts = (statement: any) => {
  const artifacts = statement.artifacts ?? {};
  if (!artifacts || Object.keys(artifacts).length === 0) {
    return undefined;
  }

  return {
    pageImagePaths: Array.isArray(artifacts.pageImagePaths)
      ? artifacts.pageImagePaths.map((value: unknown) => String(value))
      : [],
    ocrPath: artifacts.ocrPath ?? undefined,
    ocrTextPath: artifacts.ocrTextPath ?? undefined,
    transactionsTablePath: artifacts.transactionsTablePath ?? undefined,
    checksClearedTablePath: artifacts.checksClearedTablePath ?? undefined,
    transactionSectionsPath: artifacts.transactionSectionsPath ?? undefined,
    extractedChecksPath: artifacts.extractedChecksPath ?? undefined,
    classificationOutputPath: artifacts.classificationOutputPath ?? undefined,
    suggestionsOutputPath: artifacts.suggestionsOutputPath ?? undefined,
    processingSummaryPath: artifacts.processingSummaryPath ?? undefined,
    structuredStatementPath: artifacts.structuredStatementPath ?? undefined,
    offlineExtractionPath: artifacts.offlineExtractionPath ?? undefined,
    evidencePath: artifacts.evidencePath ?? undefined,
    validationReportPath: artifacts.validationReportPath ?? undefined,
    pdfLayoutPath: artifacts.pdfLayoutPath ?? undefined,
    geminiPath: artifacts.geminiPath ?? undefined,
    detectionEvidence: artifacts.detectionEvidence ?? undefined,
    detectedStatementMonth: artifacts.detectedStatementMonth ?? undefined,
    detectedStatementDate: artifacts.detectedStatementDate ?? undefined,
    autoAppliedStatementMonth: Boolean(artifacts.autoAppliedStatementMonth ?? false),
    stageTimestamps: {
      uploadedAt: artifacts.stageTimestamps?.uploadedAt ?? undefined,
      extractingAt: artifacts.stageTimestamps?.extractingAt ?? undefined,
      structuringAt: artifacts.stageTimestamps?.structuringAt ?? undefined,
      checksQueuedAt: artifacts.stageTimestamps?.checksQueuedAt ?? undefined,
      parserReviewAt: artifacts.stageTimestamps?.parserReviewAt ?? undefined,
      readyForReviewAt: artifacts.stageTimestamps?.readyForReviewAt ?? undefined,
      failedAt: artifacts.stageTimestamps?.failedAt ?? undefined
    }
  };
};

const buildCheckArtifacts = (check: any) => {
  const artifacts = check.artifacts ?? {};
  if (!artifacts || Object.keys(artifacts).length === 0) {
    const frontPath = check?.gcs?.frontPath ? String(check.gcs.frontPath) : '';
    if (!frontPath) return undefined;
    return {
      cropImagePath: frontPath,
      stageTimestamps: {}
    };
  }

  return {
    pageNumber: artifacts.pageNumber ?? undefined,
    cropBBox: Array.isArray(artifacts.cropBBox)
      ? artifacts.cropBBox.map((value: unknown) => Number(value))
      : undefined,
    cropImagePath: artifacts.cropImagePath ?? undefined,
    ocrTextPath: artifacts.ocrTextPath ?? undefined,
    ocrJsonPath: artifacts.ocrJsonPath ?? undefined,
    structuredPath: artifacts.structuredPath ?? check?.gcs?.structuredPath ?? undefined,
    geminiPath: artifacts.geminiPath ?? undefined,
    stageTimestamps: {
      queuedAt: artifacts.stageTimestamps?.queuedAt ?? undefined,
      processingAt: artifacts.stageTimestamps?.processingAt ?? undefined,
      processedAt: artifacts.stageTimestamps?.processedAt ?? undefined,
      failedAt: artifacts.stageTimestamps?.failedAt ?? undefined
    }
  };
};

const buildCheckProcessing = (check: any) => {
  const processing = check.processing ?? {};
  const lastError =
    processing.lastError ?? (Array.isArray(check.errors) && check.errors.length > 0 ? String(check.errors[0]) : undefined);

  return {
    retryCount: Number(processing.retryCount ?? 0),
    lastError,
    queuedAt: processing.queuedAt ?? undefined,
    processingAt: processing.processingAt ?? undefined,
    processedAt: processing.processedAt ?? undefined
  };
};

const buildCheckExtracted = (check: any) => {
  if (check.extracted) {
    return {
      checkNumber: check.extracted.checkNumber ?? undefined,
      date: check.extracted.date ?? undefined,
      payeeName: check.extracted.payeeName ?? undefined,
      amount: check.extracted.amount != null ? Number(check.extracted.amount) : undefined,
      memo: check.extracted.memo ?? undefined,
      source: check.extracted.source ?? undefined
    };
  }

  if (check.autoFill) {
    return {
      checkNumber: check.autoFill.checkNumber ?? undefined,
      date: check.autoFill.date ?? undefined,
      payeeName: check.autoFill.payeeName ?? undefined,
      amount: check.autoFill.amount != null ? Number(check.autoFill.amount) : undefined,
      memo: check.autoFill.memo ?? undefined,
      source: 'legacy' as const
    };
  }

  return undefined;
};

const buildCheckPayload = async (check: any, relatedTransaction?: any) => {
  const proposal = relatedTransaction?.proposal
    ? {
        qbTxnType: relatedTransaction.proposal.qbTxnType ?? undefined,
        bankAccountId: relatedTransaction.proposal.bankAccountId ?? undefined,
        categoryAccountId: relatedTransaction.proposal.categoryAccountId ?? undefined,
        payeeType: relatedTransaction.proposal.payeeType ?? undefined,
        payeeId: relatedTransaction.proposal.payeeId ?? undefined,
        payeeName: relatedTransaction.proposal.payeeName ?? undefined,
        transferTargetAccountId: relatedTransaction.proposal.transferTargetAccountId ?? undefined,
        memo: relatedTransaction.proposal.memo ?? undefined,
        confidence: Number(relatedTransaction.proposal.confidence ?? 0),
        reasons: Array.isArray(relatedTransaction.proposal.reasons)
          ? relatedTransaction.proposal.reasons.map((reason: unknown) => String(reason))
          : [],
        status: relatedTransaction.proposal.status ?? 'proposed',
        version: relatedTransaction.proposal.version ?? 'v1'
      }
    : undefined;
  const geminiPath =
    relatedTransaction?.evidence?.geminiPath ??
    check.artifacts?.geminiPath ??
    undefined;
  const ai = await readGeminiAiStatus(geminiPath);

  return {
  id: check._id.toString(),
  statementId: String(check.statementId),
  companyId: String(check.companyId),
  status: check.status,
  confidence: check.confidence
    ? {
      imageQuality: check.confidence.imageQuality,
      ocrConfidence: check.confidence.ocrConfidence,
      fieldConfidence: check.confidence.fieldConfidence,
      crossValidation: check.confidence.crossValidation,
      overall: Number(check.confidence.overall ?? 0)
    }
    : undefined,
  artifacts: buildCheckArtifacts(check),
  extracted: buildCheckExtracted(check),
  processing: buildCheckProcessing(check),
  autoFill: check.autoFill
    ? {
      checkNumber: check.autoFill.checkNumber ?? undefined,
      date: check.autoFill.date ?? undefined,
      payeeName: check.autoFill.payeeName ?? undefined,
      amount: check.autoFill.amount != null ? Number(check.autoFill.amount) : undefined,
      memo: check.autoFill.memo ?? undefined
    }
    : undefined,
  gcs: (() => {
    const gcs = check.gcs ?? { frontPath: '' };
    return {
      frontPath: String(gcs.frontPath ?? ''),
      backPath: gcs.backPath ?? undefined,
      ocrPath: gcs.ocrPath ?? undefined,
      structuredPath: gcs.structuredPath ?? undefined
    };
  })(),
  proposal,
  ai,
  match: check.match
    ? {
      statementTransactionId: check.match.statementTransactionId ?? undefined,
      matchConfidence: check.match.matchConfidence ?? undefined,
      reasons: Array.isArray(check.match.reasons) ? check.match.reasons.map((reason: unknown) => String(reason)) : []
    }
    : undefined,
  updatedAt: check.updatedAt instanceof Date ? check.updatedAt.toISOString() : String(check.updatedAt)
  };
};

const loadStatementTransactions = async (statementId: string, companyId: unknown) => {
  const txns = await StatementTransactionModel.find({
    statementId,
    companyId
  }).lean();

  const map = new Map<string, any>();
  for (const txn of txns) {
    map.set(String(txn._id), txn);
    if (txn.statementCheckId) {
      map.set(String(txn.statementCheckId), txn);
    }
  }
  return map;
};

const buildMonthCloseGates = async (statement: any) => {
  const statementId = statement._id.toString();
  const companyId = statement.companyId;
  const [transactions, checks] = await Promise.all([
    StatementTransactionModel.find({ statementId, companyId }).lean(),
    StatementCheckModel.find({ statementId, companyId }).lean()
  ]);

  const rowsReviewed =
    transactions.length > 0 &&
    transactions.every((txn: any) => ['approved', 'excluded'].includes(String(txn.reviewStatus ?? 'proposed')));
  const noBlockingExtractionFailures = String(statement.status) !== 'failed' && checks.every((c: any) => c.status !== 'failed');
  const noMandatoryUnknowns = transactions.every((txn: any) => String(txn.classification ?? 'unknown') !== 'unknown');
  const noPendingMandatorySuggestionDecisions = transactions.every((txn: any) =>
    ['approved', 'excluded'].includes(String(txn.proposal?.status ?? txn.reviewStatus ?? 'proposed'))
  );

  return {
    rowsReviewed,
    noBlockingExtractionFailures,
    noMandatoryUnknowns,
    noPendingMandatorySuggestionDecisions
  };
};

const toListItem = (statement: any) =>
  bankStatementListItemSchema.parse({
    id: statement._id.toString(),
    statementMonth: statement.statementMonth,
    fileName: statement.fileName,
    source: statement.source,
    status: statement.status,
    progress: buildStatementProgress(statement),
    confidence: undefined,
    issuesCount: Array.isArray(statement.issues) ? statement.issues.length : 0,
    updatedAt: statement.updatedAt instanceof Date ? statement.updatedAt.toISOString() : String(statement.updatedAt),
    createdAt: statement.createdAt instanceof Date ? statement.createdAt.toISOString() : String(statement.createdAt),
    bankAccountId: statement.bankAccountId ?? undefined
  });

const toDetailItem = async (statement: any) => {
  const checks = await StatementCheckModel.find({
    statementId: statement._id.toString(),
    companyId: statement.companyId
  })
    .sort({ createdAt: 1 })
    .limit(500)
    .lean();
  const transactionMap = await loadStatementTransactions(statement._id.toString(), statement.companyId);
  const checksPayload = await Promise.all(
    checks.map((check) =>
      buildCheckPayload(
        check,
        transactionMap.get(String(check.match?.statementTransactionId ?? check._id))
      )
    )
  );

  const monthCloseGates = await buildMonthCloseGates(statement);
  return bankStatementDetailSchema.parse({
    ...toListItem(statement),
    periodStart: statement.periodStart ?? undefined,
    periodEnd: statement.periodEnd ?? undefined,
    bankName: statement.bankName ?? undefined,
    accountLast4: statement.accountLast4 ?? undefined,
    gcs: {
      rootPrefix: statement.gcs?.rootPrefix,
      pdfPath: statement.gcs?.pdfPath
    },
    artifacts: buildStatementArtifacts(statement),
    validationReport: statement.validationReport ?? undefined,
    monthClose: {
      status: statement.monthClose?.status ?? 'open',
      completedAt: statement.monthClose?.completedAt ?? undefined,
      completedBy: statement.monthClose?.completedBy?.toString?.() ?? undefined,
      gates: monthCloseGates
    },
    checks: checksPayload,
    issues: Array.isArray(statement.issues)
      ? statement.issues.map((issue: unknown) => String(issue))
      : []
  });
};

const buildStatementSuggestions = async (statement: any) => {
  const firstNonBlank = (...values: Array<unknown>): string => {
    for (const value of values) {
      if (value == null) continue;
      const text = String(value).trim();
      if (text.length > 0) return text;
    }
    return '';
  };

  const mapTransferResolutionStatus = (args: {
    family?: string;
    proposedTxnType?: string;
    hint?: string;
    resolvedId?: string;
    isExternal?: boolean;
  }) => {
    const isTransfer = args.family === 'transfer' || args.proposedTxnType === 'Transfer';
    if (!isTransfer) return undefined;
    if (args.isExternal) return 'possible_external_transfer' as const;
    if (args.resolvedId) return 'matched_transfer_ready' as const;
    if (args.hint) return 'needs_internal_account_match' as const;
    return 'needs_review' as const;
  };

  const [transactions, checks] = await Promise.all([
    StatementTransactionModel.find({
      statementId: statement._id.toString(),
      companyId: statement.companyId
    })
      .sort({ postDate: 1, createdAt: 1 })
      .lean(),
    StatementCheckModel.find({
      statementId: statement._id.toString(),
      companyId: statement.companyId
    })
      .sort({ createdAt: 1 })
      .lean()
  ]);
  const transactionMap = await loadStatementTransactions(
    statement._id.toString(),
    statement.companyId
  );
  const clearedCheckKeys = new Set<string>();
  for (const check of checks) {
    const date = String(check.extracted?.date ?? check.autoFill?.date ?? '').trim();
    const amount = Number(check.extracted?.amount ?? check.autoFill?.amount ?? 0);
    if (date && Number.isFinite(amount)) {
      clearedCheckKeys.add(`${date}::${amount.toFixed(2)}`);
    }
  }
  const isDuplicateOfClearedCheck = (txn: any) => {
    if (txn.statementCheckId) return true;
    const rowType = String(txn.rowType ?? '');
    if (rowType !== 'check_cleared' && rowType !== 'electronic_debit') return false;
    const date = String(txn.postDate ?? '').trim();
    const amount = Number(txn.amount ?? 0);
    if (!date || !Number.isFinite(amount)) return false;
    return clearedCheckKeys.has(`${date}::${amount.toFixed(2)}`);
  };
  const bankAccounts = await ChartOfAccountModel.find({
    companyId: statement.companyId,
    type: 'asset'
  })
    .select('_id name qbAccountId code')
    .lean();
  const accountByMask = new Map<string, string>();
  for (const account of bankAccounts) {
    const text = `${account.name ?? ''} ${account.code ?? ''} ${account.qbAccountId ?? ''}`;
    const mask = parseMaskedAccountHint(text);
    if (mask && !accountByMask.has(mask)) {
      accountByMask.set(mask, String(account._id));
    }
  }
  const rules = await listStatementRules(String(statement._id), String(statement.companyId));
  const postingCandidateTransactions = transactions.filter((txn: any) => {
    if (txn.isPostingCandidate === false) return false;
    if (isDuplicateOfClearedCheck(txn)) return false;
    const rowType = String(txn.rowType ?? '');
    if (!rowType) return true;
    return (
      rowType === 'deposit' ||
      rowType === 'electronic_credit' ||
      rowType === 'other_credit' ||
      rowType === 'electronic_debit' ||
      rowType === 'check_cleared'
    );
  });
  const getPostingMappingWarnings = (proposal: {
    qbTxnType?: 'Expense' | 'Deposit' | 'Transfer' | 'Check' | 'SalesReceipt' | 'Payment';
    bankAccountId?: string;
    categoryAccountId?: string;
    payeeName?: string;
    payeeId?: string;
  }) => {
    const warnings: string[] = [];
    if (!proposal.qbTxnType) return warnings;
    if (
      (proposal.qbTxnType === 'Expense' ||
        proposal.qbTxnType === 'Deposit' ||
        proposal.qbTxnType === 'Check' ||
        proposal.qbTxnType === 'SalesReceipt' ||
        proposal.qbTxnType === 'Payment') &&
      !proposal.bankAccountId
    ) {
      warnings.push('Missing bank account mapping (Chart of Accounts) for QuickBooks posting');
    }
    if (
      (proposal.qbTxnType === 'Expense' || proposal.qbTxnType === 'Deposit' || proposal.qbTxnType === 'Check') &&
      !proposal.categoryAccountId
    ) {
      warnings.push('Missing category account mapping (Chart of Accounts) for QuickBooks posting');
    }
    if (
      (proposal.qbTxnType === 'Expense' ||
        proposal.qbTxnType === 'Deposit' ||
        proposal.qbTxnType === 'Check' ||
        proposal.qbTxnType === 'SalesReceipt') &&
      proposal.bankAccountId &&
      proposal.categoryAccountId &&
      proposal.bankAccountId === proposal.categoryAccountId
    ) {
      warnings.push('Bank account and line/category account must differ for QuickBooks posting');
    }
    if (proposal.qbTxnType === 'Payment' && !proposal.payeeName && !proposal.payeeId) {
      warnings.push('Customer payment requires a QuickBooks customer');
    }
    if (proposal.qbTxnType === 'SalesReceipt' && !proposal.payeeName && !proposal.payeeId) {
      warnings.push('Sales receipt requires a QuickBooks customer');
    }
    return warnings;
  };

  const items: any[] = [
    ...postingCandidateTransactions.map((txn: any) => {
      const direction = txn.type === 'credit' ? 'credit' as const : 'debit' as const;
      const ruleDescription = firstNonBlank(txn.description, txn.merchant);
      const matchedRules = evaluateStatementRules(rules, {
        source: 'transaction',
        description: ruleDescription,
        amount: Number(txn.amount ?? 0),
        direction,
        date: txn.postDate ?? undefined,
        payeeName: txn.proposal?.payeeName ?? txn.merchant ?? undefined
      });
      const hardRule = matchedRules.find((rule) => rule.hardness === 'hard');
      const softRule = matchedRules.find((rule) => rule.hardness === 'soft');
      const selectedRule = hardRule ?? softRule;
      const proposedTxnTypeFromRule =
        selectedRule?.action?.type === 'suggestTxnType' ? selectedRule.action.proposedTxnType : undefined;
      const bankAccountIdFromRule = selectedRule?.action?.bankAccountId;
      const categoryAccountIdFromRule = selectedRule?.action?.categoryAccountId;
      const payeeNameFromRule =
        selectedRule?.action?.type === 'suggestPayee' ? selectedRule.action.payeeName : undefined;
      const ruleReasons = matchedRules.map((rule) => `Matched ${rule.hardness} rule: ${rule.name}`);
      const statementBankId = String(statement.bankAccountId ?? '').trim();
      const resolvedProposal = {
        qbTxnType: proposedTxnTypeFromRule ?? txn.proposal?.qbTxnType ?? undefined,
        bankAccountId:
          bankAccountIdFromRule ??
          txn.proposal?.bankAccountId ??
          (statementBankId || undefined),
        categoryAccountId: categoryAccountIdFromRule ?? txn.proposal?.categoryAccountId ?? undefined
      };
      resolvedProposal.qbTxnType =
        resolvedProposal.qbTxnType ??
        inferDefaultQuickBooksTxnType({
          type: direction,
          section: txn.section,
          transactionFamily: txn.transactionFamily,
          rowType: txn.rowType,
          description: ruleDescription
        });
      const transferHint = parseMaskedAccountHint(String(txn.description ?? ''));
      const flowText = String(txn.description ?? '').toLowerCase();
      const directionRelativeToStatement =
        txn.transactionFamily === 'transfer' || resolvedProposal.qbTxnType === 'Transfer'
          ? flowText.includes('transfer from')
            ? ('inbound' as const)
            : ('outbound' as const)
          : undefined;
      const resolvedRelatedAccountId =
        txn.proposal?.transferTargetAccountId ?? (transferHint ? accountByMask.get(transferHint) : undefined);
      const transferResolutionStatus = mapTransferResolutionStatus({
        family: txn.transactionFamily,
        proposedTxnType: resolvedProposal.qbTxnType,
        hint: transferHint,
        resolvedId: resolvedRelatedAccountId,
        isExternal: /external transfer|outside account/.test(flowText)
      });

      const rowTypeLabel = txn.rowType ? String(txn.rowType).replace(/_/g, ' ') : '';
      const sectionLabel = txn.section ? String(txn.section).replace(/_/g, ' ') : '';
      const fallbackDescription =
        firstNonBlank(
          txn.description,
          txn.merchant,
          txn.proposal?.payeeName,
          txn.checkNumber ? `Check #${txn.checkNumber}` : '',
          rowTypeLabel,
          sectionLabel,
        ) || 'Statement transaction';

      return {
        id: String(txn._id),
        source: 'transaction' as const,
        date: txn.postDate ?? undefined,
        description: fallbackDescription,
        amount: Number(txn.amount ?? 0),
        direction,
        rowType: txn.rowType ?? undefined,
        section: txn.section ?? undefined,
        transactionFamily: txn.transactionFamily ?? undefined,
        directionRelativeToStatement,
        statementAccountMask: statement.accountLast4 ? `xxx${String(statement.accountLast4)}` : undefined,
        counterpartyBankHint: transferHint,
        resolvedRelatedAccountId: resolvedRelatedAccountId ? String(resolvedRelatedAccountId) : undefined,
        transferResolutionStatus,
        checkNumber: txn.checkNumber ?? undefined,
        sourcePage: txn.sourceLocator?.pageNumber ? Number(txn.sourceLocator.pageNumber) : undefined,
        sourceText: txn.sourceLocator?.sourceText ?? undefined,
        payeeName: payeeNameFromRule ?? txn.proposal?.payeeName ?? txn.merchant ?? undefined,
        proposedTxnType: resolvedProposal.qbTxnType,
        bankAccountId: resolvedProposal.bankAccountId,
        categoryAccountId: resolvedProposal.categoryAccountId,
        proposalConfidence:
          typeof txn.proposal?.confidence === 'number'
            ? Number(txn.proposal.confidence)
            : selectedRule
              ? selectedRule.hardness === 'hard'
                ? 0.95
                : 0.75
              : undefined,
        reviewStatus: txn.reviewStatus ?? undefined,
        postingStatus: txn.posting?.status ?? undefined,
        status: 'structured',
        reasons: [
          ...(Array.isArray(txn.proposal?.reasons)
            ? txn.proposal.reasons.map((reason: unknown) => String(reason))
            : []),
          ...ruleReasons,
          ...getPostingMappingWarnings(resolvedProposal),
          ...(transferResolutionStatus === 'needs_internal_account_match'
            ? [`No mapped destination/source account for ${transferHint ?? 'transfer counterpart'}`]
            : []),
          ...(transferResolutionStatus && transferResolutionStatus !== 'matched_transfer_ready'
            ? ['Resolve account to continue before QuickBooks posting']
            : [])
        ],
        linkedCheckId: txn.statementCheckId ? String(txn.statementCheckId) : undefined,
        matchedRuleIds: matchedRules.map((rule) => rule.id),
        matchedRuleNames: matchedRules.map((rule) => rule.name),
        ruleHardness: selectedRule?.hardness
      };
    }),
    ...checks.map((check: any) => {
      const relatedTxn =
        transactionMap.get(String(check.match?.statementTransactionId ?? '')) ??
        transactionMap.get(String(check._id));
      const txnProposal = relatedTxn?.proposal;
      const checkNumberLabel = firstNonBlank(
        check.extracted?.checkNumber,
        check.autoFill?.checkNumber,
      );
      const description =
        firstNonBlank(
          check.extracted?.payeeName,
          check.autoFill?.payeeName,
          txnProposal?.payeeName,
          check.extracted?.memo,
          check.autoFill?.memo,
        ) || `Check ${checkNumberLabel || String(check._id).slice(-6)}`;
      const matchedRules = evaluateStatementRules(rules, {
        source: 'check',
        description,
        amount: Number(check.extracted?.amount ?? check.autoFill?.amount ?? 0),
        direction: 'debit',
        date: check.extracted?.date ?? check.autoFill?.date ?? undefined,
        payeeName:
          check.extracted?.payeeName ??
          check.autoFill?.payeeName ??
          txnProposal?.payeeName ??
          undefined
      });
      const selectedRule = matchedRules.find((rule) => rule.hardness === 'hard') ?? matchedRules[0];
      const ruleReasons = matchedRules.map((rule) => `Matched ${rule.hardness} rule: ${rule.name}`);
      const statementBankId = String(statement.bankAccountId ?? '').trim();
      const resolvedProposal = {
        qbTxnType:
          (selectedRule?.action?.type === 'suggestTxnType' ? selectedRule.action.proposedTxnType : undefined) ??
          txnProposal?.qbTxnType ??
          undefined,
        bankAccountId:
          selectedRule?.action?.bankAccountId ??
          txnProposal?.bankAccountId ??
          (statementBankId || undefined),
        categoryAccountId:
          selectedRule?.action?.categoryAccountId ?? txnProposal?.categoryAccountId ?? undefined
      };
      resolvedProposal.qbTxnType =
        resolvedProposal.qbTxnType ??
        inferDefaultQuickBooksTxnType({
          type: 'debit',
          section: 'checks_cleared',
          transactionFamily: 'check',
          rowType: 'check_cleared',
          description
        });
      return {
        id: String(check._id),
        source: 'check' as const,
        date: check.extracted?.date ?? check.autoFill?.date ?? undefined,
        description,
        amount: Number(check.extracted?.amount ?? check.autoFill?.amount ?? 0),
        direction: 'debit' as const,
        rowType: 'check_cleared' as const,
        section: 'checks_cleared' as const,
        transactionFamily: 'check' as const,
        checkNumber: check.extracted?.checkNumber ?? check.autoFill?.checkNumber ?? undefined,
        sourcePage: check.artifacts?.pageNumber ?? undefined,
        sourceText: check.extracted?.memo ?? undefined,
        payeeName:
          (selectedRule?.action?.type === 'suggestPayee' ? selectedRule.action.payeeName : undefined) ??
          check.extracted?.payeeName ??
          check.autoFill?.payeeName ??
          txnProposal?.payeeName ??
          undefined,
        proposedTxnType: resolvedProposal.qbTxnType,
        bankAccountId: resolvedProposal.bankAccountId,
        categoryAccountId: resolvedProposal.categoryAccountId,
        proposalConfidence:
          selectedRule ? (selectedRule.hardness === 'hard' ? 0.95 : 0.75) : typeof check.confidence?.overall === 'number'
            ? Number(check.confidence.overall)
            : undefined,
        reviewStatus: undefined,
        postingStatus: undefined,
        status: String(check.status ?? 'queued'),
        reasons: [
          ...(Array.isArray(check.match?.reasons)
            ? check.match.reasons.map((reason: unknown) => String(reason))
            : []),
          ...ruleReasons,
          ...getPostingMappingWarnings(resolvedProposal)
        ],
        linkedCheckId: String(check._id),
        matchedRuleIds: matchedRules.map((rule) => rule.id),
        matchedRuleNames: matchedRules.map((rule) => rule.name),
        ruleHardness: selectedRule?.hardness
      };
    })
  ].sort((left, right) => {
    const leftDate = left.date ?? '';
    const rightDate = right.date ?? '';
    if (leftDate !== rightDate) return leftDate.localeCompare(rightDate);
    return left.description.localeCompare(right.description);
  });

  const summary = {
    totalItems: items.length,
    checks: items.filter((item) => item.source === 'check').length,
    deposits: items.filter((item) => item.proposedTxnType === 'Deposit').length,
    debits: items.filter((item) => item.direction === 'debit').length,
    credits: items.filter((item) => item.direction === 'credit').length,
    expenses: items.filter((item) => item.proposedTxnType === 'Expense').length,
    transfers: items.filter((item) => item.proposedTxnType === 'Transfer').length,
    checksSuggested: items.filter((item) => item.proposedTxnType === 'Check').length,
    uncategorized: items.filter((item) => !item.proposedTxnType).length,
    readyToPost: items.filter(
      (item) =>
        item.reviewStatus === 'approved' &&
        item.postingStatus !== 'posted' &&
        item.transferResolutionStatus !== 'needs_internal_account_match' &&
        item.transferResolutionStatus !== 'needs_chart_of_accounts_account' &&
        item.transferResolutionStatus !== 'needs_review'
    ).length,
    needsReview: items.filter(
      (item) =>
        item.reviewStatus !== 'approved' &&
        item.reviewStatus !== 'excluded' &&
        item.postingStatus !== 'posted'
    ).length,
    completed: items.filter((item) => item.postingStatus === 'posted').length,
    excluded: items.filter((item) => item.reviewStatus === 'excluded').length,
    unresolvedTransfers: items.filter(
      (item) =>
        item.transferResolutionStatus === 'needs_internal_account_match' ||
        item.transferResolutionStatus === 'needs_chart_of_accounts_account' ||
        item.transferResolutionStatus === 'needs_review'
    ).length
  };

  return statementSuggestionsResponseSchema.parse({
    statementId: statement._id.toString(),
    summary,
    items
  });
};

export const getUploadUrl = async (req: Request, res: Response) => {
  if (!req.companyId) return fail(res, 'Company onboarding required', 403);
  if (!env.gcsBucketName) return fail(res, 'GCS bucket is not configured', 500);
  const companyId = String(req.companyId);

  const parsed = requestStatementUploadUrlSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }

  const statementId = new Types.ObjectId().toString();
  const statementMonth = parsed.data.statementMonth ?? new Date().toISOString().slice(0, 7);
  const rootPrefix = buildStatementRootPrefix({
    companyId,
    statementMonth,
    statementId
  });
  const gcsPath = buildStatementPdfPath(rootPrefix);
  const expires = new Date(Date.now() + 15 * 60 * 1000);

  try {
    const [uploadUrl] = await storage.bucket(env.gcsBucketName).file(gcsPath).getSignedUrl({
      version: 'v4',
      action: 'write',
      expires,
      contentType: parsed.data.contentType
    });

    const payload = requestStatementUploadUrlResponseSchema.parse({
      uploadUrl,
      gcsPath,
      statementId,
      rootPrefix,
      expiresAt: expires.toISOString()
    });

    return ok(res, { ...payload, fileName: sanitizeFileName(parsed.data.fileName), statementMonth });
  } catch (error) {
    const failure = classifyUploadUrlFailure(error);
    // eslint-disable-next-line no-console
    console.error('[accounting.upload-url] failed', {
      bucketName: env.gcsBucketName,
      projectId: env.gcpProjectId ?? null,
      reason: failure.reason,
      hint: failure.hint,
      errorCode: failure.errorCode,
      errorMessage: failure.errorMessage,
      stack: error instanceof Error ? error.stack : undefined
    });
    const status =
      failure.reason === 'storage_signing_permission_denied'
        ? 502
        : failure.reason === 'storage_signing_not_configured'
          ? 500
          : 500;
    return fail(res, failure.clientMessage, status, { reason: failure.reason });
  }
};

export const detectStatementMonth = async (req: Request, res: Response) => {
  if (!req.file) return fail(res, 'PDF file is required', 400);

  const mime = req.file.mimetype?.toLowerCase() ?? '';
  const originalName = req.file.originalname?.toLowerCase() ?? '';
  const looksLikePdf = mime === 'application/pdf' || originalName.endsWith('.pdf');

  if (!looksLikePdf) {
    return fail(res, 'PDF file is required', 400);
  }

  try {
    const payload = detectStatementMonthResponseSchema.parse(
      detectStatementMonthFromPdf({
        pdfBuffer: req.file.buffer,
        fileName: req.file.originalname,
      })
    );
    return ok(res, payload);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[accounting.detect-statement-month] failed', error);
    return fail(res, 'Failed to inspect statement PDF', 500);
  }
};

export const playgroundOfflineExtraction = async (req: Request, res: Response) => {
  if (!req.file) return fail(res, 'PDF file is required', 400);

  const mime = req.file.mimetype?.toLowerCase() ?? '';
  const originalName = req.file.originalname?.toLowerCase() ?? '';
  const looksLikePdf = mime === 'application/pdf' || originalName.endsWith('.pdf');

  if (!looksLikePdf) {
    return fail(res, 'PDF file is required', 400);
  }

  const pdfBuffer = req.file.buffer;
  const cropDataUrls = new Map<string, string>();
  const reviewDataUrls = new Map<string, string>();
  let cropCounter = 0;

  try {
    const [pageCount, textItems, layoutPages] = await Promise.all([
      getPdfPageCount(pdfBuffer),
      extractPdfTextItemsFromBuffer(pdfBuffer),
      extractStatementPagesLayoutFromPdfBuffer(pdfBuffer).catch(() => [])
    ]);
    const lines = groupItemsIntoLines(textItems);
    const layoutSectionBounds = deriveSectionBoundsFromLayout(layoutPages);
    const layoutChecks = extractChecksClearedFromLayout(layoutPages, layoutSectionBounds);
    const checkRows = buildCheckRowsFromLayout(layoutChecks);
    const parsed = parseStatementLines({
      lines,
      checkRows
    });

    const extractedChecks = await extractChecks({
      pdfBuffer,
      lines,
      checkRows,
      persistCrop: async ({ checkNumber, imageBuffer, reviewBuffer }) => {
        cropCounter += 1;
        const cropKey = `memory://playground/${String(cropCounter).padStart(4, '0')}-${checkNumber}/tight.png`;
        const reviewKey = `memory://playground/${String(cropCounter).padStart(4, '0')}-${checkNumber}/review.png`;
        cropDataUrls.set(cropKey, bufferToDataUrl(imageBuffer));
        reviewDataUrls.set(reviewKey, bufferToDataUrl(reviewBuffer));
        return {
          imageCropPath: cropKey,
          reviewCropPath: reviewKey
        };
      }
    });

    const warnings = [...parsed.validation.warnings];
    if (extractedChecks.checkImages.length !== checkRows.length) {
      warnings.push(
        `Detected ${extractedChecks.checkImages.length} check image crop(s) for ${checkRows.length} checks-cleared row(s).`
      );
    }

    const captions = extractedChecks.checkImages
      .map((image) => image.caption)
      .filter((caption): caption is CheckCaption => Boolean(caption));

    const checkImages: PlaygroundExtractionImage[] = extractedChecks.checkImages.map((image) => ({
      ...image,
      imageDataUrl: cropDataUrls.get(image.imageCropPath) ?? '',
      reviewImageDataUrl: reviewDataUrls.get(image.reviewCropPath) ?? ''
    }));

    const matchedCheckNumbers = new Set(
      checkImages
        .map((image) => image.checkNumber)
        .filter((value): value is string => Boolean(value))
    );

    const unmatchedCheckRows = checkRows
      .filter((row) => !matchedCheckNumbers.has(row.checkNumber))
      .map((row) => row.checkNumber);

    const unmatchedCheckImages = checkImages
      .filter((image) => !image.checkNumber)
      .map((image, index) => `${image.page}-${index + 1}`);

    const matchedImages = checkImages.filter((image) => image.checkNumber && typeof image.amount === 'number');
    const matchedCheckImageTotal = sumTransactionAmounts(matchedImages);
    const checksTableTotal = roundMoney(parsed.validation.checkTotal);
    const totalsAnalysis: PlaygroundExtractionTotalsAnalysis = {
      checksTableCount: checkRows.length,
      detectedCheckImageCount: checkImages.length,
      matchedCheckImageCount: matchedImages.length,
      unmatchedCheckRows,
      unmatchedCheckImages,
      checksTableTotal,
      matchedCheckImageTotal,
      countsMatch: checkRows.length === checkImages.length,
      totalsMatch: Math.abs(checksTableTotal - matchedCheckImageTotal) < 0.01
    };

    const checkRowByNumber = new Map(
      checkRows
        .filter((row) => row.checkNumber)
        .map((row) => [String(row.checkNumber).trim(), row] as const)
    );
    const checkProcessResults: PlaygroundCheckProcessResult[] = await Promise.all(
      checkImages.map(async (image, index) => {
        const fallbackRow = image.checkNumber ? checkRowByNumber.get(String(image.checkNumber).trim()) : undefined;
        const cropBox = {
          left: image.imageBox.left,
          top: image.imageBox.top,
          right: image.imageBox.left + image.imageBox.width,
          bottom: image.imageBox.top + image.imageBox.height
        };
        const extraction = await runStatementCheckExtraction({
          pdfBuffer,
          pageNumber: image.page,
          cropBox,
          checkKey: `playground-check-${String(index + 1).padStart(3, '0')}`,
          pageContext: [fallbackRow?.rowText, image.caption?.text].filter(Boolean).join(' | '),
          fallback: {
            checkNumber: image.checkNumber ?? fallbackRow?.checkNumber ?? undefined,
            date: fallbackRow?.date ?? undefined,
            amount: image.amount ?? fallbackRow?.amount ?? undefined,
            memo: fallbackRow?.rowText ?? undefined,
            payeeName: undefined,
            source: 'deterministic'
          },
          persistArtifacts: false
        });

        const structuredFieldCount = [
          extraction.extracted.checkNumber,
          extraction.extracted.date,
          extraction.extracted.payeeName,
          typeof extraction.extracted.amount === 'number' ? extraction.extracted.amount : undefined,
          extraction.extracted.memo
        ].filter((value) => value != null && String(value).trim() !== '').length;
        const overallConfidence = Number(extraction.confidence.overall ?? 0);

        return {
          checkNumber: image.checkNumber ?? fallbackRow?.checkNumber ?? undefined,
          amount: image.amount ?? fallbackRow?.amount ?? undefined,
          page: image.page,
          cropBox: image.imageBox,
          status: overallConfidence >= 0.75 ? 'ready' : 'needs_review',
          ocrProvider: extraction.ocr.provider,
          extractionSource: extraction.extracted.source,
          extracted: {
            checkNumber: extraction.extracted.checkNumber ?? undefined,
            date: extraction.extracted.date ?? undefined,
            payeeName: extraction.extracted.payeeName ?? undefined,
            amount: extraction.extracted.amount ?? undefined,
            memo: extraction.extracted.memo ?? undefined
          },
          confidence: extraction.confidence,
          reasons: extraction.reasons,
          implementation: {
            cropRendered: extraction.crop.buffer.length > 0,
            ocrProduced: extraction.ocr.text.trim().length > 0,
            structuredFieldsPresent: structuredFieldCount >= 3,
            mirrorsCheckProcess: true
          }
        };
      })
    );
    const readyCheckCount = checkProcessResults.filter((result) => result.status === 'ready').length;
    const needsReviewCheckCount = checkProcessResults.length - readyCheckCount;
    const averageCheckConfidence = roundMoney(
      checkProcessResults.reduce((sum, result) => sum + Number(result.confidence.overall ?? 0), 0) /
        Math.max(checkProcessResults.length, 1)
    );
    const checkProcessSummary = {
      processedCheckCount: checkProcessResults.length,
      readyCheckCount,
      needsReviewCheckCount,
      averageConfidence: averageCheckConfidence,
      ocrProviders: {
        pdfText: checkProcessResults.filter((result) => result.ocrProvider === 'pdf_text').length,
        tesseract: checkProcessResults.filter((result) => result.ocrProvider === 'tesseract').length
      },
      mirrorsImplementation: checkProcessResults.every((result) => result.implementation.mirrorsCheckProcess)
    };

    const sectionSummary = Object.entries(parsed.validation.sectionCounts)
      .map(([section, count]) => ({
        section,
        count: Number(count ?? 0),
        total: roundMoney(parsed.validation.sectionTotals[section] ?? 0)
      }))
      .sort((left, right) => left.section.localeCompare(right.section));

    const pages: PlaygroundExtractionPage[] = extractedChecks.renderedPages.map((page) => {
      const pageImages = checkImages.filter((image) => image.page === page.pageNumber);
      const boxes: PlaygroundExtractionPageBox[] = pageImages.flatMap((image) => {
        const captionBox =
          image.caption != null ? scalePdfBoxToImageBox(image.caption.bbox, page.scale) : undefined;

        return [
          {
            kind: 'image' as const,
            label: image.checkNumber ? `#${image.checkNumber}` : 'Image',
            box: image.imageBox,
            status: image.alignment.status
          },
          {
            kind: 'review' as const,
            label: image.checkNumber ? `Review #${image.checkNumber}` : 'Review',
            box: image.reviewBox,
            status: image.alignment.status
          },
          ...(captionBox
            ? [
                {
                  kind: 'caption' as const,
                  label: image.caption?.text ?? 'Caption',
                  box: captionBox,
                  status: image.alignment.status
                }
              ]
            : [])
        ];
      });

      return {
        page: page.pageNumber,
        width: page.width,
        height: page.height,
        scale: page.scale,
        imageDataUrl: bufferToDataUrl(page.buffer),
        boxes
      };
    });

    const payload: PlaygroundExtractionResponse = {
      fileName: sanitizeFileName(req.file.originalname || 'statement.pdf'),
      pageCount,
      warnings,
      summary: {
        transactionCount: parsed.transactions.length,
        sectionCount: sectionSummary.length,
        checkRowCount: checkRows.length,
        detectedCheckImageCount: checkImages.length,
        matchedCheckImageCount: totalsAnalysis.matchedCheckImageCount,
        unmatchedCheckRowCount: totalsAnalysis.unmatchedCheckRows.length,
        unmatchedCheckImageCount: totalsAnalysis.unmatchedCheckImages.length,
        transactionTotal: sumTransactionAmounts(parsed.transactions),
        checksTableTotal: totalsAnalysis.checksTableTotal,
        matchedCheckImageTotal: totalsAnalysis.matchedCheckImageTotal,
        countsMatch: totalsAnalysis.countsMatch,
        totalsMatch: totalsAnalysis.totalsMatch,
        processedCheckCount: checkProcessSummary.processedCheckCount,
        readyCheckCount: checkProcessSummary.readyCheckCount,
        needsReviewCheckCount: checkProcessSummary.needsReviewCheckCount,
        averageCheckConfidence: checkProcessSummary.averageConfidence
      },
      checkProcessSummary,
      sectionSummary: sectionSummary.map((row) => ({
        section: formatSectionLabel(row.section),
        count: row.count,
        total: row.total
      })),
      totalsAnalysis,
      transactions: parsed.transactions,
      checks: parsed.checks,
      captions,
      checkImages,
      checkProcessResults,
      pages
    };

    return ok(res, payload);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[accounting.playground.offline-extraction] failed', error);
    return fail(res, 'Failed to run offline extraction playground test', 500);
  }
};

export const createStatement = async (req: Request, res: Response) => {
  if (!req.companyId) return fail(res, 'Company onboarding required', 403);
  if (!req.user?.id) return fail(res, 'Unauthorized', 401);
  if (!env.gcsBucketName) return fail(res, 'GCS bucket is not configured', 500);
  const companyId = String(req.companyId);

  const parsed = createBankStatementSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }

  if (!Types.ObjectId.isValid(parsed.data.statementId)) {
    return fail(res, 'Invalid statementId', 422);
  }

  const expectedRootPrefix = buildStatementRootPrefix({
    companyId,
    statementMonth: parsed.data.statementMonth,
    statementId: parsed.data.statementId
  });
  const expectedPdfPath = buildStatementPdfPath(expectedRootPrefix);

  if (env.debugVerboseApi) {
    // eslint-disable-next-line no-console
    console.info('[accounting.create-statement.env]', buildAccountingEnvSnapshot());
  }

  if (parsed.data.gcsPath !== expectedPdfPath) {
    return fail(res, 'gcsPath does not match expected company/statement structure', 422, {
      expectedPdfPath
    });
  }

  let statement: any = null;
  let reusedExistingStatement = false;
  const sanitizedFileName = sanitizeFileName(parsed.data.fileName);
  const uploadedProgress = {
    phase: 'uploaded',
    totalChecks: 0,
    checksQueued: 0,
    checksProcessing: 0,
    checksReady: 0,
    checksFailed: 0,
    completedChecks: 0,
    remainingChecks: 0
  };

  try {
    const existing = await BankStatement.findOne({
      _id: parsed.data.statementId,
      companyId
    });
    const normalizedBankAccountId = await resolveStatementBankAccountQbId(
      companyId,
      parsed.data.bankAccountId
    );

    // Replace prior upload for the same bank + month only (other banks keep their own statement).
    const monthConflictFilter: Record<string, unknown> = {
      companyId,
      statementMonth: parsed.data.statementMonth,
      _id: { $ne: parsed.data.statementId }
    };
    if (normalizedBankAccountId) {
      Object.assign(
        monthConflictFilter,
        await statementBankAccountIdFilter(companyId, normalizedBankAccountId)
      );
    } else {
      monthConflictFilter.$or = [
        { bankAccountId: { $exists: false } },
        { bankAccountId: null },
        { bankAccountId: '' }
      ];
    }
    const monthConflicts = await BankStatement.find(monthConflictFilter)
      .select('_id status')
      .lean();

    if (monthConflicts.length > 0) {
      await purgeStatementsFromMongo({
        companyId,
        statementIds: monthConflicts.map((entry) => String(entry._id))
      });
    }

    if (existing) {
      reusedExistingStatement = true;
      const samePayload =
        String(existing.statementMonth ?? '') === parsed.data.statementMonth &&
        String(existing.fileName ?? '') === sanitizedFileName &&
        String(existing.source ?? '') === parsed.data.source &&
        String(existing.gcs?.rootPrefix ?? '') === expectedRootPrefix &&
        String(existing.gcs?.pdfPath ?? '') === parsed.data.gcsPath;

      if (!samePayload) {
        return fail(res, 'Statement already exists with different metadata', 409);
      }

      if (!['uploaded', 'failed'].includes(String(existing.status ?? ''))) {
        return ok(res, { statement: toListItem(existing), queue: null });
      }

      statement = existing;
      statement.periodStart = parsed.data.periodStart;
      statement.periodEnd = parsed.data.periodEnd;
      if (normalizedBankAccountId) {
        statement.bankAccountId = normalizedBankAccountId;
      }
      statement.status = 'uploaded';
      statement.hash = undefined;
      statement.issues = [];
      statement.progress = uploadedProgress;
      statement.artifacts = {
        stageTimestamps: {
          uploadedAt:
            typeof existing.artifacts?.stageTimestamps?.uploadedAt === 'string'
              ? existing.artifacts.stageTimestamps.uploadedAt
              : nowIso()
        }
      };
      statement.monthClose = {
        status: 'open'
      };
      await statement.save();
    } else {
      statement = await BankStatement.create({
        _id: new Types.ObjectId(parsed.data.statementId),
        companyId,
        statementMonth: parsed.data.statementMonth,
        fileName: sanitizedFileName,
        source: parsed.data.source,
        status: 'uploaded',
        periodStart: parsed.data.periodStart,
        periodEnd: parsed.data.periodEnd,
        bankAccountId: normalizedBankAccountId,
        gcs: {
          rootPrefix: expectedRootPrefix,
          pdfPath: parsed.data.gcsPath
        },
        artifacts: {
          stageTimestamps: {
            uploadedAt: nowIso()
          }
        },
        progress: uploadedProgress,
        monthClose: {
          status: 'open'
        },
        hash: undefined,
        issues: [],
        createdBy: req.user.id
      });
    }

    const hash = await computeStatementHash(env.gcsBucketName, parsed.data.gcsPath);

    const duplicate = await BankStatement.findOne({
      companyId,
      hash,
      _id: { $ne: parsed.data.statementId }
    })
      .sort({ createdAt: -1 })
      .select('_id statementMonth fileName');

    statement.hash = hash;
    statement.issues = duplicate
      ? [`Potential duplicate of statement ${duplicate._id.toString()} (${duplicate.statementMonth} ${duplicate.fileName})`]
      : [];
    await statement.save();

    let queueMeta: Awaited<ReturnType<typeof enqueueAccountingJob>> | null = null;
    try {
      queueMeta = await enqueueAccountingJob({
        companyId,
        statementId: statement._id.toString(),
        jobType: 'statement.extract',
        meta: { requestedBy: req.user.id }
      });
      if (queueMeta.mode !== 'inline') {
        statement.status = 'extracting' as any;
        await statement.save();
      }
    } catch (enqueueError) {
      await persistStatementFailure({
        companyId,
        statementId: statement._id.toString(),
        message: `Queue dispatch failed: ${String((enqueueError as Error).message)}`
      });
      throw enqueueError;
    }

    const current = await BankStatement.findOne({ _id: statement._id, companyId: req.companyId });
    if (!current) {
      return fail(res, 'Failed to reload created statement', 500);
    }

    return ok(res, { statement: toListItem(current), queue: queueMeta }, reusedExistingStatement ? 200 : 201);
  } catch (error) {
    const failure = classifyCreateStatementFailure(error);
    const status =
      failure.reason === 'statement_pdf_missing'
        ? 409
        : failure.reason === 'statement_storage_access_denied' ||
            failure.reason === 'statement_queue_failed'
          ? 502
          : 500;
    if (statement) {
      await persistStatementFailure({
        companyId: String(companyId),
        statementId: statement._id.toString(),
        message: failure.clientMessage
      });
    }
    // eslint-disable-next-line no-console
    console.error('[accounting.create-statement] failed', {
      bucketName: env.gcsBucketName,
      reason: failure.reason,
      errorCode: failure.errorCode,
      errorMessage: failure.errorMessage,
      stack: error instanceof Error ? error.stack : undefined
    });
    return fail(res, failure.reason, status, {
      reason: failure.reason,
      clientMessage: failure.clientMessage
    });
  }
};

export const listStatements = async (req: Request, res: Response) => {
  if (!req.companyId) return fail(res, 'Company onboarding required', 403);

  const parsed = listBankStatementsQuerySchema.safeParse({
    month: typeof req.query.month === 'string' ? req.query.month : undefined,
    status: typeof req.query.status === 'string' ? req.query.status : undefined,
    bankAccountId:
      typeof req.query.bankAccountId === 'string' ? req.query.bankAccountId : undefined
  });
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }

  const filter: Record<string, unknown> = { companyId: req.companyId };
  if (parsed.data.month) {
    filter.statementMonth = parsed.data.month;
  }
  if (parsed.data.status) {
    filter.status = parsed.data.status;
  }
  if (parsed.data.bankAccountId) {
    Object.assign(filter, await statementBankAccountIdFilter(req.companyId, parsed.data.bankAccountId));
  }

  try {
    const statements = await BankStatement.find(filter).sort({ createdAt: -1 }).limit(200);
    return ok(res, {
      statements: statements.map(toListItem)
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[accounting.list-statements] failed', error);
    return fail(res, 'Failed to fetch statements', 500);
  }
};

export const listStatementMonths = async (req: Request, res: Response) => {
  if (!req.companyId) return fail(res, 'Company onboarding required', 403);

  const parsed = listStatementMonthsQuerySchema.safeParse({
    bankAccountId:
      typeof req.query.bankAccountId === 'string' ? req.query.bankAccountId : undefined
  });
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }

  const filter: Record<string, unknown> = { companyId: req.companyId };
  if (parsed.data.bankAccountId) {
    Object.assign(filter, await statementBankAccountIdFilter(req.companyId, parsed.data.bankAccountId));
  }

  const statements = await BankStatement.find(filter)
    .select('_id statementMonth status updatedAt createdAt monthClose bankAccountId')
    .sort({ statementMonth: -1, createdAt: -1 })
    .lean();

  const byMonth = new Map<
    string,
    {
      month: string;
      statementCount: number;
      latestStatementId: string;
      latestStatus: string;
      monthCloseStatus: string;
      updatedAt: string;
    }
  >();

  for (const statement of statements) {
    const month = String(statement.statementMonth ?? '');
    if (!month) continue;
    const monthCloseRaw = statement.monthClose as { status?: string } | undefined;
    const monthCloseStatus = String(monthCloseRaw?.status ?? 'open');
    if (!byMonth.has(month)) {
      byMonth.set(month, {
        month,
        statementCount: 1,
        latestStatementId: String(statement._id),
        latestStatus: String(statement.status ?? 'uploaded'),
        monthCloseStatus,
        updatedAt:
          statement.updatedAt instanceof Date
            ? statement.updatedAt.toISOString()
            : String(statement.updatedAt ?? new Date().toISOString())
      });
      continue;
    }

    const current = byMonth.get(month)!;
    current.statementCount += 1;
  }

  return ok(res, {
    months: Array.from(byMonth.values()).sort((a, b) => b.month.localeCompare(a.month))
  });
};

export const getStatementMonthSummary = async (req: Request, res: Response) => {
  if (!req.companyId) return fail(res, 'Company onboarding required', 403);
  const month = String(req.params.month ?? '');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return fail(res, 'Invalid month format, expected YYYY-MM', 422);
  }

  const statements = await BankStatement.find({ companyId: req.companyId, statementMonth: month })
    .sort({ createdAt: -1 })
    .lean();
  if (statements.length === 0) {
    return fail(res, 'Statement month not found', 404);
  }

  const statementIds = statements.map((statement) => String(statement._id));
  const [entryCount, unresolvedEntries, unknownEntries] = await Promise.all([
    StatementTransactionModel.countDocuments({
      companyId: req.companyId,
      statementId: { $in: statementIds }
    }),
    StatementTransactionModel.countDocuments({
      companyId: req.companyId,
      statementId: { $in: statementIds },
      reviewStatus: { $nin: ['approved', 'excluded'] }
    }),
    StatementTransactionModel.countDocuments({
      companyId: req.companyId,
      statementId: { $in: statementIds },
      classification: 'unknown'
    })
  ]);

  const latest = statements[0];
  return ok(res, {
    month,
    latestStatementId: String(latest._id),
    latestStatus: String(latest.status ?? 'uploaded'),
    statementCount: statements.length,
    entryCount,
    unresolvedEntries,
    unknownEntries,
    monthCloseStatus: String(latest.monthClose?.status ?? 'open')
  });
};

export const getStatementById = async (req: Request, res: Response) => {
  if (!req.companyId) return fail(res, 'Company onboarding required', 403);

  try {
    const statement = await BankStatement.findOne({ _id: req.params.id, companyId: req.companyId });
    if (!statement) {
      return fail(res, 'Statement not found', 404);
    }
    return ok(res, await toDetailItem(statement));
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[accounting.get-statement] failed', error);
    return fail(res, 'Failed to load statement', 500);
  }
};

export const assignStatementBankAccount = async (req: Request, res: Response) => {
  if (!req.companyId) return fail(res, 'Company onboarding required', 403);

  const parsed = assignStatementBankAccountSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }

  try {
    const statement = await BankStatement.findOne({ _id: req.params.id, companyId: req.companyId });
    if (!statement) {
      return fail(res, 'Statement not found', 404);
    }

    const ref = parsed.data.bankAccountId.trim();
    const accountQuery: Record<string, unknown> = { companyId: req.companyId };
    if (Types.ObjectId.isValid(ref)) {
      accountQuery._id = new Types.ObjectId(ref);
    } else {
      accountQuery.qbAccountId = ref;
    }

    const account = await ChartOfAccountModel.findOne(accountQuery).select('qbAccountId type').lean();
    const qbAccountId = account?.qbAccountId?.trim();
    if (!qbAccountId) {
      return fail(
        res,
        'QuickBooks bank account not found. Assign a bank chart account created in QuickBooks (Statements page → Create account).',
        404
      );
    }

    const existingBank = String(statement.bankAccountId ?? '').trim();
    if (existingBank && existingBank !== qbAccountId) {
      return fail(
        res,
        'This statement is already linked to a different bank account and cannot be reassigned.',
        409
      );
    }

    statement.bankAccountId = qbAccountId;
    await statement.save();
    return ok(res, { statement: toListItem(statement) });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[accounting.assign-statement-bank-account] failed', error);
    return fail(res, 'Failed to assign statement bank account', 500);
  }
};

export const getStatementStatus = async (req: Request, res: Response) => {
  if (!req.companyId) return fail(res, 'Company onboarding required', 403);

  try {
    const statement = await BankStatement.findOne({ _id: req.params.id, companyId: req.companyId });
    if (!statement) {
      return fail(res, 'Statement not found', 404);
    }

    const checks = await StatementCheckModel.find({
      statementId: statement._id.toString(),
      companyId: req.companyId
    })
      .sort({ createdAt: 1 })
      .limit(200)
      .lean();
    const liveMetrics = await buildStatementLiveMetrics(statement._id.toString(), req.companyId);

    const payload = bankStatementStatusResponseSchema.parse({
      statementId: statement._id.toString(),
      status: statement.status,
      progress: buildStatementProgress(statement),
      liveMetrics,
      gcs: {
        rootPrefix: String(statement.gcs?.rootPrefix ?? ''),
        pdfPath: String(statement.gcs?.pdfPath ?? '')
      },
      artifacts: buildStatementArtifacts(statement),
      validationReport: statement.validationReport ?? undefined,
      checkImagePreview: checks.map((check: any) => ({
        id: String(check._id),
        status: String(check.status ?? 'queued'),
        pageNumber:
          check.artifacts?.pageNumber != null
            ? Number(check.artifacts.pageNumber)
            : undefined,
        cropImagePath: check.artifacts?.cropImagePath ?? undefined,
        frontPath: check.gcs?.frontPath ?? undefined
      })),
      updatedAt: statement.updatedAt instanceof Date ? statement.updatedAt.toISOString() : String(statement.updatedAt),
      issues: Array.isArray(statement.issues)
        ? statement.issues.map((issue: unknown) => String(issue))
        : []
    });

    return ok(res, payload);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[accounting.get-statement-status] failed', error);
    return fail(res, 'Failed to load statement status', 500);
  }
};

export const getStatementSuggestions = async (req: Request, res: Response) => {
  if (!req.companyId) return fail(res, 'Company onboarding required', 403);

  try {
    const statement = await BankStatement.findOne({ _id: req.params.id, companyId: req.companyId });
    if (!statement) {
      return fail(res, 'Statement not found', 404);
    }

    return ok(res, await buildStatementSuggestions(statement));
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[accounting.get-statement-suggestions] failed', error);
    return fail(res, 'Failed to load statement suggestions', 500);
  }
};

export const listRulesForStatement = async (req: Request, res: Response) => {
  if (!req.companyId) return fail(res, 'Company onboarding required', 403);
  try {
    const statement = await BankStatement.findOne({ _id: req.params.id, companyId: req.companyId });
    if (!statement) return fail(res, 'Statement not found', 404);
    const rules = await listStatementRules(String(statement._id), String(req.companyId));
    return ok(res, {
      statementId: String(statement._id),
      rules: rules.map(serializeStatementRule)
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[accounting.list-statement-rules] failed', error);
    return fail(res, 'Failed to list statement rules', 500);
  }
};

export const createRuleForStatement = async (req: Request, res: Response) => {
  if (!req.companyId) return fail(res, 'Company onboarding required', 403);
  const parsed = createStatementRuleSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 'Validation failed', 422, parsed.error.flatten());
  try {
    const statement = await BankStatement.findOne({ _id: req.params.id, companyId: req.companyId });
    if (!statement) return fail(res, 'Statement not found', 404);

    const created = await StatementRuleModel.create({
      statementId: String(statement._id),
      companyId: req.companyId,
      name: parsed.data.name,
      enabled: parsed.data.enabled,
      hardness: parsed.data.hardness,
      conditions: parsed.data.conditions,
      action: parsed.data.action
    });

    return ok(res, {
      rule: serializeStatementRule(created)
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[accounting.create-statement-rule] failed', error);
    return fail(res, 'Failed to create statement rule', 500);
  }
};

export const updateRuleForStatement = async (req: Request, res: Response) => {
  if (!req.companyId) return fail(res, 'Company onboarding required', 403);
  const parsed = updateStatementRuleSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 'Validation failed', 422, parsed.error.flatten());
  try {
    const statement = await BankStatement.findOne({ _id: req.params.id, companyId: req.companyId });
    if (!statement) return fail(res, 'Statement not found', 404);

    const rule = await StatementRuleModel.findOne({
      _id: req.params.ruleId,
      statementId: String(statement._id),
      companyId: req.companyId
    });
    if (!rule) return fail(res, 'Rule not found', 404);

    if (parsed.data.name !== undefined) rule.name = parsed.data.name;
    if (parsed.data.enabled !== undefined) rule.enabled = parsed.data.enabled;
    if (parsed.data.hardness !== undefined) rule.hardness = parsed.data.hardness;
    if (parsed.data.conditions !== undefined) rule.conditions = parsed.data.conditions as any;
    if (parsed.data.action !== undefined) rule.action = parsed.data.action as any;
    await rule.save();

    return ok(res, { rule: serializeStatementRule(rule) });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[accounting.update-statement-rule] failed', error);
    return fail(res, 'Failed to update statement rule', 500);
  }
};

export const createRuleFromStatementTransaction = async (req: Request, res: Response) => {
  if (!req.companyId) return fail(res, 'Company onboarding required', 403);
  try {
    const statement = await BankStatement.findOne({ _id: req.params.id, companyId: req.companyId });
    if (!statement) return fail(res, 'Statement not found', 404);
    const transaction = await StatementTransactionModel.findOne({
      _id: req.params.transactionId,
      statementId: String(statement._id),
      companyId: req.companyId
    });
    if (!transaction) return fail(res, 'Statement transaction not found', 404);

    const hardness = req.body?.hardness === 'hard' ? 'hard' : 'soft';
    const contains = String(transaction.merchant ?? transaction.description ?? '').slice(0, 120);
    const created = await StatementRuleModel.create({
      statementId: String(statement._id),
      companyId: req.companyId,
      name: `${hardness === 'hard' ? 'Hard' : 'Soft'} rule: ${contains || 'transaction'}`,
      enabled: true,
      hardness,
      conditions: {
        contains,
        direction: transaction.type
      },
      action: {
        type: 'suggestTxnType',
        proposedTxnType:
          transaction.proposal?.qbTxnType ??
          inferDefaultQuickBooksTxnType({
            type: transaction.type as 'debit' | 'credit',
            section: transaction.section ?? undefined,
            transactionFamily: transaction.transactionFamily ?? undefined,
            rowType: transaction.rowType ?? undefined,
            description: String(transaction.description ?? transaction.merchant ?? '')
          }),
        bankAccountId: transaction.proposal?.bankAccountId ?? undefined,
        payeeName: transaction.proposal?.payeeName ?? undefined,
        categoryAccountId: transaction.proposal?.categoryAccountId ?? undefined,
        memo: transaction.proposal?.memo ?? undefined
      }
    });

    return ok(res, { rule: serializeStatementRule(created) });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[accounting.create-statement-rule-from-transaction] failed', error);
    return fail(res, 'Failed to create statement rule from transaction', 500);
  }
};

export const listStatementEntries = async (req: Request, res: Response) => {
  if (!req.companyId) return fail(res, 'Company onboarding required', 403);
  const statement = await BankStatement.findOne({ _id: req.params.id, companyId: req.companyId });
  if (!statement) return fail(res, 'Statement not found', 404);

  const entries = await StatementTransactionModel.find({
    statementId: req.params.id,
    companyId: req.companyId
  })
    .sort({ postDate: 1, createdAt: 1 })
    .lean();

  return ok(res, {
    statementId: req.params.id,
    entries
  });
};

export const updateStatementEntryReview = async (req: Request, res: Response) => {
  if (!req.companyId) return fail(res, 'Company onboarding required', 403);
  const parsed = updateStatementEntryReviewSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 'Validation failed', 422, parsed.error.flatten());

  const statement = await BankStatement.findOne({ _id: req.params.id, companyId: req.companyId });
  if (!statement) return fail(res, 'Statement not found', 404);

  const entry = await StatementTransactionModel.findOne({
    _id: req.params.entryId,
    statementId: req.params.id,
    companyId: req.companyId
  });
  if (!entry) return fail(res, 'Statement entry not found', 404);

  entry.reviewStatus = parsed.data.reviewStatus as any;
  entry.proposal = {
    ...(entry.proposal ?? {}),
    status: parsed.data.reviewStatus
  } as any;
  await entry.save();

  return ok(res, { entryId: entry._id.toString(), reviewStatus: entry.reviewStatus });
};

export const updateStatementSuggestionReview = async (req: Request, res: Response) => {
  if (!req.companyId) return fail(res, 'Company onboarding required', 403);
  const parsed = updateStatementSuggestionReviewSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 'Validation failed', 422, parsed.error.flatten());

  const statement = await BankStatement.findOne({ _id: req.params.id, companyId: req.companyId });
  if (!statement) return fail(res, 'Statement not found', 404);

  let entry: HydratedDocument<StatementTransactionDoc> | null = null;
  if (parsed.data.source === 'transaction') {
    entry = await StatementTransactionModel.findOne({
      _id: req.params.suggestionId,
      statementId: req.params.id,
      companyId: req.companyId
    });
    if (!entry) return fail(res, 'Suggestion not found', 404);
  } else {
    const resolved = await resolveStatementEntryForCheckSuggestion({
      companyId: String(req.companyId),
      statementId: String(req.params.id),
      checkId: String(req.params.suggestionId),
      statement: {
        bankAccountId: statement.bankAccountId,
        gcs: { pdfPath: statement.gcs?.pdfPath }
      }
    });
    if (!resolved.ok) {
      return fail(res, resolved.error, resolved.status, resolved.details);
    }
    entry = resolved.entry;
  }

  const proposalPatch = parsed.data.proposal;
  const reviewStatus = parsed.data.reviewStatus;

  const mergedProposal = mergeStatementProposal(entry.proposal ?? {}, {
    ...(proposalPatch ?? {}),
    status: reviewStatus
  }) as any;

  const statementBankId = String(statement.bankAccountId ?? '').trim();
  if (
    !mergedProposal.bankAccountId?.trim() &&
    statementBankId &&
    ['Expense', 'Deposit', 'Check', 'SalesReceipt', 'Payment', 'Transfer'].includes(
      String(mergedProposal.qbTxnType ?? '')
    )
  ) {
    mergedProposal.bankAccountId = statementBankId;
  }

  if (
    (mergedProposal.qbTxnType === 'Expense' ||
      mergedProposal.qbTxnType === 'Deposit' ||
      mergedProposal.qbTxnType === 'Check' ||
      mergedProposal.qbTxnType === 'SalesReceipt') &&
    mergedProposal.bankAccountId &&
    mergedProposal.categoryAccountId &&
    mergedProposal.bankAccountId === mergedProposal.categoryAccountId
  ) {
    return fail(res, 'Bank account and line/category account must differ for QuickBooks posting', 422);
  }

  if (mergedProposal.qbTxnType === 'Expense' || mergedProposal.qbTxnType === 'Check') {
    if (!mergedProposal.bankAccountId?.trim()) {
      return fail(res, 'Expense requires a bank account (paid from)', 422);
    }
    if (!mergedProposal.categoryAccountId?.trim()) {
      return fail(res, 'Expense requires an expense category account', 422);
    }
  }

  if (mergedProposal.qbTxnType === 'Deposit') {
    if (!mergedProposal.bankAccountId?.trim()) {
      return fail(res, 'Deposit requires a bank account (deposit to)', 422);
    }
    if (!mergedProposal.categoryAccountId?.trim()) {
      return fail(res, 'Deposit requires a deposit line account', 422);
    }
  }

  if (mergedProposal.qbTxnType === 'SalesReceipt') {
    if (!mergedProposal.bankAccountId?.trim()) {
      return fail(res, 'Sales receipt requires a deposit bank account', 422);
    }
    if (!mergedProposal.payeeId && !mergedProposal.payeeName) {
      return fail(res, 'Sales receipt requires a QuickBooks customer', 422);
    }
    if (!mergedProposal.salesItemRefId?.trim()) {
      return fail(res, 'Sales receipt requires a QuickBooks product or service item', 422);
    }
  }

  if (
    mergedProposal.qbTxnType === 'Payment' &&
    !mergedProposal.payeeId &&
    !mergedProposal.payeeName
  ) {
    return fail(res, 'Customer payment requires a customer or payer', 422);
  }

  if (
    mergedProposal.qbTxnType === 'Transfer' &&
    mergedProposal.bankAccountId &&
    mergedProposal.transferTargetAccountId &&
    mergedProposal.bankAccountId === mergedProposal.transferTargetAccountId
  ) {
    return fail(res, 'Transfer from and to accounts must differ', 422);
  }

  entry.proposal = mergedProposal;
  entry.reviewStatus = reviewStatus as any;
  await entry.save();

  await LedgerEntryModel.updateMany(
    {
      companyId: req.companyId,
      statementId: req.params.id,
      statementTransactionId: entry._id.toString()
    },
    {
      $set: {
        proposal: mergedProposal,
        reviewStatus: reviewStatus as any
      }
    }
  );

  let quickbooks: Record<string, unknown> | undefined;
  const shouldPost =
    reviewStatus === 'approved' && parsed.data.postToQuickBooks !== false;
  if (shouldPost) {
    const postResult = await postApprovedLedgerEntryByStatementTransactionId(
      String(req.companyId),
      entry._id.toString()
    );
    if (postResult.ok) {
      quickbooks = {
        posted: true,
        qbTxnId: postResult.qbTxnId,
        qbTxnType: postResult.qbTxnType,
        matchedExisting: postResult.matchedExisting ?? false,
        registerSummary: postResult.registerSummary,
        previewLines: postResult.previewLines
      };
    } else {
      quickbooks = {
        posted: false,
        error: postResult.error,
        previewLines: []
      };
      return fail(res, postResult.error, 422, { quickbooks });
    }
  }

  return ok(res, {
    suggestionId: req.params.suggestionId,
    source: parsed.data.source,
    reviewStatus,
    proposal: mergedProposal,
    quickbooks
  });
};

export const resolveTransferSuggestion = async (req: Request, res: Response) => {
  if (!req.companyId) return fail(res, 'Company onboarding required', 403);
  const parsed = resolveTransferSuggestionSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 'Validation failed', 422, parsed.error.flatten());

  const statement = await BankStatement.findOne({ _id: req.params.id, companyId: req.companyId });
  if (!statement) return fail(res, 'Statement not found', 404);

  const entry = await StatementTransactionModel.findOne({
    _id: req.params.suggestionId,
    statementId: req.params.id,
    companyId: req.companyId
  });
  if (!entry) return fail(res, 'Transfer suggestion not found', 404);

  const isTransfer = entry.transactionFamily === 'transfer' || entry.proposal?.qbTxnType === 'Transfer';
  if (!isTransfer) return fail(res, 'Suggestion is not a transfer candidate', 409);

  const hint = parseMaskedAccountHint(String(entry.description ?? ''));
  const accounts = await ChartOfAccountModel.find({
    companyId: req.companyId,
    type: 'asset'
  })
    .select('_id name code qbAccountId')
    .lean();
  const candidates = accounts.filter((account) => {
    if (!hint) return false;
    const text = `${account.name ?? ''} ${account.code ?? ''} ${account.qbAccountId ?? ''}`.toLowerCase();
    return text.includes(hint.slice(-4).toLowerCase());
  });

  if (parsed.data.action === 'mark_external') {
    entry.proposal = {
      ...(entry.proposal ?? {}),
      qbTxnType: 'Transfer',
      transferTargetAccountId: undefined,
      memo: [entry.proposal?.memo, 'External transfer (unmapped)'].filter(Boolean).join(' | ')
    } as any;
    await entry.save();
    return ok(res, {
      suggestionId: String(entry._id),
      transferResolutionStatus: 'possible_external_transfer'
    });
  }

  if (parsed.data.action === 'create_coa_account') {
    const accountName = parsed.data.accountName ?? `Bank ${hint ?? String(entry._id).slice(-4)}`;
    const created = await createQuickBooksHubChartAccount({
      companyId: String(req.companyId),
      name: accountName,
      detailType: parsed.data.detailType ?? 'Checking'
    });
    entry.proposal = {
      ...(entry.proposal ?? {}),
      qbTxnType: 'Transfer',
      transferTargetAccountId: created.id
    } as any;
    await entry.save();
    return ok(res, {
      suggestionId: String(entry._id),
      relatedAccountId: created.id,
      transferResolutionStatus: 'matched_transfer_ready'
    });
  }

  const selectedAccountId = parsed.data.relatedAccountId;
  let resolvedId = selectedAccountId;
  if (!resolvedId) {
    if (candidates.length === 1) {
      resolvedId = String(candidates[0]._id);
    } else if (candidates.length > 1) {
      return fail(res, 'Multiple account matches found; select one', 409, {
        candidates: candidates.map((account) => ({
          id: String(account._id),
          name: String(account.name ?? '')
        }))
      });
    } else {
      return fail(res, `No mapped destination/source account for ${hint ?? 'transfer account'}`, 409, {
        transferResolutionStatus: 'needs_internal_account_match'
      });
    }
  }

  entry.proposal = {
    ...(entry.proposal ?? {}),
    qbTxnType: 'Transfer',
    transferTargetAccountId: resolvedId
  } as any;
  await entry.save();
  return ok(res, {
    suggestionId: String(entry._id),
    relatedAccountId: resolvedId,
    transferResolutionStatus: 'matched_transfer_ready'
  });
};

export const completeStatementMonth = async (req: Request, res: Response) => {
  if (!req.companyId) return fail(res, 'Company onboarding required', 403);
  if (!req.user?.id) return fail(res, 'Unauthorized', 401);
  const statement = await BankStatement.findOne({ _id: req.params.id, companyId: req.companyId });
  if (!statement) return fail(res, 'Statement not found', 404);

  const gates = await buildMonthCloseGates(statement);
  const canComplete = Object.values(gates).every(Boolean);
  if (!canComplete) {
    return fail(res, 'Month-close gates are not satisfied', 409, { gates });
  }

  statement.monthClose = {
    ...(statement.monthClose ?? {}),
    status: 'completed',
    completedAt: nowIso(),
    completedBy: Types.ObjectId.isValid(String(req.user.id)) ? new Types.ObjectId(String(req.user.id)) : undefined,
    gates
  };
  await statement.save();

  return ok(res, {
    statementId: statement._id.toString(),
    monthClose: {
      status: statement.monthClose.status,
      completedAt: statement.monthClose.completedAt,
      completedBy: String(statement.monthClose.completedBy ?? req.user.id),
      gates
    }
  });
};

export const getStatementChecks = async (req: Request, res: Response) => {
  if (!req.companyId) return fail(res, 'Company onboarding required', 403);

  const parsed = listChecksQuerySchema.safeParse({
    status: typeof req.query.status === 'string' ? req.query.status : undefined
  });
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }

  const statement = await BankStatement.findOne({ _id: req.params.id, companyId: req.companyId });
  if (!statement) {
    return fail(res, 'Statement not found', 404);
  }

  const filter: Record<string, unknown> = {
    companyId: req.companyId,
    statementId: req.params.id
  };
  if (parsed.data.status) {
    filter.status = parsed.data.status;
  }

  const checks = await StatementCheckModel.find(filter).sort({ createdAt: 1 }).limit(500);
  const transactionMap = await loadStatementTransactions(String(req.params.id), String(req.companyId));
  const checksPayload = await Promise.all(
    checks.map((check) =>
      buildCheckPayload(
        check,
        transactionMap.get(String(check.match?.statementTransactionId ?? check._id))
      )
    )
  );
  return ok(res, {
    checks: checksPayload
  });
};

export const getStatementArtifact = async (req: Request, res: Response) => {
  if (!req.companyId) return fail(res, 'Company onboarding required', 403);
  if (!env.gcsBucketName) return fail(res, 'GCS bucket is not configured', 500);

  const statement = await BankStatement.findOne({ _id: req.params.id, companyId: req.companyId });
  if (!statement) {
    return fail(res, 'Statement not found', 404);
  }

  const objectPath = typeof req.query.path === 'string' ? req.query.path.trim() : '';
  if (!objectPath) {
    return fail(res, 'Artifact path is required', 422);
  }

  const rootPrefix = String(statement.gcs?.rootPrefix ?? '');
  const pdfPath = String(statement.gcs?.pdfPath ?? '');
  if (!rootPrefix || !pdfPath) {
    return fail(res, 'Statement storage metadata is incomplete', 409);
  }

  if (!isStatementScopedArtifactPath(rootPrefix, objectPath, pdfPath)) {
    return fail(res, 'Artifact path is outside this statement scope', 403);
  }

  try {
    const [buffer] = await storage.bucket(env.gcsBucketName).file(objectPath).download();
    const fileName = path.basename(objectPath);

    res.setHeader('Content-Type', inferArtifactContentType(objectPath));
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    return res.status(200).send(buffer);
  } catch (error) {
    const failure = classifyCreateStatementFailure(error);
    const status =
      failure.reason === 'statement_pdf_missing'
        ? 404
        : failure.reason === 'statement_storage_access_denied'
          ? 502
          : 500;
    return fail(res, failure.clientMessage, status, {
      reason: failure.reason,
      clientMessage: failure.clientMessage
    });
  }
};

export const deleteStatement = async (req: Request, res: Response) => {
  if (!req.companyId) return fail(res, 'Company onboarding required', 403);

  try {
    const statement = await BankStatement.findOne({ _id: req.params.id, companyId: req.companyId });
    if (!statement) {
      return fail(res, 'Statement not found', 404);
    }

    const rootPrefix = String(statement.gcs?.rootPrefix ?? '');
    await purgeStatementRelatedRecords({
      companyId: String(req.companyId),
      statementId: statement._id.toString()
    });
    await BankStatement.deleteOne({ _id: statement._id, companyId: req.companyId });

    if (env.gcsBucketName && rootPrefix) {
      await purgeStatementStorage(env.gcsBucketName, rootPrefix);
    }

    return ok(res, {
      statementId: statement._id.toString(),
      deleted: true
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[accounting.delete-statement] failed', error);
    return fail(res, 'Failed to delete statement', 500);
  }
};

export const reprocessStatement = async (req: Request, res: Response) => {
  if (!req.companyId) return fail(res, 'Company onboarding required', 403);
  if (!req.user?.id) return fail(res, 'Unauthorized', 401);
  const companyId = String(req.companyId);

  const parsed = reprocessBankStatementSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }

  try {
    const statement = await BankStatement.findOne({ _id: req.params.id, companyId });
    if (!statement) {
      return fail(res, 'Statement not found', 404);
    }

    await purgeStatementRelatedRecords({
      companyId,
      statementId: statement._id.toString()
    });

    statement.status = 'uploaded' as any;
    statement.progress = {
      phase: 'uploaded',
      totalChecks: 0,
      checksQueued: 0,
      checksProcessing: 0,
      checksReady: 0,
      checksFailed: 0,
      completedChecks: 0,
      remainingChecks: 0
    } as any;
    statement.artifacts = {
      stageTimestamps: {
        uploadedAt: nowIso()
      }
    } as any;
    statement.monthClose = {
      status: 'open'
    } as any;
    statement.issues = [] as any;
    statement.hash = undefined;
    await statement.save();

    const queue = await enqueueAccountingJob({
      companyId,
      statementId: statement._id.toString(),
      jobType: parsed.data.fromJobType,
      meta: { requestedBy: req.user.id, reason: 'manual-reprocess' }
    });

    if (queue.mode !== 'inline') {
      statement.status = 'extracting' as any;
      await statement.save();
    }

    const refreshed = await BankStatement.findOne({ _id: req.params.id, companyId });
    if (!refreshed) {
      return fail(res, 'Statement not found after reprocess', 404);
    }
    return ok(res, { statement: toListItem(refreshed), queue });
  } catch (error) {
    const failure = classifyCreateStatementFailure(error);
    // eslint-disable-next-line no-console
    console.error('[accounting.reprocess] failed', {
      statementId: req.params.id,
      companyId,
      reason: failure.reason,
      errorCode: failure.errorCode,
      errorMessage: failure.errorMessage,
      stack: error instanceof Error ? error.stack : undefined
    });
    return fail(res, failure.reason, 500, {
      reason: failure.reason,
      clientMessage:
        failure.reason === 'statement_queue_failed'
          ? 'RetailSync could not restart statement processing. Check the internal task runner configuration and retry.'
          : failure.clientMessage
    });
  }
};

export const retryStatementCheck = async (req: Request, res: Response) => {
  if (!req.companyId) return fail(res, 'Company onboarding required', 403);
  if (!req.user?.id) return fail(res, 'Unauthorized', 401);
  const companyId = String(req.companyId);
  const statementId = String(req.params.id);
  const checkId = String(req.params.checkId);

  const statement = await BankStatement.findOne({ _id: statementId, companyId });
  if (!statement) {
    return fail(res, 'Statement not found', 404);
  }

  const check = await StatementCheckModel.findOne({
    _id: checkId,
    statementId,
    companyId
  });
  if (!check) {
    return fail(res, 'Check not found', 404);
  }

  check.status = 'queued' as any;
  check.errors = [] as any;
  check.processing = {
    ...(check.processing ?? {}),
    retryCount: Number(check.processing?.retryCount ?? 0) + 1,
    queuedAt: nowIso(),
    processingAt: undefined,
    processedAt: undefined,
    lastError: undefined
  };
  check.artifacts = {
    ...(check.artifacts ?? {}),
    stageTimestamps: {
      ...(check.artifacts?.stageTimestamps ?? {}),
      queuedAt: nowIso()
    }
  };
  await check.save();

  const queue = await enqueueAccountingJob({
    companyId,
    statementId,
    checkId,
    jobType: 'check.process',
    meta: {
      requestedBy: req.user.id,
      reason: 'manual-check-retry'
    }
  });

  return ok(res, {
    checkId: check._id.toString(),
    queue
  });
};

export const getStatementStream = async (req: Request, res: Response) => {
  if (!req.companyId) return fail(res, 'Company onboarding required', 403);
  const companyId = String(req.companyId);

  const statementId = req.params.id;
  const statement = await BankStatement.findOne({ _id: statementId, companyId });
  if (!statement) {
    return fail(res, 'Statement not found', 404);
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  let lastStatusFingerprint = '';
  let lastChecksFingerprint = '';
  let lastProgressChangeAt = Date.now();
  let lastStuckWarningAt = 0;

  const writeEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const summarizeArtifactsForLog = (artifacts?: ReturnType<typeof buildStatementArtifacts>) => ({
    pageImages: Array.isArray(artifacts?.pageImagePaths) ? artifacts.pageImagePaths.length : 0,
    ocrReady: Boolean(artifacts?.ocrPath),
    ocrTextReady: Boolean(artifacts?.ocrTextPath),
    transactionsReady: Boolean(artifacts?.transactionsTablePath),
    checksClearedReady: Boolean(artifacts?.checksClearedTablePath),
    sectionsReady: Boolean(artifacts?.transactionSectionsPath),
    extractedChecksReady: Boolean(artifacts?.extractedChecksPath),
    classificationReady: Boolean(artifacts?.classificationOutputPath),
    suggestionsReady: Boolean(artifacts?.suggestionsOutputPath),
    processingSummaryReady: Boolean(artifacts?.processingSummaryPath),
    structuredReady: Boolean(artifacts?.structuredStatementPath),
    evidenceReady: Boolean(artifacts?.evidencePath),
    validationReady: Boolean(artifacts?.validationReportPath),
    pdfLayoutReady: Boolean(artifacts?.pdfLayoutPath),
    geminiReady: Boolean(artifacts?.geminiPath),
    stageTimestamps: artifacts?.stageTimestamps
  });

  const emit = async () => {
    const latestStatement = await BankStatement.findOne({ _id: statementId, companyId });
    if (!latestStatement) return;
    const liveMetrics = await buildStatementLiveMetrics(latestStatement._id.toString(), companyId);

    const statusPayload = {
      statementId: latestStatement._id.toString(),
      status: latestStatement.status,
      progress: buildStatementProgress(latestStatement),
      liveMetrics,
      artifacts: buildStatementArtifacts(latestStatement),
      updatedAt: latestStatement.updatedAt,
      issues: latestStatement.issues ?? []
    };
    const statusFingerprint = JSON.stringify(statusPayload);
    if (statusFingerprint !== lastStatusFingerprint) {
      writeEvent('progressUpdated', statusPayload);
      lastStatusFingerprint = statusFingerprint;
      lastProgressChangeAt = Date.now();
      // eslint-disable-next-line no-console
      console.info('[statement.stream] progressUpdated', {
        statementId,
        companyId,
        status: statusPayload.status,
        progress: statusPayload.progress,
        liveMetrics: statusPayload.liveMetrics,
        artifacts: summarizeArtifactsForLog(statusPayload.artifacts),
        issues: statusPayload.issues
      });
    }

    const checks = await StatementCheckModel.find({ companyId, statementId })
      .sort({ updatedAt: 1 })
      .limit(500)
      .lean();
    const transactionMap = await loadStatementTransactions(String(statementId), String(companyId));

    const checkPayload = await Promise.all(
      checks.map(async (check) => ({
        ...(await buildCheckPayload(
          check,
          transactionMap.get(String(check.match?.statementTransactionId ?? check._id))
        )),
        checkId: String(check._id)
      }))
    );

    const checksFingerprint = JSON.stringify(checkPayload);
    if (checksFingerprint !== lastChecksFingerprint) {
      for (const check of checkPayload) {
        writeEvent('checkUpdated', check);
      }
      lastChecksFingerprint = checksFingerprint;
      lastProgressChangeAt = Date.now();
      const checkSummary = checkPayload.reduce(
        (acc, check) => {
          const status = String(check.status ?? 'queued');
          if (status === 'ready') acc.ready += 1;
          else if (status === 'processing') acc.processing += 1;
          else if (status === 'failed') acc.failed += 1;
          else acc.queued += 1;
          if (status === 'ready' || status === 'failed') {
            const checkNumber =
              check.extracted?.checkNumber ?? check.autoFill?.checkNumber ?? String(check.checkId ?? '');
            if (checkNumber) {
              acc.completedCheckNumbers.push(String(checkNumber));
            }
          }
          return acc;
        },
        { queued: 0, processing: 0, ready: 0, failed: 0, completedCheckNumbers: [] as string[] }
      );
      // eslint-disable-next-line no-console
      console.info('[statement.stream] checkUpdated', {
        statementId,
        companyId,
        summary: checkSummary
      });
    }

    const now = Date.now();
    const idleMs = now - lastProgressChangeAt;
    if (idleMs >= 20000 && now - lastStuckWarningAt >= 20000) {
      lastStuckWarningAt = now;
      // eslint-disable-next-line no-console
      console.warn('[statement.stream] no progress change detected', {
        statementId,
        companyId,
        idleMs
      });
    }
  };

  writeEvent('connected', { statementId, now: new Date().toISOString() });
  await emit();

  const interval = setInterval(() => {
    void emit();
  }, 3000);

  req.on('close', () => {
    clearInterval(interval);
    res.end();
  });
};
