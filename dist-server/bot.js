"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupWebhook = exports.sendMessageToTelegram = void 0;
const axios_1 = __importDefault(require("axios"));
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE';
const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
const sendMessageToTelegram = async (chatId, text) => {
    try {
        await axios_1.default.post(`${TELEGRAM_API_URL}/sendMessage`, {
            chat_id: chatId,
            text: text,
            parse_mode: 'Markdown',
        });
    }
    catch (error) {
        console.error('Error sending message to Telegram:', error);
    }
};
exports.sendMessageToTelegram = sendMessageToTelegram;
const setupWebhook = async (url) => {
    try {
        await axios_1.default.post(`${TELEGRAM_API_URL}/setWebhook`, {
            url: url,
        });
        console.log('Webhook set successfully');
    }
    catch (error) {
        console.error('Error setting webhook:', error);
    }
};
exports.setupWebhook = setupWebhook;
