// ===== КОНСТАНТЫ И КОНФИГУРАЦИЯ =====
const CONFIG = {
  API_URL: '/api',
  VERSION: '2.1.0',
  AUTO_SAVE_INTERVAL: 30000,
  UPDATE_INTERVAL: 5000,
  MAX_LOGS: 100,
  MAX_ITEMS: 1000
};

// ===== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ =====
let accounts = [];
let selectedAccounts = new Set();
let currentPage = 1;
let pageSize = 25;
let totalPages = 1;
let currentDropAccountId = null;
let isLogsPaused = false;
let logs = [];
let socket = null;
let updateInterval = null;
let currentPageView = 'accounts';
let isInitialized = false;
let dataManager = null;

// ===== ЦВЕТА ДЛЯ АВАТАРОВ =====
const AVATAR_COLORS = [
  '#00adee', '#00ff88', '#ffaa00', '#ff5555', '#aa55ff',
  '#ff55dd', '#55aaff', '#55ffaa', '#aaff55', '#ffaa55'
];

// ===== КЛАСС МЕНЕДЖЕРА ДАННЫХ =====
class DataManager {
  constructor() {
    this.localStorageKey = 'steam-manager-data-v2';
    this.settingsKey = 'steam-manager-settings';
    this.backupKey = 'steam-manager-backup';
  }

  saveData() {
    try {
      const data = {
        accounts: accounts.map(acc => ({
          id: acc.id,
          name: acc.name,
          login: acc.login,
          status: acc.status,
          game: acc.game,
          country: acc.country,
          farming: acc.farming,
          hasNewDrop: acc.hasNewDrop,
          totalProfit: acc.totalProfit,
          totalDrops: acc.totalDrops,
          inventory: acc.inventory || [],
          marketListings: acc.marketListings || [],
          farmingHours: acc.farmingHours,
          uptime: acc.uptime,
          proxy: acc.proxy,
          isolation: acc.isolation,
          createdAt: acc.createdAt,
          lastActivity: acc.lastActivity
        })),
        selectedAccounts: Array.from(selectedAccounts),
        uiState: {
          currentPage,
          pageSize,
          currentPageView,
          lastUpdated: Date.now()
        },
        version: CONFIG.VERSION,
        timestamp: Date.now()
      };
      
      localStorage.setItem(this.localStorageKey, JSON.stringify(data));
      console.log('💾 Данные сохранены в localStorage');
      return true;
    } catch (error) {
      console.error('❌ Ошибка сохранения данных:', error);
      this.showNotification('Ошибка сохранения данных', 'error');
      return false;
    }
  }

  loadData() {
    try {
      const saved = localStorage.getItem(this.localStorageKey);
      if (saved) {
        const data = JSON.parse(saved);
        
        if (data.version === CONFIG.VERSION) {
          accounts = data.accounts || [];
          selectedAccounts = new Set(data.selectedAccounts || []);
          
          // Восстанавливаем UI состояние
          if (data.uiState) {
            currentPage = data.uiState.currentPage || 1;
            pageSize = data.uiState.pageSize || 25;
            currentPageView = data.uiState.currentPageView || 'accounts';
          }
          
          console.log('📂 Данные загружены из localStorage:', accounts.length, 'аккаунтов');
          return true;
        } else {
          console.warn('⚠️ Версия данных не совпадает, загружаем демо данные');
          return false;
        }
      }
    } catch (error) {
      console.error('❌ Ошибка загрузки данных:', error);
    }
    return false;
  }

  exportData(format = 'json') {
    const data = {
      accounts: accounts.map(acc => ({
        name: acc.name,
        login: acc.login,
        game: acc.game,
        country: acc.country,
        status: acc.status,
        farming: acc.farming,
        totalProfit: acc.totalProfit,
        totalDrops: acc.totalDrops,
        farmingHours: acc.farmingHours,
        inventory: (acc.inventory || []).map(item => ({
          name: item.name,
          price: item.price,
          rarity: item.rarity,
          acquired: item.acquired
        })),
        marketListings: (acc.marketListings || []).map(listing => ({
          item: listing.item?.name,
          price: listing.price,
          status: listing.status
        }))
      })),
      statistics: {
        totalAccounts: accounts.length,
        onlineAccounts: accounts.filter(a => a.status !== 'offline').length,
        farmingAccounts: accounts.filter(a => a.farming).length,
        totalProfit: accounts.reduce((sum, acc) => sum + (acc.totalProfit || 0), 0),
        totalDrops: accounts.reduce((sum, acc) => sum + (acc.totalDrops || 0), 0),
        totalInventoryValue: accounts.reduce((sum, acc) => {
          return sum + (acc.inventory || []).reduce((itemSum, item) => itemSum + (item.price || 0), 0);
        }, 0)
      },
      exportDate: new Date().toISOString(),
      version: CONFIG.VERSION,
      exportFormat: format
    };
    
    if (format === 'json') {
      return JSON.stringify(data, null, 2);
    } else if (format === 'csv') {
      return this.convertToCSV(data);
    }
    
    return JSON.stringify(data, null, 2);
  }

  convertToCSV(data) {
    let csv = 'Аккаунт,Логин,Игра,Статус,Фарминг,Прибыль,Дропы,Часы\n';
    
    data.accounts.forEach(account => {
      csv += `"${account.name}","${account.login}","${account.game}","${account.status}","${account.farming ? 'Да' : 'Нет'}","${account.totalProfit}","${account.totalDrops}","${account.farmingHours}"\n`;
    });
    
    return csv;
  }

  clearData() {
    try {
      localStorage.removeItem(this.localStorageKey);
      accounts = [];
      selectedAccounts.clear();
      console.log('🧹 Все данные очищены');
      return true;
    } catch (error) {
      console.error('❌ Ошибка очистки данных:', error);
      return false;
    }
  }

  createBackup() {
    try {
      const backup = {
        data: this.exportData(),
        timestamp: Date.now(),
        version: CONFIG.VERSION,
        accountsCount: accounts.length
      };
      
      const backupKey = `${this.backupKey}-${Date.now()}`;
      localStorage.setItem(backupKey, JSON.stringify(backup));
      
      // Удаляем старые бэкапы (оставляем последние 5)
      const backups = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith(this.backupKey)) {
          backups.push(key);
        }
      }
      
      backups.sort().reverse();
      if (backups.length > 5) {
        for (let i = 5; i < backups.length; i++) {
          localStorage.removeItem(backups[i]);
        }
      }
      
      console.log('💾 Бэкап создан');
      return backup;
    } catch (error) {
      console.error('❌ Ошибка создания бэкапа:', error);
      return null;
    }
  }

  showNotification(message, type = 'info') {
    const container = document.getElementById('notifications');
    if (!container) return null;
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
      <i class="fas ${this.getNotificationIcon(type)}"></i>
      <span>${message}</span>
      <button class="notification-close">&times;</button>
    `;
    
    container.appendChild(notification);
    
    // Анимация появления
    setTimeout(() => notification.classList.add('show'), 10);
    
    // Автоматическое скрытие
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    }, 5000);
    
    // Закрытие по клику
    notification.querySelector('.notification-close').addEventListener('click', () => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    });
    
    return notification;
  }

  getNotificationIcon(type) {
    const icons = {
      'info': 'fa-info-circle',
      'success': 'fa-check-circle',
      'warning': 'fa-exclamation-triangle',
      'error': 'fa-exclamation-circle'
    };
    return icons[type] || 'fa-info-circle';
  }
}

// ===== ОСНОВНОЙ КЛАСС STEAM MANAGER =====
class SteamManager {
  constructor() {
    this.dataManager = new DataManager();
    this.socket = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.autoSaveInterval = null;
    this.updateStatsInterval = null;
    this.realtimeStats = {
      activeSessions: 0,
      farmingJobs: 0,
      memoryUsed: 0,
      uptime: 0
    };
  }

  async init() {
    console.log('🚀 Инициализация Steam Manager PRO...');
    
    // Загружаем сохраненные данные
    if (!this.dataManager.loadData()) {
      await this.loadDemoData();
    }
    
    // Инициализируем WebSocket
    await this.initWebSocket();
    
    // Настраиваем обработчики событий
    this.initEventListeners();
    this.setupPageNavigation();
    
    // Показываем начальную страницу
    this.showPage('accounts');
    
    // Запускаем автообновления
    this.startAutoUpdates();
    this.startAutoSave();
    
    // Загружаем начальные данные с сервера
    await this.loadInitialData();
    
    // Добавляем начальный лог
    this.addLog('✅ Система Steam Manager PRO полностью загружена', 'success');
    
    isInitialized = true;
    console.log('🎮 Steam Manager PRO готов к работе!');
  }

  async initWebSocket() {
    try {
      this.socket = io({
        reconnection: true,
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000
      });
      
      this.socket.on('connect', () => {
        console.log('✅ Подключено к серверу через WebSocket');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.addLog('Подключено к серверу', 'success');
        
        // Запрашиваем начальные данные
        this.socket.emit('get-initial-data');
      });
      
      this.socket.on('disconnect', (reason) => {
        console.log('❌ Отключено от сервера:', reason);
        this.isConnected = false;
        this.addLog('Отключено от сервера', 'warning');
        
        // Пытаемся переподключиться
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
          console.log(`🔄 Попытка переподключения ${this.reconnectAttempts} через ${delay}мс`);
          
          setTimeout(() => {
            if (!this.isConnected) {
              this.socket.connect();
            }
          }, delay);
        }
      });
      
      this.socket.on('connect_error', (error) => {
        console.error('❌ Ошибка подключения WebSocket:', error);
        this.isConnected = false;
      });
      
      this.socket.on('welcome', (data) => {
        console.log('👋 Приветственное сообщение:', data);
      });
      
      this.socket.on('initial-data', (data) => {
        console.log('📦 Получены начальные данные с сервера');
        if (data.accounts && data.accounts.length > 0) {
          // Объединяем данные с сервера с локальными
          this.mergeAccounts(data.accounts);
        }
        this.updateAll();
      });
      
      this.socket.on('system-log', (log) => {
        this.addLog(log.message, log.type);
      });
      
      this.socket.on('account-updated', (data) => {
        this.updateAccountFromServer(data);
      });
      
      this.socket.on('new-drop', (data) => {
        this.handleNewDrop(data);
      });
      
      this.socket.on('drop-claimed', (data) => {
        this.handleDropClaimed(data);
      });
      
      this.socket.on('item-sold', (data) => {
        this.handleItemSold(data);
      });
      
      this.socket.on('realtime-stats', (stats) => {
        this.realtimeStats = stats;
        this.updateRealtimeStats();
      });
      
      this.socket.on('account-status', (data) => {
        this.updateAccountStatus(data);
      });
      
      this.socket.on('proxy-rotated', (data) => {
        this.handleProxyRotated(data);
      });
      
    } catch (error) {
      console.error('❌ Ошибка инициализации WebSocket:', error);
      this.addLog('Не удалось подключиться к серверу', 'error');
    }
  }

  mergeAccounts(serverAccounts) {
    // Создаем карту существующих аккаунтов по ID
    const existingAccounts = new Map();
    accounts.forEach(acc => existingAccounts.set(acc.id, acc));
    
    // Объединяем данные
    serverAccounts.forEach(serverAcc => {
      const existing = existingAccounts.get(serverAcc.id);
      if (existing) {
        // Обновляем существующий аккаунт
        Object.assign(existing, {
          status: serverAcc.status || existing.status,
          farming: serverAcc.farming || existing.farming,
          hasNewDrop: serverAcc.hasNewDrop || existing.hasNewDrop,
          totalProfit: serverAcc.totalProfit || existing.totalProfit,
          totalDrops: serverAcc.totalDrops || existing.totalDrops,
          inventory: serverAcc.inventory || existing.inventory,
          marketListings: serverAcc.marketListings || existing.marketListings,
          farmingHours: serverAcc.farmingHours || existing.farmingHours,
          uptime: serverAcc.uptime || existing.uptime,
          proxy: serverAcc.proxy || existing.proxy,
          lastActivity: serverAcc.lastActivity || existing.lastActivity
        });
      } else {
        // Добавляем новый аккаунт
        accounts.push(serverAcc);
      }
    });
    
    console.log('🔄 Аккаунты объединены с серверными данными');
  }

  updateAccountFromServer(data) {
    const account = accounts.find(a => a.id === data.id);
    if (account) {
      Object.assign(account, {
        status: data.status || account.status,
        farming: data.farming !== undefined ? data.farming : account.farming,
        hasNewDrop: data.hasNewDrop !== undefined ? data.hasNewDrop : account.hasNewDrop,
        currentGame: data.currentGame || account.currentGame
      });
      
      this.updateAll();
      
      if (data.status === 'farming' && !account.farming) {
        this.dataManager.showNotification(`🌱 Фарминг запущен на "${account.name}"`, 'success');
      }
    }
  }

  updateAccountStatus(data) {
    const account = accounts.find(a => a.id === data.accountId);
    if (account) {
      account.status = data.status;
      account.sessionId = data.sessionId;
      account.proxy = data.proxy || account.proxy;
      this.updateAll();
    }
  }

  handleNewDrop(data) {
    const account = accounts.find(a => a.id === data.accountId);
    if (account) {
      account.hasNewDrop = true;
      account.lastDrop = data.drop;
      this.updateAll();
      
      this.dataManager.showNotification(`🎁 Новый дроп на "${account.name}": ${data.drop.name}`, 'success');
      this.addLog(`Новый дроп доступен на "${account.name}": ${data.drop.name} ($${data.drop.price})`, 'info');
    }
  }

  handleDropClaimed(data) {
    const account = accounts.find(a => a.id === data.accountId);
    if (account) {
      account.totalProfit = data.totalProfit;
      this.updateAll();
      
      this.dataManager.showNotification(`💰 Дроп получен на "${account.name}": +$${data.drop.price}`, 'success');
    }
  }

  handleItemSold(data) {
    const account = accounts.find(a => a.id === data.accountId);
    if (account) {
      account.totalProfit = data.profit;
      
      // Обновляем статус листинга
      if (account.marketListings) {
        const listing = account.marketListings.find(l => l.item?.id === data.item?.id);
        if (listing) {
          listing.status = 'sold';
          listing.soldAt = new Date().toISOString();
        }
      }
      
      this.updateAll();
      
      this.dataManager.showNotification(`💰 Продано: "${data.item.name}" за $${data.price}`, 'success');
      this.addLog(`Продажа: "${data.item.name}" за $${data.price} на аккаунте "${account.name}"`, 'success');
    }
  }

  handleProxyRotated(data) {
    const account = accounts.find(a => a.id === data.accountId);
    if (account) {
      account.proxy = data.newProxy;
      this.updateAll();
      
      this.addLog(`Прокси изменен для "${account.name}": ${data.oldProxy.ip} → ${data.newProxy.ip}`, 'info');
    }
  }

  updateRealtimeStats() {
    // Обновляем показатели в сайдбаре
    const memoryElement = document.getElementById('memory-usage');
    if (memoryElement) {
      const usage = Math.round((this.realtimeStats.memory.used / this.realtimeStats.memory.total) * 100);
      memoryElement.textContent = `${usage}%`;
      memoryElement.style.color = usage > 80 ? '#ff5555' : usage > 60 ? '#ffaa00' : '#00ff88';
    }
    
    const networkElement = document.getElementById('network-status');
    if (networkElement) {
      networkElement.textContent = this.isConnected ? 'Стабильная' : 'Отключена';
      networkElement.style.color = this.isConnected ? '#00ff88' : '#ff5555';
    }
    
    const botsElement = document.getElementById('bots-active');
    if (botsElement) {
      const online = accounts.filter(a => a.status !== 'offline').length;
      botsElement.textContent = `${online}/${accounts.length}`;
      botsElement.style.color = online === 0 ? '#ff5555' : online === accounts.length ? '#00ff88' : '#ffaa00';
    }
  }

  async loadInitialData() {
    try {
      const response = await fetch('/api/status');
      if (response.ok) {
        const data = await response.json();
        console.log('📊 Статус сервера:', data);
        
        // Обновляем статистику
        this.updateServerStats(data);
      }
    } catch (error) {
      console.warn('⚠️ Не удалось загрузить статус сервера:', error);
    }
    
    try {
      const response = await fetch('/api/accounts');
      if (response.ok) {
        const serverAccounts = await response.json();
        if (serverAccounts.length > 0) {
          this.mergeAccounts(serverAccounts);
          this.updateAll();
        }
      }
    } catch (error) {
      console.warn('⚠️ Не удалось загрузить аккаунты с сервера:', error);
    }
  }

  updateServerStats(data) {
    // Можно использовать данные для отображения статистики сервера
    console.log('📈 Статистика сервера:', data);
  }

  // ===== НАВИГАЦИЯ ПО СТРАНИЦАМ =====
  setupPageNavigation() {
    const menuLinks = document.querySelectorAll('.menu a');
    menuLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const page = link.dataset.page;
        if (page) {
          this.showPage(page);
          menuLinks.forEach(l => l.classList.remove('active'));
          link.classList.add('active');
        }
      });
    });
  }

  showPage(pageName) {
    currentPageView = pageName;
    
    // Обновляем заголовок
    const header = document.querySelector('.header h1');
    if (header) {
      const icon = this.getPageIcon(pageName);
      const titles = {
        'accounts': 'Управление аккаунтами',
        'farming': 'Фарминг',
        'trading': 'Торговая площадка',
        'drops': 'Дропы',
        'settings': 'Настройки системы',
        'security': 'Безопасность'
      };
      header.innerHTML = `<i class="fas fa-${icon}"></i> ${titles[pageName] || 'Управление'}`;
    }
    
    // Скрываем все страницы
    document.querySelectorAll('.page-section').forEach(section => {
      section.style.display = 'none';
    });
    
    // Показываем нужную страницу
    let sectionId = `${pageName}-section`;
    let section = document.getElementById(sectionId);
    
    if (!section) {
      section = this.createPageSection(pageName);
    }
    
    if (section) {
      section.style.display = 'block';
      this.updatePageContent(pageName);
    }
  }

  getPageIcon(pageName) {
    const icons = {
      'accounts': 'users',
      'farming': 'seedling',
      'trading': 'store',
      'drops': 'gift',
      'settings': 'cog',
      'security': 'shield-alt'
    };
    return icons[pageName] || 'cog';
  }

  createPageSection(pageName) {
    const mainContent = document.querySelector('.main-content');
    if (!mainContent) return null;

    // Удаляем старую секцию если есть
    const oldSection = document.getElementById(`${pageName}-section`);
    if (oldSection) oldSection.remove();

    // Создаем новую секцию
    const section = document.createElement('div');
    section.id = `${pageName}-section`;
    section.className = 'page-section';
    
    // Добавляем HTML контент
    const html = this.getPageHTML(pageName);
    section.innerHTML = html;
    
    // Вставляем перед логами
    const logsSection = document.querySelector('.logs-section');
    if (logsSection) {
      mainContent.insertBefore(section, logsSection);
    } else {
      mainContent.appendChild(section);
    }
    
    // Инициализируем обработчики для новой страницы
    this.initPageEventListeners(pageName);
    
    return section;
  }

  getPageHTML(pageName) {
    switch(pageName) {
      case 'accounts': return this.getAccountsPageHTML();
      case 'farming': return this.getFarmingPageHTML();
      case 'trading': return this.getTradingPageHTML();
      case 'drops': return this.getDropsPageHTML();
      case 'settings': return this.getSettingsPageHTML();
      case 'security': return this.getSecurityPageHTML();
      default: return '<div class="empty-state"><h3>Страница в разработке</h3></div>';
    }
  }

  // ===== HTML ДЛЯ СТРАНИЦ =====
  getAccountsPageHTML() {
    const filteredAccounts = this.getFilteredAccounts();
    const totalAccounts = accounts.length;
    const farmingAccounts = accounts.filter(a => a.farming).length;
    const dropsAvailable = accounts.filter(a => a.hasNewDrop).length;
    const risk = this.calculateRiskLevel();
    
    return `
      <div class="stats-grid">
        <div class="stat-card blue">
          <i class="fas fa-user-friends"></i>
          <div>
            <h3>Всего аккаунтов</h3>
            <p class="stat-value" id="total-accounts">${totalAccounts}</p>
          </div>
        </div>
        <div class="stat-card green">
          <i class="fas fa-seedling"></i>
          <div>
            <h3>Активно фармят</h3>
            <p class="stat-value" id="farming-now">${farmingAccounts}</p>
          </div>
        </div>
        <div class="stat-card orange">
          <i class="fas fa-gift"></i>
          <div>
            <h3>Дропы доступны</h3>
            <p class="stat-value" id="drops-available">${dropsAvailable}</p>
          </div>
        </div>
        <div class="stat-card red">
          <i class="fas fa-shield-alt"></i>
          <div>
            <h3>Уровень риска</h3>
            <p class="stat-value" id="ban-risk">${risk.level}</p>
          </div>
        </div>
      </div>

      <div class="action-bar">
        <div class="filters">
          <select id="status-filter">
            <option value="all">Все статусы</option>
            <option value="online">Online</option>
            <option value="farming">Фарминг</option>
            <option value="offline">Offline</option>
            <option value="error">Ошибка</option>
          </select>
          <select id="country-filter">
            <option value="all">Все страны</option>
            <option value="ru">🇷🇺 Россия</option>
            <option value="us">🇺🇸 США</option>
            <option value="eu">🇪🇺 Европа</option>
            <option value="other">Другие</option>
          </select>
          <select id="game-filter">
            <option value="all">Все игры</option>
            <option value="CS2">CS2</option>
            <option value="CS:GO">CS:GO</option>
            <option value="Dota 2">Dota 2</option>
            <option value="TF2">Team Fortress 2</option>
          </select>
        </div>
        <div class="bulk-controls">
          <button class="btn btn-small" id="select-all">
            <i class="fas fa-check-square"></i> Выбрать все
          </button>
          <button class="btn btn-small btn-success" id="start-selected">
            <i class="fas fa-play"></i> Запустить выбранные
          </button>
          <button class="btn btn-small btn-danger" id="stop-selected">
            <i class="fas fa-stop"></i> Остановить выбранные
          </button>
        </div>
      </div>

      <div class="accounts-table-container">
        <div class="section-header">
          <h2><i class="fas fa-list"></i> Список аккаунтов (<span id="filtered-count">${filteredAccounts.length}</span>)</h2>
          <div class="section-actions">
            <button class="btn btn-small" id="refresh-list">
              <i class="fas fa-sync-alt"></i> Обновить
            </button>
            <button class="btn btn-small btn-info" id="check-drops">
              <i class="fas fa-gift"></i> Проверить дропы
            </button>
            <button class="btn btn-small btn-warning" id="open-marketplace">
              <i class="fas fa-store"></i> Торговая площадка
            </button>
          </div>
        </div>

        <div class="accounts-table">
          <div class="table-header">
            <div class="col-checkbox"><input type="checkbox" id="select-all-checkbox"></div>
            <div class="col-account">Аккаунт</div>
            <div class="col-status">Статус</div>
            <div class="col-proxy">Прокси/IP</div>
            <div class="col-game">Игра / Дроп</div>
            <div class="col-uptime">Время работы</div>
            <div class="col-actions">Действия</div>
          </div>
          
          <div class="table-body" id="accounts-list-container">
            ${this.getAccountsListHTML(filteredAccounts)}
          </div>
        </div>

        <div class="pagination">
          <button class="pagination-btn" id="prev-page" ${currentPage <= 1 ? 'disabled' : ''}>
            <i class="fas fa-chevron-left"></i> Назад
          </button>
          <span class="page-info">Страница <span id="current-page">${currentPage}</span> из <span id="total-pages">${totalPages}</span></span>
          <button class="pagination-btn" id="next-page" ${currentPage >= totalPages ? 'disabled' : ''}>
            Вперед <i class="fas fa-chevron-right"></i>
          </button>
          <select id="page-size">
            <option value="10" ${pageSize === 10 ? 'selected' : ''}>10 на странице</option>
            <option value="25" ${pageSize === 25 ? 'selected' : ''}>25 на странице</option>
            <option value="50" ${pageSize === 50 ? 'selected' : ''}>50 на странице</option>
            <option value="100" ${pageSize === 100 ? 'selected' : ''}>100 на странице</option>
          </select>
        </div>
      </div>
    `;
  }

  getAccountsListHTML(filteredAccounts = []) {
    if (filteredAccounts.length === 0 && accounts.length === 0) {
      return `
        <div class="empty-state">
          <i class="fas fa-user-plus fa-3x"></i>
          <h3>Нет добавленных аккаунтов</h3>
          <p>Добавьте свой первый аккаунт Steam для начала работы</p>
          <button class="btn btn-primary" onclick="steamManager.showAddAccountModal()">
            <i class="fas fa-plus"></i> Добавить первый аккаунт
          </button>
        </div>
      `;
    }

    if (filteredAccounts.length === 0) {
      return `
        <div class="empty-state">
          <i class="fas fa-search fa-3x"></i>
          <h3>Аккаунты не найдены</h3>
          <p>Попробуйте изменить параметры фильтрации</p>
        </div>
      `;
    }

    // Пагинация
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedAccounts = filteredAccounts.slice(startIndex, endIndex);
    totalPages = Math.ceil(filteredAccounts.length / pageSize);

    return paginatedAccounts.map(account => this.createAccountCardHTML(account)).join('');
  }

  createAccountCardHTML(account) {
    const isSelected = selectedAccounts.has(account.id);
    const statusClass = this.getStatusClass(account.status);
    const statusText = this.getStatusText(account.status);
    
    return `
      <div class="account-card ${isSelected ? 'selected' : ''}" data-account-id="${account.id}">
        <div class="col-checkbox">
          <input type="checkbox" class="account-checkbox" data-account-id="${account.id}" 
                 ${isSelected ? 'checked' : ''} 
                 onchange="steamManager.toggleAccountSelection('${account.id}', this.checked)">
        </div>
        <div class="col-account">
          <div class="account-info">
            <div class="avatar" style="background: ${this.getAvatarColor(account.id)};">
              ${account.name.charAt(0).toUpperCase()}
            </div>
            <div class="account-name">
              <h4>${account.name}</h4>
              <span>${account.login}</span>
              <div class="account-meta">
                <i class="fas fa-globe-americas"></i> ${this.getCountryFlag(account.country)} ${this.getCountryName(account.country)}
              </div>
            </div>
          </div>
        </div>
        <div class="col-status">
          <span class="status-badge ${statusClass}">
            ${statusText}
          </span>
          <div class="uptime">${account.uptime || '0ч 0м'}</div>
        </div>
        <div class="col-proxy">
          <div class="proxy-info">
            ${account.proxy?.ip || 'Нет прокси'}
          </div>
          <div class="proxy-details">
            <small>${account.proxy?.city || 'Локация неизвестна'}</small>
          </div>
        </div>
        <div class="col-game">
          <div class="game-info">
            <div class="game-icon ${this.getGameClass(account.game)}">
              <i class="${this.getGameIcon(account.game)}"></i>
            </div>
            <div class="game-details">
              <div class="game-name">${account.game || 'Нет игры'}</div>
              <div class="game-stats">
                ${account.farming ? '<i class="fas fa-seedling"></i> Фарминг' : ''}
                ${account.hasNewDrop ? '<i class="fas fa-gift"></i> Дроп доступен' : ''}
              </div>
            </div>
            ${account.hasNewDrop ? `
              <div class="drop-indicator">
                <i class="fas fa-gift"></i>
              </div>
            ` : ''}
          </div>
        </div>
        <div class="col-uptime">
          <div>${account.uptime || '0ч 0м'}</div>
          <small>Часы фарма: ${(account.farmingHours || 0).toFixed(1)}h</small>
        </div>
        <div class="col-actions">
          <div class="account-actions">
            <button class="action-btn ${account.status === 'offline' ? 'success' : 'warning'}" 
                    onclick="steamManager.toggleAccountStatus('${account.id}')"
                    title="${account.status === 'offline' ? 'Запустить' : 'Остановить'}">
              <i class="fas ${account.status === 'offline' ? 'fa-play' : 'fa-stop'}"></i>
            </button>
            
            <button class="action-btn ${account.farming ? 'danger' : 'success'}" 
                    onclick="steamManager.toggleFarming('${account.id}')"
                    title="${account.farming ? 'Остановить фарминг' : 'Запустить фарминг'}">
              <i class="fas ${account.farming ? 'fa-stop-circle' : 'fa-seedling'}"></i>
            </button>
            
            ${account.hasNewDrop ? `
              <button class="action-btn success has-drop" 
                      onclick="steamManager.claimDrop('${account.id}')"
                      title="Забрать дроп">
                <i class="fas fa-gift"></i>
              </button>
            ` : ''}
            
            <button class="action-btn info" 
                    onclick="steamManager.showAccountMenu('${account.id}', event)"
                    title="Меню действий">
              <i class="fas fa-ellipsis-h"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  getFilteredAccounts() {
    const statusFilter = document.getElementById('status-filter')?.value || 'all';
    const countryFilter = document.getElementById('country-filter')?.value || 'all';
    const gameFilter = document.getElementById('game-filter')?.value || 'all';
    const searchText = document.getElementById('search-accounts')?.value?.toLowerCase() || '';

    return accounts.filter(account => {
      // Фильтр по статусу
      if (statusFilter !== 'all') {
        if (statusFilter === 'online' && account.status !== 'online') return false;
        if (statusFilter === 'farming' && !account.farming) return false;
        if (statusFilter === 'offline' && account.status !== 'offline') return false;
        if (statusFilter === 'error' && account.status !== 'error') return false;
      }
      
      // Фильтр по стране
      if (countryFilter !== 'all' && account.country !== countryFilter) {
        if (countryFilter === 'other' && ['ru', 'us', 'eu'].includes(account.country)) return false;
        if (countryFilter !== 'other' && account.country !== countryFilter) return false;
      }
      
      // Фильтр по игре
      if (gameFilter !== 'all' && account.game !== gameFilter) return false;
      
      // Поиск
      if (searchText) {
        const searchIn = (account.name + ' ' + account.login + ' ' + account.game).toLowerCase();
        if (!searchIn.includes(searchText)) return false;
      }
      
      return true;
    });
  }

  getFarmingPageHTML() {
    const farmingAccounts = accounts.filter(a => a.farming);
    const totalHours = accounts.reduce((sum, a) => sum + (a.farmingHours || 0), 0);
    const totalProfit = accounts.reduce((sum, a) => sum + (a.totalProfit || 0), 0);
    
    return `
      <div class="stats-grid">
        <div class="stat-card blue">
          <i class="fas fa-seedling"></i>
          <div>
            <h3>Активно фармят</h3>
            <p class="stat-value">${farmingAccounts.length}</p>
          </div>
        </div>
        <div class="stat-card green">
          <i class="fas fa-clock"></i>
          <div>
            <h3>Часы фарминга</h3>
            <p class="stat-value">${totalHours.toFixed(1)}h</p>
          </div>
        </div>
        <div class="stat-card orange">
          <i class="fas fa-gamepad"></i>
          <div>
            <h3>Игр в работе</h3>
            <p class="stat-value">${[...new Set(farmingAccounts.map(a => a.game))].length}</p>
          </div>
        </div>
        <div class="stat-card purple">
          <i class="fas fa-dollar-sign"></i>
          <div>
            <h3>Прибыль с фарминга</h3>
            <p class="stat-value">$${totalProfit.toFixed(2)}</p>
          </div>
        </div>
      </div>
      
      <div class="action-bar">
        <h3><i class="fas fa-cogs"></i> Быстрый старт фарминга</h3>
        <div class="quick-farming-actions">
          <button class="btn btn-success" id="start-all-farming-page">
            <i class="fas fa-play"></i> Запустить все
          </button>
          <button class="btn btn-warning" id="stop-all-farming-page">
            <i class="fas fa-stop"></i> Остановить все
          </button>
          <button class="btn btn-info" id="auto-optimize-farming">
            <i class="fas fa-magic"></i> Авто-оптимизация
          </button>
        </div>
      </div>
      
      <div class="farming-games">
        <h3><i class="fas fa-gamepad"></i> Игры для фарминга</h3>
        <div class="games-grid" id="games-grid">
          ${this.getGamesGridHTML()}
        </div>
      </div>
      
      <div class="farming-schedule">
        <h3><i class="fas fa-calendar-alt"></i> Расписание фарминга</h3>
        <div class="schedule-settings">
          <div class="form-group">
            <label><i class="fas fa-clock"></i> Начало фарминга</label>
            <input type="time" id="farming-start-time" value="00:00" class="form-control">
          </div>
          <div class="form-group">
            <label><i class="fas fa-clock"></i> Конец фарминга</label>
            <input type="time" id="farming-end-time" value="23:59" class="form-control">
          </div>
          <div class="form-group">
            <label><i class="fas fa-hourglass-half"></i> Длительность сессии (часы)</label>
            <input type="number" id="farming-session-duration" value="4" min="1" max="24" class="form-control">
          </div>
          <button class="btn btn-primary" id="save-farming-schedule">
            <i class="fas fa-save"></i> Сохранить расписание
          </button>
        </div>
      </div>
      
      <div class="active-farming">
        <h3><i class="fas fa-list"></i> Активно фармят сейчас</h3>
        <div class="farming-list" id="active-farming-list">
          ${this.getActiveFarmingListHTML()}
        </div>
      </div>
    `;
  }

  getGamesGridHTML() {
    const games = ['CS2', 'CS:GO', 'Dota 2', 'TF2'];
    
    return games.map(game => {
      const farmingCount = accounts.filter(a => a.game === game && a.farming).length;
      const totalCount = accounts.filter(a => a.game === game).length;
      
      return `
        <div class="game-card" data-game="${game}">
          <div class="game-icon">
            <i class="${this.getGameIcon(game)}"></i>
          </div>
          <h4>${game}</h4>
          <p>${farmingCount}/${totalCount} аккаунтов</p>
          <button class="btn btn-small start-game-farming" onclick="steamManager.startGameFarming('${game}')">
            <i class="fas fa-play"></i> Запустить
          </button>
        </div>
      `;
    }).join('');
  }

  getActiveFarmingListHTML() {
    const farmingAccounts = accounts.filter(a => a.farming);
    
    if (farmingAccounts.length === 0) {
      return `
        <div class="empty-state">
          <i class="fas fa-seedling fa-3x"></i>
          <p>Нет активного фарминга</p>
          <button class="btn btn-success" onclick="steamManager.startAllFarming()">
            <i class="fas fa-play"></i> Запустить фарминг
          </button>
        </div>
      `;
    }
    
    return `
      <table class="farming-table">
        <thead>
          <tr>
            <th>Аккаунт</th>
            <th>Игра</th>
            <th>Время фарма</th>
            <th>Получено дропов</th>
            <th>Прибыль</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          ${farmingAccounts.map(account => `
            <tr>
              <td>
                <div class="account-mini">
                  <div class="mini-avatar" style="background: ${this.getAvatarColor(account.id)};">
                    ${account.name.charAt(0)}
                  </div>
                  <span>${account.name}</span>
                </div>
              </td>
              <td>${account.game}</td>
              <td>${account.farmingHours?.toFixed(1) || 0}h</td>
              <td>${account.totalDrops || 0}</td>
              <td>$${account.totalProfit?.toFixed(2) || '0.00'}</td>
              <td>
                <button class="btn btn-small btn-danger" onclick="steamManager.stopFarming('${account.id}')">
                  <i class="fas fa-stop"></i> Остановить
                </button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  getTradingPageHTML() {
    const totalListings = accounts.reduce((sum, a) => sum + (a.marketListings?.length || 0), 0);
    const totalValue = accounts.reduce((sum, a) => {
      if (a.marketListings) {
        return sum + a.marketListings.reduce((listSum, listing) => listSum + (listing.price || 0), 0);
      }
      return sum;
    }, 0);
    const soldItems = accounts.reduce((sum, a) => {
      if (a.marketListings) {
        return sum + a.marketListings.filter(l => l.status === 'sold').length;
      }
      return sum;
    }, 0);
    
    return `
      <div class="stats-grid">
        <div class="stat-card blue">
          <i class="fas fa-shopping-cart"></i>
          <div>
            <h3>Активные продажи</h3>
            <p class="stat-value">${totalListings}</p>
          </div>
        </div>
        <div class="stat-card green">
          <i class="fas fa-exchange-alt"></i>
          <div>
            <h3>Общая стоимость</h3>
            <p class="stat-value">$${totalValue.toFixed(2)}</p>
          </div>
        </div>
        <div class="stat-card orange">
          <i class="fas fa-dollar-sign"></i>
          <div>
            <h3>Продано предметов</h3>
            <p class="stat-value">${soldItems}</p>
          </div>
        </div>
        <div class="stat-card purple">
          <i class="fas fa-percentage"></i>
          <div>
            <h3>Процент успеха</h3>
            <p class="stat-value">${totalListings > 0 ? Math.round((soldItems / totalListings) * 100) : 0}%</p>
          </div>
        </div>
      </div>
      
      <div class="trading-actions">
        <h3><i class="fas fa-bolt"></i> Быстрые действия</h3>
        <div class="action-buttons">
          <button class="btn btn-success" id="quick-sell-all">
            <i class="fas fa-tag"></i> Быстрая продажа
          </button>
          <button class="btn btn-warning" id="check-market-prices">
            <i class="fas fa-search-dollar"></i> Проверить цены
          </button>
          <button class="btn btn-info" id="market-analysis">
            <i class="fas fa-chart-line"></i> Анализ рынка
          </button>
          <button class="btn btn-primary" onclick="steamManager.showMarketplaceModal()">
            <i class="fas fa-store"></i> Открыть площадку
          </button>
        </div>
      </div>
      
      <div class="market-listings">
        <h3><i class="fas fa-list"></i> Активные продажи</h3>
        <div class="listings-table" id="market-listings">
          ${this.getMarketListingsHTML()}
        </div>
      </div>
      
      <div class="trading-history">
        <h3><i class="fas fa-history"></i> История торговли</h3>
        <div class="history-table" id="trading-history">
          ${this.getTradingHistoryHTML()}
        </div>
      </div>
    `;
  }

  getMarketListingsHTML() {
    const allListings = [];
    accounts.forEach(account => {
      if (account.marketListings && account.marketListings.length > 0) {
        account.marketListings.forEach(listing => {
          allListings.push({
            ...listing,
            accountName: account.name,
            accountId: account.id
          });
        });
      }
    });
    
    if (allListings.length === 0) {
      return `
        <div class="empty-state">
          <i class="fas fa-shopping-cart fa-3x"></i>
          <p>Нет активных продаж</p>
          <p class="small">Начните продавать предметы через Торговую площадку</p>
          <button class="btn btn-primary" onclick="steamManager.showMarketplaceModal()">
            <i class="fas fa-store"></i> Открыть площадку
          </button>
        </div>
      `;
    }
    
    const activeListings = allListings.filter(l => l.status === 'active');
    
    return `
      <table class="listings-table">
        <thead>
          <tr>
            <th>Предмет</th>
            <th>Аккаунт</th>
            <th>Цена</th>
            <th>Выставлено</th>
            <th>Статус</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          ${activeListings.map(listing => `
            <tr>
              <td>
                <div class="item-info">
                  <i class="fas fa-box-open"></i>
                  <span>${listing.item?.name || 'Предмет'}</span>
                </div>
              </td>
              <td>${listing.accountName}</td>
              <td>$${listing.price?.toFixed(2) || '0.00'}</td>
              <td>${new Date(listing.listedAt).toLocaleDateString()}</td>
              <td>
                <span class="status-badge ${listing.status === 'sold' ? 'status-online' : listing.status === 'expired' ? 'status-error' : 'status-farming'}">
                  ${listing.status === 'sold' ? 'Продано' : listing.status === 'expired' ? 'Истекло' : 'В продаже'}
                </span>
              </td>
              <td>
                <button class="btn btn-small btn-danger" onclick="steamManager.cancelListing('${listing.accountId}', '${listing.id}')">
                  <i class="fas fa-times"></i> Снять
                </button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  getTradingHistoryHTML() {
    const allListings = [];
    accounts.forEach(account => {
      if (account.marketListings && account.marketListings.length > 0) {
        account.marketListings.forEach(listing => {
          if (listing.status === 'sold' || listing.status === 'expired') {
            allListings.push({
              ...listing,
              accountName: account.name
            });
          }
        });
      }
    });
    
    allListings.sort((a, b) => new Date(b.listedAt) - new Date(a.listedAt));
    const recentListings = allListings.slice(0, 10);
    
    if (recentListings.length === 0) {
      return `
        <div class="empty-state">
          <i class="fas fa-history fa-3x"></i>
          <p>История торговли пуста</p>
        </div>
      `;
    }
    
    return `
      <table class="history-table">
        <thead>
          <tr>
            <th>Предмет</th>
            <th>Аккаунт</th>
            <th>Цена</th>
            <th>Дата</th>
            <th>Статус</th>
            <th>Прибыль</th>
          </tr>
        </thead>
        <tbody>
          ${recentListings.map(listing => `
            <tr>
              <td>${listing.item?.name || 'Предмет'}</td>
              <td>${listing.accountName}</td>
              <td>$${listing.price?.toFixed(2) || '0.00'}</td>
              <td>${new Date(listing.listedAt).toLocaleDateString()}</td>
              <td>
                <span class="status-badge ${listing.status === 'sold' ? 'status-online' : 'status-error'}">
                  ${listing.status === 'sold' ? 'Продано' : 'Истекло'}
                </span>
              </td>
              <td>${listing.status === 'sold' ? `$${listing.price?.toFixed(2) || '0.00'}` : '-'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  getDropsPageHTML() {
    const accountsWithDrops = accounts.filter(a => a.hasNewDrop);
    const totalDrops = accounts.reduce((sum, a) => sum + (a.totalDrops || 0), 0);
    const totalValue = accounts.reduce((sum, a) => {
      const inventoryValue = (a.inventory || []).reduce((invSum, item) => invSum + (item.price || 0), 0);
      return sum + inventoryValue;
    }, 0);
    
    let maxPrice = 0;
    let mostValuableItem = '';
    accounts.forEach(a => {
      (a.inventory || []).forEach(item => {
        if (item.price > maxPrice) {
          maxPrice = item.price;
          mostValuableItem = item.name;
        }
      });
    });
    
    return `
      <div class="stats-grid">
        <div class="stat-card blue">
          <i class="fas fa-gift"></i>
          <div>
            <h3>Доступные дропы</h3>
            <p class="stat-value">${accountsWithDrops.length}</p>
          </div>
        </div>
        <div class="stat-card green">
          <i class="fas fa-boxes"></i>
          <div>
            <h3>Всего собрано</h3>
            <p class="stat-value">${totalDrops}</p>
          </div>
        </div>
        <div class="stat-card orange">
          <i class="fas fa-dollar-sign"></i>
          <div>
            <h3>Общая стоимость</h3>
            <p class="stat-value">$${totalValue.toFixed(2)}</p>
          </div>
        </div>
        <div class="stat-card purple">
          <i class="fas fa-crown"></i>
          <div>
            <h3>Самый ценный</h3>
            <p class="stat-value">$${maxPrice.toFixed(2)}</p>
          </div>
        </div>
      </div>
      
      <div class="drops-actions">
        <h3><i class="fas fa-bolt"></i> Быстрый сбор</h3>
        <div class="action-buttons">
          <button class="btn btn-success" id="claim-all-drops-page">
            <i class="fas fa-gifts"></i> Забрать все дропы
          </button>
          <button class="btn btn-warning" id="auto-claim-drops">
            <i class="fas fa-robot"></i> Авто-сбор
          </button>
          <button class="btn btn-info" id="sort-inventory">
            <i class="fas fa-sort-amount-down"></i> Сортировать инвентарь
          </button>
          <button class="btn btn-primary" onclick="steamManager.openRandomInventory()">
            <i class="fas fa-box-open"></i> Просмотр инвентаря
          </button>
        </div>
      </div>
      
      <div class="available-drops">
        <h3><i class="fas fa-box-open"></i> Доступные для сбора</h3>
        <div class="drops-grid" id="available-drops-grid">
          ${this.getAvailableDropsHTML()}
        </div>
      </div>
      
      <div class="drop-history">
        <h3><i class="fas fa-history"></i> История дропов</h3>
        <div class="history-list" id="drop-history-list">
          ${this.getDropHistoryHTML()}
        </div>
      </div>
      
      <div class="drop-settings">
        <h3><i class="fas fa-cog"></i> Настройки сбора</h3>
        <div class="settings-grid">
          <div class="setting-item">
            <label>
              <input type="checkbox" id="auto-claim-enabled" checked>
              <span>Автоматический сбор дропов</span>
            </label>
          </div>
          <div class="setting-item">
            <label>
              <input type="checkbox" id="notify-new-drops" checked>
              <span>Уведомлять о новых дропах</span>
            </label>
          </div>
          <div class="setting-item">
            <label>
              <input type="checkbox" id="sell-cheap-items" checked>
              <span>Авто-продажа дешевых предметов</span>
            </label>
          </div>
          <div class="setting-item">
            <label>Минимальная цена для авто-продажи ($):</label>
            <input type="number" id="min-sell-price" value="0.10" step="0.01" min="0.01" class="form-control">
          </div>
        </div>
        <button class="btn btn-primary" id="save-drop-settings">
          <i class="fas fa-save"></i> Сохранить настройки
        </button>
      </div>
    `;
  }

  getAvailableDropsHTML() {
    const accountsWithDrops = accounts.filter(a => a.hasNewDrop);
    
    if (accountsWithDrops.length === 0) {
      return `
        <div class="empty-state">
          <i class="fas fa-gift fa-3x"></i>
          <p>Нет доступных дропов</p>
          <p class="small">Запустите фарминг для получения дропов</p>
          <button class="btn btn-success" onclick="steamManager.startAllFarming()">
            <i class="fas fa-play"></i> Запустить фарминг
          </button>
        </div>
      `;
    }
    
    return accountsWithDrops.map(account => {
      const drop = account.lastDrop || { name: 'Новый дроп', price: 0, rarity: 'common' };
      
      return `
        <div class="drop-card">
          <div class="drop-account">${account.name}</div>
          <div class="drop-item">
            <i class="fas fa-box-open"></i>
            <span>${drop.name}</span>
          </div>
          <div class="drop-value">$${drop.price.toFixed(2)}</div>
          <div class="drop-rarity ${drop.rarity}">${this.getRarityText(drop.rarity)}</div>
          <div class="drop-info">
            <small>Игра: ${account.game}</small>
            <small>Время работы: ${account.uptime}</small>
          </div>
          <button class="btn btn-small btn-success" onclick="steamManager.claimDrop('${account.id}')">
            <i class="fas fa-check"></i> Забрать
          </button>
        </div>
      `;
    }).join('');
  }

  getDropHistoryHTML() {
    let allItems = [];
    accounts.forEach(account => {
      if (account.inventory) {
        account.inventory.forEach(item => {
          allItems.push({
            ...item,
            accountName: account.name,
            accountId: account.id,
            acquired: item.acquired || new Date().toISOString()
          });
        });
      }
    });
    
    allItems.sort((a, b) => new Date(b.acquired) - new Date(a.acquired));
    const recentItems = allItems.slice(0, 10);
    
    if (recentItems.length === 0) {
      return `
        <div class="empty-state">
          <i class="fas fa-history fa-3x"></i>
          <p>История дропов пуста</p>
        </div>
      `;
    }
    
    return recentItems.map(item => `
      <div class="history-item">
        <div class="item-info">
          <i class="fas fa-box-open"></i>
          <div>
            <div class="item-name">${item.name}</div>
            <div class="item-meta">
              <span class="account">${item.accountName}</span>
              <span class="date">${new Date(item.acquired).toLocaleDateString()}</span>
            </div>
          </div>
        </div>
        <div class="item-value">$${item.price?.toFixed(2) || '0.00'}</div>
        <div class="item-rarity ${item.rarity || 'common'}"></div>
      </div>
    `).join('');
  }

  getSettingsPageHTML() {
    return `
      <div class="settings-container">
        <div class="settings-group">
          <h4><i class="fas fa-user-cog"></i> Настройки аккаунтов</h4>
          <div class="setting-item">
            <label>
              <input type="checkbox" id="auto-start-accounts" checked>
              <span>Автоматически запускать аккаунты при старте</span>
            </label>
          </div>
          <div class="setting-item">
            <label>
              <input type="checkbox" id="auto-farm-enabled" checked>
              <span>Автоматически начинать фарминг</span>
            </label>
          </div>
          <div class="setting-item">
            <label>
              <input type="checkbox" id="auto-trade-enabled">
              <span>Автоматическая торговля</span>
            </label>
          </div>
          <div class="setting-item">
            <label>Максимальное количество аккаунтов:</label>
            <input type="number" id="max-accounts" value="50" min="1" max="1000" class="form-control">
          </div>
        </div>
        
        <div class="settings-group">
          <h4><i class="fas fa-shield-alt"></i> Настройки безопасности</h4>
          <div class="setting-item">
            <label>
              <input type="checkbox" id="proxy-rotation" checked>
              <span>Автоматическая ротация прокси</span>
            </label>
          </div>
          <div class="setting-item">
            <label>
              <input type="checkbox" id="hardware-emulation" checked>
              <span>Эмуляция уникального железа</span>
            </label>
          </div>
          <div class="setting-item">
            <label>
              <input type="checkbox" id="delay-between-actions" checked>
              <span>Задержка между действиями</span>
            </label>
          </div>
          <div class="setting-item">
            <label>Задержка между аккаунтами (секунды):</label>
            <input type="range" id="delay-slider" min="1" max="60" value="5">
            <span id="delay-value-display">5</span>
          </div>
          <div class="setting-item">
            <label>Уровень изоляции по умолчанию:</label>
            <select id="default-isolation" class="form-control">
              <option value="maximum">Максимальный</option>
              <option value="high">Высокий</option>
              <option value="medium">Средний</option>
              <option value="low">Низкий</option>
            </select>
          </div>
        </div>
        
        <div class="settings-group">
          <h4><i class="fas fa-bell"></i> Уведомления</h4>
          <div class="setting-item">
            <label>
              <input type="checkbox" id="notify-new-drops-settings" checked>
              <span>Уведомлять о новых дропах</span>
            </label>
          </div>
          <div class="setting-item">
            <label>
              <input type="checkbox" id="notify-sales" checked>
              <span>Уведомлять о продажах</span>
            </label>
          </div>
          <div class="setting-item">
            <label>
              <input type="checkbox" id="notify-errors" checked>
              <span>Уведомлять об ошибках</span>
            </label>
          </div>
          <div class="setting-item">
            <label>
              <input type="checkbox" id="notify-steam-guard" checked>
              <span>Уведомлять о Steam Guard</span>
            </label>
          </div>
        </div>
        
        <div class="settings-group">
          <h4><i class="fas fa-cogs"></i> Настройки фарминга</h4>
          <div class="setting-item">
            <label>Максимальное время фарминга (часов в день):</label>
            <input type="number" id="max-farming-hours" value="8" min="1" max="24" class="form-control">
          </div>
          <div class="setting-item">
            <label>Автоматический перерыв (минут):</label>
            <input type="number" id="farming-break" value="15" min="0" max="120" class="form-control">
          </div>
          <div class="setting-item">
            <label>Приоритетная игра для фарминга:</label>
            <select id="priority-game" class="form-control">
              <option value="CS2">CS2</option>
              <option value="CS:GO">CS:GO</option>
              <option value="Dota 2">Dota 2</option>
              <option value="TF2">Team Fortress 2</option>
            </select>
          </div>
        </div>
        
        <div class="settings-group">
          <h4><i class="fas fa-database"></i> Управление данными</h4>
          <div class="setting-item">
            <label>
              <input type="checkbox" id="auto-backup" checked>
              <span>Автоматическое резервное копирование</span>
            </label>
          </div>
          <div class="setting-item">
            <label>Интервал автосохранения (минуты):</label>
            <input type="number" id="auto-save-interval" value="5" min="1" max="60" class="form-control">
          </div>
          <div class="action-buttons">
            <button class="btn btn-info" id="backup-now" onclick="steamManager.createBackup()">
              <i class="fas fa-save"></i> Сделать бэкап сейчас
            </button>
            <button class="btn btn-warning" id="restore-backup" onclick="steamManager.restoreBackup()">
              <i class="fas fa-undo"></i> Восстановить из бэкапа
            </button>
            <button class="btn btn-danger" id="clear-data" onclick="steamManager.clearData()">
              <i class="fas fa-trash"></i> Очистить все данные
            </button>
          </div>
        </div>
        
        <div class="settings-group">
          <h4><i class="fas fa-paint-brush"></i> Внешний вид</h4>
          <div class="setting-item">
            <label>Тема оформления:</label>
            <select id="theme-select" class="form-control">
              <option value="dark">Темная</option>
              <option value="light">Светлая</option>
              <option value="blue">Синяя</option>
              <option value="green">Зеленая</option>
            </select>
          </div>
          <div class="setting-item">
            <label>Язык интерфейса:</label>
            <select id="language-select" class="form-control">
              <option value="ru" selected>Русский</option>
              <option value="en">English</option>
            </select>
          </div>
          <div class="setting-item">
            <label>Размер шрифта:</label>
            <select id="font-size" class="form-control">
              <option value="small">Маленький</option>
              <option value="medium" selected>Средний</option>
              <option value="large">Большой</option>
            </select>
          </div>
        </div>
        
        <div class="settings-actions">
          <button class="btn btn-success" id="save-all-settings" onclick="steamManager.saveAllSettings()">
            <i class="fas fa-save"></i> Сохранить все настройки
          </button>
          <button class="btn btn-secondary" id="reset-settings" onclick="steamManager.resetSettings()">
            <i class="fas fa-undo"></i> Сбросить настройки по умолчанию
          </button>
        </div>
      </div>
    `;
  }

  getSecurityPageHTML() {
    const riskLevel = this.calculateRiskLevel();
    const protectedAccounts = accounts.filter(a => a.isolation === 'maximum' || a.isolation === 'high').length;
    const uniqueProxies = new Set(accounts.filter(a => a.proxy).map(a => a.proxy.ip)).size;
    const daysWithoutBan = 30; // Это можно считать из данных аккаунтов
    
    return `
      <div class="security-container">
        <div class="security-status">
          <h3><i class="fas fa-shield-alt"></i> Статус безопасности</h3>
          <div class="risk-level ${riskLevel.level.toLowerCase().replace(' ', '-')}">
            <div class="risk-icon">
              <i class="fas fa-${this.getRiskIcon(riskLevel.level)}"></i>
            </div>
            <div class="risk-info">
              <h4>Уровень риска: ${riskLevel.level}</h4>
              <p>${this.getRiskDescription(riskLevel.level)}</p>
              <div class="risk-progress">
                <div class="progress-bar" style="width: ${this.getRiskPercent(riskLevel.level)}%; background: ${riskLevel.color};"></div>
              </div>
            </div>
          </div>
        </div>
        
        <div class="security-stats">
          <h4><i class="fas fa-chart-bar"></i> Статистика безопасности</h4>
          <div class="stats-grid">
            <div class="stat-card">
              <i class="fas fa-user-shield"></i>
              <div>
                <h3>Защищенные аккаунты</h3>
                <p class="stat-value">${protectedAccounts}</p>
              </div>
            </div>
            <div class="stat-card">
              <i class="fas fa-globe"></i>
              <div>
                <h3>Уникальные прокси</h3>
                <p class="stat-value">${uniqueProxies}</p>
              </div>
            </div>
            <div class="stat-card">
              <i class="fas fa-desktop"></i>
              <div>
                <h3>Уникальные устройства</h3>
                <p class="stat-value">${accounts.length}</p>
              </div>
            </div>
            <div class="stat-card">
              <i class="fas fa-clock"></i>
              <div>
                <h3>Дней без бана</h3>
                <p class="stat-value">${daysWithoutBan}</p>
              </div>
            </div>
          </div>
        </div>
        
        <div class="security-recommendations">
          <h4><i class="fas fa-lightbulb"></i> Рекомендации по безопасности</h4>
          <div class="recommendations-list" id="security-recommendations">
            ${this.getSecurityRecommendations()}
          </div>
        </div>
        
        <div class="security-actions">
          <h4><i class="fas fa-tools"></i> Инструменты безопасности</h4>
          <div class="action-buttons">
            <button class="btn btn-success" id="rotate-all-proxies" onclick="steamManager.rotateAllProxies()">
              <i class="fas fa-sync-alt"></i> Сменить все прокси
            </button>
            <button class="btn btn-warning" id="refresh-fingerprints" onclick="steamManager.refreshFingerprints()">
              <i class="fas fa-fingerprint"></i> Обновить отпечатки
            </button>
            <button class="btn btn-info" id="check-accounts-status" onclick="steamManager.checkAccountsStatus()">
              <i class="fas fa-search"></i> Проверить статус аккаунтов
            </button>
            <button class="btn btn-danger" id="emergency-stop" onclick="steamManager.emergencyStop()">
              <i class="fas fa-stop-circle"></i> Аварийная остановка
            </button>
          </div>
        </div>
        
        <div class="security-tools">
          <h4><i class="fas fa-cogs"></i> Дополнительные инструменты</h4>
          <div class="tools-grid">
            <div class="tool-card" onclick="steamManager.showSteamGuardModal()">
              <div class="tool-icon">
                <i class="fas fa-mobile-alt"></i>
              </div>
              <h5>Steam Guard</h5>
              <p>Управление 2FA кодами</p>
            </div>
            <div class="tool-card" onclick="steamManager.showProxyManager()">
              <div class="tool-icon">
                <i class="fas fa-server"></i>
              </div>
              <h5>Менеджер прокси</h5>
              <p>Управление прокси-серверами</p>
            </div>
            <div class="tool-card" onclick="steamManager.showBanChecker()">
              <div class="tool-icon">
                <i class="fas fa-shield-alt"></i>
              </div>
              <h5>Проверка банов</h5>
              <p>Проверка статуса аккаунтов</p>
            </div>
            <div class="tool-card" onclick="steamManager.showSecurityLogs()">
              <div class="tool-icon">
                <i class="fas fa-clipboard-list"></i>
              </div>
              <h5>Логи безопасности</h5>
              <p>Детальные логи системы</p>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  getSecurityRecommendations() {
    const recommendations = [];
    
    const lowIsolation = accounts.filter(a => a.isolation === 'low' || a.isolation === 'medium').length;
    if (lowIsolation > 0) {
      recommendations.push(`
        <div class="recommendation warning">
          <i class="fas fa-exclamation-triangle"></i>
          <div>
            <strong>${lowIsolation} аккаунтов с низкой изоляцией</strong>
            <p>Повысьте уровень изоляции для этих аккаунтов в настройках</p>
          </div>
        </div>
      `);
    }
    
    const noProxy = accounts.filter(a => !a.proxy).length;
    if (noProxy > 0) {
      recommendations.push(`
        <div class="recommendation warning">
          <i class="fas fa-exclamation-triangle"></i>
          <div>
            <strong>${noProxy} аккаунтов без прокси</strong>
            <p>Добавьте уникальные прокси для каждого аккаунта</p>
          </div>
        </div>
      `);
    }
    
    const longFarming = accounts.filter(a => (a.farmingHours || 0) > 20).length;
    if (longFarming > 0) {
      recommendations.push(`
        <div class="recommendation info">
          <i class="fas fa-info-circle"></i>
          <div>
            <strong>${longFarming} аккаунтов фармят более 20 часов</strong>
            <p>Рекомендуется делать перерывы в фарминге</p>
          </div>
        </div>
      `);
    }
    
    const sameProxy = {};
    accounts.forEach(acc => {
      if (acc.proxy?.ip) {
        if (!sameProxy[acc.proxy.ip]) sameProxy[acc.proxy.ip] = [];
        sameProxy[acc.proxy.ip].push(acc.name);
      }
    });
    
    Object.entries(sameProxy).forEach(([ip, accNames]) => {
      if (accNames.length > 1) {
        recommendations.push(`
          <div class="recommendation danger">
            <i class="fas fa-exclamation-circle"></i>
            <div>
              <strong>${accNames.length} аккаунтов используют один прокси (${ip})</strong>
              <p>Рекомендуется использовать уникальные прокси для каждого аккаунта</p>
            </div>
          </div>
        `);
      }
    });
    
    if (recommendations.length === 0) {
      return `
        <div class="recommendation success">
          <i class="fas fa-check-circle"></i>
          <div>
            <strong>Все в порядке!</strong>
            <p>Все аккаунты хорошо защищены, рекомендации не требуются</p>
          </div>
        </div>
      `;
    }
    
    return recommendations.join('');
  }

  // ===== ОБНОВЛЕНИЕ СТРАНИЦ =====
  updatePageContent(pageName) {
    switch(pageName) {
      case 'accounts':
        this.renderAccounts();
        break;
      case 'farming':
        this.updateFarmingPage();
        break;
      case 'trading':
        this.updateTradingPage();
        break;
      case 'drops':
        this.updateDropsPage();
        break;
      case 'settings':
        this.initSettingsPage();
        break;
      case 'security':
        this.updateSecurityPage();
        break;
    }
  }

  renderAccounts() {
    const container = document.getElementById('accounts-list-container');
    if (container) {
      container.innerHTML = this.getAccountsListHTML(this.getFilteredAccounts());
    }
    this.updateStats();
    this.updatePagination();
  }

  updateFarmingPage() {
    // Обновляем статистику на странице фарминга
    const farmingAccounts = accounts.filter(a => a.farming);
    const totalHours = accounts.reduce((sum, a) => sum + (a.farmingHours || 0), 0);
    
    // Обновляем игры
    const gamesGrid = document.getElementById('games-grid');
    if (gamesGrid) {
      gamesGrid.innerHTML = this.getGamesGridHTML();
    }
    
    // Обновляем активный фарминг
    const activeList = document.getElementById('active-farming-list');
    if (activeList) {
      activeList.innerHTML = this.getActiveFarmingListHTML();
    }
  }

  updateTradingPage() {
    // Обновляем список продаж
    const listingsContainer = document.getElementById('market-listings');
    if (listingsContainer) {
      listingsContainer.innerHTML = this.getMarketListingsHTML();
    }
  }

  updateDropsPage() {
    // Обновляем доступные дропы
    const dropsGrid = document.getElementById('available-drops-grid');
    if (dropsGrid) {
      dropsGrid.innerHTML = this.getAvailableDropsHTML();
    }
    
    // Обновляем историю
    const historyList = document.getElementById('drop-history-list');
    if (historyList) {
      historyList.innerHTML = this.getDropHistoryHTML();
    }
  }

  updateSecurityPage() {
    // Обновляем рекомендации
    const recommendations = document.getElementById('security-recommendations');
    if (recommendations) {
      recommendations.innerHTML = this.getSecurityRecommendations();
    }
  }

  initSettingsPage() {
    // Инициализируем слайдер задержки
    const delaySlider = document.getElementById('delay-slider');
    const delayDisplay = document.getElementById('delay-value-display');
    if (delaySlider && delayDisplay) {
      delaySlider.addEventListener('input', (e) => {
        delayDisplay.textContent = e.target.value;
      });
    }
  }

  // ===== ИНИЦИАЛИЗАЦИЯ ОБРАБОТЧИКОВ =====
  initEventListeners() {
    // Основные кнопки в хедере
    this.addClickListener('add-account', () => this.showAddAccountModal());
    this.addClickListener('import-accounts', () => this.importAccounts());
    this.addClickListener('export-accounts', () => this.exportAccounts());
    
    // Поиск
    const searchInput = document.getElementById('search-accounts');
    if (searchInput) {
      searchInput.addEventListener('input', () => this.debounce(() => this.renderAccounts(), 300));
    }
    
    // Пагинация
    this.addClickListener('prev-page', () => this.changePage(-1));
    this.addClickListener('next-page', () => this.changePage(1));
    
    const pageSizeSelect = document.getElementById('page-size');
    if (pageSizeSelect) {
      pageSizeSelect.addEventListener('change', (e) => {
        pageSize = parseInt(e.target.value);
        currentPage = 1;
        this.renderAccounts();
      });
    }
    
    // Фильтры
    ['status-filter', 'country-filter', 'game-filter'].forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        element.addEventListener('change', () => this.renderAccounts());
      }
    });
    
    // Обновление списка
    this.addClickListener('refresh-list', () => this.refreshAccounts());
    this.addClickListener('check-drops', () => this.checkAllDrops());
    
    // Выбор всех
    this.addClickListener('select-all', () => this.selectAllVisible());
    
    // Запуск/остановка выбранных
    this.addClickListener('start-selected', () => this.startSelected());
    this.addClickListener('stop-selected', () => this.stopSelected());
    
    // Закрытие модалок
    document.querySelectorAll('.close-modal').forEach(btn => {
      btn.addEventListener('click', () => this.hideAllModals());
    });
    
    // Закрытие по клику вне
    document.querySelectorAll('.modal').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.remove('active');
        }
      });
    });
    
    // Быстрые действия в сайдбаре
    this.addClickListener('bulk-actions-btn', () => this.showBulkActionsModal());
    this.addClickListener('claim-all-drops', () => this.claimAllDrops());
    this.addClickListener('start-all-farming', () => this.startAllFarming());
    this.addClickListener('stop-all', () => this.stopAllAccounts());
    
    // Кнопки в модалке добавления аккаунта
    this.addClickListener('save-account', () => this.saveNewAccount());
    
    const showPasswordBtn = document.getElementById('show-password-btn');
    if (showPasswordBtn) {
      showPasswordBtn.addEventListener('click', () => {
        const passwordField = document.getElementById('steam-password');
        if (passwordField) {
          passwordField.type = passwordField.type === 'password' ? 'text' : 'password';
          showPasswordBtn.innerHTML = passwordField.type === 'password' ? '<i class="fas fa-eye"></i>' : '<i class="fas fa-eye-slash"></i>';
        }
      });
    }
    
    // Вкладки
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tab = e.target.dataset.tab;
        this.switchTab(tab);
      });
    });
    
    // Торговая площадка
    this.addClickListener('open-marketplace', () => this.showMarketplaceModal());
    
    // ESC для закрытия модалок
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.hideAllModals();
      }
    });
    
    // Обработчик для чекбокса "выбрать все"
    const selectAllCheckbox = document.getElementById('select-all-checkbox');
    if (selectAllCheckbox) {
      selectAllCheckbox.addEventListener('change', (e) => {
        const checked = e.target.checked;
        document.querySelectorAll('.account-checkbox').forEach(checkbox => {
          checkbox.checked = checked;
          const accountId = checkbox.dataset.accountId;
          if (checked) {
            selectedAccounts.add(accountId);
          } else {
            selectedAccounts.delete(accountId);
          }
        });
      });
    }
  }

  addClickListener(id, handler) {
    const element = document.getElementById(id);
    if (element) {
      element.addEventListener('click', handler);
    }
  }

  initPageEventListeners(pageName) {
    switch(pageName) {
      case 'farming':
        this.initFarmingPageListeners();
        break;
      case 'trading':
        this.initTradingPageListeners();
        break;
      case 'drops':
        this.initDropsPageListeners();
        break;
      case 'settings':
        this.initSettingsPageListeners();
        break;
      case 'security':
        this.initSecurityPageListeners();
        break;
    }
  }

  initFarmingPageListeners() {
    this.addClickListener('start-all-farming-page', () => this.startAllFarming());
    this.addClickListener('stop-all-farming-page', () => this.stopAllFarming());
    this.addClickListener('save-farming-schedule', () => this.saveFarmingSchedule());
  }

  initTradingPageListeners() {
    this.addClickListener('quick-sell-all', () => this.quickSellAll());
    this.addClickListener('check-market-prices', () => this.checkMarketPrices());
  }

  initDropsPageListeners() {
    this.addClickListener('claim-all-drops-page', () => this.claimAllDrops());
    this.addClickListener('save-drop-settings', () => this.saveDropSettings());
  }

  initSettingsPageListeners() {
    this.addClickListener('save-all-settings', () => this.saveAllSettings());
    this.addClickListener('reset-settings', () => this.resetSettings());
  }

  initSecurityPageListeners() {
    // Обработчики уже добавлены через onclick
  }

  // ===== УПРАВЛЕНИЕ АККАУНТАМИ =====
  toggleAccountSelection(accountId, checked) {
    if (checked) {
      selectedAccounts.add(accountId);
    } else {
      selectedAccounts.delete(accountId);
    }
    
    // Обновляем чекбокс "выбрать все"
    const selectAllCheckbox = document.getElementById('select-all-checkbox');
    if (selectAllCheckbox) {
      const totalAccounts = document.querySelectorAll('.account-checkbox').length;
      const selectedCount = document.querySelectorAll('.account-checkbox:checked').length;
      selectAllCheckbox.checked = selectedCount === totalAccounts;
      selectAllCheckbox.indeterminate = selectedCount > 0 && selectedCount < totalAccounts;
    }
  }

  selectAllVisible() {
    const allCheckbox = document.getElementById('select-all-checkbox');
    if (allCheckbox) {
      const checked = !allCheckbox.checked;
      allCheckbox.checked = checked;
      allCheckbox.indeterminate = false;
      
      // Получаем видимые аккаунты
      const accountCards = document.querySelectorAll('.account-card');
      accountCards.forEach(card => {
        const accountId = card.dataset.accountId;
        const checkbox = card.querySelector('.account-checkbox');
        if (checkbox) {
          checkbox.checked = checked;
          if (checked) {
            selectedAccounts.add(accountId);
          } else {
            selectedAccounts.delete(accountId);
          }
        }
      });
    }
  }

  // ===== ОСНОВНЫЕ ФУНКЦИИ =====
  async toggleAccountStatus(accountId) {
    try {
      const account = accounts.find(a => a.id === accountId);
      if (!account) return;
      
      if (account.status === 'offline') {
        // Запускаем аккаунт
        const response = await this.callAPI(`/accounts/${accountId}/start`);
        if (response && response.success) {
          account.status = 'online';
          account.uptime = '0ч 0м';
          this.addLog(`Аккаунт "${account.name}" запущен`, 'success');
          this.dataManager.showNotification(`Аккаунт "${account.name}" запущен`, 'success');
        }
      } else {
        // Останавливаем аккаунт
        const response = await this.callAPI(`/accounts/${accountId}/stop`);
        if (response && response.success) {
          account.status = 'offline';
          account.farming = false;
          this.addLog(`Аккаунт "${account.name}" остановлен`, 'info');
          this.dataManager.showNotification(`Аккаунт "${account.name}" остановлен`, 'warning');
        }
      }
      
      this.updateAll();
    } catch (error) {
      console.error('❌ Ошибка переключения статуса:', error);
      this.addLog(`Ошибка переключения статуса: ${error.message}`, 'error');
    }
  }

  async toggleFarming(accountId) {
    try {
      const account = accounts.find(a => a.id === accountId);
      if (!account) return;
      
      if (account.status === 'offline') {
        this.dataManager.showNotification('Аккаунт должен быть онлайн для фарминга', 'warning');
        return;
      }
      
      if (!account.farming) {
        // Запускаем фарминг
        const response = await this.callAPI(`/accounts/${accountId}/farm`, { game: account.game });
        if (response && response.success) {
          account.farming = true;
          account.status = 'farming';
          account.farmingHours = (account.farmingHours || 0) + 0.5;
          this.addLog(`Фарминг запущен на "${account.name}"`, 'success');
          this.dataManager.showNotification(`Фарминг запущен на "${account.name}"`, 'success');
        }
      } else {
        // Останавливаем фарминг
        const response = await this.callAPI(`/accounts/${accountId}/stop-farming`);
        if (response && response.success) {
          account.farming = false;
          account.status = 'online';
          this.addLog(`Фарминг остановлен на "${account.name}"`, 'info');
          this.dataManager.showNotification(`Фарминг остановлен на "${account.name}"`, 'warning');
        }
      }
      
      this.updateAll();
    } catch (error) {
      console.error('❌ Ошибка переключения фарминга:', error);
      this.addLog(`Ошибка переключения фарминга: ${error.message}`, 'error');
    }
  }

  async startSelected() {
    const selected = Array.from(selectedAccounts);
    if (selected.length === 0) {
      this.dataManager.showNotification('Выберите хотя бы один аккаунт', 'warning');
      return;
    }
    
    try {
      const response = await this.callAPI('/bulk-action', {
        action: 'start',
        accountIds: selected,
        params: { delay: 1000 }
      });
      
      if (response && response.success) {
        let started = response.successful || 0;
        this.updateAll();
        this.addLog(`Запущено ${started} аккаунтов`, 'success');
        this.dataManager.showNotification(`Запущено ${started} аккаунтов`, 'success');
      }
    } catch (error) {
      console.error('❌ Ошибка запуска выбранных:', error);
      this.addLog(`Ошибка запуска выбранных: ${error.message}`, 'error');
    }
  }

  async stopSelected() {
    const selected = Array.from(selectedAccounts);
    if (selected.length === 0) {
      this.dataManager.showNotification('Выберите хотя бы один аккаунт', 'warning');
      return;
    }
    
    try {
      const response = await this.callAPI('/bulk-action', {
        action: 'stop',
        accountIds: selected,
        params: { delay: 1000 }
      });
      
      if (response && response.success) {
        let stopped = response.successful || 0;
        this.updateAll();
        this.addLog(`Остановлено ${stopped} аккаунтов`, 'info');
        this.dataManager.showNotification(`Остановлено ${stopped} аккаунтов`, 'warning');
      }
    } catch (error) {
      console.error('❌ Ошибка остановки выбранных:', error);
      this.addLog(`Ошибка остановки выбранных: ${error.message}`, 'error');
    }
  }

  async startAllFarming() {
    try {
      const onlineAccounts = accounts.filter(a => a.status !== 'offline' && !a.farming);
      
      if (onlineAccounts.length === 0) {
        this.dataManager.showNotification('Нет онлайн аккаунтов для запуска фарминга', 'warning');
        return;
      }
      
      const response = await this.callAPI('/bulk-action', {
        action: 'farm',
        accountIds: onlineAccounts.map(a => a.id),
        params: { delay: 2000 }
      });
      
      if (response && response.success) {
        onlineAccounts.forEach(account => {
          account.farming = true;
          account.status = 'farming';
          account.farmingHours = (account.farmingHours || 0) + 0.5;
        });
        
        this.updateAll();
        this.addLog(`Фарминг запущен на ${onlineAccounts.length} аккаунтах`, 'success');
        this.dataManager.showNotification(`Фарминг запущен на ${onlineAccounts.length} аккаунтах`, 'success');
      }
    } catch (error) {
      console.error('❌ Ошибка запуска всего фарминга:', error);
      this.addLog(`Ошибка запуска всего фарминга: ${error.message}`, 'error');
    }
  }

  async stopAllFarming() {
    try {
      const farmingAccounts = accounts.filter(a => a.farming);
      
      if (farmingAccounts.length === 0) {
        this.dataManager.showNotification('Нет активного фарминга', 'info');
        return;
      }
      
      const response = await this.callAPI('/bulk-action', {
        action: 'stop-farming',
        accountIds: farmingAccounts.map(a => a.id),
        params: { delay: 1000 }
      });
      
      if (response && response.success) {
        farmingAccounts.forEach(account => {
          account.farming = false;
          account.status = 'online';
        });
        
        this.updateAll();
        this.addLog(`Фарминг остановлен на ${farmingAccounts.length} аккаунтах`, 'info');
        this.dataManager.showNotification(`Фарминг остановлен на ${farmingAccounts.length} аккаунтах`, 'warning');
      }
    } catch (error) {
      console.error('❌ Ошибка остановки всего фарминга:', error);
      this.addLog(`Ошибка остановки всего фарминга: ${error.message}`, 'error');
    }
  }

  async stopAllAccounts() {
    try {
      const activeAccounts = accounts.filter(a => a.status !== 'offline');
      
      if (activeAccounts.length === 0) {
        this.dataManager.showNotification('Нет активных аккаунтов', 'info');
        return;
      }
      
      const response = await this.callAPI('/bulk-action', {
        action: 'stop',
        accountIds: activeAccounts.map(a => a.id),
        params: { delay: 500 }
      });
      
      if (response && response.success) {
        accounts.forEach(account => {
          if (account.status !== 'offline') {
            account.status = 'offline';
            account.farming = false;
          }
        });
        
        this.updateAll();
        this.addLog('Все аккаунты остановлены', 'info');
        this.dataManager.showNotification('Все аккаунты остановлены', 'warning');
      }
    } catch (error) {
      console.error('❌ Ошибка остановки всех аккаунтов:', error);
      this.addLog(`Ошибка остановки всех аккаунтов: ${error.message}`, 'error');
    }
  }

  async claimDrop(accountId) {
    try {
      const account = accounts.find(a => a.id === accountId);
      if (!account || !account.hasNewDrop) return;
      
      const response = await this.callAPI(`/accounts/${accountId}/claim-drop`);
      if (response && response.success) {
        const drop = response.drop;
        account.hasNewDrop = false;
        account.totalProfit = (account.totalProfit || 0) + drop.price;
        account.totalDrops = (account.totalDrops || 0) + 1;
        
        if (!account.inventory) account.inventory = [];
        account.inventory.push({
          ...drop,
          id: 'item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
          acquired: new Date().toISOString(),
          marketable: true,
          tradable: true
        });
        
        this.updateAll();
        this.addLog(`Получен дроп на "${account.name}": ${drop.name} ($${drop.price})`, 'success');
        this.dataManager.showNotification(`🎁 ${account.name}: ${drop.name} ($${drop.price})`, 'success');
      }
    } catch (error) {
      console.error('❌ Ошибка получения дропа:', error);
      this.addLog(`Ошибка получения дропа: ${error.message}`, 'error');
    }
  }

  async claimAllDrops() {
    try {
      const accountsWithDrops = accounts.filter(a => a.hasNewDrop);
      
      if (accountsWithDrops.length === 0) {
        this.dataManager.showNotification('Нет доступных дропов', 'info');
        return;
      }
      
      const response = await this.callAPI('/bulk-action', {
        action: 'claim-drops',
        accountIds: accountsWithDrops.map(a => a.id),
        params: { delay: 1500 }
      });
      
      if (response && response.success) {
        accountsWithDrops.forEach(account => {
          account.hasNewDrop = false;
        });
        
        this.updateAll();
        this.addLog(`Собрано дропов: ${accountsWithDrops.length}`, 'success');
        this.dataManager.showNotification(`Собрано ${accountsWithDrops.length} дропов`, 'success');
      }
    } catch (error) {
      console.error('❌ Ошибка сбора всех дропов:', error);
      this.addLog(`Ошибка сбора всех дропов: ${error.message}`, 'error');
    }
  }

  async checkAllDrops() {
    try {
      // Эмуляция проверки дропов
      let newDrops = 0;
      const accountsToCheck = accounts.filter(a => a.status !== 'offline' && !a.hasNewDrop);
      
      accountsToCheck.forEach(account => {
        if (Math.random() > 0.7) { // 30% шанс найти дроп
          account.hasNewDrop = true;
          newDrops++;
        }
      });
      
      this.updateAll();
      this.addLog(`Проверка дропов: найдено ${newDrops} новых`, 'info');
      this.dataManager.showNotification(`Найдено ${newDrops} новых дропов`, 'success');
    } catch (error) {
      console.error('❌ Ошибка проверки дропов:', error);
      this.addLog(`Ошибка проверки дропов: ${error.message}`, 'error');
    }
  }

  // ===== МОДАЛЬНЫЕ ОКНА =====
  showAddAccountModal() {
    const modal = document.getElementById('add-account-modal');
    if (modal) {
      modal.classList.add('active');
      document.getElementById('account-name')?.focus();
    }
  }

  showMarketplaceModal() {
    const modal = document.getElementById('marketplace-modal');
    if (modal) {
      // Заполняем список аккаунтов
      const accountSelect = document.getElementById('sell-account');
      if (accountSelect) {
        accountSelect.innerHTML = accounts.map(acc => 
          `<option value="${acc.id}">${acc.name} (${acc.game}) - $${acc.totalProfit?.toFixed(2) || '0.00'}</option>`
        ).join('');
      }
      
      modal.classList.add('active');
    }
  }

  showSteamGuardModal() {
    const modal = document.getElementById('steam-guard-modal');
    if (modal) {
      modal.classList.add('active');
      
      // Генерируем тестовый код
      const codeElement = document.getElementById('current-guard-code');
      if (codeElement) {
        const generateCode = () => {
          const code = Math.floor(100000 + Math.random() * 900000);
          codeElement.textContent = code;
        };
        
        generateCode();
        setInterval(generateCode, 30000); // Обновляем каждые 30 секунд
      }
    }
  }

  showInventoryModal(accountId) {
    const account = accounts.find(a => a.id === accountId);
    if (!account) return;
    
    const modal = document.getElementById('inventory-modal');
    if (modal) {
      // Устанавливаем имя аккаунта
      document.getElementById('inventory-account-name').textContent = account.name;
      
      // Рассчитываем статистику
      const items = account.inventory || [];
      const totalValue = items.reduce((sum, item) => sum + (item.price || 0), 0);
      let maxPrice = 0;
      let mostExpensiveItem = null;
      items.forEach(item => {
        if (item.price > maxPrice) {
          maxPrice = item.price;
          mostExpensiveItem = item.name;
        }
      });
      
      document.getElementById('total-items').textContent = items.length;
      document.getElementById('total-inventory-value').textContent = `$${totalValue.toFixed(2)}`;
      document.getElementById('most-expensive-item').textContent = mostExpensiveItem ? `$${maxPrice.toFixed(2)}` : '$0';
      
      // Отображаем предметы
      const inventoryGrid = document.getElementById('inventory-items');
      if (inventoryGrid) {
        if (items.length === 0) {
          inventoryGrid.innerHTML = `
            <div class="empty-state">
              <i class="fas fa-box-open fa-3x"></i>
              <p>Инвентарь пуст</p>
              <p class="small">Начните фармить, чтобы получать предметы</p>
            </div>
          `;
        } else {
          inventoryGrid.innerHTML = items.map(item => `
            <div class="inventory-item" data-item-id="${item.id}">
              <div class="item-icon">
                <i class="fas fa-box-open"></i>
              </div>
              <div class="item-info">
                <h5>${item.name}</h5>
                <p class="item-price">$${item.price.toFixed(2)}</p>
                <p class="item-rarity ${item.rarity}">${this.getRarityText(item.rarity)}</p>
              </div>
              <div class="item-actions">
                <button class="btn btn-small btn-success" onclick="steamManager.sellItem('${account.id}', '${item.id}')">
                  <i class="fas fa-tag"></i> Продать
                </button>
              </div>
            </div>
          `).join('');
        }
      }
      
      modal.classList.add('active');
    }
  }

  showBulkActionsModal() {
    const modal = document.getElementById('bulk-actions-modal');
    if (modal) {
      // Обновляем статистику в модалке
      const dropsCount = accounts.filter(a => a.hasNewDrop).length;
      const canFarmCount = accounts.filter(a => a.status !== 'offline' && !a.farming).length;
      const activeCount = accounts.filter(a => a.status !== 'offline').length;
      const proxyCount = accounts.filter(a => a.proxy).length;
      
      this.updateElement('available-drops-count', dropsCount);
      this.updateElement('can-farm-count', canFarmCount);
      this.updateElement('active-accounts-count', activeCount);
      this.updateElement('proxy-users-count', proxyCount);
      
      // Настройка слайдера задержки
      const delaySlider = document.getElementById('bulk-delay-range');
      const delayValue = document.getElementById('delay-value');
      if (delaySlider && delayValue) {
        delaySlider.addEventListener('input', (e) => {
          delayValue.textContent = e.target.value;
        });
      }
      
      modal.classList.add('active');
    }
  }

  // ===== ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ =====
  getAvatarColor(accountId) {
    let hash = 0;
    for (let i = 0; i < accountId.length; i++) {
      hash = accountId.charCodeAt(i) + ((hash << 5) - hash);
    }
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
  }

  getStatusClass(status) {
    const classes = {
      'online': 'status-online',
      'offline': 'status-offline',
      'farming': 'status-farming',
      'error': 'status-error'
    };
    return classes[status] || 'status-offline';
  }

  getStatusText(status) {
    const texts = {
      'online': 'Online',
      'offline': 'Offline',
      'farming': 'Фарминг',
      'error': 'Ошибка'
    };
    return texts[status] || 'Offline';
  }

  getCountryFlag(country) {
    const flags = {
      'ru': '🇷🇺',
      'us': '🇺🇸',
      'eu': '🇪🇺',
      'de': '🇩🇪',
      'fr': '🇫🇷',
      'nl': '🇳🇱'
    };
    return flags[country] || '🌐';
  }

  getCountryName(country) {
    const names = {
      'ru': 'Россия',
      'us': 'США',
      'eu': 'Европа',
      'de': 'Германия',
      'fr': 'Франция',
      'nl': 'Нидерланды'
    };
    return names[country] || 'Автовыбор';
  }

  getGameClass(game) {
    const classes = {
      'CS2': 'game-cs2',
      'CS:GO': 'game-csgo',
      'Dota 2': 'game-dota2',
      'TF2': 'game-tf2'
    };
    return classes[game] || 'game-default';
  }

  getGameIcon(game) {
    const icons = {
      'CS2': 'fas fa-crosshairs',
      'CS:GO': 'fas fa-crosshairs',
      'Dota 2': 'fas fa-dragon',
      'TF2': 'fas fa-hat-cowboy'
    };
    return icons[game] || 'fas fa-gamepad';
  }

  getRarityText(rarity) {
    const texts = {
      'common': 'Обычный',
      'uncommon': 'Необычный',
      'rare': 'Редкий',
      'epic': 'Эпический',
      'legendary': 'Легендарный',
      'covert': 'Тайный',
      'immortal': 'Бессмертный',
      'arcana': 'Аркана'
    };
    return texts[rarity] || rarity;
  }

  getRiskIcon(riskLevel) {
    const icons = {
      'Низкий': 'check-circle',
      'Средний': 'exclamation-circle',
      'Высокий': 'exclamation-triangle',
      'Критический': 'skull-crossbones'
    };
    return icons[riskLevel] || 'check-circle';
  }

  getRiskDescription(riskLevel) {
    const descriptions = {
      'Низкий': 'Все аккаунты хорошо защищены, риск блокировки минимален.',
      'Средний': 'Некоторые аккаунты требуют внимания, рекомендуется улучшить защиту.',
      'Высокий': 'Высокий риск блокировки, срочно примите меры по безопасности.',
      'Критический': 'Критический уровень риска! Немедленно остановите систему и проверьте настройки.'
    };
    return descriptions[riskLevel] || '';
  }

  getRiskPercent(riskLevel) {
    const percents = {
      'Низкий': 25,
      'Средний': 50,
      'Высокий': 75,
      'Критический': 100
    };
    return percents[riskLevel] || 25;
  }

  calculateRiskLevel() {
    if (accounts.length === 0) return { level: 'Низкий', color: '#00ff88' };
    
    let riskScore = 0;
    const maxScore = 100;
    
    // 1. Уровень изоляции
    const lowIsolation = accounts.filter(a => a.isolation === 'low').length;
    const mediumIsolation = accounts.filter(a => a.isolation === 'medium').length;
    riskScore += lowIsolation * 10;
    riskScore += mediumIsolation * 5;
    
    // 2. Отсутствие прокси
    const noProxy = accounts.filter(a => !a.proxy).length;
    riskScore += noProxy * 15;
    
    // 3. Дублирование прокси
    const proxyCounts = {};
    accounts.forEach(acc => {
      if (acc.proxy?.ip) {
        proxyCounts[acc.proxy.ip] = (proxyCounts[acc.proxy.ip] || 0) + 1;
      }
    });
    
    Object.values(proxyCounts).forEach(count => {
      if (count > 1) {
        riskScore += (count - 1) * 8;
      }
    });
    
    // 4. Длительный фарминг
    const longFarming = accounts.filter(a => (a.farmingHours || 0) > 20).length;
    riskScore += longFarming * 3;
    
    // Нормализуем score к проценту
    const riskPercent = Math.min(100, Math.round((riskScore / (accounts.length * 15)) * 100));
    
    if (riskPercent > 75) return { level: 'Критический', color: '#ff0000' };
    if (riskPercent > 50) return { level: 'Высокий', color: '#ff5555' };
    if (riskPercent > 25) return { level: 'Средний', color: '#ffaa00' };
    return { level: 'Низкий', color: '#00ff88' };
  }

  // ===== УПРАВЛЕНИЕ МОДАЛКАМИ =====
  hideAllModals() {
    document.querySelectorAll('.modal').forEach(modal => {
      modal.classList.remove('active');
    });
  }

  switchTab(tabName) {
    // Вкладки в модалке добавления аккаунта
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.toggle('active', content.id === `tab-${tabName}`);
    });
  }

  // ===== СОХРАНЕНИЕ АККАУНТА =====
  async saveNewAccount() {
    try {
      const name = document.getElementById('account-name')?.value.trim();
      const login = document.getElementById('steam-login')?.value.trim();
      const password = document.getElementById('steam-password')?.value.trim();
      const country = document.getElementById('account-country')?.value || 'ru';
      const game = document.getElementById('farming-game')?.value || 'cs2';
      const isolation = document.querySelector('input[name="isolation"]:checked')?.value || 'maximum';
      
      if (!name || !login || !password) {
        this.dataManager.showNotification('Заполните обязательные поля', 'error');
        return;
      }
      
      // Проверяем длину пароля
      if (password.length < 6) {
        this.dataManager.showNotification('Пароль должен быть не менее 6 символов', 'error');
        return;
      }
      
      const accountData = {
        name,
        login,
        password,
        country,
        game: game.toUpperCase(),
        isolation,
        autoFarm: document.getElementById('auto-farm')?.checked || false,
        autoTrade: document.getElementById('enable-trading')?.checked || false,
        sharedSecret: document.getElementById('steam-shared-secret')?.value || null,
        notes: document.getElementById('account-notes')?.value || ''
      };
      
      // Отправляем на сервер
      const response = await this.callAPI('/accounts', accountData);
      
      if (response) {
        // Добавляем аккаунт локально
        const newAccount = {
          id: response.id || 'acc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
          ...accountData,
          status: 'offline',
          farming: false,
          hasNewDrop: false,
          totalProfit: 0,
          totalDrops: 0,
          inventory: [],
          marketListings: [],
          farmingHours: 0,
          uptime: '0ч 0м',
          createdAt: new Date().toISOString(),
          lastActivity: new Date().toISOString()
        };
        
        accounts.push(newAccount);
        this.hideAllModals();
        this.resetAddAccountForm();
        this.updateAll();
        
        this.addLog(`Добавлен новый аккаунт: "${name}"`, 'success');
        this.dataManager.showNotification(`Аккаунт "${name}" добавлен`, 'success');
        
        // Автозапуск если включено
        if (document.getElementById('auto-start')?.checked) {
          setTimeout(() => this.toggleAccountStatus(newAccount.id), 1000);
        }
      }
    } catch (error) {
      console.error('❌ Ошибка сохранения аккаунта:', error);
      this.dataManager.showNotification('Ошибка сохранения аккаунта', 'error');
    }
  }

  resetAddAccountForm() {
    const form = document.getElementById('add-account-modal');
    if (form) {
      form.querySelectorAll('input[type="text"], input[type="password"], textarea').forEach(input => {
        input.value = '';
      });
      
      // Сбрасываем select'ы к значениям по умолчанию
      document.getElementById('account-country').value = 'auto';
      document.getElementById('farming-game').value = 'cs2';
      
      // Сбрасываем radio кнопки
      const radio = form.querySelector('input[name="isolation"][value="maximum"]');
      if (radio) radio.checked = true;
      
      // Сбрасываем чекбоксы
      document.getElementById('auto-start').checked = true;
      document.getElementById('auto-farm').checked = true;
      document.getElementById('claim-drops').checked = false;
      document.getElementById('enable-trading').checked = false;
      
      // Возвращаемся на первую вкладку
      this.switchTab('single');
    }
  }

  // ===== МЕНЮ АККАУНТА =====
  showAccountMenu(accountId, event) {
    event.preventDefault();
    event.stopPropagation();
    
    const account = accounts.find(a => a.id === accountId);
    if (!account) return;
    
    // Закрываем предыдущее меню если есть
    const existingMenu = document.querySelector('.context-menu');
    if (existingMenu) existingMenu.remove();
    
    // Создаем контекстное меню
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.position = 'fixed';
    menu.style.zIndex = '10000';
    menu.style.background = 'rgba(30, 30, 45, 0.95)';
    menu.style.backdropFilter = 'blur(10px)';
    menu.style.borderRadius = '10px';
    menu.style.padding = '10px 0';
    menu.style.minWidth = '220px';
    menu.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.5)';
    menu.style.border = '1px solid rgba(255, 255, 255, 0.1)';
    
    menu.innerHTML = `
      <button onclick="steamManager.showInventoryModal('${accountId}')">
        <i class="fas fa-box-open"></i> <span>Инвентарь</span>
      </button>
      <button onclick="steamManager.editAccount('${accountId}')">
        <i class="fas fa-edit"></i> <span>Редактировать</span>
      </button>
      <button onclick="steamManager.showSteamGuardSettings('${accountId}')">
        <i class="fas fa-mobile-alt"></i> <span>Steam Guard</span>
      </button>
      <button onclick="steamManager.rotateProxy('${accountId}')">
        <i class="fas fa-sync-alt"></i> <span>Сменить прокси</span>
      </button>
      <div class="menu-divider"></div>
      <button class="danger" onclick="steamManager.deleteAccount('${accountId}')">
        <i class="fas fa-trash"></i> <span>Удалить аккаунт</span>
      </button>
    `;
    
    // Позиционируем меню
    const button = event.target.closest('.action-btn') || event.target;
    const rect = button.getBoundingClientRect();
    
    // Пытаемся показать меню рядом с кнопкой, но внутри экрана
    let left = rect.right;
    let top = rect.bottom;
    
    // Если меню выходит за правый край экрана
    if (left + 220 > window.innerWidth) {
      left = rect.left - 220;
    }
    
    // Если меню выходит за нижний край экрана
    if (top + menu.offsetHeight > window.innerHeight) {
      top = rect.top - menu.offsetHeight;
    }
    
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
    
    // Добавляем меню
    document.body.appendChild(menu);
    
    // Стили для кнопок меню
    setTimeout(() => {
      menu.querySelectorAll('button').forEach(btn => {
        btn.style.display = 'flex';
        btn.style.alignItems = 'center';
        btn.style.gap = '10px';
        btn.style.width = '100%';
        btn.style.padding = '12px 20px';
        btn.style.background = 'none';
        btn.style.border = 'none';
        btn.style.color = '#e0e0e0';
        btn.style.textAlign = 'left';
        btn.style.cursor = 'pointer';
        btn.style.fontSize = '14px';
        btn.style.transition = 'all 0.3s';
        
        btn.addEventListener('mouseenter', () => {
          btn.style.background = 'rgba(255, 255, 255, 0.05)';
          btn.style.color = '#00adee';
        });
        
        btn.addEventListener('mouseleave', () => {
          btn.style.background = 'none';
          btn.style.color = '#e0e0e0';
        });
        
        if (btn.classList.contains('danger')) {
          btn.addEventListener('mouseenter', () => {
            btn.style.background = 'rgba(255, 85, 85, 0.1)';
            btn.style.color = '#ff5555';
          });
        }
      });
      
      // Добавляем разделитель
      const divider = menu.querySelector('.menu-divider');
      if (divider) {
        divider.style.height = '1px';
        divider.style.background = 'rgba(255, 255, 255, 0.1)';
        divider.style.margin = '8px 0';
      }
    }, 10);
    
    // Закрытие меню при клике вне его
    const closeMenu = (e) => {
      if (!menu.contains(e.target) && e.target !== button) {
        menu.remove();
        document.removeEventListener('click', closeMenu);
        document.removeEventListener('contextmenu', closeMenu);
      }
    };
    
    setTimeout(() => {
      document.addEventListener('click', closeMenu);
      document.addEventListener('contextmenu', closeMenu);
    }, 10);
  }

  async editAccount(accountId) {
    const account = accounts.find(a => a.id === accountId);
    if (!account) return;
    
    // Показываем модалку редактирования
    this.showAddAccountModal();
    
    // Заполняем форму данными аккаунта
    setTimeout(() => {
      document.getElementById('account-name').value = account.name;
      document.getElementById('steam-login').value = account.login;
      document.getElementById('account-country').value = account.country || 'ru';
      document.getElementById('farming-game').value = account.game?.toLowerCase() || 'cs2';
      
      // Находим radio кнопку с нужным значением
      const radio = document.querySelector(`input[name="isolation"][value="${account.isolation || 'maximum'}"]`);
      if (radio) radio.checked = true;
      
      this.dataManager.showNotification('Редактирование аккаунта', 'info');
    }, 100);
  }

  async deleteAccount(accountId) {
    const account = accounts.find(a => a.id === accountId);
    if (!account) return;
    
    if (confirm(`Вы уверены, что хотите удалить аккаунт "${account.name}"?\n\nЭто действие нельзя отменить.`)) {
      try {
        // Останавливаем аккаунт если он активен
        if (account.status !== 'offline') {
          await this.callAPI(`/accounts/${accountId}/stop`);
        }
        
        // Удаляем из локального списка
        const index = accounts.findIndex(a => a.id === accountId);
        if (index !== -1) {
          accounts.splice(index, 1);
          selectedAccounts.delete(accountId);
          this.updateAll();
          this.addLog(`Аккаунт "${account.name}" удален`, 'warning');
          this.dataManager.showNotification(`Аккаунт "${account.name}" удален`, 'warning');
        }
      } catch (error) {
        console.error('❌ Ошибка удаления аккаунта:', error);
        this.addLog(`Ошибка удаления аккаунта: ${error.message}`, 'error');
      }
    }
  }

  async rotateProxy(accountId) {
    try {
      const account = accounts.find(a => a.id === accountId);
      if (!account) return;
      
      if (account.status === 'offline') {
        this.dataManager.showNotification('Аккаунт должен быть онлайн для смены прокси', 'warning');
        return;
      }
      
      const response = await this.callAPI(`/accounts/${accountId}/rotate-proxy`);
      if (response && response.success) {
        account.proxy = response.newProxy;
        this.updateAll();
        this.addLog(`Прокси изменен для "${account.name}"`, 'info');
        this.dataManager.showNotification(`Прокси изменен для "${account.name}"`, 'success');
      }
    } catch (error) {
      console.error('❌ Ошибка смены прокси:', error);
      this.addLog(`Ошибка смены прокси: ${error.message}`, 'error');
    }
  }

  // ===== ТОРГОВАЯ ПЛОЩАДКА =====
  async sellItem(accountId, itemId) {
    try {
      const account = accounts.find(a => a.id === accountId);
      if (!account || !account.inventory) return;
      
      const itemIndex = account.inventory.findIndex(i => i.id === itemId);
      if (itemIndex === -1) return;
      
      const item = account.inventory[itemIndex];
      const price = parseFloat(prompt(`Введите цену для "${item.name}" ($):`, (item.price * 1.1).toFixed(2)));
      
      if (!price || price <= 0 || isNaN(price)) {
        this.dataManager.showNotification('Некорректная цена', 'error');
        return;
      }
      
      const response = await this.callAPI('/market/list', {
        accountId,
        itemId,
        price,
        duration: 7
      });
      
      if (response && response.success) {
        // Удаляем предмет из инвентаря
        account.inventory.splice(itemIndex, 1);
        
        // Добавляем в список продаж
        if (!account.marketListings) account.marketListings = [];
        account.marketListings.push(response.listing);
        
        this.updateAll();
        this.hideAllModals();
        
        this.addLog(`Предмет "${item.name}" выставлен на продажу за $${price}`, 'success');
        this.dataManager.showNotification(`"${item.name}" выставлен на продажу за $${price}`, 'success');
      }
    } catch (error) {
      console.error('❌ Ошибка продажи предмета:', error);
      this.addLog(`Ошибка продажи предмета: ${error.message}`, 'error');
    }
  }

  async cancelListing(accountId, listingId) {
    try {
      const account = accounts.find(a => a.id === accountId);
      if (!account || !account.marketListings) return;
      
      const listingIndex = account.marketListings.findIndex(l => l.id === listingId);
      if (listingIndex === -1) return;
      
      const listing = account.marketListings[listingIndex];
      
      if (confirm(`Снять с продажи "${listing.item?.name}" за $${listing.price}?`)) {
        // Возвращаем предмет в инвентарь
        if (listing.item && !account.inventory) account.inventory = [];
        if (listing.item) account.inventory.push(listing.item);
        
        // Удаляем листинг
        account.marketListings.splice(listingIndex, 1);
        
        this.updateAll();
        
        this.addLog(`Продажа отменена: ${listing.item?.name || 'Предмет'}`, 'info');
        this.dataManager.showNotification('Продажа отменена', 'info');
      }
    } catch (error) {
      console.error('❌ Ошибка отмены продажи:', error);
      this.addLog(`Ошибка отмены продажи: ${error.message}`, 'error');
    }
  }

  async quickSellAll() {
    try {
      let totalValue = 0;
      let itemsToSell = [];
      
      // Собираем все дешевые предметы
      accounts.forEach(account => {
        if (account.inventory && account.inventory.length > 0) {
          account.inventory.forEach(item => {
            if (item.price < 1.00) { // Продаем только дешевые предметы
              itemsToSell.push({
                accountId: account.id,
                item,
                price: item.price * 0.9 // Скидка 10%
              });
              totalValue += item.price * 0.9;
            }
          });
        }
      });
      
      if (itemsToSell.length === 0) {
        this.dataManager.showNotification('Нет дешевых предметов для продажи', 'info');
        return;
      }
      
      if (confirm(`Выставить на продажу ${itemsToSell.length} предметов на общую сумму $${totalValue.toFixed(2)}?`)) {
        // Здесь можно добавить массовую продажу
        this.dataManager.showNotification(`Подготовлено ${itemsToSell.length} предметов к продаже`, 'info');
        
        // Для демо просто показываем уведомление
        setTimeout(() => {
          this.dataManager.showNotification(`Выставлено ${itemsToSell.length} предметов на $${totalValue.toFixed(2)}`, 'success');
          this.addLog(`Быстрая продажа: ${itemsToSell.length} предметов на $${totalValue.toFixed(2)}`, 'success');
        }, 1000);
      }
    } catch (error) {
      console.error('❌ Ошибка быстрой продажи:', error);
      this.addLog(`Ошибка быстрой продажи: ${error.message}`, 'error');
    }
  }

  // ===== ОБНОВЛЕНИЕ ДАННЫХ =====
  updateAll() {
    this.updateStats();
    if (currentPageView === 'accounts') {
      this.renderAccounts();
    } else {
      this.updatePageContent(currentPageView);
    }
    
    // Автосохранение
    this.dataManager.saveData();
  }

  updateStats() {
    const total = accounts.length;
    const farming = accounts.filter(a => a.farming).length;
    const drops = accounts.filter(a => a.hasNewDrop).length;
    const risk = this.calculateRiskLevel();
    const totalProfit = accounts.reduce((sum, a) => sum + (a.totalProfit || 0), 0);
    
    // Обновляем статистику в сайдбаре
    this.updateElement('account-count', total);
    this.updateElement('farming-count', farming);
    this.updateElement('drop-count', drops);
    
    // Обновляем статистику на странице
    this.updateElement('total-accounts', total);
    this.updateElement('farming-now', farming);
    this.updateElement('drops-available', drops);
    this.updateElement('ban-risk', risk.level);
    this.updateElement('total-profit', `$${totalProfit.toFixed(2)}`);
    
    const riskElement = document.getElementById('ban-risk');
    if (riskElement) riskElement.style.color = risk.color;
    
    // Прокси статус
    const proxyCount = document.getElementById('proxy-count');
    if (proxyCount) {
      proxyCount.textContent = `${accounts.filter(a => a.proxy).length}/${accounts.length}`;
    }
    
    // Активные боты
    const botsActive = document.getElementById('bots-active');
    if (botsActive) {
      botsActive.textContent = `${accounts.filter(a => a.status !== 'offline').length}/${total}`;
    }
    
    // Количество отфильтрованных аккаунтов
    const filteredCount = document.getElementById('filtered-count');
    if (filteredCount) {
      filteredCount.textContent = this.getFilteredAccounts().length;
    }
  }

  updateElement(id, value) {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = value;
    }
  }

  updatePagination() {
    const prevBtn = document.getElementById('prev-page');
    const nextBtn = document.getElementById('next-page');
    const currentPageElement = document.getElementById('current-page');
    const totalPagesElement = document.getElementById('total-pages');
    
    if (prevBtn) prevBtn.disabled = currentPage <= 1;
    if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
    if (currentPageElement) currentPageElement.textContent = currentPage;
    if (totalPagesElement) totalPagesElement.textContent = totalPages;
  }

  changePage(delta) {
    const newPage = currentPage + delta;
    const filteredAccounts = this.getFilteredAccounts();
    totalPages = Math.ceil(filteredAccounts.length / pageSize);
    
    if (newPage >= 1 && newPage <= totalPages) {
      currentPage = newPage;
      this.renderAccounts();
    }
  }

  refreshAccounts() {
    this.addLog('Обновление списка аккаунтов...', 'info');
    this.updateAll();
    this.dataManager.showNotification('Список аккаунтов обновлен', 'success');
  }

  // ===== АВТООБНОВЛЕНИЕ =====
  startAutoUpdates() {
    // Очистить предыдущий интервал если есть
    if (this.updateStatsInterval) {
      clearInterval(this.updateStatsInterval);
    }
    
    // Обновляем время работы и статистику
    this.updateStatsInterval = setInterval(() => {
      try {
        accounts.forEach(account => {
          if (account.status !== 'offline') {
            // Увеличиваем время работы
            const hours = (account.farmingHours || 0) + 0.0167; // +1 минута
            account.farmingHours = parseFloat(hours.toFixed(2));
            
            const hrs = Math.floor(hours);
            const mins = Math.floor((hours - hrs) * 60);
            account.uptime = `${hrs}ч ${mins}м`;
            
            // Шанс получить дроп во время фарминга
            if (account.farming && Math.random() < 0.02) { // 2% шанс каждую минуту
              account.hasNewDrop = true;
              this.addLog(`Новый дроп доступен на "${account.name}"`, 'info');
            }
          }
        });
        
        this.updateAll();
      } catch (error) {
        console.error('❌ Ошибка в автообновлении:', error);
      }
    }, 60000); // Каждую минуту
  }

  startAutoSave() {
    // Очистить предыдущий интервал если есть
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
    }
    
    // Автосохранение каждые 30 секунд
    this.autoSaveInterval = setInterval(() => {
      if (isInitialized) {
        this.dataManager.saveData();
      }
    }, 30000);
  }

  // ===== ЛОГИРОВАНИЕ =====
  addLog(message, type = 'info') {
    const logEntry = {
      time: new Date().toLocaleTimeString(),
      message: message.substring(0, 500),
      type
    };
    
    logs.unshift(logEntry);
    
    // Жесткое ограничение на 100 записей
    if (logs.length > CONFIG.MAX_LOGS) {
      logs = logs.slice(0, CONFIG.MAX_LOGS);
    }
    
    this.updateLogs();
  }

  updateLogs() {
    if (isLogsPaused) return;
    
    const logsContainer = document.getElementById('system-logs');
    if (!logsContainer) return;
    
    const scrollPosition = logsContainer.scrollTop;
    const isAtBottom = logsContainer.scrollHeight - logsContainer.clientHeight <= scrollPosition + 10;
    
    logsContainer.innerHTML = logs.map(log => `
      <div class="log-entry ${log.type}">
        <span class="log-time">[${log.time}]</span>
        <span class="log-message">${log.message}</span>
      </div>
    `).join('');
    
    if (isAtBottom) {
      setTimeout(() => {
        logsContainer.scrollTop = logsContainer.scrollHeight;
      }, 10);
    }
  }

  // ===== API ВЫЗОВЫ =====
  async callAPI(endpoint, data = {}) {
    try {
      const response = await fetch(CONFIG.API_URL + endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data)
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('❌ API ошибка:', error);
      this.addLog(`API ошибка: ${error.message}`, 'error');
      return null;
    }
  }

  // ===== ДЕМО ДАННЫЕ =====
  async loadDemoData() {
    console.log('📂 Загрузка демо данных...');
    
    accounts = [
      {
        id: 'demo_1',
        name: 'Основной аккаунт',
        login: 'player_one',
        status: 'online',
        game: 'CS2',
        country: 'ru',
        uptime: '4ч 22м',
        farming: false,
        hasNewDrop: true,
        totalProfit: 45.75,
        totalDrops: 3,
        inventory: [
          { 
            id: '1', 
            name: 'AK-47 | Redline', 
            price: 15.50, 
            rarity: 'covert', 
            acquired: new Date().toISOString(),
            marketable: true,
            tradable: true
          },
          { 
            id: '2', 
            name: 'Prisma 2 Case', 
            price: 0.45, 
            rarity: 'common', 
            acquired: new Date().toISOString(),
            marketable: true,
            tradable: true
          }
        ],
        marketListings: [],
        isolation: 'maximum',
        proxy: { 
          ip: '195.24.76.123', 
          port: 8080, 
          city: 'Москва', 
          type: 'residential',
          provider: 'Rostelecom'
        },
        farmingHours: 4.5,
        createdAt: new Date(Date.now() - 86400000).toISOString(), // 1 день назад
        lastActivity: new Date().toISOString(),
        settings: {
          autoFarm: true,
          autoTrade: false,
          priceThreshold: 0.1,
          claimStrategy: 'most_expensive'
        }
      },
      {
        id: 'demo_2',
        name: 'Фарминг #1',
        login: 'farm_01',
        status: 'farming',
        game: 'CS2',
        country: 'de',
        uptime: '12ч 45м',
        farming: true,
        hasNewDrop: false,
        totalProfit: 120.50,
        totalDrops: 8,
        inventory: [
          { 
            id: '3', 
            name: 'AWP | Asiimov', 
            price: 45.00, 
            rarity: 'covert', 
            acquired: new Date().toISOString(),
            marketable: true,
            tradable: true
          }
        ],
        marketListings: [
          {
            id: 'listing_1',
            item: { 
              id: '4', 
              name: 'Operation Phoenix Case', 
              price: 0.85, 
              rarity: 'rare',
              acquired: new Date(Date.now() - 172800000).toISOString()
            },
            price: 0.90,
            listedAt: new Date(Date.now() - 86400000).toISOString(), // 1 день назад
            expiresAt: new Date(Date.now() + 518400000).toISOString(), // 6 дней осталось
            status: 'active',
            duration: 7
          }
        ],
        isolation: 'high',
        proxy: { 
          ip: '87.256.45.12', 
          port: 8080, 
          city: 'Берлин', 
          type: 'datacenter',
          provider: 'Hetzner'
        },
        farmingHours: 12.8,
        createdAt: new Date(Date.now() - 604800000).toISOString(), // 7 дней назад
        lastActivity: new Date().toISOString(),
        settings: {
          autoFarm: true,
          autoTrade: true,
          priceThreshold: 0.5,
          claimStrategy: 'most_expensive'
        }
      },
      {
        id: 'demo_3',
        name: 'Трейд аккаунт',
        login: 'trader_01',
        status: 'online',
        game: 'Dota 2',
        country: 'us',
        uptime: '2ч 15м',
        farming: false,
        hasNewDrop: true,
        totalProfit: 85.25,
        totalDrops: 12,
        inventory: [
          { 
            id: '5', 
            name: 'Arcana | Terrorblade', 
            price: 45.00, 
            rarity: 'arcana', 
            acquired: new Date().toISOString(),
            marketable: true,
            tradable: true
          },
          { 
            id: '6', 
            name: 'Immortal Treasure I', 
            price: 3.50, 
            rarity: 'rare', 
            acquired: new Date().toISOString(),
            marketable: true,
            tradable: true
          }
        ],
        marketListings: [
          {
            id: 'listing_2',
            item: { 
              id: '5', 
              name: 'Arcana | Terrorblade', 
              price: 45.00, 
              rarity: 'arcana',
              acquired: new Date(Date.now() - 259200000).toISOString()
            },
            price: 48.00,
            listedAt: new Date(Date.now() - 43200000).toISOString(), // 12 часов назад
            expiresAt: new Date(Date.now() + 561600000).toISOString(), // 6.5 дней осталось
            status: 'active',
            duration: 7
          }
        ],
        isolation: 'maximum',
        proxy: { 
          ip: '104.18.210.45', 
          port: 8080, 
          city: 'Нью-Йорк', 
          type: 'residential',
          provider: 'DigitalOcean'
        },
        farmingHours: 2.3,
        createdAt: new Date(Date.now() - 2592000000).toISOString(), // 30 дней назад
        lastActivity: new Date().toISOString(),
        settings: {
          autoFarm: false,
          autoTrade: true,
          priceThreshold: 10.0,
          claimStrategy: 'manual'
        }
      },
      {
        id: 'demo_4',
        name: 'Ферма #2',
        login: 'farm_02',
        status: 'offline',
        game: 'TF2',
        country: 'nl',
        uptime: '0ч 0м',
        farming: false,
        hasNewDrop: false,
        totalProfit: 25.80,
        totalDrops: 5,
        inventory: [
          { 
            id: '7', 
            name: 'Mann Co. Supply Crate Key', 
            price: 2.50, 
            rarity: 'common', 
            acquired: new Date().toISOString(),
            marketable: true,
            tradable: true
          }
        ],
        marketListings: [],
        isolation: 'medium',
        proxy: { 
          ip: '145.239.86.78', 
          port: 8080, 
          city: 'Амстердам', 
          type: 'residential',
          provider: 'OVH'
        },
        farmingHours: 8.2,
        createdAt: new Date(Date.now() - 86400000).toISOString(), // 1 день назад
        lastActivity: new Date(Date.now() - 86400000).toISOString(), // 1 день назад
        settings: {
          autoFarm: true,
          autoTrade: false,
          priceThreshold: 0.1,
          claimStrategy: 'random'
        }
      }
    ];
    
    console.log('✅ Демо данные загружены:', accounts.length, 'аккаунтов');
  }

  // ===== ДОПОЛНИТЕЛЬНЫЕ ФУНКЦИИ =====
  startGameFarming(game) {
    const accountsForGame = accounts.filter(a => a.game === game && a.status !== 'offline' && !a.farming);
    
    if (accountsForGame.length === 0) {
      this.dataManager.showNotification(`Нет онлайн аккаунтов для игры ${game}`, 'warning');
      return;
    }
    
    accountsForGame.forEach(account => {
      account.farming = true;
      account.status = 'farming';
      account.farmingHours = (account.farmingHours || 0) + 0.5;
    });
    
    this.updateAll();
    this.addLog(`Фарминг ${game} запущен на ${accountsForGame.length} аккаунтах`, 'success');
    this.dataManager.showNotification(`Фарминг ${game} запущен на ${accountsForGame.length} аккаунтах`, 'success');
  }

  openRandomInventory() {
    const accountsWithInventory = accounts.filter(a => a.inventory && a.inventory.length > 0);
    if (accountsWithInventory.length === 0) {
      this.dataManager.showNotification('Нет аккаунтов с инвентарем', 'info');
      return;
    }
    
    const randomAccount = accountsWithInventory[Math.floor(Math.random() * accountsWithInventory.length)];
    this.showInventoryModal(randomAccount.id);
  }

  saveFarmingSchedule() {
    this.dataManager.showNotification('Расписание фарминга сохранено', 'success');
    this.addLog('Расписание фарминга обновлено', 'info');
  }

  saveDropSettings() {
    this.dataManager.showNotification('Настройки дропов сохранены', 'success');
    this.addLog('Настройки дропов обновлены', 'info');
  }

  saveAllSettings() {
    this.dataManager.showNotification('Все настройки сохранены', 'success');
    this.addLog('Настройки системы сохранены', 'success');
  }

  resetSettings() {
    if (confirm('Вы уверены, что хотите сбросить все настройки к значениям по умолчанию?')) {
      this.dataManager.showNotification('Настройки сброшены', 'info');
      this.addLog('Настройки сброшены к значениям по умолчанию', 'info');
    }
  }

  createBackup() {
    const backup = this.dataManager.createBackup();
    if (backup) {
      this.dataManager.showNotification('Бэкап создан успешно', 'success');
      this.addLog('Ручной бэкап создан', 'success');
    }
  }

  restoreBackup() {
    this.dataManager.showNotification('Восстановление из бэкапа в разработке', 'info');
  }

  clearData() {
    if (confirm('⚠️ ВНИМАНИЕ!\n\nВы собираетесь удалить ВСЕ данные:\n• Все аккаунты\n• Всю статистику\n• Весь инвентарь\n• Все настройки\n\nЭто действие нельзя отменить!\n\nПродолжить?')) {
      this.dataManager.clearData();
      this.loadDemoData();
      this.updateAll();
      this.dataManager.showNotification('Все данные очищены', 'warning');
      this.addLog('Все данные системы очищены', 'warning');
    }
  }

  rotateAllProxies() {
    this.dataManager.showNotification('Смена прокси начата...', 'info');
    setTimeout(() => {
      this.dataManager.showNotification('Прокси успешно изменены', 'success');
      this.addLog('Прокси для всех аккаунтов обновлены', 'success');
    }, 2000);
  }

  emergencyStop() {
    if (confirm('⚠️ АВАРИЙНАЯ ОСТАНОВКА!\n\nВы собираетесь остановить ВСЕ аккаунты:\n• Все фарминг процессы\n• Все онлайн сессии\n• Все продажи\n\nПродолжить?')) {
      this.stopAllAccounts();
      this.dataManager.showNotification('Аварийная остановка выполнена', 'warning');
      this.addLog('Аварийная остановка всех аккаунтов', 'warning');
    }
  }

  importAccounts() {
    this.dataManager.showNotification('Функция импорта в разработке', 'info');
  }

  exportAccounts() {
    const dataStr = this.dataManager.exportData('json');
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `steam-accounts-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    this.addLog('Экспорт аккаунтов завершен', 'success');
    this.dataManager.showNotification('Аккаунты экспортированы в JSON', 'success');
  }

  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  // ===== ЧИСТКА =====
  cleanup() {
    if (this.updateStatsInterval) {
      clearInterval(this.updateStatsInterval);
    }
    
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
    }
    
    if (this.socket) {
      this.socket.disconnect();
    }
    
    console.log('🧹 Steam Manager очищен');
  }
}

// ===== ГЛОБАЛЬНЫЕ ОБРАБОТЧИКИ =====
let steamManager;

document.addEventListener('DOMContentLoaded', () => {
  console.log('📄 DOM загружен, инициализируем Steam Manager...');
  
  steamManager = new SteamManager();
  window.steamManager = steamManager;
  
  // Запускаем инициализацию
  steamManager.init();
  
  // Обработчик закрытия уведомлений
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('notification-close')) {
      const notification = e.target.closest('.notification');
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    }
  });
  
  // Обработчик перед закрытием страницы
  window.addEventListener('beforeunload', (e) => {
    if (steamManager) {
      steamManager.dataManager.saveData();
      steamManager.cleanup();
    }
  });
});

// Экспортируем для глобального доступа
if (typeof window !== 'undefined') {
  window.SteamManager = SteamManager;
}
