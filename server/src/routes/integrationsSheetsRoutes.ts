import { Router } from 'express';
import {
  upsertSharedSheetsConfig,
  verifySharedSheetsConfig
} from '../controllers/integrationsSheetsController';
import { requireAuth } from '../middleware/requireAuth';
import { requirePermission } from '../middleware/requirePermission';

const router = Router();

router.use(requireAuth);
router.post('/config', requirePermission('rolesSettings', 'edit'), upsertSharedSheetsConfig);
router.post('/verify', requirePermission('rolesSettings', 'edit'), verifySharedSheetsConfig);

export default router;
