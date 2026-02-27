import cron from 'node-cron';
import { env } from '../config/env';
import { runSheetsSync } from './syncSheets';

export const startLocalScheduler = () => {
  if (env.nodeEnv === 'production') {
    return;
  }

  if (process.env.ENABLE_LOCAL_CRON !== 'true') {
    return;
  }

  const expression = process.env.LOCAL_CRON_EXPR || '0 2 * * *';

  if (!cron.validate(expression)) {
    // eslint-disable-next-line no-console
    console.warn('[local-cron] Invalid LOCAL_CRON_EXPR, scheduler not started:', expression);
    return;
  }

  // eslint-disable-next-line no-console
  console.log('[local-cron] Scheduling sheets sync with cron expression:', expression);

  cron.schedule(expression, async () => {
    // eslint-disable-next-line no-console
    console.log('[local-cron] Starting sheets sync job');
    try {
      const result = await runSheetsSync({ source: 'local-cron' });
      // eslint-disable-next-line no-console
      console.log('[local-cron] Sheets sync finished', {
        ok: result.ok,
        totalCompanies: result.totalCompanies,
        succeeded: result.succeeded,
        failed: result.failed,
        skipped: result.skipped
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[local-cron] Sheets sync failed', error);
    }
  });
};

