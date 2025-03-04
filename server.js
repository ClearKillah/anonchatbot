require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Telegraf } = require('telegraf');
const cors = require('cors');
const path = require('path');
const admin = require('firebase-admin');
const { nanoid } = require('nanoid');

// Инициализация Firebase Admin - исправляем формат приватного ключа
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
  }),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});

const db = admin.database();

// Настройка express с корректной обработкой CORS
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling'] // Добавляем поддержку различных транспортов
});

// Middleware
app.use(cors({
  origin: '*',
  credentials: true
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'dist')));

// Изменяем инициализацию бота для предотвращения конфликтов
const bot = new Telegraf(process.env.BOT_TOKEN, {
  handlerTimeout: 90000, // увеличиваем таймаут для обработчиков
});

// Хранилища для чатов и пользователей
const waitingUsers = [];
const activeChats = new Map();
const userSockets = new Map();

// Добавляем простой статус-эндпоинт для проверки работы сервера
app.get('/api/status', (req, res) => {
  res.json({ status: 'ok', serverTime: new Date().toISOString() });
});

// WebSocket с Socket.IO - добавляем логирование
io.on('connection', (socket) => {
  console.log('New client connected', socket.id);
  
  // Отправляем подтверждение подключения клиенту
  socket.emit('connectionEstablished', { message: 'Connected to server' });
  
  // Поиск собеседника - исправленная версия
  socket.on('findChatPartner', async ({ userId, deviceId }) => {
    console.log(`User ${userId} is looking for a chat partner`);
    
    if (!userId) {
      socket.emit('error', { message: 'User ID is required' });
      return;
    }
    
    // Сохраняем связь между сокетом и пользователем
    userSockets.set(userId, socket);
    
    // Проверяем, не в активном ли чате пользователь
    for (const [chatId, participants] of activeChats.entries()) {
      if (participants.includes(userId)) {
        // Пользователь уже в чате, подключаем его к существующему
        socket.join(chatId);
        socket.emit('chatJoined', { chatId });
        
        // Получаем историю сообщений из Firebase
        try {
          const chatRef = db.ref(`chats/${chatId}/messages`);
          const snapshot = await chatRef.once('value');
          const messages = snapshot.val() || {};
          
          // Отправляем историю сообщений
          Object.values(messages).forEach(msg => {
            socket.emit('newMessage', msg);
          });
        } catch (err) {
          console.error('Error fetching messages:', err);
        }
        
        return;
      }
    }
    
    // Проверяем, нет ли пользователя в очереди ожидания
    const existingIndex = waitingUsers.findIndex(id => id === userId);
    if (existingIndex !== -1) {
      console.log(`User ${userId} already in waiting list`);
      socket.emit('waitingForPartner');
      return;
    }
    
    // Добавляем логирование очереди ожидания для отладки
    console.log('Current waiting users:', waitingUsers);
    
    // Если в очереди есть другие пользователи, подключаем к первому
    if (waitingUsers.length > 0) {
      const partnerId = waitingUsers.shift(); // Берем первого из очереди
      const partnerSocket = userSockets.get(partnerId);
      
      console.log(`Matching ${userId} with ${partnerId}`);
      
      if (partnerSocket) {
        // Создаем новый чат
        const chatId = nanoid();
        activeChats.set(chatId, [userId, partnerId]);
        
        // Подключаем обоих пользователей к комнате
        socket.join(chatId);
        partnerSocket.join(chatId);
        
        console.log(`Created new chat ${chatId} with users ${userId} and ${partnerId}`);
        
        // Создаем запись в Firebase
        const chatRef = db.ref(`chats/${chatId}`);
        await chatRef.set({
          createdAt: admin.database.ServerValue.TIMESTAMP,
          participants: [userId, partnerId]
        });
        
        // Отправляем уведомления обоим пользователям
        socket.emit('chatJoined', { chatId });
        partnerSocket.emit('chatJoined', { chatId });
        
        console.log('Both users notified about new chat');
        
        // Удаляем обоих пользователей из списка ожидания (на всякий случай)
        const userWaitingIndex = waitingUsers.indexOf(userId);
        if (userWaitingIndex !== -1) {
          waitingUsers.splice(userWaitingIndex, 1);
        }
        
        return;
      } else {
        console.log(`Partner socket not found for ${partnerId}, removing from queue`);
        // Если сокет партнера не найден, удаляем его из списка ожидания и продолжаем
      }
    }
    
    // Если партнер не найден или нет очереди, добавляем пользователя в очередь
    waitingUsers.push(userId);
    console.log(`Added user ${userId} to waiting list. Current list:`, waitingUsers);
    socket.emit('waitingForPartner');
  });
  
  // Отправка сообщения
  socket.on('sendMessage', async (message) => {
    console.log('Message received:', message);
    
    if (!message || !message.chatId || !message.senderId || !message.text) {
      socket.emit('error', { message: 'Invalid message format' });
      return;
    }
    
    const { id, chatId, senderId, text, timestamp } = message;
    
    // Проверяем, существует ли чат
    if (!activeChats.has(chatId)) {
      socket.emit('error', { message: 'Chat not found' });
      return;
    }
    
    const participants = activeChats.get(chatId);
    
    // Проверяем, является ли отправитель участником чата
    if (!participants.includes(senderId)) {
      socket.emit('error', { message: 'Not a participant of this chat' });
      return;
    }
    
    // Создаем сообщение
    const messageObj = {
      id: id || nanoid(),
      senderId,
      text,
      timestamp: timestamp || admin.database.ServerValue.TIMESTAMP
    };
    
    // Сохраняем в Firebase
    try {
      const messageRef = db.ref(`chats/${chatId}/messages/${messageObj.id}`);
      await messageRef.set(messageObj);
      
      // Отправляем сообщение всем участникам чата
      io.to(chatId).emit('newMessage', messageObj);
      
      console.log(`Message sent in chat ${chatId}`);
    } catch (err) {
      console.error('Error saving message:', err);
      socket.emit('error', { message: 'Failed to save message' });
    }
  });
  
  // Завершение чата
  socket.on('endChat', async ({ chatId, userId }) => {
    console.log(`User ${userId} is ending chat ${chatId}`);
    
    if (!chatId || !userId) {
      socket.emit('error', { message: 'Chat ID and User ID are required' });
      return;
    }
    
    // Проверяем, существует ли чат
    if (!activeChats.has(chatId)) {
      socket.emit('error', { message: 'Chat not found' });
      return;
    }
    
    const participants = activeChats.get(chatId);
    
    // Проверяем, является ли пользователь участником чата
    if (!participants.includes(userId)) {
      socket.emit('error', { message: 'Not a participant of this chat' });
      return;
    }
    
    // Уведомляем участников о завершении чата
    io.to(chatId).emit('chatEnded', { endedBy: userId });
    
    // Обновляем статус в Firebase
    try {
      const chatRef = db.ref(`chats/${chatId}`);
      await chatRef.update({
        ended: admin.database.ServerValue.TIMESTAMP,
        endedBy: userId
      });
    } catch (err) {
      console.error('Error updating chat status:', err);
    }
    
    // Удаляем чат из активных
    activeChats.delete(chatId);
  });
  
  // Отключение клиента
  socket.on('disconnect', () => {
    console.log('Client disconnected', socket.id);
    
    // Ищем пользователя по сокету
    let disconnectedUserId = null;
    for (const [userId, userSocket] of userSockets.entries()) {
      if (userSocket === socket) {
        disconnectedUserId = userId;
        userSockets.delete(userId);
        break;
      }
    }
    
    // Удаляем из списка ожидания, если был там
    if (disconnectedUserId) {
      const waitingIndex = waitingUsers.indexOf(disconnectedUserId);
      if (waitingIndex !== -1) {
        waitingUsers.splice(waitingIndex, 1);
      }
      
      // Проверяем, был ли пользователь в чате
      for (const [chatId, participants] of activeChats.entries()) {
        if (participants.includes(disconnectedUserId)) {
          // Уведомляем другого участника
          const partnerId = participants.find(id => id !== disconnectedUserId);
          const partnerSocket = userSockets.get(partnerId);
          
          if (partnerSocket) {
            partnerSocket.emit('chatEnded', { reason: 'disconnect' });
          }
          
          // Обновляем статус в Firebase
          db.ref(`chats/${chatId}`).update({
            ended: admin.database.ServerValue.TIMESTAMP,
            endedBy: disconnectedUserId,
            endReason: 'disconnect'
          }).catch(err => {
            console.error('Error updating chat status:', err);
          });
          
          // Удаляем чат из активных
          activeChats.delete(chatId);
          break;
        }
      }
    }
  });

  // Добавьте этот код в обработчики socket.io на сервере
  socket.on('cancelSearch', ({ userId }) => {
    console.log(`User ${userId} canceled search`);
    
    // Удаляем пользователя из списка ожидания
    const index = waitingUsers.indexOf(userId);
    if (index !== -1) {
      waitingUsers.splice(index, 1);
      console.log(`Removed user ${userId} from waiting list`);
    }
    
    // Сообщаем клиенту, что поиск отменен
    socket.emit('searchCanceled');
  });
});

// Обработка команды /start для Telegram бота
bot.start((ctx) => {
  ctx.reply('Добро пожаловать в анонимный чат! Нажмите на кнопку ниже, чтобы открыть чат.', {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Открыть анонимный чат', web_app: { url: process.env.WEBAPP_URL } }]
      ]
    }
  });
});

// Настраиваем роутинг для SPA
app.get('/diagnostic', (req, res) => {
  res.send(`
    <html>
      <head><title>Diagnostic</title></head>
      <body>
        <h1>Diagnostic Information</h1>
        <ul>
          <li>Server Time: ${new Date().toISOString()}</li>
          <li>Uptime: ${process.uptime()} seconds</li>
          <li>Memory Usage: ${JSON.stringify(process.memoryUsage())}</li>
          <li>Active Chats: ${activeChats.size}</li>
          <li>Waiting Users: ${waitingUsers.length}</li>
          <li>Connected Sockets: ${Object.keys(io.sockets.sockets).length}</li>
        </ul>
      </body>
    </html>
  `);
});

// Маршрут для проверки конфигурации клиента
app.get('/api/config', (req, res) => {
  res.json({
    firebaseProjectId: process.env.FIREBASE_PROJECT_ID || 'sdnfjsidf',
    firebaseDatabaseUrl: process.env.FIREBASE_DATABASE_URL || 'https://sdnfjsidf.firebaseio.com'
  });
});

// Маршрут для проверки состояния сборки
app.get('/api/build-info', (req, res) => {
  res.json({
    version: require('./package.json').version,
    buildTime: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Маршрут для резервной страницы
app.get('/fallback', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'fallback.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Запуск сервера и бота с обработкой ошибок
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  
  // Добавляем задержку перед запуском бота
  setTimeout(() => {
    // Запуск бота в режиме webhook для предотвращения конфликтов
    if (process.env.NODE_ENV === 'production') {
      // Режим webhook для продакшена
      bot.telegram.setWebhook(`${process.env.WEBAPP_URL}/bot${process.env.BOT_TOKEN}`)
        .then(() => {
          console.log('Webhook set successfully');
          
          // Настраиваем обработчик webhook
          app.use(bot.webhookCallback(`/bot${process.env.BOT_TOKEN}`));
        })
        .catch(err => {
          console.error('Failed to set webhook:', err);
          
          // Fallback на polling с отключением предыдущих соединений
          bot.telegram.deleteWebhook({ drop_pending_updates: true })
            .then(() => {
              console.log('Falling back to polling mode');
              bot.launch({ dropPendingUpdates: true })
                .catch(err => console.error('Failed to start bot in polling mode:', err));
            });
        });
    } else {
      // Режим polling для разработки
      bot.launch({ dropPendingUpdates: true })
        .then(() => console.log('Bot started in polling mode'))
        .catch(err => console.error('Failed to start bot:', err));
    }
  }, 3000); // 3 секунды задержки, чтобы убедиться, что предыдущие соединения закрыты
});

// Добавьте эту функцию после создания socket.io сервера
function logActiveChats() {
  console.log('=== DEBUG INFO ===');
  console.log(`Active pairs: ${activeChats.size}`);
  console.log(`Waiting users: ${waitingUsers.length}`);
  if (waitingUsers.length > 0) {
    console.log('Waiting users list:', waitingUsers);
  }
  
  // Если есть 2+ пользователя в списке ожидания, но они не соединены, это ошибка
  if (waitingUsers.length >= 2) {
    console.log('WARNING: Multiple users waiting but not connected!');
    
    // Пытаемся решить проблему, соединяя первых двух пользователей
    attemptToFixWaitingQueue();
  }
}

// Функция для исправления застрявшей очереди
async function attemptToFixWaitingQueue() {
  if (waitingUsers.length < 2) return;
  
  console.log('Attempting to fix waiting queue...');
  
  const userId1 = waitingUsers.shift();
  const userId2 = waitingUsers.shift();
  
  const socket1 = userSockets.get(userId1);
  const socket2 = userSockets.get(userId2);
  
  if (!socket1 || !socket2) {
    console.log('One of the sockets not found, cannot fix');
    
    // Возвращаем пользователей в очередь, если их сокеты валидны
    if (socket1) waitingUsers.push(userId1);
    if (socket2) waitingUsers.push(userId2);
    
    return;
  }
  
  // Создаем новый чат
  const chatId = nanoid();
  activeChats.set(chatId, [userId1, userId2]);
  
  // Подключаем обоих пользователей к комнате
  socket1.join(chatId);
  socket2.join(chatId);
  
  console.log(`Fixed queue: Created new chat ${chatId} with users ${userId1} and ${userId2}`);
  
  // Создаем запись в Firebase
  const chatRef = db.ref(`chats/${chatId}`);
  await chatRef.set({
    createdAt: admin.database.ServerValue.TIMESTAMP,
    participants: [userId1, userId2],
    autoFixed: true // Отмечаем, что это автоматически исправленный чат
  });
  
  // Отправляем уведомления обоим пользователям
  socket1.emit('chatJoined', { chatId });
  socket2.emit('chatJoined', { chatId });
  
  console.log('Both users notified about fixed chat');
}

// Запускаем периодическую проверку состояния
setInterval(logActiveChats, 10000); // Каждые 10 секунд

// Измененная обработка остановки приложения
const gracefulShutdown = () => {
  console.log('Shutting down gracefully...');
  
  // Сначала останавливаем бота
  bot.stop('SIGTERM');
  
  // Затем закрываем соединения и сервер с таймаутом
  setTimeout(() => {
    io.close();
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  }, 1000);
};

// Обработка сигналов остановки
process.once('SIGINT', gracefulShutdown);
process.once('SIGTERM', gracefulShutdown); 