"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const path_1 = __importDefault(require("path"));
const cors_1 = __importDefault(require("cors"));
const bot_1 = require("./bot");
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const client_1 = require("@prisma/client");
const child_process_1 = require("child_process");
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// --- ROBUST DATABASE CONNECTION LOGIC ---
const getDatabaseUrl = () => {
    // 1. Try explicit private URL first
    if (process.env.DATABASE_PRIVATE_URL)
        return process.env.DATABASE_PRIVATE_URL;
    // 2. Try constructing from components with PROPER ENCODING
    const { PGUSER, PGPASSWORD, PGHOST, PGPORT, PGDATABASE } = process.env;
    if (PGUSER && PGHOST && PGDATABASE) {
        // CRITICAL: Encode password to handle special characters like @, #, $, etc.
        const encodedPassword = encodeURIComponent(PGPASSWORD || '');
        const port = PGPORT || '5432';
        console.log(`🔗 Constructing Safe URL: postgresql://${PGUSER}:***@${PGHOST}:${port}/${PGDATABASE}`);
        return `postgresql://${PGUSER}:${encodedPassword}@${PGHOST}:${port}/${PGDATABASE}`;
    }
    // 3. Fallback to standard URL
    return process.env.DATABASE_URL;
};
const databaseUrl = getDatabaseUrl();
// Initialize Prisma with explicit URL
const prisma = new client_1.PrismaClient({
    datasources: {
        db: {
            url: databaseUrl,
        },
    },
    log: ['error', 'warn'], // Reduce logs to avoid noise
});
let isDbConnected = false;
let dbError = null;
// --- CRASH-PROOF MIGRATION ---
async function runMigrations() {
    console.log('🔄 [Background] Starting migration check...');
    // Wait 5 seconds before starting migration to let server stabilize
    await new Promise(resolve => setTimeout(resolve, 5000));
    return new Promise((resolve) => {
        // Pass the constructed URL explicitly to the shell command
        // We use a safe way to pass env vars to avoid shell injection
        const env = { ...process.env, DATABASE_URL: databaseUrl };
        (0, child_process_1.exec)('npx prisma db push --accept-data-loss', { env }, (error, stdout, stderr) => {
            if (error) {
                console.error(`❌ [Background] Migration failed: ${error.message}`);
                // Do NOT reject/throw, just log it. The server must stay alive.
                return resolve(false);
            }
            console.log(`✅ [Background] Migration successful: ${stdout}`);
            resolve(true);
        });
    });
}
// --- NON-BLOCKING CONNECTION ---
async function connectDB() {
    // Wait 2 seconds before first connection attempt
    await new Promise(resolve => setTimeout(resolve, 2000));
    let retries = 0;
    const maxRetries = 50; // Try for a long time (50 * 5s = ~4 minutes)
    while (retries < maxRetries) {
        try {
            await prisma.$connect();
            isDbConnected = true;
            dbError = null;
            console.log('✅ Database connected successfully');
            // Only run migrations after successful connection
            runMigrations();
            return;
        }
        catch (error) {
            console.error(`⚠️ DB Connection retry ${retries + 1}/${maxRetries} failed: ${error.message}`);
            dbError = error.message;
            retries++;
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
    console.error('❌ Gave up on DB connection. Server continues in offline mode.');
}
// --- DIAGNOSTIC ENDPOINT ---
app.get('/api/debug/db', async (req, res) => {
    res.json({
        status: 'Diagnostics V28 (Crash-Proof)',
        db: {
            connected: isDbConnected,
            error: dbError,
            url_type: process.env.DATABASE_PRIVATE_URL ? 'Explicit Private' : (process.env.PGHOST ? 'Constructed' : 'Standard'),
        },
        server: {
            uptime: process.uptime(),
            memory: process.memoryUsage(),
        }
    });
});
app.use('/api/auth', authRoutes_1.default);
const httpServer = (0, http_1.createServer)(app);
const io = new socket_io_1.Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});
const PORT = process.env.PORT || 3001;
let messages = [];
let connectedUsers = 0;
app.post('/api/telegram/webhook', async (req, res) => {
    const { message } = req.body;
    if (!message || !message.text)
        return res.sendStatus(200);
    const chatId = message.chat.id;
    const text = message.text;
    const username = message.from.username || message.from.first_name;
    if (text === '/start') {
        await (0, bot_1.sendMessageToTelegram)(chatId, `👋 Welcome! Chat ID: \`${chatId}\``);
    }
    else if (text === '/debug') {
        await (0, bot_1.sendMessageToTelegram)(chatId, `🛠️ **Debug V28**\nDB: ${isDbConnected ? '✅' : '❌'}\nErr: ${dbError || 'None'}`);
    }
    else {
        const newMessage = {
            id: Math.random().toString(36).substr(2, 9),
            text: `[Telegram] ${username}: ${text}`,
            senderId: 'telegram-bot',
            timestamp: Date.now(),
            fromTelegram: true
        };
        messages.push(newMessage);
        io.emit('message', newMessage);
    }
    res.sendStatus(200);
});
io.on('connection', (socket) => {
    connectedUsers++;
    socket.emit('history', messages);
    socket.on('message', (data) => {
        const newMessage = {
            id: Math.random().toString(36).substr(2, 9),
            text: data.text,
            senderId: data.senderId,
            timestamp: Date.now(),
        };
        messages.push(newMessage);
        io.emit('message', newMessage);
    });
    socket.on('disconnect', () => {
        connectedUsers--;
    });
});
const distPath = path_1.default.join(__dirname, '../dist');
app.use(express_1.default.static(distPath));
app.get('*', (req, res) => {
    if (req.path.startsWith('/api/'))
        return res.status(404).json({ error: 'API route not found' });
    res.sendFile(path_1.default.join(distPath, 'index.html'));
});
// START SERVER FIRST, THEN CONNECT DB
httpServer.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`🚀 Server V28 running on port ${PORT}`);
    // Start DB connection process in background WITHOUT awaiting
    connectDB();
});
