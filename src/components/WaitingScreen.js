import React from 'react';
import './WaitingScreen.css';

const WaitingScreen = ({ onCancel }) => {
  return (
    <div className="waiting-screen">
      <div className="spinner-container">
        <div className="spinner"></div>
        <div className="spinner-inner"></div>
        <div className="waiting-icon">👥</div>
      </div>
      
      <h2>Ищем собеседника</h2>
      <p>
        Пожалуйста, подождите, пока мы найдем вам анонимного собеседника
        <span className="waiting-dots">
          <span className="waiting-dot">.</span>
          <span className="waiting-dot">.</span>
          <span className="waiting-dot">.</span>
        </span>
      </p>
      
      {onCancel && (
        <button className="cancel-search-button" onClick={onCancel}>
          Отменить поиск
        </button>
      )}
    </div>
  );
};

export default WaitingScreen; 