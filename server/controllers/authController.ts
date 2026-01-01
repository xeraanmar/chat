import { Request, Response } from 'express';
import { sendMessageToTelegram } from '../bot';
import jwt from 'jsonwebtoken';

// In-memory store for OTPs
const OTP_STORE = new Map<string, { code: string; expires: number }>();

// Generate 6-digit OTP
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

export const requestOTP = async (req: Request, res: Response) => {
  const { phoneNumber, telegramChatId } = req.body;

  if (!phoneNumber || !telegramChatId) {
    return res.status(400).json({ error: 'Phone number and Telegram Chat ID required' });
  }

  const otp = generateOTP();
  OTP_STORE.set(phoneNumber, { code: otp, expires: Date.now() + 5 * 60 * 1000 }); // 5 mins expiry

  // Send OTP via Telegram Bot
  try {
    await sendMessageToTelegram(telegramChatId, `🔐 Your Login Code: *${otp}*\n\nDo not share this code with anyone.`);
    res.json({ success: true, message: 'OTP sent to Telegram' });
  } catch (error) {
    console.error('Failed to send OTP:', error);
    // Even if Telegram fails, we return success in dev mode so user can see the code in logs if needed
    // But for production, we should probably fail. 
    // For now, let's assume if Telegram fails, we can't proceed unless we have a bypass.
    res.status(500).json({ error: 'Failed to send OTP via Telegram' });
  }
};

export const verifyOTP = async (req: Request, res: Response) => {
  const { phoneNumber, code } = req.body;
  
  // --- MAGIC CODE BYPASS ---
  // If the user enters '000000', we bypass everything and let them in.
  // This is crucial for when the DB is down or Telegram is blocked.
  if (code === '000000') {
    console.log('🔓 Magic Code used! Bypassing checks...');
    const mockUser = {
      id: 'magic-user-' + Math.random().toString(36).substr(2, 9),
      phoneNumber: phoneNumber || '+0000000000',
      firstName: 'Admin',
      lastName: '(Bypass)',
      username: 'admin_bypass'
    };
    const token = jwt.sign({ userId: mockUser.id }, process.env.JWT_SECRET || 'secret', { expiresIn: '1d' });
    return res.json({ success: true, token, user: mockUser, isNewUser: false });
  }
  // -------------------------

  const storedOTP = OTP_STORE.get(phoneNumber);

  if (!storedOTP || storedOTP.code !== code) {
    return res.status(400).json({ error: 'Invalid OTP' });
  }

  if (Date.now() > storedOTP.expires) {
    OTP_STORE.delete(phoneNumber);
    return res.status(400).json({ error: 'OTP expired' });
  }

  OTP_STORE.delete(phoneNumber); // Clear OTP after use

  try {
    // Use the dynamic prisma client injected by middleware
    const prisma = (req as any).prisma;
    
    if (!prisma) {
      throw new Error('Prisma client not found in request');
    }

    // Find or Create User
    let user = await prisma.user.findUnique({ where: { phoneNumber } });

    let isNewUser = false;
    if (!user) {
      user = await prisma.user.create({
        data: { phoneNumber }
      });
      isNewUser = true;
    }

    // Generate JWT Token
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });

    res.json({ success: true, token, user, isNewUser });
  } catch (error: any) {
    console.error('Database error during login:', error);
    
    // If DB fails, we fallback to a temporary session so the user isn't locked out
    console.warn('⚠️ DB Down. Creating temporary session.');
    const tempUser = {
      id: 'temp-' + Date.now(),
      phoneNumber,
      firstName: 'Guest',
      lastName: '(Offline Mode)',
    };
    const token = jwt.sign({ userId: tempUser.id }, process.env.JWT_SECRET || 'secret', { expiresIn: '1h' });
    
    res.json({ 
      success: true, 
      token, 
      user: tempUser, 
      isNewUser: false,
      warning: 'Offline Mode: Database is unavailable. Changes may not be saved.' 
    });
  }
};

export const updateProfile = async (req: Request, res: Response) => {
  const { userId, firstName, lastName, username, bio } = req.body;

  try {
    const prisma = (req as any).prisma;
    const user = await prisma.user.update({
      where: { id: userId },
      data: { firstName, lastName, username, bio }
    });
    res.json({ success: true, user });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(400).json({ error: 'Failed to update profile' });
  }
};
