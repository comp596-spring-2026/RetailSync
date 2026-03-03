import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { requirePermission } from '../middleware/requirePermission';
import {
  activateGoogleSheets,
  commitGoogleSheetsChange,
  createOAuthSource,
  createSharedProfile,
  getSettings,
  listOAuthSources,
  listSharedProfiles,
  stageGoogleSheetsChange,
  updateOAuthConnector,
  updateSharedConnector
} from '../controllers/googleSheetsController';
import {
  connectQuickbooks,
  disconnectGoogle,
  disconnectQuickbooks,
  getGoogleSheetsSyncOverview,
  resetGoogleSheetsIntegration,
  setGoogleMode,
  setQuickbooksSettings,
  testGoogleSheetAccess,
  upsertGoogleSource
} from '../controllers/settingsController';
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
router.put('/quickbooks', setQuickbooksSettings);
router.post('/quickbooks/connect', connectQuickbooks);
router.post('/disconnect/quickbooks', disconnectQuickbooks);

export default router;
