import { Router } from 'express';
import multer from 'multer';
import { importPosCsv, listPosDaily } from '../controllers/posController';
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
router.get('/daily', requirePermission('pos', 'view'), listPosDaily);

export default router;
