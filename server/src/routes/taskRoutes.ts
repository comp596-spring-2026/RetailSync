import { accountingTaskPayloadSchema } from '@retailsync/shared';
import { Request, Response } from 'express';
import { Router } from 'express';
import { env } from '../config/env';
import { runAccountingTask } from '../jobs/accountingTaskRunner';
import { fail, ok } from '../utils/apiResponse';

const router = Router();

const pipelineJobTypes = new Set([
  'statement.extract',
  'statement.structure',
  'checks.spawn',
  'check.process',
  'matching.refresh'
]);

const syncJobTypes = new Set([
  'quickbooks.refresh_reference_data',
  'quickbooks.post_approved'
]);

const authorize = (incomingSecret: string | undefined) => {
  if (!env.internalTasksSecret) return true;
  return incomingSecret === env.internalTasksSecret;
};

const runTask = async (
  req: Request,
  res: Response,
  allowedJobTypes: Set<string>
) => {
  const incomingSecret = req.header('x-internal-task-secret');
  if (!authorize(incomingSecret)) {
    return fail(res, 'Unauthorized', 401);
  }

  const parsed = accountingTaskPayloadSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }

  if (!allowedJobTypes.has(parsed.data.jobType)) {
    return fail(res, 'Invalid job type for endpoint', 422, {
      jobType: parsed.data.jobType
    });
  }

  try {
    const result = await runAccountingTask(parsed.data);
    return ok(res, { accepted: true, result });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[tasks.run] failed', error);
    return fail(res, 'Task execution failed', 500, {
      statementId: parsed.data.statementId,
      checkId: parsed.data.checkId,
      jobType: parsed.data.jobType
    });
  }
};

router.post('/pipeline', async (req, res) => runTask(req, res, pipelineJobTypes));
router.post('/sync', async (req, res) => runTask(req, res, syncJobTypes));

export default router;
