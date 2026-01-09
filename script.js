// ===== КОНФИГУРАЦИЯ =====
const CONFIG = {
  API_URL: '/api',
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
let currentPageView = 'accounts';

// ===== ЦВЕТА ДЛЯ АВАТАРОВ =====
const AVATAR_COLORS = [
  '#00adee', '#00ff88', '#ffaa00', '#ff5555', '#aa55ff',
  '#ff55dd', '#55aaff', '#55ffaa', '#aaff55', '#ffaa55'
];

// ===== ОСНОВНОЙ КЛАСС =====
class SteamManager {
  constructor() {
    this.init();
  }

  init() {
    this.loadDemoData();
    this.initEventListeners();
    this.setupPageNavigation();
    this.showPage('accounts');
    this.startAutoUpdates();
    this.addLog('Система инициализирована', 'success');
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
        'trading': 'Обмены',
        'drops': 'Дропы',
        'settings': 'Настройки',
        'security': 'Безопасность'
      };
      header.innerHTML = `<i class="fas fa-${icon}"></i> ${titles[pageName] || 'Управление'}`;
    }
    
    // Показываем/скрываем секции
    document.querySelectorAll('.page-section').forEach(section => {
      section.style.display = 'none';
    });
    
    let sectionId = `${pageName}-section`;
    let section = document.getElementById(sectionId);
    
    if (!section) {
      section = this.createPageSection(pageName);
    }
    
    section.style.display = 'block';
    this.updatePageContent(pageName);
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
    if (!mainContent) return null;

    // Создаем контейнер для страницы
    const section = document.createElement('div');
    section.id = `${pageName}-section`;
    section.className = 'page-section';
    section.style.display = 'none';

    // Добавляем базовую структуру
    const html = this.getPageHTML(pageName);
    section.innerHTML = html;
    
    mainContent.appendChild(section);
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
    return `
      <div class="stats-grid">
        <div class="stat-card blue">
          <i class="fas fa-user-friends"></i>
          <div>
            <h3>Всего аккаунтов</h3>
            <p class="stat-value" id="total-accounts">0</p>
          </div>
        </div>
        <div class="stat-card green">
          <i class="fas fa-seedling"></i>
          <div>
            <h3>Активно фармят</h3>
            <p class="stat-value" id="farming-now">0</p>
          </div>
        </div>
        <div class="stat-card orange">
          <i class="fas fa-gift"></i>
          <div>
            <h3>Дропы доступны</h3>
            <p class="stat-value" id="drops-available">0</p>
          </div>
        </div>
        <div class="stat-card red">
          <i class="fas fa-shield-alt"></i>
          <div>
            <h3>Уровень риска</h3>
            <p class="stat-value" id="ban-risk">Низкий</p>
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
            <option value="cs2">CS2</option>
            <option value="csgo">CS:GO</option>
            <option value="dota2">Dota 2</option>
            <option value="tf2">Team Fortress 2</option>
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

      <div class="accounts-section">
        <div class="section-header">
          <h2><i class="fas fa-list"></i> Список аккаунтов (<span id="filtered-count">0</span>)</h2>
          <div class="section-actions">
            <button class="btn btn-small" id="refresh-list">
              <i class="fas fa-sync-alt"></i> Обновить
            </button>
            <button class="btn btn-small btn-info" id="check-drops">
              <i class="fas fa-gift"></i> Проверить дропы
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
            <!-- Аккаунты будут загружены динамически -->
          </div>
        </div>

        <div class="pagination">
          <button class="pagination-btn" id="prev-page" disabled>
            <i class="fas fa-chevron-left"></i> Назад
          </button>
          <span class="page-info">Страница <span id="current-page">1</span> из <span id="total-pages">1</span></span>
          <button class="pagination-btn" id="next-page" disabled>
            Вперед <i class="fas fa-chevron-right"></i>
          </button>
          <select id="page-size">
            <option value="10">10 на странице</option>
            <option value="25" selected>25 на странице</option>
            <option value="50">50 на странице</option>
            <option value="100">100 на странице</option>
          </select>
        </div>
      </div>

      <div class="logs-section">
        <div class="logs-header">
          <h3><i class="fas fa-terminal"></i> Логи системы</h3>
          <div class="log-controls">
            <button class="btn btn-small" id="clear-logs">
              <i class="fas fa-trash"></i> Очистить
            </button>
            <button class="btn btn-small" id="pause-logs">
              <i class="fas fa-pause"></i> Пауза
            </button>
          </div>
        </div>
        <div class="logs-container" id="system-logs">
          <!-- Логи будут добавляться динамически -->
        </div>
      </div>
    `;
  }

  getFarmingPageHTML() {
    return `
      <div class="stats-grid">
        <div class="stat-card blue">
          <i class="fas fa-seedling"></i>
          <div>
            <h3>Активно фармят</h3>
            <p class="stat-value" id="farming-count">0</p>
          </div>
        </div>
        <div class="stat-card green">
          <i class="fas fa-clock"></i>
          <div>
            <h3>Часы фарминга</h3>
            <p class="stat-value" id="total-farming-hours">0</p>
          </div>
        </div>
        <div class="stat-card orange">
          <i class="fas fa-gamepad"></i>
          <div>
            <h3>Игр в работе</h3>
            <p class="stat-value" id="games-count">0</p>
          </div>
        </div>
        <div class="stat-card purple">
          <i class="fas fa-dollar-sign"></i>
          <div>
            <h3>Прибыль с фарминга</h3>
            <p class="stat-value" id="farming-profit">$0</p>
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
          <!-- Игры будут загружены динамически -->
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

  getDropsPageHTML() {
    return `
      <div class="stats-grid">
        <div class="stat-card blue">
          <i class="fas fa-gift"></i>
          <div>
            <h3>Доступные дропы</h3>
            <p class="stat-value" id="available-drops-count">0</p>
          </div>
        </div>
        <div class="stat-card green">
          <i class="fas fa-boxes"></i>
          <div>
            <h3>Всего собрано</h3>
            <p class="stat-value" id="total-drops-count">0</p>
          </div>
        </div>
        <div class="stat-card orange">
          <i class="fas fa-dollar-sign"></i>
          <div>
            <h3>Общая стоимость</h3>
            <p class="stat-value" id="total-drops-value">$0</p>
          </div>
        </div>
        <div class="stat-card purple">
          <i class="fas fa-crown"></i>
          <div>
            <h3>Самый ценный</h3>
            <p class="stat-value" id="most-valuable-drop">$0</p>
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
          <!-- Дропы будут загружены динамически -->
        </div>
      </div>
      
      <div class="drop-history">
        <h3><i class="fas fa-history"></i> История дропов</h3>
        <div class="history-list" id="drop-history-list">
          <!-- История дропов -->
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
    return `
      <div class="security-container">
        <div class="security-status">
          <h3><i class="fas fa-shield-alt"></i> Статус безопасности</h3>
          <div class="risk-level low">
            <div class="risk-icon">
              <i class="fas fa-check-circle"></i>
            </div>
            <div class="risk-info">
              <h4>Уровень риска: Низкий</h4>
              <p>Все аккаунты хорошо защищены, риск блокировки минимален.</p>
              <div class="risk-progress">
                <div class="progress-bar" style="width: 25%; background: #00ff88;"></div>
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
                <p class="stat-value" id="protected-accounts">0</p>
              </div>
            </div>
            <div class="stat-card">
              <i class="fas fa-globe"></i>
              <div>
                <h3>Уникальные прокси</h3>
                <p class="stat-value" id="unique-proxies">0</p>
              </div>
            </div>
            <div class="stat-card">
              <i class="fas fa-desktop"></i>
              <div>
                <h3>Уникальные устройства</h3>
                <p class="stat-value" id="unique-devices">0</p>
              </div>
            </div>
            <div class="stat-card">
              <i class="fas fa-clock"></i>
              <div>
                <h3>Время работы</h3>
                <p class="stat-value" id="total-uptime">0ч</p>
              </div>
            </div>
          </div>
        </div>
        
        <div class="security-recommendations">
          <h4><i class="fas fa-lightbulb"></i> Рекомендации по безопасности</h4>
          <div class="recommendations-list" id="security-recommendations">
            <!-- Рекомендации -->
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
            <!-- Логи безопасности -->
          </div>
        </div>
      </div>
    `;
  }

  getTradingPageHTML() {
    return `
      <div class="stats-grid">
        <div class="stat-card blue">
          <i class="fas fa-shopping-cart"></i>
          <div>
            <h3>Активные продажи</h3>
            <p class="stat-value" id="active-listings">0</p>
          </div>
        </div>
        <div class="stat-card green">
          <i class="fas fa-exchange-alt"></i>
          <div>
            <h3>Активные трейды</h3>
            <p class="stat-value" id="active-trades">0</p>
          </div>
        </div>
        <div class="stat-card orange">
          <i class="fas fa-dollar-sign"></i>
          <div>
            <h3>Оборот</h3>
            <p class="stat-value" id="trade-volume">$0</p>
          </div>
        </div>
        <div class="stat-card purple">
          <i class="fas fa-percentage"></i>
          <div>
            <h3>Процент успеха</h3>
            <p class="stat-value" id="trade-success-rate">85%</p>
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
        <div class="listings-table" id="market-listings">
          <!-- Список продаж -->
        </div>
      </div>
    `;
  }

  // ===== ОБНОВЛЕНИЕ СОДЕРЖИМОГО СТРАНИЦ =====
  updatePageContent(pageName) {
    switch(pageName) {
      case 'accounts':
        this.renderAccounts();
        this.updateStats();
        break;
      case 'farming':
        this.updateFarmingPage();
        break;
      case 'drops':
        this.updateDropsPage();
        break;
      case 'settings':
        this.updateSettingsPage();
        break;
      case 'security':
        this.updateSecurityPage();
        break;
      case 'trading':
        this.updateTradingPage();
        break;
    }
  }

  // ===== РЕНДЕРИНГ АККАУНТОВ =====
  renderAccounts() {
    const container = document.getElementById('accounts-list-container');
    if (!container) return;

    const filteredAccounts = this.getFilteredAccounts();
    const pagedAccounts = this.getPagedAccounts(filteredAccounts);
    
    if (pagedAccounts.length === 0) {
      container.innerHTML = this.getEmptyStateHTML();
    } else {
      container.innerHTML = pagedAccounts.map(account => this.createAccountCardHTML(account)).join('');
    }

    this.updateElement('filtered-count', filteredAccounts.length);
    this.updatePagination(filteredAccounts.length);
    this.updateCheckboxes();
  }

  createAccountCardHTML(account) {
    const avatarColor = this.getAvatarColor(account.id);
    const isSelected = selectedAccounts.has(account.id);
    
    return `
      <div class="account-card ${isSelected ? 'selected' : ''}" data-account-id="${account.id}">
        <div class="col-checkbox">
          <input type="checkbox" class="account-checkbox" data-account-id="${account.id}" ${isSelected ? 'checked' : ''}>
        </div>
        <div class="col-account">
          <div class="account-info">
            <div class="avatar" style="background: ${avatarColor};">
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
          <span class="status-badge ${this.getStatusClass(account.status)}">
            ${this.getStatusText(account.status)}
          </span>
          <div class="uptime">${account.uptime}</div>
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
          <div>${account.uptime}</div>
          <small>Последняя активность: ${new Date(account.lastActivity).toLocaleTimeString()}</small>
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
                    onclick="steamManager.showAccountMenu('${account.id}')"
                    title="Меню действий">
              <i class="fas fa-ellipsis-h"></i>
            </button>
          </div>
        </div>
      </div>
    `;
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

  getEmptyStateHTML() {
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

  // ===== ФИЛЬТРАЦИЯ И ПАГИНАЦИЯ =====
  getFilteredAccounts() {
    const statusFilter = document.getElementById('status-filter')?.value || 'all';
    const countryFilter = document.getElementById('country-filter')?.value || 'all';
    const gameFilter = document.getElementById('game-filter')?.value || 'all';
    const searchText = document.getElementById('search-accounts')?.value.toLowerCase() || '';

    return accounts.filter(account => {
      // Фильтр по статусу
      if (statusFilter !== 'all' && account.status !== statusFilter) return false;
      
      // Фильтр по стране
      if (countryFilter !== 'all' && account.country !== countryFilter) return false;
      
      // Фильтр по игре
      if (gameFilter !== 'all' && account.game !== gameFilter) return false;
      
      // Поиск
      if (searchText) {
        const searchIn = account.name.toLowerCase() + ' ' + account.login.toLowerCase();
        if (!searchIn.includes(searchText)) return false;
      }
      
      return true;
    });
  }

  getPagedAccounts(filteredAccounts) {
    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    return filteredAccounts.slice(start, end);
  }

  updatePagination(totalItems) {
    totalPages = Math.ceil(totalItems / pageSize);
    
    this.updateElement('current-page', currentPage);
    this.updateElement('total-pages', totalPages);
    
    const prevBtn = document.getElementById('prev-page');
    const nextBtn = document.getElementById('next-page');
    
    if (prevBtn) prevBtn.disabled = currentPage === 1;
    if (nextBtn) nextBtn.disabled = currentPage === totalPages;
  }

  // ===== ОБНОВЛЕНИЕ СТАТИСТИКИ =====
  updateStats() {
    const total = accounts.length;
    const farming = accounts.filter(a => a.farming).length;
    const online = accounts.filter(a => a.status !== 'offline').length;
    const drops = accounts.filter(a => a.hasNewDrop).length;
    const totalProfit = accounts.reduce((sum, acc) => sum + (acc.totalProfit || 0), 0);
    const totalDrops = accounts.reduce((sum, acc) => sum + (acc.totalDrops || 0), 0);
    
    this.updateElement('total-accounts', total);
    this.updateElement('farming-now', farming);
    this.updateElement('drops-available', drops);
    this.updateElement('account-count', total);
    this.updateElement('farming-count', farming);
    this.updateElement('drop-count', drops);
    
    // Расчет риска
    const risk = this.calculateRiskLevel();
    this.updateElement('ban-risk', risk.level);
    const riskElement = this.updateElement('ban-risk');
    if (riskElement) riskElement.style.color = risk.color;
    
    // Обновление боковой панели
    const proxyCount = document.getElementById('proxy-count');
    if (proxyCount) {
      proxyCount.textContent = `${accounts.filter(a => a.proxy).length}/${accounts.length}`;
    }
    
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
      !a.proxy
    ).length;
    
    const riskPercent = (highRiskCount / accounts.length) * 100;
    
    if (riskPercent > 50) return { level: 'Критический', color: '#ff0000' };
    if (riskPercent > 30) return { level: 'Высокий', color: '#ff5555' };
    if (riskPercent > 15) return { level: 'Средний', color: '#ffaa00' };
    return { level: 'Низкий', color: '#00ff88' };
  }

  // ===== ОБНОВЛЕНИЕ ЧЕКБОКСОВ =====
  updateCheckboxes() {
    const allCheckbox = document.getElementById('select-all-checkbox');
    const accountCheckboxes = document.querySelectorAll('.account-checkbox');
    
    if (allCheckbox) {
      const visibleAccounts = this.getPagedAccounts(this.getFilteredAccounts());
      const allVisibleSelected = visibleAccounts.length > 0 && 
        visibleAccounts.every(acc => selectedAccounts.has(acc.id));
      
      allCheckbox.checked = allVisibleSelected;
      allCheckbox.indeterminate = !allVisibleSelected && 
        visibleAccounts.some(acc => selectedAccounts.has(acc.id));
    }
    
    accountCheckboxes.forEach(cb => {
      cb.checked = selectedAccounts.has(cb.dataset.accountId);
    });
  }

  // ===== ОБНОВЛЕНИЕ ЭЛЕМЕНТОВ =====
  updateElement(id, value) {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = value;
      return element;
    }
    return null;
  }

  // ===== ИНИЦИАЛИЗАЦИЯ ОБРАБОТЧИКОВ =====
  initEventListeners() {
    // Кнопка добавления аккаунта
    document.getElementById('add-account')?.addEventListener('click', () => this.showAddAccountModal());
    document.getElementById('add-first-account')?.addEventListener('click', () => this.showAddAccountModal());
    
    // Выбор всех аккаунтов
    document.getElementById('select-all')?.addEventListener('click', () => this.selectAllVisible());
    document.getElementById('select-all-checkbox')?.addEventListener('change', (e) => {
      this.toggleSelectAllVisible(e.target.checked);
    });
    
    // Запуск/остановка выбранных
    document.getElementById('start-selected')?.addEventListener('click', () => this.startSelected());
    document.getElementById('stop-selected')?.addEventListener('click', () => this.stopSelected());
    
    // Фильтры
    document.getElementById('status-filter')?.addEventListener('change', () => this.renderAccounts());
    document.getElementById('country-filter')?.addEventListener('change', () => this.renderAccounts());
    document.getElementById('game-filter')?.addEventListener('change', () => this.renderAccounts());
    document.getElementById('search-accounts')?.addEventListener('input', () => this.renderAccounts());
    
    // Пагинация
    document.getElementById('prev-page')?.addEventListener('click', () => this.changePage(-1));
    document.getElementById('next-page')?.addEventListener('click', () => this.changePage(1));
    document.getElementById('page-size')?.addEventListener('change', (e) => {
      pageSize = parseInt(e.target.value);
      currentPage = 1;
      this.renderAccounts();
    });
    
    // Логи
    document.getElementById('clear-logs')?.addEventListener('click', () => this.clearLogs());
    document.getElementById('pause-logs')?.addEventListener('click', () => this.toggleLogsPause());
    
    // Обновление списка
    document.getElementById('refresh-list')?.addEventListener('click', () => this.refreshAccounts());
    document.getElementById('check-drops')?.addEventListener('click', () => this.checkAllDrops());
    
    // Модальные окна
    document.querySelectorAll('.close-modal').forEach(btn => {
      btn.addEventListener('click', () => this.hideAllModals());
    });
    
    // Массовые действия
    document.getElementById('start-all-farming')?.addEventListener('click', () => this.startAllFarming());
    document.getElementById('stop-all')?.addEventListener('click', () => this.stopAllAccounts());
    document.getElementById('claim-all-drops')?.addEventListener('click', () => this.claimAllDrops());
    document.getElementById('bulk-actions-btn')?.addEventListener('click', () => this.showBulkActionsModal());
    
    // Закрытие модалок по клику вне
    document.querySelectorAll('.modal').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.remove('active');
        }
      });
    });
    
    // Импорт/экспорт
    document.getElementById('import-accounts')?.addEventListener('click', () => this.importAccounts());
    document.getElementById('export-accounts')?.addEventListener('click', () => this.exportAccounts());
    
    // Сохранение аккаунта
    document.getElementById('save-account')?.addEventListener('click', () => this.saveNewAccount());
    
    // Показ пароля
    document.getElementById('show-password-btn')?.addEventListener('click', () => {
      const passwordField = document.getElementById('steam-password');
      passwordField.type = passwordField.type === 'password' ? 'text' : 'password';
    });
    
    // Вкладки в модалке
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        this.switchTab(tab);
      });
    });
    
    // Загрузка при скролле логов
    const logsContainer = document.getElementById('system-logs');
    if (logsContainer) {
      logsContainer.addEventListener('scroll', () => {
        if (logsContainer.scrollTop === 0 && !isLogsPaused) {
          this.loadMoreLogs();
        }
      });
    }
  }

  // ===== ОСНОВНЫЕ ФУНКЦИИ УПРАВЛЕНИЯ =====
  toggleAccountStatus(accountId) {
    const account = accounts.find(a => a.id === accountId);
    if (!account) return;
    
    if (account.status === 'offline') {
      account.status = 'online';
      account.uptime = '0ч 0м';
      this.addLog(`Аккаунт "${account.name}" запущен`, 'success');
    } else {
      account.status = 'offline';
      account.farming = false;
      this.addLog(`Аккаунт "${account.name}" остановлен`, 'info');
    }
    
    this.updateAll();
    this.showNotification(`Аккаунт "${account.name}" ${account.status === 'online' ? 'запущен' : 'остановлен'}`, 
                         account.status === 'online' ? 'success' : 'warning');
  }

  toggleFarming(accountId) {
    const account = accounts.find(a => a.id === accountId);
    if (!account || account.status === 'offline') {
      this.showNotification('Аккаунт должен быть онлайн для фарминга', 'warning');
      return;
    }
    
    account.farming = !account.farming;
    account.status = account.farming ? 'farming' : 'online';
    
    if (account.farming) {
      account.farmingHours = (account.farmingHours || 0) + 0.5;
      this.addLog(`Фарминг запущен на "${account.name}"`, 'success');
    } else {
      this.addLog(`Фарминг остановлен на "${account.name}"`, 'info');
    }
    
    this.updateAll();
    this.showNotification(`Фарминг ${account.farming ? 'запущен' : 'остановлен'} на "${account.name}"`, 
                         account.farming ? 'success' : 'warning');
  }

  claimDrop(accountId) {
    const account = accounts.find(a => a.id === accountId);
    if (!account || !account.hasNewDrop) return;
    
    // Генерируем случайный дроп
    const drops = [
      { name: "CS:GO Weapon Case", price: 0.35, rarity: "common" },
      { name: "Operation Phoenix Case", price: 0.85, rarity: "rare" },
      { name: "AK-47 | Redline", price: 15.50, rarity: "covert" },
      { name: "Prisma 2 Case", price: 0.45, rarity: "rare" }
    ];
    
    const drop = drops[Math.floor(Math.random() * drops.length)];
    account.hasNewDrop = false;
    account.totalProfit = (account.totalProfit || 0) + drop.price;
    account.totalDrops = (account.totalDrops || 0) + 1;
    account.lastDrop = drop;
    
    if (!account.inventory) account.inventory = [];
    account.inventory.push({
      ...drop,
      acquired: new Date().toISOString()
    });
    
    this.updateAll();
    this.addLog(`Получен дроп на "${account.name}": ${drop.name} ($${drop.price})`, 'success');
    this.showNotification(`Получен дроп: ${drop.name} ($${drop.price})`, 'success');
    
    // Показываем модалку с дропом
    this.showDropNotification(account.name, drop);
  }

  // ===== МОДАЛЬНЫЕ ОКНА =====
  showAddAccountModal() {
    const modal = document.getElementById('add-account-modal');
    if (modal) {
      modal.classList.add('active');
      document.getElementById('account-name')?.focus();
    }
  }

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

  saveNewAccount() {
    const name = document.getElementById('account-name')?.value.trim();
    const login = document.getElementById('steam-login')?.value.trim();
    const password = document.getElementById('steam-password')?.value.trim();
    const country = document.getElementById('account-country')?.value || 'ru';
    const game = document.getElementById('farming-game')?.value || 'cs2';
    const isolation = document.querySelector('input[name="isolation"]:checked')?.value || 'maximum';
    
    if (!name || !login || !password) {
      this.showNotification('Заполните обязательные поля', 'error');
      return;
    }
    
    const newAccount = {
      id: 'acc_' + Date.now(),
      name,
      login,
      status: 'offline',
      game: game.toUpperCase(),
      country,
      uptime: '0ч 0м',
      farming: false,
      hasNewDrop: false,
      totalProfit: 0,
      totalDrops: 0,
      inventory: [],
      marketListings: [],
      isolation,
      proxy: {
        ip: `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
        port: 8080,
        city: country === 'ru' ? 'Москва' : 'Нью-Йорк',
        type: 'residential'
      },
      lastActivity: new Date().toISOString(),
      farmingHours: 0
    };
    
    accounts.push(newAccount);
    this.hideAllModals();
    this.resetAddAccountForm();
    this.updateAll();
    
    this.addLog(`Добавлен новый аккаунт: "${name}"`, 'success');
    this.showNotification(`Аккаунт "${name}" добавлен`, 'success');
  }

  resetAddAccountForm() {
    document.getElementById('account-name').value = '';
    document.getElementById('steam-login').value = '';
    document.getElementById('steam-password').value = '';
    document.getElementById('steam-shared-secret').value = '';
    document.getElementById('multiple-accounts').value = '';
    document.getElementById('account-country').value = 'auto';
    document.getElementById('farming-game').value = 'cs2';
    document.querySelector('input[name="isolation"][value="maximum"]').checked = true;
    document.getElementById('auto-start').checked = true;
    document.getElementById('auto-farm').checked = true;
    document.getElementById('claim-drops').checked = false;
    document.getElementById('enable-trading').checked = false;
  }

  // ===== МАССОВЫЕ ДЕЙСТВИЯ =====
  selectAllVisible() {
    const visibleAccounts = this.getPagedAccounts(this.getFilteredAccounts());
    
    if (visibleAccounts.every(acc => selectedAccounts.has(acc.id))) {
      // Если все уже выбраны - снимаем выделение
      visibleAccounts.forEach(acc => selectedAccounts.delete(acc.id));
    } else {
      // Иначе выбираем всех
      visibleAccounts.forEach(acc => selectedAccounts.add(acc.id));
    }
    
    this.renderAccounts();
  }

  toggleSelectAllVisible(checked) {
    const visibleAccounts = this.getPagedAccounts(this.getFilteredAccounts());
    
    if (checked) {
      visibleAccounts.forEach(acc => selectedAccounts.add(acc.id));
    } else {
      visibleAccounts.forEach(acc => selectedAccounts.delete(acc.id));
    }
    
    this.renderAccounts();
  }

  startSelected() {
    const selected = Array.from(selectedAccounts);
    if (selected.length === 0) {
      this.showNotification('Выберите хотя бы один аккаунт', 'warning');
      return;
    }
    
    selected.forEach(accountId => {
      const account = accounts.find(a => a.id === accountId);
      if (account && account.status === 'offline') {
        account.status = 'online';
        account.uptime = '0ч 0м';
      }
    });
    
    this.updateAll();
    this.addLog(`Запущено ${selected.length} аккаунтов`, 'success');
    this.showNotification(`Запущено ${selected.length} аккаунтов`, 'success');
  }

  stopSelected() {
    const selected = Array.from(selectedAccounts);
    if (selected.length === 0) {
      this.showNotification('Выберите хотя бы один аккаунт', 'warning');
      return;
    }
    
    selected.forEach(accountId => {
      const account = accounts.find(a => a.id === accountId);
      if (account && account.status !== 'offline') {
        account.status = 'offline';
        account.farming = false;
      }
    });
    
    this.updateAll();
    this.addLog(`Остановлено ${selected.length} аккаунтов`, 'info');
    this.showNotification(`Остановлено ${selected.length} аккаунтов`, 'warning');
  }

  startAllFarming() {
    const onlineAccounts = accounts.filter(a => a.status !== 'offline' && !a.farming);
    
    onlineAccounts.forEach(account => {
      account.farming = true;
      account.status = 'farming';
      account.farmingHours = (account.farmingHours || 0) + 0.5;
    });
    
    this.updateAll();
    this.addLog(`Фарминг запущен на ${onlineAccounts.length} аккаунтах`, 'success');
    this.showNotification(`Фарминг запущен на ${onlineAccounts.length} аккаунтах`, 'success');
  }

  stopAllAccounts() {
    accounts.forEach(account => {
      if (account.status !== 'offline') {
        account.status = 'offline';
        account.farming = false;
      }
    });
    
    this.updateAll();
    this.addLog('Все аккаунты остановлены', 'info');
    this.showNotification('Все аккаунты остановлены', 'warning');
  }

  claimAllDrops() {
    const accountsWithDrops = accounts.filter(a => a.hasNewDrop);
    
    if (accountsWithDrops.length === 0) {
      this.showNotification('Нет доступных дропов', 'info');
      return;
    }
    
    accountsWithDrops.forEach(account => {
      this.claimDrop(account.id);
    });
    
    this.addLog(`Собрано дропов: ${accountsWithDrops.length}`, 'success');
  }

  showBulkActionsModal() {
    const modal = document.getElementById('bulk-actions-modal');
    if (modal) {
      // Обновляем статистику в модалке
      this.updateElement('available-drops-count', accounts.filter(a => a.hasNewDrop).length);
      this.updateElement('can-farm-count', accounts.filter(a => a.status !== 'offline' && !a.farming).length);
      this.updateElement('active-accounts-count', accounts.filter(a => a.status !== 'offline').length);
      this.updateElement('proxy-users-count', accounts.filter(a => a.proxy).length);
      
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

  // ===== ОБНОВЛЕНИЕ ДРУГИХ СТРАНИЦ =====
  updateFarmingPage() {
    const farmingAccounts = accounts.filter(a => a.farming);
    const totalFarmingHours = accounts.reduce((sum, a) => sum + (a.farmingHours || 0), 0);
    const games = [...new Set(accounts.filter(a => a.farming).map(a => a.game))];
    const totalProfit = accounts.reduce((sum, a) => sum + (a.totalProfit || 0), 0);
    
    this.updateElement('farming-count', farmingAccounts.length);
    this.updateElement('total-farming-hours', totalFarmingHours.toFixed(1));
    this.updateElement('games-count', games.length);
    this.updateElement('farming-profit', `$${totalProfit.toFixed(2)}`);
    
    // Обновляем список игр
    const gamesGrid = document.getElementById('games-grid');
    if (gamesGrid) {
      const gamesHTML = games.map(game => `
        <div class="game-card" data-game="${game}">
          <div class="game-icon">
            <i class="${this.getGameIcon(game)}"></i>
          </div>
          <h4>${game}</h4>
          <p>${accounts.filter(a => a.game === game && a.farming).length} аккаунтов</p>
          <button class="btn btn-small start-game-farming" onclick="steamManager.startGameFarming('${game}')">
            <i class="fas fa-play"></i> Запустить
          </button>
        </div>
      `).join('');
      
      gamesGrid.innerHTML = gamesHTML;
    }
  }

  updateDropsPage() {
    const accountsWithDrops = accounts.filter(a => a.hasNewDrop);
    const totalDrops = accounts.reduce((sum, a) => sum + (a.totalDrops || 0), 0);
    const totalValue = accounts.reduce((sum, a) => {
      const inventoryValue = (a.inventory || []).reduce((invSum, item) => invSum + (item.price || 0), 0);
      return sum + inventoryValue;
    }, 0);
    
    let maxPrice = 0;
    accounts.forEach(a => {
      (a.inventory || []).forEach(item => {
        if (item.price > maxPrice) maxPrice = item.price;
      });
    });
    
    this.updateElement('available-drops-count', accountsWithDrops.length);
    this.updateElement('total-drops-count', totalDrops);
    this.updateElement('total-drops-value', `$${totalValue.toFixed(2)}`);
    this.updateElement('most-valuable-drop', `$${maxPrice.toFixed(2)}`);
    
    // Обновляем список дропов
    const dropsGrid = document.getElementById('available-drops-grid');
    if (dropsGrid) {
      if (accountsWithDrops.length === 0) {
        dropsGrid.innerHTML = `
          <div class="empty-state">
            <i class="fas fa-gift fa-3x"></i>
            <p>Нет доступных дропов</p>
            <p class="small">Запустите фарминг для получения дропов</p>
          </div>
        `;
      } else {
        const dropsHTML = accountsWithDrops.map(account => `
          <div class="drop-card" data-account-id="${account.id}">
            <div class="drop-account">${account.name}</div>
            <div class="drop-item">
              <i class="fas fa-box-open"></i>
              <span>${account.lastDrop?.name || 'Новый дроп'}</span>
            </div>
            <div class="drop-value">$${account.lastDrop?.price?.toFixed(2) || '0.00'}</div>
            <button class="btn btn-small btn-success" onclick="steamManager.claimDrop('${account.id}')">
              <i class="fas fa-check"></i> Забрать
            </button>
          </div>
        `).join('');
        
        dropsGrid.innerHTML = dropsHTML;
      }
    }
    
    // Обновляем историю дропов
    const historyList = document.getElementById('drop-history-list');
    if (historyList) {
      let allItems = [];
      accounts.forEach(account => {
        if (account.inventory) {
          account.inventory.forEach(item => {
            allItems.push({
              ...item,
              accountName: account.name
            });
          });
        }
      });
      
      allItems.sort((a, b) => new Date(b.acquired) - new Date(a.acquired));
      const recentItems = allItems.slice(0, 5);
      
      if (recentItems.length === 0) {
        historyList.innerHTML = `
          <div class="empty-state">
            <i class="fas fa-history fa-3x"></i>
            <p>История дропов пуста</p>
          </div>
        `;
      } else {
        historyList.innerHTML = recentItems.map(item => `
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
          </div>
        `).join('');
      }
    }
  }

  updateSecurityPage() {
    const protectedAccounts = accounts.filter(a => a.isolation === 'maximum' || a.isolation === 'high').length;
    const uniqueProxies = new Set(accounts.filter(a => a.proxy).map(a => a.proxy.ip)).size;
    const totalUptime = accounts.filter(a => a.status !== 'offline').length;
    
    this.updateElement('protected-accounts', protectedAccounts);
    this.updateElement('unique-proxies', uniqueProxies);
    this.updateElement('unique-devices', accounts.length);
    this.updateElement('total-uptime', `${totalUptime}ч`);
    
    // Обновляем рекомендации
    const recommendations = document.getElementById('security-recommendations');
    if (recommendations) {
      let recs = [];
      
      const lowIsolation = accounts.filter(a => a.isolation === 'low' || a.isolation === 'medium').length;
      if (lowIsolation > 0) {
        recs.push(`
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
        recs.push(`
          <div class="recommendation warning">
            <i class="fas fa-exclamation-triangle"></i>
            <div>
              <strong>${noProxy} аккаунтов без прокси</strong>
              <p>Добавьте уникальные прокси для каждого аккаунта</p>
            </div>
          </div>
        `);
      }
      
      if (recs.length === 0) {
        recs.push(`
          <div class="recommendation success">
            <i class="fas fa-check-circle"></i>
            <div>
              <strong>Все в порядке!</strong>
              <p>Все аккаунты хорошо защищены, рекомендации не требуются</p>
            </div>
          </div>
        `);
      }
      
      recommendations.innerHTML = recs.join('');
    }
    
    // Обновляем логи безопасности
    const securityLogs = document.getElementById('security-logs-list');
    if (securityLogs) {
      const securityEntries = logs.filter(log => 
        log.type === 'warning' || log.type === 'error' || 
        log.message.includes('безопасност') || log.message.includes('риск') ||
        log.message.includes('прокси') || log.message.includes('защит')
      ).slice(0, 5);
      
      if (securityEntries.length === 0) {
        securityLogs.innerHTML = `
          <div class="empty-state">
            <i class="fas fa-shield-alt fa-3x"></i>
            <p>Нет записей в логах безопасности</p>
          </div>
        `;
      } else {
        securityLogs.innerHTML = securityEntries.map(log => `
          <div class="log-entry ${log.type}">
            <span class="log-time">[${log.time}]</span>
            <span class="log-message">${log.message}</span>
          </div>
        `).join('');
      }
    }
  }

  updateSettingsPage() {
    // Настройка слайдера задержки
    const delaySlider = document.getElementById('delay-slider');
    const delayDisplay = document.getElementById('delay-value-display');
    if (delaySlider && delayDisplay) {
      delaySlider.addEventListener('input', (e) => {
        delayDisplay.textContent = e.target.value;
      });
    }
  }

  updateTradingPage() {
    const totalListings = accounts.reduce((sum, a) => sum + (a.marketListings?.length || 0), 0);
    const activeTrades = accounts.filter(a => a.status === 'trading').length;
    const totalProfit = accounts.reduce((sum, a) => sum + (a.totalProfit || 0), 0);
    
    this.updateElement('active-listings', totalListings);
    this.updateElement('active-trades', activeTrades);
    this.updateElement('trade-volume', `$${totalProfit.toFixed(2)}`);
    
    // Обновляем список продаж
    const listingsContainer = document.getElementById('market-listings');
    if (listingsContainer) {
      let allListings = [];
      accounts.forEach(account => {
        if (account.marketListings) {
          account.marketListings.forEach(listing => {
            allListings.push({
              ...listing,
              accountName: account.name
            });
          });
        }
      });
      
      if (allListings.length === 0) {
        listingsContainer.innerHTML = `
          <div class="empty-state">
            <i class="fas fa-shopping-cart fa-3x"></i>
            <p>Нет активных продаж</p>
            <p class="small">Выставьте предметы на рынок в разделе Аккаунты</p>
          </div>
        `;
      } else {
        listingsContainer.innerHTML = `
          <div class="table-header">
            <div class="col-item">Предмет</div>
            <div class="col-account">Аккаунт</div>
            <div class="col-price">Цена</div>
            <div class="col-status">Статус</div>
            <div class="col-time">Время</div>
            <div class="col-actions">Действия</div>
          </div>
          <div class="table-body">
            ${allListings.map(listing => `
              <div class="listing-row" data-listing-id="${listing.id}">
                <div class="col-item">
                  <i class="fas fa-box-open"></i>
                  <span>${listing.item?.name || 'Предмет'}</span>
                </div>
                <div class="col-account">${listing.accountName}</div>
                <div class="col-price">$${listing.price?.toFixed(2) || '0.00'}</div>
                <div class="col-status">
                  <span class="status-badge ${listing.status}">${listing.status}</span>
                </div>
                <div class="col-time">${new Date(listing.listedAt).toLocaleTimeString()}</div>
                <div class="col-actions">
                  <button class="action-btn danger" onclick="steamManager.cancelListing('${listing.id}')">
                    <i class="fas fa-times"></i>
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        `;
      }
    }
  }

  // ===== ЛОГИРОВАНИЕ =====
  addLog(message, type = 'info') {
    const logEntry = {
      time: new Date().toLocaleTimeString(),
      message,
      type
    };
    
    logs.unshift(logEntry);
    if (logs.length > 100) logs.pop();
    
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

  clearLogs() {
    logs = [];
    this.updateLogs();
    this.addLog('Логи очищены', 'info');
  }

  toggleLogsPause() {
    isLogsPaused = !isLogsPaused;
    const pauseBtn = document.getElementById('pause-logs');
    if (pauseBtn) {
      pauseBtn.innerHTML = isLogsPaused ? 
        '<i class="fas fa-play"></i> Продолжить' : 
        '<i class="fas fa-pause"></i> Пауза';
    }
  }

  // ===== УВЕДОМЛЕНИЯ =====
  showNotification(message, type = 'info') {
    const container = document.getElementById('notifications');
    if (!container) return;
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
      <i class="fas ${this.getNotificationIcon(type)}"></i>
      <span>${message}</span>
      <button class="notification-close">&times;</button>
    `;
    
    container.appendChild(notification);
    
    // Автоматическое скрытие
    setTimeout(() => {
      notification.classList.add('show');
    }, 10);
    
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    }, 5000);
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

  showDropNotification(accountName, drop) {
    this.showNotification(`🎁 ${accountName}: ${drop.name} ($${drop.price})`, 'success');
  }

  // ===== ДЕМО ДАННЫЕ =====
  loadDemoData() {
    accounts = [
      {
        id: 'demo1',
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
          { id: '1', name: 'AK-47 | Redline', price: 15.50, rarity: 'covert', acquired: new Date().toISOString() },
          { id: '2', name: 'Prisma 2 Case', price: 0.45, rarity: 'common', acquired: new Date().toISOString() }
        ],
        marketListings: [],
        isolation: 'maximum',
        proxy: { ip: '195.24.76.123', port: 8080, city: 'Москва', type: 'residential' },
        farmingHours: 4.5,
        lastActivity: new Date().toISOString()
      },
      {
        id: 'demo2',
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
          { id: '3', name: 'AWP | Asiimov', price: 45.00, rarity: 'covert', acquired: new Date().toISOString() }
        ],
        marketListings: [
          {
            id: 'listing1',
            item: { id: '4', name: 'Operation Phoenix Case', price: 0.85, rarity: 'rare' },
            price: 0.90,
            listedAt: new Date().toISOString(),
            status: 'active'
          }
        ],
        isolation: 'high',
        proxy: { ip: '87.256.45.12', port: 8080, city: 'Берлин', type: 'datacenter' },
        farmingHours: 12.8,
        lastActivity: new Date().toISOString()
      },
      {
        id: 'demo3',
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
          { id: '5', name: 'Arcana | Terrorblade', price: 45.00, rarity: 'legendary', acquired: new Date().toISOString() },
          { id: '6', name: 'Immortal Treasure I', price: 3.50, rarity: 'rare', acquired: new Date().toISOString() }
        ],
        marketListings: [
          {
            id: 'listing2',
            item: { id: '5', name: 'Arcana | Terrorblade', price: 45.00, rarity: 'legendary' },
            price: 48.00,
            listedAt: new Date().toISOString(),
            status: 'active'
          }
        ],
        isolation: 'maximum',
        proxy: { ip: '104.18.210.45', port: 8080, city: 'Нью-Йорк', type: 'residential' },
        farmingHours: 2.3,
        lastActivity: new Date().toISOString()
      }
    ];
  }

  // ===== ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ =====
  changePage(delta) {
    const newPage = currentPage + delta;
    if (newPage >= 1 && newPage <= totalPages) {
      currentPage = newPage;
      this.renderAccounts();
    }
  }

  refreshAccounts() {
    this.addLog('Обновление списка аккаунтов...', 'info');
    this.renderAccounts();
    this.showNotification('Список аккаунтов обновлен', 'success');
  }

  checkAllDrops() {
    // Эмуляция проверки дропов
    const accountsWithNewDrops = accounts.filter(() => Math.random() > 0.7); // 30% шанс дропа
    
    accountsWithNewDrops.forEach(account => {
      account.hasNewDrop = true;
    });
    
    this.updateAll();
    this.addLog(`Проверка дропов: найдено ${accountsWithNewDrops.length} новых`, 'info');
    this.showNotification(`Найдено ${accountsWithNewDrops.length} новых дропов`, 'success');
  }

  importAccounts() {
    this.showNotification('Функция импорта в разработке', 'info');
  }

  exportAccounts() {
    const dataStr = JSON.stringify(accounts, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `steam-accounts-${new Date().toISOString().split('T')[0]}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    
    this.addLog('Экспорт аккаунтов завершен', 'success');
    this.showNotification('Аккаунты экспортированы', 'success');
  }

  startAutoUpdates() {
    // Обновляем время работы каждую минуту
    updateInterval = setInterval(() => {
      accounts.forEach(account => {
        if (account.status !== 'offline') {
          // Увеличиваем время работы
          const hours = Math.floor((account.farmingHours || 0) + 0.0167); // +1 минута
          const minutes = Math.floor(((account.farmingHours || 0) + 0.0167) * 60) % 60;
          account.uptime = `${hours}ч ${minutes}м`;
          
          // Шанс получить дроп во время фарминга
          if (account.farming && Math.random() < 0.01) { // 1% шанс каждую минуту
            account.hasNewDrop = true;
          }
        }
      });
      
      if (currentPageView === 'accounts') {
        this.updateAll();
      }
    }, 60000); // Каждую минуту
  }

  showAccountMenu(accountId) {
    const account = accounts.find(a => a.id === accountId);
    if (!account) return;
    
    // Показываем контекстное меню
    const menuHTML = `
      <div class="account-menu">
        <button onclick="steamManager.viewInventory('${accountId}')">
          <i class="fas fa-box-open"></i> Инвентарь
        </button>
        <button onclick="steamManager.showAccountSettings('${accountId}')">
          <i class="fas fa-cog"></i> Настройки
        </button>
        <button onclick="steamManager.renameAccount('${accountId}')">
          <i class="fas fa-edit"></i> Переименовать
        </button>
        <button class="danger" onclick="steamManager.deleteAccount('${accountId}')">
          <i class="fas fa-trash"></i> Удалить
        </button>
      </div>
    `;
    
    // Создаем и показываем меню
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.innerHTML = menuHTML;
    menu.style.position = 'absolute';
    menu.style.top = '50px';
    menu.style.right = '20px';
    menu.style.zIndex = '1000';
    
    document.body.appendChild(menu);
    
    // Закрытие меню при клике вне
    setTimeout(() => {
      const closeHandler = (e) => {
        if (!menu.contains(e.target)) {
          menu.remove();
          document.removeEventListener('click', closeHandler);
        }
      };
      document.addEventListener('click', closeHandler);
    }, 10);
  }

  viewInventory(accountId) {
    const account = accounts.find(a => a.id === accountId);
    if (!account) return;
    
    this.showNotification(`Инвентарь "${account.name}" загружается...`, 'info');
    // Здесь будет открытие модалки с инвентарем
  }

  showAccountSettings(accountId) {
    this.showNotification('Настройки аккаунта в разработке', 'info');
  }

  renameAccount(accountId) {
    const account = accounts.find(a => a.id === accountId);
    if (!account) return;
    
    const newName = prompt('Введите новое имя аккаунта:', account.name);
    if (newName && newName.trim()) {
      const oldName = account.name;
      account.name = newName.trim();
      this.updateAll();
      this.addLog(`Аккаунт "${oldName}" переименован в "${account.name}"`, 'info');
      this.showNotification(`Аккаунт переименован в "${account.name}"`, 'success');
    }
  }

  deleteAccount(accountId) {
    const account = accounts.find(a => a.id === accountId);
    if (!account) return;
    
    if (confirm(`Вы уверены, что хотите удалить аккаунт "${account.name}"?`)) {
      const index = accounts.findIndex(a => a.id === accountId);
      if (index !== -1) {
        accounts.splice(index, 1);
        selectedAccounts.delete(accountId);
        this.updateAll();
        this.addLog(`Аккаунт "${account.name}" удален`, 'warning');
        this.showNotification(`Аккаунт "${account.name}" удален`, 'warning');
      }
    }
  }

  startGameFarming(game) {
    const accountsForGame = accounts.filter(a => a.game === game && a.status !== 'offline' && !a.farming);
    
    accountsForGame.forEach(account => {
      account.farming = true;
      account.status = 'farming';
      account.farmingHours = (account.farmingHours || 0) + 0.5;
    });
    
    this.updateFarmingPage();
    this.addLog(`Фарминг ${game} запущен на ${accountsForGame.length} аккаунтах`, 'success');
    this.showNotification(`Фарминг ${game} запущен на ${accountsForGame.length} аккаунтах`, 'success');
  }

  cancelListing(listingId) {
    let listingFound = false;
    accounts.forEach(account => {
      if (account.marketListings) {
        const index = account.marketListings.findIndex(l => l.id === listingId);
        if (index !== -1) {
          const listing = account.marketListings[index];
          account.marketListings.splice(index, 1);
          listingFound = true;
          
          this.addLog(`Продажа отменена: ${listing.item?.name || 'Предмет'}`, 'info');
          this.showNotification('Продажа отменена', 'info');
        }
      }
    });
    
    if (listingFound) {
      this.updateTradingPage();
    }
  }

  // Очистка при закрытии
  cleanup() {
    if (updateInterval) {
      clearInterval(updateInterval);
    }
  }
}

// ===== ИНИЦИАЛИЗАЦИЯ =====
let steamManager;

document.addEventListener('DOMContentLoaded', () => {
  steamManager = new SteamManager();
  window.steamManager = steamManager;
  
  // Закрытие уведомлений
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('notification-close')) {
      const notification = e.target.closest('.notification');
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    }
  });
  
  // Закрытие при нажатии ESC
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      steamManager.hideAllModals();
    }
  });
  
  // Обработка выбора аккаунтов
  document.addEventListener('change', (e) => {
    if (e.target.classList.contains('account-checkbox')) {
      const accountId = e.target.dataset.accountId;
      if (e.target.checked) {
        selectedAccounts.add(accountId);
      } else {
        selectedAccounts.delete(accountId);
      }
      
      // Обновляем чекбокс "Выбрать все"
      const allCheckbox = document.getElementById('select-all-checkbox');
      if (allCheckbox) {
        const visibleAccounts = steamManager.getPagedAccounts(steamManager.getFilteredAccounts());
        const allVisibleSelected = visibleAccounts.length > 0 && 
          visibleAccounts.every(acc => selectedAccounts.has(acc.id));
        
        allCheckbox.checked = allVisibleSelected;
        allCheckbox.indeterminate = !allVisibleSelected && 
          visibleAccounts.some(acc => selectedAccounts.has(acc.id));
      }
    }
  });
  
  console.log('✅ Steam Manager PRO инициализирован!');
});
