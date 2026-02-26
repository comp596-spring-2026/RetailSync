import { Router } from 'express';
import { logout, me, refresh } from '../controllers/authController';
import { googleAuthCallback, googleAuthStart } from '../controllers/authGoogleController';
import { requireAuth } from '../middleware/requireAuth';

const router = Router();

router.get('/google/start', googleAuthStart);
router.get('/google/callback', googleAuthCallback);
router.post('/refresh', refresh);
router.post('/logout', logout);
router.get('/me', requireAuth, me);

export default router;
