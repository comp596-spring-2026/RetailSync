import { AccountingJobType, accountingTaskPayloadSchema } from '@retailsync/shared';
import { env } from '../config/env';
import { runAccountingTask } from './accountingTaskRunner';

type EnqueueAccountingJobArgs = {
  companyId: string;
  statementId: string;
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

const makeTaskId = (jobType: AccountingJobType) => `${jobType}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const pipelineJobTypes: AccountingJobType[] = ['render_pages', 'ocr_statement', 'detect_checks', 'gemini_structure'];
const syncJobTypes: AccountingJobType[] = ['qb_pull_accounts', 'qb_push_entries'];

const resolveQueueName = (jobType: AccountingJobType) => {
  if (pipelineJobTypes.includes(jobType)) return env.tasksQueuePipeline;
  if (syncJobTypes.includes(jobType)) return env.tasksQueueSync;
  return env.tasksQueuePipeline;
};

const runInlineTaskChain = async (args: EnqueueAccountingJobArgs) => {
  const firstTaskId = makeTaskId(args.jobType);
  let nextPayload: {
    companyId: string;
    statementId: string;
    jobType: AccountingJobType;
    attempt: number;
    meta: Record<string, unknown>;
  } = {
    companyId: args.companyId,
    statementId: args.statementId,
    jobType: args.jobType,
    attempt: args.attempt ?? 1,
    meta: {
      ...(args.meta ?? {}),
      taskId: firstTaskId
    }
  };

  let guard = 0;
  while (guard < 10) {
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
  if (!env.internalTasksEndpoint) throw new Error('INTERNAL_TASKS_ENDPOINT is required when TASKS_MODE=cloud');
  const queueName = resolveQueueName(args.jobType);

  const payload = {
    companyId: args.companyId,
    statementId: args.statementId,
    jobType: args.jobType,
    attempt: args.attempt ?? 1,
    meta: {
      ...(args.meta ?? {}),
      taskId,
      delaySeconds: args.delaySeconds ?? 0
    }
  };

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-accounting-queue': queueName
  };
  if (env.internalTasksSecret) {
    headers['x-internal-task-secret'] = env.internalTasksSecret;
  }

  const response = await fetch(env.internalTasksEndpoint, {
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

export const enqueueAccountingJob = async (args: EnqueueAccountingJobArgs): Promise<EnqueueAccountingJobResult> => {
  const taskId = makeTaskId(args.jobType);
  const parsed = accountingTaskPayloadSchema.safeParse({
    companyId: args.companyId,
    statementId: args.statementId,
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
