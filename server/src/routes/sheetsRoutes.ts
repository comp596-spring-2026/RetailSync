import { Router } from 'express';
import { readSheet } from '../controllers/sheetsController';
import { requireAuth } from '../middleware/requireAuth';
import { requirePermission } from '../middleware/requirePermission';

const router = Router();

router.use(requireAuth);
router.get('/read', requirePermission('pos', 'view'), readSheet);

export default router;
