import React, { useState, useRef, useEffect } from 'react';
import './ChatWindow.css';

const ChatWindow = ({ messages, onSendMessage, onEndChat }) => {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Автоматическая прокрутка вниз при новых сообщениях
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Фокус на поле ввода при монтировании
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (inputText.trim()) {
      onSendMessage(inputText);
      setInputText('');
    }
  };

  // Группируем сообщения по отправителю для лучшего отображения
  const groupedMessages = [];
  let currentGroup = null;

  messages.forEach((msg) => {
    if (!currentGroup || currentGroup.sender !== msg.sender) {
      currentGroup = {
        sender: msg.sender,
        messages: [msg]
      };
      groupedMessages.push(currentGroup);
    } else {
      currentGroup.messages.push(msg);
    }
  });

  // Функция для отображения статуса сообщения
  const renderMessageStatus = (msg) => {
    if (msg.sender !== 'me') return null;
    
    if (msg.error) {
      return <span className="message-status">⚠️</span>;
    } else if (msg.pending) {
      return <span className="message-status">⏳</span>;
    } else {
      return <span className="message-status">✓</span>;
    }
  };

  return (
    <div className="chat-window">
      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="empty-chat">
            <div className="empty-chat-icon">💬</div>
            <p>Начните общение! Ваш собеседник анонимен.</p>
            <p>Напишите первое сообщение, чтобы начать разговор.</p>
          </div>
        ) : (
          groupedMessages.map((group, groupIndex) => (
            <div 
              key={groupIndex} 
              className={`message-group ${group.sender === 'me' ? 'message-group-sent' : 'message-group-received'}`}
            >
              {group.messages.map((msg, msgIndex) => (
                <div 
                  key={msg.id} 
                  className={`message ${group.sender === 'me' ? 'message-sent' : 'message-received'} ${msg.pending ? 'message-pending' : ''} ${msg.error ? 'message-error' : ''}`}
                  style={{ animationDelay: `${msgIndex * 0.1}s` }}
                >
                  <div className="message-bubble">
                    <p>{msg.text}</p>
                    <span className="message-time">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      {renderMessageStatus(msg)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>
      
      <form className="chat-input" onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Введите сообщение..."
          autoComplete="off"
        />
        <button type="submit">Отправить</button>
      </form>
      
      <button className="end-chat-button" onClick={onEndChat}>
        Завершить чат
      </button>
    </div>
  );
};

export default ChatWindow; 