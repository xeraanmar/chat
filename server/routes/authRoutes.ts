import express from 'express';
import { requestOTP, verifyOTP, updateProfile } from '../controllers/authController';

const router = express.Router();

router.post('/request-otp', requestOTP);
router.post('/verify-otp', verifyOTP);
router.post('/update-profile', updateProfile);

export default router;
