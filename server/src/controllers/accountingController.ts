import {
  bankStatementDetailSchema,
  bankStatementListItemSchema,
  createBankStatementSchema,
  listBankStatementsQuerySchema,
  reprocessBankStatementSchema,
  requestStatementUploadUrlSchema,
  requestStatementUploadUrlResponseSchema,
  updateStatementTransactionsSchema
} from '@retailsync/shared';
import { Storage } from '@google-cloud/storage';
import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { env } from '../config/env';
import { enqueueAccountingJob } from '../jobs/accountingQueue';
import { BankStatement } from '../models/BankStatement';
import { createDraftLedgerEntriesFromStatement } from '../services/ledgerService';
import { fail, ok } from '../utils/apiResponse';

const storage = new Storage();

const sanitizeFileName = (name: string) => name.trim().replace(/[^a-zA-Z0-9._-]/g, '_');

const ensureExtraction = (statement: any) => {
  if (!statement.extraction) {
    statement.extraction = { issues: [] };
  }
  if (!statement.extraction.issues) {
    statement.extraction.issues = [];
  }
};

const toListItem = (statement: any) =>
  bankStatementListItemSchema.parse({
    id: statement._id.toString(),
    statementMonth: statement.statementMonth,
    fileName: statement.fileName,
    source: statement.source,
    status: statement.status,
    processingStage: statement.processingStage,
    pageCount: statement.files?.pages?.length ?? 0,
    checkCount: statement.files?.checks?.length ?? 0,
    confidence: statement.extraction?.confidence,
    issuesCount: statement.extraction?.issues?.length ?? 0,
    updatedAt: statement.updatedAt instanceof Date ? statement.updatedAt.toISOString() : String(statement.updatedAt),
    createdAt: statement.createdAt instanceof Date ? statement.createdAt.toISOString() : String(statement.createdAt)
  });

const toDetailItem = (statement: any) =>
  bankStatementDetailSchema.parse({
    ...toListItem(statement),
    pdfPath: statement.files?.pdf?.gcsPath,
    pages: (statement.files?.pages ?? []).map((page: any) => ({
      pageNo: Number(page.pageNo),
      gcsPath: String(page.gcsPath),
      width: page.width ? Number(page.width) : undefined,
      height: page.height ? Number(page.height) : undefined
    })),
    checks: (statement.files?.checks ?? []).map((check: any) => ({
      checkId: String(check.checkId),
      pageNo: Number(check.pageNo),
      bbox: Array.isArray(check.bbox) ? check.bbox.map((value: unknown) => Number(value)) : [],
      gcsPath: String(check.gcsPath),
      linkedTransactionId: check.linkedTransactionId ? String(check.linkedTransactionId) : undefined
    })),
    extraction: statement.extraction
      ? {
        rawOcrText: statement.extraction.rawOcrText ?? undefined,
        structuredJson: statement.extraction.structuredJson ?? undefined,
        issues: statement.extraction.issues ?? [],
        confidence: statement.extraction.confidence ?? undefined
      }
      : undefined
  });

export const getUploadUrl = async (req: Request, res: Response) => {
  if (!req.companyId) return fail(res, 'Company onboarding required', 403);
  if (!env.gcsBucketName) return fail(res, 'GCS bucket is not configured', 500);

  const parsed = requestStatementUploadUrlSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }

  const statementId = new Types.ObjectId().toString();
  const cleanName = sanitizeFileName(parsed.data.fileName);
  const gcsPath = `accounting/${req.companyId}/statements/${statementId}/original.pdf`;
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
      expiresAt: expires.toISOString()
    });

    return ok(res, { ...payload, fileName: cleanName });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[accounting.upload-url] failed', error);
    return fail(res, 'Failed to generate upload URL', 500);
  }
};

export const createStatement = async (req: Request, res: Response) => {
  if (!req.companyId) return fail(res, 'Company onboarding required', 403);
  if (!req.user?.id) return fail(res, 'Unauthorized', 401);

  const parsed = createBankStatementSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }

  if (!Types.ObjectId.isValid(parsed.data.statementId)) {
    return fail(res, 'Invalid statementId', 422);
  }

  const expectedPrefix = `accounting/${req.companyId}/statements/${parsed.data.statementId}/`;
  if (!parsed.data.gcsPath.startsWith(expectedPrefix)) {
    return fail(res, 'gcsPath does not match expected company/statement structure', 422);
  }

  try {
    const statement = await BankStatement.create({
      _id: new Types.ObjectId(parsed.data.statementId),
      companyId: req.companyId,
      statementMonth: parsed.data.statementMonth,
      fileName: sanitizeFileName(parsed.data.fileName),
      source: parsed.data.source,
      status: 'uploaded',
      processingStage: 'queued',
      files: {
        pdf: { gcsPath: parsed.data.gcsPath },
        pages: [],
        checks: []
      },
      extraction: {
        issues: []
      },
      createdBy: req.user.id
    });

    let queueMeta: Awaited<ReturnType<typeof enqueueAccountingJob>> | null = null;
    try {
      queueMeta = await enqueueAccountingJob({
        companyId: req.companyId,
        statementId: statement._id.toString(),
        jobType: 'render_pages',
        meta: { requestedBy: req.user.id }
      });
      if (queueMeta.mode === 'cloud') {
        statement.status = 'processing' as any;
        await statement.save();
      }
    } catch (enqueueError) {
      statement.status = 'failed' as any;
      statement.processingStage = 'failed' as any;
      ensureExtraction(statement);
      statement.extraction!.issues = [...(statement.extraction!.issues ?? []), `Queue dispatch failed: ${String((enqueueError as Error).message)}`];
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
    return ok(res, toDetailItem(statement));
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[accounting.get-statement] failed', error);
    return fail(res, 'Failed to load statement', 500);
  }
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

    statement.status = 'processing' as any;
    statement.processingStage = 'queued' as any;
    ensureExtraction(statement);
    statement.extraction!.issues = [];
    await statement.save();

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

export const confirmStatement = async (req: Request, res: Response) => {
  if (!req.companyId) return fail(res, 'Company onboarding required', 403);

  try {
    const statement = await BankStatement.findOne({ _id: req.params.id, companyId: req.companyId });
    if (!statement) {
      return fail(res, 'Statement not found', 404);
    }

    if (statement.status !== 'needs_review') {
      return fail(res, 'Statement must be in needs_review before confirming', 409);
    }

    const transactions = (statement.extraction as any)?.structuredJson?.transactions as Array<{
      id?: string;
      date?: string;
      description?: string;
      amount?: number;
      type?: string;
      suggestedCategory?: string;
    }> | undefined;
    if (!transactions || transactions.length === 0) {
      return fail(res, 'No transactions available to confirm', 422);
    }

    const missingCategory = transactions.filter((txn) => !txn.suggestedCategory || !String(txn.suggestedCategory).trim()).length;
    const invalidRows = transactions.filter((txn) => !txn.id || !txn.date || !txn.description || !Number.isFinite(Number(txn.amount)) || !txn.type).length;
    if (invalidRows > 0 || missingCategory > 0) {
      return fail(res, 'Statement has unresolved transaction fields', 422, {
        invalidRows,
        missingCategory
      });
    }

    statement.status = 'confirmed' as any;
    statement.processingStage = 'confirmed' as any;
    await statement.save();

    let ledgerDraftsCreated = 0;
    try {
      const result = await createDraftLedgerEntriesFromStatement({
        companyId: req.companyId,
        statementId: statement._id.toString(),
        transactions: transactions.map((txn) => ({
          id: String(txn.id),
          date: String(txn.date),
          description: String(txn.description),
          amount: Number(txn.amount),
          type: txn.type === 'debit' ? 'debit' : 'credit',
          suggestedCategory: txn.suggestedCategory ? String(txn.suggestedCategory) : undefined
        }))
      });
      ledgerDraftsCreated = result.created;
    } catch (ledgerError) {
      ensureExtraction(statement);
      statement.extraction!.issues = [
        ...(statement.extraction!.issues ?? []),
        `Ledger draft generation failed: ${String((ledgerError as Error).message)}`
      ];
      await statement.save();
    }

    return ok(res, { statement: toListItem(statement), ledgerDraftsCreated });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[accounting.confirm] failed', error);
    return fail(res, 'Failed to confirm statement', 500);
  }
};

export const lockStatement = async (req: Request, res: Response) => {
  if (!req.companyId) return fail(res, 'Company onboarding required', 403);

  try {
    const statement = await BankStatement.findOne({ _id: req.params.id, companyId: req.companyId });
    if (!statement) {
      return fail(res, 'Statement not found', 404);
    }

    if (statement.status !== 'confirmed') {
      return fail(res, 'Only confirmed statements can be locked', 409);
    }

    statement.status = 'locked' as any;
    statement.processingStage = 'locked' as any;
    await statement.save();
    return ok(res, { statement: toListItem(statement) });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[accounting.lock] failed', error);
    return fail(res, 'Failed to lock statement', 500);
  }
};

export const updateStatementTransactions = async (req: Request, res: Response) => {
  if (!req.companyId) return fail(res, 'Company onboarding required', 403);

  const parsed = updateStatementTransactionsSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }

  try {
    const statement = await BankStatement.findOne({ _id: req.params.id, companyId: req.companyId });
    if (!statement) {
      return fail(res, 'Statement not found', 404);
    }

    const structured = (statement.extraction as any)?.structuredJson;
    const existingTransactions = Array.isArray(structured?.transactions) ? structured.transactions : [];
    const categoryMap = new Map(parsed.data.transactions.map((txn) => [txn.id, txn.suggestedCategory]));

    const updatedTransactions = existingTransactions.map((txn: any) => ({
      ...txn,
      suggestedCategory: categoryMap.get(String(txn.id)) ?? txn.suggestedCategory
    }));

    if (!statement.extraction) {
      statement.extraction = { issues: [] } as any;
    }
    statement.extraction!.structuredJson = {
      ...(structured ?? {}),
      schemaVersion: structured?.schemaVersion ?? 'v1',
      transactions: updatedTransactions
    };
    await statement.save();

    return ok(res, {
      statement: toDetailItem(statement)
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[accounting.update-transactions] failed', error);
    return fail(res, 'Failed to update transactions', 500);
  }
};
