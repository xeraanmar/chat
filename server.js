const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// تقديم الملفات الثابتة
app.use(express.static(path.join(__dirname, '/')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/chat', (req, res) => {
    res.sendFile(path.join(__dirname, 'chat.html'));
});

// تخزين المستخدمين المتصلين
const users = {};

// التعامل مع اتصالات WebSocket
io.on('connection', (socket) => {
    socket.on('new-user', (username) => {
        users[socket.id] = username;
        socket.broadcast.emit('welcome-message', `${username} انضم إلى الدردشة`);
        io.emit('users-count', Object.keys(users).length);
        
        // ترحيب بالمستخدم الجديد
        socket.emit('welcome-message', `مرحباً بك ${username} في الدردشة العامة!`);
    });

    socket.on('send-chat-message', (message) => {
        socket.broadcast.emit('chat-message', {
            username: users[socket.id],
            message: message,
            time: new Date()
        });
    });

    socket.on('disconnect', () => {
        const username = users[socket.id];
        if (username) {
            socket.broadcast.emit('welcome-message', `${username} غادر الدردشة`);
            delete users[socket.id];
            io.emit('users-count', Object.keys(users).length);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`الخادم يعمل على المنفذ ${PORT}`);
});