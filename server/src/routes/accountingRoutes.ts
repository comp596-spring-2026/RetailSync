import { Router } from 'express';
import {
  confirmStatement,
  createStatement,
  getStatementById,
  getUploadUrl,
  listStatements,
  lockStatement,
  reprocessStatement,
  updateStatementTransactions
} from '../controllers/accountingController';
import {
  getAccountingObservabilitySummary,
  runAccountingObservabilityDebug
} from '../controllers/accountingObservabilityController';
import { requireAuth } from '../middleware/requireAuth';
import { requirePermission } from '../middleware/requirePermission';

const router = Router();

router.use(requireAuth);
router.get('/statements', requirePermission('bankStatements', 'view'), listStatements);
router.get('/statements/:id', requirePermission('bankStatements', 'view'), getStatementById);
router.post('/statements/upload-url', requirePermission('bankStatements', 'create'), getUploadUrl);
router.post('/statements', requirePermission('bankStatements', 'create'), createStatement);
router.post('/statements/:id/reprocess', requirePermission('bankStatements', 'edit'), reprocessStatement);
router.patch('/statements/:id/transactions', requirePermission('bankStatements', 'edit'), updateStatementTransactions);
router.post('/statements/:id/confirm', requirePermission('bankStatements', 'confirm'), confirmStatement);
router.post('/statements/:id/lock', requirePermission('bankStatements', 'lock'), lockStatement);
router.get('/observability/summary', requirePermission('accounting', 'view'), getAccountingObservabilitySummary);
router.get('/observability/debug', requirePermission('accounting', 'view'), runAccountingObservabilityDebug);

export default router;
