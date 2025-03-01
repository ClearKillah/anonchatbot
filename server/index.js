const express = require('express');
const cors = require('cors');
const bot = require('./bot');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());

// Статические файлы из директории build (если они есть)
app.use(express.static(path.join(__dirname, '../build')));

const messages = [];

app.get('/messages', (req, res) => {
  res.json(messages);
});

app.post('/messages', (req, res) => {
  const message = {
    id: Date.now(),
    text: req.body.text,
    timestamp: new Date().toISOString(),
  };
  messages.push(message);
  res.json(message);
});

// Простая страница для проверки работы сервера
app.get('/', (req, res) => {
  res.send('Telegram Chat Bot API is running');
});

// Обработка других маршрутов
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../build', 'index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 