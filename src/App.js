import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue, push } from "firebase/database";
import Chat, { Bubble, useMessages } from '@chatui/core';
import '@chatui/core/dist/index.css';
import { nanoid } from 'nanoid';
import io from 'socket.io-client';
import './App.css';

// Firebase конфигурация
const firebaseConfig = {
  apiKey: "AIzaSyAFPXNx5HHMhPiV0FgnprIJI4TYxvxrWfE", // Демо ключ
  authDomain: "sdnfjsidf.firebaseapp.com", // Используем захардкоженное значение
  databaseURL: "https://sdnfjsidf.firebaseio.com", // Используем захардкоженное значение
  projectId: "sdnfjsidf", // Используем захардкоженное значение
  storageBucket: "sdnfjsidf.appspot.com",
  messagingSenderId: "110324966438883300281",
  appId: "1:110324966438883300281:web:123456789012"
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
  const [error, setError] = useState(null);
  const { messages, appendMsg, setTyping, resetList } = useMessages([]);
  const deviceId = useRef(getDeviceId());
  const socketConnected = useRef(false);
  const messagesRef = useRef(null);
  const [waitingTime, setWaitingTime] = useState(0);
  
  // Инициализация соединения с сервером
  useEffect(() => {
    // Улучшенное подключение к Socket.IO с обработкой ошибок
    const socketClient = io(window.location.origin, {
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 10000,
      transports: ['websocket', 'polling']
    });

    socketClient.on('connect', () => {
      console.log('Socket.IO connected!');
      socketConnected.current = true;
      setStatus('connected');
      setSocket(socketClient);
      setError(null);
    });
    
    socketClient.on('connect_error', (err) => {
      console.error('Socket.IO connection error:', err);
      setStatus('error');
      setError(`Ошибка подключения: ${err.message}`);
    });

    socketClient.on('connectionEstablished', (data) => {
      console.log('Connection confirmed by server:', data);
      socketConnected.current = true;
      setStatus('connected');
    });

    socketClient.on('disconnect', () => {
      console.log('Socket.IO disconnected');
      socketConnected.current = false;
      setStatus('disconnected');
    });

    return () => {
      if (socketClient) {
        socketClient.disconnect();
      }
    };
  }, []);

  // Инициализация Telegram WebApp
  useEffect(() => {
    const telegram = window.Telegram?.WebApp;
    if (telegram) {
      setTg(telegram);
      
      // Получаем ID пользователя из Telegram
      if (telegram.initDataUnsafe && telegram.initDataUnsafe.user) {
        setUserId(telegram.initDataUnsafe.user.id);
      } else {
        // Для тестирования, если не в Telegram
        setUserId(`user_${nanoid(8)}`);
      }
      
      // Настраиваем WebApp
      telegram.expand();
      
      if (telegram.setHeaderColor) {
        telegram.setHeaderColor('#0088cc');
      }
      
      if (telegram.setBackgroundColor) {
        telegram.setBackgroundColor('#f5f5f5');
      }
      
      telegram.ready();
    } else {
      // Если не в Telegram, создаем тестовый ID
      setUserId(`user_${nanoid(8)}`);
      console.log('Telegram WebApp not available, using test user ID');
    }
  }, []);

  // Обработчики событий Socket.IO для чата
  useEffect(() => {
    if (!socket || !userId) return;

    // Получение нового сообщения
    socket.on('newMessage', (message) => {
      console.log('New message received:', message);
      
      // Проверяем, не наше ли это сообщение
      const position = message.senderId === userId ? 'right' : 'left';
      
      appendMsg({
        type: 'text',
        content: { text: message.text },
        position,
        user: { id: message.senderId }
      });
    });

    // Подключение к чату
    socket.on('chatJoined', (data) => {
      console.log('Joined chat:', data);
      setChatId(data.chatId);
      setIsWaiting(false);
    });

    // Ожидание партнера
    socket.on('waitingForPartner', () => {
      console.log('Waiting for a partner...');
      setIsWaiting(true);
    });

    // Завершение чата
    socket.on('chatEnded', (data) => {
      console.log('Chat ended:', data);
      appendMsg({
        type: 'system',
        content: {
          text: 'Чат завершен'
        }
      });
      setChatId(null);
      resetList();
    });

    // Обработка ошибок
    socket.on('error', (error) => {
      console.error('Socket error:', error);
      setError(error.message);
    });

    return () => {
      socket.off('newMessage');
      socket.off('chatJoined');
      socket.off('waitingForPartner');
      socket.off('chatEnded');
      socket.off('error');
    };
  }, [socket, userId, appendMsg, resetList]);

  // Добавьте таймер ожидания
  useEffect(() => {
    let waitingTimer;
    if (isWaiting) {
      waitingTimer = setInterval(() => {
        setWaitingTime(prevTime => prevTime + 1);
      }, 1000);
    } else {
      setWaitingTime(0);
    }
    
    return () => {
      if (waitingTimer) clearInterval(waitingTimer);
    };
  }, [isWaiting]);

  // Функция поиска собеседника
  const findChatPartner = () => {
    if (!socket || !userId || !socketConnected.current) {
      setError("Ошибка: соединение с сервером отсутствует");
      return;
    }
    
    setIsWaiting(true);
    setError(null);
    
    console.log('Finding chat partner...');
    socket.emit('findChatPartner', {
      userId,
      deviceId: deviceId.current
    });
    
    // Добавляем таймаут для автоматического повторного поиска, если долго нет ответа
    setTimeout(() => {
      if (isWaiting) {
        console.log('Search timeout, retrying...');
        socket.emit('findChatPartner', {
          userId,
          deviceId: deviceId.current
        });
      }
    }, 15000); // 15 секунд таймаут
  };

  // Функция отправки сообщения
  const handleSend = (type, content) => {
    if (!socket || !chatId || !userId) return;
    
    const messageId = nanoid();
    
    // Добавляем сообщение в локальный интерфейс
    appendMsg({
      type: 'text',
      content: { text: content.text },
      position: 'right',
      user: { id: userId }
    });
    
    // Отправляем через Socket.IO
    socket.emit('sendMessage', {
      id: messageId,
      chatId,
      senderId: userId,
      text: content.text,
      timestamp: Date.now(),
      deviceId: deviceId.current
    });
  };

  // Функция завершения чата
  const handleEndChat = () => {
    if (!socket || !chatId || !userId) return;
    
    socket.emit('endChat', { chatId, userId });
    setChatId(null);
    resetList();
  };

  // Добавьте в самое начало компонента App
  useEffect(() => {
    // Диагностика соединения
    console.log("App mounting, running diagnostics...");
    
    // 1. Проверяем Firebase
    try {
      const testRef = ref(database, 'test');
      set(testRef, {
        timestamp: Date.now(),
        test: 'Connection test'
      })
      .then(() => console.log("Firebase connection successful"))
      .catch(err => console.error("Firebase connection failed:", err));
    } catch (e) {
      console.error("Firebase test error:", e);
    }
    
    // 2. Проверяем Socket.IO вручную
    fetch('/api/status')
      .then(res => res.json())
      .then(data => console.log("API status:", data))
      .catch(err => console.error("API connection failed:", err));
  }, []);

  // Рендеринг интерфейса
  return (
    <div className="app-container">
      <div className="chat-container">
        {!chatId && !isWaiting ? (
          <div className="welcome-screen">
            <h1>Анонимный чат</h1>
            <p>Нажмите кнопку, чтобы начать чат с незнакомцем</p>
            <button 
              onClick={findChatPartner}
              className={`start-button ${!socketConnected.current ? 'disabled' : ''}`}
              disabled={!socketConnected.current}
            >
              Найти собеседника
            </button>
            <div className="connection-status">
              Статус: {status === 'connected' ? 'Подключен' : 
                      status === 'error' ? 'Ошибка подключения' : 
                      status === 'disconnected' ? 'Соединение потеряно' : 
                      'Ожидание подключения...'}
            </div>
            {error && <div className="error-message">{error}</div>}
          </div>
        ) : isWaiting ? (
          <div className="waiting-screen">
            <h2>Поиск собеседника...</h2>
            <div className="loader"></div>
            <p className="waiting-time">Время ожидания: {waitingTime} сек.</p>
            {waitingTime > 30 && (
              <p className="hint">Советуем отменить поиск и попробовать снова</p>
            )}
            <button 
              onClick={() => {
                setIsWaiting(false);
                setChatId(null);
                socket.emit('cancelSearch', { userId });
              }}
              className="cancel-button"
            >
              Отменить
            </button>
          </div>
        ) : (
          <Chat
            navbar={{
              title: 'Анонимный чат',
              leftContent: (
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