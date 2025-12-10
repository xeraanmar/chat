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

// إعدادات Socket.IO
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

// إعدادات الجلسات
app.use(session({
  secret: process.env.SESSION_SECRET || 'chat-system-secret-key-2024',
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: 'lax'
  }
}));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// إنشاء مجلد uploads إذا لم يكن موجوداً
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// تخزين البيانات (في الإنتاج استخدم قاعدة بيانات)
const users = new Map();
const userSessions = new Map();
const messages = [];
const failedAttempts = new Map();

// إعدادات رفع الملفات
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('فقط ملفات الصور مسموحة'));
    }
  }
});

// API للتحقق من حالة الخادم
app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    users: users.size,
    messages: messages.length,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// تسجيل مستخدم جديد
app.post('/api/register', async (req, res) => {
  try {
    const { username, password, email } = req.body;
    
    if (!username || !password || !email) {
      return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
    }
    
    if (users.has(username)) {
      return res.status(400).json({ error: 'اسم المستخدم موجود مسبقاً' });
    }
    
    if (password.length < 8) {
      return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    users.set(username, {
      username,
      password: hashedPassword,
      email,
      createdAt: new Date(),
      lastLogin: null,
      isActive: true
    });
    
    res.json({ 
      success: true, 
      message: 'تم إنشاء الحساب بنجاح',
      username 
    });
    
  } catch (error) {
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
});

// تسجيل الدخول
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    const user = users.get(username);
    
    if (!user) {
      return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    }
    
    const isValid = await bcrypt.compare(password, user.password);
    
    if (!isValid) {
      return res.status(401).json({ error: 'فشل التحقق' });
    }
    
    // إنشاء توكن الدخول
    const sessionToken = crypto.randomBytes(32).toString('hex');
    userSessions.set(sessionToken, {
      username,
      loginTime: new Date(),
      lastActive: new Date()
    });
    
    // تحديث آخر دخول للمستخدم
    user.lastLogin = new Date();
    
    res.json({
      success: true,
      token: sessionToken,
      username: user.username,
      message: 'تم تسجيل الدخول بنجاح'
    });
    
  } catch (error) {
    res.status(500).json({ error: 'حدث خطأ في السيرفر' });
  }
});

// التحقق من التوكن
app.get('/api/verify', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token || !userSessions.has(token)) {
    return res.status(401).json({ valid: false });
  }
  
  res.json({ 
    valid: true, 
    username: userSessions.get(token).username 
  });
});

// رفع صورة
app.post('/api/upload', upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'لم يتم اختيار ملف' });
    }
    
    res.json({
      success: true,
      filename: req.file.filename,
      url: `/uploads/${req.file.filename}`
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
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

// Socket.IO للدردشة
const chatUsers = new Map();

io.on('connection', (socket) => {
  console.log('مستخدم جديد متصل:', socket.id);
  
  socket.on('join-chat', (userData) => {
    const { username, token } = userData;
    
    if (!userSessions.has(token)) {
      socket.emit('auth-error', 'جلسة غير صالحة');
      socket.disconnect();
      return;
    }
    
    chatUsers.set(socket.id, {
      id: socket.id,
      username,
      joinedAt: new Date(),
      isTyping: false
    });
    
    socket.emit('welcome', {
      message: `مرحباً ${username}!`,
      users: Array.from(chatUsers.values()).map(u => u.username)
    });
    
    socket.broadcast.emit('user-joined', {
      username,
      time: new Date().toLocaleTimeString('ar-SA')
    });
    
    socket.emit('previous-messages', messages.slice(-50));
  });
  
  socket.on('send-message', (data) => {
    const user = chatUsers.get(socket.id);
    if (!user) return;
    
    const message = {
      id: Date.now(),
      username: user.username,
      message: data.text,
      time: new Date().toLocaleTimeString('ar-SA'),
      timestamp: new Date()
    };
    
    messages.push(message);
    if (messages.length > 1000) messages.shift();
    
    io.emit('new-message', message);
  });
  
  socket.on('typing', (isTyping) => {
    const user = chatUsers.get(socket.id);
    if (user) {
      user.isTyping = isTyping;
      socket.broadcast.emit('user-typing', {
        username: user.username,
        isTyping
      });
    }
  });
  
  socket.on('disconnect', () => {
    const user = chatUsers.get(socket.id);
    if (user) {
      chatUsers.delete(socket.id);
      io.emit('user-left', {
        username: user.username,
        time: new Date().toLocaleTimeString('ar-SA')
      });
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 الخادم يعمل على المنفذ ${PORT}`);
});