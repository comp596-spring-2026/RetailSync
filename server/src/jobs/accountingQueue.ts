import { AccountingJobType, accountingTaskPayloadSchema } from '@retailsync/shared';
import { google } from 'googleapis';
import { env } from '../config/env';
import { runAccountingTask } from './accountingTaskRunner';

type EnqueueAccountingJobArgs = {
  companyId: string;
  statementId?: string;
  checkId?: string;
  jobType: AccountingJobType;
  attempt?: number;
  meta?: Record<string, unknown>;
  delaySeconds?: number;
};

export type EnqueueAccountingJobResult = {
  taskId: string;
  mode: 'inline' | 'cloud';
  status: 'inline_executed' | 'queued';
  queueName?: string;
};

const makeTaskId = (jobType: AccountingJobType) =>
  `${jobType.replace(/[^a-zA-Z0-9]/g, '-')}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const pipelineJobTypes: AccountingJobType[] = [
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

const resolveQueueName = (jobType: AccountingJobType) => {
  if (pipelineJobTypes.includes(jobType)) return env.tasksQueuePipeline;
  if (syncJobTypes.includes(jobType)) return env.tasksQueueSync;
  return env.tasksQueuePipeline;
};

const resolveEndpoint = (jobType: AccountingJobType) => {
  if (!env.internalTasksEndpoint) {
    throw new Error('INTERNAL_TASKS_ENDPOINT is required when TASKS_MODE=cloud');
  }

  const isSync = syncJobTypes.includes(jobType);
  const endpoint = env.internalTasksEndpoint.replace(/\/+$/, '');

  if (endpoint.endsWith('/api/tasks/pipeline')) {
    return endpoint;
  }

  if (endpoint.endsWith('/api/tasks/sync')) {
    return endpoint;
  }

  if (endpoint.endsWith('/api/tasks')) {
    return `${endpoint}${isSync ? '/sync' : '/pipeline'}`;
  }

  return `${endpoint}/api/tasks${isSync ? '/sync' : '/pipeline'}`;
};

const buildTaskPayload = (args: EnqueueAccountingJobArgs, taskId: string) => ({
  companyId: args.companyId,
  statementId: args.statementId,
  checkId: args.checkId,
  jobType: args.jobType,
  attempt: args.attempt ?? 1,
  meta: {
    ...(args.meta ?? {}),
    taskId,
    delaySeconds: args.delaySeconds ?? 0
  }
});

const dispatchTaskViaHttp = async (args: EnqueueAccountingJobArgs, taskId: string) => {
  const queueName = resolveQueueName(args.jobType);
  const endpoint = resolveEndpoint(args.jobType);
  const payload = buildTaskPayload(args, taskId);

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-accounting-queue': queueName
  };
  if (env.internalTasksSecret) {
    headers['x-internal-task-secret'] = env.internalTasksSecret;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to dispatch accounting task (${response.status}): ${body}`);
  }

  return {
    queueName,
    taskName: taskId
  };
};

const dispatchTaskViaCloudTasksApi = async (args: EnqueueAccountingJobArgs, taskId: string) => {
  if (!env.gcpProjectId) {
    throw new Error('GCP_PROJECT_ID is required for Cloud Tasks dispatch');
  }
  if (!env.gcpRegion) {
    throw new Error('GCP_REGION is required for Cloud Tasks dispatch');
  }

  const queueName = resolveQueueName(args.jobType);
  const endpoint = resolveEndpoint(args.jobType);
  const payload = buildTaskPayload(args, taskId);
  const parent = `projects/${env.gcpProjectId}/locations/${env.gcpRegion}/queues/${queueName}`;
  const taskName = `${parent}/tasks/${taskId}`;

  const task: Record<string, unknown> = {
    name: taskName,
    httpRequest: {
      httpMethod: 'POST',
      url: endpoint,
      headers: {
        'content-type': 'application/json',
        ...(env.internalTasksSecret
          ? { 'x-internal-task-secret': env.internalTasksSecret }
          : {}),
        'x-accounting-queue': queueName
      },
      body: Buffer.from(JSON.stringify(payload)).toString('base64'),
      ...(env.tasksOidcServiceAccountEmail
        ? {
          oidcToken: {
            serviceAccountEmail: env.tasksOidcServiceAccountEmail
          }
        }
        : {})
    }
  };

  if ((args.delaySeconds ?? 0) > 0) {
    const scheduleAt = Date.now() + (args.delaySeconds ?? 0) * 1000;
    task.scheduleTime = {
      seconds: Math.floor(scheduleAt / 1000).toString(),
      nanos: (scheduleAt % 1000) * 1_000_000
    };
  }

  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform']
  });
  const authClient = await auth.getClient();
  const accessTokenResponse = await authClient.getAccessToken();
  const accessToken =
    typeof accessTokenResponse === 'string'
      ? accessTokenResponse
      : accessTokenResponse?.token ?? null;
  if (!accessToken) {
    throw new Error('Failed to acquire access token for Cloud Tasks API');
  }

  const response = await fetch(`https://cloudtasks.googleapis.com/v2/${parent}/tasks`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ task })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Cloud Tasks enqueue failed (${response.status}): ${body}`);
  }

  const result = (await response.json()) as { name?: string };
  return {
    queueName,
    taskName: result.name ? String(result.name).split('/').at(-1) ?? taskId : taskId
  };
};

const shouldUseCloudTasksApi = () =>
  Boolean(env.gcpProjectId && env.gcpRegion && env.tasksOidcServiceAccountEmail);

const runInlineTaskChain = async (args: EnqueueAccountingJobArgs) => {
  const firstTaskId = makeTaskId(args.jobType);
  let nextPayload: {
    companyId: string;
    statementId?: string;
    checkId?: string;
    jobType: AccountingJobType;
    attempt: number;
    meta: Record<string, unknown>;
  } = {
    companyId: args.companyId,
    statementId: args.statementId,
    checkId: args.checkId,
    jobType: args.jobType,
    attempt: args.attempt ?? 1,
    meta: {
      ...(args.meta ?? {}),
      taskId: firstTaskId
    }
  };

  let guard = 0;
  while (guard < 25) {
    const result = await runAccountingTask(nextPayload);
    if (!result.nextJobType) {
      return firstTaskId;
    }
    nextPayload = {
      ...nextPayload,
      jobType: result.nextJobType,
      attempt: 1,
      meta: {
        ...(nextPayload.meta ?? {}),
        parentTaskId: result.taskId,
        taskId: makeTaskId(result.nextJobType)
      }
    };
    guard += 1;
  }

  throw new Error('Inline accounting task chain exceeded guard limit');
};

const dispatchCloudTask = async (args: EnqueueAccountingJobArgs, taskId: string) => {
  if (shouldUseCloudTasksApi()) {
    return dispatchTaskViaCloudTasksApi(args, taskId);
  }
  return dispatchTaskViaHttp(args, taskId);
};

export const enqueueAccountingJob = async (
  args: EnqueueAccountingJobArgs
): Promise<EnqueueAccountingJobResult> => {
  const taskId = makeTaskId(args.jobType);
  const parsed = accountingTaskPayloadSchema.safeParse({
    companyId: args.companyId,
    statementId: args.statementId,
    checkId: args.checkId,
    jobType: args.jobType,
    attempt: args.attempt ?? 1,
    meta: {
      ...(args.meta ?? {}),
      taskId
    }
  });

  if (!parsed.success) {
    throw new Error('Invalid accounting enqueue payload');
  }

  if (env.tasksMode === 'inline') {
    await runInlineTaskChain(args);
    return {
      taskId,
      mode: 'inline',
      status: 'inline_executed'
    };
  }

  const dispatched = await dispatchCloudTask(args, taskId);
  return {
    taskId: dispatched.taskName,
    mode: 'cloud',
    status: 'queued',
    queueName: dispatched.queueName
  };
};
