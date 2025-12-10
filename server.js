// السطر 163: تغيير رسالة الترحيب
socket.emit('welcome', {
  message: `Welcome ${username}!`,
  users: Array.from(chatUsers.values()).map(u => u.username)
});

// السطر 171: تغيير رسالة الانضمام
socket.broadcast.emit('user-joined', {
  username,
  time: new Date().toLocaleTimeString('en-US')
});

// السطر 183: تغيير تنسيق الوقت
time: new Date().toLocaleTimeString('en-US'),

// السطر 208: تغيير رسالة المغادرة
io.emit('user-left', {
  username: user.username,
  time: new Date().toLocaleTimeString('en-US')
});

// السطر 130: تغيير رسالة التسجيل
res.json({ 
  success: true, 
  message: 'Account created successfully',
  username 
});

// السطر 157: تغيير رسالة تسجيل الدخول
res.json({
  success: true,
  token: sessionToken,
  username: user.username,
  message: 'Login successful'
});

// السطر 219: تغيير رسالة التشغيل
console.log(`🚀 Server running on port ${PORT}`);