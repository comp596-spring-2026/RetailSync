import { Router } from 'express';
import {
  createStatement,
  getStatementById,
  getStatementChecks,
  getStatementStatus,
  getStatementStream,
  getUploadUrl,
  listStatements,
  reprocessStatement,
  retryStatementCheck
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
router.get('/statements/:id/status', requirePermission('bankStatements', 'view'), getStatementStatus);
router.get('/statements/:id/checks', requirePermission('bankStatements', 'view'), getStatementChecks);
router.get('/statements/:id/stream', requirePermission('bankStatements', 'view'), getStatementStream);
router.post('/statements/upload-url', requirePermission('bankStatements', 'create'), getUploadUrl);
router.post('/statements', requirePermission('bankStatements', 'create'), createStatement);
router.post('/statements/:id/reprocess', requirePermission('bankStatements', 'edit'), reprocessStatement);
router.post('/statements/:id/checks/:checkId/retry', requirePermission('bankStatements', 'edit'), retryStatementCheck);
router.get('/observability/summary', requirePermission('accounting', 'view'), getAccountingObservabilitySummary);
router.get('/observability/debug', requirePermission('accounting', 'view'), runAccountingObservabilityDebug);

export default router;
