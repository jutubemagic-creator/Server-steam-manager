const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

// ================== MIDDLEWARE ==================
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://telegram.org"],
      connectSrc: ["'self'", "wss://*", "ws://*"],
      imgSrc: ["'self'", "data:", "https://steamcdn-a.akamaihd.net"],
      fontSrc: ["'self'", "https://cdnjs.cloudflare.com"]
    }
  }
}));
app.use(compression());
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 100, // лимит запросов
  message: 'Слишком много запросов с этого IP, попробуйте позже'
});
app.use('/api/', limiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(__dirname));

// ================== БАЗА ДАННЫХ ==================
const DB_FILE = 'data.json';
const BACKUP_DIR = 'backups';

async function initDatabase() {
  try {
    await fs.access(DB_FILE);
    console.log('✅ База данных найдена');
  } catch (error) {
    console.log('📁 Создание новой базы данных...');
    const initialData = {
      accounts: [],
      settings: {
        version: '2.1.0',
        autoSave: true,
        proxyRotation: true,
        delayBetweenActions: 5,
        maxAccounts: 50,
        theme: 'dark',
        language: 'ru'
      },
      logs: [],
      backups: [],
      security: {
        lastScan: null,
        threats: 0,
        warnings: []
      }
    };
    await writeDatabase(initialData);
    console.log('✅ База данных создана');
  }
  
  // Создаем директорию для бэкапов
  try {
    await fs.mkdir(BACKUP_DIR, { recursive: true });
  } catch (error) {
    // Директория уже существует
  }
}

async function readDatabase() {
  try {
    const data = await fs.readFile(DB_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('❌ Ошибка чтения базы данных:', error);
    return { 
      accounts: [], 
      settings: {}, 
      logs: [],
      backups: [],
      security: { threats: 0, warnings: [] }
    };
  }
}

async function writeDatabase(data) {
  try {
    // Создаем бэкап перед записью
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(BACKUP_DIR, `backup_${timestamp}.json`);
    
    // Сохраняем текущее состояние
    const currentData = await readDatabase();
    await fs.writeFile(backupFile, JSON.stringify(currentData, null, 2));
    
    // Записываем новые данные
    await fs.writeFile(DB_FILE, JSON.stringify(data, null, 2));
    
    // Очищаем старые бэкапы (оставляем последние 10)
    const files = await fs.readdir(BACKUP_DIR);
    const backups = files.filter(f => f.startsWith('backup_')).sort();
    if (backups.length > 10) {
      for (let i = 0; i < backups.length - 10; i++) {
        await fs.unlink(path.join(BACKUP_DIR, backups[i]));
      }
    }
    
    return true;
  } catch (error) {
    console.error('❌ Ошибка записи базы данных:', error);
    throw error;
  }
}

async function addLog(message, type = 'info') {
  try {
    const db = await readDatabase();
    const logEntry = {
      id: uuidv4(),
      message: message.substring(0, 500),
      type,
      timestamp: new Date().toISOString()
    };
    
    db.logs.unshift(logEntry);
    
    // Ограничиваем логи 1000 записями
    if (db.logs.length > 1000) {
      db.logs = db.logs.slice(0, 1000);
    }
    
    await writeDatabase(db);
    
    // Отправляем в WebSocket
    io.emit('system-log', {
      time: new Date().toLocaleTimeString(),
      message,
      type
    });
    
    return true;
  } catch (error) {
    console.error('❌ Ошибка добавления лога:', error);
    return false;
  }
}

// ================== STEAM ЭМУЛЯТОР ==================
class SteamEmulator {
  constructor() {
    this.activeSessions = new Map();
    this.farmingJobs = new Map();
    this.dropRates = {
      'CS2': 0.15,
      'CS:GO': 0.12,
      'Dota 2': 0.08,
      'TF2': 0.10
    };
    this.proxyPools = {
      'ru': [
        { ip: '195.24.76.123', port: 8080, city: 'Москва', provider: 'Rostelecom', speed: 85, type: 'residential' },
        { ip: '85.234.126.155', port: 3128, city: 'Санкт-Петербург', provider: 'MTS', speed: 92, type: 'datacenter' }
      ],
      'us': [
        { ip: '104.18.210.45', port: 8080, city: 'Нью-Йорк', provider: 'DigitalOcean', speed: 95, type: 'residential' },
        { ip: '162.243.128.147', port: 3128, city: 'Сан-Франциско', provider: 'AWS', speed: 98, type: 'datacenter' }
      ],
      'eu': [
        { ip: '87.256.45.12', port: 8080, city: 'Франкфурт', provider: 'Hetzner', speed: 90, type: 'residential' },
        { ip: '95.217.34.209', port: 3128, city: 'Амстердам', provider: 'OVH', speed: 88, type: 'datacenter' }
      ]
    };
  }

  generateHardwareProfile() {
    const profiles = [
      {
        cpu: 'Intel i7-13700K',
        gpu: 'NVIDIA RTX 4070',
        ram: '32GB DDR5',
        os: 'Windows 11 Pro',
        screen: '2560x1440',
        browser: 'Chrome/120.0.0.0'
      },
      {
        cpu: 'AMD Ryzen 7 5800X',
        gpu: 'AMD RX 7800 XT',
        ram: '16GB DDR4',
        os: 'Windows 10 Home',
        screen: '1920x1080',
        browser: 'Firefox/120.0'
      },
      {
        cpu: 'Intel i5-12600K',
        gpu: 'NVIDIA RTX 3060',
        ram: '16GB DDR4',
        os: 'Windows 10 Pro',
        screen: '1920x1080',
        browser: 'Edge/120.0.0.0'
      },
      {
        cpu: 'AMD Ryzen 5 5600X',
        gpu: 'AMD RX 6700 XT',
        ram: '32GB DDR4',
        os: 'Ubuntu 22.04',
        screen: '1920x1080',
        browser: 'Chrome/120.0.0.0'
      }
    ];
    
    return profiles[Math.floor(Math.random() * profiles.length)];
  }

  generateProxy(country = 'ru') {
    const pool = this.proxyPools[country] || this.proxyPools.ru;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  generateDrop(game) {
    const dropPools = {
      'CS2': [
        { name: "CS:GO Weapon Case", price: 0.35, rarity: "common", image: "case.png", quality: "Consumer Grade" },
        { name: "Operation Phoenix Case", price: 0.85, rarity: "rare", image: "case.png", quality: "Classified" },
        { name: "Prisma 2 Case", price: 0.45, rarity: "rare", image: "case.png", quality: "Restricted" },
        { name: "Fracture Case", price: 0.25, rarity: "common", image: "case.png", quality: "Industrial Grade" },
        { name: "AK-47 | Redline", price: 15.50, rarity: "covert", image: "ak47.png", quality: "Covert" },
        { name: "AWP | Asiimov", price: 45.00, rarity: "covert", image: "awp.png", quality: "Covert" },
        { name: "M4A1-S | Printstream", price: 85.00, rarity: "legendary", image: "m4a1.png", quality: "Extraordinary" },
        { name: "Gloves | Sport", price: 120.00, rarity: "legendary", image: "gloves.png", quality: "Extraordinary" }
      ],
      'Dota 2': [
        { name: "Treasure of the Crimson Witness", price: 35.00, rarity: "immortal", image: "treasure.png", quality: "Immortal" },
        { name: "Arcana | Terrorblade", price: 45.00, rarity: "arcana", image: "arcana.png", quality: "Arcana" },
        { name: "Immortal Treasure I", price: 3.50, rarity: "rare", image: "treasure.png", quality: "Immortal" },
        { name: "Baby Roshan", price: 250.00, rarity: "legendary", image: "courier.png", quality: "Legendary" }
      ],
      'TF2': [
        { name: "Mann Co. Supply Crate Key", price: 2.50, rarity: "common", image: "key.png", quality: "Unique" },
        { name: "Unusual Hat", price: 25.00, rarity: "rare", image: "hat.png", quality: "Unusual" },
        { name: "Australium Weapon", price: 45.00, rarity: "legendary", image: "weapon.png", quality: "Australium" }
      ]
    };
    
    const pool = dropPools[game] || dropPools.CS2;
    return {
      id: uuidv4(),
      ...pool[Math.floor(Math.random() * pool.length)],
      timestamp: new Date().toISOString(),
      game: game
    };
  }

  async startAccount(accountId, accountData) {
    return new Promise((resolve) => {
      setTimeout(async () => {
        try {
          const session = {
            id: uuidv4(),
            accountId,
            accountData,
            startedAt: new Date(),
            hardware: this.generateHardwareProfile(),
            proxy: accountData.proxy || this.generateProxy(accountData.country),
            status: 'online',
            connectionSpeed: Math.floor(Math.random() * 30) + 70, // 70-100%
            ping: Math.floor(Math.random() * 50) + 20 // 20-70ms
          };
          
          this.activeSessions.set(accountId, session);
          
          await addLog(`Аккаунт "${accountData.name}" запущен (IP: ${session.proxy.ip})`, 'success');
          
          // Отправляем обновление статуса
          io.emit('account-status', {
            accountId,
            status: 'online',
            sessionId: session.id,
            proxy: session.proxy
          });
          
          resolve(session);
        } catch (error) {
          console.error('❌ Ошибка запуска аккаунта:', error);
          resolve(null);
        }
      }, 1500 + Math.random() * 2000); // Рандомная задержка 1.5-3.5 сек
    });
  }

  async startFarming(accountId, game) {
    return new Promise((resolve) => {
      const session = this.activeSessions.get(accountId);
      if (!session) {
        resolve({ success: false, error: 'Сессия не найдена' });
        return;
      }
      
      addLog(`Запуск фарминга ${game} для аккаунта "${session.accountData.name}"`, 'info');
      
      // Эмуляция фарминга
      const farmingInterval = setInterval(async () => {
        try {
          const dropChance = this.dropRates[game] || 0.1;
          
          if (Math.random() < dropChance / 60) { // Проверка каждую минуту
            const drop = this.generateDrop(game);
            
            io.emit('new-drop', {
              accountId,
              drop,
              session: {
                uptime: Math.floor((Date.now() - new Date(session.startedAt)) / 60000),
                proxy: session.proxy
              },
              timestamp: new Date().toISOString()
            });
            
            addLog(`🎁 ${session.accountData.name}: получен ${drop.name} ($${drop.price})`, 'success');
            
            // Обновляем БД
            const db = await readDatabase();
            const account = db.accounts.find(a => a.id === accountId);
            if (account) {
              account.hasNewDrop = true;
              account.lastDrop = drop;
              await writeDatabase(db);
            }
          }
          
          // Обновляем статистику
          io.emit('farming-update', {
            accountId,
            uptime: Math.floor((Date.now() - new Date(session.startedAt)) / 60000),
            drops: session.drops || 0
          });
          
        } catch (error) {
          console.error('❌ Ошибка в фарминге:', error);
        }
      }, 60000); // Каждую минуту
      
      this.farmingJobs.set(accountId, farmingInterval);
      
      resolve({ 
        success: true, 
        interval: farmingInterval,
        dropRate: this.dropRates[game] || 0.1,
        estimatedDropsPerHour: (this.dropRates[game] || 0.1) * 60
      });
    });
  }

  stopFarming(accountId) {
    const interval = this.farmingJobs.get(accountId);
    if (interval) {
      clearInterval(interval);
      this.farmingJobs.delete(accountId);
      addLog(`Фарминг остановлен для аккаунта ${accountId}`, 'info');
      return true;
    }
    return false;
  }

  stopAccount(accountId) {
    this.stopFarming(accountId);
    const session = this.activeSessions.get(accountId);
    if (session) {
      this.activeSessions.delete(accountId);
      addLog(`Аккаунт "${session.accountData?.name || accountId}" остановлен`, 'info');
      
      io.emit('account-status', {
        accountId,
        status: 'offline',
        sessionId: null
      });
      
      return true;
    }
    return false;
  }

  rotateProxy(accountId) {
    const session = this.activeSessions.get(accountId);
    if (session) {
      const oldProxy = session.proxy;
      session.proxy = this.generateProxy(session.accountData?.country);
      session.proxyChangedAt = new Date();
      
      addLog(`Прокси изменен для аккаунта "${session.accountData?.name}" (${oldProxy.ip} → ${session.proxy.ip})`, 'info');
      
      io.emit('proxy-rotated', {
        accountId,
        oldProxy,
        newProxy: session.proxy
      });
      
      return session.proxy;
    }
    return null;
  }
}

const steamEmu = new SteamEmulator();

// ================== API ==================

// Статус сервера
app.get('/api/status', async (req, res) => {
  try {
    const db = await readDatabase();
    const memory = process.memoryUsage();
    
    res.json({
      status: 'online',
      version: '2.1.0',
      serverTime: new Date().toISOString(),
      uptime: process.uptime(),
      accounts: {
        total: db.accounts.length,
        online: steamEmu.activeSessions.size,
        farming: steamEmu.farmingJobs.size,
        withDrops: db.accounts.filter(a => a.hasNewDrop).length
      },
      performance: {
        memory: {
          rss: Math.round(memory.rss / 1024 / 1024) + 'MB',
          heapTotal: Math.round(memory.heapTotal / 1024 / 1024) + 'MB',
          heapUsed: Math.round(memory.heapUsed / 1024 / 1024) + 'MB'
        },
        cpu: process.cpuUsage(),
        load: process.loadavg()
      },
      security: {
        threats: db.security?.threats || 0,
        lastScan: db.security?.lastScan,
        warnings: db.security?.warnings?.length || 0
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Все аккаунты
app.get('/api/accounts', async (req, res) => {
  try {
    const db = await readDatabase();
    
    // Добавляем реальный статус из эмулятора
    const accountsWithStatus = db.accounts.map(account => ({
      ...account,
      isOnline: steamEmu.activeSessions.has(account.id),
      isFarming: steamEmu.farmingJobs.has(account.id),
      session: steamEmu.activeSessions.get(account.id)
    }));
    
    res.json(accountsWithStatus);
  } catch (error) {
    console.error('❌ Ошибка получения аккаунтов:', error);
    res.status(500).json({ error: error.message });
  }
});

// Получить конкретный аккаунт
app.get('/api/accounts/:id', async (req, res) => {
  try {
    const db = await readDatabase();
    const account = db.accounts.find(a => a.id === req.params.id);
    
    if (!account) {
      return res.status(404).json({ error: 'Аккаунт не найден' });
    }
    
    // Добавляем информацию о сессии
    const session = steamEmu.activeSessions.get(account.id);
    const isFarming = steamEmu.farmingJobs.has(account.id);
    
    res.json({
      ...account,
      session,
      isOnline: !!session,
      isFarming
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Создать аккаунт
app.post('/api/accounts', async (req, res) => {
  try {
    const accountData = req.body;
    const db = await readDatabase();
    
    // Проверка обязательных полей
    if (!accountData.name || !accountData.login) {
      return res.status(400).json({ error: 'Имя и логин обязательны' });
    }
    
    // Проверка на дубликат логина
    const existingAccount = db.accounts.find(a => a.login === accountData.login);
    if (existingAccount) {
      return res.status(400).json({ error: 'Аккаунт с таким логином уже существует' });
    }
    
    // Хешируем пароль
    let hashedPassword = null;
    if (accountData.password) {
      hashedPassword = await bcrypt.hash(accountData.password, 10);
    }
    
    const newAccount = {
      id: uuidv4(),
      name: accountData.name,
      login: accountData.login,
      password: hashedPassword,
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
        claimStrategy: accountData.claimStrategy || 'most_expensive',
        farmingSchedule: accountData.farmingSchedule || { start: '00:00', end: '23:59' }
      },
      hardware: steamEmu.generateHardwareProfile(),
      proxy: accountData.proxy || steamEmu.generateProxy(accountData.country || 'ru'),
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      notes: accountData.notes || '',
      tags: accountData.tags || []
    };
    
    db.accounts.push(newAccount);
    await writeDatabase(db);
    
    await addLog(`Создан аккаунт: ${newAccount.name}`, 'success');
    
    io.emit('account-added', newAccount);
    res.status(201).json(newAccount);
  } catch (error) {
    console.error('❌ Ошибка создания аккаунта:', error);
    await addLog(`Ошибка создания аккаунта: ${error.message}`, 'error');
    res.status(500).json({ error: error.message });
  }
});

// Запустить аккаунт
app.post('/api/accounts/:id/start', async (req, res) => {
  try {
    const db = await readDatabase();
    const account = db.accounts.find(a => a.id === req.params.id);
    
    if (!account) {
      return res.status(404).json({ error: 'Аккаунт не найден' });
    }
    
    if (steamEmu.activeSessions.has(account.id)) {
      return res.status(400).json({ error: 'Аккаунт уже запущен' });
    }
    
    // Обновляем статус в БД
    account.status = 'online';
    account.lastActivity = new Date().toISOString();
    await writeDatabase(db);
    
    // Запускаем в эмуляторе
    const session = await steamEmu.startAccount(account.id, account);
    
    // Автоматически запускаем фарминг если включено
    if (account.settings?.autoFarm && account.game) {
      setTimeout(async () => {
        await steamEmu.startFarming(account.id, account.game);
        account.farming = true;
        account.status = 'farming';
        await writeDatabase(db);
      }, 3000);
    }
    
    io.emit('account-updated', {
      id: account.id,
      status: 'online',
      farming: false,
      sessionId: session?.id
    });
    
    res.json({ 
      success: true, 
      account,
      session,
      message: `Аккаунт "${account.name}" запущен`
    });
  } catch (error) {
    console.error('❌ Ошибка запуска аккаунта:', error);
    await addLog(`Ошибка запуска аккаунта: ${error.message}`, 'error');
    res.status(500).json({ error: error.message });
  }
});

// Остановить аккаунт
app.post('/api/accounts/:id/stop', async (req, res) => {
  try {
    const db = await readDatabase();
    const account = db.accounts.find(a => a.id === req.params.id);
    
    if (!account) {
      return res.status(404).json({ error: 'Аккаунт не найден' });
    }
    
    account.status = 'offline';
    account.farming = false;
    account.lastActivity = new Date().toISOString();
    await writeDatabase(db);
    
    // Останавливаем в эмуляторе
    steamEmu.stopAccount(account.id);
    
    io.emit('account-updated', {
      id: account.id,
      status: 'offline',
      farming: false
    });
    
    res.json({ 
      success: true, 
      account,
      message: `Аккаунт "${account.name}" остановлен`
    });
  } catch (error) {
    console.error('❌ Ошибка остановки аккаунта:', error);
    await addLog(`Ошибка остановки аккаунта: ${error.message}`, 'error');
    res.status(500).json({ error: error.message });
  }
});

// Начать фарминг
app.post('/api/accounts/:id/farm', async (req, res) => {
  try {
    const db = await readDatabase();
    const account = db.accounts.find(a => a.id === req.params.id);
    
    if (!account) {
      return res.status(404).json({ error: 'Аккаунт не найден' });
    }
    
    if (!steamEmu.activeSessions.has(account.id)) {
      return res.status(400).json({ error: 'Аккаунт должен быть онлайн' });
    }
    
    const game = req.body.game || account.game;
    
    // Запускаем фарминг
    const result = await steamEmu.startFarming(account.id, game);
    
    if (result.success) {
      account.status = 'farming';
      account.farming = true;
      account.currentGame = game;
      account.lastActivity = new Date().toISOString();
      await writeDatabase(db);
      
      io.emit('account-updated', {
        id: account.id,
        status: 'farming',
        farming: true,
        currentGame: game
      });
      
      res.json({ 
        success: true, 
        account,
        dropRate: result.dropRate,
        estimatedDropsPerHour: result.estimatedDropsPerHour,
        message: `Фарминг ${game} запущен на "${account.name}"`
      });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error('❌ Ошибка запуска фарминга:', error);
    await addLog(`Ошибка запуска фарминга: ${error.message}`, 'error');
    res.status(500).json({ error: error.message });
  }
});

// Остановить фарминг
app.post('/api/accounts/:id/stop-farming', async (req, res) => {
  try {
    const db = await readDatabase();
    const account = db.accounts.find(a => a.id === req.params.id);
    
    if (!account) {
      return res.status(404).json({ error: 'Аккаунт не найден' });
    }
    
    // Останавливаем фарминг в эмуляторе
    const stopped = steamEmu.stopFarming(account.id);
    
    if (stopped) {
      account.status = 'online';
      account.farming = false;
      await writeDatabase(db);
      
      io.emit('account-updated', {
        id: account.id,
        status: 'online',
        farming: false
      });
      
      res.json({ 
        success: true, 
        account,
        message: `Фарминг остановлен на "${account.name}"`
      });
    } else {
      res.status(400).json({ error: 'Фарминг не был запущен' });
    }
  } catch (error) {
    console.error('❌ Ошибка остановки фарминга:', error);
    await addLog(`Ошибка остановки фарминга: ${error.message}`, 'error');
    res.status(500).json({ error: error.message });
  }
});

// Получить дроп
app.post('/api/accounts/:id/claim-drop', async (req, res) => {
  try {
    const db = await readDatabase();
    const account = db.accounts.find(a => a.id === req.params.id);
    
    if (!account) {
      return res.status(404).json({ error: 'Аккаунт не найден' });
    }
    
    const drop = steamEmu.generateDrop(account.game);
    
    account.hasNewDrop = false;
    account.totalProfit = (account.totalProfit || 0) + drop.price;
    account.totalDrops = (account.totalDrops || 0) + 1;
    account.lastDrop = drop;
    
    if (!account.inventory) account.inventory = [];
    account.inventory.push({
      ...drop,
      acquired: new Date().toISOString(),
      marketable: true,
      tradable: true,
      accountName: account.name
    });
    
    await writeDatabase(db);
    
    // Отправляем уведомление
    io.emit('drop-claimed', {
      accountId: account.id,
      accountName: account.name,
      drop,
      totalProfit: account.totalProfit,
      timestamp: new Date().toISOString()
    });
    
    // Отправляем в Telegram если подключен
    if (process.env.TELEGRAM_CHAT_ID) {
      // Здесь можно добавить отправку в Telegram
    }
    
    await addLog(`${account.name}: получен дроп ${drop.name} ($${drop.price})`, 'success');
    
    res.json({ 
      success: true, 
      drop,
      account,
      message: `Дроп "${drop.name}" получен на аккаунте "${account.name}"`
    });
  } catch (error) {
    console.error('❌ Ошибка получения дропа:', error);
    await addLog(`Ошибка получения дропа: ${error.message}`, 'error');
    res.status(500).json({ error: error.message });
  }
});

// Сменить прокси
app.post('/api/accounts/:id/rotate-proxy', async (req, res) => {
  try {
    const db = await readDatabase();
    const account = db.accounts.find(a => a.id === req.params.id);
    
    if (!account) {
      return res.status(404).json({ error: 'Аккаунт не найден' });
    }
    
    if (!steamEmu.activeSessions.has(account.id)) {
      return res.status(400).json({ error: 'Аккаунт должен быть онлайн' });
    }
    
    const newProxy = steamEmu.rotateProxy(account.id);
    
    if (newProxy) {
      account.proxy = newProxy;
      await writeDatabase(db);
      
      res.json({ 
        success: true, 
        account,
        newProxy,
        message: `Прокси изменен для "${account.name}"`
      });
    } else {
      res.status(500).json({ error: 'Не удалось изменить прокси' });
    }
  } catch (error) {
    console.error('❌ Ошибка смены прокси:', error);
    await addLog(`Ошибка смены прокси: ${error.message}`, 'error');
    res.status(500).json({ error: error.message });
  }
});

// Инвентарь аккаунта
app.get('/api/accounts/:id/inventory', async (req, res) => {
  try {
    const db = await readDatabase();
    const account = db.accounts.find(a => a.id === req.params.id);
    
    if (!account) {
      return res.status(404).json({ error: 'Аккаунт не найден' });
    }
    
    const inventory = account.inventory || [];
    
    // Сортировка и фильтрация
    let filteredInventory = [...inventory];
    const { sort = 'price_desc', rarity, search } = req.query;
    
    if (rarity && rarity !== 'all') {
      filteredInventory = filteredInventory.filter(item => item.rarity === rarity);
    }
    
    if (search) {
      const searchLower = search.toLowerCase();
      filteredInventory = filteredInventory.filter(item => 
        item.name.toLowerCase().includes(searchLower)
      );
    }
    
    // Сортировка
    switch(sort) {
      case 'price_desc':
        filteredInventory.sort((a, b) => b.price - a.price);
        break;
      case 'price_asc':
        filteredInventory.sort((a, b) => a.price - b.price);
        break;
      case 'name':
        filteredInventory.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'date':
        filteredInventory.sort((a, b) => new Date(b.acquired) - new Date(a.acquired));
        break;
    }
    
    // Статистика
    const stats = {
      totalItems: filteredInventory.length,
      totalValue: filteredInventory.reduce((sum, item) => sum + (item.price || 0), 0),
      byRarity: {},
      mostExpensive: filteredInventory[0] || null
    };
    
    filteredInventory.forEach(item => {
      if (!stats.byRarity[item.rarity]) {
        stats.byRarity[item.rarity] = 0;
      }
      stats.byRarity[item.rarity]++;
    });
    
    res.json({
      accountId: account.id,
      accountName: account.name,
      inventory: filteredInventory,
      stats,
      pagination: {
        total: filteredInventory.length,
        page: 1,
        limit: 100
      }
    });
  } catch (error) {
    console.error('❌ Ошибка получения инвентаря:', error);
    res.status(500).json({ error: error.message });
  }
});

// Выставить на рынок
app.post('/api/market/list', async (req, res) => {
  try {
    const { accountId, itemId, price, duration = 7 } = req.body;
    
    const db = await readDatabase();
    const account = db.accounts.find(a => a.id === accountId);
    
    if (!account) {
      return res.status(404).json({ error: 'Аккаунт не найден' });
    }
    
    const itemIndex = account.inventory?.findIndex(i => i.id === itemId);
    if (itemIndex === -1) {
      return res.status(404).json({ error: 'Предмет не найден' });
    }
    
    const item = account.inventory[itemIndex];
    
    // Проверяем цену
    if (!price || price <= 0) {
      return res.status(400).json({ error: 'Неверная цена' });
    }
    
    // Удаляем предмет из инвентаря
    account.inventory.splice(itemIndex, 1);
    
    // Создаем листинг
    const listing = {
      id: uuidv4(),
      item,
      price: parseFloat(price),
      listedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + duration * 24 * 60 * 60 * 1000).toISOString(),
      status: 'active',
      duration: parseInt(duration)
    };
    
    if (!account.marketListings) account.marketListings = [];
    account.marketListings.push(listing);
    
    await writeDatabase(db);
    
    // Эмуляция продажи
    const saleTimeout = setTimeout(async () => {
      try {
        const updatedDb = await readDatabase();
        const updatedAccount = updatedDb.accounts.find(a => a.id === accountId);
        if (updatedAccount) {
          const listingIndex = updatedAccount.marketListings?.findIndex(l => l.id === listing.id);
          if (listingIndex !== -1 && updatedAccount.marketListings[listingIndex].status === 'active') {
            // Шанс продажи 85%
            if (Math.random() < 0.85) {
              updatedAccount.marketListings[listingIndex].status = 'sold';
              updatedAccount.marketListings[listingIndex].soldAt = new Date().toISOString();
              updatedAccount.totalProfit = (updatedAccount.totalProfit || 0) + price;
              
              await writeDatabase(updatedDb);
              
              io.emit('item-sold', {
                accountId,
                accountName: updatedAccount.name,
                item,
                price,
                profit: updatedAccount.totalProfit
              });
              
              await addLog(`${updatedAccount.name}: продан ${item.name} за $${price}`, 'success');
            } else {
              // Возвращаем предмет если не продался
              updatedAccount.marketListings[listingIndex].status = 'expired';
              if (!updatedAccount.inventory) updatedAccount.inventory = [];
              updatedAccount.inventory.push(item);
              await writeDatabase(updatedDb);
              
              await addLog(`${updatedAccount.name}: продажа ${item.name} истекла`, 'info');
            }
          }
        }
      } catch (error) {
        console.error('❌ Ошибка в эмуляции продажи:', error);
      }
    }, 10000 + Math.random() * 20000); // Продажа через 10-30 секунд для демо
    
    // Сохраняем timeout для очистки
    listing.saleTimeout = saleTimeout;
    
    await addLog(`${account.name}: выставил ${item.name} за $${price}`, 'info');
    
    res.json({ 
      success: true, 
      listing,
      account,
      message: `"${item.name}" выставлен на продажу за $${price}`
    });
  } catch (error) {
    console.error('❌ Ошибка выставления на рынок:', error);
    await addLog(`Ошибка выставления на рынок: ${error.message}`, 'error');
    res.status(500).json({ error: error.message });
  }
});

// Массовые действия
app.post('/api/bulk-action', async (req, res) => {
  try {
    const { action, accountIds, params = {} } = req.body;
    
    if (!action || !accountIds || !Array.isArray(accountIds)) {
      return res.status(400).json({ error: 'Неверные параметры' });
    }
    
    const db = await readDatabase();
    const results = [];
    const errors = [];
    
    // Задержка между действиями
    const delay = params.delay || 1000;
    
    for (let i = 0; i < accountIds.length; i++) {
      const accountId = accountIds[i];
      
      try {
        const account = db.accounts.find(a => a.id === accountId);
        if (!account) {
          errors.push({ accountId, error: 'Не найден' });
          continue;
        }
        
        let result;
        
        switch(action) {
          case 'start':
            if (!steamEmu.activeSessions.has(accountId)) {
              account.status = 'online';
              await steamEmu.startAccount(accountId, account);
              result = { success: true, message: 'Запущен' };
            } else {
              result = { success: false, message: 'Уже запущен' };
            }
            break;
            
          case 'stop':
            account.status = 'offline';
            account.farming = false;
            steamEmu.stopAccount(accountId);
            result = { success: true, message: 'Остановлен' };
            break;
            
          case 'farm':
            if (steamEmu.activeSessions.has(accountId) && !steamEmu.farmingJobs.has(accountId)) {
              await steamEmu.startFarming(accountId, account.game);
              account.farming = true;
              account.status = 'farming';
              result = { success: true, message: 'Фарминг запущен' };
            } else {
              result = { success: false, message: 'Не удалось запустить фарминг' };
            }
            break;
            
          case 'stop-farming':
            if (steamEmu.farmingJobs.has(accountId)) {
              steamEmu.stopFarming(accountId);
              account.farming = false;
              account.status = 'online';
              result = { success: true, message: 'Фарминг остановлен' };
            } else {
              result = { success: false, message: 'Фарминг не был запущен' };
            }
            break;
            
          case 'claim-drops':
            if (account.hasNewDrop) {
              const drop = steamEmu.generateDrop(account.game);
              account.hasNewDrop = false;
              account.totalProfit += drop.price;
              account.totalDrops += 1;
              result = { success: true, message: 'Дроп получен', drop };
            } else {
              result = { success: false, message: 'Нет доступных дропов' };
            }
            break;
            
          case 'rotate-proxy':
            if (steamEmu.activeSessions.has(accountId)) {
              const newProxy = steamEmu.rotateProxy(accountId);
              account.proxy = newProxy;
              result = { success: true, message: 'Прокси изменен', proxy: newProxy };
            } else {
              result = { success: false, message: 'Аккаунт должен быть онлайн' };
            }
            break;
            
          default:
            result = { success: false, message: 'Неизвестное действие' };
        }
        
        results.push({ accountId, ...result });
        
        // Обновляем аккаунт в реальном времени
        io.emit('account-updated', {
          id: account.id,
          status: account.status,
          farming: account.farming,
          hasNewDrop: account.hasNewDrop
        });
        
        // Задержка между аккаунтами
        if (i < accountIds.length - 1) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
      } catch (error) {
        errors.push({ accountId, error: error.message });
        console.error(`❌ Ошибка для аккаунта ${accountId}:`, error);
      }
    }
    
    // Сохраняем изменения в БД
    await writeDatabase(db);
    
    await addLog(`Массовое действие "${action}" выполнено (успешно: ${results.filter(r => r.success).length}, ошибок: ${errors.length})`, 'info');
    
    res.json({ 
      success: true, 
      action,
      total: accountIds.length,
      successful: results.filter(r => r.success).length,
      failed: errors.length,
      results,
      errors 
    });
  } catch (error) {
    console.error('❌ Ошибка массового действия:', error);
    await addLog(`Ошибка массового действия: ${error.message}`, 'error');
    res.status(500).json({ error: error.message });
  }
});

// Получить логи
app.get('/api/logs', async (req, res) => {
  try {
    const db = await readDatabase();
    const { limit = 50, type } = req.query;
    
    let logs = db.logs || [];
    
    if (type && type !== 'all') {
      logs = logs.filter(log => log.type === type);
    }
    
    logs = logs.slice(0, parseInt(limit));
    
    res.json({
      logs,
      total: db.logs?.length || 0,
      types: ['all', 'info', 'success', 'warning', 'error']
    });
  } catch (error) {
    console.error('❌ Ошибка получения логов:', error);
    res.status(500).json({ error: error.message });
  }
});

// Очистить логи
app.delete('/api/logs', async (req, res) => {
  try {
    const db = await readDatabase();
    db.logs = [];
    await writeDatabase(db);
    
    await addLog('Логи очищены', 'info');
    
    res.json({ success: true, message: 'Логи очищены' });
  } catch (error) {
    console.error('❌ Ошибка очистки логов:', error);
    res.status(500).json({ error: error.message });
  }
});

// Настройки системы
app.get('/api/settings', async (req, res) => {
  try {
    const db = await readDatabase();
    res.json(db.settings || {});
  } catch (error) {
    console.error('❌ Ошибка получения настроек:', error);
    res.status(500).json({ error: error.message });
  }
});

// Сохранить настройки
app.put('/api/settings', async (req, res) => {
  try {
    const settings = req.body;
    const db = await readDatabase();
    
    db.settings = {
      ...db.settings,
      ...settings,
      updatedAt: new Date().toISOString()
    };
    
    await writeDatabase(db);
    
    await addLog('Настройки системы обновлены', 'info');
    
    res.json({ success: true, settings: db.settings });
  } catch (error) {
    console.error('❌ Ошибка сохранения настроек:', error);
    res.status(500).json({ error: error.message });
  }
});

// Бэкап данных
app.post('/api/backup', async (req, res) => {
  try {
    const db = await readDatabase();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(BACKUP_DIR, `manual_backup_${timestamp}.json`);
    
    await fs.writeFile(backupFile, JSON.stringify(db, null, 2));
    
    // Добавляем запись о бэкапе
    if (!db.backups) db.backups = [];
    db.backups.push({
      id: uuidv4(),
      file: backupFile,
      size: (JSON.stringify(db).length / 1024).toFixed(2) + 'KB',
      createdAt: new Date().toISOString(),
      type: 'manual'
    });
    
    await writeDatabase(db);
    
    await addLog('Ручной бэкап создан', 'success');
    
    res.json({ 
      success: true, 
      backup: {
        file: backupFile,
        size: db.backups[db.backups.length - 1].size,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('❌ Ошибка создания бэкапа:', error);
    res.status(500).json({ error: error.message });
  }
});

// Проверка безопасности
app.get('/api/security/scan', async (req, res) => {
  try {
    const db = await readDatabase();
    const warnings = [];
    
    // Проверяем аккаунты
    db.accounts.forEach(account => {
      if (account.isolation === 'low' || account.isolation === 'medium') {
        warnings.push({
          type: 'security',
          level: 'warning',
          message: `Аккаунт "${account.name}" имеет низкий уровень изоляции`,
          accountId: account.id
        });
      }
      
      if (!account.proxy) {
        warnings.push({
          type: 'security',
          level: 'critical',
          message: `Аккаунт "${account.name}" не использует прокси`,
          accountId: account.id
        });
      }
      
      if (account.farmingHours > 20) {
        warnings.push({
          type: 'farming',
          level: 'warning',
          message: `Аккаунт "${account.name}" фармит более 20 часов без перерыва`,
          accountId: account.id
        });
      }
    });
    
    // Обновляем статус безопасности
    db.security = {
      lastScan: new Date().toISOString(),
      threats: warnings.filter(w => w.level === 'critical').length,
      warnings: warnings,
      score: 100 - (warnings.length * 5) // Простая оценка безопасности
    };
    
    await writeDatabase(db);
    
    res.json({
      success: true,
      scan: {
        timestamp: db.security.lastScan,
        threats: db.security.threats,
        warnings: db.security.warnings.length,
        score: db.security.score,
        details: db.security.warnings
      }
    });
  } catch (error) {
    console.error('❌ Ошибка сканирования безопасности:', error);
    res.status(500).json({ error: error.message });
  }
});

// ================== WebSocket ==================
io.on('connection', (socket) => {
  console.log('🔗 Новое WebSocket подключение:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('❌ WebSocket отключен:', socket.id);
  });
  
  // Приветственное сообщение
  socket.emit('welcome', {
    message: 'Добро пожаловать в Steam Manager PRO v2.1',
    version: '2.1.0',
    serverTime: new Date().toISOString(),
    features: ['realtime-updates', 'notifications', 'farming-control', 'market-integration']
  });
  
  // Отправляем начальные данные
  socket.on('get-initial-data', async () => {
    try {
      const db = await readDatabase();
      
      socket.emit('initial-data', {
        accounts: db.accounts,
        settings: db.settings,
        logs: (db.logs || []).slice(0, 20),
        stats: {
          totalAccounts: db.accounts.length,
          onlineAccounts: steamEmu.activeSessions.size,
          farmingAccounts: steamEmu.farmingJobs.size,
          totalProfit: db.accounts.reduce((sum, acc) => sum + (acc.totalProfit || 0), 0),
          totalDrops: db.accounts.reduce((sum, acc) => sum + (acc.totalDrops || 0), 0)
        }
      });
    } catch (error) {
      console.error('❌ Ошибка отправки начальных данных:', error);
    }
  });
  
  // Подписка на обновления аккаунта
  socket.on('subscribe-account', (accountId) => {
    socket.join(`account:${accountId}`);
    console.log(`📡 Подписка на аккаунт ${accountId}`);
  });
  
  // Отписка от аккаунта
  socket.on('unsubscribe-account', (accountId) => {
    socket.leave(`account:${accountId}`);
    console.log(`📡 Отписка от аккаунта ${accountId}`);
  });
  
  // Статистика в реальном времени
  setInterval(() => {
    socket.emit('realtime-stats', {
      activeSessions: steamEmu.activeSessions.size,
      farmingJobs: steamEmu.farmingJobs.size,
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
      },
      uptime: process.uptime(),
      timestamp: Date.now()
    });
  }, 5000);
});

// ================== РОУТЫ ФРОНТЕНДА ==================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/telegram', (req, res) => {
  res.sendFile(path.join(__dirname, 'telegram-app.html'));
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime() 
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Маршрут не найден' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('❌ Глобальная ошибка:', err);
  addLog(`Глобальная ошибка: ${err.message}`, 'error');
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

// ================== ЗАПУСК СЕРВЕРА ==================
const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    // Инициализируем базу данных
    await initDatabase();
    
    // Загружаем начальные данные
    const db = await readDatabase();
    console.log('📊 Загружено аккаунтов:', db.accounts.length);
    
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`
      🚀 =========================================
      🎮 STEAM MANAGER PRO v2.1
      🌐 Сервер запущен: http://localhost:${PORT}
      📱 Telegram Web App: http://localhost:${PORT}/telegram
      🔧 Режим: Эмуляция Steam + WebSocket
      ⚡ Все функции активны
      🚀 =========================================
      `);
      
      addLog(`Сервер запущен на порту ${PORT}`, 'success');
    });
    
    // Автосохранение каждые 5 минут
    setInterval(async () => {
      try {
        const db = await readDatabase();
        if (db.settings?.autoSave !== false) {
          await writeDatabase(db);
          console.log('💾 Автосохранение выполнено');
        }
      } catch (error) {
        console.error('❌ Ошибка автосохранения:', error);
      }
    }, 5 * 60 * 1000);
    
  } catch (error) {
    console.error('❌ Ошибка запуска сервера:', error);
    process.exit(1);
  }
}

// Обработка завершения
process.on('SIGTERM', async () => {
  console.log('🔻 Получен SIGTERM, завершаем работу...');
  
  // Останавливаем все сессии
  steamEmu.activeSessions.forEach((session, accountId) => {
    steamEmu.stopAccount(accountId);
  });
  
  // Сохраняем данные
  try {
    const db = await readDatabase();
    await writeDatabase(db);
  } catch (error) {
    console.error('❌ Ошибка сохранения при завершении:', error);
  }
  
  // Закрываем сервер
  server.close(() => {
    console.log('✅ Сервер остановлен');
    process.exit(0);
  });
  
  // Форсированное завершение через 10 секунд
  setTimeout(() => {
    console.error('❌ Принудительное завершение');
    process.exit(1);
  }, 10000);
});

process.on('SIGINT', () => {
  console.log('🔻 Получен SIGINT, завершаем работу...');
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Необработанное исключение:', error);
  addLog(`Критическая ошибка: ${error.message}`, 'error');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Необработанный промис:', promise, 'причина:', reason);
  addLog(`Необработанный промис: ${reason}`, 'error');
});

// Запускаем сервер
startServer();
