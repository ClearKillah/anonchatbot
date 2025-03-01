# Используем Node.js образ
FROM node:18

# Создаем директорию приложения
WORKDIR /app

# Копируем только серверную часть
COPY server ./server

# Устанавливаем зависимости для сервера
RUN cd server && npm install

# Копируем собранное React приложение (если оно у вас уже есть)
COPY build ./build

# Открываем порт
EXPOSE 3001

# Запускаем сервер
CMD ["node", "server/index.js"] 