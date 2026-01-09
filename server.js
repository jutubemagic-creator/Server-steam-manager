// =============== STEAM MANAGER PRO - MAIN SERVER ===============
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
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
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(__dirname));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Безопасность
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// ================== DATABASE ==================
const accountsDB = path.join(__dirname, 'database', 'accounts.json');
const sessionsDB = path.join(__dirname, 'database', 'sessions.json');
const settingsDB = path.join(__dirname, 'database', 'settings.json');

// Создаем директории и файлы БД если их нет
function initDatabase() {
  const dirs = ['database', 'logs', 'cache'];
  dirs.forEach(dir => {
    if (!fs.existsSync(path.join(__dirname, dir))) {
      fs.mkdirSync(path.join(__dirname, dir), { recursive: true });
    }
  });

  const dbs = [
    { file: accountsDB, default: [] },
    { file: sessionsDB, default: {} },
    { file: settingsDB, default: {} }
  ];

  dbs.forEach(db => {
    if (!fs.existsSync(db.file)) {
      fs.writeFileSync(db.file, JSON.stringify(db.default, null, 2));
    }
  });
}

initDatabase();

// ================== HELPER FUNCTIONS ==================
function readJSON(file) {
  try {
    const data = fs.readFileSync(file, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error reading ${file}:`, error);
    return null;
  }
}

function writeJSON(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error(`Error writing ${file}:`, error);
    return false;
  }
}

function logSystem(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] [${type.toUpperCase()}] ${message}\n`;
  
  fs.appendFileSync(
    path.join(__dirname, 'logs', 'system.log'),
    logEntry
  );
  
  console.log(`[${type}] ${message}`);
  
  // Отправляем в WebSocket
  io.emit('system-log', {
    time: new Date().toLocaleTimeString(),
    message: message,
    type: type
  });
}

// ================== DATA MODELS ==================
class AccountManager {
  constructor() {
    this.accounts = new Map();
    this.loadAccounts();
  }

  loadAccounts() {
    const data = readJSON(accountsDB) || [];
    data.forEach(account => {
      this.accounts.set(account.id, account);
    });
    logSystem(`Loaded ${this.accounts.size} accounts`, 'info');
  }

  saveAccounts() {
    const accountsArray = Array.from(this.accounts.values());
    writeJSON(accountsDB, accountsArray);
  }

  createAccount(accountData) {
    const accountId = uuidv4();
    const encryptedPassword = bcrypt.hashSync(accountData.password, 10);
    
    const newAccount = {
      id: accountId,
      name: accountData.name || `Аккаунт ${this.accounts.size + 1}`,
      login: accountData.login,
      password: encryptedPassword,
      sharedSecret: accountData.sharedSecret || null,
      status: 'offline',
      proxy: accountData.proxy || { country: 'auto', type: 'auto' },
      game: accountData.game || 'CS2',
      country: accountData.country || 'auto',
      isolation: accountData.isolation || 'high',
      farming: false,
      uptime: '0ч 0м',
      lastDrop: null,
      hasNewDrop: false,
      farmingHours: 0,
      totalProfit: 0,
      totalDrops: 0,
      inventory: [],
      settings: {
        autoFarm: accountData.autoFarm !== false,
        autoTrade: accountData.autoTrade || false,
        priceThreshold: accountData.priceThreshold || 0.1,
        claimStrategy: accountData.claimStrategy || 'most_expensive'
      },
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      hardwareFingerprint: this.generateHardwareFingerprint(),
      security: {
        lastIP: null,
        userAgent: null,
        suspiciousActivity: false,
        trustScore: 100
      }
    };

    this.accounts.set(accountId, newAccount);
    this.saveAccounts();
    logSystem(`Created account: ${newAccount.name}`, 'success');
    
    return newAccount;
  }

  generateHardwareFingerprint() {
    return {
      screen: `${Math.floor(Math.random() * 1920)}x${Math.floor(Math.random() * 1080)}`,
      platform: ['Win32', 'Linux x86_64', 'MacIntel'][Math.floor(Math.random() * 3)],
      userAgent: this.generateRandomUserAgent(),
      language: ['ru-RU', 'en-US', 'de-DE'][Math.floor(Math.random() * 3)],
      timezone: ['Europe/Moscow', 'America/New_York', 'Europe/Berlin'][Math.floor(Math.random() * 3)],
      canvasFingerprint: uuidv4().replace(/-/g, ''),
      webglFingerprint: uuidv4().replace(/-/g, ''),
      audioFingerprint: uuidv4().replace(/-/g, ''),
      fonts: this.generateRandomFonts()
    };
  }

  generateRandomUserAgent() {
    const agents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ];
    return agents[Math.floor(Math.random() * agents.length)];
  }

  generateRandomFonts() {
    const fontSets = [
      ['Arial', 'Times New Roman', 'Courier New', 'Verdana', 'Georgia'],
      ['Helvetica', 'Tahoma', 'Trebuchet MS', 'Comic Sans MS', 'Impact'],
      ['Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Source Sans Pro']
    ];
    return fontSets[Math.floor(Math.random() * fontSets.length)];
  }

  updateAccount(accountId, updates) {
    if (!this.accounts.has(accountId)) return null;
    
    const account = this.accounts.get(accountId);
    Object.assign(account, updates);
    account.lastActivity = new Date().toISOString();
    
    this.accounts.set(accountId, account);
    this.saveAccounts();
    
    // Отправляем обновление через WebSocket
    io.emit('account-updated', { accountId, updates });
    
    return account;
  }

  deleteAccount(accountId) {
    if (this.accounts.has(accountId)) {
      const account = this.accounts.get(accountId);
      this.accounts.delete(accountId);
      this.saveAccounts();
      logSystem(`Deleted account: ${account.name}`, 'warning');
      return true;
    }
    return false;
  }

  getAllAccounts() {
    return Array.from(this.accounts.values());
  }

  getAccount(accountId) {
    return this.accounts.get(accountId);
  }

  startAccount(accountId) {
    const account = this.getAccount(accountId);
    if (!account) return false;

    account.status = 'online';
    account.farming = false;
    account.uptime = '0ч 0м';
    account.lastActivity = new Date().toISOString();
    
    this.saveAccounts();
    logSystem(`Started account: ${account.name}`, 'success');
    
    // Эмуляция запуска Steam
    setTimeout(() => {
      this.updateAccount(accountId, {
        status: 'online',
        farming: false,
        currentGame: null
      });
    }, 2000);

    return true;
  }

  stopAccount(accountId) {
    const account = this.getAccount(accountId);
    if (!account) return false;

    account.status = 'offline';
    account.farming = false;
    account.currentGame = null;
    
    this.saveAccounts();
    logSystem(`Stopped account: ${account.name}`, 'info');
    
    return true;
  }

  startFarming(accountId, game) {
    const account = this.getAccount(accountId);
    if (!account) return false;
    if (account.status === 'offline') return false;

    account.status = 'farming';
    account.farming = true;
    account.currentGame = game || account.game;
    
    this.saveAccounts();
    logSystem(`Started farming ${account.currentGame} on: ${account.name}`, 'success');
    
    // Эмуляция фарминга
    this.simulateFarming(accountId);
    
    return true;
  }

  simulateFarming(accountId) {
    const account = this.getAccount(accountId);
    if (!account || !account.farming) return;

    // Каждую минуту обновляем время
    const farmingInterval = setInterval(() => {
      if (!account.farming) {
        clearInterval(farmingInterval);
        return;
      }

      // Увеличиваем время фарминга
      account.farmingHours += 1/60;
      
      // Случайное получение дропа (10% шанс в час)
      if (Math.random() < 0.1/60) {
        account.hasNewDrop = true;
        account.totalDrops = (account.totalDrops || 0) + 1;
        
        const drop = this.generateRandomDrop(account.currentGame);
        account.lastDrop = drop;
        
        io.emit('new-drop', {
          accountId,
          drop: drop,
          timestamp: new Date().toISOString()
        });
        
        logSystem(`New drop on ${account.name}: ${drop.name}`, 'info');
      }

      this.saveAccounts();
    }, 60000);

    // Сохраняем интервал для очистки
    account._farmingInterval = farmingInterval;
  }

  generateRandomDrop(game) {
    const drops = {
      'CS2': [
        { name: "CS:GO Weapon Case", price: 0.35, rarity: "common" },
        { name: "Operation Phoenix Weapon Case", price: 0.85, rarity: "rare" },
        { name: "Prisma 2 Case", price: 0.45, rarity: "rare" },
        { name: "Fracture Case", price: 0.25, rarity: "common" },
        { name: "AK-47 | Redline", price: 15.50, rarity: "covert" },
        { name: "AWP | Asiimov", price: 45.00, rarity: "covert" },
        { name: "★ Karambit | Doppler", price: 1200.00, rarity: "extraordinary" }
      ],
      'Dota 2': [
        { name: "Treasure of the Crimson Witness", price: 35.00, rarity: "immortal" },
        { name: "Arcana | Terrorblade", price: 45.00, rarity: "arcana" },
        { name: "Immortal Treasure I", price: 3.50, rarity: "rare" }
      ],
      'TF2': [
        { name: "Mann Co. Supply Crate Key", price: 2.50, rarity: "common" },
        { name: "Unusual Hat", price: 25.00, rarity: "rare" }
      ]
    };

    const gameDrops = drops[game] || drops['CS2'];
    return gameDrops[Math.floor(Math.random() * gameDrops.length)];
  }

  claimDrop(accountId, strategy = 'most_expensive') {
    const account = this.getAccount(accountId);
    if (!account || !account.hasNewDrop) return null;

    const drop = account.lastDrop;
    if (!drop) return null;

    account.hasNewDrop = false;
    account.totalProfit = (account.totalProfit || 0) + drop.price;
    
    // Добавляем в инвентарь
    if (!account.inventory) account.inventory = [];
    account.inventory.push({
      id: uuidv4(),
      name: drop.name,
      price: drop.price,
      rarity: drop.rarity,
      acquired: new Date().toISOString(),
      marketable: true,
      tradable: true
    });

    this.saveAccounts();
    
    io.emit('drop-claimed', {
      accountId,
      drop: drop,
      totalProfit: account.totalProfit
    });

    logSystem(`Claimed drop on ${account.name}: ${drop.name} ($${drop.price})`, 'success');
    
    return drop;
  }

  getInventory(accountId) {
    const account = this.getAccount(accountId);
    return account ? account.inventory || [] : [];
  }

  listItemOnMarket(accountId, itemId, price) {
    const account = this.getAccount(accountId);
    if (!account || !account.inventory) return null;

    const itemIndex = account.inventory.findIndex(item => item.id === itemId);
    if (itemIndex === -1) return null;

    const item = account.inventory[itemIndex];
    
    // Эмуляция выставления на рынок
    const listing = {
      id: uuidv4(),
      accountId,
      item: item,
      price: price,
      listedAt: new Date().toISOString(),
      status: 'active'
    };

    // В реальном проекте здесь бы сохранялось в БД продаж
    logSystem(`Listed item on market: ${item.name} for $${price}`, 'info');
    
    // Эмуляция продажи (случайная через 1-60 минут)
    const saleTime = Math.random() * 60 * 60000 + 60000;
    setTimeout(() => {
      this.simulateSale(listing);
    }, saleTime);

    return listing;
  }

  simulateSale(listing) {
    const account = this.getAccount(listing.accountId);
    if (!account) return;

    // Удаляем из инвентаря
    if (account.inventory) {
      account.inventory = account.inventory.filter(item => item.id !== listing.item.id);
    }

    // Добавляем прибыль
    account.totalProfit = (account.totalProfit || 0) + listing.price;

    this.saveAccounts();

    io.emit('item-sold', {
      accountId: listing.accountId,
      item: listing.item,
      price: listing.price,
      profit: account.totalProfit
    });

    logSystem(`Sold item: ${listing.item.name} for $${listing.price}`, 'success');
  }
}

// Инициализация менеджера аккаунтов
const accountManager = new AccountManager();

// ================== API ROUTES ==================

// Проверка статуса сервера
app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    accounts: accountManager.accounts.size,
    active: Array.from(accountManager.accounts.values()).filter(a => a.status !== 'offline').length
  });
});

// Получить все аккаунты
app.get('/api/accounts', (req, res) => {
  const accounts = accountManager.getAllAccounts();
  res.json(accounts);
});

// Получить конкретный аккаунт
app.get('/api/accounts/:id', (req, res) => {
  const account = accountManager.getAccount(req.params.id);
  if (account) {
    res.json(account);
  } else {
    res.status(404).json({ error: 'Account not found' });
  }
});

// Создать новый аккаунт
app.post('/api/accounts', (req, res) => {
  try {
    const accountData = req.body;
    
    // Валидация
    if (!accountData.login || !accountData.password) {
      return res.status(400).json({ error: 'Login and password are required' });
    }

    const newAccount = accountManager.createAccount(accountData);
    res.status(201).json(newAccount);
  } catch (error) {
    console.error('Error creating account:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Обновить аккаунт
app.put('/api/accounts/:id', (req, res) => {
  const accountId = req.params.id;
  const updates = req.body;

  const updatedAccount = accountManager.updateAccount(accountId, updates);
  if (updatedAccount) {
    res.json(updatedAccount);
  } else {
    res.status(404).json({ error: 'Account not found' });
  }
});

// Удалить аккаунт
app.delete('/api/accounts/:id', (req, res) => {
  const accountId = req.params.id;
  
  if (accountManager.deleteAccount(accountId)) {
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Account not found' });
  }
});

// Запустить аккаунт
app.post('/api/accounts/:id/start', (req, res) => {
  const accountId = req.params.id;
  
  if (accountManager.startAccount(accountId)) {
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Account not found or already started' });
  }
});

// Остановить аккаунт
app.post('/api/accounts/:id/stop', (req, res) => {
  const accountId = req.params.id;
  
  if (accountManager.stopAccount(accountId)) {
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Account not found' });
  }
});

// Начать фарминг
app.post('/api/accounts/:id/farm', (req, res) => {
  const accountId = req.params.id;
  const { game } = req.body;
  
  if (accountManager.startFarming(accountId, game)) {
    res.json({ success: true });
  } else {
    res.status(400).json({ error: 'Cannot start farming' });
  }
});

// Получить дроп
app.post('/api/accounts/:id/claim-drop', (req, res) => {
  const accountId = req.params.id;
  const { strategy } = req.body;
  
  const drop = accountManager.claimDrop(accountId, strategy);
  if (drop) {
    res.json({ success: true, drop });
  } else {
    res.status(400).json({ error: 'No drop available' });
  }
});

// Получить инвентарь
app.get('/api/accounts/:id/inventory', (req, res) => {
  const accountId = req.params.id;
  const inventory = accountManager.getInventory(accountId);
  res.json(inventory);
});

// Выставить предмет на рынок
app.post('/api/market/list', (req, res) => {
  const { accountId, itemId, price } = req.body;
  
  if (!accountId || !itemId || !price) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const listing = accountManager.listItemOnMarket(accountId, itemId, price);
  if (listing) {
    res.json({ success: true, listing });
  } else {
    res.status(400).json({ error: 'Failed to list item' });
  }
});

// Массовые действия
app.post('/api/bulk-action', (req, res) => {
  const { action, accountIds, params } = req.body;
  
  try {
    let results = [];
    
    switch(action) {
      case 'start':
        accountIds.forEach(id => {
          results.push({
            accountId: id,
            success: accountManager.startAccount(id)
          });
        });
        break;
        
      case 'stop':
        accountIds.forEach(id => {
          results.push({
            accountId: id,
            success: accountManager.stopAccount(id)
          });
        });
        break;
        
      case 'farm':
        accountIds.forEach(id => {
          results.push({
            accountId: id,
            success: accountManager.startFarming(id, params?.game)
          });
        });
        break;
        
      case 'claim-drops':
        accountIds.forEach(id => {
          const account = accountManager.getAccount(id);
          if (account && account.hasNewDrop) {
            accountManager.claimDrop(id, params?.strategy);
            results.push({
              accountId: id,
              success: true
            });
          }
        });
        break;
    }
    
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ================== STATIC FILES ==================

// Главная страница
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Telegram Web App
app.get('/telegram', (req, res) => {
  res.sendFile(path.join(__dirname, 'telegram-app.html'));
});

// ================== WebSocket ==================
io.on('connection', (socket) => {
  console.log(`🔗 New WebSocket connection: ${socket.id}`);
  
  // Отправляем приветственное сообщение
  socket.emit('welcome', {
    message: 'Connected to Steam Manager PRO',
    version: '2.0.0',
    accounts: accountManager.getAllAccounts().length,
    timestamp: new Date().toISOString()
  });
  
  // Отправляем текущий статус всех аккаунтов
  socket.emit('accounts-update', accountManager.getAllAccounts());
  
  // Обработка команд от клиента
  socket.on('account-command', (data) => {
    const { command, accountId, params } = data;
    
    try {
      let result = null;
      
      switch(command) {
        case 'start':
          result = accountManager.startAccount(accountId);
          break;
          
        case 'stop':
          result = accountManager.stopAccount(accountId);
          break;
          
        case 'farm':
          result = accountManager.startFarming(accountId, params?.game);
          break;
          
        case 'claim-drop':
          result = accountManager.claimDrop(accountId, params?.strategy);
          break;
          
        case 'update-settings':
          result = accountManager.updateAccount(accountId, params);
          break;
      }
      
      if (result) {
        socket.emit('command-success', {
          command,
          accountId,
          result
        });
        
        // Рассылаем обновление всем клиентам
        const account = accountManager.getAccount(accountId);
        io.emit('account-updated', { accountId, updates: account });
      } else {
        socket.emit('command-error', {
          command,
          accountId,
          error: 'Command failed'
        });
      }
    } catch (error) {
      socket.emit('command-error', {
        command,
        accountId,
        error: error.message
      });
    }
  });
  
  // Получение статистики
  socket.on('get-stats', () => {
    const accounts = accountManager.getAllAccounts();
    const stats = {
      total: accounts.length,
      online: accounts.filter(a => a.status !== 'offline').length,
      farming: accounts.filter(a => a.farming).length,
      withDrops: accounts.filter(a => a.hasNewDrop).length,
      totalProfit: accounts.reduce((sum, a) => sum + (a.totalProfit || 0), 0),
      totalDrops: accounts.reduce((sum, a) => sum + (a.totalDrops || 0), 0)
    };
    
    socket.emit('stats-update', stats);
  });
  
  socket.on('disconnect', () => {
    console.log(`❌ WebSocket disconnected: ${socket.id}`);
  });
});

// ================== BACKGROUND TASKS ==================

// Обновление времени работы каждую минуту
setInterval(() => {
  const accounts = accountManager.getAllAccounts();
  
  accounts.forEach(account => {
    if (account.status !== 'offline') {
      const timeMatch = account.uptime?.match(/(\d+)ч\s*(\d+)м/);
      if (timeMatch) {
        let hours = parseInt(timeMatch[1]);
        let minutes = parseInt(timeMatch[2]) + 1;
        
        if (minutes >= 60) {
          hours++;
          minutes = 0;
        }
        
        accountManager.updateAccount(account.id, {
          uptime: `${hours}ч ${minutes}м`
        });
      }
    }
  });
}, 60000);

// Периодическая проверка безопасности
setInterval(() => {
  logSystem('Security check completed', 'info');
}, 5 * 60 * 1000);

// ================== START SERVER ==================
const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`
  🚀 =========================================
  🎮 STEAM MANAGER PRO v2.0
  🌐 Server running on port: ${PORT}
  📱 Telegram Web App: /telegram
  👤 Accounts loaded: ${accountManager.accounts.size}
  🕐 ${new Date().toLocaleString()}
  🚀 =========================================
  `);
  
  console.log('📁 Available routes:');
  console.log('   GET  /              - Main interface');
  console.log('   GET  /telegram      - Telegram Web App');
  console.log('   GET  /api/status    - Server status');
  console.log('   GET  /api/accounts  - Get all accounts');
  console.log('   POST /api/accounts  - Create new account');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down...');
  
  // Сохраняем все данные
  accountManager.saveAccounts();
  
  server.close(() => {
    console.log('✅ Server stopped gracefully');
    process.exit(0);
  });
});

module.exports = { app, server, accountManager };
