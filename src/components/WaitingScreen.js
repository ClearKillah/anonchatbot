import React from 'react';
import './WaitingScreen.css';

const WaitingScreen = () => {
  return (
    <div className="waiting-screen">
      <div className="spinner"></div>
      <h2>Ищем собеседника...</h2>
      <p>Пожалуйста, подождите, пока мы найдем вам анонимного собеседника.</p>
    </div>
  );
};

export default WaitingScreen; 