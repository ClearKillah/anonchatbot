import React, { useState, useRef, useEffect } from 'react';
import './ChatWindow.css';

const ChatWindow = ({ messages, onSendMessage, onEndChat, onRetryMessage, onRefresh, isProcessing }) => {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const chatMessagesRef = useRef(null);

  // Прокрутка к последнему сообщению
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Обработка нажатия на область сообщений
  const handleMessagesClick = () => {
    inputRef.current?.blur();
  };

  // Обработка отправки формы
  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!inputText.trim()) return;
    
    // Отправка сообщения
    onSendMessage(inputText);
    setInputText('');
    
    // Фокус на поле ввода
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  };

  // Автоматическая регулировка высоты поля ввода
  const handleInputChange = (e) => {
    setInputText(e.target.value);
  };

  // Повторная отправка сообщения с ошибкой
  const handleRetry = (messageId) => {
    onRetryMessage(messageId);
  };

  // Группируем сообщения по отправителю
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

  // Отображение статуса сообщения
  const renderMessageStatus = (msg) => {
    if (msg.sender !== 'me') return null;
    
    if (msg.error) {
      return (
        <span className="message-status error" onClick={() => handleRetry(msg.id)}>
          ⚠️ Повторить
        </span>
      );
    } else if (msg.pending) {
      return <span className="message-status">⏳</span>;
    } else {
      return <span className="message-status">✓</span>;
    }
  };

  return (
    <div className="chat-window">
      <div className="chat-header">
        <button className="refresh-button" onClick={onRefresh}>
          🔄 Обновить
        </button>
      </div>
      
      <div 
        className="chat-messages" 
        ref={chatMessagesRef}
        onClick={handleMessagesClick}
      >
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
              {group.messages.map((msg) => (
                <div 
                  key={msg.id} 
                  className={`message ${group.sender === 'me' ? 'message-sent' : 'message-received'} ${msg.pending ? 'message-pending' : ''} ${msg.error ? 'message-error' : ''}`}
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
      
      <div className="chat-input-container">
        <div className="chat-status">
          {isProcessing ? 'Синхронизация...' : 'Готово к отправке сообщений'}
        </div>
        
        <form className="chat-input" onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={handleInputChange}
            placeholder="Введите сообщение..."
            autoComplete="off"
          />
          <button type="submit">
            {inputText.trim() ? 'Отправить' : '→'}
          </button>
        </form>
        
        <button className="end-chat-button" onClick={onEndChat}>
          Завершить чат
        </button>
      </div>
    </div>
  );
};

export default ChatWindow; 