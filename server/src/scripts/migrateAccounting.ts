import mongoose from 'mongoose';
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

const migrate = async (apply = false) => {
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

    const pdfPath = statement?.gcs?.pdfPath ?? legacyFiles?.pdf?.gcsPath;
    const rootPrefix = statement?.gcs?.rootPrefix ?? deriveRootPrefix(pdfPath);
    if (!pdfPath || !rootPrefix) {
      continue;
    }

    const nextStatus = normalizeStatus(
      String((statement as any).status ?? (statement as any).processingStage ?? 'uploaded')
    );

    const progress = {
      totalChecks: Number(statement?.progress?.totalChecks ?? legacyFiles?.checks?.length ?? 0),
      checksQueued: Number(statement?.progress?.checksQueued ?? 0),
      checksProcessing: Number(statement?.progress?.checksProcessing ?? 0),
      checksReady: Number(statement?.progress?.checksReady ?? legacyFiles?.checks?.length ?? 0),
      checksFailed: Number(statement?.progress?.checksFailed ?? 0)
    };

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
      const legacyTransactions = Array.isArray(legacyExtraction?.structuredJson?.transactions)
        ? legacyExtraction.structuredJson.transactions
        : [];

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
            sourceLocator: {
              rowIndex: index
            },
            evidence: {
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
        ledgerCreated += 1;
      }
    }

    const hasChecks = await StatementCheckModel.countDocuments({
      companyId,
      statementId
    });

    if (hasChecks === 0) {
      const legacyChecks = Array.isArray(legacyFiles?.checks) ? legacyFiles.checks : [];
      for (const check of legacyChecks) {
        if (!apply) {
          checksCreated += 1;
          continue;
        }

        await StatementCheckModel.create({
          statementId,
          companyId,
          status: 'needs_review',
          gcs: {
            frontPath: String(check.gcsPath ?? `${rootPrefix}/derived/checks/extracted/${check.checkId ?? 'legacy'}/front.jpg`),
            backPath: null,
            ocrPath: null,
            structuredPath: null
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
  const result = await migrate(apply);
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

main().catch(async (error) => {
  // eslint-disable-next-line no-console
  console.error('[migrateAccounting] failed', error);
  await mongoose.disconnect();
  process.exit(1);
});
