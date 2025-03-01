# Используем Node.js образ
FROM node:18

# Создаем директорию приложения
WORKDIR /app

# Копируем package.json файлы
COPY package*.json ./
COPY server/package*.json ./server/

# Устанавливаем зависимости
RUN npm install
RUN cd server && npm install

# Копируем исходный код
COPY . .

# Собираем React приложение
RUN npm run build

# Открываем порт
EXPOSE 3001

# Запускаем сервер
CMD ["node", "server/index.js"] 