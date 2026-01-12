const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function listBackups() {
  const backupDir = path.join(__dirname, '../backups');
  const files = await fs.readdir(backupDir);
  return files.filter(f => f.startsWith('backup-') && f.endsWith('.tar.gz')).sort().reverse();
}

async function restoreBackup(backupFile) {
  const backupPath = path.join(__dirname, '../backups', backupFile);
  
  try {
    // Проверяем существование файла
    await fs.access(backupPath);
    
    console.log(`🔄 Восстановление из бэкапа: ${backupFile}`);
    
    // Разархивируем бэкап
    await execAsync(`tar -xzf ${backupPath} -C ../`);
    
    console.log('✅ Бэкап восстановлен успешно');
    console.log('🔄 Перезапустите сервер для применения изменений');
    
  } catch (error) {
    console.error('❌ Ошибка восстановления бэкапа:', error);
    throw error;
  }
}

async function interactiveRestore() {
  try {
    const backups = await listBackups();
    
    if (backups.length === 0) {
      console.log('📭 Бэкапы не найдены');
      return;
    }
    
    console.log('📋 Доступные бэкапы:');
    backups.forEach((backup, index) => {
      console.log(`${index + 1}. ${backup}`);
    });
    
    rl.question('\nВыберите номер бэкапа для восстановления: ', async (answer) => {
      const index = parseInt(answer) - 1;
      
      if (isNaN(index) || index < 0 || index >= backups.length) {
        console.log('❌ Неверный выбор');
        rl.close();
        return;
      }
      
      const selectedBackup = backups[index];
      
      rl.question(`\n⚠️  ВНИМАНИЕ!\nВы собираетесь восстановить бэкап "${selectedBackup}".\nЭто перезапишет текущие данные.\n\nПродолжить? (y/N): `, async (confirm) => {
        if (confirm.toLowerCase() === 'y') {
          await restoreBackup(selectedBackup);
        } else {
          console.log('❌ Восстановление отменено');
        }
        rl.close();
      });
    });
  } catch (error) {
    console.error('❌ Ошибка:', error);
    rl.close();
  }
}

// Запуск если вызван напрямую
if (require.main === module) {
  interactiveRestore();
}

module.exports = { listBackups, restoreBackup };
