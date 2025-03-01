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
      telegram.expand();
      telegram.ready();
    }
  }, []);

  useEffect(() => {
    // Ищем собеседника, когда у нас есть userId
    if (userId) {
      findChatPartner();
    }
  }, [userId]);

  // Настраиваем опрос сервера для получения новых сообщений
  useEffect(() => {
    if (chatId && userId) {
      // Запускаем опрос сервера каждые 2 секунды
      const interval = setInterval(() => {
        fetchMessages();
      }, 2000);
      
      setPollingInterval(interval);
      
      // Очищаем интервал при размонтировании
      return () => {
        if (pollingInterval) {
          clearInterval(pollingInterval);
        }
      };
    }
  }, [chatId, userId]);

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
        // Добавляем новые сообщения
        const newMessages = data.messages.map(msg => ({
          id: msg.id,
          text: msg.text,
          sender: msg.sender === userId ? 'me' : 'other',
          timestamp: msg.timestamp
        }));
        
        setMessages(prev => [...prev, ...newMessages]);
        
        // Обновляем ID последнего сообщения
        const lastMsg = data.messages[data.messages.length - 1];
        if (lastMsg) {
          setLastMessageId(lastMsg.id);
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
    
    // Добавляем сообщение локально
    const newMessage = {
      id: Date.now(),
      text,
      sender: 'me',
      timestamp: new Date().toISOString(),
    };
    
    setMessages(prev => [...prev, newMessage]);
    setLastMessageId(newMessage.id);
    
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
        }),
      });
      
      const data = await response.json();
      
      if (!data.success) {
        console.error('Error sending message:', data.message);
      }
    } catch (error) {
      console.error('Error sending message:', error);
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