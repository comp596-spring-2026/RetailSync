import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { requireAnyPermission } from '../middleware/requireAnyPermission';
import { requirePermission } from '../middleware/requirePermission';
import { requireQuickBooksDisconnect } from '../middleware/requireQuickBooksDisconnect';
import {
  activateGoogleSheets,
  commitGoogleSheetsChange,
  createOAuthSource,
  createSharedProfile,
  listOAuthSources,
  listSharedProfiles,
  stageGoogleSheetsChange,
  updateOAuthConnector,
  updateSharedConnector
} from '../controllers/googleSheetsController';
import {
  connectQuickBooks,
  setQuickBooksSettings,
  disconnectQuickBooks
} from '../controllers/settings/quickbooksSettingsController';
import {
  disconnectGoogle,
  resetGoogleSheetsIntegration,
  setGoogleMode,
  testGoogleSheetAccess,
  upsertGoogleSource
} from '../controllers/settings/googleSheetsSettingsController';
import {
  getGoogleSheetsSyncOverview,
  getSettings
} from '../controllers/settings/settingsReadController';
import { verifySharedSheetsConfig } from '../controllers/integrationsSheetsController';

const router = Router();

router.use(requireAuth);

router.get('/', requirePermission('settings', 'view'), getSettings);
router.get('/google-sheets/sync-overview', requirePermission('settings', 'view'), getGoogleSheetsSyncOverview);

router.get('/google-sheets/oauth/sources', requirePermission('settings', 'view'), listOAuthSources);
router.get('/google-sheets/shared/profiles', requirePermission('settings', 'view'), listSharedProfiles);

router.post('/google-sheets/activate', requirePermission('settings', 'edit'), activateGoogleSheets);
router.post('/google-sheets/stage-change', requirePermission('settings', 'edit'), stageGoogleSheetsChange);
router.post('/google-sheets/commit-change', requirePermission('settings', 'edit'), commitGoogleSheetsChange);
router.post('/google-sheets/oauth/sources', requirePermission('settings', 'edit'), createOAuthSource);
router.put(
  '/google-sheets/oauth/sources/:sourceId/connectors/:connectorKey',
  requirePermission('settings', 'edit'),
  updateOAuthConnector
);
router.post('/google-sheets/shared/profiles', requirePermission('settings', 'edit'), createSharedProfile);
router.put(
  '/google-sheets/shared/profiles/:profileId/connectors/:connectorKey',
  requirePermission('settings', 'edit'),
  updateSharedConnector
);
router.put('/google-sheets/mode', requirePermission('settings', 'edit'), setGoogleMode);
router.put('/google-sheets/source', requirePermission('settings', 'edit'), upsertGoogleSource);
router.post('/google-sheets/test', requirePermission('settings', 'edit'), testGoogleSheetAccess);
router.post('/google-sheets/reset', requirePermission('settings', 'edit'), resetGoogleSheetsIntegration);
router.post('/google-sheets/shared/verify', requirePermission('settings', 'edit'), verifySharedSheetsConfig);
router.post('/disconnect/google', requirePermission('settings', 'edit'), disconnectGoogle);
router.put('/quickbooks', requirePermission('settings', 'edit'), setQuickBooksSettings);
router.post(
  '/quickbooks/connect',
  requireAnyPermission([
    { moduleKey: 'quickbooks', action: 'connect' },
    { moduleKey: 'quickbooks', action: 'edit' }
  ]),
  connectQuickBooks
);
router.post('/disconnect/quickbooks', requireQuickBooksDisconnect, disconnectQuickBooks);

export default router;
