// نتحقق من الصفحة الحالية
const currentPage = window.location.pathname.split('/').pop();

if (currentPage === 'index.html' || currentPage === '') {
    // صفحة الدخول
    document.getElementById('join-btn').addEventListener('click', joinChat);
    document.getElementById('username').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') joinChat();
    });

    function joinChat() {
        const usernameInput = document.getElementById('username');
        const username = usernameInput.value.trim();
        const errorDiv = document.getElementById('error-message');

        if (username === '') {
            errorDiv.textContent = 'الرجاء إدخال اسم المستخدم';
            return;
        }

        // حفظ اسم المستخدم في localStorage
        localStorage.setItem('username', username);
        // الانتقال إلى صفحة الدردشة
        window.location.href = 'chat.html';
    }
} else if (currentPage === 'chat.html') {
    // صفحة الدردشة
    // التأكد من وجود اسم مستخدم
    let username = localStorage.getItem('username');
    if (!username) {
        window.location.href = 'index.html';
        return;
    }

    // الاتصال بالسيرفر
    const socket = io();
    
    // إرسال اسم المستخدم للسيرفر
    socket.emit('new-user', username);

    // عناصر واجهة المستخدم
    const chatMessages = document.getElementById('chat-messages');
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-btn');
    const usersCount = document.getElementById('users-count');

    // إرسال رسالة
    function sendMessage() {
        const message = messageInput.value.trim();
        if (message === '') return;

        socket.emit('send-chat-message', message);
        addMessage(username, message, new Date(), true);
        messageInput.value = '';
    }

    // إضافة رسالة إلى الواجهة
    function addMessage(sender, text, time, isSent = false) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message');
        messageDiv.classList.add(isSent ? 'sent' : 'received');

        const usernameSpan = document.createElement('div');
        usernameSpan.classList.add('message-username');
        usernameSpan.textContent = sender;

        const textSpan = document.createElement('div');
        textSpan.classList.add('message-text');
        textSpan.textContent = text;

        const timeSpan = document.createElement('div');
        timeSpan.classList.add('message-time');
        timeSpan.textContent = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        messageDiv.appendChild(usernameSpan);
        messageDiv.appendChild(textSpan);
        messageDiv.appendChild(timeSpan);

        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // استقبال رسائل من السيرفر
    socket.on('chat-message', (data) => {
        addMessage(data.username, data.message, new Date(data.time), false);
    });

    // تحديث عدد المستخدمين المتصلين
    socket.on('users-count', (count) => {
        usersCount.textContent = count;
    });

    // استقبال رسائل ترحيبية
    socket.on('welcome-message', (message) => {
        const systemMessage = {
            username: 'النظام',
            message: message,
            time: new Date()
        };
        addMessage(systemMessage.username, systemMessage.message, systemMessage.time, false);
    });

    // أحداث الإرسال
    sendButton.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });
}