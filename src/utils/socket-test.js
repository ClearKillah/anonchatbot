/**
 * Этот скрипт для диагностики проблем с соединением
 * Вы можете добавить его в начало App.js для отладки
 */

// Тестирование соединения с сервером
fetch('/api/status')
  .then(response => response.json())
  .then(data => {
    console.log('Server status:', data);
  })
  .catch(error => {
    console.error('Error connecting to server:', error);
  });

// Тестирование Firebase
import { getDatabase, ref, set } from "firebase/database";

// Функция для тестирования Firebase
export const testFirebase = (database) => {
  const testRef = ref(database, 'test');
  set(testRef, {
    timestamp: Date.now(),
    test: 'Test connection'
  })
  .then(() => {
    console.log('Firebase test successful');
  })
  .catch(error => {
    console.error('Firebase test failed:', error);
  });
}; 