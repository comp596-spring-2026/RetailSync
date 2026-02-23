import { Router } from 'express';
import { connectGoogle, connectGoogleUrl, googleCallback } from '../controllers/googleController';
import { requireAuth } from '../middleware/requireAuth';
import { requirePermission } from '../middleware/requirePermission';

const router = Router();

router.get('/connect-url', requireAuth, requirePermission('rolesSettings', 'view'), connectGoogleUrl);
router.get('/connect', requireAuth, requirePermission('rolesSettings', 'view'), connectGoogle);
router.get('/callback', googleCallback);

export default router;
