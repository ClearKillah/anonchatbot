# Используем Node.js образ
FROM node:18

# Создаем директорию приложения
WORKDIR /app

# Копируем только серверную часть
COPY server ./server

# Устанавливаем зависимости для сервера
RUN cd server && npm install

# Создаем пустую директорию build для совместимости с кодом
RUN mkdir -p build

# Открываем порт
EXPOSE 3001

# Запускаем сервер
CMD ["node", "server/index.js"] 