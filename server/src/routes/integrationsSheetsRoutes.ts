import { Router } from 'express';
import {
  debugOAuthConnector,
  debugSharedConnector,
  listOAuthSources,
  listSharedProfiles
} from '../controllers/googleSheetsController';
import {
  deleteGoogleSheetsSourceBinding,
  listSharedWithServiceAccountSpreadsheets,
  listSpreadsheetTabs,
  saveGoogleSheetsMapping,
  upsertSharedSheetsConfig,
  upsertSheetsSyncSchedule,
  verifySharedSheetsConfig
} from '../controllers/integrationsSheetsController';
import { requireAuth } from '../middleware/requireAuth';
import { requirePermission } from '../middleware/requirePermission';

const router = Router();

router.use(requireAuth);
router.get('/oauth/sources', requirePermission('rolesSettings', 'view'), listOAuthSources);
router.get('/shared/profiles', requirePermission('rolesSettings', 'view'), listSharedProfiles);
router.get('/shared-files', requirePermission('rolesSettings', 'view'), listSharedWithServiceAccountSpreadsheets);
router.get('/tabs', requirePermission('rolesSettings', 'view'), listSpreadsheetTabs);
router.post('/tabs', requirePermission('rolesSettings', 'view'), listSpreadsheetTabs);
router.post('/verify', requirePermission('rolesSettings', 'edit'), verifySharedSheetsConfig);
router.post('/config', requirePermission('rolesSettings', 'edit'), upsertSharedSheetsConfig);
router.post('/save-mapping', requirePermission('rolesSettings', 'edit'), saveGoogleSheetsMapping);
router.post('/sync-schedule', requirePermission('rolesSettings', 'edit'), upsertSheetsSyncSchedule);
router.post('/delete-source', requirePermission('rolesSettings', 'edit'), deleteGoogleSheetsSourceBinding);
router.post('/oauth/debug', requirePermission('rolesSettings', 'edit'), debugOAuthConnector);
router.post('/shared/debug', requirePermission('rolesSettings', 'edit'), debugSharedConnector);

export default router;
