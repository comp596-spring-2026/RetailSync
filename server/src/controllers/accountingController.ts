import {
  accountingAiStatusSchema,
  bankStatementDetailSchema,
  bankStatementListItemSchema,
  bankStatementStatusResponseSchema,
  createBankStatementSchema,
  detectStatementMonthResponseSchema,
  listBankStatementsQuerySchema,
  listChecksQuerySchema,
  reprocessBankStatementSchema,
  requestStatementUploadUrlResponseSchema,
  requestStatementUploadUrlSchema
} from '@retailsync/shared';
import { createHash } from 'node:crypto';
import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { env } from '../config/env';
import { getStorageClient } from '../integrations/google/storage.client';
import { enqueueAccountingJob } from '../jobs/accountingQueue';
import { BankStatement } from '../models/BankStatement';
import { StatementTransactionModel } from '../models/StatementTransaction';
import { StatementCheckModel } from '../models/StatementCheck';
import {
  buildStatementPdfPath,
  buildStatementRootPrefix
} from '../services/accountingStorageService';
import { detectStatementMonthFromPdf } from '../services/accountingPdfAnalysisService';
import { fail, ok } from '../utils/apiResponse';

const storage = getStorageClient();

const sanitizeFileName = (name: string) => name.trim().replace(/[^a-zA-Z0-9._-]/g, '_');

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

const computeStatementHash = async (bucketName: string, objectPath: string) => {
  const file = storage.bucket(bucketName).file(objectPath);
  const [buffer] = await file.download();
  return createHash('sha256').update(buffer).digest('hex');
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
    createdAt: statement.createdAt instanceof Date ? statement.createdAt.toISOString() : String(statement.createdAt)
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
    checks: checksPayload,
    issues: Array.isArray(statement.issues)
      ? statement.issues.map((issue: unknown) => String(issue))
      : []
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
    return fail(res, failure.clientMessage, 500, { reason: failure.reason });
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

  if (parsed.data.gcsPath !== expectedPdfPath) {
    return fail(res, 'gcsPath does not match expected company/statement structure', 422, {
      expectedPdfPath
    });
  }

  try {
    const hash = await computeStatementHash(env.gcsBucketName, parsed.data.gcsPath);

    const duplicate = await BankStatement.findOne({
      companyId,
      hash,
      _id: { $ne: parsed.data.statementId }
    })
      .sort({ createdAt: -1 })
      .select('_id statementMonth fileName');

    const issues = duplicate
      ? [`Potential duplicate of statement ${duplicate._id.toString()} (${duplicate.statementMonth} ${duplicate.fileName})`]
      : [];

    const statement = await BankStatement.create({
      _id: new Types.ObjectId(parsed.data.statementId),
      companyId,
      statementMonth: parsed.data.statementMonth,
      fileName: sanitizeFileName(parsed.data.fileName),
      source: parsed.data.source,
      status: 'uploaded',
      periodStart: parsed.data.periodStart,
      periodEnd: parsed.data.periodEnd,
      gcs: {
        rootPrefix: expectedRootPrefix,
        pdfPath: parsed.data.gcsPath
      },
      artifacts: {
        stageTimestamps: {
          uploadedAt: nowIso()
        }
      },
      progress: {
        phase: 'uploaded',
        totalChecks: 0,
        checksQueued: 0,
        checksProcessing: 0,
        checksReady: 0,
        checksFailed: 0,
        completedChecks: 0,
        remainingChecks: 0
      },
      hash,
      issues,
      createdBy: req.user.id
    });

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
      statement.status = 'failed' as any;
      statement.issues = [
        ...(statement.issues ?? []),
        `Queue dispatch failed: ${String((enqueueError as Error).message)}`
      ] as any;
      await statement.save();
      throw enqueueError;
    }

    const current = await BankStatement.findOne({ _id: statement._id, companyId: req.companyId });
    if (!current) {
      return fail(res, 'Failed to reload created statement', 500);
    }

    return ok(res, { statement: toListItem(current), queue: queueMeta }, 201);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[accounting.create-statement] failed', error);
    return fail(res, 'Failed to create statement', 500);
  }
};

export const listStatements = async (req: Request, res: Response) => {
  if (!req.companyId) return fail(res, 'Company onboarding required', 403);

  const parsed = listBankStatementsQuerySchema.safeParse({
    month: typeof req.query.month === 'string' ? req.query.month : undefined,
    status: typeof req.query.status === 'string' ? req.query.status : undefined,
    search: typeof req.query.search === 'string' ? req.query.search : undefined
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
  if (parsed.data.search) {
    filter.fileName = { $regex: parsed.data.search, $options: 'i' };
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

export const getStatementStatus = async (req: Request, res: Response) => {
  if (!req.companyId) return fail(res, 'Company onboarding required', 403);

  try {
    const statement = await BankStatement.findOne({ _id: req.params.id, companyId: req.companyId });
    if (!statement) {
      return fail(res, 'Statement not found', 404);
    }

    const payload = bankStatementStatusResponseSchema.parse({
      statementId: statement._id.toString(),
      status: statement.status,
      progress: buildStatementProgress(statement),
      artifacts: buildStatementArtifacts(statement),
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

export const reprocessStatement = async (req: Request, res: Response) => {
  if (!req.companyId) return fail(res, 'Company onboarding required', 403);
  if (!req.user?.id) return fail(res, 'Unauthorized', 401);

  const parsed = reprocessBankStatementSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }

  try {
    const statement = await BankStatement.findOne({ _id: req.params.id, companyId: req.companyId });
    if (!statement) {
      return fail(res, 'Statement not found', 404);
    }

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
    statement.issues = [] as any;
    await statement.save();

    await StatementCheckModel.deleteMany({ companyId: req.companyId, statementId: statement._id.toString() });

    const queue = await enqueueAccountingJob({
      companyId: req.companyId,
      statementId: statement._id.toString(),
      jobType: parsed.data.fromJobType,
      meta: { requestedBy: req.user.id, reason: 'manual-reprocess' }
    });

    const refreshed = await BankStatement.findOne({ _id: req.params.id, companyId: req.companyId });
    if (!refreshed) {
      return fail(res, 'Statement not found after reprocess', 404);
    }
    return ok(res, { statement: toListItem(refreshed), queue });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[accounting.reprocess] failed', error);
    return fail(res, 'Failed to reprocess statement', 500);
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

  const writeEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const emit = async () => {
    const latestStatement = await BankStatement.findOne({ _id: statementId, companyId });
    if (!latestStatement) return;

    const statusPayload = {
      statementId: latestStatement._id.toString(),
      status: latestStatement.status,
      progress: buildStatementProgress(latestStatement),
      artifacts: buildStatementArtifacts(latestStatement),
      updatedAt: latestStatement.updatedAt,
      issues: latestStatement.issues ?? []
    };
    const statusFingerprint = JSON.stringify(statusPayload);
    if (statusFingerprint !== lastStatusFingerprint) {
      writeEvent('progressUpdated', statusPayload);
      lastStatusFingerprint = statusFingerprint;
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
