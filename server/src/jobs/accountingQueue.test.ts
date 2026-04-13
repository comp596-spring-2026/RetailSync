import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();
const getClientMock = vi.fn();
const getAccessTokenMock = vi.fn();
const runAccountingTaskMock = vi.fn();

vi.mock('../config/env', () => ({
  env: {
    internalTasksEndpoint: 'http://localhost:4000/api/internal/tasks/run',
    gcpProjectId: 'test-project',
    gcpRegion: 'us-west1',
    tasksOidcServiceAccountEmail: 'tasks@example.com',
    tasksQueuePipeline: 'accounting-pipeline',
    tasksQueueSync: 'accounting-sync',
    serviceSecret: 'secret',
    tasksMode: 'cloud'
  }
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
  });

  it('normalizes the legacy internal tasks endpoint for pipeline jobs', async () => {
    const { resolveAccountingTaskEndpoint } = await import('./accountingQueue');

    expect(resolveAccountingTaskEndpoint('statement.extract')).toBe(
      'http://localhost:4000/api/tasks/pipeline'
    );
  });

  it('normalizes the legacy internal tasks endpoint for sync jobs', async () => {
    const { resolveAccountingTaskEndpoint } = await import('./accountingQueue');

    expect(resolveAccountingTaskEndpoint('quickbooks.post_approved')).toBe(
      'http://localhost:4000/api/tasks/sync'
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
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://localhost:4000/api/tasks/pipeline');
  });
});
