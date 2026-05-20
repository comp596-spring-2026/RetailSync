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
router.get('/oauth/sources', requirePermission('settings', 'view'), listOAuthSources);
router.get('/shared/profiles', requirePermission('settings', 'view'), listSharedProfiles);
router.get('/shared-files', requirePermission('settings', 'view'), listSharedWithServiceAccountSpreadsheets);
router.get('/tabs', requirePermission('settings', 'view'), listSpreadsheetTabs);
router.post('/tabs', requirePermission('settings', 'view'), listSpreadsheetTabs);
router.post('/verify', requirePermission('settings', 'edit'), verifySharedSheetsConfig);
router.post('/config', requirePermission('settings', 'edit'), upsertSharedSheetsConfig);
router.post('/save-mapping', requirePermission('settings', 'edit'), saveGoogleSheetsMapping);
router.post('/sync-schedule', requirePermission('settings', 'edit'), upsertSheetsSyncSchedule);
router.post('/delete-source', requirePermission('settings', 'edit'), deleteGoogleSheetsSourceBinding);
router.post('/oauth/debug', requirePermission('settings', 'edit'), debugOAuthConnector);
router.post('/shared/debug', requirePermission('settings', 'edit'), debugSharedConnector);

export default router;
