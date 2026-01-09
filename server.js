const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');
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

// ================== БАЗА ДАННЫХ ==================
const DB_FILE = 'data.json';

function initDatabase() {
  if (!fs.existsSync(DB_FILE)) {
    const initialData = {
      accounts: [],
      settings: {
        version: '2.0.0',
        autoSave: true,
        proxyRotation: true
      },
      logs: []
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
  }
}

function readDatabase() {
  try {
    const data = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return { accounts: [], settings: {}, logs: [] };
  }
}

function writeDatabase(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function addLog(message, type = 'info') {
  const db = readDatabase();
  db.logs.unshift({
    id: uuidv4(),
    message,
    type,
    timestamp: new Date().toISOString()
  });
  
  // Ограничиваем логи 1000 записями
  if (db.logs.length > 1000) db.logs.pop();
  
  writeDatabase(db);
  
  // Отправляем в WebSocket
  io.emit('system-log', {
    time: new Date().toLocaleTimeString(),
    message,
    type
  });
}

initDatabase();
addLog('Система инициализирована', 'info');

// ================== ЭМУЛЯЦИЯ STEAM ==================
class SteamEmulator {
  constructor() {
    this.activeSessions = new Map();
    this.farmingJobs = new Map();
  }

  generateHardwareProfile() {
    const cpus = ['Intel i7-13700K', 'AMD Ryzen 7 5800X', 'Intel i5-12600K', 'AMD Ryzen 5 5600X'];
    const gpus = ['NVIDIA RTX 4070', 'AMD RX 7800 XT', 'NVIDIA RTX 3060', 'AMD RX 6700 XT'];
    const rams = ['16GB DDR4', '32GB DDR5', '8GB DDR4', '64GB DDR5'];
    const oss = ['Windows 11 Pro', 'Windows 10 Home', 'Ubuntu 22.04', 'macOS Ventura'];
    
    return {
      cpu: cpus[Math.floor(Math.random() * cpus.length)],
      gpu: gpus[Math.floor(Math.random() * gpus.length)],
      ram: rams[Math.floor(Math.random() * rams.length)],
      os: oss[Math.floor(Math.random() * oss.length)],
      screen: `${1920 + Math.floor(Math.random() * 500)}x${1080 + Math.floor(Math.random() * 300)}`,
      browser: this.generateBrowserFingerprint()
    };
  }

  generateBrowserFingerprint() {
    const browsers = [
      'Chrome/120.0.0.0',
      'Firefox/120.0',
      'Edge/120.0.0.0',
      'Safari/17.0'
    ];
    
    const os = [
      'Windows NT 10.0; Win64; x64',
      'Windows NT 6.1; WOW64',
      'Macintosh; Intel Mac OS X 10_15_7',
      'X11; Linux x86_64'
    ];
    
    return `Mozilla/5.0 (${os[Math.floor(Math.random() * os.length)]}) AppleWebKit/537.36 (KHTML, like Gecko) ${browsers[Math.floor(Math.random() * browsers.length)]} Safari/537.36`;
  }

  generateProxy(country) {
    const proxies = {
      'ru': [
        { ip: '195.24.76.123', port: 8080, city: 'Moscow', type: 'residential' },
        { ip: '85.234.126.155', port: 3128, city: 'Saint Petersburg', type: 'datacenter' }
      ],
      'us': [
        { ip: '104.18.210.45', port: 8080, city: 'New York', type: 'residential' },
        { ip: '162.243.128.147', port: 3128, city: 'San Francisco', type: 'datacenter' }
      ],
      'de': [
        { ip: '87.256.45.12', port: 8080, city: 'Frankfurt', type: 'residential' },
        { ip: '95.217.34.209', port: 3128, city: 'Berlin', type: 'datacenter' }
      ],
      'nl': [
        { ip: '145.239.86.78', port: 8080, city: 'Amsterdam', type: 'residential' },
        { ip: '185.230.47.66', port: 3128, city: 'Rotterdam', type: 'datacenter' }
      ]
    };
    
    const countryProxies = proxies[country] || proxies.ru;
    return countryProxies[Math.floor(Math.random() * countryProxies.length)];
  }

  generateDrop(game) {
    const drops = {
      'CS2': [
        { id: uuidv4(), name: "CS:GO Weapon Case", price: 0.35, rarity: "common", image: "case.png" },
        { id: uuidv4(), name: "Operation Phoenix Case", price: 0.85, rarity: "rare", image: "case.png" },
        { id: uuidv4(), name: "Prisma 2 Case", price: 0.45, rarity: "rare", image: "case.png" },
        { id: uuidv4(), name: "Fracture Case", price: 0.25, rarity: "common", image: "case.png" },
        { id: uuidv4(), name: "AK-47 | Redline", price: 15.50, rarity: "covert", image: "ak47.png" },
        { id: uuidv4(), name: "AWP | Asiimov", price: 45.00, rarity: "covert", image: "awp.png" }
      ],
      'Dota 2': [
        { id: uuidv4(), name: "Treasure of the Crimson Witness", price: 35.00, rarity: "immortal", image: "treasure.png" },
        { id: uuidv4(), name: "Arcana | Terrorblade", price: 45.00, rarity: "arcana", image: "arcana.png" },
        { id: uuidv4(), name: "Immortal Treasure I", price: 3.50, rarity: "rare", image: "treasure.png" }
      ],
      'TF2': [
        { id: uuidv4(), name: "Mann Co. Supply Crate Key", price: 2.50, rarity: "common", image: "key.png" },
        { id: uuidv4(), name: "Unusual Hat", price: 25.00, rarity: "rare", image: "hat.png" }
      ]
    };
    
    const gameDrops = drops[game] || drops.CS2;
    return gameDrops[Math.floor(Math.random() * gameDrops.length)];
  }

  async startAccount(accountId) {
    return new Promise((resolve) => {
      setTimeout(() => {
        const session = {
          id: uuidv4(),
          accountId,
          startedAt: new Date(),
          hardware: this.generateHardwareProfile(),
          proxy: this.generateProxy('ru'),
          status: 'online'
        };
        
        this.activeSessions.set(accountId, session);
        addLog(`Аккаунт ${accountId} запущен через ${session.proxy.ip}`, 'success');
        resolve(session);
      }, 2000);
    });
  }

  async startFarming(accountId, game) {
    return new Promise((resolve) => {
      const session = this.activeSessions.get(accountId);
      if (!session) {
        throw new Error('Сессия не найдена');
      }
      
      addLog(`Запуск фарминга ${game} для аккаунта ${accountId}`, 'info');
      
      // Эмуляция фарминга с дропами
      const farmingInterval = setInterval(() => {
        // Шанс дропа 15% каждый час
        if (Math.random() < 0.15 / 60) {
          const drop = this.generateDrop(game);
          
          io.emit('new-drop', {
            accountId,
            drop,
            timestamp: new Date().toISOString()
          });
          
          addLog(`Новый дроп: ${drop.name} ($${drop.price})`, 'info');
        }
      }, 60000); // Проверка каждую минуту
      
      this.farmingJobs.set(accountId, farmingInterval);
      resolve({ success: true, interval: farmingInterval });
    });
  }

  stopFarming(accountId) {
    const interval = this.farmingJobs.get(accountId);
    if (interval) {
      clearInterval(interval);
      this.farmingJobs.delete(accountId);
      addLog(`Фарминг остановлен для аккаунта ${accountId}`, 'info');
    }
  }

  stopAccount(accountId) {
    this.stopFarming(accountId);
    this.activeSessions.delete(accountId);
    addLog(`Аккаунт ${accountId} остановлен`, 'info');
  }
}

const steamEmu = new SteamEmulator();

// ================== API ==================

// Статус сервера
app.get('/api/status', (req, res) => {
  const db = readDatabase();
  res.json({
    status: 'online',
    version: '2.0.0',
    accounts: db.accounts.length,
    online: steamEmu.activeSessions.size,
    farming: steamEmu.farmingJobs.size,
    memory: process.memoryUsage(),
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Все аккаунты
app.get('/api/accounts', (req, res) => {
  const db = readDatabase();
  res.json(db.accounts);
});

// Создать аккаунт
app.post('/api/accounts', async (req, res) => {
  try {
    const accountData = req.body;
    const db = readDatabase();
    
    const newAccount = {
      id: uuidv4(),
      name: accountData.name || `Аккаунт ${db.accounts.length + 1}`,
      login: accountData.login || `user${db.accounts.length + 1}`,
      password: await bcrypt.hash(accountData.password || 'password123', 10),
      sharedSecret: accountData.sharedSecret || null,
      status: 'offline',
      game: accountData.game || 'CS2',
      country: accountData.country || 'ru',
      isolation: accountData.isolation || 'maximum',
      farming: false,
      uptime: '0ч 0м',
      hasNewDrop: false,
      lastDrop: null,
      farmingHours: 0,
      totalProfit: 0,
      totalDrops: 0,
      inventory: [],
      marketListings: [],
      settings: {
        autoFarm: accountData.autoFarm !== false,
        autoTrade: accountData.autoTrade || false,
        priceThreshold: accountData.priceThreshold || 0.1,
        claimStrategy: accountData.claimStrategy || 'most_expensive'
      },
      hardware: steamEmu.generateHardwareProfile(),
      proxy: steamEmu.generateProxy(accountData.country || 'ru'),
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString()
    };
    
    db.accounts.push(newAccount);
    writeDatabase(db);
    
    addLog(`Создан аккаунт: ${newAccount.name}`, 'success');
    
    io.emit('account-added', newAccount);
    res.status(201).json(newAccount);
  } catch (error) {
    addLog(`Ошибка создания аккаунта: ${error.message}`, 'error');
    res.status(500).json({ error: error.message });
  }
});

// Запустить аккаунт
app.post('/api/accounts/:id/start', async (req, res) => {
  try {
    const db = readDatabase();
    const account = db.accounts.find(a => a.id === req.params.id);
    
    if (!account) {
      return res.status(404).json({ error: 'Аккаунт не найден' });
    }
    
    if (account.status !== 'offline') {
      return res.status(400).json({ error: 'Аккаунт уже запущен' });
    }
    
    account.status = 'online';
    account.lastActivity = new Date().toISOString();
    writeDatabase(db);
    
    await steamEmu.startAccount(account.id);
    
    io.emit('account-updated', {
      id: account.id,
      status: 'online',
      farming: false
    });
    
    addLog(`Аккаунт ${account.name} запущен`, 'success');
    res.json({ success: true, account });
  } catch (error) {
    addLog(`Ошибка запуска аккаунта: ${error.message}`, 'error');
    res.status(500).json({ error: error.message });
  }
});

// Остановить аккаунт
app.post('/api/accounts/:id/stop', async (req, res) => {
  try {
    const db = readDatabase();
    const account = db.accounts.find(a => a.id === req.params.id);
    
    if (!account) {
      return res.status(404).json({ error: 'Аккаунт не найден' });
    }
    
    account.status = 'offline';
    account.farming = false;
    account.lastActivity = new Date().toISOString();
    writeDatabase(db);
    
    steamEmu.stopAccount(account.id);
    
    io.emit('account-updated', {
      id: account.id,
      status: 'offline',
      farming: false
    });
    
    addLog(`Аккаунт ${account.name} остановлен`, 'info');
    res.json({ success: true, account });
  } catch (error) {
    addLog(`Ошибка остановки аккаунта: ${error.message}`, 'error');
    res.status(500).json({ error: error.message });
  }
});

// Начать фарминг
app.post('/api/accounts/:id/farm', async (req, res) => {
  try {
    const db = readDatabase();
    const account = db.accounts.find(a => a.id === req.params.id);
    
    if (!account) {
      return res.status(404).json({ error: 'Аккаунт не найден' });
    }
    
    if (account.status === 'offline') {
      return res.status(400).json({ error: 'Аккаунт должен быть онлайн' });
    }
    
    const game = req.body.game || account.game;
    
    account.status = 'farming';
    account.farming = true;
    account.currentGame = game;
    account.lastActivity = new Date().toISOString();
    writeDatabase(db);
    
    await steamEmu.startFarming(account.id, game);
    
    io.emit('account-updated', {
      id: account.id,
      status: 'farming',
      farming: true,
      currentGame: game
    });
    
    addLog(`Фарминг ${game} запущен на ${account.name}`, 'success');
    res.json({ success: true, account });
  } catch (error) {
    addLog(`Ошибка запуска фарминга: ${error.message}`, 'error');
    res.status(500).json({ error: error.message });
  }
});

// Получить дроп
app.post('/api/accounts/:id/claim-drop', (req, res) => {
  try {
    const db = readDatabase();
    const account = db.accounts.find(a => a.id === req.params.id);
    
    if (!account) {
      return res.status(404).json({ error: 'Аккаунт не найден' });
    }
    
    const drop = steamEmu.generateDrop(account.game);
    
    account.hasNewDrop = false;
    account.totalProfit = (account.totalProfit || 0) + drop.price;
    account.totalDrops = (account.totalDrops || 0) + 1;
    
    if (!account.inventory) account.inventory = [];
    account.inventory.push({
      ...drop,
      acquired: new Date().toISOString(),
      marketable: true,
      tradable: true
    });
    
    writeDatabase(db);
    
    io.emit('drop-claimed', {
      accountId: account.id,
      drop,
      totalProfit: account.totalProfit
    });
    
    addLog(`${account.name}: получен дроп ${drop.name} ($${drop.price})`, 'success');
    res.json({ success: true, drop });
  } catch (error) {
    addLog(`Ошибка получения дропа: ${error.message}`, 'error');
    res.status(500).json({ error: error.message });
  }
});

// Инвентарь
app.get('/api/accounts/:id/inventory', (req, res) => {
  const db = readDatabase();
  const account = db.accounts.find(a => a.id === req.params.id);
  
  if (!account) {
    return res.status(404).json({ error: 'Аккаунт не найден' });
  }
  
  res.json(account.inventory || []);
});

// Выставить на рынок
app.post('/api/market/list', (req, res) => {
  try {
    const { accountId, itemId, price } = req.body;
    const db = readDatabase();
    const account = db.accounts.find(a => a.id === accountId);
    
    if (!account) {
      return res.status(404).json({ error: 'Аккаунт не найден' });
    }
    
    const itemIndex = account.inventory?.findIndex(i => i.id === itemId);
    if (itemIndex === -1) {
      return res.status(404).json({ error: 'Предмет не найден' });
    }
    
    const item = account.inventory[itemIndex];
    account.inventory.splice(itemIndex, 1);
    
    const listing = {
      id: uuidv4(),
      item,
      price,
      listedAt: new Date().toISOString(),
      status: 'active'
    };
    
    if (!account.marketListings) account.marketListings = [];
    account.marketListings.push(listing);
    
    writeDatabase(db);
    
    // Эмуляция продажи
    setTimeout(() => {
      const updatedDb = readDatabase();
      const updatedAccount = updatedDb.accounts.find(a => a.id === accountId);
      if (updatedAccount) {
        const listingIndex = updatedAccount.marketListings?.findIndex(l => l.id === listing.id);
        if (listingIndex !== -1) {
          updatedAccount.marketListings[listingIndex].status = 'sold';
          updatedAccount.marketListings[listingIndex].soldAt = new Date().toISOString();
          updatedAccount.totalProfit = (updatedAccount.totalProfit || 0) + price;
          
          writeDatabase(updatedDb);
          
          io.emit('item-sold', {
            accountId,
            item,
            price,
            profit: updatedAccount.totalProfit
          });
          
          addLog(`${updatedAccount.name}: продан ${item.name} за $${price}`, 'success');
        }
      }
    }, Math.random() * 30000 + 10000); // Продажа через 10-40 секунд
    
    addLog(`${account.name}: выставил ${item.name} за $${price}`, 'info');
    res.json({ success: true, listing });
  } catch (error) {
    addLog(`Ошибка выставления на рынок: ${error.message}`, 'error');
    res.status(500).json({ error: error.message });
  }
});

// Массовые действия
app.post('/api/bulk-action', async (req, res) => {
  try {
    const { action, accountIds, params } = req.body;
    const db = readDatabase();
    const results = [];
    
    for (const accountId of accountIds) {
      const account = db.accounts.find(a => a.id === accountId);
      if (!account) {
        results.push({ accountId, success: false, error: 'Не найден' });
        continue;
      }
      
      try {
        switch(action) {
          case 'start':
            if (account.status === 'offline') {
              account.status = 'online';
              results.push({ accountId, success: true });
            }
            break;
            
          case 'stop':
            account.status = 'offline';
            account.farming = false;
            steamEmu.stopAccount(accountId);
            results.push({ accountId, success: true });
            break;
            
          case 'farm':
            if (account.status !== 'offline' && !account.farming) {
              account.status = 'farming';
              account.farming = true;
              await steamEmu.startFarming(accountId, params?.game || account.game);
              results.push({ accountId, success: true });
            }
            break;
            
          case 'claim-drops':
            if (Math.random() > 0.5) { // 50% шанс что есть дроп
              const drop = steamEmu.generateDrop(account.game);
              account.totalProfit = (account.totalProfit || 0) + drop.price;
              account.totalDrops = (account.totalDrops || 0) + 1;
              results.push({ accountId, success: true, drop });
            }
            break;
        }
      } catch (error) {
        results.push({ accountId, success: false, error: error.message });
      }
    }
    
    writeDatabase(db);
    
    // Отправляем обновления
    accountIds.forEach(accountId => {
      const account = db.accounts.find(a => a.id === accountId);
      if (account) {
        io.emit('account-updated', {
          id: account.id,
          status: account.status,
          farming: account.farming
        });
      }
    });
    
    addLog(`Массовое действие "${action}" выполнено`, 'info');
    res.json({ success: true, results });
  } catch (error) {
    addLog(`Ошибка массового действия: ${error.message}`, 'error');
    res.status(500).json({ error: error.message });
  }
});

// Получить логи
app.get('/api/logs', (req, res) => {
  const db = readDatabase();
  res.json(db.logs.slice(0, 50)); // Последние 50 логов
});

// ================== WebSocket ==================
io.on('connection', (socket) => {
  console.log('🔗 Новое подключение WebSocket');
  
  const db = readDatabase();
  
  socket.emit('welcome', {
    message: 'Добро пожаловать в Steam Manager PRO v2.0',
    version: '2.0.0',
    accounts: db.accounts.length,
    timestamp: new Date().toISOString()
  });
  
  socket.emit('accounts-data', db.accounts);
  socket.emit('system-logs', db.logs.slice(0, 20));
  
  socket.on('get-stats', () => {
    const db = readDatabase();
    const stats = {
      total: db.accounts.length,
      online: db.accounts.filter(a => a.status !== 'offline').length,
      farming: db.accounts.filter(a => a.farming).length,
      withDrops: db.accounts.filter(a => a.hasNewDrop).length,
      totalProfit: db.accounts.reduce((sum, a) => sum + (a.totalProfit || 0), 0),
      totalDrops: db.accounts.reduce((sum, a) => sum + (a.totalDrops || 0), 0)
    };
    
    socket.emit('stats-update', stats);
  });
  
  socket.on('disconnect', () => {
    console.log('❌ WebSocket отключен');
  });
});

// ================== РОУТЫ ФРОНТЕНДА ==================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/telegram', (req, res) => {
  res.sendFile(path.join(__dirname, 'telegram-app.html'));
});

// ================== ЗАПУСК СЕРВЕРА ==================
const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`
  🚀 =========================================
  🎮 STEAM MANAGER PRO v2.0
  🌐 Сервер запущен: http://localhost:${PORT}
  📱 Telegram Web App: http://localhost:${PORT}/telegram
  🔧 Режим: Эмуляция Steam
  ⚡ Все функции активны
  🚀 =========================================
  `);
  
  addLog(`Сервер запущен на порту ${PORT}`, 'success');
});

// Автосохранение
setInterval(() => {
  addLog('Автосохранение данных', 'info');
}, 60000);
