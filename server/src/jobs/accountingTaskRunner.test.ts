import { beforeEach, describe, expect, it, vi } from 'vitest';

const stores = vi.hoisted(() => {
  const pdfBuffer = Buffer.from(
    '%PDF-1.4\n1 0 obj\n<< /Type /Page >>\nendobj\n2 0 obj\n<< /Type /Page >>\nendobj\n'
  );

  return {
    pdfBuffer,
    files: new Map<string, Buffer | string>(),
    statements: [] as Array<Record<string, any>>,
    transactions: [] as Array<Record<string, any>>,
    checks: [] as Array<Record<string, any>>,
    ledgerEntries: [] as Array<Record<string, any>>,
    runs: [] as Array<Record<string, any>>
  };
});

const getId = (value: unknown, fallback: string) => {
  if (typeof value === 'string' && value.trim()) return value;
  if (value && typeof value === 'object' && '_id' in value && typeof (value as { _id?: unknown })._id === 'string') {
    return String((value as { _id?: unknown })._id);
  }
  return fallback;
};

const makeQueryResult = <T,>(value: T) => ({
  sort: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue(value),
  select: vi.fn().mockReturnThis(),
  lean: vi.fn().mockResolvedValue(value)
});

const assignDeep = (target: Record<string, any>, path: string, value: unknown) => {
  const parts = path.split('.');
  let cursor = target;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const key = parts[index];
    if (!cursor[key] || typeof cursor[key] !== 'object') {
      cursor[key] = {};
    }
    cursor = cursor[key];
  }
  cursor[parts[parts.length - 1]] = value;
};

vi.mock('../config/env', () => ({
  env: {
    gcsBucketName: 'accounting-bucket',
    tasksMode: 'inline',
    accessSecret: 'secret'
  }
}));

vi.mock('../integrations/google/storage.client', () => ({
  getStorageClient: () => ({
    bucket: () => ({
      file: (objectPath: string) => ({
        exists: vi.fn(async () => [stores.files.has(objectPath)] as const),
        save: vi.fn(async (data: Buffer | string) => {
          stores.files.set(objectPath, typeof data === 'string' ? data : Buffer.from(data));
        }),
        download: vi.fn(async () => {
          const existing = stores.files.get(objectPath);
          if (typeof existing === 'string') {
            return [Buffer.from(existing)] as const;
          }
          if (existing) {
            return [Buffer.from(existing)] as const;
          }
          if (objectPath.endsWith('.pdf')) {
            return [stores.pdfBuffer] as const;
          }
          throw new Error(`Missing test file: ${objectPath}`);
        })
      })
    })
  })
}));

const renderAndPersistStatementPagesMock = vi.fn();
vi.mock('../services/accountingPdfRenderService', () => ({
  renderAndPersistStatementPages: (...args: unknown[]) => renderAndPersistStatementPagesMock(...args)
}));

const ocrStatementPagesMock = vi.fn();
vi.mock('../services/accountingStatementOcrService', () => ({
  ocrStatementPages: (...args: unknown[]) => ocrStatementPagesMock(...args)
}));

const runStatementCheckExtractionMock = vi.fn();
vi.mock('../services/accountingCheckExtractionService', () => ({
  runStatementCheckExtraction: (...args: unknown[]) => runStatementCheckExtractionMock(...args)
}));

const buildMatchingProposalMock = vi.fn();
vi.mock('../services/matchingEngine', () => ({
  buildMatchingProposal: (...args: unknown[]) => buildMatchingProposalMock(...args)
}));

const runAccountingGeminiProposalMock = vi.fn();
vi.mock('../services/accountingGeminiProposalService', () => ({
  runAccountingGeminiProposal: (...args: unknown[]) => runAccountingGeminiProposalMock(...args)
}));

vi.mock('../services/quickbooksSyncService', () => ({
  markQuickBooksSyncFailure: vi.fn(),
  postApprovedLedgerEntriesToQuickBooks: vi.fn(),
  syncQuickBooksReferenceData: vi.fn()
}));

vi.mock('../jobs/accountingQueue', () => ({
  enqueueAccountingJob: vi.fn(async () => ({ mode: 'inline' }))
}));

vi.mock('../models/Run', () => ({
  RunModel: {
    create: vi.fn(async (doc) => {
      const run = {
        _id: `run-${stores.runs.length + 1}`,
        ...doc
      };
      stores.runs.push(run);
      return run;
    }),
    updateOne: vi.fn(async () => ({ acknowledged: true }))
  }
}));

vi.mock('../models/BankStatement', () => ({
  BankStatement: {
    findOne: vi.fn(async (query: Record<string, unknown>) => {
      const id = getId(query._id, '');
      const companyId = String(query.companyId ?? '');
      return (
        stores.statements.find((statement) => statement._id === id && statement.companyId === companyId) ?? null
      );
    }),
    create: vi.fn(async (doc: Record<string, any>) => {
      const statement = {
        ...doc,
        _id: getId(doc._id, `statement-${stores.statements.length + 1}`),
        save: vi.fn(async () => undefined)
      };
      stores.statements.push(statement);
      return statement;
    }),
    updateOne: vi.fn(async (query: Record<string, unknown>, update: Record<string, any>) => {
      const id = getId(query._id, '');
      const companyId = String(query.companyId ?? '');
      const statement = stores.statements.find(
        (entry) => entry._id === id && entry.companyId === companyId
      );
      if (!statement) {
        return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
      }

      if (update.$set) {
        Object.entries(update.$set).forEach(([key, value]) => {
          const segments = key.split('.');
          let cursor: Record<string, any> = statement;
          segments.slice(0, -1).forEach((segment) => {
            cursor[segment] = cursor[segment] ?? {};
            cursor = cursor[segment];
          });
          cursor[segments.at(-1) as string] = value;
        });
      }

      return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
    }),
    countDocuments: vi.fn(async () => stores.statements.length)
  }
}));

vi.mock('../models/StatementTransaction', () => ({
  StatementTransactionModel: {
    deleteMany: vi.fn(async () => {
      stores.transactions = stores.transactions.filter((txn) => false);
    }),
    create: vi.fn(async (doc: Record<string, any>) => {
      const txn = {
        ...doc,
        _id: getId(doc._id, `txn-${stores.transactions.length + 1}`),
        save: vi.fn(async () => undefined)
      };
      stores.transactions.push(txn);
      return txn;
    }),
    find: vi.fn((query: Record<string, unknown>) => {
      const statementId = String(query.statementId ?? '');
      const companyId = String(query.companyId ?? '');
      const filtered = stores.transactions.filter(
        (txn) => txn.statementId === statementId && txn.companyId === companyId
      );
      return makeQueryResult(filtered);
    }),
    findOne: vi.fn(async (query: Record<string, unknown>) => {
      const id = getId(query._id, '');
      const statementId = String(query.statementId ?? '');
      const companyId = String(query.companyId ?? '');
      return (
        stores.transactions.find(
          (txn) => txn._id === id && txn.statementId === statementId && txn.companyId === companyId
        ) ?? null
      );
    }),
    updateOne: vi.fn(async (query: Record<string, unknown>, update: Record<string, any>) => {
      const id = getId(query._id, '');
      const txn = stores.transactions.find((item) => item._id === id);
      if (!txn) {
        return { acknowledged: true };
      }
      if (update.$set?.evidence) {
        txn.evidence = update.$set.evidence;
      }
      if (update.$set?.proposal) {
        txn.proposal = update.$set.proposal;
      }
      if (update.$set?.statementCheckId) {
        txn.statementCheckId = update.$set.statementCheckId;
      }
      if (update.$set?.reviewStatus) {
        txn.reviewStatus = update.$set.reviewStatus;
      }
      return { acknowledged: true };
    }),
  }
}));

vi.mock('../models/LedgerEntry', () => ({
  LedgerEntryModel: {
    deleteMany: vi.fn(async () => {
      stores.ledgerEntries = [];
    }),
    create: vi.fn(async (doc: Record<string, any>) => {
      const entry = {
        ...doc,
        _id: `ledger-${stores.ledgerEntries.length + 1}`
      };
      stores.ledgerEntries.push(entry);
      return entry;
    }),
    updateOne: vi.fn(async (query: Record<string, unknown>, update: Record<string, any>) => {
      const txnId = String(query.statementTransactionId ?? '');
      const ledger = stores.ledgerEntries.find((entry) => entry.statementTransactionId === txnId);
      if (ledger && update.$set) {
        for (const [key, value] of Object.entries(update.$set)) {
          if (key.includes('.')) {
            assignDeep(ledger, key, value);
          } else {
            ledger[key] = value;
          }
        }
      }
      return { acknowledged: true };
    }),
    countDocuments: vi.fn(async () => stores.ledgerEntries.length)
  }
}));

vi.mock('../models/StatementCheck', () => ({
  StatementCheckModel: {
    deleteMany: vi.fn(async (query: Record<string, unknown>) => {
      const statementId = String(query.statementId ?? '');
      const companyId = String(query.companyId ?? '');
      stores.checks = stores.checks.filter(
        (check) => !(check.statementId === statementId && check.companyId === companyId)
      );
    }),
    create: vi.fn(async (doc: Record<string, any>) => {
      const check = {
        ...doc,
        _id: getId(doc._id, `check-${stores.checks.length + 1}`),
        save: vi.fn(async () => undefined)
      };
      stores.checks.push(check);
      return check;
    }),
    find: vi.fn((query: Record<string, unknown>) => {
      const statementId = String(query.statementId ?? '');
      const companyId = String(query.companyId ?? '');
      const filtered = stores.checks.filter(
        (check) => check.statementId === statementId && check.companyId === companyId
      );
      return makeQueryResult(filtered);
    }),
    findOne: vi.fn(async (query: Record<string, unknown>) => {
      const id = getId(query._id, '');
      const statementId = String(query.statementId ?? '');
      const companyId = String(query.companyId ?? '');
      return (
        stores.checks.find(
          (check) => check._id === id && check.statementId === statementId && check.companyId === companyId
        ) ?? null
      );
    }),
    updateOne: vi.fn(async (query: Record<string, unknown>, update: Record<string, any>) => {
      const id = getId(query._id, '');
      const check = stores.checks.find((item) => item._id === id);
      if (check && update.$set) {
        Object.assign(check, update.$set);
      }
      return { acknowledged: true };
    }),
    countDocuments: vi.fn(async (query: Record<string, unknown>) => {
      const statementId = String(query.statementId ?? '');
      const companyId = String(query.companyId ?? '');
      const status = query.status ? String(query.status) : null;
      return stores.checks.filter((check) => {
        if (check.statementId !== statementId || check.companyId !== companyId) return false;
        if (status && check.status !== status) return false;
        return true;
      }).length;
    })
  }
}));

describe('accountingTaskRunner', () => {
  beforeEach(() => {
    stores.files.clear();
    stores.statements = [];
    stores.transactions = [];
    stores.checks = [];
    stores.ledgerEntries = [];
    stores.runs = [];
    renderAndPersistStatementPagesMock.mockReset();
    renderAndPersistStatementPagesMock.mockResolvedValue({
      pageCount: 2,
      pageImagePaths: [
        'companies/company-1/statements/2026-01/statement-1/derived/pages/page-001.png',
        'companies/company-1/statements/2026-01/statement-1/derived/pages/page-002.png'
      ],
      pages: [
        { pageNo: 1, fileName: 'page-001.png', buffer: Buffer.from('page-1') },
        { pageNo: 2, fileName: 'page-002.png', buffer: Buffer.from('page-2') }
      ]
    });

    ocrStatementPagesMock.mockReset();
    ocrStatementPagesMock.mockResolvedValue([
      {
        provider: 'vision',
        pageNumber: 1,
        text: 'Statement period 01/03/2026 - 01/31/2026\n2026-01-03 CHECK #1001 ACME SUPPLIES -125.00',
        blocks: [],
        paragraphs: [],
        words: [],
        raw: {},
        checkRegions: [
          {
            pageNumber: 1,
            bbox: { left: 10, top: 20, right: 200, bottom: 120 },
            score: 12,
            confidence: 0.92,
            reasons: ['matched check layout'],
            text: 'CHECK #1001 ACME SUPPLIES -125.00',
            anchor: '10,20-200,120'
          }
        ]
      },
      {
        provider: 'vision',
        pageNumber: 2,
        text: '2026-01-04 COFFEE SHOP -12.50',
        blocks: [],
        paragraphs: [],
        words: [],
        raw: {},
        checkRegions: []
      }
    ]);

    runStatementCheckExtractionMock.mockReset();
    runStatementCheckExtractionMock.mockImplementation(async (args: any) => {
      const key = String(args.checkKey);
      const base = `companies/company-1/statements/2026-01/statement-1/derived/checks/extracted/${key}`;
      return {
        crop: {
          pageNo: 1,
          fileName: 'front.png',
          buffer: Buffer.from('check-crop')
        },
        ocr: {
          provider: 'vision',
          text: 'Check #1001\nDate 01/03/2026\nPay to the order of ACME Supplies\n$125.00',
          blocks: [],
          paragraphs: [],
          words: [],
          raw: {}
        },
        extracted: {
          checkNumber: '1001',
          date: '2026-01-03',
          payeeName: 'ACME Supplies',
          amount: 125,
          memo: 'ACME Supplies',
          source: 'ocr'
        },
        confidence: {
          imageQuality: 0.92,
          ocrConfidence: 0.9,
          fieldConfidence: 1,
          crossValidation: 0.95,
          overall: 0.94
        },
        reasons: ['Detected check number from OCR text', 'Detected payee evidence from OCR text'],
        artifacts: {
          cropImagePath: `${base}/front.png`,
          ocrTextPath: `${base}/ocr.txt`,
          ocrJsonPath: `${base}/ocr.json`,
          structuredPath: `${base}/structured.v1.json`
        }
      };
    });

    buildMatchingProposalMock.mockReset();
    buildMatchingProposalMock.mockResolvedValue({
      qbTxnType: 'Check',
      bankAccountId: 'bank-1',
      categoryAccountId: 'expense-1',
      payeeType: 'vendor',
      payeeId: 'vendor-1',
      payeeName: 'ACME SUPPLIES',
      memo: 'matched',
      confidence: 0.83,
      reasons: ['mocked'],
      status: 'proposed',
      version: 'v1'
    });

    runAccountingGeminiProposalMock.mockReset();
    runAccountingGeminiProposalMock.mockImplementation(async (args: any) => {
      const artifactKey = String(args.checkKey ?? 'statement');
      const artifactBase = args.checkKey
        ? `companies/company-1/statements/2026-01/statement-1/derived/checks/extracted/${artifactKey}`
        : `companies/company-1/statements/2026-01/statement-1/derived/gemini/${artifactKey}`;
      return {
        provider: 'gemini',
        providerStatus: 'healthy',
        degraded: false,
        source: 'hybrid',
        confidence: 0.91,
        proposal: {
          ...args.fallbackProposal,
          confidence: 0.91,
          reasons: [...(args.fallbackProposal?.reasons ?? []), 'Gemini approved'],
          status: 'proposed',
          version: 'v1'
        },
        fallbackProposal: args.fallbackProposal,
        geminiProposal: {
          qbTxnType: 'Check',
          payeeName: 'ACME Supplies',
          confidence: 0.91,
          reasons: ['Gemini approved'],
          version: 'v1'
        },
        reasons: [...(args.fallbackProposal?.reasons ?? []), 'Gemini approved'],
        artifacts: {
          promptPath: `${artifactBase}/proposal.prompt.v1.txt`,
          rawPath: `${artifactBase}/proposal.raw.v1.json`,
          normalizedPath: `${artifactBase}/proposal.normalized.v1.json`
        }
      };
    });
  });

  it('persists statement, check, and progress artifacts through the pipeline', async () => {
    const { runAccountingTask } = await import('./accountingTaskRunner');

    const statement: any = {
      _id: 'statement-1',
      companyId: 'company-1',
      statementMonth: '2026-01',
      fileName: 'statement.pdf',
      source: 'upload',
      status: 'uploaded',
      gcs: {
        rootPrefix: 'companies/company-1/statements/2026-01/statement-1',
        pdfPath: 'companies/company-1/statements/2026-01/statement-1/uploads/statement.pdf'
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
      artifacts: {
        stageTimestamps: {
          uploadedAt: '2026-03-25T00:00:00.000Z'
        }
      },
      issues: [],
      updatedAt: new Date('2026-03-25T00:00:00.000Z'),
      createdAt: new Date('2026-03-25T00:00:00.000Z'),
      save: vi.fn(async () => undefined)
    };
    stores.statements.push(statement);
    stores.files.set(statement.gcs.pdfPath, stores.pdfBuffer);

    await runAccountingTask({
      companyId: 'company-1',
      jobType: 'statement.extract',
      statementId: statement._id,
      attempt: 1,
      meta: { taskId: 'task-1' }
    });

    expect(statement.status).toBe('structuring');
    expect(statement.artifacts.pageImagePaths).toEqual([
      'companies/company-1/statements/2026-01/statement-1/derived/pages/page-001.png',
      'companies/company-1/statements/2026-01/statement-1/derived/pages/page-002.png'
    ]);
    expect(statement.artifacts.ocrTextPath).toBe(
      'companies/company-1/statements/2026-01/statement-1/derived/ocr/text.txt'
    );
    expect(typeof statement.artifacts.detectionEvidence).toBe('string');
    expect(statement.progress.phase).toBe('structuring');

    await runAccountingTask({
      companyId: 'company-1',
      jobType: 'statement.structure',
      statementId: statement._id,
      attempt: 1,
      meta: { taskId: 'task-2' }
    });

    expect(stores.transactions).toHaveLength(2);
    expect(stores.ledgerEntries).toHaveLength(2);
    expect(statement.status).toBe('checks_queued');
    expect(statement.artifacts.geminiPath).toBe(
      'companies/company-1/statements/2026-01/statement-1/derived/gemini/normalized.v1.json'
    );
    expect(stores.transactions[0].sourceLocator.bbox).toEqual([10, 20, 200, 120]);
    expect(runAccountingGeminiProposalMock).toHaveBeenCalledTimes(2);
    expect(buildMatchingProposalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        check: expect.objectContaining({
          extracted: expect.objectContaining({
            checkNumber: '1001'
          })
        })
      })
    );

    await runAccountingTask({
      companyId: 'company-1',
      jobType: 'checks.spawn',
      statementId: statement._id,
      attempt: 1,
      meta: { taskId: 'task-3' }
    });

    expect(stores.checks).toHaveLength(1);
    expect(statement.progress.totalChecks).toBe(1);
    expect(statement.progress.checksQueued).toBe(1);
    expect(statement.artifacts.stageTimestamps.checksQueuedAt).toBeDefined();

    const check = stores.checks[0];
    expect(check.extracted.checkNumber).toBe('1001');
    expect(check.artifacts.cropBBox).toEqual([10, 20, 200, 120]);
    expect(check.artifacts.cropImagePath).toBe(
      `companies/company-1/statements/2026-01/statement-1/derived/checks/extracted/${check._id}/front.png`
    );
    expect(check.processing.retryCount).toBe(0);

    await runAccountingTask({
      companyId: 'company-1',
      jobType: 'check.process',
      statementId: statement._id,
      checkId: check._id,
      attempt: 1,
      meta: { taskId: 'task-4' }
    });

    expect(check.status).toBe('ready');
    expect(check.processing.processedAt).toBeDefined();
    expect(check.artifacts.ocrJsonPath).toBe(
      `companies/company-1/statements/2026-01/statement-1/derived/checks/extracted/${check._id}/ocr.json`
    );
    expect(check.artifacts.geminiPath).toBe(
      `companies/company-1/statements/2026-01/statement-1/derived/checks/extracted/${check._id}/proposal.normalized.v1.json`
    );
    expect(check.extracted.source).toBe('ocr');
    expect(check.match.statementTransactionId).toBe('txn-1');
    expect(check.match.reasons).toEqual(expect.arrayContaining(['Gemini approved']));
    expect(stores.transactions[0].statementCheckId).toBe(check._id);
    expect(stores.transactions[0].evidence.checkCropPath).toBe(
      `companies/company-1/statements/2026-01/statement-1/derived/checks/extracted/${check._id}/front.png`
    );
    expect(stores.transactions[0].evidence.geminiPath).toBe(
      `companies/company-1/statements/2026-01/statement-1/derived/checks/extracted/${check._id}/proposal.normalized.v1.json`
    );
    expect(stores.transactions[0].proposal.reasons).toEqual(
      expect.arrayContaining(['mocked', 'Gemini approved'])
    );
    expect(stores.ledgerEntries[0].attachments.geminiPath).toBe(
      `companies/company-1/statements/2026-01/statement-1/derived/checks/extracted/${check._id}/proposal.normalized.v1.json`
    );
    expect(runAccountingGeminiProposalMock).toHaveBeenCalledTimes(3);
    expect(statement.progress.phase).toBe('ready_for_review');
    expect(statement.progress.completedChecks).toBe(1);
    expect(statement.progress.remainingChecks).toBe(0);
  });
});
