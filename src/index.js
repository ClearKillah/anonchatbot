import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import App from './App';
import { runTests } from './debug';

// Запускаем тесты для отладки
if (process.env.NODE_ENV !== 'production') {
  runTests();
}

// Оборачиваем рендеринг в try-catch для отлова ошибок
try {
  ReactDOM.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
    document.getElementById('root')
  );
} catch (error) {
  console.error('Error rendering React app:', error);
  // Показываем сообщение об ошибке
  const errorElement = document.createElement('div');
  errorElement.innerHTML = `
    <div style="padding: 20px; color: red; text-align: center;">
      <h2>Ошибка при загрузке приложения</h2>
      <p>${error.message}</p>
    </div>
  `;
  document.getElementById('root').appendChild(errorElement);
} 