const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// إعدادات مهمة للاستضافة
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// تخزين المستخدمين المتصلين
const users = new Map();

// الصفحة الرئيسية
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// صفحة الدردشة
app.get('/chat', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

// API للتحقق من حالة الخادم
app.get('/status', (req, res) => {
  res.json({ 
    status: 'online', 
    users: users.size,
    uptime: process.uptime()
  });
});

// Socket.IO events
io.on('connection', (socket) => {
  console.log('مستخدم جديد متصل:', socket.id);
  
  socket.on('join', (username) => {
    // التحقق من اسم المستخدم
    if (!username || username.trim().length === 0) {
      socket.emit('error', 'الرجاء إدخال اسم مستخدم صالح');
      return;
    }
    
    const trimmedUsername = username.trim();
    
    // التحقق من عدم وجود الاسم مسبقاً
    for (let [id, user] of users) {
      if (user.username === trimmedUsername) {
        socket.emit('error', 'اسم المستخدم موجود بالفعل');
        return;
      }
    }
    
    // حفظ المستخدم
    users.set(socket.id, {
      id: socket.id,
      username: trimmedUsername,
      joinedAt: new Date()
    });
    
    // إعلام المستخدم الجديد
    socket.emit('welcome', {
      message: `مرحباً ${trimmedUsername}! تم دخولك للدردشة بنجاح.`,
      usersCount: users.size
    });
    
    // إعلام بقية المستخدمين
    socket.broadcast.emit('user-joined', {
      username: trimmedUsername,
      time: new Date().toLocaleTimeString('ar-SA'),
      usersCount: users.size
    });
    
    // إرسال قائمة المستخدمين النشطين
    const activeUsers = Array.from(users.values()).map(user => user.username);
    io.emit('active-users', activeUsers);
    
    console.log(`${trimmedUsername} انضم للدردشة. عدد المستخدمين: ${users.size}`);
  });
  
  socket.on('send-message', (data) => {
    const user = users.get(socket.id);
    if (!user) {
      socket.emit('error', 'يجب تسجيل الدخول أولاً');
      return;
    }
    
    if (!data.message || data.message.trim().length === 0) {
      return;
    }
    
    const messageData = {
      id: Date.now(),
      username: user.username,
      message: data.message.trim(),
      time: new Date().toLocaleTimeString('ar-SA', { 
        hour: '2-digit', 
        minute: '2-digit' 
      }),
      timestamp: new Date()
    };
    
    // إرسال الرسالة للجميع
    io.emit('new-message', messageData);
    console.log(`رسالة جديدة من ${user.username}: ${data.message}`);
  });
  
  socket.on('typing', (isTyping) => {
    const user = users.get(socket.id);
    if (user) {
      socket.broadcast.emit('user-typing', {
        username: user.username,
        isTyping: isTyping
      });
    }
  });
  
  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    if (user) {
      users.delete(socket.id);
      
      // إعلام بقية المستخدمين
      socket.broadcast.emit('user-left', {
        username: user.username,
        time: new Date().toLocaleTimeString('ar-SA'),
        usersCount: users.size
      });
      
      // تحديث قائمة المستخدمين
      const activeUsers = Array.from(users.values()).map(u => u.username);
      io.emit('active-users', activeUsers);
      
      console.log(`${user.username} غادر الدردشة. عدد المستخدمين: ${users.size}`);
    }
  });
});

// التعامل مع الأخطاء
io.on('error', (error) => {
  console.error('خطأ في Socket.IO:', error);
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log(`✅ الخادم يعمل على: http://${HOST}:${PORT}`);
  console.log(`📡 جاهز للاستضافة على Railway`);
});