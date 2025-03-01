import React, { useState, useEffect } from 'react';
import './Chat.css';
import WebApp from '@twa-dev/sdk';

function Chat() {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [user, setUser] = useState(null);

  useEffect(() => {
    // Инициализация Telegram Mini App
    WebApp.ready();
    WebApp.expand();

    // Получаем данные пользователя из Telegram WebApp
    const initData = WebApp.initData || {};
    const user = WebApp.initDataUnsafe?.user || {};
    setUser(user);

    // Загружаем существующие сообщения
    fetchMessages();
  }, []);

  const fetchMessages = async () => {
    try {
      const response = await fetch('https://anonchatbot-production.up.railway.app/messages');
      const data = await response.json();
      setMessages(data);
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (newMessage.trim()) {
      try {
        const response = await fetch('https://anonchatbot-production.up.railway.app/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text: newMessage,
          }),
        });

        const message = await response.json();
        setMessages([...messages, message]);
        setNewMessage('');
      } catch (error) {
        console.error('Error sending message:', error);
      }
    }
  };

  return (
    <div className="chat-container">
      <div className="messages">
        {messages.map((message) => (
          <div key={message.id} className="message">
            <p>{message.text}</p>
            <span className="timestamp">
              {new Date(message.timestamp).toLocaleTimeString()}
            </span>
          </div>
        ))}
      </div>
      <form onSubmit={handleSubmit} className="message-form">
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Введите сообщение..."
        />
        <button type="submit">Отправить</button>
      </form>
    </div>
  );
}

export default Chat; 