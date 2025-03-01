import React, { useState, useRef, useEffect } from 'react';
import './ChatWindow.css';

const ChatWindow = ({ messages, onSendMessage, onEndChat }) => {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef(null);

  // Автоматическая прокрутка вниз при новых сообщениях
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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

  return (
    <div className="chat-window">
      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="empty-chat">
            <p>Начните общение! Ваш собеседник анонимен.</p>
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
                  className={`message ${group.sender === 'me' ? 'message-sent' : 'message-received'}`}
                >
                  <div className="message-bubble">
                    <p>{msg.text}</p>
                    <span className="message-time">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Введите сообщение..."
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