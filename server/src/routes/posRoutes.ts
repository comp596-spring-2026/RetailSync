import { Router } from 'express';
import multer from 'multer';
import {
  clearPosDailyData,
  commitPosImportFromSharedSheet,
  exportPosDailyCsv,
  getPosOverview,
  getPosTrend,
  importPosCsv,
  importPosFile,
  importPosRows,
  listPosDaily,
  listPosDailyPaged,
  matchPosImportMapping,
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
router.post(
  '/import/google-sheets',
  requirePermission('pos', 'create'),
  requirePermission('pos', 'import'),
  commitPosImportFromSharedSheet
);
router.post(
  '/import/sheets/match',
  requirePermission('pos', 'create'),
  requirePermission('pos', 'import'),
  matchPosImportMapping
);
router.post(
  '/clear',
  requirePermission('pos', 'create'),
  requirePermission('pos', 'import'),
  clearPosDailyData
);
router.get('/daily', requirePermission('pos', 'view'), listPosDaily);
router.get('/trend', requirePermission('pos', 'view'), getPosTrend);
router.get('/daily-paged', requirePermission('pos', 'view'), listPosDailyPaged);
router.get('/overview', requirePermission('pos', 'view'), getPosOverview);
router.get('/export', requirePermission('pos', 'view'), exportPosDailyCsv);

export default router;
