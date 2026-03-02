import { Router } from 'express';
import {
  deleteGoogleSheetsSourceBinding,
  listSharedWithServiceAccountSpreadsheets,
  listSpreadsheetTabs,
  saveGoogleSheetsMapping,
  upsertSheetsSyncSchedule,
  upsertSharedSheetsConfig,
  verifySharedSheetsConfig
} from '../controllers/integrationsSheetsController';
import { requireAuth } from '../middleware/requireAuth';
import { requirePermission } from '../middleware/requirePermission';

const router = Router();

router.use(requireAuth);
router.get('/shared-files', requirePermission('rolesSettings', 'view'), listSharedWithServiceAccountSpreadsheets);
router.post('/config', requirePermission('rolesSettings', 'edit'), upsertSharedSheetsConfig);
router.post('/verify', requirePermission('rolesSettings', 'edit'), verifySharedSheetsConfig);
router.get('/tabs', requirePermission('rolesSettings', 'view'), listSpreadsheetTabs);
router.post('/tabs', requirePermission('rolesSettings', 'view'), listSpreadsheetTabs);
router.post('/save-mapping', requirePermission('rolesSettings', 'edit'), saveGoogleSheetsMapping);
router.post('/sync-schedule', requirePermission('rolesSettings', 'edit'), upsertSheetsSyncSchedule);
router.post('/delete-source', requirePermission('rolesSettings', 'edit'), deleteGoogleSheetsSourceBinding);

export default router;
