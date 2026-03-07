import pkg from 'electron';
const { app, BrowserWindow, ipcMain, shell } = pkg;
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import os from 'os';
import DatabaseService from '../src/services/database.js';
import SettingsService from '../src/services/settings.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize database service
let dbService;
let settingsService;

const isMac = process.platform === 'darwin';
const isWindows = process.platform === 'win32';

let mainWindow;

function createWindow() {
  // Window configuration based on platform
  const windowConfig = {
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    ...(isWindows && { icon: path.join(__dirname, '../build/icon.ico') }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false, // Allow loading local files via file:// protocol
    },
  };

  // Platform-specific frame settings
  if (isMac) {
    // macOS: Use hidden title bar style to show traffic lights
    windowConfig.titleBarStyle = 'hidden';
    windowConfig.trafficLightPosition = { x: 16, y: 15 };
    windowConfig.backgroundColor = '#0a0a0a'; // V2 dark base
  } else if (isWindows) {
    // Windows: Frameless with custom controls
    windowConfig.frame = false;
    // Add Windows-specific optimizations
    windowConfig.backgroundColor = '#0a0a0a'; // V2 dark base
  } else {
    // Linux: Completely frameless
    windowConfig.frame = false;
    windowConfig.backgroundColor = '#0a0a0a'; // V2 dark base
  }

  mainWindow = new BrowserWindow(windowConfig);

  // Load the app
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173');
    // Open DevTools in development
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Handle window events
  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window-maximized', true);
  });

  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window-maximized', false);
  });
}

// IPC handlers for window controls
ipcMain.handle('window-minimize', () => {
  mainWindow?.minimize();
});

ipcMain.handle('window-maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.handle('window-close', () => {
  mainWindow?.close();
});

ipcMain.handle('window-is-maximized', () => {
  return mainWindow?.isMaximized() || false;
});

// Database IPC handlers
ipcMain.handle('db:create', async (_, tableData) => {
  return await dbService.createTable(tableData);
});

ipcMain.handle('db:getAll', async () => {
  return await dbService.getAllTables();
});

ipcMain.handle('db:getByType', async (_, type) => {
  return await dbService.getTablesByType(type);
});

ipcMain.handle('db:update', async (_, id, updates) => {
  return await dbService.updateTable(id, updates);
});

ipcMain.handle('db:delete', async (_, id) => {
  return await dbService.deleteTable(id);
});

// Settings IPC handlers
ipcMain.handle('settings:get', async () => {
  return settingsService.get();
});

ipcMain.handle('settings:update', async (_, dotPath, value) => {
  return settingsService.update(dotPath, value);
});

ipcMain.handle('settings:reset', async () => {
  return settingsService.reset();
});

// Image IPC handlers
ipcMain.handle('image:save', async (_, buffer) => {
  try {
    const imagesDir = path.join(app.getPath('userData'), 'images');

    // Ensure directory exists
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true });
    }

    const timestamp = Date.now();
    const randomId = crypto.randomBytes(2).toString('hex');
    const filename = `img_${timestamp}_${randomId}.png`;
    const filePath = path.join(imagesDir, filename);

    // Write buffer to file
    fs.writeFileSync(filePath, Buffer.from(buffer));

    // Return normalized path (forward slashes for cross-platform compatibility)
    // Store as absolute path but normalize separators
    return path.normalize(filePath).replace(/\\/g, '/');
  } catch (error) {
    console.error('Failed to save image:', error);
    // Provide more detailed error for Windows
    if (isWindows && error.code === 'EACCES') {
      throw new Error('Permission denied. Please check file permissions.');
    } else if (isWindows && error.code === 'ENOENT') {
      throw new Error('Directory not found. Please check the application data directory.');
    }
    throw error;
  }
});

ipcMain.handle('image:delete', async (_, filePath) => {
  try {
    // Normalize path (handle both forward and backslashes)
    const normalizedPath = filePath.replace(/\//g, path.sep);

    if (fs.existsSync(normalizedPath)) {
      fs.unlinkSync(normalizedPath);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Failed to delete image:', error);
    // Windows-specific error handling
    if (isWindows && error.code === 'EACCES') {
      console.error('Permission denied when deleting image file');
    }
    return false;
  }
});

// ── OS label helper ───────────────────────────────────────────────────────────
// Returns a clean, human-readable OS string for the settings footer.
//   macOS   → "macOS 16 Tahoe"          (version number + marketing name)
//   Windows → "Windows 11 - 22621"      (edition - build number)
//   Linux   → "Ubuntu 22.04"            (reads /etc/os-release PRETTY_NAME)
function getOsLabel() {
  const platform = process.platform;

  if (platform === 'darwin') {
    // os.release() returns Darwin kernel version e.g. "25.4.0"
    // macOS version = Darwin major - 9  (for Darwin >= 20, i.e. macOS 11+)
    // Darwin 18 → 10.14, Darwin 19 → 10.15, Darwin 20 → 11, …, Darwin 25 → 16
    const major = parseInt((os.release() || '0').split('.')[0], 10);
    const macNames = {
      26: 'Tahoe',      // Darwin 26 → macOS 17 (future-proof)
      25: 'Tahoe',      // Darwin 25 → macOS 16 Tahoe
      24: 'Sequoia',    // Darwin 24 → macOS 15 Sequoia
      23: 'Sonoma',     // Darwin 23 → macOS 14 Sonoma
      22: 'Ventura',    // Darwin 22 → macOS 13 Ventura
      21: 'Monterey',   // Darwin 21 → macOS 12 Monterey
      20: 'Big Sur',    // Darwin 20 → macOS 11 Big Sur
      19: 'Catalina',   // Darwin 19 → macOS 10.15 Catalina
      18: 'Mojave',     // Darwin 18 → macOS 10.14 Mojave
    };
    const macVersion = major >= 20 ? (major - 9) : `10.${major - 4}`;
    const name = macNames[major];
    return name ? `macOS ${macVersion} ${name}` : `macOS ${macVersion}`;
  }

  if (platform === 'win32') {
    // os.release() returns "10.0.22621" style kernel version
    const parts = (os.release() || '').split('.');
    const buildNum = parseInt(parts[2] || '0', 10);
    // Windows 11 starts at build 22000
    const winVersion = buildNum >= 22000 ? '11' : '10';
    return `Windows ${winVersion} - ${buildNum}`;
  }

  if (platform === 'linux') {
    try {
      const osRelease = fs.readFileSync('/etc/os-release', 'utf-8');
      const match = osRelease.match(/PRETTY_NAME="?([^"\n]+)"?/);
      if (match) return match[1];
      // Fallback: NAME + VERSION_ID
      const nameMatch = osRelease.match(/^NAME="?([^"\n]+)"?/m);
      const versionMatch = osRelease.match(/^VERSION_ID="?([^"\n]+)"?/m);
      if (nameMatch) {
        return versionMatch ? `${nameMatch[1]} ${versionMatch[1]}` : nameMatch[1];
      }
    } catch { /* /etc/os-release not available */ }
    return `Linux ${os.release()}`;
  }

  // Fallback for any other platform
  return os.version ? os.version() : process.platform;
}

// App info IPC handler
ipcMain.handle('app:info', () => ({
  version: app.getVersion(),
  osVersion: getOsLabel(),
}));

// DB path IPC handler — used by footer path-copy feature
ipcMain.handle('app:dbPath', () => {
  return path.join(app.getPath('userData'), 'tables.db');
});

// Open external URL in default browser — safe, validates https/http only
ipcMain.handle('open-external', async (_, url) => {
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
    await shell.openExternal(url);
  }
});

// IPC handler to convert file path to file:// URL (for cross-platform compatibility)
ipcMain.handle('path-to-file-url', async (_, filePath) => {
  try {
    // Normalize path separators first
    const normalizedPath = path.normalize(filePath);
    // Convert to file:// URL
    const fileUrl = pathToFileURL(normalizedPath).href;
    return fileUrl;
  } catch (error) {
    console.error('Failed to convert path to file URL:', error);
    throw error;
  }
});

// App lifecycle
app.whenReady().then(() => {
  // Initialize database service
  const userData = app.getPath('userData');
  dbService = new DatabaseService(userData);
  settingsService = new SettingsService(userData);

  // Create images directory if it doesn't exist
  const imagesDir = path.join(app.getPath('userData'), 'images');
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (!isMac) {
    app.quit();
  }
});
