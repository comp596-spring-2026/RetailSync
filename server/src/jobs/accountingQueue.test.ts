import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();
const getClientMock = vi.fn();
const getAccessTokenMock = vi.fn();
const runAccountingTaskMock = vi.fn();

const envState = {
  internalTasksEndpoint: 'https://tasks.internal.retailsync.dev/api/internal/tasks/run',
  gcpProjectId: 'test-project',
  gcpRegion: 'us-west1',
  tasksOidcServiceAccountEmail: 'tasks@example.com',
  tasksQueuePipeline: 'accounting-pipeline',
  tasksQueueSync: 'accounting-sync',
  serviceSecret: 'secret',
  tasksMode: 'cloud'
};

vi.mock('../config/env', () => ({
  env: envState
}));

vi.mock('googleapis', () => ({
  google: {
    auth: {
      GoogleAuth: vi.fn().mockImplementation(() => ({
        getClient: getClientMock
      }))
    }
  }
}));

vi.mock('./accountingTaskRunner', () => ({
  runAccountingTask: runAccountingTaskMock
}));

describe('accountingQueue', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    getClientMock.mockReset();
    getAccessTokenMock.mockReset();
    runAccountingTaskMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    envState.internalTasksEndpoint = 'https://tasks.internal.retailsync.dev/api/internal/tasks/run';
  });

  it('normalizes the legacy internal tasks endpoint for pipeline jobs', async () => {
    const { resolveAccountingTaskEndpoint } = await import('./accountingQueue');

    expect(resolveAccountingTaskEndpoint('statement.extract')).toBe(
      'https://tasks.internal.retailsync.dev/api/tasks/pipeline'
    );
  });

  it('normalizes the legacy internal tasks endpoint for sync jobs', async () => {
    const { resolveAccountingTaskEndpoint } = await import('./accountingQueue');

    expect(resolveAccountingTaskEndpoint('quickbooks.post_approved')).toBe(
      'https://tasks.internal.retailsync.dev/api/tasks/sync'
    );
  });

  it('falls back to internal HTTP dispatch when cloud tasks ADC is unavailable', async () => {
    const credentialsError = new Error(
      'Could not load the default credentials. Browse to https://cloud.google.com/docs/authentication/getting-started for more information.'
    );
    getClientMock.mockRejectedValue(credentialsError);
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => '',
      json: async () => ({})
    });

    const { enqueueAccountingJob } = await import('./accountingQueue');

    const result = await enqueueAccountingJob({
      companyId: 'company-1',
      statementId: 'statement-1',
      jobType: 'statement.extract',
      meta: { requestedBy: 'user-1' }
    });

    expect(result.mode).toBe('cloud');
    expect(result.status).toBe('queued');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://tasks.internal.retailsync.dev/api/tasks/pipeline'
    );
  });

  it('runs the task chain in-process when the internal endpoint is a loopback address', async () => {
    envState.internalTasksEndpoint = 'http://localhost:4000/api/internal/tasks/run';
    runAccountingTaskMock.mockResolvedValue({
      taskId: 'task-1',
      companyId: 'company-1',
      statementId: 'statement-1',
      jobType: 'statement.extract'
    });

    vi.resetModules();
    const { enqueueAccountingJob } = await import('./accountingQueue');

    const result = await enqueueAccountingJob({
      companyId: 'company-1',
      statementId: 'statement-1',
      jobType: 'statement.extract',
      meta: { requestedBy: 'user-1' }
    });

    expect(result.mode).toBe('cloud');
    expect(result.status).toBe('queued');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getClientMock).not.toHaveBeenCalled();

    await new Promise((resolve) => setImmediate(resolve));
    expect(runAccountingTaskMock).toHaveBeenCalledTimes(1);
    expect(runAccountingTaskMock.mock.calls[0]?.[0]).toMatchObject({
      companyId: 'company-1',
      statementId: 'statement-1',
      jobType: 'statement.extract'
    });
  });
});
