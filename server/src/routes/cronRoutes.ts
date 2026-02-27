import { Router, Request, Response } from 'express';
import { env } from '../config/env';
import { runSheetsSync } from '../jobs/syncSheets';

const router = Router();

router.post('/sync-sheets', async (req: Request, res: Response) => {
  try {
    const secretHeader = req.header('x-cron-secret');
    if (env.cronSecret) {
      if (!secretHeader || secretHeader !== env.cronSecret) {
        return res.status(401).json({ ok: false, error: 'Unauthorized' });
      }
    }

    const dryRun = String(req.query.dryRun ?? '').toLowerCase() === 'true';
    const result = await runSheetsSync({
      source: dryRun ? 'sheets-cron-dry-run' : 'sheets-cron',
      dryRun
    });

    return res.json({ ok: result.ok, ...result });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[cron] /api/cron/sync-sheets failed', error);
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
});

export default router;

