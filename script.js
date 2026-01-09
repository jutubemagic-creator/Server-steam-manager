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
    this.loadAccounts();
    this.initEventListeners();
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
    
    socket.on('accounts-update', (data) => {
      accounts = data;
      this.updateAll();
    });
    
    socket.on('account-updated', (data) => {
      const index = accounts.findIndex(a => a.id === data.accountId);
      if (index !== -1) {
        accounts[index] = { ...accounts[index], ...data.updates };
        this.updateAll();
      }
    });
    
    socket.on('new-drop', (data) => {
      this.handleNewDrop(data);
    });
    
    socket.on('drop-claimed', (data) => {
      this.handleDropClaimed(data);
    });
    
    socket.on('item-sold', (data) => {
      this.handleItemSold(data);
    });
    
    socket.on('command-success', (data) => {
      this.addLog(`Команда выполнена: ${data.command}`, 'success');
    });
    
    socket.on('command-error', (data) => {
      this.addLog(`Ошибка: ${data.error}`, 'error');
    });
    
    socket.on('system-log', (log) => {
      this.addLog(log.message, log.type);
    });
  }
  
  async loadAccounts() {
    try {
      const response = await fetch(`${CONFIG.API_URL}/accounts`);
      if (response.ok) {
        accounts = await response.json();
        this.updateAll();
        this.addLog(`Загружено ${accounts.length} аккаунтов`, 'success');
      }
    } catch (error) {
      console.error('Ошибка загрузки:', error);
      this.addLog('Не удалось загрузить аккаунты', 'error');
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
        
        return newAccount;
      } else {
        const error = await response.json();
        throw new Error(error.error || 'Ошибка сервера');
      }
    } catch (error) {
      console.error('Ошибка добавления:', error);
      this.showNotification(`Ошибка: ${error.message}`, 'error');
      return null;
    }
  }
  
  async toggleAccountStatus(accountId) {
    try {
      const account = accounts.find(a => a.id === accountId);
      if (!account) return;
      
      const endpoint = account.status === 'offline' ? 'start' : 'stop';
      const response = await fetch(`${CONFIG.API_URL}/accounts/${accountId}/${endpoint}`, {
        method: 'POST'
      });
      
      if (response.ok) {
        this.addLog(`Аккаунт ${account.name} ${endpoint === 'start' ? 'запущен' : 'остановлен'}`, 'success');
        this.loadAccounts(); // Перезагружаем аккаунты
      }
    } catch (error) {
      console.error('Ошибка:', error);
      this.showNotification('Ошибка выполнения команды', 'error');
    }
  }
  
  async startFarming(accountId, game) {
    try {
      const response = await fetch(`${CONFIG.API_URL}/accounts/${accountId}/farm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game })
      });
      
      if (response.ok) {
        this.addLog(`Запущен фарминг на аккаунте`, 'success');
        this.loadAccounts();
      }
    } catch (error) {
      console.error('Ошибка:', error);
      this.showNotification('Ошибка запуска фарминга', 'error');
    }
  }
  
  async claimDrop(accountId, strategy = 'most_expensive') {
    try {
      const response = await fetch(`${CONFIG.API_URL}/accounts/${accountId}/claim-drop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategy })
      });
      
      if (response.ok) {
        const result = await response.json();
        this.showNotification(`Дроп получен: ${result.drop.name}`, 'success');
        this.loadAccounts();
        return result.drop;
      }
    } catch (error) {
      console.error('Ошибка:', error);
      this.showNotification('Ошибка получения дропа', 'error');
      return null;
    }
  }
  
  async listItemOnMarket(accountId, itemId, price) {
    try {
      const response = await fetch(`${CONFIG.API_URL}/market/list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, itemId, price })
      });
      
      if (response.ok) {
        const result = await response.json();
        this.showNotification(`Предмет выставлен за $${price}`, 'success');
        this.loadAccounts();
        return result.listing;
      }
    } catch (error) {
      console.error('Ошибка:', error);
      this.showNotification('Ошибка выставления на рынок', 'error');
      return null;
    }
  }
  
  async bulkAction(action, accountIds, params = {}) {
    try {
      const response = await fetch(`${CONFIG.API_URL}/bulk-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, accountIds, params })
      });
      
      if (response.ok) {
        const result = await response.json();
        this.showNotification(`Массовое действие выполнено`, 'success');
        this.loadAccounts();
        return result.results;
      }
    } catch (error) {
      console.error('Ошибка:', error);
      this.showNotification('Ошибка массового действия', 'error');
      return [];
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
    const totalDrops = accounts.reduce((sum, acc) => sum + (acc.totalDrops || 0), 0);
    
    this.updateElement('account-count', total);
    this.updateElement('farming-count', farming);
    this.updateElement('drop-count', drops);
    this.updateElement('total-accounts', total);
    this.updateElement('farming-now', farming);
    this.updateElement('drops-available', drops);
    this.updateElement('total-profit', `$${totalProfit.toFixed(2)}`);
    
    // Обновление в заголовке таблицы
    this.updateElement('filtered-count', total);
    
    // Расчет риска
    const risk = this.calculateRiskLevel();
    this.updateElement('ban-risk', risk.level);
    this.updateElement('ban-risk').style.color = risk.color;
  }
  
  calculateRiskLevel() {
    if (accounts.length === 0) return { level: 'Низкий', color: '#00ff88' };
    
    const highRiskCount = accounts.filter(a => 
      a.isolation === 'medium' || 
      a.isolation === 'low' ||
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
    const statusClass = account.status;
    const uptime = account.uptime || '0ч 0м';
    const game = account.game || 'Не выбрана';
    const drops = account.totalDrops || 0;
    const farmingHours = account.farmingHours?.toFixed(1) || '0';
    
    return `
      <div class="account-card ${isSelected ? 'selected' : ''}" data-id="${account.id}">
        <div class="col-checkbox">
          <input type="checkbox" class="account-checkbox" data-id="${account.id}" ${isSelected ? 'checked' : ''}>
        </div>
        <div class="col-account">
          <div class="account-info">
            <div class="avatar" style="${this.getAvatarStyle(account.country)}">
              ${account.name.charAt(0).toUpperCase()}
            </div>
            <div class="account-details">
              <h4>${account.name}</h4>
              <div class="account-meta">
                <span class="login">${account.login}</span>
                <span class="profit">$${profit.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
        <div class="col-status">
          <span class="status-badge ${statusClass}">
            ${this.getStatusText(account.status)}
          </span>
          <div class="uptime">${uptime}</div>
        </div>
        <div class="col-proxy">
          <div class="proxy-info">
            <i class="fas fa-globe"></i>
            <span>${account.country?.toUpperCase() || 'AUTO'}</span>
          </div>
          <div class="proxy-type">${account.isolation || 'unknown'}</div>
        </div>
        <div class="col-game">
          <div class="game-info">
            <div class="game-icon ${hasDrop ? 'has-drop' : ''}">
              <i class="fas fa-${this.getGameIcon(game)}"></i>
              ${hasDrop ? '<div class="drop-indicator"><i class="fas fa-gift"></i></div>' : ''}
            </div>
            <div class="game-name">${game}</div>
          </div>
        </div>
        <div class="col-uptime">
          <div class="stats">
            <div class="stat">
              <i class="fas fa-gift"></i>
              <span>${drops}</span>
            </div>
            <div class="stat">
              <i class="fas fa-clock"></i>
              <span>${farmingHours}h</span>
            </div>
          </div>
        </div>
        <div class="col-actions">
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
  
  getAvatarStyle(country) {
    const colors = {
      'ru': 'linear-gradient(135deg, #0052B4, #D52B1E)',
      'us': 'linear-gradient(135deg, #3C3B6E, #B22234)',
      'de': 'linear-gradient(135deg, #000000, #DD0000, #FFCC00)',
      'fr': 'linear-gradient(135deg, #002654, #ED2939)',
      'eu': 'linear-gradient(135deg, #003399, #FFCC00)',
      'auto': 'linear-gradient(135deg, #666, #999)'
    };
    return `background: ${colors[country] || colors.auto}`;
  }
  
  getStatusText(status) {
    const texts = {
      'online': 'Online',
      'farming': 'Фарминг',
      'offline': 'Offline',
      'trading': 'Торговля',
      'error': 'Ошибка'
    };
    return texts[status] || status;
  }
  
  getGameIcon(game) {
    const icons = {
      'CS2': 'fa-crosshairs',
      'CS:GO': 'fa-crosshairs',
      'Dota 2': 'fa-dragon',
      'Team Fortress 2': 'fa-hat-cowboy',
      'TF2': 'fa-hat-cowboy'
    };
    return icons[game] || 'fa-gamepad';
  }
  
  getEmptyStateHTML() {
    return `
      <div class="empty-state">
        <i class="fas fa-user-plus fa-3x"></i>
        <h3>Нет добавленных аккаунтов</h3>
        <p>Добавьте свой первый аккаунт Steam для начала работы</p>
        <button class="btn btn-primary" id="add-first-account">
          <i class="fas fa-plus"></i> Добавить первый аккаунт
        </button>
      </div>
    `;
  }
  
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
    
    const prevBtn = this.updateElement('prev-page');
    const nextBtn = this.updateElement('next-page');
    
    if (prevBtn) prevBtn.disabled = currentPage === 1;
    if (nextBtn) nextBtn.disabled = currentPage === totalPages;
    
    this.updateElement('filtered-count', filtered.length);
  }
  
  updateElement(id, text) {
    const el = document.getElementById(id);
    if (el) {
      if (text !== undefined) el.textContent = text;
      return el;
    }
    return null;
  }
  
  updateSystemStatus() {
    if (socket && socket.connected) {
      this.updateElement('network-status', 'Стабильная');
      this.updateElement('system-status').textContent = 'Активна';
    } else {
      this.updateElement('network-status', 'Нет соединения');
      this.updateElement('system-status').textContent = 'Оффлайн';
    }
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
    
    // Общие обработчики
    this.setupGeneralListeners();
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
    
    // Обновление
    document.getElementById('refresh-list')?.addEventListener('click', () => this.loadAccounts());
    
    // Дропы
    document.getElementById('check-drops')?.addEventListener('click', () => this.checkAllDrops());
    
    // Логи
    document.getElementById('clear-logs')?.addEventListener('click', () => this.clearLogs());
    document.getElementById('pause-logs')?.addEventListener('click', () => this.toggleLogsPause());
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
  
  setupPaginationListeners() {
    document.getElementById('prev-page')?.addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage--;
        this.renderAccounts();
        this.updatePagination();
      }
    });
    
    document.getElementById('next-page')?.addEventListener('click', () => {
      if (currentPage < totalPages) {
        currentPage++;
        this.renderAccounts();
        this.updatePagination();
      }
    });
    
    document.getElementById('page-size')?.addEventListener('change', (e) => {
      pageSize = parseInt(e.target.value);
      currentPage = 1;
      this.renderAccounts();
      this.updatePagination();
    });
  }
  
  setupModalListeners() {
    // Закрытие модальных окон
    document.querySelectorAll('.close-modal').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.target.closest('.modal').classList.remove('active');
      });
    });
    
    // Клик вне модального окна
    document.querySelectorAll('.modal').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.remove('active');
        }
      });
    });
    
    // Табы в модальных окнах
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tab = e.target.dataset.tab || e.target.closest('.tab-btn').dataset.tab;
        const modal = e.target.closest('.modal');
        
        // Скрыть все табы
        modal.querySelectorAll('.tab-content').forEach(content => {
          content.classList.remove('active');
        });
        
        // Убрать активный класс со всех кнопок
        modal.querySelectorAll('.tab-btn').forEach(tabBtn => {
          tabBtn.classList.remove('active');
        });
        
        // Показать выбранный таб
        modal.querySelector(`#tab-${tab}`)?.classList.add('active');
        e.target.classList.add('active');
      });
    });
    
    // Сохранение аккаунта
    document.getElementById('save-account')?.addEventListener('click', () => this.saveNewAccount());
    
    // Массовые действия
    document.getElementById('execute-bulk-action')?.addEventListener('click', () => this.executeBulkAction());
    
    // Карточки массовых действий
    document.querySelectorAll('.bulk-action-card').forEach(card => {
      card.addEventListener('click', (e) => {
        const action = e.currentTarget.dataset.action;
        this.selectBulkAction(action);
      });
    });
  }
  
  setupGeneralListeners() {
    // Обработчик выбора аккаунтов
    document.addEventListener('change', (e) => {
      if (e.target.classList.contains('account-checkbox')) {
        const accountId = e.target.dataset.id;
        if (e.target.checked) {
          selectedAccounts.add(accountId);
        } else {
          selectedAccounts.delete(accountId);
        }
        
        // Обновляем класс selected для карточки
        const card = e.target.closest('.account-card');
        if (card) {
          card.classList.toggle('selected', e.target.checked);
        }
      }
      
      // Выбор всех аккаунтов
      if (e.target.id === 'select-all-checkbox') {
        const checkboxes = document.querySelectorAll('.account-checkbox');
        checkboxes.forEach(checkbox => {
          checkbox.checked = e.target.checked;
          const accountId = checkbox.dataset.id;
          if (e.target.checked) {
            selectedAccounts.add(accountId);
          } else {
            selectedAccounts.delete(accountId);
          }
        });
        
        // Обновляем класс selected для всех карточек
        document.querySelectorAll('.account-card').forEach(card => {
          card.classList.toggle('selected', e.target.checked);
        });
      }
    });
    
    // Обработчик действий аккаунта
    document.addEventListener('click', (e) => {
      const actionBtn = e.target.closest('.action-btn');
      if (actionBtn) {
        const action = actionBtn.dataset.action;
        const accountId = actionBtn.dataset.id;
        
        switch(action) {
          case 'toggle':
            this.toggleAccountStatus(accountId);
            break;
          case 'farm':
            this.showFarmingModal(accountId);
            break;
          case 'claim-drop':
            this.showDropSelectionModal(accountId);
            break;
          case 'market':
            this.showMarketModal(accountId);
            break;
          case 'settings':
            this.showAccountSettingsModal(accountId);
            break;
        }
      }
    });
  }
  
  attachAccountEventHandlers() {
    // Обработчики уже подключены через делегирование в setupGeneralListeners
  }
  
  // ===== МОДАЛЬНЫЕ ОКНА =====
  
  showAddAccountModal() {
    document.getElementById('add-account-modal').classList.add('active');
  }
  
  async saveNewAccount() {
    const modal = document.getElementById('add-account-modal');
    const activeTab = modal.querySelector('.tab-content.active').id;
    
    let accountData = {
      login: document.getElementById('steam-login').value,
      password: document.getElementById('steam-password').value,
      sharedSecret: document.getElementById('steam-shared-secret').value,
      name: document.getElementById('account-name').value || undefined,
      country: document.getElementById('account-country').value,
      game: document.getElementById('farming-game').value,
      isolation: modal.querySelector('input[name="isolation"]:checked')?.value || 'high',
      autoFarm: document.getElementById('auto-farm').checked,
      autoTrade: document.getElementById('enable-trading').checked,
      priceThreshold: 0.1
    };
    
    // Обработка множественного добавления
    if (activeTab === 'tab-multiple') {
      const accountsText = document.getElementById('multiple-accounts').value;
      const lines = accountsText.split('\n').filter(line => line.trim());
      
      for (const line of lines) {
        const [login, password, name] = line.split(':');
        if (login && password) {
          await this.addAccount({
            ...accountData,
            login: login.trim(),
            password: password.trim(),
            name: (name || login).trim()
          });
          
          // Задержка между добавлением
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    } else {
      await this.addAccount(accountData);
    }
    
    modal.classList.remove('active');
    this.resetAddAccountForm();
  }
  
  resetAddAccountForm() {
    document.getElementById('account-name').value = '';
    document.getElementById('steam-login').value = '';
    document.getElementById('steam-password').value = '';
    document.getElementById('steam-shared-secret').value = '';
    document.getElementById('multiple-accounts').value = '';
  }
  
  showFarmingModal(accountId) {
    const account = accounts.find(a => a.id === accountId);
    if (!account) return;
    
    const modal = this.createModal(`
      <div class="modal-content">
        <div class="modal-header">
          <h3><i class="fas fa-seedling"></i> Начать фарминг</h3>
          <button class="close-modal">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label for="farm-game-select"><i class="fas fa-gamepad"></i> Выберите игру</label>
            <select id="farm-game-select" class="form-control">
              <option value="CS2" ${account.game === 'CS2' ? 'selected' : ''}>CS2</option>
              <option value="CS:GO" ${account.game === 'CS:GO' ? 'selected' : ''}>CS:GO</option>
              <option value="Dota 2" ${account.game === 'Dota 2' ? 'selected' : ''}>Dota 2</option>
              <option value="TF2" ${account.game === 'TF2' ? 'selected' : ''}>Team Fortress 2</option>
            </select>
          </div>
          <div class="form-group">
            <label for="farm-hours"><i class="fas fa-clock"></i> Время фарминга (часы)</label>
            <input type="number" id="farm-hours" class="form-control" min="1" max="24" value="4">
          </div>
          <div class="form-group">
            <label><i class="fas fa-shield-alt"></i> Настройки безопасности</label>
            <div class="checkbox-group">
              <label>
                <input type="checkbox" id="farm-safety" checked>
                <span>Включить эмуляцию человека</span>
              </label>
              <label>
                <input type="checkbox" id="farm-random-breaks" checked>
                <span>Случайные перерывы</span>
              </label>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary close-modal">Отмена</button>
          <button class="btn btn-success" id="start-farming-btn" data-account-id="${accountId}">
            <i class="fas fa-play"></i> Начать фарминг
          </button>
        </div>
      </div>
    `);
    
    document.body.appendChild(modal);
    
    modal.querySelector('#start-farming-btn').addEventListener('click', () => {
      const game = modal.querySelector('#farm-game-select').value;
      this.startFarming(accountId, game);
      modal.remove();
    });
  }
  
  showDropSelectionModal(accountId) {
    const account = accounts.find(a => a.id === accountId);
    if (!account) return;
    
    currentDropAccountId = accountId;
    
    document.getElementById('drop-account-name').textContent = account.name;
    document.getElementById('drop-selection-modal').classList.add('active');
    
    // Загрузка доступных дропов
    this.loadAvailableDrops(accountId);
  }
  
  async loadAvailableDrops(accountId) {
    try {
      const response = await fetch(`${CONFIG.API_URL}/accounts/${accountId}/inventory`);
      if (response.ok) {
        const inventory = await response.json();
        const dropsGrid = document.querySelector('.drops-grid');
        
        if (inventory.length === 0) {
          dropsGrid.innerHTML = '<div class="empty-state">Нет доступных дропов</div>';
          return;
        }
        
        dropsGrid.innerHTML = inventory.map(item => `
          <div class="drop-item" data-item-id="${item.id}">
            <i class="fas fa-box-open"></i>
            <div class="drop-rarity ${item.rarity}"></div>
            <h5>${item.name}</h5>
            <div class="drop-price">$${item.price.toFixed(2)}</div>
          </div>
        `).join('');
      }
    } catch (error) {
      console.error('Ошибка загрузки дропов:', error);
    }
  }
  
  showMarketModal(accountId) {
    const account = accounts.find(a => a.id === accountId);
    if (!account) return;
    
    const modal = this.createMarketModal(account);
    document.body.appendChild(modal);
  }
  
  createMarketModal(account) {
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
            <button class="tab-btn active" data-tab="inventory">Инвентарь (${account.inventory?.length || 0})</button>
            <button class="tab-btn" data-tab="listings">Мои продажи</button>
            <button class="tab-btn" data-tab="stats">Статистика</button>
          </div>
          <div class="tab-content active" id="market-inventory">
            ${this.getInventoryHTML(account)}
          </div>
          <div class="tab-content" id="market-listings">
            <div class="empty-state">
              <i class="fas fa-receipt fa-3x"></i>
              <p>Нет активных продаж</p>
            </div>
          </div>
          <div class="tab-content" id="market-stats">
            <div class="stats-grid">
              <div class="stat-card blue">
                <i class="fas fa-dollar-sign"></i>
                <div>
                  <h3>Общая прибыль</h3>
                  <p class="stat-value">$${account.totalProfit?.toFixed(2) || '0.00'}</p>
                </div>
              </div>
              <div class="stat-card green">
                <i class="fas fa-gift"></i>
                <div>
                  <h3>Всего дропов</h3>
                  <p class="stat-value">${account.totalDrops || 0}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    
    // Обработчики табов
    modal.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tab = e.target.dataset.tab;
        
        // Скрыть все табы
        modal.querySelectorAll('.tab-content').forEach(content => {
          content.classList.remove('active');
        });
        
        // Убрать активный класс со всех кнопок
        modal.querySelectorAll('.tab-btn').forEach(tabBtn => {
          tabBtn.classList.remove('active');
        });
        
        // Показать выбранный таб
        modal.querySelector(`#market-${tab}`)?.classList.add('active');
        e.target.classList.add('active');
      });
    });
    
    // Обработчики кнопок продажи
    modal.addEventListener('click', (e) => {
      if (e.target.classList.contains('sell-btn') || e.target.closest('.sell-btn')) {
        const itemId = e.target.dataset.itemId || e.target.closest('.sell-btn').dataset.itemId;
        this.showSellItemModal(account.id, itemId);
      }
    });
    
    return modal;
  }
  
  getInventoryHTML(account) {
    if (!account.inventory || account.inventory.length === 0) {
      return `
        <div class="empty-inventory">
          <i class="fas fa-box-open fa-3x"></i>
          <p>Инвентарь пуст</p>
          <p class="small">Дропы появятся во время фарминга</p>
        </div>
      `;
    }
    
    return `
      <div class="inventory-grid">
        ${account.inventory.map(item => `
          <div class="inventory-item" data-item-id="${item.id}">
            <div class="item-rarity ${item.rarity}"></div>
            <i class="fas fa-box-open"></i>
            <div class="item-name">${item.name}</div>
            <div class="item-price">$${item.price?.toFixed(2) || '0.00'}</div>
            <button class="btn btn-small btn-success sell-btn" data-item-id="${item.id}">
              <i class="fas fa-dollar-sign"></i> Продать
            </button>
          </div>
        `).join('')}
      </div>
    `;
  }
  
  showSellItemModal(accountId, itemId) {
    const account = accounts.find(a => a.id === accountId);
    const item = account?.inventory?.find(i => i.id === itemId);
    
    if (!account || !item) return;
    
    const modal = this.createModal(`
      <div class="modal-content">
        <div class="modal-header">
          <h3><i class="fas fa-dollar-sign"></i> Продать предмет</h3>
          <button class="close-modal">&times;</button>
        </div>
        <div class="modal-body">
          <div class="item-preview">
            <div class="item-icon">
              <i class="fas fa-box-open fa-2x"></i>
            </div>
            <div class="item-details">
              <h4>${item.name}</h4>
              <p class="item-rarity ${item.rarity}">${this.getRarityText(item.rarity)}</p>
              <p class="item-description">Текущая цена: <strong>$${item.price.toFixed(2)}</strong></p>
            </div>
          </div>
          
          <div class="form-group">
            <label for="sell-price"><i class="fas fa-tag"></i> Цена продажи ($)</label>
            <input type="number" id="sell-price" class="form-control" 
                   min="${(item.price * 0.9).toFixed(2)}" 
                   max="${(item.price * 2).toFixed(2)}" 
                   step="0.01" 
                   value="${item.price.toFixed(2)}">
            <small>Рекомендуемая цена: $${item.price.toFixed(2)}</small>
          </div>
          
          <div class="form-group">
            <label><i class="fas fa-cog"></i> Настройки продажи</label>
            <div class="checkbox-group">
              <label>
                <input type="checkbox" id="auto-price" checked>
                <span>Авто-обновление цены</span>
              </label>
              <label>
                <input type="checkbox" id="instant-sell" checked>
                <span>Продать моментально (скидка 5%)</span>
              </label>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary close-modal">Отмена</button>
          <button class="btn btn-success" id="confirm-sell-btn" 
                  data-account-id="${accountId}" 
                  data-item-id="${itemId}">
            <i class="fas fa-check"></i> Выставить на продажу
          </button>
        </div>
      </div>
    `);
    
    document.body.appendChild(modal);
    
    modal.querySelector('#confirm-sell-btn').addEventListener('click', async () => {
      const price = parseFloat(modal.querySelector('#sell-price').value);
      
      if (price <= 0) {
        this.showNotification('Цена должна быть больше 0', 'error');
        return;
      }
      
      const listing = await this.listItemOnMarket(accountId, itemId, price);
      if (listing) {
        this.showNotification(`Предмет выставлен за $${price}`, 'success');
        modal.remove();
        this.loadAccounts(); // Обновляем данные
      }
    });
  }
  
  getRarityText(rarity) {
    const texts = {
      'common': 'Обычный',
      'uncommon': 'Необычный',
      'rare': 'Редкий',
      'epic': 'Эпический',
      'legendary': 'Легендарный',
      'covert': 'Секретный',
      'extraordinary': 'Экстраординарный',
      'arcana': 'Аркана',
      'immortal': 'Бессмертный'
    };
    return texts[rarity] || rarity;
  }
  
  createModal(contentHTML) {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = contentHTML;
    
    // Добавляем обработчик закрытия
    modal.querySelector('.close-modal')?.addEventListener('click', () => {
      modal.remove();
    });
    
    // Закрытие по клику вне окна
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });
    
    return modal;
  }
  
  // ===== МАССОВЫЕ ДЕЙСТВИЯ =====
  
  selectAllVisible() {
    const visibleAccountIds = this.getFilteredAccounts().map(a => a.id);
    const allCheckboxes = document.querySelectorAll('.account-checkbox');
    
    if (visibleAccountIds.length === selectedAccounts.size && 
        visibleAccountIds.every(id => selectedAccounts.has(id))) {
      // Если все уже выбраны - снимаем выделение
      selectedAccounts.clear();
      allCheckboxes.forEach(cb => cb.checked = false);
      document.querySelectorAll('.account-card').forEach(card => {
        card.classList.remove('selected');
      });
    } else {
      // Выбираем все видимые
      visibleAccountIds.forEach(id => selectedAccounts.add(id));
      allCheckboxes.forEach(cb => {
        cb.checked = selectedAccounts.has(cb.dataset.id);
      });
      document.querySelectorAll('.account-card').forEach(card => {
        const accountId = card.dataset.id;
        card.classList.toggle('selected', selectedAccounts.has(accountId));
      });
    }
  }
  
  async startSelected() {
    if (selectedAccounts.size === 0) {
      this.showNotification('Выберите аккаунты', 'warning');
      return;
    }
    
    const results = await this.bulkAction('start', Array.from(selectedAccounts));
    this.showNotification(`Запущено ${results.filter(r => r.success).length} аккаунтов`, 'success');
  }
  
  async stopSelected() {
    if (selectedAccounts.size === 0) {
      this.showNotification('Выберите аккаунты', 'warning');
      return;
    }
    
    const results = await this.bulkAction('stop', Array.from(selectedAccounts));
    this.showNotification(`Остановлено ${results.filter(r => r.success).length} аккаунтов`, 'success');
  }
  
  async startAllFarming() {
    const onlineAccounts = accounts.filter(a => a.status !== 'offline').map(a => a.id);
    
    if (onlineAccounts.length === 0) {
      this.showNotification('Нет онлайн аккаунтов', 'warning');
      return;
    }
    
    const results = await this.bulkAction('farm', onlineAccounts, { game: 'CS2' });
    this.showNotification(`Фарминг запущен на ${results.filter(r => r.success).length} аккаунтах`, 'success');
  }
  
  async claimAllDrops() {
    const accountsWithDrops = accounts.filter(a => a.hasNewDrop && a.status !== 'offline').map(a => a.id);
    
    if (accountsWithDrops.length === 0) {
      this.showNotification('Нет доступных дропов', 'info');
      return;
    }
    
    const results = await this.bulkAction('claim-drops', accountsWithDrops, { strategy: 'most_expensive' });
    this.showNotification(`Собрано ${results.length} дропов`, 'success');
  }
  
  async stopAllAccounts() {
    const activeAccounts = accounts.filter(a => a.status !== 'offline').map(a => a.id);
    
    if (activeAccounts.length === 0) {
      this.showNotification('Нет активных аккаунтов', 'info');
      return;
    }
    
    const results = await this.bulkAction('stop', activeAccounts);
    this.showNotification(`Остановлено ${results.filter(r => r.success).length} аккаунтов`, 'success');
  }
  
  selectBulkAction(action) {
    // Подсветка выбранного действия
    document.querySelectorAll('.bulk-action-card').forEach(card => {
      card.classList.toggle('selected', card.dataset.action === action);
    });
    
    // Обновление информации о выбранном действии
    switch(action) {
      case 'claim-all-drops':
        const availableDrops = accounts.filter(a => a.hasNewDrop).length;
        this.updateElement('available-drops-count', availableDrops);
        break;
        
      case 'start-all-farming':
        const canFarm = accounts.filter(a => a.status !== 'offline' && !a.farming).length;
        this.updateElement('can-farm-count', canFarm);
        break;
        
      case 'stop-all-accounts':
        const active = accounts.filter(a => a.status !== 'offline').length;
        this.updateElement('active-accounts-count', active);
        break;
        
      case 'rotate-proxies':
        const usingProxy = accounts.filter(a => a.proxy).length;
        this.updateElement('proxy-users-count', usingProxy);
        break;
    }
  }
  
  async executeBulkAction() {
    const selectedCard = document.querySelector('.bulk-action-card.selected');
    if (!selectedCard) {
      this.showNotification('Выберите действие', 'warning');
      return;
    }
    
    const action = selectedCard.dataset.action;
    let accountIds = [];
    
    // Получаем выбранные аккаунты в зависимости от настроек
    const filter = document.getElementById('bulk-accounts-select')?.value || 'all';
    
    switch(filter) {
      case 'all':
        accountIds = accounts.map(a => a.id);
        break;
      case 'online':
        accountIds = accounts.filter(a => a.status !== 'offline').map(a => a.id);
        break;
      case 'offline':
        accountIds = accounts.filter(a => a.status === 'offline').map(a => a.id);
        break;
      case 'farming':
        accountIds = accounts.filter(a => a.farming).map(a => a.id);
        break;
    }
    
    if (accountIds.length === 0) {
      this.showNotification('Нет подходящих аккаунтов', 'warning');
      return;
    }
    
    // Закрываем модальное окно
    document.getElementById('bulk-actions-modal').classList.remove('active');
    
    // Выполняем действие
    switch(action) {
      case 'claim-all-drops':
        await this.claimAllDrops();
        break;
        
      case 'start-all-farming':
        await this.startAllFarming();
        break;
        
      case 'stop-all-accounts':
        await this.stopAllAccounts();
        break;
        
      case 'rotate-proxies':
        this.showNotification('Смена прокси в разработке', 'info');
        break;
        
      case 'check-steam-guard':
        this.showNotification('Проверка Steam Guard в разработке', 'info');
        break;
        
      case 'export-logs':
        this.exportLogs();
        break;
    }
  }
  
  // ===== ИМПОРТ/ЭКСПОРТ =====
  
  importAccounts() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.txt';
    
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        
        if (Array.isArray(data.accounts)) {
          let imported = 0;
          for (const accountData of data.accounts) {
            await this.addAccount(accountData);
            imported++;
          }
          this.showNotification(`Импортировано ${imported} аккаунтов`, 'success');
        }
      } catch (error) {
        this.showNotification('Ошибка импорта файла', 'error');
      }
    };
    
    input.click();
  }
  
  exportAccounts() {
    const data = {
      version: CONFIG.VERSION,
      exportDate: new Date().toISOString(),
      accounts: accounts.map(account => ({
        id: account.id,
        name: account.name,
        login: account.login,
        status: account.status,
        game: account.game,
        totalProfit: account.totalProfit,
        totalDrops: account.totalDrops,
        settings: account.settings
      }))
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `steam-accounts-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    this.showNotification('Аккаунты экспортированы', 'success');
  }
  
  exportLogs() {
    const logData = logs.map(log => `[${log.time}] [${log.type.toUpperCase()}] ${log.message}`).join('\n');
    const blob = new Blob([logData], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `steam-logs-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    
    this.showNotification('Логи экспортированы', 'success');
  }
  
  // ===== ЛОГИ =====
  
  addLog(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = { time: timestamp, message, type };
    
    logs.unshift(logEntry);
    if (logs.length > 200) logs.pop();
    
    if (!isLogsPaused) {
      this.updateLogs();
    }
  }
  
  updateLogs() {
    const container = document.getElementById('system-logs');
    if (!container) return;
    
    container.innerHTML = logs.map(log => `
      <div class="log-entry ${log.type}">
        <span class="log-time">[${log.time}]</span>
        <span class="log-message">${log.message}</span>
      </div>
    `).join('');
  }
  
  clearLogs() {
    logs = [];
    this.updateLogs();
    this.showNotification('Логи очищены', 'info');
  }
  
  toggleLogsPause() {
    isLogsPaused = !isLogsPaused;
    const btn = document.getElementById('pause-logs');
    if (btn) {
      btn.innerHTML = isLogsPaused ? 
        '<i class="fas fa-play"></i> Продолжить' : 
        '<i class="fas fa-pause"></i> Пауза';
    }
    this.showNotification(isLogsPaused ? 'Логи на паузе' : 'Логи продолжаются', 'info');
  }
  
  // ===== УВЕДОМЛЕНИЯ =====
  
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
    
    // Анимация появления
    setTimeout(() => notification.classList.add('show'), 10);
    
    // Обработчик закрытия
    notification.querySelector('.notification-close').addEventListener('click', () => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    });
    
    // Автоудаление
    setTimeout(() => {
      if (notification.parentNode) {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
      }
    }, duration);
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
  
  // ===== ОБРАБОТЧИКИ СОБЫТИЙ СЕРВЕРА =====
  
  handleNewDrop(data) {
    const account = accounts.find(a => a.id === data.accountId);
    if (account) {
      this.showNotification(`Новый дроп на ${account.name}!`, 'info');
    }
  }
  
  handleDropClaimed(data) {
    this.showNotification(`Дроп получен! Прибыль: $${data.drop.price}`, 'success');
  }
  
  handleItemSold(data) {
    this.showNotification(`Продано: ${data.item.name} за $${data.price}`, 'success');
  }
  
  checkAllDrops() {
    const accountsWithDrops = accounts.filter(a => a.hasNewDrop);
    if (accountsWithDrops.length > 0) {
      this.showNotification(`Найдено ${accountsWithDrops.length} аккаунтов с дропами`, 'info');
    } else {
      this.showNotification('Нет доступных дропов', 'info');
    }
  }
  
  // ===== СИСТЕМНЫЕ МЕТОДЫ =====
  
  startAutoUpdates() {
    // Обновление статистики каждые 5 секунд
    updateInterval = setInterval(() => {
      if (socket && socket.connected) {
        socket.emit('get-stats');
      }
    }, 5000);
    
    // Получение статистики
    socket.on('stats-update', (stats) => {
      this.updateElement('bots-active', `${stats.online}/${stats.total}`);
      this.updateElement('total-profit', `$${stats.totalProfit.toFixed(2)}`);
    });
  }
  
  // ===== ДОПОЛНИТЕЛЬНЫЕ МЕТОДЫ =====
  
  showAccountSettingsModal(accountId) {
    const account = accounts.find(a => a.id === accountId);
    if (!account) return;
    
    const modal = this.createModal(`
      <div class="modal-content">
        <div class="modal-header">
          <h3><i class="fas fa-cog"></i> Настройки аккаунта - ${account.name}</h3>
          <button class="close-modal">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label for="acc-name"><i class="fas fa-user"></i> Имя аккаунта</label>
            <input type="text" id="acc-name" class="form-control" value="${account.name}">
          </div>
          
          <div class="form-group">
            <label for="acc-game"><i class="fas fa-gamepad"></i> Игра по умолчанию</label>
            <select id="acc-game" class="form-control">
              <option value="CS2" ${account.game === 'CS2' ? 'selected' : ''}>CS2</option>
              <option value="CS:GO" ${account.game === 'CS:GO' ? 'selected' : ''}>CS:GO</option>
              <option value="Dota 2" ${account.game === 'Dota 2' ? 'selected' : ''}>Dota 2</option>
              <option value="TF2" ${account.game === 'TF2' ? 'selected' : ''}>Team Fortress 2</option>
            </select>
          </div>
          
          <div class="form-group">
            <label><i class="fas fa-shield-alt"></i> Настройки безопасности</label>
            <div class="checkbox-group">
              <label>
                <input type="checkbox" id="acc-auto-farm" ${account.settings?.autoFarm ? 'checked' : ''}>
                <span>Автоматически начинать фарминг</span>
              </label>
              <label>
                <input type="checkbox" id="acc-auto-trade" ${account.settings?.autoTrade ? 'checked' : ''}>
                <span>Автоматическая торговля</span>
              </label>
              <label>
                <input type="checkbox" id="acc-claim-drops" ${account.settings?.autoClaimDrops ? 'checked' : ''}>
                <span>Автоматически забирать дропы</span>
              </label>
            </div>
          </div>
          
          <div class="danger-zone">
            <h4><i class="fas fa-exclamation-triangle"></i> Опасная зона</h4>
            <button class="btn btn-danger" id="delete-account-btn" data-account-id="${accountId}">
              <i class="fas fa-trash"></i> Удалить аккаунт
            </button>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary close-modal">Отмена</button>
          <button class="btn btn-success" id="save-settings-btn" data-account-id="${accountId}">
            <i class="fas fa-save"></i> Сохранить настройки
          </button>
        </div>
      </div>
    `);
    
    document.body.appendChild(modal);
    
    // Обработчик сохранения настроек
    modal.querySelector('#save-settings-btn').addEventListener('click', async () => {
      const updates = {
        name: modal.querySelector('#acc-name').value,
        game: modal.querySelector('#acc-game').value,
        settings: {
          autoFarm: modal.querySelector('#acc-auto-farm').checked,
          autoTrade: modal.querySelector('#acc-auto-trade').checked,
          autoClaimDrops: modal.querySelector('#acc-claim-drops').checked
        }
      };
      
      await fetch(`${CONFIG.API_URL}/accounts/${accountId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      
      this.showNotification('Настройки сохранены', 'success');
      this.loadAccounts();
      modal.remove();
    });
    
    // Обработчик удаления аккаунта
    modal.querySelector('#delete-account-btn').addEventListener('click', async () => {
      if (confirm('Вы уверены, что хотите удалить этот аккаунт? Это действие нельзя отменить.')) {
        await fetch(`${CONFIG.API_URL}/accounts/${accountId}`, {
          method: 'DELETE'
        });
        
        this.showNotification('Аккаунт удален', 'success');
        this.loadAccounts();
        modal.remove();
      }
    });
  }
  
  // ===== УТИЛИТЫ =====
  
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  cleanup() {
    if (updateInterval) clearInterval(updateInterval);
    if (socket) socket.disconnect();
  }
}

// ===== ИНИЦИАЛИЗАЦИЯ =====
let steamManager;

document.addEventListener('DOMContentLoaded', () => {
  steamManager = new SteamManager();
  
  // Глобальный обработчик уведомлений (делегирование)
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
  
  // Открытие модального окна массовых действий
  document.getElementById('bulk-actions-btn')?.addEventListener('click', () => {
    document.getElementById('bulk-actions-modal').classList.add('active');
  });
  
  // Кнопка показа пароля
  document.getElementById('show-password-btn')?.addEventListener('click', (e) => {
    const passwordInput = document.getElementById('steam-password');
    const type = passwordInput.type === 'password' ? 'text' : 'password';
    passwordInput.type = type;
    e.target.innerHTML = type === 'password' ? '<i class="fas fa-eye"></i>' : '<i class="fas fa-eye-slash"></i>';
  });
});

// Экспортируем для глобального доступа
window.steamManager = steamManager;
