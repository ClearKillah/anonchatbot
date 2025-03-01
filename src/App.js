import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue, push } from "firebase/database";
import Chat, { Bubble, useMessages } from '@chatui/core';
import '@chatui/core/dist/index.css';
import { nanoid } from 'nanoid';
import io from 'socket.io-client';
import './App.css';
import WaitingScreen from './components/WaitingScreen';

// Firebase конфигурация (создайте проект в Firebase Console)
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT.firebaseio.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Инициализация Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

// Создаем уникальный идентификатор устройства
const getDeviceId = () => {
  let deviceId = localStorage.getItem('anonchat_device_id');
  if (!deviceId) {
    deviceId = nanoid();
    localStorage.setItem('anonchat_device_id', deviceId);
  }
  return deviceId;
};

const App = () => {
  // Telegram WebApp API
  const [tg, setTg] = useState(null);
  const [userId, setUserId] = useState(null);
  const [chatId, setChatId] = useState(null);
  const [isWaiting, setIsWaiting] = useState(false);
  const [socket, setSocket] = useState(null);
  const [status, setStatus] = useState('connecting');
  const { messages, appendMsg, setTyping, resetList } = useMessages([]);
  const deviceId = useRef(getDeviceId());
  const socketConnected = useRef(false);
  const messagesRef = useRef(null);

  // Инициализация Telegram WebApp
  useEffect(() => {
    const telegram = window.Telegram.WebApp;
    setTg(telegram);
    
    // Получаем ID пользователя из Telegram
    if (telegram && telegram.initDataUnsafe && telegram.initDataUnsafe.user) {
      setUserId(telegram.initDataUnsafe.user.id);
    } else {
      // Для тестирования, если не в Telegram
      setUserId(`user_${nanoid(8)}`);
    }
    
    // Настраиваем WebApp
    if (telegram) {
      telegram.expand();
      
      if (telegram.isVersionAtLeast('8.0')) {
        telegram.requestFullscreen();
      }
      
      if (telegram.setHeaderColor) {
        telegram.setHeaderColor('#0088cc');
      }
      
      if (telegram.setBackgroundColor) {
        telegram.setBackgroundColor('#f5f5f5');
      }
      
      telegram.ready();
    }

    // Инициализация Socket.IO
    const socketClient = io('https://your-socket-server.com', {
      reconnectionAttempts: 5,
      timeout: 10000
    });

    socketClient.on('connect', () => {
      socketConnected.current = true;
      setStatus('connected');
    });

    socketClient.on('disconnect', () => {
      socketConnected.current = false;
      setStatus('disconnected');
    });

    socketClient.on('newMessage', (msg) => {
      if (msg.chatId === chatId) {
        appendMsg({
          type: msg.senderId === userId ? 'text' : 'received',
          content: { text: msg.text },
          position: msg.senderId === userId ? 'right' : 'left',
          user: { id: msg.senderId },
          _id: msg.id
        });
      }
    });

    socketClient.on('chatJoined', (data) => {
      setChatId(data.chatId);
      setIsWaiting(false);
      resetList();
      appendMsg({
        type: 'system',
        content: { text: 'Чат начат. Вы подключены к собеседнику.' }
      });
    });

    socketClient.on('chatEnded', () => {
      appendMsg({
        type: 'system',
        content: { text: 'Собеседник покинул чат.' }
      });
      setChatId(null);
    });

    setSocket(socketClient);

    return () => {
      socketClient.disconnect();
    };
  }, [appendMsg, resetList]);

  // Ищем собеседника когда у нас есть userId
  useEffect(() => {
    if (userId && socket && socketConnected.current) {
      findChatPartner();
    }
  }, [userId, socket, socketConnected.current]);

  // Подписываемся на сообщения из Firebase для данного чата
  useEffect(() => {
    if (chatId) {
      const chatRef = ref(database, `chats/${chatId}/messages`);
      const unsubscribe = onValue(chatRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          const messageList = Object.entries(data).map(([key, value]) => ({
            ...value,
            _id: key,
            type: value.senderId === userId ? 'text' : 'received',
            position: value.senderId === userId ? 'right' : 'left',
            content: { text: value.text }
          }));
          
          // Удаляем дубликаты перед добавлением в UI
          const existingIds = new Set(messages.map(m => m._id));
          const newMessages = messageList.filter(m => !existingIds.has(m._id));
          
          newMessages.forEach(msg => {
            appendMsg(msg);
          });
        }
      });
      
      return () => {
        unsubscribe();
      };
    }
  }, [chatId, userId, appendMsg, messages]);

  const findChatPartner = () => {
    if (!userId || !socket) return;
    
    setIsWaiting(true);
    socket.emit('findChatPartner', { userId, deviceId: deviceId.current });
    
    appendMsg({
      type: 'system',
      content: { text: 'Поиск собеседника...' }
    });
  };

  const handleSend = (type, content) => {
    if (!socket || !chatId || !userId) return;
    
    const messageId = nanoid();
    
    // Добавляем сообщение в локальный интерфейс
    appendMsg({
      _id: messageId,
      type: 'text',
      content: { text: content.text },
      position: 'right',
      user: { id: userId }
    });
    
    // Отправляем через Socket.IO для мгновенной доставки
    socket.emit('sendMessage', {
      id: messageId,
      chatId,
      senderId: userId,
      text: content.text,
      timestamp: Date.now(),
      deviceId: deviceId.current
    });
    
    // Дублируем в Firebase для надежности
    const newMessageRef = push(ref(database, `chats/${chatId}/messages`));
    set(newMessageRef, {
      id: messageId,
      senderId: userId,
      text: content.text,
      timestamp: Date.now()
    });
  };

  const handleEndChat = () => {
    if (!socket || !chatId) return;
    
    socket.emit('endChat', { chatId, userId });
    setChatId(null);
    resetList();
    findChatPartner();
  };

  // Рендеринг интерфейса с использованием ChatUI
  return (
    <div className="app-container">
      <div className="chat-container">
        {!chatId && !isWaiting ? (
          <div className="welcome-screen">
            <h1>Анонимный чат</h1>
            <p>Нажмите кнопку, чтобы начать чат с незнакомцем</p>
            <button 
              onClick={findChatPartner}
              className="start-button"
              disabled={!socketConnected.current}
            >
              Найти собеседника
            </button>
            <div className="connection-status">
              Статус: {status === 'connected' ? 'Подключен' : 'Ожидание подключения...'}
            </div>
          </div>
        ) : (
          <Chat
            navbar={{
              title: isWaiting ? 'Поиск собеседника...' : 'Анонимный чат',
              leftContent: !isWaiting && (
                <button onClick={handleEndChat} className="end-chat-button">
                  Завершить
                </button>
              )
            }}
            messages={messages}
            renderMessageContent={(msg) => (
              <Bubble content={msg.content.text} />
            )}
            onSend={handleSend}
            locale="ru"
            placeholder="Введите сообщение..."
            messagesRef={messagesRef}
          />
        )}
      </div>
    </div>
  );
};

export default App; 