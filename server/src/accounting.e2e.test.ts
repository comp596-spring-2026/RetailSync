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
import { getOrCreateSettings } from './utils/googleSheetsSettings';

const { enqueueAccountingJobMock, runAccountingTaskMock } = vi.hoisted(() => ({
  enqueueAccountingJobMock: vi.fn(),
  runAccountingTaskMock: vi.fn()
}));

vi.mock('./jobs/accountingQueue', () => ({
  enqueueAccountingJob: enqueueAccountingJobMock
}));

vi.mock('./jobs/accountingTaskRunner', () => ({
  runAccountingTask: runAccountingTaskMock
}));

vi.mock('@google-cloud/storage', () => {
  class Storage {
    bucket(bucketName: string) {
      return {
        file: (objectPath: string) => ({
          getSignedUrl: async () => [
            `https://storage.mock/${encodeURIComponent(bucketName)}/${encodeURIComponent(objectPath)}`
          ]
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

describe('Accounting + QuickBooks + Observability e2e', () => {
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
      'https://retailsync-worker-dev.example.com/api/internal/tasks/run';
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

    enqueueAccountingJobMock.mockImplementation(async (args: { jobType: string }) => ({
      taskId: `task-${args.jobType}`,
      mode: 'cloud',
      status: 'queued',
      queueName: args.jobType.startsWith('qb_') ? 'sync-integrations-dev' : 'pipeline-ocr-dev'
    }));

    runAccountingTaskMock.mockImplementation(
      async (payload: {
        companyId: string;
        statementId: string;
        jobType: string;
        meta?: { taskId?: string };
      }) => ({
        taskId: String(payload.meta?.taskId ?? `task-${payload.jobType}`),
        companyId: payload.companyId,
        statementId: payload.statementId,
        jobType: payload.jobType,
        status: 'completed'
      })
    );
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  it(
    'runs statement upload/create/reprocess/confirm/lock and ledger post end-to-end',
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
      expect(gcsPath).toContain(`/statements/${statementId}/original.pdf`);

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

      expect(created.body.data.statement.status).toBe('processing');
      expect(created.body.data.queue.mode).toBe('cloud');

      const listed = await request(app)
        .get('/api/accounting/statements')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(listed.body.data.statements).toHaveLength(1);

      const detail = await request(app)
        .get(`/api/accounting/statements/${statementId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(detail.body.data.id).toBe(statementId);
      expect(detail.body.data.pdfPath).toBe(gcsPath);

      await request(app)
        .post(`/api/accounting/statements/${statementId}/reprocess`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ fromJobType: 'detect_checks' })
        .expect(200);

      await BankStatement.findOneAndUpdate(
        { _id: statementId, companyId },
        {
          $set: {
            status: 'needs_review',
            processingStage: 'structured_ready',
            extraction: {
              issues: [],
              structuredJson: {
                schemaVersion: 'v1',
                transactions: [
                  {
                    id: 'txn-1',
                    date: '2026-03-01',
                    description: 'Office supplies',
                    amount: 42.5,
                    type: 'debit',
                    suggestedCategory: 'office_expense'
                  }
                ]
              }
            }
          }
        }
      );

      const confirmed = await request(app)
        .post(`/api/accounting/statements/${statementId}/confirm`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(confirmed.body.data.statement.status).toBe('confirmed');
      expect(confirmed.body.data.ledgerDraftsCreated).toBeGreaterThanOrEqual(1);

      const locked = await request(app)
        .post(`/api/accounting/statements/${statementId}/lock`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(locked.body.data.statement.status).toBe('locked');

      const ledgerEntries = await request(app)
        .get('/api/accounting/ledger/entries')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(ledgerEntries.body.data.entries.length).toBeGreaterThanOrEqual(1);

      const firstEntryId = ledgerEntries.body.data.entries[0]._id as string;
      const posted = await request(app)
        .post(`/api/accounting/ledger/entries/${firstEntryId}/post`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(posted.body.data.entry.status).toBe('posted');

      await request(app)
        .post(`/api/accounting/ledger/entries/${firstEntryId}/post`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(409);

      expect(enqueueAccountingJobMock).toHaveBeenCalledTimes(2);
    },
    TEST_TIMEOUT_MS
  );

  it(
    'returns observability summary + debug diagnostics for statement and QuickBooks states',
    async () => {
      const { accessToken, email } = await registerAndCreateCompany(app, 'ObservabilitySuite');
      const { companyId, userId } = await extractCompanyContext(email);

      const staleStatementId = new Types.ObjectId();
      const failedStatementId = new Types.ObjectId();

      await BankStatement.create([
        {
          _id: staleStatementId,
          companyId,
          statementMonth: '2026-02',
          fileName: 'stale.pdf',
          source: 'upload',
          status: 'processing',
          processingStage: 'ocr_ready',
          files: { pdf: { gcsPath: `accounting/${companyId}/stale/original.pdf` }, pages: [], checks: [] },
          extraction: { issues: [] },
          jobRuns: [],
          createdBy: userId
        },
        {
          _id: failedStatementId,
          companyId,
          statementMonth: '2026-01',
          fileName: 'failed.pdf',
          source: 'upload',
          status: 'failed',
          processingStage: 'failed',
          files: { pdf: { gcsPath: `accounting/${companyId}/failed/original.pdf` }, pages: [], checks: [] },
          extraction: { issues: ['parse failure'] },
          jobRuns: [
            {
              taskId: 'task-gemini',
              jobType: 'gemini_structure',
              status: 'failed',
              attempt: 2,
              endedAt: new Date(),
              error: 'Gemini timeout'
            }
          ],
          createdBy: userId
        }
      ]);

      await BankStatement.updateOne(
        { _id: staleStatementId, companyId },
        { $set: { updatedAt: new Date(Date.now() - 45 * 60 * 1000) } }
      );

      await ChartOfAccountModel.create({
        companyId,
        code: 'QB-100',
        name: 'QB Cash',
        type: 'asset',
        qbAccountId: 'qb-account-100',
        isSystem: false
      });

      await LedgerEntryModel.create([
        {
          companyId,
          date: '2026-02-01',
          memo: 'Posted unsynced',
          lines: [
            { accountCode: '1000', debit: 10, credit: 0 },
            { accountCode: '7999', debit: 0, credit: 10 }
          ],
          status: 'posted'
        },
        {
          companyId,
          date: '2026-02-02',
          memo: 'Posted sync error',
          lines: [
            { accountCode: '1000', debit: 12, credit: 0 },
            { accountCode: '7999', debit: 0, credit: 12 }
          ],
          status: 'posted',
          qbSyncError: 'No QuickBooks account mapping for account code 6999'
        }
      ]);

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

      expect(summary.body.data.counts.processingStatements).toBe(1);
      expect(summary.body.data.counts.failedStatements).toBe(1);
      expect(summary.body.data.failedJobs.length).toBeGreaterThanOrEqual(1);
      expect(summary.body.data.gcpLinks.apiLogsUrl).toContain('retailsync-test-project');
      expect(summary.body.data.quickbooks.connected).toBe(true);

      const debugWithStatement = await request(app)
        .get('/api/accounting/observability/debug')
        .query({ statementId: staleStatementId.toString() })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(debugWithStatement.body.data.statementDebug.found).toBe(true);
      expect(debugWithStatement.body.data.statementDebug.isStaleProcessing).toBe(true);
      expect(debugWithStatement.body.data.quickbooksDebug.mappedAccountsCount).toBe(1);
      expect(debugWithStatement.body.data.quickbooksDebug.postedUnsyncedCount).toBe(2);
      expect(debugWithStatement.body.data.quickbooksDebug.postedSyncErrorCount).toBe(1);

      const debugInvalid = await request(app)
        .get('/api/accounting/observability/debug')
        .query({ statementId: 'not-an-object-id' })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(debugInvalid.body.data.statementDebug.found).toBe(false);
      expect(debugInvalid.body.data.statementDebug.invalidId).toBe(true);
    },
    TEST_TIMEOUT_MS
  );

  it(
    'handles QuickBooks connect/sync endpoints with status updates and RBAC enforcement',
    async () => {
      const { accessToken, email } = await registerAndCreateCompany(app, 'QuickbooksSuite');
      const { companyId, userId, roleId } = await extractCompanyContext(email);

      await request(app)
        .post('/api/integrations/quickbooks/sync/pull-accounts')
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
        .post('/api/integrations/quickbooks/sync/pull-accounts')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      await request(app)
        .post('/api/integrations/quickbooks/sync/push-entries')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const refreshed = await getOrCreateSettings(companyId, userId);
      const refreshedQuickbooks = (refreshed as any).quickbooks;
      expect(refreshedQuickbooks.lastPullStatus).toBe('running');
      expect(refreshedQuickbooks.lastPushStatus).toBe('running');

      const role = await RoleModel.findById(roleId);
      if (!role) {
        throw new Error('Role not found');
      }
      const nextPermissions = role.permissions as any;
      nextPermissions.quickbooks.actions = [];
      role.permissions = nextPermissions;
      await role.save();

      await request(app)
        .post('/api/integrations/quickbooks/sync/pull-accounts')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
    },
    TEST_TIMEOUT_MS
  );

  it(
    'enforces internal task secret, validates payload, and executes task contract',
    async () => {
      await request(app)
        .post('/api/internal/tasks/run')
        .send({})
        .expect(401);

      await request(app)
        .post('/api/internal/tasks/run')
        .set('x-internal-task-secret', 'internal-test-secret')
        .send({ companyId: 'c1' })
        .expect(422);

      const response = await request(app)
        .post('/api/internal/tasks/run')
        .set('x-internal-task-secret', 'internal-test-secret')
        .send({
          companyId: 'company-1',
          statementId: 'statement-1',
          jobType: 'qb_pull_accounts',
          attempt: 1,
          meta: {
            taskId: 'task-internal-1'
          }
        })
        .expect(200);

      expect(response.body.data.accepted).toBe(true);
      expect(response.body.data.result.status).toBe('completed');
      expect(runAccountingTaskMock).toHaveBeenCalledTimes(1);
    },
    TEST_TIMEOUT_MS
  );
});
