import React, { useState, useEffect } from 'react';
import './App.css';
import ChatWindow from './components/ChatWindow';
import WaitingScreen from './components/WaitingScreen';
import { v4 as uuidv4 } from 'uuid';

// Создаем уникальный ID сессии при загрузке приложения
const SESSION_ID = uuidv4();

// Получаем или создаем уникальный ID устройства
const getDeviceId = () => {
  let deviceId = localStorage.getItem('anonchat_device_id');
  if (!deviceId) {
    deviceId = uuidv4();
    localStorage.setItem('anonchat_device_id', deviceId);
  }
  return deviceId;
};

const DEVICE_ID = getDeviceId();

const App = () => {
  const [userId, setUserId] = useState(null);
  const [chatId, setChatId] = useState(null);
  const [isWaiting, setIsWaiting] = useState(false);
  const [messages, setMessages] = useState([]);
  const [lastMessageId, setLastMessageId] = useState(null);
  const [tg, setTg] = useState(null);
  const [pollingInterval, setPollingInterval] = useState(null);
  const [isAppActive, setIsAppActive] = useState(true);
  const [isSending, setIsSending] = useState(false);

  // Переменные для отслеживания состояния запросов
  let isFetching = false;
  let lastFetchTime = 0;

  useEffect(() => {
    // Инициализация Telegram WebApp
    const telegram = window.Telegram.WebApp;
    setTg(telegram);
    
    // Получаем ID пользователя из Telegram
    if (telegram && telegram.initDataUnsafe && telegram.initDataUnsafe.user) {
      setUserId(telegram.initDataUnsafe.user.id);
    } else {
      // Для тестирования, если не в Telegram
      setUserId(`user_${Date.now()}`);
    }
    
    // Настраиваем WebApp
    if (telegram) {
      // Расширяем приложение на весь экран
      telegram.expand();
      
      // Запрашиваем полноэкранный режим, если поддерживается
      if (telegram.isVersionAtLeast('8.0') && telegram.requestFullscreen) {
        telegram.requestFullscreen();
      }
      
      // Отключаем вертикальные свайпы для предотвращения случайного закрытия
      if (telegram.isVersionAtLeast('7.7') && telegram.disableVerticalSwipes) {
        telegram.disableVerticalSwipes();
      }
      
      // Устанавливаем цвета для лучшего отображения
      if (telegram.setHeaderColor) {
        telegram.setHeaderColor('#0088cc');
      }
      
      if (telegram.setBackgroundColor) {
        telegram.setBackgroundColor('#f5f5f5');
      }
      
      telegram.ready();
    }
  }, []);

  // Добавляем обработчик событий для полноэкранного режима
  useEffect(() => {
    if (tg && tg.isVersionAtLeast('8.0')) {
      const handleFullscreenChanged = () => {
        console.log('Fullscreen mode changed:', tg.isFullscreen);
      };
      
      tg.onEvent('fullscreenChanged', handleFullscreenChanged);
      
      return () => {
        tg.offEvent('fullscreenChanged', handleFullscreenChanged);
      };
    }
  }, [tg]);

  useEffect(() => {
    // Ищем собеседника, когда у нас есть userId
    if (userId) {
      findChatPartner();
    }
  }, [userId]);

  // Обработка событий жизненного цикла приложения
  useEffect(() => {
    const handleVisibilityChange = () => {
      const isVisible = document.visibilityState === 'visible';
      setIsAppActive(isVisible);
      
      if (isVisible && chatId && userId) {
        // При возвращении к приложению сбрасываем состояние запросов
        isFetching = false;
        lastFetchTime = 0;
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Обработка событий Telegram WebApp
    if (tg && tg.isVersionAtLeast('8.0')) {
      const handleActivated = () => {
        console.log('App activated');
        setIsAppActive(true);
        
        // Сбрасываем состояние запросов при активации
        isFetching = false;
        lastFetchTime = 0;
      };
      
      const handleDeactivated = () => {
        console.log('App deactivated');
        setIsAppActive(false);
      };
      
      tg.onEvent('activated', handleActivated);
      tg.onEvent('deactivated', handleDeactivated);
      
      return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        tg.offEvent('activated', handleActivated);
        tg.offEvent('deactivated', handleDeactivated);
      };
    }
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [tg, chatId, userId]);

  // Восстанавливаем интервал опроса
  useEffect(() => {
    if (chatId && userId) {
      // Сначала получаем все сообщения
      fetchMessages();
      
      // Запускаем опрос сервера каждые 5 секунд
      const interval = setInterval(() => {
        fetchMessages();
      }, 5000);
      
      setPollingInterval(interval);
      
      // Очищаем интервал при размонтировании
      return () => {
        if (pollingInterval) {
          clearInterval(pollingInterval);
          setPollingInterval(null);
        }
      };
    }
  }, [chatId, userId]);

  // Добавляем логирование для отладки
  useEffect(() => {
    console.log('Current messages:', messages);
  }, [messages]);

  // Функция для получения сообщений с дебаунсингом
  const fetchMessagesWithDebounce = async () => {
    const now = Date.now();
    
    // Предотвращаем слишком частые запросы (не чаще чем раз в 5 секунд)
    if (isFetching || now - lastFetchTime < 5000) return;
    
    isFetching = true;
    lastFetchTime = now;
    
    try {
      await fetchMessages();
    } catch (error) {
      console.error('Error in fetchMessagesWithDebounce:', error);
    } finally {
      isFetching = false;
    }
  };

  // Упрощенная функция получения сообщений
  const fetchMessages = async () => {
    // Проверяем, есть ли активный чат и ID пользователя
    if (!chatId || !userId) return;
    
    try {
      const response = await fetch('https://anonchatbot-production.up.railway.app/api/get-messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chatId,
          userId,
          lastMessageId: lastMessageId
        }),
      });
      
      const data = await response.json();
      
      if (data.success && data.messages && data.messages.length > 0) {
        // Создаем Map из существующих сообщений для быстрого поиска
        const existingMessagesMap = new Map();
        
        messages.forEach(msg => {
          existingMessagesMap.set(String(msg.id), true);
        });
        
        // Фильтруем только новые сообщения
        const newMessages = data.messages
          .filter(serverMsg => !existingMessagesMap.has(String(serverMsg.id)))
          .map(msg => ({
            id: msg.id,
            text: msg.text,
            sender: msg.sender === userId ? 'me' : 'other',
            timestamp: msg.timestamp,
            serverConfirmed: true
          }));
        
        if (newMessages.length > 0) {
          console.log('Adding new messages:', newMessages);
          // Добавляем только новые сообщения
          setMessages(prev => [...prev, ...newMessages]);
          
          // Обновляем ID последнего сообщения
          const lastMsg = data.messages[data.messages.length - 1];
          if (lastMsg) {
            setLastMessageId(lastMsg.id);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  };

  const findChatPartner = async () => {
    try {
      setIsWaiting(true);
      const response = await fetch('https://anonchatbot-production.up.railway.app/api/find-chat-partner', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        if (data.chatId) {
          setChatId(data.chatId);
          setIsWaiting(false);
          setMessages([]); // Очищаем сообщения при новом чате
          setLastMessageId(null); // Сбрасываем ID последнего сообщения
        } else if (data.waiting) {
          // Продолжаем ждать и периодически проверяем
          setTimeout(findChatPartner, 3000);
        }
      } else {
        console.error('Error finding chat partner:', data.message);
      }
    } catch (error) {
      console.error('Error finding chat partner:', error);
    }
  };

  // Упрощенная функция отправки сообщений
  const sendMessage = async (text) => {
    console.log('Sending message:', text);
    
    // Базовые проверки
    if (!text.trim() || !chatId || !userId) return;
    
    // Генерируем уникальный ID для сообщения
    const clientMessageId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Добавляем сообщение локально
    const newMessage = {
      id: clientMessageId,
      text,
      sender: 'me',
      timestamp: new Date().toISOString(),
      pending: true
    };
    
    // Добавляем сообщение в локальный стейт
    setMessages(prev => [...prev, newMessage]);
    
    try {
      const response = await fetch('https://anonchatbot-production.up.railway.app/api/send-message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chatId,
          userId,
          message: text,
          clientMessageId,
          deviceId: DEVICE_ID,
          sessionId: SESSION_ID
        }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Обновляем локальное сообщение
        setMessages(prev => 
          prev.map(msg => 
            msg.id === clientMessageId ? { 
              ...msg, 
              id: data.messageObj.id,
              pending: false,
              serverConfirmed: true
            } : msg
          )
        );
        
        // Устанавливаем ID последнего сообщения
        setLastMessageId(data.messageObj.id);
        
        // Вручную запрашиваем новые сообщения через 1 секунду
        setTimeout(() => {
          fetchMessages();
        }, 1000);
      } else {
        console.error('Error sending message:', data.message);
        setMessages(prev => 
          prev.map(msg => 
            msg.id === clientMessageId ? { ...msg, error: true, pending: false } : msg
          )
        );
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages(prev => 
        prev.map(msg => 
          msg.id === clientMessageId ? { ...msg, error: true, pending: false } : msg
        )
      );
    }
  };

  const endChat = async () => {
    try {
      await fetch('https://anonchatbot-production.up.railway.app/api/end-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chatId,
          userId,
        }),
      });
      
      // Сбрасываем состояние и ищем нового собеседника
      setChatId(null);
      setMessages([]);
      findChatPartner();
      
      // Очищаем интервал опроса при завершении чата
      if (pollingInterval) {
        clearInterval(pollingInterval);
        setPollingInterval(null);
      }
    } catch (error) {
      console.error('Error ending chat:', error);
    }
  };

  // Добавляем функцию для повторной отправки сообщений с ошибкой
  const retryMessage = async (messageId) => {
    // Находим сообщение с ошибкой
    const messageToRetry = messages.find(msg => msg.id === messageId && msg.error);
    
    if (!messageToRetry) return;
    
    // Обновляем статус сообщения на "отправляется"
    setMessages(prev => 
      prev.map(msg => 
        msg.id === messageId ? { ...msg, error: false, pending: true } : msg
      )
    );
    
    try {
      const response = await fetch('https://anonchatbot-production.up.railway.app/api/send-message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chatId,
          userId,
          message: messageToRetry.text,
          clientMessageId: messageId
        }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Обновляем локальное сообщение, заменяя клиентский ID на серверный
        setMessages(prev => 
          prev.map(msg => 
            msg.id === messageId ? { 
              ...msg, 
              id: data.messageObj.id, // Используем ID с сервера
              pending: false,
              error: false,
              serverConfirmed: true
            } : msg
          )
        );
        
        // Устанавливаем ID последнего сообщения
        setLastMessageId(data.messageObj.id);
      } else {
        console.error('Error retrying message:', data.message);
        // Помечаем сообщение как не отправленное
        setMessages(prev => 
          prev.map(msg => 
            msg.id === messageId ? { ...msg, error: true, pending: false } : msg
          )
        );
      }
    } catch (error) {
      console.error('Error retrying message:', error);
      // Помечаем сообщение как не отправленное
      setMessages(prev => 
        prev.map(msg => 
          msg.id === messageId ? { ...msg, error: true, pending: false } : msg
        )
      );
    }
  };

  // Добавляем кнопку для ручного обновления сообщений
  const manualRefresh = () => {
    if (!isFetching) {
      fetchMessages();
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Анонимный чат</h1>
      </header>
      
      <main className="app-main">
        {isWaiting && !chatId ? (
          <WaitingScreen onCancel={() => setIsWaiting(false)} />
        ) : chatId ? (
          <ChatWindow 
            messages={messages} 
            onSendMessage={sendMessage} 
            onEndChat={endChat} 
            onRetryMessage={retryMessage}
            onRefresh={manualRefresh}
          />
        ) : (
          <div className="loading">Загрузка...</div>
        )}
      </main>
    </div>
  );
};

export default App; 