import { accountingTaskPayloadSchema } from '@retailsync/shared';
import { Router } from 'express';
import { env } from '../config/env';
import { runAccountingTask } from '../jobs/accountingTaskRunner';
import { fail, ok } from '../utils/apiResponse';

const router = Router();

router.post('/run', async (req, res) => {
  const incomingSecret = req.header('x-internal-task-secret');
  if (env.internalTasksSecret && incomingSecret !== env.internalTasksSecret) {
    return fail(res, 'Unauthorized', 401);
  }

  const parsed = accountingTaskPayloadSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }

  try {
    const result = await runAccountingTask(parsed.data);
    return ok(res, { accepted: true, result });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[internal.tasks.run] failed', error);
    return fail(res, 'Task execution failed', 500, {
      statementId: parsed.data.statementId,
      jobType: parsed.data.jobType
    });
  }
});

export default router;
