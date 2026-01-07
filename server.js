// =============== STEAM MANAGER PRO - MAIN SERVER ===============
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// Проверяем наличие файлов
console.log('📁 Проверка файлов:');
['telegram-app.html', 'style.css', 'frontend.js'].forEach(file => {
  if (fs.existsSync(path.join(__dirname, file))) {
    console.log(`✅ ${file} найден`);
  } else {
    console.log(`❌ ${file} не найден!`);
  }
});

// ================== ROUTES ==================

// Главная страница (Telegram Web App)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'telegram-app.html'));
});

// API для фронтенда
app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    version: '2.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

app.get('/api/accounts', (req, res) => {
  // Демо данные (замени на реальную БД)
  res.json([
    {
      id: "acc_1",
      name: "Основной аккаунт",
      login: "player_one",
      status: "online",
      proxy: "🇷🇺 RU • 195.24.76.123",
      game: "CS2",
      uptime: "4ч 22м",
      farming: false,
      profit: 45.75,
      drops: 3,
      hasDrop: true,
      inventory: [
        { name: "AK-47 | Redline", price: 15.50 },
        { name: "Кейс Prisma 2", price: 0.45 }
      ]
    },
    {
      id: "acc_2",
      name: "Фарминг #1",
      login: "farm_account_01",
      status: "farming",
      proxy: "🇩🇪 DE • 87.256.45.12",
      game: "CS:GO",
      uptime: "12ч 45м",
      farming: true,
      profit: 120.50,
      drops: 8,
      hasDrop: false
    },
    {
      id: "acc_3",
      name: "Трейд аккаунт",
      login: "trader_pro",
      status: "offline",
      proxy: "🇺🇸 US • 104.18.210.45",
      game: "Dota 2",
      uptime: "0ч 0м",
      farming: false,
      profit: 0,
      drops: 0,
      hasDrop: false
    }
  ]);
});

app.post('/api/account/:action', (req, res) => {
  const { action } = req.params;
  const { accountId } = req.body;
  
  res.json({
    success: true,
    message: `Аккаунт ${accountId}: ${action} успешно`,
    action: action,
    timestamp: new Date().toISOString()
  });
});

// Telegram Webhook
app.post('/api/telegram/webhook', (req, res) => {
  console.log('📨 Telegram webhook:', req.body);
  res.sendStatus(200);
});

// Статика для интерфейса
app.get('/style.css', (req, res) => {
  res.sendFile(path.join(__dirname, 'style.css'));
});

app.get('/frontend.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend.js'));
});

// ================== WebSocket ==================
io.on('connection', (socket) => {
  console.log('🔗 Новое подключение:', socket.id);
  
  socket.emit('welcome', {
    message: 'Steam Manager PRO v2.0 подключен!',
    version: '2.0',
    timestamp: new Date().toISOString()
  });
  
  socket.on('account-action', (data) => {
    console.log('👤 Действие с аккаунтом:', data);
    io.emit('account-update', data);
  });
  
  socket.on('disconnect', () => {
    console.log('❌ Отключение:', socket.id);
  });
});

// ================== START SERVER ==================
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`
  🚀 =========================================
  🎮 STEAM MANAGER PRO v2.0 ЗАПУЩЕН!
  🌐 URL: http://localhost:${PORT}
  🔌 WebSocket: ws://localhost:${PORT}
  📱 Telegram Web App: готов!
  🕐 ${new Date().toLocaleString()}
  🚀 =========================================
  `);
  
  console.log('📁 Структура проекта:');
  fs.readdirSync(__dirname).forEach(file => {
    console.log(`   📄 ${file}`);
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Получен SIGTERM, завершаем работу...');
  server.close(() => {
    console.log('✅ Сервер остановлен');
    process.exit(0);
  });
});
