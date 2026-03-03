import { Router } from 'express';
import {
  listChartOfAccounts,
  listLedgerEntries,
  postLedgerEntry,
  seedChartOfAccounts
} from '../controllers/ledgerController';
import { requireAuth } from '../middleware/requireAuth';
import { requirePermission } from '../middleware/requirePermission';

const router = Router();

router.use(requireAuth);
router.get('/accounts', requirePermission('ledger', 'view'), listChartOfAccounts);
router.post('/accounts/seed', requirePermission('ledger', 'create'), seedChartOfAccounts);
router.get('/entries', requirePermission('ledger', 'view'), listLedgerEntries);
router.post('/entries/:id/post', requirePermission('ledger', 'post'), postLedgerEntry);

export default router;
