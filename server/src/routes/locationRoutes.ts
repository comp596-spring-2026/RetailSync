import { Router } from 'express';
import {
  createLocation,
  deleteLocation,
  listLocations,
  updateLocation
} from '../controllers/locationController';
import { requireAuth } from '../middleware/requireAuth';
import { requirePermission } from '../middleware/requirePermission';

const router = Router();

router.use(requireAuth);
router.get('/', requirePermission('locations', 'view'), listLocations);
router.post('/', requirePermission('locations', 'create'), createLocation);
router.put('/:id', requirePermission('locations', 'edit'), updateLocation);
router.delete('/:id', requirePermission('locations', 'delete'), deleteLocation);

export default router;
