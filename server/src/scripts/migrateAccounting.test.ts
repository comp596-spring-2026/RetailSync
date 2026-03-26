import { beforeEach, describe, expect, it, vi } from 'vitest';

type StatementRecord = Record<string, any>;
type TransactionRecord = Record<string, any>;
type CheckRecord = Record<string, any>;
type LedgerRecord = Record<string, any>;

const state = vi.hoisted(() => ({
  statements: [] as StatementRecord[],
  transactions: [] as TransactionRecord[],
  checks: [] as CheckRecord[],
  ledgers: [] as LedgerRecord[]
}));

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const matchesFilter = (record: Record<string, any>, filter: Record<string, any>) =>
  Object.entries(filter).every(([key, expected]) => String(record[key]) === String(expected));

const upsertRecord = (
  collection: Array<Record<string, any>>,
  filter: Record<string, any>,
  update: Record<string, any>
) => {
  const existing = collection.find((record) => matchesFilter(record, filter));
  const applySet = (target: Record<string, any>) => {
    if (update.$setOnInsert && !existing) {
      Object.assign(target, clone(update.$setOnInsert));
    }
    if (update.$set) {
      Object.assign(target, clone(update.$set));
    }
    if (update.$unset) {
      for (const key of Object.keys(update.$unset)) {
        delete target[key];
      }
    }
  };

  if (existing) {
    applySet(existing);
    return existing;
  }

  const next = { ...clone(filter) };
  applySet(next);
  collection.push(next);
  return next;
};

const makeFind = (collection: Array<Record<string, any>>, filter: Record<string, any>) => ({
  lean: async () => collection.filter((record) => matchesFilter(record, filter)).map(clone)
});

vi.mock('../models/BankStatement', () => ({
  BankStatement: {
    find: vi.fn(() => makeFind(state.statements, {})),
    updateOne: vi.fn(async (filter: Record<string, any>, update: Record<string, any>) => {
      upsertRecord(state.statements, filter, update);
      return { acknowledged: true };
    })
  }
}));

vi.mock('../models/StatementTransaction', () => ({
  StatementTransactionModel: {
    find: vi.fn((filter: Record<string, any>) => makeFind(state.transactions, filter)),
    countDocuments: vi.fn(async (filter: Record<string, any>) =>
      state.transactions.filter((record) => matchesFilter(record, filter)).length
    ),
    create: vi.fn(async (payload: Record<string, any>) => {
      state.transactions.push(clone(payload));
      return payload;
    }),
    updateOne: vi.fn(async (filter: Record<string, any>, update: Record<string, any>) => {
      upsertRecord(state.transactions, filter, update);
      return { acknowledged: true };
    })
  }
}));

vi.mock('../models/StatementCheck', () => ({
  StatementCheckModel: {
    find: vi.fn((filter: Record<string, any>) => makeFind(state.checks, filter)),
    countDocuments: vi.fn(async (filter: Record<string, any>) =>
      state.checks.filter((record) => matchesFilter(record, filter)).length
    ),
    create: vi.fn(async (payload: Record<string, any>) => {
      state.checks.push(clone(payload));
      return payload;
    }),
    updateOne: vi.fn(async (filter: Record<string, any>, update: Record<string, any>) => {
      upsertRecord(state.checks, filter, update);
      return { acknowledged: true };
    })
  }
}));

vi.mock('../models/LedgerEntry', () => ({
  LedgerEntryModel: {
    countDocuments: vi.fn(async (filter: Record<string, any>) =>
      state.ledgers.filter((record) => matchesFilter(record, filter)).length
    ),
    updateOne: vi.fn(async (filter: Record<string, any>, update: Record<string, any>) => {
      upsertRecord(state.ledgers, filter, update);
      return { acknowledged: true };
    })
  }
}));

describe('migrateAccounting', () => {
  beforeEach(() => {
    state.statements = [];
    state.transactions = [];
    state.checks = [];
    state.ledgers = [];
  });

  const seedFixtures = () => {
    const companyId = '507f1f77bcf86cd799439011';

    state.statements.push({
      _id: 'stmt-legacy-create',
      companyId,
      statementMonth: '2026-02',
      fileName: 'legacy-create.pdf',
      source: 'upload',
      status: 'uploaded',
      periodStart: '2026-02-01',
      periodEnd: '2026-02-28',
      gcs: {
        rootPrefix: 'companies/company-a/statements/stmt-legacy-create',
        pdfPath: 'companies/company-a/statements/stmt-legacy-create/original/statement.pdf'
      },
      progress: {
        totalChecks: 1,
        checksQueued: 1,
        checksProcessing: 0,
        checksReady: 0,
        checksFailed: 0
      },
      files: {
        pdf: {
          gcsPath: 'companies/company-a/statements/stmt-legacy-create/original/statement.pdf'
        },
        checks: [
          {
            checkId: 'legacy-create-check',
            pageNumber: 4,
            cropBBox: [10, 20, 30, 40],
            gcsPath: 'companies/company-a/statements/stmt-legacy-create/derived/checks/extracted/legacy-create-check/front.jpg',
            autoFill: {
              checkNumber: '1001',
              date: '2026-02-14',
              payeeName: 'City Utilities',
              amount: 42.75,
              memo: 'Water bill'
            },
            errors: ['first run OCR timeout'],
            createdAt: '2026-03-01T10:00:00.000Z',
            updatedAt: '2026-03-01T11:00:00.000Z'
          }
        ]
      },
      extraction: {
        issues: ['legacy structure'],
        structuredJson: {
          transactions: [
            {
              date: '2026-02-14',
              description: 'City Utilities - water bill',
              merchant: 'City Utilities',
              amount: 42.75,
              type: 'debit',
              confidence: 0.81,
              pageImagePath:
                'companies/company-a/statements/stmt-legacy-create/derived/pages/page-004.png',
              checkCropPath:
                'companies/company-a/statements/stmt-legacy-create/derived/checks/extracted/legacy-create-check/front.jpg',
              ocrPath:
                'companies/company-a/statements/stmt-legacy-create/derived/checks/extracted/legacy-create-check/ocr.json',
              geminiPath:
                'companies/company-a/statements/stmt-legacy-create/derived/checks/extracted/legacy-create-check/gemini.json'
            }
          ]
        }
      },
      issues: [],
      createdAt: '2026-03-01T09:00:00.000Z',
      updatedAt: '2026-03-01T12:00:00.000Z'
    });

    state.statements.push({
      _id: 'stmt-legacy-link',
      companyId,
      statementMonth: '2026-01',
      fileName: 'legacy-link.pdf',
      source: 'upload',
      status: 'processing',
      periodStart: '2026-01-01',
      periodEnd: '2026-01-31',
      gcs: {
        rootPrefix: 'companies/company-a/statements/stmt-legacy-link',
        pdfPath: 'companies/company-a/statements/stmt-legacy-link/original/statement.pdf'
      },
      progress: {
        totalChecks: 1,
        checksQueued: 0,
        checksProcessing: 1,
        checksReady: 0,
        checksFailed: 0
      },
      files: {
        pdf: {
          gcsPath: 'companies/company-a/statements/stmt-legacy-link/original/statement.pdf'
        },
        checks: []
      },
      extraction: {
        structuredJson: { transactions: [] }
      },
      issues: [],
      createdAt: '2026-02-01T09:00:00.000Z',
      updatedAt: '2026-02-01T12:00:00.000Z'
    });

    state.transactions.push({
      _id: 'txn-linked-1',
      statementId: 'stmt-legacy-link',
      companyId,
      postDate: '2026-01-10',
      description: 'Office Depot',
      merchant: 'Office Depot',
      amount: 123.45,
      type: 'debit',
      balanceAfter: 1000,
      sourceLocator: { pageNumber: 2, rowIndex: 1, bbox: [1, 2, 3, 4] },
      evidence: {
        statementPdfPath: 'companies/company-a/statements/stmt-legacy-link/original/statement.pdf'
      },
      proposal: {
        memo: 'Office supplies',
        confidence: 0.7,
        reasons: ['legacy'],
        status: 'proposed',
        version: 'v1'
      },
      reviewStatus: 'proposed',
      posting: { status: 'not_posted' },
      createdAt: '2026-02-01T10:00:00.000Z',
      updatedAt: '2026-02-01T10:00:00.000Z'
    });

    state.checks.push({
      _id: 'check-linked-1',
      statementId: 'stmt-legacy-link',
      companyId,
      status: 'ready',
      artifacts: {
        pageNumber: 2,
        cropBBox: [11, 22, 33, 44],
        cropImagePath:
          'companies/company-a/statements/stmt-legacy-link/derived/checks/extracted/check-linked-1/front.jpg',
        ocrTextPath:
          'companies/company-a/statements/stmt-legacy-link/derived/checks/extracted/check-linked-1/ocr.txt',
        ocrJsonPath:
          'companies/company-a/statements/stmt-legacy-link/derived/checks/extracted/check-linked-1/ocr.json',
        geminiPath:
          'companies/company-a/statements/stmt-legacy-link/derived/checks/extracted/check-linked-1/gemini.json',
        stageTimestamps: {
          queuedAt: '2026-02-01T10:00:00.000Z',
          processedAt: '2026-02-01T11:00:00.000Z'
        }
      },
      extracted: {
        checkNumber: '2001',
        date: '2026-01-10',
        payeeName: 'Office Depot',
        amount: 123.45,
        memo: 'Office supplies',
        source: 'ocr'
      },
      processing: {
        retryCount: 2,
        lastError: 'OCR timeout',
        queuedAt: '2026-02-01T10:00:00.000Z',
        processingAt: '2026-02-01T10:15:00.000Z',
        processedAt: '2026-02-01T11:00:00.000Z'
      },
      autoFill: {
        checkNumber: '2001',
        date: '2026-01-10',
        payeeName: 'Office Depot',
        amount: 123.45,
        memo: 'Office supplies'
      },
      gcs: {
        frontPath:
          'companies/company-a/statements/stmt-legacy-link/derived/checks/extracted/check-linked-1/front.jpg',
        backPath: undefined,
        ocrPath:
          'companies/company-a/statements/stmt-legacy-link/derived/checks/extracted/check-linked-1/ocr.json',
        structuredPath:
          'companies/company-a/statements/stmt-legacy-link/derived/checks/extracted/check-linked-1/structured.json'
      },
      match: {
        statementTransactionId: 'txn-linked-1',
        matchConfidence: 0.9,
        reasons: ['legacy']
      },
      errors: ['OCR timeout'],
      createdAt: '2026-02-01T10:00:00.000Z',
      updatedAt: '2026-02-01T11:00:00.000Z'
    });
  };

  it('backfills additive persistence fields in dry-run mode without mutating records', async () => {
    seedFixtures();
    const snapshot = clone({
      statements: state.statements,
      transactions: state.transactions,
      checks: state.checks,
      ledgers: state.ledgers
    });

    const { migrateAccounting } = await import('./migrateAccounting');
    const result = await migrateAccounting(false);

    expect(result).toMatchObject({
      statementsScanned: 2,
      statementsTouched: 2,
      transactionsCreated: 1,
      checksCreated: 1
    });
    expect(result.ledgerCreated).toBeGreaterThan(0);
    expect(state.statements).toEqual(snapshot.statements);
    expect(state.transactions).toEqual(snapshot.transactions);
    expect(state.checks).toEqual(snapshot.checks);
    expect(state.ledgers).toEqual(snapshot.ledgers);
  });

  it('backfills artifacts, links evidence, and remains idempotent on rerun', async () => {
    seedFixtures();
    const { migrateAccounting } = await import('./migrateAccounting');

    const firstRun = await migrateAccounting(true);
    expect(firstRun).toMatchObject({
      statementsScanned: 2,
      statementsTouched: 2,
      transactionsCreated: 1,
      checksCreated: 1
    });
    expect(firstRun.ledgerCreated).toBeGreaterThan(0);

    const legacyCreateStatement = state.statements.find(
      (record) => record._id === 'stmt-legacy-create'
    );
    const legacyLinkStatement = state.statements.find(
      (record) => record._id === 'stmt-legacy-link'
    );
    const createdTransaction = state.transactions.find(
      (record) => record.statementId === 'stmt-legacy-create'
    );
    const linkedTransaction = state.transactions.find(
      (record) => record._id === 'txn-linked-1'
    );
    const linkedCheck = state.checks.find((record) => record._id === 'check-linked-1');
    const createdLedger = state.ledgers.find(
      (record) => record.statementId === 'stmt-legacy-create'
    );
    const linkedLedger = state.ledgers.find((record) => record.statementId === 'stmt-legacy-link');

    expect(legacyCreateStatement?.artifacts).toMatchObject({
      detectedStatementMonth: '2026-02',
      detectedStatementDate: '2026-02-28',
      autoAppliedStatementMonth: false
    });
    expect(legacyCreateStatement?.progress).toMatchObject({
      phase: 'uploaded',
      completedChecks: 0,
      remainingChecks: 1
    });
    expect(legacyLinkStatement?.progress).toMatchObject({
      phase: 'extracting',
      completedChecks: 0,
      remainingChecks: 1
    });

    expect(createdTransaction?.statementCheckId).toBeUndefined();
    expect(createdTransaction?.evidence).toMatchObject({
      statementPdfPath: 'companies/company-a/statements/stmt-legacy-create/original/statement.pdf',
      pageImagePath:
        'companies/company-a/statements/stmt-legacy-create/derived/pages/page-004.png',
      checkCropPath:
        'companies/company-a/statements/stmt-legacy-create/derived/checks/extracted/legacy-create-check/front.jpg',
      ocrPath:
        'companies/company-a/statements/stmt-legacy-create/derived/checks/extracted/legacy-create-check/ocr.json',
      geminiPath:
        'companies/company-a/statements/stmt-legacy-create/derived/checks/extracted/legacy-create-check/gemini.json'
    });

    expect(linkedTransaction?.statementCheckId).toBe('check-linked-1');
    expect(linkedTransaction?.evidence).toMatchObject({
      statementPdfPath: 'companies/company-a/statements/stmt-legacy-link/original/statement.pdf',
      pageImagePath:
        'companies/company-a/statements/stmt-legacy-link/derived/pages/page-002.png',
      checkCropPath:
        'companies/company-a/statements/stmt-legacy-link/derived/checks/extracted/check-linked-1/front.jpg',
      ocrPath:
        'companies/company-a/statements/stmt-legacy-link/derived/checks/extracted/check-linked-1/ocr.json',
      geminiPath:
        'companies/company-a/statements/stmt-legacy-link/derived/checks/extracted/check-linked-1/gemini.json'
    });

    expect(linkedCheck?.artifacts).toMatchObject({
      cropImagePath:
        'companies/company-a/statements/stmt-legacy-link/derived/checks/extracted/check-linked-1/front.jpg',
      ocrJsonPath:
        'companies/company-a/statements/stmt-legacy-link/derived/checks/extracted/check-linked-1/ocr.json',
      geminiPath:
        'companies/company-a/statements/stmt-legacy-link/derived/checks/extracted/check-linked-1/gemini.json'
    });
    expect(linkedCheck?.processing).toMatchObject({
      retryCount: 2,
      lastError: 'OCR timeout',
      processedAt: '2026-02-01T11:00:00.000Z'
    });
    expect(linkedCheck?.extracted).toMatchObject({
      checkNumber: '2001',
      payeeName: 'Office Depot',
      amount: 123.45,
      source: 'legacy'
    });

    expect(createdLedger).toMatchObject({
      attachments: {
        statementPdfPath: 'companies/company-a/statements/stmt-legacy-create/original/statement.pdf',
        statementPageImagePath:
          'companies/company-a/statements/stmt-legacy-create/derived/pages/page-004.png'
      }
    });
    expect(linkedLedger).toMatchObject({
      statementCheckId: 'check-linked-1',
      attachments: {
        statementPdfPath: 'companies/company-a/statements/stmt-legacy-link/original/statement.pdf',
        statementPageImagePath:
          'companies/company-a/statements/stmt-legacy-link/derived/pages/page-002.png',
        checkFrontPath:
          'companies/company-a/statements/stmt-legacy-link/derived/checks/extracted/check-linked-1/front.jpg',
        checkCropPath:
          'companies/company-a/statements/stmt-legacy-link/derived/checks/extracted/check-linked-1/front.jpg',
        ocrPath:
          'companies/company-a/statements/stmt-legacy-link/derived/checks/extracted/check-linked-1/ocr.json',
        geminiPath:
          'companies/company-a/statements/stmt-legacy-link/derived/checks/extracted/check-linked-1/gemini.json'
      }
    });
    expect(state.ledgers).toHaveLength(2);

    const secondRun = await migrateAccounting(true);
    expect(secondRun).toMatchObject({
      statementsScanned: 2,
      statementsTouched: 2,
      transactionsCreated: 0,
      checksCreated: 0,
      ledgerCreated: 0
    });
    expect(state.transactions.filter((record) => record.statementId === 'stmt-legacy-create')).toHaveLength(1);
    expect(state.checks.filter((record) => record.statementId === 'stmt-legacy-create')).toHaveLength(1);
    expect(state.ledgers.filter((record) => record.statementId === 'stmt-legacy-create')).toHaveLength(1);
  });
});
