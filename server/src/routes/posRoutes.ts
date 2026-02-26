import { Router } from 'express';
import multer from 'multer';
import {
  commitPosImportFromSharedSheet,
  importPosCsv,
  importPosFile,
  importPosRows,
  listPosDaily,
  previewPosImportFromSharedSheet
} from '../controllers/posController';
import { requireAuth } from '../middleware/requireAuth';
import { requirePermission } from '../middleware/requirePermission';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(requireAuth);
router.post(
  '/import',
  requirePermission('pos', 'create'),
  requirePermission('pos', 'import'),
  upload.single('file'),
  importPosCsv
);
router.post(
  '/import-file',
  requirePermission('pos', 'create'),
  requirePermission('pos', 'import'),
  upload.single('file'),
  importPosFile
);
router.post(
  '/import-rows',
  requirePermission('pos', 'create'),
  requirePermission('pos', 'import'),
  importPosRows
);
router.post(
  '/import/sheets/preview',
  requirePermission('pos', 'create'),
  requirePermission('pos', 'import'),
  previewPosImportFromSharedSheet
);
router.post(
  '/import/sheets/commit',
  requirePermission('pos', 'create'),
  requirePermission('pos', 'import'),
  commitPosImportFromSharedSheet
);
router.get('/daily', requirePermission('pos', 'view'), listPosDaily);

export default router;
