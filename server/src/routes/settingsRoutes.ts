import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { requirePermission } from '../middleware/requirePermission';
import {
  connectQuickbooksPlaceholder,
  disconnectGoogle,
  disconnectQuickbooks,
  getSettings,
  setGoogleMode,
  setQuickbooksSettings,
  testGoogleSheetAccess,
  upsertGoogleSource
} from '../controllers/settingsController';

const router = Router();

router.use(requireAuth, requirePermission('rolesSettings', 'view'));

router.get('/', getSettings);
router.post('/google-sheets/test', testGoogleSheetAccess);
router.post('/quickbooks/connect', connectQuickbooksPlaceholder);

router.use(requirePermission('rolesSettings', 'edit'));
router.put('/google-sheets/mode', setGoogleMode);
router.put('/google-sheets/source', upsertGoogleSource);
router.put('/quickbooks', setQuickbooksSettings);
router.post('/disconnect/google', disconnectGoogle);
router.post('/disconnect/quickbooks', disconnectQuickbooks);

export default router;
