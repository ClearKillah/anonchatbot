const TelegramBot = require('node-telegram-bot-api');
const token = '8039344227:AAEDCP_902a3r52JIdM9REqUyPx-p2IVtxA';
const bot = new TelegramBot(token, { polling: true });

const webAppUrl = 'https://testos-production.up.railway.app';

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, 'Добро пожаловать в анонимный чат!', {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Открыть чат', web_app: { url: webAppUrl } }]
      ]
    }
  });
});

module.exports = bot; 