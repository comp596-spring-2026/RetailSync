import { Router } from 'express';
import {
  acceptInvite,
  confirmEmailVerification,
  forgotPassword,
  getInviteDetails,
  login,
  logout,
  me,
  refresh,
  register,
  requestEmailVerification,
  resetPassword
} from '../controllers/authController';
import { googleAuthCallback, googleAuthStart } from '../controllers/authGoogleController';
import { requireAuth } from '../middleware/requireAuth';

const router = Router();

router.post('/register', register);
router.get('/invite', getInviteDetails);
router.post('/invite/accept', acceptInvite);
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/verify-email/request', requestEmailVerification);
router.post('/verify-email/confirm', confirmEmailVerification);
router.get('/google/start', googleAuthStart);
router.get('/google/callback', googleAuthCallback);
router.post('/refresh', refresh);
router.post('/logout', logout);
router.get('/me', requireAuth, me);

export default router;
