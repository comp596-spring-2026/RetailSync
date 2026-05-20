import { Router } from 'express';
import {
  getGoogleSheetsConnectUrl,
  getGoogleSheetsOAuthStatus,
  googleSheetsCallback,
  listOAuthSpreadsheets,
  startGoogleSheetsConnect
} from '../controllers/googleController';
import { requireAuth } from '../middleware/requireAuth';
import { requirePermission } from '../middleware/requirePermission';

const router = Router();

router.get(
  '/oauth-status',
  requireAuth,
  requirePermission('settings', 'view'),
  getGoogleSheetsOAuthStatus
);
router.get(
  '/start-url',
  requireAuth,
  requirePermission('settings', 'view'),
  getGoogleSheetsConnectUrl
);
router.get(
  '/files',
  requireAuth,
  requirePermission('settings', 'view'),
  listOAuthSpreadsheets
);
router.get(
  '/start',
  requireAuth,
  requirePermission('settings', 'view'),
  startGoogleSheetsConnect
);
router.get('/callback', googleSheetsCallback);

export default router;
