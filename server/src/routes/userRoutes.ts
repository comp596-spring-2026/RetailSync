import { Router } from 'express';
import { assignUserRole, listUsers } from '../controllers/userController';
import { requireAuth } from '../middleware/requireAuth';
import { requirePermission } from '../middleware/requirePermission';

const router = Router();

router.use(requireAuth);
router.get('/', requirePermission('users', 'view'), listUsers);
router.put('/:id/role', requirePermission('users', 'assignRole'), assignUserRole);

export default router;
