const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');

const app = express();
const server = http.createServer(app);

// إعدادات Socket.IO مع تحسينات للأداء
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000
});

// CORS للسماح بجميع المصادر (يمكن تعديله لاحقاً)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-access-token');
  res.header('Access-Control-Expose-Headers', 'Content-Length, X-Request-ID');
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('X-Frame-Options', 'DENY');
  res.header('X-XSS-Protection', '1; mode=block');
  res.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

// إعدادات الجلسات المتقدمة
app.use(session({
  secret: process.env.SESSION_SECRET || crypto.randomBytes(64).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000, // أسبوع
    sameSite: 'lax',
    httpOnly: true
  },
  name: 'chat.sid'
}));

// Middleware مع تحسينات
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1d',
  etag: true,
  lastModified: true
}));

// Cache control للصور والملفات الثابتة
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  maxAge: '7d'
}));

// إنشاء المجلدات إذا لم تكن موجودة
const folders = ['uploads', 'public', 'public/assets'];
folders.forEach(folder => {
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
  }
});

// تخزين البيانات (مؤقت - استخدم قاعدة بيانات في الإنتاج)
const users = new Map();
const userSessions = new Map();
const messages = [];
const onlineUsers = new Map();

// إعدادات متقدمة لرفع الملفات
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  limits: { 
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 1
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp|svg/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (JPEG, PNG, GIF, WebP, SVG) are allowed'));
    }
  }
});

// API Status مع معلومات تفصيلية
app.get('/api/status', (req, res) => {
  const memoryUsage = process.memoryUsage();
  res.json({
    status: 'online',
    serverTime: new Date().toISOString(),
    uptime: process.uptime(),
    memory: {
      rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`
    },
    users: {
      total: users.size,
      online: onlineUsers.size,
      activeSessions: userSessions.size
    },
    messages: {
      total: messages.length,
      last24h: messages.filter(m => Date.now() - new Date(m.timestamp).getTime() < 24 * 60 * 60 * 1000).length
    },
    environment: process.env.NODE_ENV || 'development'
  });
});

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// تسجيل مستخدم جديد مع تحسينات الأمان
app.post('/api/register', async (req, res) => {
  try {
    const { username, password, email } = req.body;
    
    // تحقق شامل
    if (!username || !password || !email) {
      return res.status(400).json({ 
        success: false, 
        error: 'All fields are required' 
      });
    }
    
    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ 
        success: false, 
        error: 'Username must be between 3 and 20 characters' 
      });
    }
    
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Username can only contain letters, numbers, and underscores' 
      });
    }
    
    if (password.length < 8) {
      return res.status(400).json({ 
        success: false, 
        error: 'Password must be at least 8 characters long' 
      });
    }
    
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid email format' 
      });
    }
    
    if (users.has(username)) {
      return res.status(409).json({ 
        success: false, 
        error: 'Username already taken' 
      });
    }
    
    // تشفير كلمة المرور
    const hashedPassword = await bcrypt.hash(password, 12);
    
    // حفظ المستخدم
    users.set(username, {
      username,
      password: hashedPassword,
      email,
      createdAt: new Date(),
      lastLogin: null,
      isActive: true,
      role: 'user',
      avatarColor: `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`
    });
    
    // إنشاء توكن تلقائي وتسجيل الدخول
    const sessionToken = crypto.randomBytes(48).toString('hex');
    userSessions.set(sessionToken, {
      username,
      loginTime: new Date(),
      lastActive: new Date(),
      ip: req.ip
    });
    
    res.json({ 
      success: true, 
      message: 'Account created successfully!',
      username,
      token: sessionToken
    });
    
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'An unexpected error occurred. Please try again.' 
    });
  }
});

// تسجيل الدخول مع تحسينات
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Username and password are required' 
      });
    }
    
    const user = users.get(username);
    
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid credentials' 
      });
    }
    
    if (!user.isActive) {
      return res.status(403).json({ 
        success: false, 
        error: 'Account is deactivated' 
      });
    }
    
    const isValid = await bcrypt.compare(password, user.password);
    
    if (!isValid) {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid credentials' 
      });
    }
    
    // تحديث آخر دخول
    user.lastLogin = new Date();
    
    // إنشاء توكن جديد
    const sessionToken = crypto.randomBytes(48).toString('hex');
    userSessions.set(sessionToken, {
      username,
      loginTime: new Date(),
      lastActive: new Date(),
      ip: req.ip
    });
    
    res.json({
      success: true,
      message: 'Login successful!',
      username: user.username,
      token: sessionToken,
      user: {
        username: user.username,
        email: user.email,
        createdAt: user.createdAt,
        avatarColor: user.avatarColor
      }
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'An unexpected error occurred' 
    });
  }
});

// التحقق من التوكن
app.get('/api/verify', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '') || 
                req.headers['x-access-token'] || 
                req.query.token;
  
  if (!token || !userSessions.has(token)) {
    return res.status(401).json({ 
      valid: false, 
      error: 'Invalid or expired session' 
    });
  }
  
  // تحديث وقت النشاط
  const session = userSessions.get(token);
  session.lastActive = new Date();
  
  res.json({ 
    valid: true, 
    username: session.username,
    session: {
      loginTime: session.loginTime,
      lastActive: session.lastActive
    }
  });
});

// رفع ملفات
app.post('/api/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        error: 'No file uploaded' 
      });
    }
    
    const fileUrl = `/uploads/${req.file.filename}`;
    
    res.json({
      success: true,
      message: 'File uploaded successfully',
      file: {
        filename: req.file.filename,
        originalname: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
        url: fileUrl
      }
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Route للحصول على مستخدمين متصلين
app.get('/api/online-users', (req, res) => {
  const usersArray = Array.from(onlineUsers.values()).map(user => ({
    username: user.username,
    joinedAt: user.joinedAt,
    avatarColor: user.avatarColor,
    isTyping: user.isTyping || false
  }));
  
  res.json({
    success: true,
    count: usersArray.length,
    users: usersArray
  });
});

// Route للحصول على آخر الرسائل
app.get('/api/messages', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const recentMessages = messages.slice(-limit);
  
  res.json({
    success: true,
    count: recentMessages.length,
    messages: recentMessages
  });
});

// الصفحات الرئيسية
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/chat', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

// 404 handler
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    success: false, 
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message 
  });
});

// Socket.IO - Real-time Chat
io.on('connection', (socket) => {
  console.log(`⚡ New connection: ${socket.id}`);
  
  socket.on('join-chat', async (userData) => {
    try {
      const { username, token } = userData;
      
      if (!token || !userSessions.has(token)) {
        socket.emit('auth-error', { message: 'Session expired. Please login again.' });
        socket.disconnect();
        return;
      }
      
      const user = users.get(username);
      if (!user) {
        socket.emit('auth-error', { message: 'User not found' });
        socket.disconnect();
        return;
      }
      
      // تحديث جلسة المستخدم
      userSessions.get(token).lastActive = new Date();
      
      // إضافة المستخدم للمستخدمين المتصلين
      onlineUsers.set(socket.id, {
        id: socket.id,
        username,
        joinedAt: new Date(),
        isTyping: false,
        avatarColor: user.avatarColor || '#667eea'
      });
      
      // ترحيب
      socket.emit('welcome', {
        success: true,
        message: `Welcome to Smart Chat, ${username}! 👋`,
        user: {
          username,
          avatarColor: user.avatarColor
        },
        serverInfo: {
          onlineCount: onlineUsers.size,
          totalMessages: messages.length,
          serverTime: new Date().toISOString()
        }
      });
      
      // إعلام الآخرين
      socket.broadcast.emit('user-joined', {
        username,
        time: new Date().toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit' 
        }),
        avatarColor: user.avatarColor
      });
      
      // إرسال آخر 50 رسالة
      socket.emit('previous-messages', messages.slice(-50));
      
      // تحديث عدد المستخدمين للجميع
      io.emit('users-update', {
        count: onlineUsers.size,
        users: Array.from(onlineUsers.values()).map(u => ({
          username: u.username,
          avatarColor: u.avatarColor,
          isTyping: u.isTyping
        }))
      });
      
    } catch (error) {
      console.error('Join error:', error);
      socket.emit('error', { message: 'Failed to join chat' });
    }
  });
  
  socket.on('send-message', (data) => {
    try {
      const user = onlineUsers.get(socket.id);
      if (!user || !data.text || data.text.trim() === '') return;
      
      const message = {
        id: Date.now() + Math.random().toString(36).substr(2, 9),
        username: user.username,
        message: data.text.trim(),
        time: new Date().toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit',
          second: '2-digit'
        }),
        timestamp: new Date(),
        avatarColor: user.avatarColor,
        type: 'text'
      };
      
      // حفظ الرسالة
      messages.push(message);
      if (messages.length > 1000) messages.shift();
      
      // بث الرسالة للجميع
      io.emit('new-message', message);
      
      // إلغاء وضع الكتابة
      user.isTyping = false;
      socket.broadcast.emit('user-typing', {
        username: user.username,
        isTyping: false
      });
      
    } catch (error) {
      console.error('Message error:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });
  
  socket.on('typing', (isTyping) => {
    const user = onlineUsers.get(socket.id);
    if (user) {
      user.isTyping = isTyping;
      socket.broadcast.emit('user-typing', {
        username: user.username,
        isTyping,
        avatarColor: user.avatarColor
      });
    }
  });
  
  socket.on('disconnect', () => {
    const user = onlineUsers.get(socket.id);
    if (user) {
      onlineUsers.delete(socket.id);
      
      // إعلام الآخرين بالمغادرة
      io.emit('user-left', {
        username: user.username,
        time: new Date().toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit' 
        })
      });
      
      // تحديث عدد المستخدمين
      io.emit('users-update', {
        count: onlineUsers.size,
        users: Array.from(onlineUsers.values()).map(u => ({
          username: u.username,
          avatarColor: u.avatarColor,
          isTyping: u.isTyping
        }))
      });
      
      console.log(`❌ User disconnected: ${user.username} (${socket.id})`);
    }
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📁 Static files served from: ${path.join(__dirname, 'public')}`);
  console.log(`⚡ Socket.IO ready for connections`);
});