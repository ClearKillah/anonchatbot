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

// Инициализация бота
const bot = new Telegraf(process.env.BOT_TOKEN);

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
  
  // Поиск собеседника
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
    if (waitingUsers.includes(userId)) {
      socket.emit('waitingForPartner');
      return;
    }
    
    // Если в очереди есть другие пользователи, подключаем к первому
    if (waitingUsers.length > 0) {
      const partnerId = waitingUsers.shift();
      const partnerSocket = userSockets.get(partnerId);
      
      if (partnerSocket) {
        // Создаем новый чат
        const chatId = nanoid();
        activeChats.set(chatId, [userId, partnerId]);
        
        // Подключаем обоих пользователей к комнате
        socket.join(chatId);
        partnerSocket.join(chatId);
        
        // Создаем запись в Firebase
        const chatRef = db.ref(`chats/${chatId}`);
        await chatRef.set({
          createdAt: admin.database.ServerValue.TIMESTAMP,
          participants: [userId, partnerId]
        });
        
        // Отправляем уведомления обоим пользователям
        socket.emit('chatJoined', { chatId });
        partnerSocket.emit('chatJoined', { chatId });
        
        console.log(`Chat ${chatId} created between ${userId} and ${partnerId}`);
      } else {
        // Если сокет партнера не найден, добавляем текущего пользователя в очередь
        waitingUsers.push(userId);
        socket.emit('waitingForPartner');
      }
    } else {
      // Добавляем пользователя в очередь ожидания
      waitingUsers.push(userId);
      socket.emit('waitingForPartner');
    }
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
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Запуск сервера и бота
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  bot.launch().then(() => {
    console.log('Bot is running');
  }).catch(err => {
    console.error('Failed to start bot:', err);
  });
});

// Обработка остановки приложения
process.once('SIGINT', () => {
  bot.stop('SIGINT');
  server.close();
});
process.once('SIGTERM', () => {
  bot.stop('SIGTERM');
  server.close();
}); 