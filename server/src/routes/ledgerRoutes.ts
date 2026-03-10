import { Router } from 'express';
import {
  approveLedgerEntry,
  bulkApproveLedgerEntries,
  excludeLedgerEntry,
  getLedgerEntryById,
  listLedgerEntries,
  postApprovedLedgerEntries,
  updateLedgerEntry
} from '../controllers/ledgerController';
import { requireAuth } from '../middleware/requireAuth';
import { requirePermission } from '../middleware/requirePermission';

const router = Router();

router.use(requireAuth);
router.get('/entries', requirePermission('ledger', 'view'), listLedgerEntries);
router.get('/entries/:id', requirePermission('ledger', 'view'), getLedgerEntryById);
router.patch('/entries/:id', requirePermission('ledger', 'edit'), updateLedgerEntry);
router.post('/entries/:id/approve', requirePermission('ledger', 'post'), approveLedgerEntry);
router.post('/entries/:id/exclude', requirePermission('ledger', 'edit'), excludeLedgerEntry);
router.post('/entries/bulk-approve', requirePermission('ledger', 'post'), bulkApproveLedgerEntries);
router.post('/post-approved', requirePermission('ledger', 'post'), postApprovedLedgerEntries);

export default router;
