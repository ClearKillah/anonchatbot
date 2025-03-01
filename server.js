require('dotenv').config();
const express = require('express');
const { Telegraf } = require('telegraf');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'dist')));

// Инициализация бота
const bot = new Telegraf(process.env.BOT_TOKEN);

// Хранилище для анонимных чатов и сообщений
const activeChats = new Map();
const waitingUsers = [];
const chatMessages = new Map(); // Хранилище сообщений для каждого чата

// Обработка команды /start
bot.start((ctx) => {
  ctx.reply('Добро пожаловать в анонимный чат! Нажмите на кнопку ниже, чтобы открыть чат.', {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Открыть анонимный чат', web_app: { url: process.env.WEBAPP_URL } }]
      ]
    }
  });
});

// API для поиска собеседника
app.post('/api/find-chat-partner', (req, res) => {
  const { userId } = req.body;
  
  if (!userId) {
    return res.status(400).json({ success: false, message: 'User ID is required' });
  }
  
  // Проверяем, не находится ли пользователь уже в чате
  for (const [chatId, participants] of activeChats.entries()) {
    if (participants.includes(userId)) {
      return res.status(200).json({ 
        success: true, 
        chatId, 
        message: 'You are already in a chat' 
      });
    }
  }
  
  // Если есть ожидающие пользователи, создаем чат
  if (waitingUsers.length > 0 && waitingUsers[0] !== userId) {
    const partnerId = waitingUsers.shift();
    const chatId = `chat_${Date.now()}`;
    
    activeChats.set(chatId, [userId, partnerId]);
    
    return res.status(200).json({ 
      success: true, 
      chatId, 
      message: 'Chat partner found' 
    });
  }
  
  // Если нет ожидающих пользователей, добавляем текущего в очередь
  if (!waitingUsers.includes(userId)) {
    waitingUsers.push(userId);
  }
  
  return res.status(200).json({ 
    success: true, 
    waiting: true, 
    message: 'Waiting for a chat partner' 
  });
});

// Обновляем API для отправки сообщений
app.post('/api/send-message', (req, res) => {
  const { chatId, userId, message, messageId } = req.body;
  
  if (!chatId || !userId || !message) {
    return res.status(400).json({ success: false, message: 'Chat ID, User ID and message are required' });
  }
  
  const participants = activeChats.get(chatId);
  
  if (!participants) {
    return res.status(404).json({ success: false, message: 'Chat not found' });
  }
  
  if (!participants.includes(userId)) {
    return res.status(403).json({ success: false, message: 'You are not a participant of this chat' });
  }
  
  // Находим ID получателя
  const recipientId = participants.find(id => id !== userId);
  
  // Создаем объект сообщения с переданным ID или генерируем новый
  const messageObj = {
    id: messageId || Date.now(),
    text: message,
    sender: userId,
    timestamp: new Date().toISOString()
  };
  
  // Проверяем, не существует ли уже сообщение с таким ID
  if (chatMessages.has(chatId)) {
    const existingMessages = chatMessages.get(chatId);
    const messageExists = existingMessages.some(msg => msg.id === messageObj.id);
    
    if (!messageExists) {
      chatMessages.get(chatId).push(messageObj);
    } else {
      // Если сообщение с таким ID уже существует, просто возвращаем успех
      return res.status(200).json({ 
        success: true, 
        message: 'Message already sent', 
        recipientId,
        messageObj
      });
    }
  } else {
    chatMessages.set(chatId, [messageObj]);
  }
  
  return res.status(200).json({ 
    success: true, 
    message: 'Message sent', 
    recipientId,
    messageObj
  });
});

// Новый API для получения сообщений
app.post('/api/get-messages', (req, res) => {
  const { chatId, userId, lastMessageId } = req.body;
  
  if (!chatId || !userId) {
    return res.status(400).json({ success: false, message: 'Chat ID and User ID are required' });
  }
  
  const participants = activeChats.get(chatId);
  
  if (!participants) {
    return res.status(404).json({ success: false, message: 'Chat not found' });
  }
  
  if (!participants.includes(userId)) {
    return res.status(403).json({ success: false, message: 'You are not a participant of this chat' });
  }
  
  // Получаем сообщения для данного чата
  const messages = chatMessages.get(chatId) || [];
  
  // Если указан lastMessageId, возвращаем только новые сообщения
  let newMessages = messages;
  if (lastMessageId) {
    const lastIndex = messages.findIndex(msg => msg.id === parseInt(lastMessageId));
    if (lastIndex !== -1) {
      newMessages = messages.slice(lastIndex + 1);
    }
  }
  
  return res.status(200).json({ 
    success: true, 
    messages: newMessages
  });
});

// API для завершения чата
app.post('/api/end-chat', (req, res) => {
  const { chatId, userId } = req.body;
  
  if (!chatId || !userId) {
    return res.status(400).json({ success: false, message: 'Chat ID and User ID are required' });
  }
  
  const participants = activeChats.get(chatId);
  
  if (!participants) {
    return res.status(404).json({ success: false, message: 'Chat not found' });
  }
  
  if (!participants.includes(userId)) {
    return res.status(403).json({ success: false, message: 'You are not a participant of this chat' });
  }
  
  // Удаляем чат и его сообщения
  activeChats.delete(chatId);
  chatMessages.delete(chatId);
  
  return res.status(200).json({ 
    success: true, 
    message: 'Chat ended' 
  });
});

// Запуск сервера и бота
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  bot.launch().then(() => {
    console.log('Bot is running');
  }).catch(err => {
    console.error('Failed to start bot:', err);
  });
});

// Обработка остановки приложения
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM')); 