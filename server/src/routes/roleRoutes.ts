import { Router } from 'express';
import {
  createRole,
  deleteRole,
  listRoles,
  modulesCatalog,
  productPermissionCatalog,
  updateRole
} from '../controllers/roleController';
import { requireAuth } from '../middleware/requireAuth';
import { requirePermission } from '../middleware/requirePermission';

const router = Router();

router.use(requireAuth, requirePermission('rolesSettings', 'view'));
router.get('/modules', modulesCatalog);
router.get('/product-catalog', productPermissionCatalog);
router.get('/', listRoles);
router.post('/', requirePermission('rolesSettings', 'create'), createRole);
router.put('/:id', requirePermission('rolesSettings', 'edit'), updateRole);
router.delete('/:id', requirePermission('rolesSettings', 'delete'), deleteRole);

export default router;
