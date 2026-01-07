// =============== TELEGRAM BOT ===============
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEB_APP_URL = process.env.WEB_APP_URL || 'https://steam-manager.onrender.com';

if (!TELEGRAM_TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN не найден в .env файле!');
  console.log('📝 Создайте файл .env с содержанием:');
  console.log('TELEGRAM_BOT_TOKEN=ваш_токен_от_BotFather');
  process.exit(1);
}

console.log('🤖 Инициализация Telegram бота...');

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// Команда /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name;
  
  bot.sendMessage(chatId, `🎮 *Привет, ${firstName}!*\n\n*Steam Manager PRO v2.0* - управление Steam аккаунтами прямо в Telegram!`, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ 
          text: '🚀 Открыть приложение', 
          web_app: { url: WEB_APP_URL } 
        }],
        [
          { text: '📊 Статистика', callback_data: 'stats' },
          { text: '👤 Аккаунты', callback_data: 'accounts' }
        ],
        [
          { text: '🌱 Фарминг', callback_data: 'farming' },
          { text: '🎁 Дропы', callback_data: 'drops' }
        ],
        [
          { text: '⚙️ Настройки', callback_data: 'settings' },
          { text: '❓ Помощь', callback_data: 'help' }
        ]
      ]
    }
  });
});

// Обработка callback-кнопок
bot.on('callback_query', (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;
  
  switch(data) {
    case 'stats':
      bot.sendMessage(chatId, `📊 *Статистика системы:*\n\n👥 Аккаунтов: 12\n🌱 Фармят: 3\n🎁 Дропов: 5\n💰 Прибыль: $45.75\n🔒 Риск: Низкий`, {
        parse_mode: 'Markdown'
      });
      break;
      
    case 'accounts':
      bot.sendMessage(chatId, `👤 *Ваши аккаунты:*\n\n1. Основной (Online) - $45.75\n2. Фарминг #1 (Farming) - $120.50\n3. Трейд (Offline) - $0.00\n\nИспользуйте приложение для управления.`, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '📱 Открыть для управления', web_app: { url: WEB_APP_URL } }
          ]]
        }
      });
      break;
      
    case 'help':
      bot.sendMessage(chatId, `❓ *Помощь по боту:*\n\n/start - Запустить бота\n\nБыстрые команды:\n• Откройте приложение для полного управления\n• Получайте уведомления о новых дропах\n• Управляйте фармингом\n• Следите за статистикой`, {
        parse_mode: 'Markdown'
      });
      break;
  }
  
  bot.answerCallbackQuery(callbackQuery.id);
});

// Обработка текстовых сообщений
bot.on('message', (msg) => {
  if (msg.text && !msg.text.startsWith('/')) {
    bot.sendMessage(msg.chat.id, `Для управления аккаунтами используйте приложение 👇`, {
      reply_markup: {
        inline_keyboard: [[
          { text: '📱 Открыть Steam Manager', web_app: { url: WEB_APP_URL } }
        ]]
      }
    });
  }
});

// Настройка меню бота
bot.setChatMenuButton({
  menu_button: {
    type: 'web_app',
    text: '📱 Steam Manager',
    web_app: { url: WEB_APP_URL }
  }
});

console.log(`✅ Telegram бот запущен!`);
console.log(`🌐 Web App URL: ${WEB_APP_URL}`);
console.log(`📝 Пишите боту /start для начала`);
