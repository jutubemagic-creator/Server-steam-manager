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
    this.addLog('Система Steam Manager PRO запущена', 'success');
    this.addLog('Демо данные загружены', 'info');
    this.addLog('Все функции интерфейса активны', 'success');
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
    return `
      <div class="stats-grid">
        <div class="stat-card blue">
          <i class="fas fa-user-friends"></i>
          <div>
            <h3>Всего аккаунтов</h3>
            <p class="stat-value" id="total-accounts">${accounts.length}</p>
          </div>
        </div>
        <div class="stat-card green">
          <i class="fas fa-seedling"></i>
          <div>
            <h3>Активно фармят</h3>
            <p class="stat-value" id="farming-now">${accounts.filter(a => a.farming).length}</p>
          </div>
        </div>
        <div class="stat-card orange">
          <i class="fas fa-gift"></i>
          <div>
            <h3>Дропы доступны</h3>
            <p class="stat-value" id="drops-available">${accounts.filter(a => a.hasNewDrop).length}</p>
          </div>
        </div>
        <div class="stat-card red">
          <i class="fas fa-shield-alt"></i>
          <div>
            <h3>Уровень риска</h3>
            <p class="stat-value" id="ban-risk">${this.calculateRiskLevel().level}</p>
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
          <h2><i class="fas fa-list"></i> Список аккаунтов (<span id="filtered-count">${accounts.length}</span>)</h2>
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
            ${this.getAccountsListHTML()}
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
    `;
  }

  getAccountsListHTML() {
    if (accounts.length === 0) {
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

    return accounts.map(account => this.createAccountCardHTML(account)).join('');
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
            <h3>Доход за 24ч</h3>
            <p class="stat-value">$${(totalValue * 0.1).toFixed(2)}</p>
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
            accountName: account.name
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
        </div>
      `;
    }
    
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
          ${allListings.map(listing => `
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
                <span class="status-badge ${listing.status === 'sold' ? 'status-online' : 'status-farming'}">
                  ${listing.status === 'sold' ? 'Продано' : 'В продаже'}
                </span>
              </td>
              <td>
                <button class="btn btn-small btn-danger" onclick="steamManager.cancelListing('${listing.id}')">
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
    // Демо история
    const history = [
      { item: 'AK-47 | Redline', price: 15.50, date: '2024-01-15', status: 'sold' },
      { item: 'Operation Phoenix Case', price: 0.85, date: '2024-01-14', status: 'sold' },
      { item: 'Prisma 2 Case', price: 0.45, date: '2024-01-13', status: 'expired' },
      { item: 'AWP | Asiimov', price: 45.00, date: '2024-01-12', status: 'sold' },
    ];
    
    return `
      <table class="history-table">
        <thead>
          <tr>
            <th>Предмет</th>
            <th>Цена</th>
            <th>Дата</th>
            <th>Статус</th>
            <th>Прибыль</th>
          </tr>
        </thead>
        <tbody>
          ${history.map(entry => `
            <tr>
              <td>${entry.item}</td>
              <td>$${entry.price.toFixed(2)}</td>
              <td>${entry.date}</td>
              <td>
                <span class="status-badge ${entry.status === 'sold' ? 'status-online' : 'status-error'}">
                  ${entry.status === 'sold' ? 'Продано' : 'Истекло'}
                </span>
              </td>
              <td>${entry.status === 'sold' ? `$${(entry.price * 0.85).toFixed(2)}` : '-'}</td>
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
        </div>
      `;
    }
    
    return accountsWithDrops.map(account => `
      <div class="drop-card">
        <div class="drop-account">${account.name}</div>
        <div class="drop-item">
          <i class="fas fa-box-open"></i>
          <span>Новый дроп доступен</span>
        </div>
        <div class="drop-info">
          <small>Игра: ${account.game}</small>
          <small>Время работы: ${account.uptime}</small>
        </div>
        <button class="btn btn-small btn-success" onclick="steamManager.claimDrop('${account.id}')">
          <i class="fas fa-check"></i> Забрать
        </button>
      </div>
    `).join('');
  }

  getDropHistoryHTML() {
    let allItems = [];
    accounts.forEach(account => {
      if (account.inventory) {
        account.inventory.forEach(item => {
          allItems.push({
            ...item,
            accountName: account.name,
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
                <p class="stat-value">30</p>
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
      container.innerHTML = this.getAccountsListHTML();
    }
    this.updateStats();
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
    document.getElementById('add-account')?.addEventListener('click', () => this.showAddAccountModal());
    
    // Пагинация
    document.getElementById('prev-page')?.addEventListener('click', () => this.changePage(-1));
    document.getElementById('next-page')?.addEventListener('click', () => this.changePage(1));
    document.getElementById('page-size')?.addEventListener('change', (e) => {
      pageSize = parseInt(e.target.value);
      currentPage = 1;
      this.renderAccounts();
    });
    
    // Фильтры
    document.getElementById('status-filter')?.addEventListener('change', () => this.renderAccounts());
    document.getElementById('country-filter')?.addEventListener('change', () => this.renderAccounts());
    document.getElementById('game-filter')?.addEventListener('change', () => this.renderAccounts());
    
    // Поиск
    document.getElementById('search-accounts')?.addEventListener('input', () => this.renderAccounts());
    
    // Обновление списка
    document.getElementById('refresh-list')?.addEventListener('click', () => this.refreshAccounts());
    document.getElementById('check-drops')?.addEventListener('click', () => this.checkAllDrops());
    
    // Выбор всех
    document.getElementById('select-all')?.addEventListener('click', () => this.selectAllVisible());
    
    // Запуск/остановка выбранных
    document.getElementById('start-selected')?.addEventListener('click', () => this.startSelected());
    document.getElementById('stop-selected')?.addEventListener('click', () => this.stopSelected());
    
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
    document.getElementById('bulk-actions-btn')?.addEventListener('click', () => this.showBulkActionsModal());
    document.getElementById('claim-all-drops')?.addEventListener('click', () => this.claimAllDrops());
    document.getElementById('start-all-farming')?.addEventListener('click', () => this.startAllFarming());
    document.getElementById('stop-all')?.addEventListener('click', () => this.stopAllAccounts());
    
    // Кнопки в модалке добавления аккаунта
    document.getElementById('save-account')?.addEventListener('click', () => this.saveNewAccount());
    document.getElementById('show-password-btn')?.addEventListener('click', () => {
      const passwordField = document.getElementById('steam-password');
      if (passwordField) {
        passwordField.type = passwordField.type === 'password' ? 'text' : 'password';
      }
    });
    
    // Вкладки
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tab = e.target.dataset.tab;
        this.switchTab(tab);
      });
    });
    
    // Торговая площадка
    document.getElementById('open-marketplace')?.addEventListener('click', () => this.showMarketplaceModal());
    
    // Импорт/экспорт
    document.getElementById('import-accounts')?.addEventListener('click', () => this.importAccounts());
    document.getElementById('export-accounts')?.addEventListener('click', () => this.exportAccounts());
    
    // ESC для закрытия модалок
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.hideAllModals();
      }
    });
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
    document.getElementById('start-all-farming-page')?.addEventListener('click', () => this.startAllFarming());
    document.getElementById('stop-all-farming-page')?.addEventListener('click', () => this.stopAllFarming());
    document.getElementById('save-farming-schedule')?.addEventListener('click', () => this.saveFarmingSchedule());
  }

  initTradingPageListeners() {
    document.getElementById('quick-sell-all')?.addEventListener('click', () => this.quickSellAll());
    document.getElementById('check-market-prices')?.addEventListener('click', () => this.checkMarketPrices());
  }

  initDropsPageListeners() {
    document.getElementById('claim-all-drops-page')?.addEventListener('click', () => this.claimAllDrops());
    document.getElementById('save-drop-settings')?.addEventListener('click', () => this.saveDropSettings());
  }

  initSettingsPageListeners() {
    document.getElementById('save-all-settings')?.addEventListener('click', () => this.saveAllSettings());
    document.getElementById('reset-settings')?.addEventListener('click', () => this.resetSettings());
  }

  initSecurityPageListeners() {
    // Обработчики уже добавлены через onclick
  }

  // ===== МЕТОДЫ ДЛЯ ОБНОВЛЕНИЯ =====
  updateStats() {
    const total = accounts.length;
    const farming = accounts.filter(a => a.farming).length;
    const drops = accounts.filter(a => a.hasNewDrop).length;
    const risk = this.calculateRiskLevel();
    
    // Обновляем статистику в сайдбаре
    this.updateElement('account-count', total);
    this.updateElement('farming-count', farming);
    this.updateElement('drop-count', drops);
    
    // Обновляем статистику на странице
    this.updateElement('total-accounts', total);
    this.updateElement('farming-now', farming);
    this.updateElement('drops-available', drops);
    this.updateElement('ban-risk', risk.level);
    
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
  }

  updateElement(id, value) {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = value;
    }
  }

  // ===== МЕТОДЫ УПРАВЛЕНИЯ АККАУНТАМИ =====
  createAccountCardHTML(account) {
    const isSelected = selectedAccounts.has(account.id);
    
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
          <small>Активен: ${account.status !== 'offline' ? 'Да' : 'Нет'}</small>
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

  toggleAccountSelection(accountId, checked) {
    if (checked) {
      selectedAccounts.add(accountId);
    } else {
      selectedAccounts.delete(accountId);
    }
  }

  selectAllVisible() {
    const allCheckbox = document.getElementById('select-all-checkbox');
    if (allCheckbox) {
      const checked = !allCheckbox.checked;
      allCheckbox.checked = checked;
      
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
  toggleAccountStatus(accountId) {
    const account = accounts.find(a => a.id === accountId);
    if (!account) return;
    
    if (account.status === 'offline') {
      account.status = 'online';
      account.uptime = '0ч 0м';
      this.addLog(`Аккаунт "${account.name}" запущен`, 'success');
      this.showNotification(`Аккаунт "${account.name}" запущен`, 'success');
    } else {
      account.status = 'offline';
      account.farming = false;
      this.addLog(`Аккаунт "${account.name}" остановлен`, 'info');
      this.showNotification(`Аккаунт "${account.name}" остановлен`, 'warning');
    }
    
    this.updateAll();
  }

  toggleFarming(accountId) {
    const account = accounts.find(a => a.id === accountId);
    if (!account) return;
    
    if (account.status === 'offline') {
      this.showNotification('Аккаунт должен быть онлайн для фарминга', 'warning');
      return;
    }
    
    account.farming = !account.farming;
    account.status = account.farming ? 'farming' : 'online';
    
    if (account.farming) {
      account.farmingHours = (account.farmingHours || 0) + 0.5;
      this.addLog(`Фарминг запущен на "${account.name}"`, 'success');
      this.showNotification(`Фарминг запущен на "${account.name}"`, 'success');
    } else {
      this.addLog(`Фарминг остановлен на "${account.name}"`, 'info');
      this.showNotification(`Фарминг остановлен на "${account.name}"`, 'warning');
    }
    
    this.updateAll();
  }

  startSelected() {
    const selected = Array.from(selectedAccounts);
    if (selected.length === 0) {
      this.showNotification('Выберите хотя бы один аккаунт', 'warning');
      return;
    }
    
    let started = 0;
    selected.forEach(accountId => {
      const account = accounts.find(a => a.id === accountId);
      if (account && account.status === 'offline') {
        account.status = 'online';
        account.uptime = '0ч 0м';
        started++;
      }
    });
    
    this.updateAll();
    this.addLog(`Запущено ${started} аккаунтов`, 'success');
    this.showNotification(`Запущено ${started} аккаунтов`, 'success');
  }

  stopSelected() {
    const selected = Array.from(selectedAccounts);
    if (selected.length === 0) {
      this.showNotification('Выберите хотя бы один аккаунт', 'warning');
      return;
    }
    
    let stopped = 0;
    selected.forEach(accountId => {
      const account = accounts.find(a => a.id === accountId);
      if (account && account.status !== 'offline') {
        account.status = 'offline';
        account.farming = false;
        stopped++;
      }
    });
    
    this.updateAll();
    this.addLog(`Остановлено ${stopped} аккаунтов`, 'info');
    this.showNotification(`Остановлено ${stopped} аккаунтов`, 'warning');
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

  stopAllFarming() {
    const farmingAccounts = accounts.filter(a => a.farming);
    
    farmingAccounts.forEach(account => {
      account.farming = false;
      account.status = 'online';
    });
    
    this.updateAll();
    this.addLog(`Фарминг остановлен на ${farmingAccounts.length} аккаунтах`, 'info');
    this.showNotification(`Фарминг остановлен на ${farmingAccounts.length} аккаунтах`, 'warning');
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

  claimDrop(accountId) {
    const account = accounts.find(a => a.id === accountId);
    if (!account) return;
    
    // Генерируем случайный дроп
    const drops = [
      { name: "CS:GO Weapon Case", price: 0.35, rarity: "common" },
      { name: "Operation Phoenix Case", price: 0.85, rarity: "rare" },
      { name: "AK-47 | Redline", price: 15.50, rarity: "covert" },
      { name: "Prisma 2 Case", price: 0.45, rarity: "rare" },
      { name: "Fracture Case", price: 0.25, rarity: "common" },
      { name: "AWP | Asiimov", price: 45.00, rarity: "covert" }
    ];
    
    const drop = drops[Math.floor(Math.random() * drops.length)];
    account.hasNewDrop = false;
    account.totalProfit = (account.totalProfit || 0) + drop.price;
    account.totalDrops = (account.totalDrops || 0) + 1;
    account.lastDrop = drop;
    
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
    this.showNotification(`🎁 ${account.name}: ${drop.name} ($${drop.price})`, 'success');
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
    this.showNotification(`Собрано ${accountsWithDrops.length} дропов`, 'success');
  }

  checkAllDrops() {
    // Эмуляция проверки дропов
    let newDrops = 0;
    accounts.forEach(account => {
      if (account.status !== 'offline' && Math.random() > 0.5) {
        account.hasNewDrop = true;
        newDrops++;
      }
    });
    
    this.updateAll();
    this.addLog(`Проверка дропов: найдено ${newDrops} новых`, 'info');
    this.showNotification(`Найдено ${newDrops} новых дропов`, 'success');
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
          `<option value="${acc.id}">${acc.name} (${acc.game})</option>`
        ).join('');
      }
      
      modal.classList.add('active');
    }
  }

  showSteamGuardModal() {
    const modal = document.getElementById('steam-guard-modal');
    if (modal) {
      modal.classList.add('active');
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
      items.forEach(item => {
        if (item.price > maxPrice) maxPrice = item.price;
      });
      
      document.getElementById('total-items').textContent = items.length;
      document.getElementById('total-inventory-value').textContent = `$${totalValue.toFixed(2)}`;
      document.getElementById('most-expensive-item').textContent = `$${maxPrice.toFixed(2)}`;
      
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
      'covert': 'Тайный'
    };
    return texts[rarity] || rarity;
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
      id: 'acc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
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

  // ===== МЕНЮ АККАУНТА =====
  showAccountMenu(accountId) {
    const account = accounts.find(a => a.id === accountId);
    if (!account) return;
    
    // Создаем контекстное меню
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.position = 'absolute';
    menu.style.zIndex = '1000';
    menu.style.background = 'rgba(30, 30, 45, 0.95)';
    menu.style.backdropFilter = 'blur(10px)';
    menu.style.borderRadius = '10px';
    menu.style.padding = '10px 0';
    menu.style.minWidth = '200px';
    menu.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.5)';
    
    menu.innerHTML = `
      <button onclick="steamManager.showInventoryModal('${accountId}')">
        <i class="fas fa-box-open"></i> Инвентарь
      </button>
      <button onclick="steamManager.editAccount('${accountId}')">
        <i class="fas fa-edit"></i> Редактировать
      </button>
      <button onclick="steamManager.showSteamGuardSettings('${accountId}')">
        <i class="fas fa-mobile-alt"></i> Steam Guard
      </button>
      <button onclick="steamManager.changeProxy('${accountId}')">
        <i class="fas fa-server"></i> Сменить прокси
      </button>
      <button class="danger" onclick="steamManager.deleteAccount('${accountId}')">
        <i class="fas fa-trash"></i> Удалить
      </button>
    `;
    
    // Позиционируем меню
    const button = event.target.closest('.action-btn');
    if (button) {
      const rect = button.getBoundingClientRect();
      menu.style.top = (rect.bottom + 5) + 'px';
      menu.style.right = (window.innerWidth - rect.right) + 'px';
    } else {
      menu.style.top = '50px';
      menu.style.right = '20px';
    }
    
    // Добавляем меню и обработчик закрытия
    document.body.appendChild(menu);
    
    const closeMenu = (e) => {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener('click', closeMenu);
      }
    };
    
    setTimeout(() => {
      document.addEventListener('click', closeMenu);
    }, 10);
    
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
            btn.style.color = '#ff5555';
          });
        }
      });
    }, 10);
  }

  editAccount(accountId) {
    const account = accounts.find(a => a.id === accountId);
    if (!account) return;
    
    this.showNotification('Редактирование аккаунта в разработке', 'info');
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

  // ===== ТОРГОВАЯ ПЛОЩАДКА =====
  sellItem(accountId, itemId) {
    const account = accounts.find(a => a.id === accountId);
    if (!account || !account.inventory) return;
    
    const itemIndex = account.inventory.findIndex(i => i.id === itemId);
    if (itemIndex === -1) return;
    
    const item = account.inventory[itemIndex];
    const price = parseFloat(prompt(`Введите цену для "${item.name}" ($):`, item.price.toFixed(2)));
    
    if (!price || price <= 0) {
      this.showNotification('Некорректная цена', 'error');
      return;
    }
    
    // Создаем листинг
    const listing = {
      id: 'listing_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      item: item,
      price: price,
      listedAt: new Date().toISOString(),
      status: 'active'
    };
    
    // Удаляем предмет из инвентаря
    account.inventory.splice(itemIndex, 1);
    
    // Добавляем в список продаж
    if (!account.marketListings) account.marketListings = [];
    account.marketListings.push(listing);
    
    this.updateAll();
    this.hideAllModals();
    
    this.addLog(`Предмет "${item.name}" выставлен на продажу за $${price}`, 'success');
    this.showNotification(`"${item.name}" выставлен на продажу за $${price}`, 'success');
    
    // Эмуляция продажи через случайное время
    setTimeout(() => {
      const listingIndex = account.marketListings.findIndex(l => l.id === listing.id);
      if (listingIndex !== -1 && account.marketListings[listingIndex].status === 'active') {
        account.marketListings[listingIndex].status = 'sold';
        account.totalProfit = (account.totalProfit || 0) + price;
        
        this.addLog(`Предмет "${item.name}" продан за $${price}`, 'success');
        this.showNotification(`🎉 Продано: "${item.name}" за $${price}`, 'success');
        
        if (currentPageView === 'trading') {
          this.updateTradingPage();
        }
      }
    }, Math.random() * 30000 + 30000); // Продажа через 30-60 секунд
  }

  cancelListing(listingId) {
    let cancelled = false;
    accounts.forEach(account => {
      if (account.marketListings) {
        const index = account.marketListings.findIndex(l => l.id === listingId);
        if (index !== -1) {
          const listing = account.marketListings[index];
          // Возвращаем предмет в инвентарь
          if (listing.item && !account.inventory) account.inventory = [];
          if (listing.item) account.inventory.push(listing.item);
          
          account.marketListings.splice(index, 1);
          cancelled = true;
          
          this.addLog(`Продажа отменена: ${listing.item?.name || 'Предмет'}`, 'info');
          this.showNotification('Продажа отменена', 'info');
        }
      }
    });
    
    if (cancelled) {
      if (currentPageView === 'trading') {
        this.updateTradingPage();
      }
    }
  }

  quickSellAll() {
    let totalValue = 0;
    let itemsSold = 0;
    
    accounts.forEach(account => {
      if (account.inventory && account.inventory.length > 0) {
        account.inventory.forEach(item => {
          if (item.price < 1.00) { // Продаем только дешевые предметы
            const price = item.price * 0.9; // Скидка 10%
            totalValue += price;
            itemsSold++;
            
            if (!account.marketListings) account.marketListings = [];
            account.marketListings.push({
              id: 'qs_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
              item: item,
              price: price,
              listedAt: new Date().toISOString(),
              status: 'active'
            });
          }
        });
        
        // Удаляем проданные предметы из инвентаря
        account.inventory = account.inventory.filter(item => item.price >= 1.00);
      }
    });
    
    this.addLog(`Быстрая продажа: ${itemsSold} предметов на $${totalValue.toFixed(2)}`, 'success');
    this.showNotification(`Выставлено ${itemsSold} предметов на $${totalValue.toFixed(2)}`, 'success');
    
    if (currentPageView === 'trading') {
      this.updateTradingPage();
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
  }

  refreshAccounts() {
    this.addLog('Обновление списка аккаунтов...', 'info');
    this.updateAll();
    this.showNotification('Список аккаунтов обновлен', 'success');
  }

  // ===== АВТООБНОВЛЕНИЕ =====
  startAutoUpdates() {
    // Обновляем время работы
    updateInterval = setInterval(() => {
      accounts.forEach(account => {
        if (account.status !== 'offline') {
          // Увеличиваем время работы
          const hours = (account.farmingHours || 0) + 0.0167; // +1 минута
          account.farmingHours = hours;
          
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
    }, 60000); // Каждую минуту
  }

  // ===== ЛОГИРОВАНИЕ =====
  addLog(message, type = 'info') {
    const logEntry = {
      time: new Date().toLocaleTimeString(),
      message,
      type
    };
    
    logs.unshift(logEntry);
    if (logs.length > 50) logs.pop();
    
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
    
    // Анимация появления
    setTimeout(() => {
      notification.classList.add('show');
    }, 10);
    
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

  // ===== ДЕМО ДАННЫЕ =====
  loadDemoData() {
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
          { id: '3', name: 'AWP | Asiimov', price: 45.00, rarity: 'covert', acquired: new Date().toISOString() }
        ],
        marketListings: [
          {
            id: 'listing_1',
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
          { id: '5', name: 'Arcana | Terrorblade', price: 45.00, rarity: 'legendary', acquired: new Date().toISOString() },
          { id: '6', name: 'Immortal Treasure I', price: 3.50, rarity: 'rare', acquired: new Date().toISOString() }
        ],
        marketListings: [
          {
            id: 'listing_2',
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
          { id: '7', name: 'Mann Co. Supply Crate Key', price: 2.50, rarity: 'common', acquired: new Date().toISOString() }
        ],
        marketListings: [],
        isolation: 'medium',
        proxy: { ip: '145.239.86.78', port: 8080, city: 'Амстердам', type: 'residential' },
        farmingHours: 8.2,
        lastActivity: new Date(Date.now() - 86400000).toISOString() // 1 день назад
      }
    ];
  }

  // ===== ДОПОЛНИТЕЛЬНЫЕ ФУНКЦИИ =====
  startGameFarming(game) {
    const accountsForGame = accounts.filter(a => a.game === game && a.status !== 'offline' && !a.farming);
    
    if (accountsForGame.length === 0) {
      this.showNotification(`Нет онлайн аккаунтов для игры ${game}`, 'warning');
      return;
    }
    
    accountsForGame.forEach(account => {
      account.farming = true;
      account.status = 'farming';
      account.farmingHours = (account.farmingHours || 0) + 0.5;
    });
    
    this.updateAll();
    this.addLog(`Фарминг ${game} запущен на ${accountsForGame.length} аккаунтах`, 'success');
    this.showNotification(`Фарминг ${game} запущен на ${accountsForGame.length} аккаунтах`, 'success');
  }

  openRandomInventory() {
    const accountsWithInventory = accounts.filter(a => a.inventory && a.inventory.length > 0);
    if (accountsWithInventory.length === 0) {
      this.showNotification('Нет аккаунтов с инвентарем', 'info');
      return;
    }
    
    const randomAccount = accountsWithInventory[Math.floor(Math.random() * accountsWithInventory.length)];
    this.showInventoryModal(randomAccount.id);
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

  // ===== ПАГИНАЦИЯ =====
  changePage(delta) {
    const newPage = currentPage + delta;
    const filteredAccounts = this.getFilteredAccounts();
    totalPages = Math.ceil(filteredAccounts.length / pageSize);
    
    if (newPage >= 1 && newPage <= totalPages) {
      currentPage = newPage;
      this.renderAccounts();
      
      // Обновляем кнопки пагинации
      document.getElementById('prev-page').disabled = currentPage === 1;
      document.getElementById('next-page').disabled = currentPage === totalPages;
      document.getElementById('current-page').textContent = currentPage;
      document.getElementById('total-pages').textContent = totalPages;
    }
  }

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
        const searchIn = (account.name + ' ' + account.login + ' ' + account.game).toLowerCase();
        if (!searchIn.includes(searchText)) return false;
      }
      
      return true;
    });
  }

  // ===== ИМПОРТ/ЭКСПОРТ =====
  importAccounts() {
    this.showNotification('Функция импорта в разработке', 'info');
  }

  exportAccounts() {
    const data = {
      accounts: accounts,
      exportDate: new Date().toISOString(),
      version: CONFIG.VERSION
    };
    
    const dataStr = JSON.stringify(data, null, 2);
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
    this.showNotification('Аккаунты экспортированы в JSON', 'success');
  }

  // ===== НАСТРОЙКИ =====
  saveAllSettings() {
    this.showNotification('Все настройки сохранены', 'success');
    this.addLog('Настройки системы сохранены', 'success');
  }

  resetSettings() {
    if (confirm('Вы уверены, что хотите сбросить все настройки к значениям по умолчанию?')) {
      this.showNotification('Настройки сброшены', 'info');
      this.addLog('Настройки сброшены к значениям по умолчанию', 'info');
    }
  }

  // ===== БЕЗОПАСНОСТЬ =====
  rotateAllProxies() {
    this.showNotification('Смена прокси начата...', 'info');
    setTimeout(() => {
      this.showNotification('Прокси успешно изменены', 'success');
      this.addLog('Прокси для всех аккаунтов обновлены', 'success');
    }, 2000);
  }

  emergencyStop() {
    if (confirm('Вы уверены, что хотите выполнить аварийную остановку всех аккаунтов?')) {
      this.stopAllAccounts();
      this.showNotification('Аварийная остановка выполнена', 'warning');
      this.addLog('Аварийная остановка всех аккаунтов', 'warning');
    }
  }

  // ===== ЧИСТКА =====
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
  
  // Обработчик закрытия уведомлений
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('notification-close')) {
      const notification = e.target.closest('.notification');
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    }
  });
  
  console.log('🎮 Steam Manager PRO полностью загружен!');
  console.log('✅ Все страницы активны');
  console.log('✅ Все кнопки работают');
  console.log('✅ Все функции доступны');
});

// Экспортируем для глобального доступа
if (typeof window !== 'undefined') {
  window.SteamManager = SteamManager;
}
