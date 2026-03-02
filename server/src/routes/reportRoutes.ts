import { Router } from 'express';
import { dateRangeSummary, monthlySummary } from '../controllers/reportsController';
import { requireAuth } from '../middleware/requireAuth';
import { requirePermission } from '../middleware/requirePermission';

const router = Router();

router.use(requireAuth);
router.get('/monthly-summary', requirePermission('reports', 'view'), monthlySummary);
router.get('/date-range-summary', requirePermission('reports', 'view'), dateRangeSummary);

export default router;
