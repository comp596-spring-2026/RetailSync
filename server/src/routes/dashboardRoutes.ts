import { Router } from 'express';
import { getDashboardSummary } from '../controllers/dashboardController';
import { requireAuth } from '../middleware/requireAuth';
import { requirePermission } from '../middleware/requirePermission';

const router = Router();

router.use(requireAuth);
router.get('/', requirePermission('dashboard', 'view'), getDashboardSummary);

export default router;
