import { Router } from 'express';
import {
  createCompany,
  getQuickBooksOnboardingStatus,
  joinCompany,
  myCompany,
  startQuickBooksOnboarding
} from '../controllers/companyController';
import { requireAuth } from '../middleware/requireAuth';

const router = Router();

router.post('/create', requireAuth, createCompany);
router.get('/quickbooks/onboarding', requireAuth, getQuickBooksOnboardingStatus);
router.post('/quickbooks/connect', requireAuth, startQuickBooksOnboarding);
router.post('/join', requireAuth, joinCompany);
router.get('/mine', requireAuth, myCompany);

export default router;
