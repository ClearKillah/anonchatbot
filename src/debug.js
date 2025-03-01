// Файл для отладки клиентского приложения
console.log('Debug script loaded');

// Проверяем, загружены ли необходимые скрипты
console.log('Telegram WebApp available:', !!window.Telegram?.WebApp);
console.log('Firebase loaded:', typeof firebase !== 'undefined');
console.log('React loaded:', typeof React !== 'undefined');

// Создаем глобальный обработчик для вывода ошибок на экран
window.addEventListener('error', (event) => {
  const errorDisplay = document.getElementById('error-display');
  if (errorDisplay) {
    errorDisplay.style.display = 'block';
    errorDisplay.innerHTML = `
      <strong>Ошибка:</strong> ${event.message}<br>
      <strong>Файл:</strong> ${event.filename}<br>
      <strong>Строка:</strong> ${event.lineno}
    `;
  }
  console.error('Caught error:', event);
});

// Экспортируем функцию для выполнения тестов
export const runTests = () => {
  console.log('Running tests...');
  
  // Тест API
  fetch('/api/status')
    .then(res => res.json())
    .then(data => console.log('API test successful:', data))
    .catch(err => console.error('API test failed:', err));
    
  // Добавить другие тесты по необходимости
}; 