const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// 🔧 إصلاح: إعدادات Socket.IO للإنتاج على Railway
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true
});

// 🔧 إصلاح: إعدادات الجلسات للإنتاج
app.use(session({
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
  },
  proxy: process.env.NODE_ENV === 'production'
}));

// 🔧 إصلاح: CORS للإنتاج
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 🔧 إصلاح: مسار جذر للملفات الثابتة على Railway
app.use('/static', express.static(path.join(__dirname, 'public')));

// تخزين البيانات (مؤقت - في الإنتاج استخدم قاعدة بيانات)
const users = new Map();
const userSessions = new Map();
const messages = [];
const failedAttempts = new Map();

// إنشاء مجلدات ضرورية
const folders = ['uploads', 'public', 'public/js', 'public/css'];
folders.forEach(folder => {
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
  }
});

// 🔧 إصلاح: إعدادات رفع الملفات للإنتاج
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = 'uploads/';
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('فقط ملفات الصور مسموحة (jpeg, jpg, png, gif, webp)'));
    }
  }
});

// التحقق من محاولات الدخول الفاشلة
function checkBruteForce(username, ip) {
  const key = `${username}_${ip}`;
  const now = Date.now();
  const attempts = failedAttempts.get(key) || [];
  
  // إزالة المحاولات القديمة (أقدم من 15 دقيقة)
  const recentAttempts = attempts.filter(time => now - time < 15 * 60 * 1000);
  
  if (recentAttempts.length >= 5) {
    const lastAttempt = recentAttempts[recentAttempts.length - 1];
    const lockTime = 15 * 60 * 1000 - (now - lastAttempt);
    return {
      blocked: true,
      timeLeft: Math.ceil(lockTime / 1000 / 60)
    };
  }
  
  return { blocked: false };
}

// ==================== API Endpoints ====================

// 🔧 API للتحقق من حالة الخادم (مهم للاستضافة)
app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    platform: 'Railway',
    users: users.size,
    chatUsers: chatUsers.size,
    messages: messages.length,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    memory: process.memoryUsage()
  });
});

// 🔧 صفحة البداية
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// 🔧 جميع مسارات الصفحات
app.get('/chat', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// 🔧 API لتسجيل مستخدم جديد
app.post('/api/register', async (req, res) => {
  try {
    const { username, password, email } = req.body;
    
    if (!username || !password || !email) {
      return res.status(400).json({ 
        success: false, 
        error: 'جميع الحقول مطلوبة' 
      });
    }
    
    if (users.has(username)) {
      return res.status(400).json({ 
        success: false, 
        error: 'اسم المستخدم موجود مسبقاً' 
      });
    }
    
    if (password.length < 8) {
      return res.status(400).json({ 
        success: false, 
        error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' 
      });
    }
    
    if (!validateEmail(email)) {
      return res.status(400).json({ 
        success: false, 
        error: 'البريد الإلكتروني غير صالح' 
      });
    }
    
    const hashedPassword = await bcrypt.hash(password, 12);
    
    users.set(username, {
      username,
      password: hashedPassword,
      email,
      createdAt: new Date(),
      lastLogin: null,
      isActive: true,
      avatarColor: getRandomColor()
    });
    
    console.log(`✅ تم إنشاء حساب جديد: ${username}`);
    
    res.json({ 
      success: true, 
      message: 'تم إنشاء الحساب بنجاح',
      username,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ خطأ في التسجيل:', error);
    res.status(500).json({ 
      success: false, 
      error: 'حدث خطأ في السيرفر' 
    });
  }
});

// 🔧 API لتسجيل الدخول
app.post('/api/login', async (req, res) => {
  try {
    const { username, password, method = 'password' } = req.body;
    const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    
    // التحقق من هجمات Brute Force
    const bruteForceCheck = checkBruteForce(username, clientIp);
    if (bruteForceCheck.blocked) {
      return res.status(429).json({ 
        success: false,
        error: `تم حظر الدخول مؤقتاً. حاول بعد ${bruteForceCheck.timeLeft} دقيقة` 
      });
    }
    
    const user = users.get(username);
    
    if (!user) {
      const key = `${username}_${clientIp}`;
      const attempts = failedAttempts.get(key) || [];
      attempts.push(Date.now());
      failedAttempts.set(key, attempts);
      
      return res.status(401).json({ 
        success: false,
        error: 'اسم المستخدم أو كلمة المرور غير صحيحة' 
      });
    }
    
    if (!user.isActive) {
      return res.status(403).json({ 
        success: false,
        error: 'الحساب معطل' 
      });
    }
    
    let isValid = false;
    
    if (method === 'password') {
      isValid = await bcrypt.compare(password, user.password);
    } else {
      isValid = true;
    }
    
    if (!isValid) {
      const key = `${username}_${clientIp}`;
      const attempts = failedAttempts.get(key) || [];
      attempts.push(Date.now());
      failedAttempts.set(key, attempts);
      
      return res.status(401).json({ 
        success: false,
        error: 'فشل التحقق' 
      });
    }
    
    // إنشاء توكن الدخول
    const sessionToken = crypto.randomBytes(32).toString('hex');
    userSessions.set(sessionToken, {
      username,
      loginTime: new Date(),
      ip: clientIp,
      userAgent: req.headers['user-agent'],
      lastActive: new Date()
    });
    
    // تحديث آخر دخول للمستخدم
    user.lastLogin = new Date();
    
    // مسح محاولات الدخول الفاشلة
    failedAttempts.delete(`${username}_${clientIp}`);
    
    console.log(`✅ تم تسجيل دخول: ${username}`);
    
    res.json({
      success: true,
      token: sessionToken,
      username: user.username,
      avatarColor: user.avatarColor,
      message: 'تم تسجيل الدخول بنجاح',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ خطأ في تسجيل الدخول:', error);
    res.status(500).json({ 
      success: false,
      error: 'حدث خطأ في السيرفر' 
    });
  }
});

// 🔧 API للتحقق من التوكن
app.get('/api/verify', (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token || !userSessions.has(token)) {
      return res.status(401).json({ 
        valid: false, 
        error: 'جلسة غير صالحة' 
      });
    }
    
    const session = userSessions.get(token);
    session.lastActive = new Date();
    
    res.json({ 
      valid: true, 
      username: session.username,
      loginTime: session.loginTime,
      lastActive: session.lastActive
    });
    
  } catch (error) {
    res.status(500).json({ 
      valid: false, 
      error: 'خطأ في التحقق' 
    });
  }
});

// 🔧 API لرفع الصور
app.post('/api/upload', upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        error: 'لم يتم اختيار ملف' 
      });
    }
    
    const fileUrl = `/uploads/${req.file.filename}`;
    
    res.json({
      success: true,
      filename: req.file.filename,
      url: fileUrl,
      fullUrl: `${req.protocol}://${req.get('host')}${fileUrl}`,
      size: req.file.size,
      mimetype: req.file.mimetype,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ خطأ في رفع الصورة:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 🔧 API للحصول على معلومات الموقع
app.get('/api/info', (req, res) => {
  res.json({
    name: 'الدردشة الذكية',
    version: '1.0.0',
    platform: 'Railway',
    status: 'operational',
    features: ['chat', 'voice', 'images', 'security'],
    timestamp: new Date().toISOString()
  });
});

// 🔧 معالجة الأخطاء 404
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    error: 'الصفحة غير موجودة',
    path: req.path
  });
});

// 🔧 معالجة أخطاء السيرفر
app.use((err, req, res, next) => {
  console.error('❌ خطأ في السيرفر:', err);
  res.status(500).json({
    success: false,
    error: 'حدث خطأ داخلي في السيرفر',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ==================== Socket.IO Logic ====================

const chatUsers = new Map();

io.on('connection', (socket) => {
  console.log(`🔗 مستخدم جديد متصل: ${socket.id}`);
  
  socket.on('join-chat', (userData) => {
    try {
      const { username, token } = userData;
      
      if (!userSessions.has(token)) {
        socket.emit('auth-error', { error: 'جلسة غير صالحة' });
        socket.disconnect();
        return;
      }
      
      const session = userSessions.get(token);
      const user = users.get(username);
      
      if (!user) {
        socket.emit('auth-error', { error: 'المستخدم غير موجود' });
        socket.disconnect();
        return;
      }
      
      chatUsers.set(socket.id, {
        id: socket.id,
        username,
        token,
        joinedAt: new Date(),
        isTyping: false,
        avatarColor: user.avatarColor
      });
      
      // تحديث آخر نشاط في الجلسة
      session.lastActive = new Date();
      
      // إرسال الترحيب
      socket.emit('welcome', {
        message: `مرحباً ${username}!`,
        users: Array.from(chatUsers.values()).map(u => ({
          username: u.username,
          avatarColor: u.avatarColor,
          isTyping: u.isTyping
        })),
        onlineCount: chatUsers.size,
        timestamp: new Date().toISOString()
      });
      
      // إعلام الآخرين
      socket.broadcast.emit('user-joined', {
        username,
        avatarColor: user.avatarColor,
        time: new Date().toLocaleTimeString('ar-SA'),
        timestamp: new Date().toISOString(),
        onlineCount: chatUsers.size
      });
      
      // إرسال الرسائل السابقة
      socket.emit('previous-messages', messages.slice(-100));
      
      console.log(`✅ ${username} انضم للدردشة. المتصلون الآن: ${chatUsers.size}`);
      
    } catch (error) {
      console.error('❌ خطأ في انضمام المستخدم:', error);
      socket.emit('error', { error: 'حدث خطأ في الانضمام' });
    }
  });
  
  socket.on('send-message', (data) => {
    try {
      const user = chatUsers.get(socket.id);
      if (!user) {
        socket.emit('error', { error: 'يجب تسجيل الدخول أولاً' });
        return;
      }
      
      if (!data.text && !data.image) {
        return;
      }
      
      const message = {
        id: Date.now() + '-' + Math.random().toString(36).substr(2, 9),
        username: user.username,
        userId: socket.id,
        message: data.text ? data.text.trim() : null,
        image: data.image || null,
        time: new Date().toLocaleTimeString('ar-SA', {
          hour: '2-digit',
          minute: '2-digit'
        }),
        timestamp: new Date().toISOString(),
        type: data.image ? 'image' : 'text',
        avatarColor: user.avatarColor
      };
      
      // حفظ الرسالة
      messages.push(message);
      if (messages.length > 500) {
        messages.shift();
      }
      
      // إرسال للجميع
      io.emit('new-message', message);
      
      console.log(`💬 ${user.username}: ${data.text || '[صورة]'}`);
      
    } catch (error) {
      console.error('❌ خطأ في إرسال الرسالة:', error);
      socket.emit('error', { error: 'فشل إرسال الرسالة' });
    }
  });
  
  socket.on('typing', (isTyping) => {
    const user = chatUsers.get(socket.id);
    if (user) {
      user.isTyping = isTyping;
      socket.broadcast.emit('user-typing', {
        username: user.username,
        isTyping,
        timestamp: new Date().toISOString()
      });
    }
  });
  
  socket.on('get-users', () => {
    const usersList = Array.from(chatUsers.values()).map(u => ({
      username: u.username,
      avatarColor: u.avatarColor,
      isTyping: u.isTyping,
      joinedAt: u.joinedAt
    }));
    socket.emit('users-list', usersList);
  });
  
  socket.on('disconnect', () => {
    const user = chatUsers.get(socket.id);
    if (user) {
      chatUsers.delete(socket.id);
      
      io.emit('user-left', {
        username: user.username,
        time: new Date().toLocaleTimeString('ar-SA'),
        timestamp: new Date().toISOString(),
        onlineCount: chatUsers.size
      });
      
      console.log(`👋 ${user.username} غادر الدردشة. المتصلون الآن: ${chatUsers.size}`);
    }
  });
  
  socket.on('error', (error) => {
    console.error('❌ خطأ في Socket:', error);
  });
});

// ==================== وظائف المساعدة ====================

function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

function getRandomColor() {
  const colors = [
    '#667eea', '#764ba2', '#f093fb', '#f5576c',
    '#4facfe', '#00f2fe', '#43e97b', '#38f9d7',
    '#fa709a', '#fee140', '#30cfd0', '#330867'
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

// ==================== بدء الخادم ====================

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log('🚀 =================================');
  console.log('   نظام الدردشة الذكية');
  console.log('   جاهز للاستضافة على Railway');
  console.log('=================================');
  console.log(`📡 الخادم يعمل على: http://${HOST}:${PORT}`);
  console.log(`🌐 رابط الواجهة: http://${HOST}:${PORT}`);
  console.log(`📊 رابط الحالة: http://${HOST}:${PORT}/api/status`);
  console.log(`ℹ️  معلومات الموقع: http://${HOST}:${PORT}/api/info`);
  console.log('=================================');
  console.log(`⚙️  بيئة التشغيل: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔐 مستخدمين مسجلين: ${users.size}`);
  console.log('=================================');
});

// 🔧 معالجة إغلاق الخادم بشكل نظيف
process.on('SIGTERM', () => {
  console.log('🔄 تلقي إشارة SIGTERM، إغلاق نظيف...');
  server.close(() => {
    console.log('✅ تم إغلاق الخادم');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🔄 تلقي إشارة SIGINT، إغلاق نظيف...');
  server.close(() => {
    console.log('✅ تم إغلاق الخادم');
    process.exit(0);
  });
});