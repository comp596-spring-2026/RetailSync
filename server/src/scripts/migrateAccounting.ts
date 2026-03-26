import mongoose from 'mongoose';
import { fileURLToPath } from 'node:url';
import { connectDb } from '../db/connect';
import { BankStatement } from '../models/BankStatement';
import { LedgerEntryModel } from '../models/LedgerEntry';
import { StatementCheckModel } from '../models/StatementCheck';
import { StatementTransactionModel } from '../models/StatementTransaction';

const statusMap: Record<string, string> = {
  uploaded: 'uploaded',
  processing: 'extracting',
  needs_review: 'ready_for_review',
  confirmed: 'ready_for_review',
  locked: 'ready_for_review',
  failed: 'failed',
  queued: 'uploaded',
  pages_ready: 'extracting',
  ocr_ready: 'structuring',
  checks_ready: 'checks_queued',
  structured_ready: 'ready_for_review'
};

const normalizeStatus = (value: string | undefined) => {
  if (!value) return 'uploaded';
  return statusMap[value] ?? 'uploaded';
};

const deriveRootPrefix = (legacyPdfPath?: string) => {
  const path = String(legacyPdfPath ?? '').trim();
  if (!path) return null;
  if (path.includes('/original/statement.pdf')) {
    return path.replace(/\/original\/statement\.pdf$/i, '');
  }
  if (path.endsWith('/original.pdf')) {
    return path.replace(/\/original\.pdf$/i, '');
  }
  return path.replace(/\.pdf$/i, '');
};

const toIsoString = (value: unknown) => {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.valueOf()) ? undefined : parsed.toISOString();
};

const buildStatementProgress = (
  nextStatus: string,
  totalChecks: number,
  checksQueued: number,
  checksProcessing: number,
  checksReady: number,
  checksFailed: number
) => ({
  phase: nextStatus,
  totalChecks,
  checksQueued,
  checksProcessing,
  checksReady,
  checksFailed,
  completedChecks: checksReady + checksFailed,
  remainingChecks: Math.max(totalChecks - (checksReady + checksFailed), 0)
});

const buildStatementArtifacts = (statement: any, nextStatus: string) => {
  const existingArtifacts = statement?.artifacts ?? {};
  const stageTimestamps = existingArtifacts.stageTimestamps ?? {};
  return {
    pageImagePaths: Array.isArray(existingArtifacts.pageImagePaths)
      ? existingArtifacts.pageImagePaths.map((value: unknown) => String(value))
      : [],
    ocrPath: existingArtifacts.ocrPath ?? undefined,
    ocrTextPath: existingArtifacts.ocrTextPath ?? undefined,
    geminiPath: existingArtifacts.geminiPath ?? undefined,
    detectionEvidence:
      existingArtifacts.detectionEvidence ?? (statement as any).detectionEvidence ?? undefined,
    detectedStatementMonth:
      existingArtifacts.detectedStatementMonth ?? statement.statementMonth ?? undefined,
    detectedStatementDate:
      existingArtifacts.detectedStatementDate ??
      statement.periodEnd ??
      statement.periodStart ??
      undefined,
    autoAppliedStatementMonth: Boolean(existingArtifacts.autoAppliedStatementMonth ?? false),
    stageTimestamps: {
      uploadedAt: toIsoString(stageTimestamps.uploadedAt ?? statement.createdAt),
      extractingAt:
        toIsoString(stageTimestamps.extractingAt) ??
        (['extracting', 'structuring', 'checks_queued', 'ready_for_review'].includes(nextStatus)
          ? toIsoString(statement.updatedAt)
          : undefined),
      structuringAt:
        toIsoString(stageTimestamps.structuringAt) ??
        (['structuring', 'checks_queued', 'ready_for_review'].includes(nextStatus)
          ? toIsoString(statement.updatedAt)
          : undefined),
      checksQueuedAt:
        toIsoString(stageTimestamps.checksQueuedAt) ??
        (['checks_queued', 'ready_for_review'].includes(nextStatus)
          ? toIsoString(statement.updatedAt)
          : undefined),
      readyForReviewAt:
        toIsoString(stageTimestamps.readyForReviewAt) ??
        (nextStatus === 'ready_for_review' ? toIsoString(statement.updatedAt) : undefined),
      failedAt:
        toIsoString(stageTimestamps.failedAt) ??
        (nextStatus === 'failed' ? toIsoString(statement.updatedAt) : undefined)
    }
  };
};

const buildCheckArtifacts = (check: any, rootPrefix: string) => {
  const existingArtifacts = check?.artifacts ?? {};
  const stageTimestamps = existingArtifacts.stageTimestamps ?? {};
  const frontPath = String(check?.gcs?.frontPath ?? `${rootPrefix}/derived/checks/extracted/legacy/front.jpg`);
  return {
    pageNumber:
      existingArtifacts.pageNumber ?? (check?.sourceLocator?.pageNumber != null ? Number(check.sourceLocator.pageNumber) : undefined),
    cropBBox: Array.isArray(existingArtifacts.cropBBox)
      ? existingArtifacts.cropBBox.map((value: unknown) => Number(value))
      : undefined,
    cropImagePath: existingArtifacts.cropImagePath ?? frontPath,
    ocrTextPath: existingArtifacts.ocrTextPath ?? check?.gcs?.ocrPath ?? undefined,
    ocrJsonPath: existingArtifacts.ocrJsonPath ?? check?.gcs?.structuredPath ?? undefined,
    geminiPath: existingArtifacts.geminiPath ?? undefined,
    stageTimestamps: {
      queuedAt: toIsoString(stageTimestamps.queuedAt ?? check.createdAt),
      processingAt:
        toIsoString(stageTimestamps.processingAt) ??
        (check.status === 'processing' ? toIsoString(check.updatedAt) : undefined),
      processedAt:
        toIsoString(stageTimestamps.processedAt) ??
        (['ready', 'needs_review'].includes(String(check.status))
          ? toIsoString(check.updatedAt)
          : undefined),
      failedAt:
        toIsoString(stageTimestamps.failedAt) ??
        (check.status === 'failed' ? toIsoString(check.updatedAt) : undefined)
    }
  };
};

const buildCheckProcessing = (check: any) => ({
  retryCount: Number(check?.processing?.retryCount ?? 0),
  lastError:
    check?.processing?.lastError ??
    (Array.isArray(check?.errors) && check.errors.length > 0 ? String(check.errors[0]) : undefined),
  queuedAt: toIsoString(check?.processing?.queuedAt ?? check.createdAt),
  processingAt:
    toIsoString(check?.processing?.processingAt) ??
    (check.status === 'processing' ? toIsoString(check.updatedAt) : undefined),
  processedAt:
    toIsoString(check?.processing?.processedAt) ??
    (['ready', 'needs_review', 'failed'].includes(String(check.status))
      ? toIsoString(check.updatedAt)
      : undefined)
});

const buildCheckExtracted = (check: any) => {
  const autoFill = check?.autoFill ?? {};
  if (!Object.keys(autoFill).length) return undefined;
  return {
    checkNumber: autoFill.checkNumber ?? undefined,
    date: autoFill.date ?? undefined,
    payeeName: autoFill.payeeName ?? undefined,
    amount: autoFill.amount != null ? Number(autoFill.amount) : undefined,
    memo: autoFill.memo ?? undefined,
    source: 'legacy' as const
  };
};

const buildTransactionEvidence = (args: {
  transaction: any;
  statement: any;
  rootPrefix: string;
  check?: any;
}) => {
  const { transaction, statement, rootPrefix, check } = args;
  const pageImagePath = transaction?.evidence?.pageImagePath
    ?? (transaction?.sourceLocator?.pageNumber != null
      ? `${rootPrefix}/derived/pages/page-${String(transaction.sourceLocator.pageNumber).padStart(3, '0')}.png`
      : undefined);

  return {
    statementPdfPath: transaction?.evidence?.statementPdfPath ?? statement?.gcs?.pdfPath ?? undefined,
    pageImagePath,
    checkCropPath: transaction?.evidence?.checkCropPath ?? check?.artifacts?.cropImagePath ?? undefined,
    ocrPath: transaction?.evidence?.ocrPath ?? check?.artifacts?.ocrJsonPath ?? undefined,
    geminiPath: transaction?.evidence?.geminiPath ?? check?.artifacts?.geminiPath ?? undefined
  };
};

export const migrateAccounting = async (apply = false) => {
  const statements = await BankStatement.find({}).lean();
  let statementsTouched = 0;
  let transactionsCreated = 0;
  let checksCreated = 0;
  let ledgerCreated = 0;

  for (const statement of statements) {
    const statementId = String(statement._id);
    const companyId = String(statement.companyId);
    const legacyFiles = (statement as any).files;
    const legacyExtraction = (statement as any).extraction;
    const legacyTransactions = Array.isArray(legacyExtraction?.structuredJson?.transactions)
      ? legacyExtraction.structuredJson.transactions
      : [];
    const legacyChecks = Array.isArray(legacyFiles?.checks) ? legacyFiles.checks : [];

    const pdfPath = statement?.gcs?.pdfPath ?? legacyFiles?.pdf?.gcsPath;
    const rootPrefix = statement?.gcs?.rootPrefix ?? deriveRootPrefix(pdfPath);
    if (!pdfPath || !rootPrefix) {
      continue;
    }

    const nextStatus = normalizeStatus(
      String((statement as any).status ?? (statement as any).processingStage ?? 'uploaded')
    );

    const progress = buildStatementProgress(
      nextStatus,
      Number(statement?.progress?.totalChecks ?? legacyChecks.length ?? 0),
      Number(statement?.progress?.checksQueued ?? 0),
      Number(statement?.progress?.checksProcessing ?? 0),
      Number(statement?.progress?.checksReady ?? legacyChecks.length ?? 0),
      Number(statement?.progress?.checksFailed ?? 0)
    );
    const artifacts = buildStatementArtifacts(statement, nextStatus);

    const issues = Array.isArray(statement?.issues)
      ? statement.issues
      : Array.isArray(legacyExtraction?.issues)
        ? legacyExtraction.issues
        : [];

    if (apply) {
      await BankStatement.updateOne(
        { _id: statement._id },
        {
          $set: {
            status: nextStatus,
            gcs: {
              rootPrefix,
              pdfPath
            },
            progress,
            artifacts,
            issues
          },
          $unset: {
            processingStage: '',
            files: '',
            extraction: '',
            jobRuns: ''
          }
        }
      );
    }
    statementsTouched += 1;

    const hasTransactions = await StatementTransactionModel.countDocuments({
      companyId,
      statementId
    });

    if (hasTransactions === 0) {
      for (const [index, transaction] of legacyTransactions.entries()) {
        const createdId = new mongoose.Types.ObjectId();
        const postDate = String(transaction.date ?? '').slice(0, 10) || new Date().toISOString().slice(0, 10);
        const amount = Math.abs(Number(transaction.amount ?? 0));
        const type = transaction.type === 'credit' ? 'credit' : 'debit';

        if (apply) {
          await StatementTransactionModel.create({
            _id: createdId,
            statementId,
            companyId,
            postDate,
            description: String(transaction.description ?? 'Legacy transaction'),
            merchant: String(transaction.merchant ?? transaction.description ?? ''),
            amount,
            type,
            statementCheckId: transaction.statementCheckId ? String(transaction.statementCheckId) : undefined,
            sourceLocator: {
              rowIndex: index
            },
            evidence: {
              statementPdfPath: pdfPath,
              pageImagePath: transaction.pageImagePath ?? undefined,
              checkCropPath: transaction.checkCropPath ?? undefined,
              ocrPath: transaction.ocrPath ?? undefined,
              geminiPath: transaction.geminiPath ?? undefined
            },
            proposal: {
              memo: String(transaction.description ?? ''),
              confidence: Number(transaction.confidence ?? 0.4),
              reasons: ['Migrated from legacy extraction payload'],
              status: 'proposed',
              version: 'v1'
            },
            reviewStatus: 'proposed',
            posting: {
              status: 'not_posted'
            }
          });

          await LedgerEntryModel.updateOne(
            {
              companyId,
              statementId,
              statementTransactionId: createdId.toString()
            },
            {
              $setOnInsert: {
                companyId,
                sourceType: 'statement',
                statementId,
                statementTransactionId: createdId.toString(),
                date: postDate,
                description: String(transaction.description ?? 'Legacy transaction'),
                merchant: String(transaction.merchant ?? transaction.description ?? ''),
                amount,
                type,
                attachments: {
                  statementPdfPath: pdfPath
                },
                proposal: {
                  memo: String(transaction.description ?? ''),
                  confidence: Number(transaction.confidence ?? 0.4),
                  reasons: ['Migrated from legacy extraction payload'],
                  status: 'proposed',
                  version: 'v1'
                },
                reviewStatus: 'proposed',
                posting: {
                  status: 'not_posted'
                }
              }
            },
            { upsert: true }
          );
        }
        transactionsCreated += 1;
      }
    }

    const transactionDocs = await StatementTransactionModel.find({
      companyId,
      statementId
    }).lean();
    const checkDocsForStatement = await StatementCheckModel.find({
      companyId,
      statementId
    }).lean();
    const checkByTransactionId = new Map<string, any>();
    for (const check of checkDocsForStatement) {
      const transactionId = String(check?.match?.statementTransactionId ?? '');
      if (transactionId) {
        checkByTransactionId.set(transactionId, check);
      }
    }

    for (const txn of transactionDocs) {
      const linkedCheck = checkByTransactionId.get(String(txn._id)) ?? null;
      const linkedCheckArtifacts = linkedCheck ? buildCheckArtifacts(linkedCheck, rootPrefix) : null;
      const evidence = buildTransactionEvidence({
        transaction: txn,
        statement,
        rootPrefix,
        check: linkedCheck ? { ...linkedCheck, artifacts: linkedCheckArtifacts } : undefined
      });
      const ledgerExists = await LedgerEntryModel.countDocuments({
        companyId,
        statementId,
        statementTransactionId: String(txn._id)
      });

      if (apply) {
        await StatementTransactionModel.updateOne(
          { _id: txn._id, companyId, statementId },
          {
            $set: {
              statementCheckId: linkedCheck?._id ? String(linkedCheck._id) : txn.statementCheckId ?? undefined,
              evidence
            }
          }
        );

        await LedgerEntryModel.updateOne(
          {
            companyId,
            statementId,
            statementTransactionId: String(txn._id)
          },
          {
            $setOnInsert: {
              companyId,
              sourceType: 'statement',
              statementId,
              statementTransactionId: String(txn._id),
              date: txn.postDate,
              description: txn.description,
              merchant: txn.merchant,
              amount: txn.amount,
              type: txn.type,
              reviewStatus: txn.reviewStatus ?? 'proposed',
              posting: txn.posting ?? {
                status: 'not_posted'
              },
              proposal: txn.proposal ?? {
                confidence: 0,
                reasons: [],
                status: 'proposed',
                version: 'v1'
              }
            },
            $set: {
              statementCheckId: linkedCheck?._id ? String(linkedCheck._id) : txn.statementCheckId ?? undefined,
              attachments: {
                statementPdfPath: evidence.statementPdfPath ?? undefined,
                statementPageImagePath: evidence.pageImagePath ?? undefined,
                checkFrontPath: linkedCheck?.gcs?.frontPath ?? undefined,
                checkBackPath: linkedCheck?.gcs?.backPath ?? undefined,
                checkCropPath: linkedCheckArtifacts?.cropImagePath ?? undefined,
                ocrPath: linkedCheckArtifacts?.ocrJsonPath ?? undefined,
                geminiPath: linkedCheckArtifacts?.geminiPath ?? undefined
              }
            }
          },
          { upsert: true }
        );
      }

      if (ledgerExists === 0) {
        ledgerCreated += 1;
      }
    }

    const hasChecks = await StatementCheckModel.countDocuments({
      companyId,
      statementId
    });

    if (hasChecks === 0) {
      for (const check of legacyChecks) {
        if (!apply) {
          checksCreated += 1;
          continue;
        }

        await StatementCheckModel.create({
          statementId,
          companyId,
          status: 'needs_review',
          artifacts: {
            pageNumber: check.pageNumber != null ? Number(check.pageNumber) : undefined,
            cropBBox: Array.isArray(check.cropBBox) ? check.cropBBox.map((value: unknown) => Number(value)) : undefined,
            cropImagePath:
              String(
                check.gcsPath ?? `${rootPrefix}/derived/checks/extracted/${check.checkId ?? 'legacy'}/front.jpg`
              ),
            ocrTextPath: check.ocrTextPath ?? undefined,
            ocrJsonPath: check.ocrJsonPath ?? undefined,
            geminiPath: check.geminiPath ?? undefined,
            stageTimestamps: {
              queuedAt: toIsoString(check.createdAt) ?? new Date().toISOString(),
              processedAt: toIsoString(check.updatedAt) ?? undefined
            }
          },
          extracted: buildCheckExtracted(check),
          processing: {
            retryCount: 0,
            lastError: Array.isArray(check.errors) && check.errors.length > 0 ? String(check.errors[0]) : undefined,
            queuedAt: toIsoString(check.createdAt) ?? new Date().toISOString(),
            processingAt: undefined,
            processedAt: toIsoString(check.updatedAt) ?? undefined
          },
          gcs: {
            frontPath: String(check.gcsPath ?? `${rootPrefix}/derived/checks/extracted/${check.checkId ?? 'legacy'}/front.jpg`),
            backPath: undefined,
            ocrPath: undefined,
            structuredPath: undefined
          },
          match: {
            statementTransactionId: check.linkedTransactionId ? String(check.linkedTransactionId) : undefined,
            matchConfidence: 0.5,
            reasons: ['Migrated from legacy check payload']
          },
          errors: []
        });
        checksCreated += 1;
      }
    }

    const checks = await StatementCheckModel.find({ companyId, statementId }).lean();
    const transactionsById = new Map(transactionDocs.map((txn) => [String(txn._id), txn]));

    for (const check of checks) {
      const linkedTransactionId = String(check?.match?.statementTransactionId ?? '');
      const linkedTransaction = linkedTransactionId ? transactionsById.get(linkedTransactionId) ?? null : null;
      const checkArtifacts = buildCheckArtifacts(check, rootPrefix);
      const checkProcessing = buildCheckProcessing(check);
      const checkExtracted = buildCheckExtracted(check);

      if (apply) {
        await StatementCheckModel.updateOne(
          { _id: check._id, companyId, statementId },
          {
            $set: {
              artifacts: checkArtifacts,
              processing: checkProcessing,
              ...(checkExtracted ? { extracted: checkExtracted } : {}),
              match: {
                ...(check.match ?? {}),
                statementTransactionId: linkedTransaction?._id
                  ? String(linkedTransaction._id)
                  : check.match?.statementTransactionId,
                reasons: Array.isArray(check.match?.reasons) && check.match.reasons.length > 0
                  ? check.match.reasons
                  : ['Migrated from legacy check payload']
              }
            }
          }
        );
      }

      if (linkedTransaction && apply) {
        const evidence = buildTransactionEvidence({
          transaction: linkedTransaction,
          statement,
          rootPrefix,
          check: { ...check, artifacts: checkArtifacts }
        });
        await StatementTransactionModel.updateOne(
          { _id: linkedTransaction._id, companyId, statementId },
          {
            $set: {
              statementCheckId: String(check._id),
              evidence
            }
          }
        );
      }
    }
  }

  return {
    statementsScanned: statements.length,
    statementsTouched,
    transactionsCreated,
    checksCreated,
    ledgerCreated
  };
};

const main = async () => {
  const apply = process.argv.includes('--apply');
  await connectDb();
  const result = await migrateAccounting(apply);
  // eslint-disable-next-line no-console
  console.info(
    JSON.stringify(
      {
        mode: apply ? 'apply' : 'dry-run',
        ...result
      },
      null,
      2
    )
  );
  await mongoose.disconnect();
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(async (error) => {
    // eslint-disable-next-line no-console
    console.error('[migrateAccounting] failed', error);
    await mongoose.disconnect();
    process.exit(1);
  });
}
