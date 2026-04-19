import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { requirePermission } from '../middleware/requirePermission';
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

router.use(requireAuth, requirePermission('rolesSettings', 'view'));

router.get('/', getSettings);
router.get('/google-sheets/oauth/sources', listOAuthSources);
router.get('/google-sheets/shared/profiles', listSharedProfiles);
router.get('/google-sheets/sync-overview', getGoogleSheetsSyncOverview);

router.use(requirePermission('rolesSettings', 'edit'));
router.post('/google-sheets/activate', activateGoogleSheets);
router.post('/google-sheets/stage-change', stageGoogleSheetsChange);
router.post('/google-sheets/commit-change', commitGoogleSheetsChange);
router.post('/google-sheets/oauth/sources', createOAuthSource);
router.put('/google-sheets/oauth/sources/:sourceId/connectors/:connectorKey', updateOAuthConnector);
router.post('/google-sheets/shared/profiles', createSharedProfile);
router.put('/google-sheets/shared/profiles/:profileId/connectors/:connectorKey', updateSharedConnector);
router.put('/google-sheets/mode', setGoogleMode);
router.put('/google-sheets/source', upsertGoogleSource);
router.post('/google-sheets/test', testGoogleSheetAccess);
router.post('/google-sheets/reset', resetGoogleSheetsIntegration);
router.post('/google-sheets/shared/verify', verifySharedSheetsConfig);
router.post('/disconnect/google', disconnectGoogle);
router.put('/quickbooks', setQuickBooksSettings);
router.post('/quickbooks/connect', connectQuickBooks);
router.post('/disconnect/quickbooks', disconnectQuickBooks);

export default router;
