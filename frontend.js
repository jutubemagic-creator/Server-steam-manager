// ===== КОНФИГУРАЦИЯ =====
const CONFIG = {
  API_URL: window.location.origin.includes('localhost') 
    ? 'http://localhost:3000/api' 
    : '/api',
  SOCKET_URL: window.location.origin.includes('localhost')
    ? 'http://localhost:3000'
    : window.location.origin,
  VERSION: '2.0',
  AUTO_SAVE_INTERVAL: 30000,
  UPDATE_INTERVAL: 5000
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

// ===== ОСНОВНОЙ КЛАСС =====
class SteamManager {
  constructor() {
    this.initializeSocket();
    this.loadFromStorage();
    this.initEventListeners();
    this.updateAll();
    this.startAutoUpdates();
  }
  
  initializeSocket() {
    socket = io(CONFIG.SOCKET_URL);
    
    socket.on('connect', () => {
      this.addLog('Подключено к серверу', 'success');
      this.updateSystemStatus();
    });
    
    socket.on('disconnect', () => {
      this.addLog('Отключено от сервера', 'warning');
    });
    
    socket.on('status-update', (status) => {
      this.updateUIStatus(status);
    });
    
    socket.on('new-drop', (data) => {
      this.handleNewDrop(data);
    });
    
    socket.on('item-sold', (data) => {
      this.handleItemSold(data);
    });
    
    socket.on('bot-update', (data) => {
      this.updateBotStatus(data);
    });
    
    socket.on('command-success', (data) => {
      this.addLog(`Команда выполнена: ${data.command} для аккаунта ${data.accountId}`, 'success');
    });
    
    socket.on('command-error', (data) => {
      this.addLog(`Ошибка команды ${data.command}: ${data.error}`, 'error');
    });
  }
  
  async loadFromStorage() {
    const saved = localStorage.getItem('steam_manager_backup');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        accounts = data.accounts || [];
        this.addLog('Данные загружены из локального хранилища', 'info');
      } catch (e) {
        console.error('Ошибка загрузки:', e);
        await this.loadDemoData();
      }
    } else {
      await this.loadDemoData();
    }
  }
  
  async loadDemoData() {
    try {
      const response = await fetch(`${CONFIG.API_URL}/accounts`);
      if (response.ok) {
        accounts = await response.json();
        this.addLog('Данные загружены с сервера', 'success');
      } else {
        throw new Error('Сервер недоступен');
      }
    } catch (error) {
      console.log('Использую демо данные:', error);
      accounts = this.getDemoAccounts();
      this.addLog('Загружены демо данные', 'warning');
    }
  }
  
  getDemoAccounts() {
    return [
      {
        id: "demo_1",
        name: "Основной аккаунт",
        login: "player_one",
        status: "online",
        proxy: { country: "ru", ip: "195.24.76.123", type: "residential" },
        game: "CS2",
        uptime: "4ч 22м",
        farming: false,
        country: "ru",
        isolation: "maximum",
        lastDrop: { name: "Кейс Prisma 2", price: "$0.45", rarity: "rare" },
        lastDropTime: "2 часа назад",
        farmingHours: 12,
        hasNewDrop: true,
        creationDate: new Date().toISOString(),
        inventory: [
          { name: "AK-47 | Redline", price: 15.50, rarity: "covert" },
          { name: "Operation Broken Fang Case", price: 0.75, rarity: "common" }
        ],
        totalProfit: 45.75,
        totalDrops: 3,
        settings: {
          autoFarm: true,
          autoTrade: false,
          priceThreshold: 0.1
        }
      }
      // ... остальные демо аккаунты
    ];
  }
  
  async saveToStorage() {
    const data = {
      accounts: accounts,
      version: CONFIG.VERSION,
      lastSave: new Date().toISOString()
    };
    localStorage.setItem('steam_manager_backup', JSON.stringify(data));
  }
  
  async saveToServer() {
    try {
      const response = await fetch(`${CONFIG.API_URL}/accounts/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accounts })
      });
      
      if (response.ok) {
        console.log('Данные синхронизированы с сервером');
      }
    } catch (error) {
      console.error('Ошибка синхронизации:', error);
    }
  }
  
  // ===== ОСНОВНЫЕ МЕТОДЫ =====
  
  async addAccount(accountData) {
    try {
      const response = await fetch(`${CONFIG.API_URL}/accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(accountData)
      });
      
      if (response.ok) {
        const newAccount = await response.json();
        accounts.push(newAccount);
        
        this.addLog(`Добавлен аккаунт: ${newAccount.name}`, 'success');
        this.showNotification(`Аккаунт "${newAccount.name}" добавлен`, 'success');
        this.updateAll();
        this.saveToStorage();
        
        return newAccount;
      } else {
        throw new Error('Ошибка сервера');
      }
    } catch (error) {
      console.error('Ошибка добавления:', error);
      this.showNotification('Ошибка добавления аккаунта', 'error');
      return null;
    }
  }
  
  async toggleAccountStatus(accountId) {
    const account = accounts.find(a => a.id === accountId);
    if (!account) return;
    
    try {
      const command = account.status === 'offline' ? 'start' : 'stop';
      
      if (socket && socket.connected) {
        socket.emit('bot-command', {
          command: command,
          accountId: accountId
        });
      } else {
        // Локальная эмуляция если сокет не доступен
        account.status = account.status === 'offline' ? 'online' : 'offline';
        account.farming = false;
        
        if (account.status === 'online') {
          account.uptime = '0ч 1м';
          this.addLog(`Аккаунт запущен: ${account.name}`, 'success');
        } else {
          this.addLog(`Аккаунт остановлен: ${account.name}`, 'info');
        }
      }
      
      this.updateAll();
      this.saveToStorage();
    } catch (error) {
      console.error('Ошибка переключения статуса:', error);
      this.showNotification('Ошибка выполнения команды', 'error');
    }
  }
  
  async startFarming(accountId, game = 'CS2') {
    const account = accounts.find(a => a.id === accountId);
    if (!account) return;
    
    if (account.status === 'offline') {
      this.showNotification('Сначала запустите аккаунт!', 'warning');
      return;
    }
    
    try {
      if (socket && socket.connected) {
        socket.emit('bot-command', {
          command: 'farm',
          accountId: accountId,
          params: { game: game }
        });
      } else {
        // Локальная эмуляция
        account.status = 'farming';
        account.farming = true;
        account.currentGame = game;
        this.addLog(`Запущен фарминг на: ${account.name}`, 'success');
      }
      
      this.updateAll();
      this.saveToStorage();
    } catch (error) {
      console.error('Ошибка запуска фарминга:', error);
      this.showNotification('Ошибка запуска фарминга', 'error');
    }
  }
  
  async claimDrop(accountId, strategy = 'most_expensive') {
    const account = accounts.find(a => a.id === accountId);
    if (!account || !account.hasNewDrop) {
      this.showNotification('Нет доступных дропов!', 'warning');
      return null;
    }
    
    try {
      const response = await fetch(`${CONFIG.API_URL}/accounts/${accountId}/claim-drop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategy })
      });
      
      if (response.ok) {
        const result = await response.json();
        account.hasNewDrop = false;
        account.lastDrop = result.drop;
        account.totalDrops = (account.totalDrops || 0) + 1;
        account.totalProfit = (account.totalProfit || 0) + parseFloat(result.drop.price);
        
        if (account.inventory) {
          account.inventory.push({
            ...result.drop,
            id: `item_${Date.now()}`,
            acquired: new Date().toISOString()
          });
        }
        
        this.addLog(`${account.name}: Получен дроп ${result.drop.name}`, 'success');
        this.showNotification(`Дроп получен: ${result.drop.name}`, 'success');
        this.updateAll();
        this.saveToStorage();
        
        return result.drop;
      }
    } catch (error) {
      console.error('Ошибка получения дропа:', error);
      // Локальная эмуляция
      return this.claimDropLocal(account, strategy);
    }
  }
  
  claimDropLocal(account, strategy) {
    const drops = this.getGameDrops(account.game || 'CS2');
    let selectedDrop;
    
    switch(strategy) {
      case 'most_expensive':
        selectedDrop = drops.reduce((max, drop) => drop.price > max.price ? drop : max);
        break;
      case 'random':
        selectedDrop = drops[Math.floor(Math.random() * drops.length)];
        break;
      case 'cheapest':
        selectedDrop = drops.reduce((min, drop) => drop.price < min.price ? drop : min);
        break;
      default:
        selectedDrop = drops[0];
    }
    
    account.hasNewDrop = false;
    account.lastDrop = selectedDrop;
    account.totalDrops = (account.totalDrops || 0) + 1;
    account.totalProfit = (account.totalProfit || 0) + selectedDrop.price;
    
    if (!account.inventory) account.inventory = [];
    account.inventory.push({
      ...selectedDrop,
      id: `item_${Date.now()}`,
      acquired: new Date().toISOString()
    });
    
    return selectedDrop;
  }
  
  async listItemOnMarket(accountId, itemId, price) {
    try {
      const response = await fetch(`${CONFIG.API_URL}/market/list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          itemId,
          price
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        this.addLog(`Предмет выставлен на рынок за $${price}`, 'success');
        this.showNotification('Предмет выставлен на продажу', 'success');
        return result;
      }
    } catch (error) {
      console.error('Ошибка выставления предмета:', error);
      this.showNotification('Ошибка выставления на рынок', 'error');
      return null;
    }
  }
  
  async getMarketPrices(itemNames) {
    try {
      const response = await fetch(`${CONFIG.API_URL}/market/prices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: itemNames })
      });
      
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error('Ошибка получения цен:', error);
      return {};
    }
  }
  
  // ===== ИНТЕРФЕЙС =====
  
  updateAll() {
    this.updateStats();
    this.renderAccounts();
    this.updatePagination();
    this.updateSystemStatus();
  }
  
  updateStats() {
    const total = accounts.length;
    const farming = accounts.filter(a => a.farming).length;
    const online = accounts.filter(a => a.status !== 'offline').length;
    const drops = accounts.filter(a => a.hasNewDrop).length;
    const totalProfit = accounts.reduce((sum, acc) => sum + (acc.totalProfit || 0), 0);
    
    this.updateElement('account-count', total);
    this.updateElement('farming-count', farming);
    this.updateElement('drop-count', drops);
    this.updateElement('total-accounts', total);
    this.updateElement('farming-now', farming);
    this.updateElement('drops-available', drops);
    this.updateElement('total-profit', `$${totalProfit.toFixed(2)}`);
    
    // Расчет риска
    const risk = this.calculateRiskLevel();
    this.updateElement('ban-risk', risk.level);
    this.updateElement('ban-risk').style.color = risk.color;
  }
  
  calculateRiskLevel() {
    const highRiskCount = accounts.filter(a => 
      a.isolation === 'low' || 
      a.farmingHours > 100 ||
      (a.proxy && a.proxy.type === 'datacenter')
    ).length;
    
    const riskPercent = (highRiskCount / accounts.length) * 100;
    
    if (riskPercent > 50) return { level: 'Критический', color: '#ff0000' };
    if (riskPercent > 30) return { level: 'Высокий', color: '#ff5555' };
    if (riskPercent > 15) return { level: 'Средний', color: '#ffaa00' };
    return { level: 'Низкий', color: '#00ff88' };
  }
  
  renderAccounts() {
    const container = document.getElementById('accounts-list');
    if (!container) return;
    
    const filtered = this.getFilteredAccounts();
    const paged = this.getPagedAccounts(filtered);
    
    if (paged.length === 0) {
      container.innerHTML = this.getEmptyStateHTML();
      return;
    }
    
    container.innerHTML = paged.map(account => this.createAccountCardHTML(account)).join('');
    this.attachAccountEventHandlers();
  }
  
  createAccountCardHTML(account) {
    const isSelected = selectedAccounts.has(account.id);
    const hasDrop = account.hasNewDrop;
    const profit = account.totalProfit || 0;
    
    return `
      <div class="account-card ${isSelected ? 'selected' : ''}" data-id="${account.id}">
        <div class="col-checkbox">
          <input type="checkbox" class="account-checkbox" data-id="${account.id}" ${isSelected ? 'checked' : ''}>
        </div>
        <div class="account-info">
          <div class="avatar" style="background: ${this.getCountryColor(account.country)}">
            ${account.name.charAt(0)}
          </div>
          <div class="account-details">
            <h4>${account.name}</h4>
            <div class="account-meta">
              <span class="login">${account.login}</span>
              <span class="profit">$${profit.toFixed(2)}</span>
            </div>
          </div>
        </div>
        <div class="status-column">
          <span class="status-badge ${account.status}">
            ${this.getStatusText(account.status)}
          </span>
          <div class="uptime">${account.uptime || '0ч 0м'}</div>
        </div>
        <div class="proxy-column">
          <div class="proxy-info">
            <i class="fas fa-globe"></i>
            <span>${account.country?.toUpperCase() || 'AUTO'}</span>
          </div>
          <div class="proxy-type">${account.proxy?.type || 'unknown'}</div>
        </div>
        <div class="game-column">
          <div class="game-info">
            <div class="game-icon ${hasDrop ? 'has-drop' : ''}">
              <i class="fas fa-${this.getGameIcon(account.game)}"></i>
              ${hasDrop ? '<div class="drop-indicator"><i class="fas fa-gift"></i></div>' : ''}
            </div>
            <div class="game-name">${account.game || 'Не выбрана'}</div>
          </div>
        </div>
        <div class="stats-column">
          <div class="stats">
            <div class="stat">
              <i class="fas fa-gift"></i>
              <span>${account.totalDrops || 0}</span>
            </div>
            <div class="stat">
              <i class="fas fa-clock"></i>
              <span>${account.farmingHours?.toFixed(1) || 0}h</span>
            </div>
          </div>
        </div>
        <div class="actions-column">
          <div class="account-actions">
            <button class="action-btn ${account.status === 'offline' ? 'start' : 'stop'}" 
                    data-action="toggle" data-id="${account.id}">
              <i class="fas fa-${account.status === 'offline' ? 'play' : 'stop'}"></i>
            </button>
            <button class="action-btn farm ${account.farming ? 'active' : ''}" 
                    data-action="farm" data-id="${account.id}" 
                    ${account.status === 'offline' ? 'disabled' : ''}>
              <i class="fas fa-seedling"></i>
            </button>
            <button class="action-btn drop ${hasDrop ? 'has-drop' : ''}" 
                    data-action="claim-drop" data-id="${account.id}">
              <i class="fas fa-gift"></i>
            </button>
            <button class="action-btn market" data-action="market" data-id="${account.id}">
              <i class="fas fa-shopping-cart"></i>
            </button>
            <button class="action-btn settings" data-action="settings" data-id="${account.id}">
              <i class="fas fa-cog"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  }
  
  // ===== ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ =====
  
  getFilteredAccounts() {
    const status = document.getElementById('status-filter')?.value || 'all';
    const country = document.getElementById('country-filter')?.value || 'all';
    const game = document.getElementById('game-filter')?.value || 'all';
    const search = document.getElementById('search-accounts')?.value.toLowerCase() || '';
    
    return accounts.filter(account => {
      if (status !== 'all' && account.status !== status) return false;
      if (country !== 'all' && account.country !== country) return false;
      if (game !== 'all' && account.game !== game) return false;
      if (search && !account.name.toLowerCase().includes(search) && 
          !account.login.toLowerCase().includes(search)) return false;
      return true;
    });
  }
  
  getPagedAccounts(filtered) {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }
  
  updatePagination() {
    const filtered = this.getFilteredAccounts();
    totalPages = Math.ceil(filtered.length / pageSize) || 1;
    
    this.updateElement('current-page', currentPage);
    this.updateElement('total-pages', totalPages);
    this.updateElement('prev-page').disabled = currentPage === 1;
    this.updateElement('next-page').disabled = currentPage === totalPages;
  }
  
  updateElement(id, text) {
    const el = document.getElementById(id);
    if (el) {
      if (text !== undefined) el.textContent = text;
      return el;
    }
    return null;
  }
  
  // ===== СОБЫТИЯ =====
  
  initEventListeners() {
    // Кнопки управления
    this.setupButtonListeners();
    
    // Фильтры и поиск
    this.setupFilterListeners();
    
    // Пагинация
    this.setupPaginationListeners();
    
    // Модальные окна
    this.setupModalListeners();
    
    // Настройки и безопасность
    this.setupSettingsListeners();
  }
  
  setupButtonListeners() {
    // Добавление аккаунта
    document.getElementById('add-account')?.addEventListener('click', () => this.showAddAccountModal());
    document.getElementById('add-first-account')?.addEventListener('click', () => this.showAddAccountModal());
    
    // Массовые действия
    document.getElementById('select-all')?.addEventListener('click', () => this.selectAllVisible());
    document.getElementById('start-selected')?.addEventListener('click', () => this.startSelected());
    document.getElementById('stop-selected')?.addEventListener('click', () => this.stopSelected());
    
    // Быстрые действия
    document.getElementById('claim-all-drops')?.addEventListener('click', () => this.claimAllDrops());
    document.getElementById('start-all-farming')?.addEventListener('click', () => this.startAllFarming());
    document.getElementById('stop-all')?.addEventListener('click', () => this.stopAllAccounts());
    
    // Импорт/экспорт
    document.getElementById('import-accounts')?.addEventListener('click', () => this.importAccounts());
    document.getElementById('export-accounts')?.addEventListener('click', () => this.exportAccounts());
  }
  
  setupFilterListeners() {
    ['status-filter', 'country-filter', 'game-filter'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', () => {
        currentPage = 1;
        this.renderAccounts();
        this.updatePagination();
      });
    });
    
    const searchInput = document.getElementById('search-accounts');
    if (searchInput) {
      let searchTimeout;
      searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
          currentPage = 1;
          this.renderAccounts();
          this.updatePagination();
        }, 300);
      });
    }
  }
  
  // ... остальные методы setup
  
  // ===== МАССОВЫЕ ОПЕРАЦИИ =====
  
  async startSelected() {
    if (selectedAccounts.size === 0) {
      this.showNotification('Выберите аккаунты', 'warning');
      return;
    }
    
    let started = 0;
    for (const accountId of selectedAccounts) {
      const account = accounts.find(a => a.id === accountId);
      if (account && account.status === 'offline') {
        await this.toggleAccountStatus(accountId);
        started++;
        await this.delay(1000); // Задержка 1 секунда между запусками
      }
    }
    
    this.showNotification(`Запущено ${started} аккаунтов`, 'success');
  }
  
  async claimAllDrops() {
    const accountsWithDrops = accounts.filter(a => a.hasNewDrop && a.status !== 'offline');
    if (accountsWithDrops.length === 0) {
      this.showNotification('Нет доступных дропов', 'info');
      return;
    }
    
    let collected = 0;
    for (const account of accountsWithDrops) {
      const drop = await this.claimDrop(account.id, 'most_expensive');
      if (drop) collected++;
      await this.delay(500);
    }
    
    this.showNotification(`Собрано ${collected} дропов`, 'success');
  }
  
  // ===== МОДАЛЬНЫЕ ОКНА =====
  
  showAddAccountModal() {
    // Показать модальное окно добавления аккаунта
    document.getElementById('add-account-modal').classList.add('active');
  }
  
  showMarketModal(accountId) {
    const account = accounts.find(a => a.id === accountId);
    if (!account) return;
    
    // Создание модального окна торговой площадки
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = `
      <div class="modal-content wide-modal">
        <div class="modal-header">
          <h3><i class="fas fa-shopping-cart"></i> Торговая площадка - ${account.name}</h3>
          <button class="close-modal">&times;</button>
        </div>
        <div class="modal-body">
          <div class="market-tabs">
            <button class="tab-btn active" data-tab="inventory">Инвентарь</button>
            <button class="tab-btn" data-tab="sell">Продать</button>
            <button class="tab-btn" data-tab="buy">Купить</button>
            <button class="tab-btn" data-tab="listings">Мои продажи</button>
            <button class="tab-btn" data-tab="stats">Статистика</button>
          </div>
          <div class="tab-content active" id="market-inventory">
            ${this.getInventoryHTML(account)}
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    this.setupMarketModalListeners(modal, account);
  }
  
  getInventoryHTML(account) {
    if (!account.inventory || account.inventory.length === 0) {
      return `<div class="empty-inventory">Инвентарь пуст</div>`;
    }
    
    return `
      <div class="inventory-grid">
        ${account.inventory.map(item => `
          <div class="inventory-item" data-item-id="${item.id}">
            <div class="item-rarity ${item.rarity}"></div>
            <i class="fas fa-box-open"></i>
            <div class="item-name">${item.name}</div>
            <div class="item-price">$${item.price?.toFixed(2) || '0.00'}</div>
            <button class="btn btn-small btn-success sell-btn" 
                    data-item-id="${item.id}">
              <i class="fas fa-dollar-sign"></i> Продать
            </button>
          </div>
        `).join('')}
      </div>
    `;
  }
  
  // ===== УВЕДОМЛЕНИЯ И ЛОГИ =====
  
  addLog(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = { time: timestamp, message, type };
    
    logs.unshift(logEntry);
    if (logs.length > 200) logs.pop();
    
    if (!isLogsPaused) {
      this.updateLogs();
    }
  }
  
  showNotification(message, type = 'info', duration = 5000) {
    const container = document.getElementById('notifications');
    if (!container) return;
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
      <i class="fas fa-${this.getNotificationIcon(type)}"></i>
      <span>${message}</span>
      <button class="notification-close"><i class="fas fa-times"></i></button>
    `;
    
    container.appendChild(notification);
    
    // Анимация
    setTimeout(() => notification.classList.add('show'), 10);
    
    // Автоудаление
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    }, duration);
  }
  
  // ===== СИСТЕМНЫЕ МЕТОДЫ =====
  
  startAutoUpdates() {
    // Обновление времени работы
    setInterval(() => {
      accounts.forEach(account => {
        if (account.status !== 'offline') {
          // Обновляем время работы
          const timeMatch = account.uptime?.match(/(\d+)ч\s*(\d+)м/);
          if (timeMatch) {
            let hours = parseInt(timeMatch[1]);
            let minutes = parseInt(timeMatch[2]) + 1;
            
            if (minutes >= 60) {
              hours++;
              minutes = 0;
            }
            
            account.uptime = `${hours}ч ${minutes}м`;
          }
          
          // Обновляем часы фарминга
          if (account.farming) {
            account.farmingHours = (account.farmingHours || 0) + (1/60);
          }
        }
      });
      
      this.updateAll();
      this.saveToStorage();
      
      // Случайные события
      if (Math.random() > 0.8) {
        const randomAccount = accounts[Math.floor(Math.random() * accounts.length)];
        if (randomAccount?.status === 'farming' && Math.random() > 0.7) {
          randomAccount.hasNewDrop = true;
          this.addLog(`Новый дроп доступен: ${randomAccount.name}`, 'info');
          this.updateAll();
        }
      }
    }, 60000); // Каждую минуту
    
    // Автосохранение
    setInterval(() => {
      this.saveToStorage();
      this.saveToServer();
    }, CONFIG.AUTO_SAVE_INTERVAL);
  }
  
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  // ===== УТИЛИТЫ =====
  
  getCountryColor(country) {
    const colors = {
      'ru': 'linear-gradient(135deg, #0052B4, #D52B1E)',
      'us': 'linear-gradient(135deg, #3C3B6E, #B22234)',
      'de': 'linear-gradient(135deg, #000000, #DD0000, #FFCC00)',
      'fr': 'linear-gradient(135deg, #002654, #ED2939)',
      'nl': 'linear-gradient(135deg, #AE1C28, #21468B)'
    };
    return colors[country] || 'linear-gradient(135deg, #666, #999)';
  }
  
  getStatusText(status) {
    const texts = {
      'online': 'Online',
      'farming': 'Фарминг',
      'offline': 'Offline',
      'trading': 'Торговля',
      'error': 'Ошибка'
    };
    return texts[status] || 'Offline';
  }
  
  getGameIcon(game) {
    const icons = {
      'CS2': 'fa-crosshairs',
      'CS:GO': 'fa-crosshairs',
      'Dota 2': 'fa-dragon',
      'Team Fortress 2': 'fa-hat-cowboy'
    };
    return icons[game] || 'fa-gamepad';
  }
  
  getNotificationIcon(type) {
    const icons = {
      'info': 'info-circle',
      'success': 'check-circle',
      'warning': 'exclamation-triangle',
      'error': 'exclamation-circle'
    };
    return icons[type] || 'info-circle';
  }
  
  getGameDrops(game) {
    const drops = {
      'CS2': [
        { name: "Кейс Prisma 2", price: 0.45, rarity: "rare" },
        { name: "AK-47 | Redline", price: 15.50, rarity: "covert" },
        { name: "★ Butterfly Knife", price: 1200.00, rarity: "extraordinary" }
      ],
      'Dota 2': [
        { name: "Arcana | Terrorblade", price: 35.00, rarity: "arcana" },
        { name: "Immortal Treasure III", price: 3.50, rarity: "immortal" }
      ]
    };
    return drops[game] || drops['CS2'];
  }
  
  // ===== ОБРАБОТЧИКИ СОБЫТИЙ СЕРВЕРА =====
  
  handleNewDrop(data) {
    const account = accounts.find(a => a.id === data.accountId);
    if (account) {
      account.hasNewDrop = true;
      this.addLog(`Новый дроп на ${account.name}: ${data.drop.name}`, 'info');
      this.showNotification(`Новый дроп на ${account.name}!`, 'info');
      this.updateAll();
    }
  }
  
  handleItemSold(data) {
    const account = accounts.find(a => a.id === data.accountId);
    if (account) {
      this.addLog(`Продажа: ${data.item.name} за $${data.listing.price}`, 'success');
      this.showNotification(`Продано: ${data.item.name}`, 'success');
      this.updateAll();
    }
  }
  
  updateBotStatus(data) {
    const account = accounts.find(a => a.id === data.accountId);
    if (account) {
      Object.assign(account, data.updates);
      this.updateAll();
    }
  }
  
  updateSystemStatus() {
    if (socket && socket.connected) {
      socket.emit('get-status');
    }
  }
  
  updateUIStatus(status) {
    this.updateElement('system-status', status.online ? 'Онлайн' : 'Оффлайн');
    this.updateElement('bots-active', `${status.botsActive}/${accounts.length}`);
    
    // Обновление использования памяти
    if (status.memoryUsage) {
      const usage = (status.memoryUsage.heapUsed / status.memoryUsage.heapTotal * 100).toFixed(1);
      this.updateElement('memory-usage', `${usage}%`);
    }
  }
  
  // ===== ЗАВЕРШЕНИЕ =====
  
  cleanup() {
    if (updateInterval) clearInterval(updateInterval);
    if (socket) socket.disconnect();
    this.saveToStorage();
  }
}

// ===== ИНИЦИАЛИЗАЦИЯ =====
let steamManager;

document.addEventListener('DOMContentLoaded', () => {
  steamManager = new SteamManager();
  
  // Глобальный обработчик уведомлений
  document.addEventListener('click', (e) => {
    if (e.target.closest('.notification-close')) {
      const notification = e.target.closest('.notification');
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    }
  });
  
  // Обработчик перед закрытием
  window.addEventListener('beforeunload', () => {
    if (steamManager) {
      steamManager.cleanup();
    }
  });
});

// Глобальные функции для HTML
window.steamManager = steamManager;
