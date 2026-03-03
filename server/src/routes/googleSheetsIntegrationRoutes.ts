import { Router } from 'express';
import { debugOAuthConnector, debugSharedConnector } from '../controllers/googleSheetsController';
import { requireAuth } from '../middleware/requireAuth';
import { requirePermission } from '../middleware/requirePermission';

const router = Router();

router.use(requireAuth, requirePermission('rolesSettings', 'edit'));

router.post('/oauth/debug', debugOAuthConnector);
router.post('/shared/debug', debugSharedConnector);

export default router;
