const fs = require('fs').promises;
const path = require('path');
const Table = require('cli-table3');

async function getStats() {
  try {
    // Читаем данные
    const data = JSON.parse(await fs.readFile('data.json', 'utf8'));
    
    // Статистика аккаунтов
    const accounts = data.accounts || [];
    const totalAccounts = accounts.length;
    const onlineAccounts = accounts.filter(a => a.status !== 'offline').length;
    const farmingAccounts = accounts.filter(a => a.farming).length;
    const accountsWithDrops = accounts.filter(a => a.hasNewDrop).length;
    
    // Финансовая статистика
    const totalProfit = accounts.reduce((sum, a) => sum + (a.totalProfit || 0), 0);
    const totalDrops = accounts.reduce((sum, a) => sum + (a.totalDrops || 0), 0);
    
    // Инвентарь
    const totalInventory = accounts.reduce((sum, a) => sum + (a.inventory?.length || 0), 0);
    const totalListings = accounts.reduce((sum, a) => sum + (a.marketListings?.length || 0), 0);
    
    // По играм
    const games = {};
    accounts.forEach(account => {
      const game = account.game || 'Не указана';
      games[game] = (games[game] || 0) + 1;
    });
    
    // По странам
    const countries = {};
    accounts.forEach(account => {
      const country = account.country || 'Не указана';
      countries[country] = (countries[country] || 0) + 1;
    });
    
    // Создаем таблицы
    console.log('\n📊 СТАТИСТИКА STEAM MANAGER PRO\n');
    
    // Основная статистика
    const mainTable = new Table({
      head: ['Показатель', 'Значение'],
      colWidths: [30, 20],
      style: { head: ['cyan'] }
    });
    
    mainTable.push(
      ['Всего аккаунтов', totalAccounts],
      ['Онлайн аккаунтов', onlineAccounts],
      ['Фармящих аккаунтов', farmingAccounts],
      ['Аккаунтов с дропами', accountsWithDrops],
      ['Общая прибыль', `$${totalProfit.toFixed(2)}`],
      ['Всего дропов', totalDrops],
      ['Предметов в инвентаре', totalInventory],
      ['Активных продаж', totalListings]
    );
    
    console.log(mainTable.toString());
    
    // Статистика по играм
    if (Object.keys(games).length > 0) {
      console.log('\n🎮 РАСПРЕДЕЛЕНИЕ ПО ИГРАМ\n');
      
      const gamesTable = new Table({
        head: ['Игра', 'Аккаунтов'],
        colWidths: [25, 15],
        style: { head: ['green'] }
      });
      
      Object.entries(games)
        .sort((a, b) => b[1] - a[1])
        .forEach(([game, count]) => {
          gamesTable.push([game, count]);
        });
      
      console.log(gamesTable.toString());
    }
    
    // Статистика по странам
    if (Object.keys(countries).length > 0) {
      console.log('\n🌍 РАСПРЕДЕЛЕНИЕ ПО СТРАНАМ\n');
      
      const countriesTable = new Table({
        head: ['Страна', 'Аккаунтов'],
        colWidths: [25, 15],
        style: { head: ['yellow'] }
      });
      
      Object.entries(countries)
        .sort((a, b) => b[1] - a[1])
        .forEach(([country, count]) => {
          countriesTable.push([country, count]);
        });
      
      console.log(countriesTable.toString());
    }
    
    // Топ аккаунтов по прибыли
    if (accounts.length > 0) {
      console.log('\n🏆 ТОП АККАУНТОВ ПО ПРИБЫЛИ\n');
      
      const topTable = new Table({
        head: ['Аккаунт', 'Прибыль', 'Дропы', 'Статус'],
        colWidths: [20, 15, 10, 15],
        style: { head: ['magenta'] }
      });
      
      accounts
        .sort((a, b) => (b.totalProfit || 0) - (a.totalProfit || 0))
        .slice(0, 10)
        .forEach(account => {
          topTable.push([
            account.name,
            `$${(account.totalProfit || 0).toFixed(2)}`,
            account.totalDrops || 0,
            account.status
          ]);
        });
      
      console.log(topTable.toString());
    }
    
    // Общая информация
    console.log('\nℹ️  ОБЩАЯ ИНФОРМАЦИЯ\n');
    console.log(`📅 Дата: ${new Date().toLocaleString()}`);
    console.log(`📁 Размер базы данных: ${(await fs.stat('data.json')).size / 1024} KB`);
    
    // Проверка бэкапов
    try {
      const backupFiles = await fs.readdir('backups');
      const backups = backupFiles.filter(f => f.startsWith('backup-')).length;
      console.log(`💾 Количество бэкапов: ${backups}`);
    } catch {
      console.log('💾 Бэкапы: не найдены');
    }
    
  } catch (error) {
    console.error('❌ Ошибка получения статистики:', error);
  }
}

// Запуск если вызван напрямую
if (require.main === module) {
  getStats();
}

module.exports = { getStats };
