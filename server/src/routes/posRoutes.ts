import { Router } from 'express';
import multer from 'multer';
import { importPosCsv, importPosFile, importPosRows, listPosDaily } from '../controllers/posController';
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
router.get('/daily', requirePermission('pos', 'view'), listPosDaily);

export default router;
