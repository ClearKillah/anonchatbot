require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Telegraf } = require('telegraf');
const cors = require('cors');
const path = require('path');
const admin = require('firebase-admin');
const { nanoid } = require('nanoid');

// Инициализация Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
  }),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});

const db = admin.database();

// Настройка express
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'dist')));

// Инициализация бота
const bot = new Telegraf(process.env.BOT_TOKEN);

// Хранилища для чатов и пользователей
const waitingUsers = [];
const activeChats = new Map();
const userSockets = new Map();
const recentMessages = new Set();

// WebSocket с Socket.IO
io.on('connection', (socket) => {
  console.log('New client connected', socket.id);
  
  // Поиск собеседника
  socket.on('findChatPartner', async ({ userId, deviceId }) => {
    console.log(`User ${userId} is looking for a chat partner`);
    
    // Сохраняем связь между сокетом и пользователем
    userSockets.set(userId, socket);
    
    // Проверяем, не в активном ли чате пользователь
    for (const [chatId, participants] of activeChats.entries()) {
      if (participants.includes(userId)) {
        // Пользователь уже в чате, подключаем его к существующему
        socket.join(chatId);
        socket.emit('chatJoined', { chatId });
        
        // Получаем историю сообщений из Firebase
        const chatRef = db.ref(`chats/${chatId}/messages`);
        const snapshot = await chatRef.once('value');
        const messages = snapshot.val() || {};
        
        // Отправляем историю сообщений
        Object.values(messages).forEach(msg => {
          socket.emit('newMessage', msg);
        });
        
        return;
      }
    }
    
    // Если в ожидании есть другие пользователи, создаем чат
    if (waitingUsers.length > 0) {
      const partnerId = waitingUsers.shift();
      
      // Не создаем чат с самим собой
      if (partnerId === userId) {
        waitingUsers.push(userId);
        return;
      }
      
      const chatId = `chat_${nanoid()}`;
      activeChats.set(chatId, [userId, partnerId]);
      
      // Записываем новый чат в Firebase
      await db.ref(`chats/${chatId}`).set({
        created: Date.now(),
        participants: [userId, partnerId]
      });
      
      // Подключаем обоих пользователей к комнате чата
      socket.join(chatId);
      
      const partnerSocket = userSockets.get(partnerId);
      if (partnerSocket) {
        partnerSocket.join(chatId);
        partnerSocket.emit('chatJoined', { chatId });
      }
      
      socket.emit('chatJoined', { chatId });
    } else {
      // Если других ожидающих нет, добавляем в очередь
      if (!waitingUsers.includes(userId)) {
        waitingUsers.push(userId);
      }
    }
  });
  
  // Обработка отправки сообщений
  socket.on('sendMessage', async (message) => {
    const { id, chatId, senderId, text, timestamp, deviceId } = message;
    
    // Проверяем принадлежность к чату
    const participants = activeChats.get(chatId);
    if (!participants || !participants.includes(senderId)) {
      return;
    }
    
    // Создаем уникальный ключ для обнаружения дубликатов
    const messageKey = `${chatId}_${senderId}_${text}_${deviceId}`;
    
    // Защита от дублирования сообщений
    if (recentMessages.has(messageKey)) {
      console.log('Duplicate message detected');
      return;
    }
    
    // Добавляем в набор недавних сообщений
    recentMessages.add(messageKey);
    setTimeout(() => {
      recentMessages.delete(messageKey);
    }, 30000); // Удаляем через 30 секунд
    
    // Сохраняем сообщение в Firebase
    await db.ref(`chats/${chatId}/messages/${id}`).set({
      id,
      senderId,
      text,
      timestamp
    });
    
    // Отправляем сообщение всем в комнате чата
    io.to(chatId).emit('newMessage', {
      id,
      chatId,
      senderId,
      text,
      timestamp
    });
  });
  
  // Завершение чата
  socket.on('endChat', async ({ chatId, userId }) => {
    const participants = activeChats.get(chatId);
    if (!participants || !participants.includes(userId)) {
      return;
    }
    
    // Уведомляем другого участника
    const partnerId = participants.find(id => id !== userId);
    const partnerSocket = userSockets.get(partnerId);
    if (partnerSocket) {
      partnerSocket.emit('chatEnded');
    }
    
    // Очищаем ресурсы
    activeChats.delete(chatId);
    
    // Помечаем чат как завершенный в Firebase
    await db.ref(`chats/${chatId}`).update({
      ended: Date.now(),
      endedBy: userId
    });
  });
  
  // Отключение пользователя
  socket.on('disconnect', () => {
    console.log('Client disconnected', socket.id);
    
    // Ищем пользователя, связанного с этим сокетом
    let disconnectedUserId = null;
    for (const [userId, userSocket] of userSockets.entries()) {
      if (userSocket === socket) {
        disconnectedUserId = userId;
        userSockets.delete(userId);
        break;
      }
    }
    
    // Удаляем из списка ожидания, если был там
    const waitingIndex = waitingUsers.indexOf(disconnectedUserId);
    if (waitingIndex !== -1) {
      waitingUsers.splice(waitingIndex, 1);
    }
    
    // Проверяем, был ли пользователь в чате
    if (disconnectedUserId) {
      for (const [chatId, participants] of activeChats.entries()) {
        if (participants.includes(disconnectedUserId)) {
          // Уведомляем другого участника
          const partnerId = participants.find(id => id !== disconnectedUserId);
          const partnerSocket = userSockets.get(partnerId);
          if (partnerSocket) {
            partnerSocket.emit('chatEnded');
          }
          
          // Очищаем ресурсы
          activeChats.delete(chatId);
          
          // Помечаем чат как завершенный
          db.ref(`chats/${chatId}`).update({
            ended: Date.now(),
            endedBy: disconnectedUserId,
            endReason: 'disconnect'
          });
          
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