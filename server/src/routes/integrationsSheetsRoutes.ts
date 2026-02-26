import { Router } from 'express';
import {
  listSpreadsheetTabs,
  upsertSharedSheetsConfig,
  verifySharedSheetsConfig
} from '../controllers/integrationsSheetsController';
import { requireAuth } from '../middleware/requireAuth';
import { requirePermission } from '../middleware/requirePermission';

const router = Router();

router.use(requireAuth);
router.post('/config', requirePermission('rolesSettings', 'edit'), upsertSharedSheetsConfig);
router.post('/verify', requirePermission('rolesSettings', 'edit'), verifySharedSheetsConfig);
router.get('/tabs', requirePermission('rolesSettings', 'view'), listSpreadsheetTabs);

export default router;
