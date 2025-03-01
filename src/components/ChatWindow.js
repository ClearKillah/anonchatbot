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
      // Задержка для того, чтобы клавиатура успела появиться
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        
        // Прокручиваем viewport чтобы поле ввода оставалось видимым
        if (inputRef.current) {
          window.scrollTo({
            top: document.body.scrollHeight,
            behavior: 'smooth'
          });
        }
      }, 300);
    };

    const handleBlur = () => {
      setIsKeyboardVisible(false);
      // Возвращаем скролл в нормальное положение
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 100);
    };

    const inputElement = inputRef.current;
    if (inputElement) {
      inputElement.addEventListener('focus', handleFocus);
      inputElement.addEventListener('blur', handleBlur);
    }

    // Обрабатываем изменение размера окна (для поворота устройства)
    const handleResize = () => {
      if (isKeyboardVisible) {
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      }
    };
    
    window.addEventListener('resize', handleResize);

    return () => {
      if (inputElement) {
        inputElement.removeEventListener('focus', handleFocus);
        inputElement.removeEventListener('blur', handleBlur);
      }
      window.removeEventListener('resize', handleResize);
    };
  }, [isKeyboardVisible]);

  // Обработка нажатия на область сообщений для скрытия клавиатуры
  const handleMessagesClick = () => {
    inputRef.current?.blur();
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!inputText.trim()) return;
    
    // Сохраняем текст сообщения и очищаем поле ввода
    const messageText = inputText;
    setInputText('');
    
    // Отправляем сообщение
    onSendMessage(messageText);
    
    // Фокусируемся на поле ввода после отправки
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
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

  // Добавляем функцию автоматической регулировки высоты поля ввода
  const handleInputChange = (e) => {
    setInputText(e.target.value);
    
    // Адаптация высоты поля ввода к содержимому
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px';
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
            onChange={handleInputChange}
            placeholder="Введите сообщение..."
            autoComplete="off"
            autoCorrect="on"
            spellCheck="true"
          />
          <button type="submit">
            {inputText.trim() ? 'Отправить' : '→'}
          </button>
        </form>
        
        <button className="end-chat-button" onClick={onEndChat}>
          Завершить чат
        </button>
      </div>

      <div className="chat-status">
        {isProcessing ? 'Синхронизация...' : 'Готово к отправке сообщений'}
      </div>
    </div>
  );
};

export default ChatWindow; 