import { app, BrowserWindow, ipcMain } from 'electron';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
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
  dbService = new DatabaseService();
  settingsService = new SettingsService();

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
