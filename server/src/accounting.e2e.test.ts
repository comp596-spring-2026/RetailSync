import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';
import {
  clearTestDb,
  connectTestDb,
  disconnectTestDb,
  registerAndCreateCompany,
  setupTestEnv
} from './test/testUtils';
import { UserModel } from './models/User';
import { RoleModel } from './models/Role';
import { BankStatement } from './models/BankStatement';
import { LedgerEntryModel } from './models/LedgerEntry';
import { ChartOfAccountModel } from './models/ChartOfAccount';
import { StatementCheckModel } from './models/StatementCheck';
import { StatementTransactionModel } from './models/StatementTransaction';
import { RunModel } from './models/Run';
import { getOrCreateSettings } from './utils/googleSheetsSettings';

const {
  enqueueAccountingJobMock,
  runAccountingTaskMock,
  fetchQuickBooksTaxOverviewMock,
  fetchQuickBooksTaxReportMock,
  listQuickBooksTaxChartOfAccountsMock,
  listQuickBooksTaxLedgerMock,
  listQuickBooksTaxPaymentsMock,
  recoverQuickBooksPaymentMock,
  createQuickBooksJournalAdjustmentMock
} = vi.hoisted(() => ({
  enqueueAccountingJobMock: vi.fn(),
  runAccountingTaskMock: vi.fn(),
  fetchQuickBooksTaxOverviewMock: vi.fn(),
  fetchQuickBooksTaxReportMock: vi.fn(),
  listQuickBooksTaxChartOfAccountsMock: vi.fn(),
  listQuickBooksTaxLedgerMock: vi.fn(),
  listQuickBooksTaxPaymentsMock: vi.fn(),
  recoverQuickBooksPaymentMock: vi.fn(),
  createQuickBooksJournalAdjustmentMock: vi.fn()
}));

vi.mock('./jobs/accountingQueue', () => ({
  enqueueAccountingJob: enqueueAccountingJobMock
}));

vi.mock('./jobs/accountingTaskRunner', () => ({
  runAccountingTask: runAccountingTaskMock
}));

vi.mock('./services/quickbooksTaxService', () => ({
  fetchQuickBooksTaxOverview: (...args: unknown[]) =>
    fetchQuickBooksTaxOverviewMock(...args),
  fetchQuickBooksTaxReport: (...args: unknown[]) => fetchQuickBooksTaxReportMock(...args),
  listQuickBooksTaxChartOfAccounts: (...args: unknown[]) =>
    listQuickBooksTaxChartOfAccountsMock(...args),
  listQuickBooksTaxLedger: (...args: unknown[]) => listQuickBooksTaxLedgerMock(...args),
  listQuickBooksTaxPayments: (...args: unknown[]) => listQuickBooksTaxPaymentsMock(...args),
  recoverQuickBooksPayment: (...args: unknown[]) => recoverQuickBooksPaymentMock(...args),
  createQuickBooksJournalAdjustment: (...args: unknown[]) =>
    createQuickBooksJournalAdjustmentMock(...args)
}));

vi.mock('@google-cloud/storage', () => {
  class Storage {
    bucket(bucketName: string) {
      return {
        file: (objectPath: string) => ({
          getSignedUrl: async () => [
            `https://storage.mock/${encodeURIComponent(bucketName)}/${encodeURIComponent(objectPath)}`
          ],
          download: async () => [Buffer.from('%PDF-1.7 mock content', 'utf-8')]
        })
      };
    }
  }
  return { Storage };
});

const extractCompanyContext = async (email: string) => {
  const user = await UserModel.findOne({ email }).select('_id companyId roleId');
  if (!user?.companyId || !user.roleId) {
    throw new Error('Expected user to have company and role');
  }
  return {
    userId: user._id.toString(),
    companyId: user.companyId.toString(),
    roleId: user.roleId.toString()
  };
};

describe('Accounting e2e', () => {
  const TEST_TIMEOUT_MS = 20_000;
  let app: ReturnType<(typeof import('./app'))['createApp']>;

  beforeAll(async () => {
    setupTestEnv();
    process.env.TASKS_MODE = 'cloud';
    process.env.GCS_BUCKET_NAME = 'retailsync-accounting-test';
    process.env.GCP_PROJECT_ID = 'retailsync-test-project';
    process.env.GCP_REGION = 'us-west1';
    process.env.API_SERVICE_NAME = 'retailsync-api-dev';
    process.env.WORKER_SERVICE_NAME = 'retailsync-worker-dev';
    process.env.INTERNAL_TASKS_SECRET = 'internal-test-secret';
    process.env.INTERNAL_TASKS_ENDPOINT =
      'https://retailsync-worker-dev.example.com/api/tasks';
    process.env.QUICKBOOKS_CLIENT_ID = 'qb-client-id';
    process.env.QUICKBOOKS_CLIENT_SECRET = 'qb-client-secret';
    process.env.QUICKBOOKS_INTEGRATION_REDIRECT_URI =
      'http://localhost:4000/api/integrations/quickbooks/callback';

    const module = await import('./app');
    app = module.createApp();
    await connectTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
    enqueueAccountingJobMock.mockReset();
    runAccountingTaskMock.mockReset();
    fetchQuickBooksTaxOverviewMock.mockReset();
    fetchQuickBooksTaxReportMock.mockReset();
    listQuickBooksTaxChartOfAccountsMock.mockReset();
    listQuickBooksTaxLedgerMock.mockReset();
    listQuickBooksTaxPaymentsMock.mockReset();
    recoverQuickBooksPaymentMock.mockReset();
    createQuickBooksJournalAdjustmentMock.mockReset();

    enqueueAccountingJobMock.mockImplementation(async (args: { jobType: string }) => ({
      taskId: `task-${String(args.jobType).replace(/\./g, '-')}`,
      mode: 'cloud',
      status: 'queued',
      queueName: String(args.jobType).startsWith('quickbooks.')
        ? 'sync-integrations-dev'
        : 'pipeline-ocr-dev'
    }));

    runAccountingTaskMock.mockImplementation(
      async (payload: {
        companyId: string;
        statementId?: string;
        checkId?: string;
        jobType: string;
        meta?: { taskId?: string };
      }) => ({
        taskId: String(payload.meta?.taskId ?? `task-${payload.jobType}`),
        companyId: payload.companyId,
        statementId: payload.statementId,
        checkId: payload.checkId,
        jobType: payload.jobType,
        status: 'completed'
      })
    );

    fetchQuickBooksTaxOverviewMock.mockResolvedValue({
      from: '2026-01-01',
      to: '2026-03-10',
      basis: 'accrual',
      cards: {
        netIncome: 10,
        totalAssets: 20,
        totalLiabilities: 30,
        totalEquity: 40,
        arOpen: 50,
        apOpen: 60
      }
    });
    fetchQuickBooksTaxReportMock.mockResolvedValue({
      reportKey: 'profit-loss',
      from: '2026-01-01',
      to: '2026-03-10',
      basis: 'accrual',
      generatedAt: new Date().toISOString(),
      rows: [],
      raw: {}
    });
    listQuickBooksTaxChartOfAccountsMock.mockResolvedValue([]);
    listQuickBooksTaxLedgerMock.mockResolvedValue({
      from: '2026-01-01',
      to: '2026-03-10',
      basis: 'accrual',
      accountId: null,
      total: 0,
      nextCursor: null,
      entries: []
    });
    listQuickBooksTaxPaymentsMock.mockResolvedValue({
      from: '2026-01-01',
      to: '2026-03-10',
      type: 'all',
      nextCursor: null,
      payments: []
    });
    recoverQuickBooksPaymentMock.mockResolvedValue({
      created: true,
      clientRequestId: 'req-1',
      paymentId: '11',
      txnType: 'Payment',
      txnDate: '2026-03-10',
      amount: 99
    });
    createQuickBooksJournalAdjustmentMock.mockResolvedValue({
      created: true,
      clientRequestId: 'jrnl-1',
      journalEntryId: '22',
      txnDate: '2026-03-10'
    });
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  it(
    'runs upload/create/reprocess/check-retry and ledger approval/post queue flow',
    async () => {
      const { accessToken, email } = await registerAndCreateCompany(app, 'AcctLifecycle');
      const { companyId } = await extractCompanyContext(email);

      const upload = await request(app)
        .post('/api/accounting/statements/upload-url')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          fileName: 'March Statement 2026.pdf',
          statementMonth: '2026-03',
          contentType: 'application/pdf'
        })
        .expect(200);

      const statementId = upload.body.data.statementId as string;
      const gcsPath = upload.body.data.gcsPath as string;
      expect(upload.body.data.uploadUrl).toContain('https://storage.mock/');
      expect(gcsPath).toContain('/original/statement.pdf');

      const created = await request(app)
        .post('/api/accounting/statements')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          statementId,
          fileName: 'March Statement 2026.pdf',
          statementMonth: '2026-03',
          gcsPath
        })
        .expect(201);

      expect(created.body.data.statement.status).toBe('extracting');
      expect(created.body.data.queue.mode).toBe('cloud');

      const listed = await request(app)
        .get('/api/accounting/statements')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(listed.body.data.statements).toHaveLength(1);

      const statementTxnId = new Types.ObjectId().toString();
      await StatementTransactionModel.create({
        _id: statementTxnId,
        companyId,
        statementId,
        postDate: '2026-03-02',
        description: 'Payroll check 1023',
        merchant: 'Payroll',
        amount: 1250,
        type: 'debit',
        proposal: {
          qbTxnType: 'Check',
          confidence: 0.8,
          reasons: ['seeded'],
          status: 'proposed',
          version: 'v1'
        },
        reviewStatus: 'proposed',
        posting: { status: 'not_posted' }
      });

      const ledgerEntry = await LedgerEntryModel.create({
        companyId,
        sourceType: 'statement',
        statementId,
        statementTransactionId: statementTxnId,
        date: '2026-03-02',
        description: 'Payroll check 1023',
        amount: 1250,
        type: 'debit',
        proposal: {
          qbTxnType: 'Check',
          confidence: 0.8,
          reasons: ['seeded'],
          status: 'proposed',
          version: 'v1'
        },
        reviewStatus: 'proposed',
        posting: { status: 'not_posted' }
      });

      const failedCheck = await StatementCheckModel.create({
        companyId,
        statementId,
        status: 'failed',
        gcs: {
          frontPath: `companies/${companyId}/statements/2026/03/${statementId}/derived/checks/extracted/check-1/front.jpg`
        },
        errors: ['OCR timeout']
      });

      const detail = await request(app)
        .get(`/api/accounting/statements/${statementId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(detail.body.data.id).toBe(statementId);
      expect(detail.body.data.checks.length).toBe(1);

      const status = await request(app)
        .get(`/api/accounting/statements/${statementId}/status`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(status.body.data.statementId).toBe(statementId);

      await request(app)
        .post(`/api/accounting/statements/${statementId}/checks/${failedCheck._id.toString()}/retry`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      await request(app)
        .post(`/api/accounting/statements/${statementId}/reprocess`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ fromJobType: 'statement.extract' })
        .expect(200);

      const ledgerEntries = await request(app)
        .get('/api/accounting/ledger/entries')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(ledgerEntries.body.data.entries.length).toBeGreaterThanOrEqual(1);

      await request(app)
        .post(`/api/accounting/ledger/entries/${ledgerEntry._id.toString()}/approve`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const postApproved = await request(app)
        .post('/api/accounting/ledger/post-approved')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(postApproved.body.data.queue.status).toBe('queued');
    },
    TEST_TIMEOUT_MS
  );

  it(
    'returns observability summary + debug diagnostics with new run and status model',
    async () => {
      const { accessToken, email } = await registerAndCreateCompany(app, 'ObservabilitySuite');
      const { companyId, userId } = await extractCompanyContext(email);

      const statementId = new Types.ObjectId().toString();
      await BankStatement.create({
        _id: statementId,
        companyId,
        statementMonth: '2026-02',
        fileName: 'obs.pdf',
        source: 'upload',
        status: 'failed',
        gcs: {
          rootPrefix: `companies/${companyId}/statements/2026/02/${statementId}`,
          pdfPath: `companies/${companyId}/statements/2026/02/${statementId}/original/statement.pdf`
        },
        progress: {
          totalChecks: 2,
          checksQueued: 0,
          checksProcessing: 0,
          checksReady: 1,
          checksFailed: 1
        },
        issues: ['Gemini validation failed'],
        createdBy: userId
      });

      await RunModel.create({
        companyId,
        statementId,
        runType: 'pipeline',
        job: 'statement.structure',
        status: 'failed',
        errors: ['Invalid schema']
      });

      await ChartOfAccountModel.create({
        companyId,
        code: 'QB-100',
        name: 'QB Cash',
        type: 'asset',
        qbAccountId: 'qb-account-100',
        isSystem: false
      });

      await LedgerEntryModel.create({
        companyId,
        sourceType: 'statement',
        statementId,
        statementTransactionId: new Types.ObjectId().toString(),
        date: '2026-02-01',
        description: 'Approved unsynced',
        amount: 120,
        type: 'debit',
        reviewStatus: 'approved',
        posting: {
          status: 'failed',
          error: 'No account mapping'
        },
        proposal: {
          qbTxnType: 'Expense',
          confidence: 0.7,
          reasons: ['seeded'],
          status: 'approved',
          version: 'v1'
        }
      });

      const settings = await getOrCreateSettings(companyId, userId);
      const quickbooks = (settings as any).quickbooks;
      quickbooks.connected = true;
      quickbooks.environment = 'sandbox';
      quickbooks.realmId = '1234567890';
      quickbooks.companyName = 'RetailSync Demo Co';
      quickbooks.lastPullStatus = 'success';
      quickbooks.lastPullCount = 15;
      quickbooks.lastPushStatus = 'error';
      quickbooks.lastPushError = '1 entries failed to sync';
      quickbooks.updatedAt = new Date();
      await settings.save();

      const summary = await request(app)
        .get('/api/accounting/observability/summary')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(summary.body.data.counts.totalStatements).toBe(1);
      expect(summary.body.data.counts.failedStatements).toBe(1);
      expect(summary.body.data.failedRuns.length).toBeGreaterThanOrEqual(1);
      expect(summary.body.data.quickbooks.connected).toBe(true);

      const debug = await request(app)
        .get('/api/accounting/observability/debug')
        .query({ statementId })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(['cloud', 'inline']).toContain(debug.body.data.envReadiness.tasksMode);
      expect(Array.isArray(debug.body.data.actions)).toBe(true);
    },
    TEST_TIMEOUT_MS
  );

  it(
    'handles QuickBooks connect/sync endpoints with status updates and RBAC enforcement',
    async () => {
      const { accessToken, email } = await registerAndCreateCompany(app, 'QuickbooksSuite');
      const { companyId, userId, roleId } = await extractCompanyContext(email);

      await request(app)
        .post('/api/integrations/quickbooks/sync/refresh-reference-data')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(409);

      const settings = await getOrCreateSettings(companyId, userId);
      const quickbooks = (settings as any).quickbooks;
      quickbooks.connected = true;
      quickbooks.environment = 'sandbox';
      quickbooks.realmId = 'realm-1';
      quickbooks.companyName = 'RetailSync QB';
      quickbooks.updatedAt = new Date();
      await settings.save();

      const connectUrl = await request(app)
        .get('/api/integrations/quickbooks/start-url')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(connectUrl.body.data.url).toContain('appcenter.intuit.com/connect/oauth2');

      await request(app)
        .post('/api/integrations/quickbooks/sync/refresh-reference-data')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      await request(app)
        .post('/api/integrations/quickbooks/sync/post-approved')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const refreshed = await getOrCreateSettings(companyId, userId);
      const refreshedQuickbooks = (refreshed as any).quickbooks;
      expect(refreshedQuickbooks.lastPullStatus).toBe('running');
      expect(refreshedQuickbooks.lastPushStatus).toBe('running');

      const role = await RoleModel.findOne({ _id: roleId, companyId });
      if (!role) {
        throw new Error('Role not found');
      }
      const nextPermissions = role.permissions as any;
      nextPermissions.quickbooks.actions = [];
      role.permissions = nextPermissions;
      await role.save();

      await request(app)
        .post('/api/integrations/quickbooks/sync/refresh-reference-data')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
    },
    TEST_TIMEOUT_MS
  );

  it(
    'handles quickbooks tax endpoints with read/write RBAC',
    async () => {
      const { accessToken, email } = await registerAndCreateCompany(app, 'QuickbooksTaxSuite');
      const { companyId, roleId } = await extractCompanyContext(email);

      await request(app)
        .get('/api/integrations/quickbooks/tax/overview')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      await request(app)
        .get('/api/integrations/quickbooks/tax/reports/profit-loss')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      await request(app)
        .post('/api/integrations/quickbooks/tax/recover-payment')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          clientRequestId: 'req-abc-123',
          paymentType: 'customer',
          txnDate: '2026-03-10',
          amount: 45,
          bankAccountId: '35',
          customerId: '42'
        })
        .expect(200);

      const role = await RoleModel.findOne({ _id: roleId, companyId });
      if (!role) {
        throw new Error('Role not found');
      }

      const nextPermissions = role.permissions as any;
      nextPermissions.quickbooks.actions = ['connect', 'sync'];
      role.permissions = nextPermissions;
      await role.save();

      await request(app)
        .post('/api/integrations/quickbooks/tax/recover-payment')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          clientRequestId: 'req-abc-456',
          paymentType: 'customer',
          txnDate: '2026-03-10',
          amount: 45,
          bankAccountId: '35',
          customerId: '42'
        })
        .expect(403);
    },
    TEST_TIMEOUT_MS
  );

  it(
    'enforces task endpoint auth, validates payload, and executes routing contract',
    async () => {
      const { env } = await import('./config/env');
      const taskSecret = env.internalTasksSecret ?? 'internal-test-secret';

      await request(app)
        .post('/api/tasks/pipeline')
        .send({})
        .expect(401);

      await request(app)
        .post('/api/tasks/pipeline')
        .set('x-internal-task-secret', taskSecret)
        .send({ companyId: 'c1', jobType: 'quickbooks.post_approved' })
        .expect(422);

      const pipelineResponse = await request(app)
        .post('/api/tasks/pipeline')
        .set('x-internal-task-secret', taskSecret)
        .send({
          companyId: 'company-1',
          statementId: 'statement-1',
          jobType: 'statement.extract',
          attempt: 1,
          meta: {
            taskId: 'task-pipeline-1'
          }
        })
        .expect(200);

      expect(pipelineResponse.body.data.accepted).toBe(true);

      const syncResponse = await request(app)
        .post('/api/tasks/sync')
        .set('x-internal-task-secret', taskSecret)
        .send({
          companyId: 'company-1',
          jobType: 'quickbooks.post_approved',
          attempt: 1,
          meta: {
            taskId: 'task-sync-1'
          }
        })
        .expect(200);

      expect(syncResponse.body.data.accepted).toBe(true);
      expect(runAccountingTaskMock).toHaveBeenCalledTimes(2);
    },
    TEST_TIMEOUT_MS
  );
});
