import { Router } from 'express';
import { monthlySummary } from '../controllers/reportsController';
import { requireAuth } from '../middleware/requireAuth';
import { requirePermission } from '../middleware/requirePermission';

const router = Router();

router.use(requireAuth);
router.get('/monthly-summary', requirePermission('reports', 'view'), monthlySummary);

export default router;
