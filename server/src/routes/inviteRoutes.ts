import { Router } from 'express';
import { createInvite, deleteInvite, listInvites } from '../controllers/inviteController';
import { requireAuth } from '../middleware/requireAuth';
import { requirePermission } from '../middleware/requirePermission';

const router = Router();

router.use(requireAuth);
router.post('/', requirePermission('users', 'invite'), createInvite);
router.get('/', requirePermission('users', 'view'), listInvites);
router.delete('/:id', requirePermission('users', 'delete'), deleteInvite);

export default router;
