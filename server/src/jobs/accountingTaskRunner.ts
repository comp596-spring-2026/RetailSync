import {
  AccountingJobType,
  AccountingTaskPayload,
  accountingTaskPayloadSchema,
  statementExtractionSchemaV1
} from '@retailsync/shared';
import { Storage } from '@google-cloud/storage';
import { env } from '../config/env';
import { setRequestContext } from '../config/requestContext';
import { BankStatement } from '../models/BankStatement';
import {
  markQuickBooksSyncFailure,
  pushPostedLedgerEntriesToQuickBooks,
  syncQuickBooksAccountsToChartOfAccounts
} from '../services/quickbooksSyncService';

export type AccountingTaskRunResult = {
  taskId: string;
  companyId: string;
  statementId: string;
  jobType: AccountingJobType;
  status: 'completed' | 'failed';
  nextJobType?: AccountingJobType;
};

const nextJobMap: Partial<Record<AccountingJobType, AccountingJobType>> = {
  render_pages: 'ocr_statement',
  ocr_statement: 'detect_checks',
  detect_checks: 'gemini_structure'
};

const statementJobTypes: AccountingJobType[] = [
  'render_pages',
  'ocr_statement',
  'detect_checks',
  'gemini_structure'
];

const storage = new Storage();
const TRANSPARENT_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAoMBgJ7xLQwAAAAASUVORK5CYII=';

const makeTaskRun = (payload: AccountingTaskPayload, status: 'completed' | 'failed', error?: string) => ({
  taskId: String(payload.meta.taskId ?? `${payload.jobType}-${Date.now()}`),
  jobType: payload.jobType,
  status,
  attempt: payload.attempt,
  startedAt: new Date(),
  endedAt: new Date(),
  error
});

const ensureStatementStructures = (statement: any) => {
  if (!statement.files) {
    statement.files = {
      pdf: { gcsPath: '' },
      pages: [],
      checks: []
    };
  }
  if (!statement.files.pages) {
    statement.files.pages = [];
  }
  if (!statement.files.checks) {
    statement.files.checks = [];
  }
  if (!statement.extraction) {
    statement.extraction = {
      issues: []
    };
  }
  if (!statement.extraction.issues) {
    statement.extraction.issues = [];
  }
  if (!statement.jobRuns) {
    statement.jobRuns = [];
  }
};

const ensureGcsConfigured = () => {
  if (!env.gcsBucketName) {
    throw new Error('GCS_BUCKET_NAME is required for accounting worker pipeline');
  }
  return env.gcsBucketName;
};

const buildPagePath = (pdfPath: string, pageNo: number) => {
  if (pdfPath.endsWith('/original.pdf')) {
    return pdfPath.replace('/original.pdf', `/pages/page-${pageNo}.png`);
  }
  return `${pdfPath.replace(/\.pdf$/i, '')}/pages/page-${pageNo}.png`;
};

const buildCheckPath = (pdfPath: string, index: number) => {
  if (pdfPath.endsWith('/original.pdf')) {
    return pdfPath.replace('/original.pdf', `/checks/check-${index}.png`);
  }
  return `${pdfPath.replace(/\.pdf$/i, '')}/checks/check-${index}.png`;
};

const parsePdfPageCount = (pdfBuffer: Buffer) => {
  const pdfText = pdfBuffer.toString('latin1');
  const matches = pdfText.match(/\/Type\s*\/Page\b/g);
  const count = matches?.length ?? 0;
  return Math.max(1, count);
};

const extractOcrFallbackText = (pdfBuffer: Buffer) => {
  const text = pdfBuffer
    .toString('latin1')
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return text.slice(0, 20000);
};

const uploadPngIfMissing = async (bucketName: string, objectPath: string) => {
  const file = storage.bucket(bucketName).file(objectPath);
  const [exists] = await file.exists();
  if (!exists) {
    await file.save(Buffer.from(TRANSPARENT_PNG_BASE64, 'base64'), {
      contentType: 'image/png'
    });
  }
};

const downloadPdf = async (bucketName: string, objectPath: string) => {
  const file = storage.bucket(bucketName).file(objectPath);
  const [buffer] = await file.download();
  return buffer;
};

const parseTransactions = (rawText: string) => {
  const lines = rawText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 300);

  const transactions: Array<{
    id: string;
    date: string;
    description: string;
    amount: number;
    type: 'debit' | 'credit';
    suggestedCategory: string;
    confidence: number;
  }> = [];

  const dateAmountPattern = /(?<date>(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}(\/\d{2,4})?)).*?(?<amount>-?\$?\d{1,3}(,\d{3})*(\.\d{2})|-?\$?\d+(\.\d{2}))/;
  for (let idx = 0; idx < lines.length; idx += 1) {
    const line = lines[idx];
    const match = line.match(dateAmountPattern);
    if (!match?.groups) continue;

    const normalizedDate = match.groups.date.includes('-')
      ? match.groups.date
      : `2026-${match.groups.date.split('/')[0].padStart(2, '0')}-${match.groups.date.split('/')[1].padStart(2, '0')}`;
    const amountValue = Number(match.groups.amount.replace(/\$/g, '').replace(/,/g, ''));
    if (!Number.isFinite(amountValue)) continue;

    transactions.push({
      id: `txn-${idx + 1}`,
      date: normalizedDate,
      description: line.slice(0, 140),
      amount: Math.abs(amountValue),
      type: amountValue < 0 ? 'debit' : 'credit',
      suggestedCategory: amountValue < 0 ? 'expense' : 'income',
      confidence: 0.45
    });
  }

  return transactions.slice(0, 200);
};

const runTaskLogic = async (payload: AccountingTaskPayload) => {
  const isStatementJob = statementJobTypes.includes(payload.jobType);
  const statement = isStatementJob
    ? await BankStatement.findOne({
      _id: payload.statementId,
      companyId: payload.companyId
    })
    : null;

  if (isStatementJob && !statement) {
    throw new Error('Statement not found for task payload');
  }
  if (statement) {
    ensureStatementStructures(statement);
  }

  switch (payload.jobType) {
    case 'render_pages': {
      const bucketName = ensureGcsConfigured();
      const pdfPath = statement!.files!.pdf!.gcsPath;
      const pdfBuffer = await downloadPdf(bucketName, pdfPath);
      const pageCount = parsePdfPageCount(pdfBuffer);

      const pageEntries: Array<{ pageNo: number; gcsPath: string; width: number; height: number }> = [];
      for (let pageNo = 1; pageNo <= pageCount; pageNo += 1) {
        const pagePath = buildPagePath(pdfPath, pageNo);
        await uploadPngIfMissing(bucketName, pagePath);
        pageEntries.push({
          pageNo,
          gcsPath: pagePath,
          width: 1,
          height: 1
        });
      }

      // Idempotent replacement prevents duplicate pages on retries.
      statement!.files!.pages = pageEntries as any;
      statement!.status = 'processing' as any;
      statement!.processingStage = 'pages_ready' as any;
      break;
    }
    case 'ocr_statement': {
      const bucketName = ensureGcsConfigured();
      const pdfPath = statement!.files!.pdf!.gcsPath;
      const pdfBuffer = await downloadPdf(bucketName, pdfPath);
      const fallbackText = extractOcrFallbackText(pdfBuffer);
      statement!.extraction!.rawOcrText =
        fallbackText || `OCR placeholder for ${statement!.fileName}`;
      statement!.status = 'processing' as any;
      statement!.processingStage = 'ocr_ready' as any;
      break;
    }
    case 'detect_checks': {
      const bucketName = ensureGcsConfigured();
      const text = (statement!.extraction!.rawOcrText ?? '').toLowerCase();
      const keywordMatches = text.match(/pay to the order|check|cheque|micr|dollars/g)?.length ?? 0;
      const checkCount = Math.min(10, Math.max(0, keywordMatches));
      const checks: Array<{ checkId: string; pageNo: number; bbox: number[]; gcsPath: string }> = [];

      for (let idx = 1; idx <= checkCount; idx += 1) {
        const checkPath = buildCheckPath(statement!.files!.pdf!.gcsPath, idx);
        await uploadPngIfMissing(bucketName, checkPath);
        checks.push({
          checkId: `check-${idx}`,
          pageNo: Math.min(idx, Math.max(1, statement!.files!.pages.length || 1)),
          bbox: [0, 0, 1, 1],
          gcsPath: checkPath
        });
      }

      statement!.files!.checks = checks as any;
      statement!.status = 'processing' as any;
      statement!.processingStage = 'checks_ready' as any;
      break;
    }
    case 'gemini_structure': {
      const transactions = parseTransactions(statement!.extraction!.rawOcrText ?? '');
      const confidence = transactions.length > 0 ? Math.min(0.95, 0.5 + transactions.length * 0.01) : 0.2;
      const structured = statementExtractionSchemaV1.parse({
        schemaVersion: 'v1',
        transactions
      });
      statement!.extraction!.structuredJson = structured as any;
      statement!.extraction!.issues = statement!.extraction!.issues ?? [];
      statement!.extraction!.confidence = confidence;
      statement!.status = 'needs_review' as any;
      statement!.processingStage = 'structured_ready' as any;
      break;
    }
    case 'qb_pull_accounts':
      await syncQuickBooksAccountsToChartOfAccounts(payload.companyId);
      return;
    case 'qb_push_entries':
      await pushPostedLedgerEntriesToQuickBooks(payload.companyId);
      return;
    default: {
      const exhaustive: never = payload.jobType;
      throw new Error(`Unhandled accounting job type: ${String(exhaustive)}`);
    }
  }

  statement!.jobRuns.push(makeTaskRun(payload, 'completed'));
  await statement!.save();
};

export const runAccountingTask = async (input: unknown): Promise<AccountingTaskRunResult> => {
  const parsed = accountingTaskPayloadSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error('Invalid accounting task payload');
  }

  const payload = parsed.data;
  setRequestContext({ tenantId: payload.companyId, userId: 'system-accounting-task' });

  try {
    await runTaskLogic(payload);
    // eslint-disable-next-line no-console
    console.info('[accounting.task.completed]', {
      companyId: payload.companyId,
      statementId: payload.statementId,
      jobType: payload.jobType
    });
    return {
      taskId: String(payload.meta.taskId ?? `${payload.jobType}-${Date.now()}`),
      companyId: payload.companyId,
      statementId: payload.statementId,
      jobType: payload.jobType,
      status: 'completed',
      nextJobType: nextJobMap[payload.jobType]
    };
  } catch (error) {
    if (statementJobTypes.includes(payload.jobType)) {
      const statement = await BankStatement.findOne({
        _id: payload.statementId,
        companyId: payload.companyId
      });
      if (statement) {
        ensureStatementStructures(statement);
        statement.status = 'failed' as any;
        statement.processingStage = 'failed' as any;
        statement.extraction!.issues = [...(statement.extraction!.issues ?? []), String((error as Error).message)];
        statement.jobRuns.push(makeTaskRun(payload, 'failed', String((error as Error).message)));
        await statement.save();
      }
    } else if (payload.jobType === 'qb_pull_accounts' || payload.jobType === 'qb_push_entries') {
      await markQuickBooksSyncFailure(
        payload.companyId,
        payload.jobType,
        String((error as Error).message)
      );
    }
    // eslint-disable-next-line no-console
    console.error('[accounting.task.failed]', {
      companyId: payload.companyId,
      statementId: payload.statementId,
      jobType: payload.jobType,
      error: String((error as Error).message)
    });
    throw error;
  }
};
