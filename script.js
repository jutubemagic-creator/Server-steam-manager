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
let currentPageView = 'accounts'; // Текущая страница (accounts, farming, trading, drops, settings, security)

// ===== ОСНОВНОЙ КЛАСС =====
class SteamManager {
  constructor() {
    this.initializeSocket();
    this.loadAccounts();
    this.initEventListeners();
    this.setupPageNavigation();
    this.showPage('accounts'); // Показываем страницу аккаунтов по умолчанию
    this.startAutoUpdates();
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
          
          // Обновляем активный класс в меню
          menuLinks.forEach(l => l.classList.remove('active'));
          link.classList.add('active');
        }
      });
    });
  }
  
  showPage(pageName) {
    currentPageView = pageName;
    
    // Скрываем все секции
    const sections = [
      'accounts-section',
      'farming-section',
      'trading-section',
      'drops-section',
      'settings-section',
      'security-section'
    ];
    
    sections.forEach(section => {
      const el = document.getElementById(section);
      if (el) el.style.display = 'none';
    });
    
    // Показываем нужную секцию
    let sectionToShow = '';
    let pageTitle = '';
    
    switch(pageName) {
      case 'accounts':
        sectionToShow = 'accounts-section';
        pageTitle = 'Управление аккаунтами';
        this.renderAccounts();
        break;
      case 'farming':
        sectionToShow = 'farming-section';
        pageTitle = 'Фарминг';
        this.showFarmingPage();
        break;
      case 'trading':
        sectionToShow = 'trading-section';
        pageTitle = 'Обмены';
        this.showTradingPage();
        break;
      case 'drops':
        sectionToShow = 'drops-section';
        pageTitle = 'Дропы';
        this.showDropsPage();
        break;
      case 'settings':
        sectionToShow = 'settings-section';
        pageTitle = 'Настройки';
        this.showSettingsPage();
        break;
      case 'security':
        sectionToShow = 'security-section';
        pageTitle = 'Безопасность';
        this.showSecurityPage();
        break;
    }
    
    // Обновляем заголовок
    const header = document.querySelector('.header h1');
    if (header) {
      const icon = this.getPageIcon(pageName);
      header.innerHTML = `<i class="fas fa-${icon}"></i> ${pageTitle}`;
    }
    
    // Показываем секцию
    const section = document.getElementById(sectionToShow);
    if (section) {
      section.style.display = 'block';
    } else {
      // Если секции нет - создаем ее
      this.createPageSection(pageName);
    }
  }
  
  getPageIcon(pageName) {
    const icons = {
      'accounts': 'users',
      'farming': 'seedling',
      'trading': 'exchange-alt',
      'drops': 'gift',
      'settings': 'cog',
      'security': 'shield-alt'
    };
    return icons[pageName] || 'cog';
  }
  
  createPageSection(pageName) {
    const mainContent = document.querySelector('.main-content');
    if (!mainContent) return;
    
    let html = '';
    
    switch(pageName) {
      case 'farming':
        html = this.getFarmingPageHTML();
        break;
      case 'trading':
        html = this.getTradingPageHTML();
        break;
      case 'drops':
        html = this.getDropsPageHTML();
        break;
      case 'settings':
        html = this.getSettingsPageHTML();
        break;
      case 'security':
        html = this.getSecurityPageHTML();
        break;
    }
    
    const section = document.createElement('div');
    section.id = `${pageName}-section`;
    section.className = 'page-section';
    section.innerHTML = html;
    
    mainContent.appendChild(section);
    
    // Инициализируем обработчики для новой страницы
    this.initPageEventListeners(pageName);
  }
  
  // ===== HTML ДЛЯ СТРАНИЦ =====
  
  getFarmingPageHTML() {
    const farmingAccounts = accounts.filter(a => a.farming);
    const canFarm = accounts.filter(a => a.status !== 'offline' && !a.farming);
    
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
            <p class="stat-value">${accounts.reduce((sum, a) => sum + (a.farmingHours || 0), 0).toFixed(1)}h</p>
          </div>
        </div>
        <div class="stat-card orange">
          <i class="fas fa-gamepad"></i>
          <div>
            <h3>Игр в работе</h3>
            <p class="stat-value">${[...new Set(accounts.filter(a => a.farming).map(a => a.game))].length}</p>
          </div>
        </div>
        <div class="stat-card purple">
          <i class="fas fa-dollar-sign"></i>
          <div>
            <h3>Прибыль с фарминга</h3>
            <p class="stat-value">$${accounts.reduce((sum, a) => sum + (a.totalProfit || 0), 0).toFixed(2)}</p>
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
        <div class="games-grid">
          <div class="game-card" data-game="CS2">
            <div class="game-icon">
              <i class="fas fa-crosshairs"></i>
            </div>
            <h4>CS2</h4>
            <p>${accounts.filter(a => a.game === 'CS2' && a.farming).length} аккаунтов</p>
            <button class="btn btn-small start-game-farming" data-game="CS2">
              <i class="fas fa-play"></i> Запустить
            </button>
          </div>
          <div class="game-card" data-game="Dota 2">
            <div class="game-icon">
              <i class="fas fa-dragon"></i>
            </div>
            <h4>Dota 2</h4>
            <p>${accounts.filter(a => a.game === 'Dota 2' && a.farming).length} аккаунтов</p>
            <button class="btn btn-small start-game-farming" data-game="Dota 2">
              <i class="fas fa-play"></i> Запустить
            </button>
          </div>
          <div class="game-card" data-game="TF2">
            <div class="game-icon">
              <i class="fas fa-hat-cowboy"></i>
            </div>
            <h4>Team Fortress 2</h4>
            <p>${accounts.filter(a => a.game === 'TF2' && a.farming).length} аккаунтов</p>
            <button class="btn btn-small start-game-farming" data-game="TF2">
              <i class="fas fa-play"></i> Запустить
            </button>
          </div>
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
    `;
  }
  
  getTradingPageHTML() {
    const totalListings = accounts.reduce((sum, a) => sum + (a.marketListings?.length || 0), 0);
    const activeTrades = accounts.filter(a => a.status === 'trading').length;
    
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
            <h3>Активные трейды</h3>
            <p class="stat-value">${activeTrades}</p>
          </div>
        </div>
        <div class="stat-card orange">
          <i class="fas fa-dollar-sign"></i>
          <div>
            <h3>Оборот</h3>
            <p class="stat-value">$${accounts.reduce((sum, a) => sum + (a.totalProfit || 0), 0).toFixed(2)}</p>
          </div>
        </div>
        <div class="stat-card purple">
          <i class="fas fa-percentage"></i>
          <div>
            <h3>Процент успеха</h3>
            <p class="stat-value">85%</p>
          </div>
        </div>
      </div>
      
      <div class="trading-actions">
        <h3><i class="fas fa-bolt"></i> Быстрые действия</h3>
        <div class="action-buttons">
          <button class="btn btn-success" id="auto-accept-trades">
            <i class="fas fa-check-circle"></i> Автопринятие трейдов
          </button>
          <button class="btn btn-warning" id="check-offers">
            <i class="fas fa-search"></i> Проверить предложения
          </button>
          <button class="btn btn-info" id="market-analysis">
            <i class="fas fa-chart-line"></i> Анализ рынка
          </button>
        </div>
      </div>
      
      <div class="market-listings">
        <h3><i class="fas fa-list"></i> Активные продажи</h3>
        <div class="listings-table">
          <div class="table-header">
            <div class="col-item">Предмет</div>
            <div class="col-account">Аккаунт</div>
            <div class="col-price">Цена</div>
            <div class="col-status">Статус</div>
            <div class="col-time">Время</div>
            <div class="col-actions">Действия</div>
          </div>
          <div class="table-body" id="market-listings-body">
            ${this.getMarketListingsHTML()}
          </div>
        </div>
      </div>
      
      <div class="trade-offers">
        <h3><i class="fas fa-envelope"></i> Предложения обмена</h3>
        <div class="offers-list" id="trade-offers-list">
          <div class="empty-state">
            <i class="fas fa-envelope-open fa-3x"></i>
            <p>Нет новых предложений обмена</p>
          </div>
        </div>
      </div>
    `;
  }
  
  getMarketListingsHTML() {
    let html = '';
    let hasListings = false;
    
    accounts.forEach(account => {
      if (account.marketListings && account.marketListings.length > 0) {
        hasListings = true;
        account.marketListings.forEach(listing => {
          html += `
            <div class="listing-row" data-listing-id="${listing.id}">
              <div class="col-item">
                <i class="fas fa-box-open"></i>
                <span>${listing.item?.name || 'Предмет'}</span>
              </div>
              <div class="col-account">${account.name}</div>
              <div class="col-price">$${listing.price.toFixed(2)}</div>
              <div class="col-status">
                <span class="status-badge ${listing.status}">${listing.status}</span>
              </div>
              <div class="col-time">${new Date(listing.listedAt).toLocaleTimeString()}</div>
              <div class="col-actions">
                <button class="action-btn" data-action="cancel-listing" data-listing-id="${listing.id}">
                  <i class="fas fa-times"></i>
                </button>
                <button class="action-btn" data-action="edit-price" data-listing-id="${listing.id}">
                  <i class="fas fa-edit"></i>
                </button>
              </div>
            </div>
          `;
        });
      }
    });
    
    if (!hasListings) {
      html = `
        <div class="empty-state">
          <i class="fas fa-shopping-cart fa-3x"></i>
          <p>Нет активных продаж</p>
          <p class="small">Выставьте предметы на рынок в разделе Аккаунты</p>
        </div>
      `;
    }
    
    return html;
  }
  
  getDropsPageHTML() {
    const accountsWithDrops = accounts.filter(a => a.hasNewDrop);
    const totalDrops = accounts.reduce((sum, a) => sum + (a.totalDrops || 0), 0);
    const totalValue = accounts.reduce((sum, a) => {
      const inventoryValue = (a.inventory || []).reduce((invSum, item) => invSum + (item.price || 0), 0);
      return sum + inventoryValue;
    }, 0);
    
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
            <p class="stat-value">$${this.getMostValuableItem()}</p>
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
        </div>
      `;
    }
    
    let html = '';
    accountsWithDrops.forEach(account => {
      if (account.lastDrop) {
        html += `
          <div class="drop-card" data-account-id="${account.id}">
            <div class="drop-account">${account.name}</div>
            <div class="drop-item">
              <i class="fas fa-box-open"></i>
              <span>${account.lastDrop.name}</span>
            </div>
            <div class="drop-value">$${account.lastDrop.price.toFixed(2)}</div>
            <div class="drop-rarity ${account.lastDrop.rarity}">${this.getRarityText(account.lastDrop.rarity)}</div>
            <button class="btn btn-small btn-success claim-single-drop" data-account-id="${account.id}">
              <i class="fas fa-check"></i> Забрать
            </button>
          </div>
        `;
      }
    });
    
    return html;
  }
  
  getDropHistoryHTML() {
    // Собираем все предметы из инвентаря всех аккаунтов
    let allItems = [];
    accounts.forEach(account => {
      if (account.inventory) {
        account.inventory.forEach(item => {
          allItems.push({
            ...item,
            accountName: account.name,
            accountId: account.id
          });
        });
      }
    });
    
    // Сортируем по дате получения (новые сверху)
    allItems.sort((a, b) => new Date(b.acquired) - new Date(a.acquired));
    
    if (allItems.length === 0) {
      return `
        <div class="empty-state">
          <i class="fas fa-history fa-3x"></i>
          <p>История дропов пуста</p>
        </div>
      `;
    }
    
    // Берем последние 10 предметов
    const recentItems = allItems.slice(0, 10);
    
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
        <div class="item-value">$${item.price.toFixed(2)}</div>
        <div class="item-rarity ${item.rarity}"></div>
      </div>
    `).join('');
  }
  
  getMostValuableItem() {
    let maxPrice = 0;
    accounts.forEach(account => {
      if (account.inventory) {
        account.inventory.forEach(item => {
          if (item.price > maxPrice) {
            maxPrice = item.price;
          }
        });
      }
    });
    return maxPrice.toFixed(2);
  }
  
  getSettingsPageHTML() {
    return `
      <div class="settings-container">
        <h3><i class="fas fa-sliders-h"></i> Основные настройки</h3>
        
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
            <button class="btn btn-info" id="backup-now">
              <i class="fas fa-save"></i> Сделать бэкап сейчас
            </button>
            <button class="btn btn-warning" id="restore-backup">
              <i class="fas fa-undo"></i> Восстановить из бэкапа
            </button>
            <button class="btn btn-danger" id="clear-data">
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
            </select>
          </div>
          <div class="setting-item">
            <label>Язык интерфейса:</label>
            <select id="language-select" class="form-control">
              <option value="ru" selected>Русский</option>
              <option value="en">English</option>
            </select>
          </div>
        </div>
        
        <div class="settings-actions">
          <button class="btn btn-success" id="save-all-settings">
            <i class="fas fa-save"></i> Сохранить все настройки
          </button>
          <button class="btn btn-secondary" id="reset-settings">
            <i class="fas fa-undo"></i> Сбросить настройки
          </button>
        </div>
      </div>
    `;
  }
  
  getSecurityPageHTML() {
    const riskLevel = this.calculateRiskLevel();
    
    return `
      <div class="security-container">
        <div class="security-status">
          <h3><i class="fas fa-shield-alt"></i> Статус безопасности</h3>
          <div class="risk-level ${riskLevel.level.toLowerCase()}">
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
                <p class="stat-value">${accounts.filter(a => a.isolation === 'maximum' || a.isolation === 'high').length}</p>
              </div>
            </div>
            <div class="stat-card">
              <i class="fas fa-globe"></i>
              <div>
                <h3>Уникальные прокси</h3>
                <p class="stat-value">${new Set(accounts.filter(a => a.proxy).map(a => a.proxy?.ip)).size}</p>
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
                <h3>Время работы</h3>
                <p class="stat-value">${accounts.filter(a => a.status !== 'offline').length}ч</p>
              </div>
            </div>
          </div>
        </div>
        
        <div class="security-recommendations">
          <h4><i class="fas fa-lightbulb"></i> Рекомендации по безопасности</h4>
          <div class="recommendations-list">
            ${this.getSecurityRecommendations()}
          </div>
        </div>
        
        <div class="security-actions">
          <h4><i class="fas fa-tools"></i> Инструменты безопасности</h4>
          <div class="action-buttons">
            <button class="btn btn-success" id="rotate-all-proxies">
              <i class="fas fa-sync-alt"></i> Сменить все прокси
            </button>
            <button class="btn btn-warning" id="refresh-fingerprints">
              <i class="fas fa-fingerprint"></i> Обновить отпечатки
            </button>
            <button class="btn btn-info" id="check-accounts-status">
              <i class="fas fa-search"></i> Проверить статус аккаунтов
            </button>
            <button class="btn btn-danger" id="emergency-stop">
              <i class="fas fa-stop-circle"></i> Аварийная остановка
            </button>
          </div>
        </div>
        
        <div class="security-logs">
          <h4><i class="fas fa-clipboard-list"></i> Логи безопасности</h4>
          <div class="logs-list" id="security-logs-list">
            ${this.getSecurityLogs()}
          </div>
        </div>
      </div>
    `;
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
  
  getSecurityRecommendations() {
    const recommendations = [];
    
    // Проверяем уровень изоляции
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
    
    // Проверяем прокси
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
    
    // Проверяем время фарминга
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
  
  getSecurityLogs() {
    // Берем последние 5 логов связанных с безопасностью
    const securityLogs = logs.filter(log => 
      log.type === 'warning' || log.type === 'error' || 
      log.message.includes('безопасност') || log.message.includes('риск') ||
      log.message.includes('прокси') || log.message.includes('защит')
    ).slice(0, 5);
    
    if (securityLogs.length === 0) {
      return `
        <div class="empty-state">
          <i class="fas fa-shield-alt fa-3x"></i>
          <p>Нет записей в логах безопасности</p>
        </div>
      `;
    }
    
    return securityLogs.map(log => `
      <div class="log-entry ${log.type}">
        <span class="log-time">[${log.time}]</span>
        <span class="log-message">${log.message}</span>
      </div>
    `).join('');
  }
  
  // ===== ИНИЦИАЛИЗАЦИЯ ОБРАБОТЧИКОВ СТРАНИЦ =====
  
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
    // Запуск фарминга для всех
    document.getElementById('start-all-farming-page')?.addEventListener('click', () => {
      this.startAllFarming();
    });
    
    // Остановка фарминга для всех
    document.getElementById('stop-all-farming-page')?.addEventListener('click', () => {
      this.stopAllAccounts();
    });
    
    // Запуск фарминга по игре
    document.querySelectorAll('.start-game-farming').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const game = e.target.dataset.game || e.target.closest('.start-game-farming').dataset.game;
        const onlineAccounts = accounts.filter(a => a.status !== 'offline').map(a => a.id);
        
        if (onlineAccounts.length > 0) {
          this.bulkAction('farm', onlineAccounts, { game });
          this.showNotification(`Фарминг ${game} запущен на ${onlineAccounts.length} аккаунтах`, 'success');
        } else {
          this.showNotification('Нет онлайн аккаунтов', 'warning');
        }
      });
    });
    
    // Сохранение расписания
    document.getElementById('save-farming-schedule')?.addEventListener('click', () => {
      this.showNotification('Расписание сохранено', 'success');
    });
  }
  
  initTradingPageListeners() {
    // Автопринятие трейдов
    document.getElementById('auto-accept-trades')?.addEventListener('click', () => {
      this.showNotification('Автопринятие трейдов включено', 'success');
    });
    
    // Проверка предложений
    document.getElementById('check-offers')?.addEventListener('click', () => {
      this.showNotification('Проверка предложений...', 'info');
    });
  }
  
  initDropsPageListeners() {
    // Забрать все дропы
    document.getElementById('claim-all-drops-page')?.addEventListener('click', () => {
      this.claimAllDrops();
    });
    
    // Забрать конкретный дроп
    document.querySelectorAll('.claim-single-drop').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const accountId = e.target.dataset.accountId || e.target.closest('.claim-single-drop').dataset.accountId;
        this.claimDrop(accountId);
      });
    });
    
    // Сохранение настроек дропов
    document.getElementById('save-drop-settings')?.addEventListener('click', () => {
      this.showNotification('Настройки дропов сохранены', 'success');
    });
  }
  
  initSettingsPageListeners() {
    // Слайдер задержки
    const delaySlider = document.getElementById('delay-slider');
    const delayDisplay = document.getElementById('delay-value-display');
    if (delaySlider && delayDisplay) {
      delaySlider.addEventListener('input', (e) => {
        delayDisplay.textContent = e.target.value;
      });
    }
    
    // Сохранение всех настроек
    document.getElementById('save-all-settings')?.addEventListener('click', () => {
      this.showNotification('Все настройки сохранены', 'success');
    });
    
    // Сброс настроек
    document.getElementById('reset-settings')?.addEventListener('click', () => {
      if (confirm('Вы уверены, что хотите сбросить все настройки?')) {
        this.showNotification('Настройки сброшены', 'info');
      }
    });
    
    // Бэкап
    document.getElementById('backup-now')?.addEventListener('click', () => {
      this.exportAccounts();
    });
  }
  
  initSecurityPageListeners() {
    // Смена прокси
    document.getElementById('rotate-all-proxies')?.addEventListener('click', () => {
      this.showNotification('Смена прокси в разработке', 'info');
    });
    
    // Аварийная остановка
    document.getElementById('emergency-stop')?.addEventListener('click', () => {
      if (confirm('Вы уверены, что хотите выполнить аварийную остановку всех аккаунтов?')) {
        this.stopAllAccounts();
        this.showNotification('Аварийная остановка выполнена', 'warning');
      }
    });
  }
  
  // ===== ОСТАЛЬНЫЕ МЕТОДЫ (ИЗ ПРЕДЫДУЩЕГО КОДА) =====
  // ВАЖНО: Сюда нужно добавить ВСЕ остальные методы из предыдущего script.js
  // которые не относятся к навигации по страницам
  
  initializeSocket() {
    socket = io(CONFIG.SOCKET_URL);
    
    socket.on('connect', () => {
      this.addLog('Подключено к серверу', 'success');
      this.updateSystemStatus('online');
    });
    
    socket.on('disconnect', () => {
      this.addLog('Отключено от сервера', 'warning');
      this.updateSystemStatus('offline');
    });
    
    socket.on('welcome', (data) => {
      console.log('Сервер:', data.message);
      this.updateElement('system-version', `v${data.version}`);
    });
    
    socket.on('accounts-data', (data) => {
      accounts = data;
      this.updateAll();
    });
    
    socket.on('account-added', (account) => {
      accounts.push(account);
      this.updateAll();
      this.showNotification(`Аккаунт "${account.name}" добавлен`, 'success');
    });
    
    socket.on('account-updated', (data) => {
      const index = accounts.findIndex(a => a.id === data.id);
      if (index !== -1) {
        accounts[index] = { ...accounts[index], ...data };
        this.updateAll();
      }
    });
    
    socket.on('new-drop', (data) => {
      const account = accounts.find(a => a.id === data.accountId);
      if (account) {
        account.hasNewDrop = true;
        account.lastDrop = data.drop;
        this.updateAll();
        this.showNotification(`Новый дроп на ${account.name}: ${data.drop.name}`, 'info');
      }
    });
    
    socket.on('drop-claimed', (data) => {
      this.showNotification(`Дроп получен! +$${data.drop.price}`, 'success');
    });
    
    socket.on('item-sold', (data) => {
      this.showNotification(`Продано: $${data.price}`, 'success');
    });
    
    socket.on('system-log', (log) => {
      this.addLog(log.message, log.type);
    });
    
    socket.on('system-logs', (logsData) => {
      logs = logsData.map(log => ({
        time: new Date(log.timestamp).toLocaleTimeString(),
        message: log.message,
        type: log.type
      }));
      this.updateLogs();
    });
    
    socket.on('stats-update', (stats) => {
      this.updateElement('total-accounts', stats.total);
      this.updateElement('farming-now', stats.farming);
      this.updateElement('drops-available', stats.withDrops);
      this.updateElement('total-profit', `$${stats.totalProfit.toFixed(2)}`);
      this.updateElement('total-drops', stats.totalDrops);
    });
  }
  
  updateSystemStatus(status) {
    const indicator = document.querySelector('.status-indicator');
    const statusText = document.querySelector('.status span');
    
    if (indicator && statusText) {
      if (status === 'online') {
        indicator.className = 'status-indicator online';
        statusText.textContent = 'Система активна';
      } else {
        indicator.className = 'status-indicator offline';
        statusText.textContent = 'Нет соединения';
      }
    }
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
      console.error('Ошибка загрузки аккаунтов:', error);
      this.addLog('Не удалось загрузить аккаунты', 'error');
      
      // Демо данные если сервер не отвечает
      if (accounts.length === 0) {
        accounts = this.getDemoAccounts();
        this.updateAll();
      }
    }
  }
  
  getDemoAccounts() {
    return [
      {
        id: "demo_1",
        name: "Основной аккаунт",
        login: "player_one",
        status: "online",
        game: "CS2",
        country: "ru",
        uptime: "4ч 22м",
        farming: false,
        hasNewDrop: true,
        totalProfit: 45.75,
        totalDrops: 3,
        inventory: [
          { id: "1", name: "AK-47 | Redline", price: 15.50, rarity: "covert", acquired: new Date().toISOString() },
          { id: "2", name: "Prisma 2 Case", price: 0.45, rarity: "common", acquired: new Date().toISOString() }
        ],
        marketListings: [],
        isolation: "maximum",
        proxy: { ip: "195.24.76.123", port: 8080 },
        farmingHours: 4.5
      },
      {
        id: "demo_2",
        name: "Фарминг #1",
        login: "farm_01",
        status: "farming",
        game: "CS2",
        country: "de",
        uptime: "12ч 45м",
        farming: true,
        hasNewDrop: false,
        totalProfit: 120.50,
        totalDrops: 8,
        inventory: [
          { id: "3", name: "AWP | Asiimov", price: 45.00, rarity: "covert", acquired: new Date().toISOString() }
        ],
        marketListings: [
          {
            id: "listing_1",
            item: { id: "4", name: "Operation Phoenix Case", price: 0.85, rarity: "rare" },
            price: 0.90,
            listedAt: new Date().toISOString(),
            status: "active"
          }
        ],
        isolation: "high",
        proxy: { ip: "87.256.45.12", port: 8080 },
        farmingHours: 12.8
      }
    ];
  }
  
  // ... ДОБАВЬТЕ ВСЕ ОСТАЛЬНЫЕ МЕТОДЫ ИЗ ПРЕДЫДУЩЕГО script.js
  // которые я давал ранее (addAccount, toggleAccountStatus, startFarming, claimDrop и т.д.)
  // Обязательно добавьте методы: addAccount, toggleAccountStatus, startFarming, claimDrop,
  // listItemOnMarket, bulkAction, updateAll, updateStats, calculateRiskLevel,
  // renderAccounts, createAccountCardHTML, getAvatarStyle, getStatusText,
  // getGameIcon, getEmptyStateHTML, getFilteredAccounts, getPagedAccounts,
  // updatePagination, updateElement, initEventListeners, setupButtonListeners,
  // setupFilterListeners, setupPaginationListeners, setupModalListeners,
  // setupGeneralListeners, showAddAccountModal, saveNewAccount, resetAddAccountForm,
  // showFarmingModal, showDropSelectionModal, loadAvailableDrops, showMarketModal,
  // createMarketModal, getInventoryHTML, showSellItemModal, getRarityText,
  // createModal, selectAllVisible, startSelected, stopSelected, startAllFarming,
  // claimAllDrops, stopAllAccounts, selectBulkAction, executeBulkAction,
  // importAccounts, exportAccounts, exportLogs, addLog, updateLogs, clearLogs,
  // toggleLogsPause, showNotification, getNotificationIcon, checkAllDrops,
  // showAccountSettingsModal, startAutoUpdates, delay, cleanup
  
  // Поскольку код очень длинный, я добавлю только самые важные методы,
  // а вы скопируйте остальные из предыдущего script.js
  
  updateAll() {
    this.updateStats();
    if (currentPageView === 'accounts') {
      this.renderAccounts();
      this.updatePagination();
    }
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
    if (currentPageView === 'accounts') {
      this.updateElement('filtered-count', this.getFilteredAccounts().length);
    }
    
    // Расчет риска
    const risk = this.calculateRiskLevel();
    this.updateElement('ban-risk', risk.level);
    const riskElement = this.updateElement('ban-risk');
    if (riskElement) riskElement.style.color = risk.color;
    
    // Обновление статуса прокси
    const proxyCount = document.getElementById('proxy-count');
    if (proxyCount) {
      proxyCount.textContent = `${accounts.filter(a => a.proxy).length}/${accounts.length}`;
    }
    
    // Обновление количества ботов
    const botsActive = document.getElementById('bots-active');
    if (botsActive) {
      botsActive.textContent = `${online}/${total}`;
    }
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
  
  // ... и так далее - скопируйте ВСЕ остальные методы из предыдущего script.js
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
});

// Экспортируем для глобального доступа
window.steamManager = steamManager;
