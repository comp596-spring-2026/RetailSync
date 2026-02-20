import { Router } from 'express';
import { createCompany, joinCompany, myCompany } from '../controllers/companyController';
import { requireAuth } from '../middleware/requireAuth';

const router = Router();

router.post('/create', requireAuth, createCompany);
router.post('/join', requireAuth, joinCompany);
router.get('/mine', requireAuth, myCompany);

export default router;
