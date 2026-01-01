import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import cors from 'cors';
import { sendMessageToTelegram } from './bot';
import authRoutes from './routes/authRoutes';
import userRoutes from './routes/userRoutes';
import chatRoutes from './routes/chatRoutes';
import { PrismaClient } from '@prisma/client';
import { exec } from 'child_process';

const app = express();
app.use(cors());
app.use(express.json());

// --- DYNAMIC CONNECTION STORE ---
let manualDatabaseUrl: string | null = null;

const getPotentialUrls = () => {
  const urls = [];
  
  // 0. Manual Override (Highest Priority)
  if (manualDatabaseUrl) {
    urls.push({ type: 'MANUAL_OVERRIDE', url: manualDatabaseUrl });
  }

  // Helper to add SSL variants
  const addVariants = (baseUrl: string, typePrefix: string) => {
    urls.push({ type: `${typePrefix}_RAW`, url: baseUrl });
    const separator = baseUrl.includes('?') ? '&' : '?';
    urls.push({ type: `${typePrefix}_SSL_NO_VERIFY`, url: `${baseUrl}${separator}sslmode=no-verify` });
    urls.push({ type: `${typePrefix}_SSL_PREFER`, url: `${baseUrl}${separator}sslmode=prefer` });
  };

  if (process.env.DATABASE_PRIVATE_URL) addVariants(process.env.DATABASE_PRIVATE_URL, 'PRIVATE_ENV');

  const { PGUSER, PGPASSWORD, PGHOST, PGPORT, PGDATABASE } = process.env;
  if (PGUSER && PGHOST && PGDATABASE) {
    const encodedPassword = encodeURIComponent(PGPASSWORD || '');
    const port = PGPORT || '5432';
    const constructedUrl = `postgresql://${PGUSER}:${encodedPassword}@${PGHOST}:${port}/${PGDATABASE}`;
    addVariants(constructedUrl, 'CONSTRUCTED_PRIVATE');
  }

  if (process.env.DATABASE_URL) addVariants(process.env.DATABASE_URL, 'PUBLIC_ENV');

  return urls;
};

let currentPrisma = new PrismaClient({
  datasources: { db: { url: 'postgresql://dummy:dummy@localhost:5432/dummy' } },
  log: ['error'],
});

let isDbConnected = false;
let dbError: string | null = 'Initializing...';
let activeConnectionStrategy = 'NONE';

async function tryConnect() {
  const strategies = getPotentialUrls();
  console.log(`🔌 Found ${strategies.length} connection strategies. Trying them one by one...`);

  for (const strategy of strategies) {
    console.log(`🔄 Trying strategy: ${strategy.type}...`);
    try {
      const candidatePrisma = new PrismaClient({
        datasources: { db: { url: strategy.url } },
        log: ['error'],
      });

      await Promise.race([
        candidatePrisma.$connect(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), 5000))
      ]);

      console.log(`✅ Connected successfully using ${strategy.type}!`);
      await currentPrisma.$disconnect();
      currentPrisma = candidatePrisma;
      isDbConnected = true;
      dbError = null;
      activeConnectionStrategy = strategy.type;
      
      runMigrations(strategy.url);
      return;

    } catch (error: any) {
      console.warn(`⚠️ Strategy ${strategy.type} failed: ${error.message}`);
      dbError = `${strategy.type} failed: ${error.message}`;
    }
  }
  console.error('❌ All connection strategies failed.');
  dbError = 'All connection attempts failed. Check /api/debug/db for details.';
}

async function runMigrations(url: string) {
  console.log('🔄 [Background] Starting migration...');
  return new Promise((resolve) => {
    const env = { ...process.env, DATABASE_URL: url };
    exec('npx prisma db push --accept-data-loss', { env }, (error, stdout, stderr) => {
      if (error) {
        console.error(`❌ Migration failed: ${error.message}`);
        return resolve(false);
      }
      console.log(`✅ Migration successful: ${stdout}`);
      resolve(true);
    });
  });
}

// --- API ENDPOINTS ---

// Manual Configuration Endpoint
app.post('/api/debug/config', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });
  
  console.log('🛠️ Manual DB URL received from user');
  manualDatabaseUrl = url;
  isDbConnected = false;
  dbError = 'Reconnecting with new URL...';
  
  tryConnect().then(() => {
    res.json({ 
      success: true, 
      message: isDbConnected ? 'Connected successfully!' : 'Connection failed. Check URL.',
      connected: isDbConnected,
      error: dbError
    });
  });
});

app.get('/api/debug/fix', async (req, res) => {
  console.log('🛠️ Manual fix requested by user...');
  dbError = 'Retrying connection...';
  isDbConnected = false;
  tryConnect().then(() => {
    res.json({ 
      success: true, 
      message: isDbConnected ? 'Fixed! Refresh page.' : 'Retry finished but still failed.',
      current_error: dbError
    });
  });
});

app.get('/api/debug/db', async (req, res) => {
  res.json({
    status: 'Diagnostics V35 (Manual Config)',
    db: {
      connected: isDbConnected,
      strategy: activeConnectionStrategy,
      error: dbError,
      manual_url_set: !!manualDatabaseUrl
    },
    strategies_found: getPotentialUrls().map(s => s.type)
  });
});

app.get('/api/status', (req, res) => {
  res.json({ 
    isDbConnected, 
    dbError 
  });
});

// Middleware to inject prisma
const injectPrisma = (req: any, res: any, next: any) => {
  (req as any).prisma = currentPrisma;
  next();
};

app.use('/api/auth', injectPrisma, authRoutes);
app.use('/api/users', injectPrisma, userRoutes);
app.use('/api/chats', injectPrisma, chatRoutes);

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const PORT = process.env.PORT || 3001;

// ... (Socket.io and Webhook code remains standard) ...
interface Message {
  id: string;
  text: string;
  senderId: string;
  timestamp: number;
  fromTelegram?: boolean;
}

let messages: Message[] = [];
let connectedUsers = 0;

app.post('/api/telegram/webhook', async (req, res) => {
  const { message } = req.body;
  if (!message || !message.text) return res.sendStatus(200);
  
  const chatId = message.chat.id;
  const text = message.text;
  const username = message.from.username || message.from.first_name;

  if (text === '/start') {
    await sendMessageToTelegram(chatId, `👋 Welcome! Chat ID: \`${chatId}\``);
  } else if (text === '/debug') {
    await sendMessageToTelegram(chatId, `🛠️ **Debug V35**\nDB: ${isDbConnected ? '✅' : '❌'}\nErr: ${dbError || 'None'}`);
  } else {
    const newMessage: Message = {
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
    const newMessage: Message = {
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

const distPath = path.join(__dirname, '../dist');
app.use(express.static(distPath));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'API route not found' });
  res.sendFile(path.join(distPath, 'index.html'));
});

httpServer.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`🚀 Server V35 running on port ${PORT}`);
  tryConnect();
});
