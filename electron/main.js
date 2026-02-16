import { app, BrowserWindow, ipcMain } from 'electron';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import DatabaseService from '../src/services/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize database service
let dbService;

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
    windowConfig.trafficLightPosition = { x: 16, y: 14 };
  } else {
    // Windows/Linux: Completely frameless
    windowConfig.frame = false;
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

// Image IPC handlers
ipcMain.handle('image:save', async (_, buffer) => {
  try {
    const imagesDir = path.join(app.getPath('userData'), 'images');
    const timestamp = Date.now();
    const randomId = crypto.randomBytes(2).toString('hex');
    const filename = `img_${timestamp}_${randomId}.png`;
    const filePath = path.join(imagesDir, filename);

    // Write buffer to file
    fs.writeFileSync(filePath, Buffer.from(buffer));

    return filePath;
  } catch (error) {
    console.error('Failed to save image:', error);
    throw error;
  }
});

ipcMain.handle('image:delete', async (_, filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Failed to delete image:', error);
    return false;
  }
});

// App lifecycle
app.whenReady().then(() => {
  // Initialize database service
  dbService = new DatabaseService();

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
