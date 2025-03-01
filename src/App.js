import React, { useState, useEffect } from 'react';
import './App.css';
import ChatWindow from './components/ChatWindow';
import WaitingScreen from './components/WaitingScreen';

const App = () => {
  const [userId, setUserId] = useState(null);
  const [chatId, setChatId] = useState(null);
  const [isWaiting, setIsWaiting] = useState(false);
  const [messages, setMessages] = useState([]);
  const [lastMessageId, setLastMessageId] = useState(null);
  const [tg, setTg] = useState(null);
  const [pollingInterval, setPollingInterval] = useState(null);

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

  // Оптимизируем интервал опроса
  useEffect(() => {
    if (chatId && userId) {
      // Сначала получаем все сообщения
      fetchMessages();
      
      // Запускаем опрос сервера каждые 3 секунды
      const interval = setInterval(() => {
        fetchMessages();
      }, 3000);
      
      setPollingInterval(interval);
      
      // Очищаем интервал при размонтировании
      return () => {
        if (pollingInterval) {
          clearInterval(pollingInterval);
        }
      };
    }
  }, [chatId, userId]);

  // Добавляем обработчики событий активации/деактивации
  useEffect(() => {
    if (tg && tg.isVersionAtLeast('8.0')) {
      const handleActivated = () => {
        console.log('App activated');
        // Обновляем сообщения при активации
        if (chatId && userId) {
          fetchMessages();
        }
      };
      
      const handleDeactivated = () => {
        console.log('App deactivated');
      };
      
      tg.onEvent('activated', handleActivated);
      tg.onEvent('deactivated', handleDeactivated);
      
      return () => {
        tg.offEvent('activated', handleActivated);
        tg.offEvent('deactivated', handleDeactivated);
      };
    }
  }, [tg, chatId, userId]);

  const fetchMessages = async () => {
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
        // Фильтруем сообщения, чтобы избежать дублирования
        const existingMessageIds = messages.map(msg => msg.id);
        const newMessages = data.messages
          .filter(msg => !existingMessageIds.includes(msg.id))
          .map(msg => ({
            id: msg.id,
            text: msg.text,
            sender: msg.sender === userId ? 'me' : 'other',
            timestamp: msg.timestamp
          }));
        
        if (newMessages.length > 0) {
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

  const sendMessage = async (text) => {
    if (!text.trim() || !chatId) return;
    
    // Генерируем уникальный ID для сообщения
    const messageId = Date.now();
    
    // Добавляем сообщение локально
    const newMessage = {
      id: messageId,
      text,
      sender: 'me',
      timestamp: new Date().toISOString(),
      pending: true // Добавляем статус ожидания отправки
    };
    
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
          messageId // Передаем ID сообщения на сервер
        }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Обновляем статус сообщения на отправленное
        setMessages(prev => 
          prev.map(msg => 
            msg.id === messageId ? { ...msg, pending: false } : msg
          )
        );
        
        // Устанавливаем ID последнего сообщения только после успешной отправки
        setLastMessageId(messageId);
      } else {
        console.error('Error sending message:', data.message);
        // Помечаем сообщение как не отправленное
        setMessages(prev => 
          prev.map(msg => 
            msg.id === messageId ? { ...msg, error: true, pending: false } : msg
          )
        );
      }
    } catch (error) {
      console.error('Error sending message:', error);
      // Помечаем сообщение как не отправленное
      setMessages(prev => 
        prev.map(msg => 
          msg.id === messageId ? { ...msg, error: true, pending: false } : msg
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

  return (
    <div className="app">
      <header className="app-header">
        <h1>Анонимный чат</h1>
      </header>
      
      <main className="app-main">
        {isWaiting && !chatId ? (
          <WaitingScreen />
        ) : chatId ? (
          <ChatWindow 
            messages={messages} 
            onSendMessage={sendMessage} 
            onEndChat={endChat} 
          />
        ) : (
          <div className="loading">Загрузка...</div>
        )}
      </main>
    </div>
  );
};

export default App; 