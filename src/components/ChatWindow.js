import React, { useState, useRef, useEffect } from 'react';
import './ChatWindow.css';

const ChatWindow = ({ messages, onSendMessage, onEndChat, onRetryMessage, onRefresh }) => {
  const [inputText, setInputText] = useState('');
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const chatMessagesRef = useRef(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Автоматическая прокрутка вниз при новых сообщениях
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Обработка фокуса на поле ввода
  useEffect(() => {
    const handleFocus = () => {
      setIsKeyboardVisible(true);
      // Даем время для появления клавиатуры, затем прокручиваем
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 300);
    };

    const handleBlur = () => {
      setIsKeyboardVisible(false);
    };

    const inputElement = inputRef.current;
    if (inputElement) {
      inputElement.addEventListener('focus', handleFocus);
      inputElement.addEventListener('blur', handleBlur);
    }

    return () => {
      if (inputElement) {
        inputElement.removeEventListener('focus', handleFocus);
        inputElement.removeEventListener('blur', handleBlur);
      }
    };
  }, []);

  // Обработка нажатия на область сообщений для скрытия клавиатуры
  const handleMessagesClick = () => {
    inputRef.current?.blur();
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Предотвращаем множественные отправки
    if (isSubmitting || !inputText.trim()) return;
    
    setIsSubmitting(true);
    
    // Сохраняем текст сообщения и очищаем поле ввода
    const messageText = inputText;
    setInputText('');
    
    // Отправляем сообщение
    onSendMessage(messageText);
    
    // Сбрасываем флаг отправки через небольшую задержку
    setTimeout(() => {
      setIsSubmitting(false);
      
      // Фокусируемся на поле ввода после отправки
      inputRef.current?.focus();
    }, 500);
  };

  // Добавляем обработчик для повторной отправки сообщений с ошибкой
  const handleRetry = (messageId) => {
    onRetryMessage(messageId);
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

  // Обновляем функцию для отображения статуса сообщения
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
      
      <div className="chat-input-container">
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
    </div>
  );
};

export default ChatWindow; 