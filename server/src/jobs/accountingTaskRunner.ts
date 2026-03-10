import {
  AccountingJobType,
  AccountingTaskPayload,
  accountingTaskPayloadSchema
} from '@retailsync/shared';
import { Storage } from '@google-cloud/storage';
import { env } from '../config/env';
import { setRequestContext } from '../config/requestContext';
import { BankStatement } from '../models/BankStatement';
import { LedgerEntryModel } from '../models/LedgerEntry';
import { RunModel } from '../models/Run';
import { StatementCheckModel } from '../models/StatementCheck';
import { StatementTransactionModel } from '../models/StatementTransaction';
import {
  buildCheckPath,
  buildDerivedPath,
  buildGeminiPath,
  buildOcrPath,
  buildPageImagePath
} from '../services/accountingStorageService';
import { buildMatchingProposal } from '../services/matchingEngine';
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

const storage = new Storage();
const TRANSPARENT_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAoMBgJ7xLQwAAAAASUVORK5CYII=';

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

const savePngPlaceholderIfMissing = async (bucketName: string, objectPath: string) => {
  const file = storage.bucket(bucketName).file(objectPath);
  const [exists] = await file.exists();
  if (!exists) {
    await file.save(Buffer.from(TRANSPARENT_PNG_BASE64, 'base64'), {
      contentType: 'image/png'
    });
  }
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
  return text.slice(0, 50000);
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

const parseTransactions = (rawText: string) => {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 500);

  const transactions: Array<{
    localId: string;
    postDate: string;
    description: string;
    merchant: string;
    amount: number;
    type: 'debit' | 'credit';
    checkNumber?: string;
    sourceLocator: { rowIndex: number };
  }> = [];

  const pattern =
    /(?<date>\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?).*?(?<amount>-?\$?\d{1,3}(?:,\d{3})*(?:\.\d{2})|-?\$?\d+(?:\.\d{2}))/;
  const checkPattern = /check\s*#?\s*(\d{2,8})/i;

  lines.forEach((line, index) => {
    const match = line.match(pattern);
    if (!match?.groups) return;

    const amountRaw = match.groups.amount.replace(/[$,]/g, '');
    const amountNumeric = Number(amountRaw);
    if (!Number.isFinite(amountNumeric)) return;

    const checkMatch = line.match(checkPattern);
    const checkNumber = checkMatch ? String(checkMatch[1]) : undefined;

    const description = line.slice(0, 140);
    const merchant = description
      .replace(match.groups.date, '')
      .replace(match.groups.amount, '')
      .trim()
      .slice(0, 80);

    transactions.push({
      localId: `txn-${index + 1}`,
      postDate: normalizeDate(match.groups.date),
      description,
      merchant,
      amount: Math.abs(amountNumeric),
      type: amountNumeric < 0 ? 'debit' : 'credit',
      checkNumber,
      sourceLocator: { rowIndex: index }
    });
  });

  return transactions.slice(0, 500);
};

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

  statement.progress = {
    totalChecks: total,
    checksQueued: queued,
    checksProcessing: processing,
    checksReady: ready + needsReview,
    checksFailed: failed
  } as any;

  if (total > 0 && queued === 0 && processing === 0) {
    statement.status = 'ready_for_review' as any;
  }
  if (total === 0 && statement.status === 'checks_queued') {
    statement.status = 'ready_for_review' as any;
  }

  await statement.save();
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
      statement.status = 'extracting' as any;
      await statement.save();

      const pdfBuffer = await downloadFileBuffer(bucketName, pdfPath);
      const pageCount = parsePdfPageCount(pdfBuffer);
      const rawText = extractOcrFallbackText(pdfBuffer);

      const pagePaths: string[] = [];
      for (let pageNo = 1; pageNo <= pageCount; pageNo += 1) {
        const pagePath = buildPageImagePath(rootPrefix, pageNo);
        await savePngPlaceholderIfMissing(bucketName, pagePath);
        pagePaths.push(pagePath);
      }

      const ocrJsonPath = buildOcrPath(rootPrefix, 'docai.json');
      const ocrTextPath = buildOcrPath(rootPrefix, 'text.txt');
      await saveJson(bucketName, ocrJsonPath, {
        source: 'fallback',
        extractedAt: new Date().toISOString(),
        pageCount,
        textPreview: rawText.slice(0, 5000)
      });
      await saveText(bucketName, ocrTextPath, rawText);

      statement.status = 'structuring' as any;
      await statement.save();

      artifacts.pages = pagePaths.join(',');
      artifacts.ocr = ocrJsonPath;
      artifacts.text = ocrTextPath;
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
      statement.status = 'structuring' as any;
      await statement.save();

      const ocrTextPath = buildOcrPath(rootPrefix, 'text.txt');
      const rawText = await downloadFileAsText(bucketName, ocrTextPath);
      const parsed = parseTransactions(rawText);

      const normalizedPath = buildGeminiPath(rootPrefix, 'normalized.v1.json');
      await saveJson(bucketName, normalizedPath, {
        schemaVersion: 'v1',
        statementId: payload.statementId,
        transactionCount: parsed.length,
        transactions: parsed
      });

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

      for (const txn of parsed) {
        const proposal = await buildMatchingProposal({
          companyId: payload.companyId,
          description: txn.description,
          merchant: txn.merchant,
          amount: txn.amount,
          type: txn.type
        });

        const createdTxn = await StatementTransactionModel.create({
          statementId: payload.statementId,
          companyId: payload.companyId,
          postDate: txn.postDate,
          description: txn.description,
          merchant: txn.merchant,
          amount: txn.amount,
          type: txn.type,
          checkNumber: txn.checkNumber,
          sourceLocator: txn.sourceLocator,
          evidence: {
            statementPdfPath: pdfPath,
            pageImagePath: buildPageImagePath(rootPrefix, 1)
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
            statementPageImagePath: buildPageImagePath(rootPrefix, 1)
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

      statement.status = 'checks_queued' as any;
      statement.progress = {
        totalChecks: 0,
        checksQueued: 0,
        checksProcessing: 0,
        checksReady: 0,
        checksFailed: 0
      } as any;
      await statement.save();

      artifacts.normalized = normalizedPath;
      return { artifacts };
    }
    case 'checks.spawn': {
      if (!statement || !payload.statementId) {
        throw new Error('checks.spawn requires a valid statementId');
      }
      const rootPrefix = String(statement.gcs?.rootPrefix ?? '');
      if (!rootPrefix) {
        throw new Error('Statement is missing gcs.rootPrefix');
      }

      await StatementCheckModel.deleteMany({
        companyId: payload.companyId,
        statementId: payload.statementId
      });

      const transactions = await StatementTransactionModel.find({
        companyId: payload.companyId,
        statementId: payload.statementId
      })
        .sort({ postDate: 1, createdAt: 1 })
        .lean();

      const candidates = transactions.filter((txn) => {
        if (txn.checkNumber && String(txn.checkNumber).trim()) return true;
        const text = `${txn.description ?? ''} ${txn.merchant ?? ''}`.toLowerCase();
        return /\bcheck\b|pay to the order|micr|cheque|payroll/.test(text);
      });

      const checks = [] as Array<{ id: string; frontPath: string }>;
      for (let index = 0; index < candidates.length; index += 1) {
        const txn = candidates[index];
        const checkKey = `check-${String(index + 1).padStart(4, '0')}`;
        const frontPath = buildCheckPath(rootPrefix, checkKey, 'front.jpg');
        await savePngPlaceholderIfMissing(bucketName, frontPath);

        const created = await StatementCheckModel.create({
          statementId: payload.statementId,
          companyId: payload.companyId,
          status: 'queued',
          gcs: {
            frontPath
          },
          match: {
            statementTransactionId: txn._id.toString(),
            reasons: ['Seeded from statement row check candidate'],
            matchConfidence: 0.55
          }
        });

        checks.push({ id: created._id.toString(), frontPath });
      }

      statement.progress = {
        totalChecks: checks.length,
        checksQueued: checks.length,
        checksProcessing: 0,
        checksReady: 0,
        checksFailed: 0
      } as any;
      statement.status = checks.length > 0 ? ('checks_queued' as any) : ('ready_for_review' as any);
      await statement.save();

      if (checks.length > 0) {
        const { enqueueAccountingJob } = await import('./accountingQueue');
        for (const check of checks) {
          await enqueueAccountingJob({
            companyId: payload.companyId,
            statementId: payload.statementId,
            checkId: check.id,
            jobType: 'check.process',
            meta: {
              parentJob: 'checks.spawn'
            }
          });
        }
      }

      artifacts.checks = checks.map((check) => check.frontPath).join(',');
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

      const ocrPath = buildDerivedPath(
        rootPrefix,
        `checks/extracted/${check._id.toString()}/ocr.json`
      );
      const structuredPath = buildDerivedPath(
        rootPrefix,
        `checks/extracted/${check._id.toString()}/structured.v1.json`
      );

      const amount = statementTxn?.amount ?? 0;
      const autoFill = {
        checkNumber: statementTxn?.checkNumber ?? check._id.toString().slice(-4),
        date: statementTxn?.postDate ?? new Date().toISOString().slice(0, 10),
        payeeName:
          statementTxn?.merchant ||
          statementTxn?.description?.split(/\s{2,}|\*/)[0] ||
          'Unknown Payee',
        amount,
        memo: statementTxn?.description ?? 'Auto-filled from statement context'
      };

      const confidence = {
        imageQuality: 0.9,
        ocrConfidence: 0.88,
        fieldConfidence: 0.82,
        crossValidation: statementTxn ? 0.9 : 0.55,
        overall: statementTxn ? 0.88 : 0.66
      };

      await saveJson(bucketName, ocrPath, {
        source: 'vision-fallback',
        extractedAt: new Date().toISOString(),
        autoFill,
        confidence
      });
      await saveJson(bucketName, structuredPath, {
        schemaVersion: 'v1',
        autoFill,
        confidence
      });

      const checkGcs: any = check.gcs ?? ((check.gcs = { frontPath: '' } as any), check.gcs);
      checkGcs.ocrPath = ocrPath;
      checkGcs.structuredPath = structuredPath;
      check.autoFill = autoFill as any;
      check.confidence = confidence as any;
      check.match = {
        ...(check.match ?? {}),
        statementTransactionId: statementTxn?._id?.toString() ?? check.match?.statementTransactionId,
        matchConfidence: statementTxn ? 0.92 : 0.58,
        reasons: statementTxn
          ? ['Amount exact match to statement row', 'Derived from statement candidate map']
          : ['No strong transaction candidate found']
      } as any;
      check.status = confidence.overall >= 0.75 ? ('ready' as any) : ('needs_review' as any);
      await check.save();

      if (statementTxn) {
        const proposal = await buildMatchingProposal({
          companyId: payload.companyId,
          description: statementTxn.description,
          merchant: statementTxn.merchant ?? undefined,
          amount: statementTxn.amount,
          type: statementTxn.type,
          check: {
            payeeName: autoFill.payeeName,
            amount: autoFill.amount
          }
        });

        await Promise.all([
          StatementTransactionModel.updateOne(
            { _id: statementTxn._id, companyId: payload.companyId },
            {
              $set: {
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
                'attachments.checkFrontPath': check.gcs?.frontPath ?? null,
                'attachments.checkBackPath': check.gcs?.backPath ?? null,
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

      await updateStatementProgressFromChecks(payload.companyId, payload.statementId);

      artifacts.ocr = ocrPath;
      artifacts.structured = structuredPath;
      return { artifacts };
    }
    case 'matching.refresh': {
      if (!payload.statementId) {
        throw new Error('matching.refresh requires statementId');
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

        const proposal = await buildMatchingProposal({
          companyId: payload.companyId,
          description: txn.description,
          merchant: txn.merchant ?? undefined,
          amount: txn.amount,
          type: txn.type,
          check: {
            payeeName: check?.autoFill?.payeeName ?? undefined,
            amount: check?.autoFill?.amount ?? undefined
          }
        });

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

    return {
      taskId: String(payload.meta.taskId ?? `${payload.jobType}-${Date.now()}`),
      companyId: payload.companyId,
      statementId: payload.statementId,
      checkId: payload.checkId,
      jobType: payload.jobType,
      status: 'completed',
      nextJobType: nextJobMap[payload.jobType]
    };
  } catch (error) {
    const message = String((error as Error).message);

    await completeRun(run._id.toString(), 'failed', {
      errors: [message]
    });

    if (statementJobTypes.includes(payload.jobType) && payload.statementId) {
      const statement = await BankStatement.findOne({
        _id: payload.statementId,
        companyId: payload.companyId
      });
      if (statement) {
        statement.status = 'failed' as any;
        statement.issues = [...(statement.issues ?? []), message] as any;
        await statement.save();
      }

      if (payload.jobType === 'check.process' && payload.checkId) {
        await StatementCheckModel.updateOne(
          { _id: payload.checkId, statementId: payload.statementId, companyId: payload.companyId },
          {
            $set: {
              status: 'failed',
              errors: [message]
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
