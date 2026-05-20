import { Router } from 'express';
import { assignUserRole, deleteUser, listUsers, updateUser } from '../controllers/userController';
import { requireAuth } from '../middleware/requireAuth';
import { requirePermission } from '../middleware/requirePermission';

const router = Router();

router.use(requireAuth);
router.get('/', requirePermission('users', 'view'), listUsers);
router.put('/:id', requirePermission('users', 'edit'), updateUser);
router.delete('/:id', requirePermission('users', 'delete'), deleteUser);
router.put('/:id/role', requirePermission('users', 'assignRole'), assignUserRole);

export default router;
