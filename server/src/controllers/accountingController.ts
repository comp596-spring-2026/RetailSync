import {
  bankStatementDetailSchema,
  bankStatementListItemSchema,
  bankStatementStatusResponseSchema,
  createBankStatementSchema,
  listBankStatementsQuerySchema,
  listChecksQuerySchema,
  reprocessBankStatementSchema,
  requestStatementUploadUrlResponseSchema,
  requestStatementUploadUrlSchema
} from '@retailsync/shared';
import { Storage } from '@google-cloud/storage';
import { createHash } from 'node:crypto';
import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { env } from '../config/env';
import { enqueueAccountingJob } from '../jobs/accountingQueue';
import { BankStatement } from '../models/BankStatement';
import { StatementCheckModel } from '../models/StatementCheck';
import {
  buildStatementPdfPath,
  buildStatementRootPrefix
} from '../services/accountingStorageService';
import { fail, ok } from '../utils/apiResponse';

const storage = new Storage();

const sanitizeFileName = (name: string) => name.trim().replace(/[^a-zA-Z0-9._-]/g, '_');

const computeStatementHash = async (bucketName: string, objectPath: string) => {
  const file = storage.bucket(bucketName).file(objectPath);
  const [buffer] = await file.download();
  return createHash('sha256').update(buffer).digest('hex');
};

const toListItem = (statement: any) =>
  bankStatementListItemSchema.parse({
    id: statement._id.toString(),
    statementMonth: statement.statementMonth,
    fileName: statement.fileName,
    source: statement.source,
    status: statement.status,
    progress: {
      totalChecks: Number(statement.progress?.totalChecks ?? 0),
      checksQueued: Number(statement.progress?.checksQueued ?? 0),
      checksProcessing: Number(statement.progress?.checksProcessing ?? 0),
      checksReady: Number(statement.progress?.checksReady ?? 0),
      checksFailed: Number(statement.progress?.checksFailed ?? 0)
    },
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
    checks: checks.map((check) => ({
      id: String(check._id),
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
      match: check.match
        ? {
          statementTransactionId: check.match.statementTransactionId ?? undefined,
          matchConfidence:
            check.match.matchConfidence != null
              ? Number(check.match.matchConfidence)
              : undefined,
          reasons: Array.isArray(check.match.reasons)
            ? check.match.reasons.map((reason) => String(reason))
            : []
        }
        : undefined
    })),
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
    // eslint-disable-next-line no-console
    console.error('[accounting.upload-url] failed', error);
    return fail(res, 'Failed to generate upload URL', 500);
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
      progress: {
        totalChecks: 0,
        checksQueued: 0,
        checksProcessing: 0,
        checksReady: 0,
        checksFailed: 0
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
      statement.status = 'extracting' as any;
      await statement.save();
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
      progress: {
        totalChecks: Number(statement.progress?.totalChecks ?? 0),
        checksQueued: Number(statement.progress?.checksQueued ?? 0),
        checksProcessing: Number(statement.progress?.checksProcessing ?? 0),
        checksReady: Number(statement.progress?.checksReady ?? 0),
        checksFailed: Number(statement.progress?.checksFailed ?? 0)
      },
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
  return ok(res, {
    checks: checks.map((check) => ({
      id: check._id.toString(),
      statementId: check.statementId,
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
      autoFill: check.autoFill ?? undefined,
      gcs: (() => {
        const gcs = check.gcs ?? { frontPath: '' };
        return {
          frontPath: String(gcs.frontPath ?? ''),
          backPath: gcs.backPath ?? undefined,
          ocrPath: gcs.ocrPath ?? undefined,
          structuredPath: gcs.structuredPath ?? undefined
        };
      })(),
      match: check.match
        ? {
          statementTransactionId: check.match.statementTransactionId ?? undefined,
          matchConfidence: check.match.matchConfidence ?? undefined,
          reasons: check.match.reasons ?? []
        }
        : undefined,
      updatedAt: check.updatedAt instanceof Date ? check.updatedAt.toISOString() : String(check.updatedAt)
    }))
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
      totalChecks: 0,
      checksQueued: 0,
      checksProcessing: 0,
      checksReady: 0,
      checksFailed: 0
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
      progress: latestStatement.progress,
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

    const checkPayload = checks.map((check) => ({
      checkId: String(check._id),
      status: check.status,
      confidence: check.confidence?.overall ?? null,
      autoFill: check.autoFill ?? null,
      updatedAt: check.updatedAt
    }));

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
