import { Router } from 'express';
import { moveInventory, stockByLocation } from '../controllers/inventoryController';
import { requireAuth } from '../middleware/requireAuth';
import { requirePermission } from '../middleware/requirePermission';

const router = Router();

router.use(requireAuth);
router.post('/move', requirePermission('inventory', 'edit'), requirePermission('inventory', 'move'), moveInventory);
router.get('/location/:code', requirePermission('inventory', 'view'), stockByLocation);

export default router;
