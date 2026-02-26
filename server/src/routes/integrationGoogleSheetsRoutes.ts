import { Router } from 'express';
import {
  getGoogleSheetsConnectUrl,
  googleSheetsCallback,
  startGoogleSheetsConnect
} from '../controllers/googleController';
import { requireAuth } from '../middleware/requireAuth';
import { requirePermission } from '../middleware/requirePermission';

const router = Router();

router.get(
  '/start-url',
  requireAuth,
  requirePermission('rolesSettings', 'view'),
  getGoogleSheetsConnectUrl
);
router.get(
  '/start',
  requireAuth,
  requirePermission('rolesSettings', 'view'),
  startGoogleSheetsConnect
);
router.get('/callback', googleSheetsCallback);

export default router;
