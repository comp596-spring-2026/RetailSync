import { Router } from 'express';
import multer from 'multer';
import {
  createItem,
  deleteItem,
  importItemsCsv,
  listItems,
  updateItem
} from '../controllers/itemController';
import { requireAuth } from '../middleware/requireAuth';
import { requirePermission } from '../middleware/requirePermission';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(requireAuth);
router.get('/', requirePermission('items', 'view'), listItems);
router.post('/', requirePermission('items', 'create'), createItem);
router.post(
  '/import',
  requirePermission('items', 'create'),
  requirePermission('items', 'import'),
  upload.single('file'),
  importItemsCsv
);
router.put('/:id', requirePermission('items', 'edit'), updateItem);
router.delete('/:id', requirePermission('items', 'delete'), deleteItem);

export default router;
