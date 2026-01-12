const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

async function createBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(__dirname, '../backups');
  const backupFile = path.join(backupDir, `backup-${timestamp}.tar.gz`);
  
  try {
    // Создаем директорию для бэкапов если нет
    await fs.mkdir(backupDir, { recursive: true });
    
    // Архивируем данные
    const filesToBackup = [
      'data.json',
      'backups/',
      'logs/'
    ].join(' ');
    
    await execAsync(`tar -czf ${backupFile} ${filesToBackup}`);
    
    console.log(`✅ Бэкап создан: ${backupFile}`);
    console.log(`📊 Размер: ${(await fs.stat(backupFile)).size / 1024 / 1024} MB`);
    
    // Удаляем старые бэкапы (оставляем последние 10)
    const files = await fs.readdir(backupDir);
    const backups = files.filter(f => f.startsWith('backup-') && f.endsWith('.tar.gz')).sort();
    
    if (backups.length > 10) {
      for (let i = 0; i < backups.length - 10; i++) {
        await fs.unlink(path.join(backupDir, backups[i]));
        console.log(`🗑️ Удален старый бэкап: ${backups[i]}`);
      }
    }
    
    return backupFile;
  } catch (error) {
    console.error('❌ Ошибка создания бэкапа:', error);
    throw error;
  }
}

// Запуск если вызван напрямую
if (require.main === module) {
  createBackup().catch(console.error);
}

module.exports = { createBackup };
