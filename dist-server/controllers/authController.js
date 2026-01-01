"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateProfile = exports.verifyOTP = exports.requestOTP = void 0;
const client_1 = require("@prisma/client");
const bot_1 = require("../bot");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const prisma = new client_1.PrismaClient();
const OTP_STORE = new Map();
// Generate 6-digit OTP
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();
const requestOTP = async (req, res) => {
    const { phoneNumber, telegramChatId } = req.body;
    if (!phoneNumber || !telegramChatId) {
        return res.status(400).json({ error: 'Phone number and Telegram Chat ID required' });
    }
    const otp = generateOTP();
    OTP_STORE.set(phoneNumber, { code: otp, expires: Date.now() + 5 * 60 * 1000 }); // 5 mins expiry
    // Send OTP via Telegram Bot
    try {
        await (0, bot_1.sendMessageToTelegram)(telegramChatId, `🔐 Your Login Code: *${otp}*\n\nDo not share this code with anyone.`);
        res.json({ success: true, message: 'OTP sent to Telegram' });
    }
    catch (error) {
        console.error('Failed to send OTP:', error);
        res.status(500).json({ error: 'Failed to send OTP via Telegram' });
    }
};
exports.requestOTP = requestOTP;
const verifyOTP = async (req, res) => {
    const { phoneNumber, code } = req.body;
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
        const token = jsonwebtoken_1.default.sign({ userId: user.id }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });
        res.json({ success: true, token, user, isNewUser });
    }
    catch (error) {
        console.error('Database error during login:', error);
        // Fallback for when DB is down - allow login but warn
        res.status(503).json({ error: 'Database unavailable. Please try again later.' });
    }
};
exports.verifyOTP = verifyOTP;
const updateProfile = async (req, res) => {
    const { userId, firstName, lastName, username, bio } = req.body;
    try {
        const user = await prisma.user.update({
            where: { id: userId },
            data: { firstName, lastName, username, bio }
        });
        res.json({ success: true, user });
    }
    catch (error) {
        console.error('Profile update error:', error);
        res.status(400).json({ error: 'Failed to update profile' });
    }
};
exports.updateProfile = updateProfile;
