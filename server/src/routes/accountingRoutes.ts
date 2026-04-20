import { Router } from 'express';
import multer from 'multer';
import {
  createStatement,
  deleteStatement,
  detectStatementMonth,
  completeStatementMonth,
  getStatementArtifact,
  getStatementById,
  getStatementMonthSummary,
  getStatementChecks,
  listStatementEntries,
  getStatementSuggestions,
  getStatementStatus,
  getStatementStream,
  getUploadUrl,
  listStatementMonths,
  listStatements,
  reprocessStatement,
  updateStatementEntryReview,
  updateStatementSuggestionReview,
  retryStatementCheck
} from '../controllers/accountingController';
import {
  getAccountingObservabilitySummary,
  runAccountingObservabilityDebug
} from '../controllers/accountingObservabilityController';
import { requireAuth } from '../middleware/requireAuth';
import { requirePermission } from '../middleware/requirePermission';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(requireAuth);
router.post(
  '/statements/detect-month',
  requirePermission('bankStatements', 'create'),
  upload.single('file'),
  detectStatementMonth
);
router.get('/statements', requirePermission('bankStatements', 'view'), listStatements);
router.get('/statement-months', requirePermission('bankStatements', 'view'), listStatementMonths);
router.get('/statement-months/:month', requirePermission('bankStatements', 'view'), getStatementMonthSummary);
router.get('/statements/:id', requirePermission('bankStatements', 'view'), getStatementById);
router.get('/statements/:id/status', requirePermission('bankStatements', 'view'), getStatementStatus);
router.get('/statements/:id/checks', requirePermission('bankStatements', 'view'), getStatementChecks);
router.get('/statements/:id/entries', requirePermission('bankStatements', 'view'), listStatementEntries);
router.get('/statements/:id/suggestions', requirePermission('bankStatements', 'view'), getStatementSuggestions);
router.patch(
  '/statements/:id/entries/:entryId/review',
  requirePermission('bankStatements', 'edit'),
  updateStatementEntryReview
);
router.patch(
  '/statements/:id/suggestions/:suggestionId/review',
  requirePermission('bankStatements', 'edit'),
  updateStatementSuggestionReview
);
router.post(
  '/statements/:id/complete-month',
  requirePermission('bankStatements', 'edit'),
  completeStatementMonth
);
router.get('/statements/:id/artifact', requirePermission('bankStatements', 'view'), getStatementArtifact);
router.get('/statements/:id/stream', requirePermission('bankStatements', 'view'), getStatementStream);
router.post('/statements/upload-url', requirePermission('bankStatements', 'create'), getUploadUrl);
router.post('/statements', requirePermission('bankStatements', 'create'), createStatement);
router.delete('/statements/:id', requirePermission('bankStatements', 'delete'), deleteStatement);
router.post('/statements/:id/reprocess', requirePermission('bankStatements', 'edit'), reprocessStatement);
router.post('/statements/:id/checks/:checkId/retry', requirePermission('bankStatements', 'edit'), retryStatementCheck);
router.get('/observability/summary', requirePermission('accounting', 'view'), getAccountingObservabilitySummary);
router.get('/observability/debug', requirePermission('accounting', 'view'), runAccountingObservabilityDebug);

export default router;
