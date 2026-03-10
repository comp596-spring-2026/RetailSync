import { Router, Request, Response } from 'express';
import { env } from '../config/env';
import { runDailyAccountingSync } from '../jobs/dailyAccountingSync';
import { runSheetsSync } from '../jobs/syncSheets';

const router = Router();

const isAuthorized = (req: Request) => {
  const secretHeader = req.header('x-cron-secret');
  if (!env.cronSecret) return true;
  return Boolean(secretHeader && secretHeader === env.cronSecret);
};

const parseBoolean = (value: unknown, fallback: boolean) => {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};

router.post('/sync-sheets', async (req: Request, res: Response) => {
  try {
    if (!isAuthorized(req)) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    const dryRun = parseBoolean(req.query.dryRun, false);
    const result = await runSheetsSync({
      source: dryRun ? 'sheets-cron-dry-run' : 'sheets-cron',
      dryRun
    });

    return res.json({ ...result });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[cron] /api/cron/sync-sheets failed', error);
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
});

router.post('/accounting-sync', async (req: Request, res: Response) => {
  try {
    if (!isAuthorized(req)) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    const dryRun = parseBoolean(req.query.dryRun, false);
    const includeSheets = parseBoolean(req.query.includeSheets, true);
    const includeQuickBooks = parseBoolean(req.query.includeQuickBooks, true);
    const postDelaySeconds = Number(req.query.postDelaySeconds ?? 120);

    const result = await runDailyAccountingSync({
      source: dryRun ? 'accounting-daily-sync-dry-run' : 'accounting-daily-sync',
      dryRun,
      includeSheets,
      includeQuickBooks,
      postDelaySeconds: Number.isFinite(postDelaySeconds)
        ? Math.max(0, Math.floor(postDelaySeconds))
        : 120
    });

    return res.json(result);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[cron] /api/cron/accounting-sync failed', error);
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
});

export default router;
