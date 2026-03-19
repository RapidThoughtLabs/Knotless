import pkg from 'electron';
const { app, BrowserWindow, ipcMain, shell, nativeImage, clipboard, dialog } = pkg;
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import os from 'os';
import DatabaseService from '../src/services/database.js';
import SettingsService from '../src/services/settings.js';
import ExportImportService from '../src/services/export-import.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize database service
let dbService;
let settingsService;
let exportImportService;

const isMac = process.platform === 'darwin';
const isWindows = process.platform === 'win32';

let mainWindow;
let splashWindow;

// ── Splash helpers ────────────────────────────────────────────────────────────

/** Send a log line to the splash screen (no-op if splash is gone). */
function splashLog(line) {
  try { splashWindow?.webContents?.send('splash:log', line); } catch { /* closed */ }
}

/** Read theme from settings.json without constructing SettingsService yet. */
function readSplashTheme(userData) {
  try {
    const raw = fs.readFileSync(path.join(userData, 'settings.json'), 'utf-8');
    const s   = JSON.parse(raw);
    return {
      mode:   s?.theme?.mode   || 'light',
      accent: s?.theme?.accent || 'yellow',
    };
  } catch {
    return { mode: 'light', accent: 'yellow' };
  }
}

function createSplash(theme, version, platformLabel) {
  splashWindow = new BrowserWindow({
    width:           480,
    height:          300,
    frame:           false,
    resizable:       false,
    movable:         false,
    alwaysOnTop:     true,
    center:          true,
    show:            false,
    skipTaskbar:     true,
    backgroundColor: theme.mode === 'light' ? '#f0ede8' : '#0a0a0a',
    webPreferences: {
      preload:          path.join(__dirname, 'splash-preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  });

  splashWindow.loadFile(path.join(__dirname, 'splash.html'), {
    query: {
      mode:     theme.mode,
      accent:   theme.accent,
      version,
      platform: platformLabel,
    },
  });

  splashWindow.once('ready-to-show', () => splashWindow.show());
}

function createWindow() {
  // Window configuration based on platform
  const windowConfig = {
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,  // hidden until splash finishes
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

ipcMain.handle('db:getBySheetId', async (_, sheetId) => {
  return await dbService.getTablesBySheetId(sheetId);
});

ipcMain.handle('db:update', async (_, id, updates) => {
  return await dbService.updateTable(id, updates);
});

ipcMain.handle('db:delete', async (_, id) => {
  return await dbService.deleteTable(id);
});

// Sheet IPC handlers
ipcMain.handle('sheets:ensureHome', async () => {
  return await dbService.ensureHomeSheet();
});

ipcMain.handle('sheets:create', async (_, name) => {
  return await dbService.createSheet(name);
});

ipcMain.handle('sheets:getAll', async () => {
  return await dbService.getAllSheets();
});

ipcMain.handle('sheets:delete', async (_, id) => {
  return await dbService.deleteSheet(id);
});

ipcMain.handle('sheets:rename', async (_, id, newName) => {
  return await dbService.renameSheet(id, newName);
});

// Settings IPC handlers
ipcMain.handle('settings:get', async () => {
  return settingsService.get();
});

ipcMain.handle('settings:update', async (_, dotPath, value) => {
  const updated = settingsService.update(dotPath, value);
  if (dotPath === 'general.launchOnStartup') {
    app.setLoginItemSettings({ openAtLogin: !!value });
  }
  return updated;
});

ipcMain.handle('settings:reset', async () => {
  const defaults = settingsService.reset();
  app.setLoginItemSettings({ openAtLogin: false });
  return defaults;
});

// Image IPC handlers
const MIME_TO_EXT = {
  'image/gif':  '.gif',
  'image/png':  '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/bmp':  '.bmp',
  'image/avif': '.avif',
  'image/svg+xml': '.svg',
};

ipcMain.handle('image:save', async (_, buffer, mimeType) => {
  try {
    const imagesDir = path.join(app.getPath('userData'), 'images');

    // Ensure directory exists
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true });
    }

    const ext = MIME_TO_EXT[mimeType] ?? '.png';
    const timestamp = Date.now();
    const randomId = crypto.randomBytes(2).toString('hex');
    const filename = `img_${timestamp}_${randomId}${ext}`;
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

// ── File blob IPC handlers ───────────────────────────────────────────────────

// Save a file blob to userData/files/ — preserves extension, returns metadata
ipcMain.handle('file:save', async (_, buffer, originalName) => {
  try {
    const filesDir = path.join(app.getPath('userData'), 'files');
    if (!fs.existsSync(filesDir)) fs.mkdirSync(filesDir, { recursive: true });

    const ext = path.extname(originalName) || '';
    const timestamp = Date.now();
    const randomId = crypto.randomBytes(2).toString('hex');
    const filename = `file_${timestamp}_${randomId}${ext}`;
    const filePath = path.join(filesDir, filename);

    fs.writeFileSync(filePath, Buffer.from(buffer));
    const size = fs.statSync(filePath).size;

    return {
      path: path.normalize(filePath).replace(/\\/g, '/'),
      originalName,
      size,
    };
  } catch (error) {
    console.error('Failed to save file:', error);
    throw error;
  }
});

// Delete a stored file blob
ipcMain.handle('file:delete', async (_, filePath) => {
  try {
    const normalizedPath = filePath.replace(/\//g, path.sep);
    if (fs.existsSync(normalizedPath)) {
      fs.unlinkSync(normalizedPath);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Failed to delete file:', error);
    return false;
  }
});

// Read text file contents for "copy contents" action
ipcMain.handle('file:readText', async (_, filePath) => {
  try {
    return fs.readFileSync(path.normalize(filePath), 'utf-8');
  } catch (error) {
    console.error('Failed to read file:', error);
    throw error;
  }
});

// Check if a file exists on disk (used by renderer before open/preview)
ipcMain.handle('file:exists', async (_, filePath) => {
  return fs.existsSync(path.normalize(filePath));
});

// Open file with system default application
ipcMain.handle('file:open', async (_, filePath) => {
  return shell.openPath(path.normalize(filePath));
});

// Reveal file in Finder / Explorer
ipcMain.handle('file:reveal', async (_, filePath) => {
  shell.showItemInFolder(path.normalize(filePath));
});

// Native drag-out — hands file to the OS as a native drag (works with Claude, Finder, etc.)
ipcMain.on('native-drag-start', (event, filePath) => {
  event.sender.startDrag({
    file: path.normalize(filePath),
    icon: nativeImage.createEmpty(),
  });
});

// Copy file to native clipboard so it can be pasted into Finder / Explorer / other apps.
//
// IMPORTANT: Each clipboard.write* call CLEARS the clipboard before writing.
// So we must do exactly ONE write per platform — no chaining.
ipcMain.handle('clipboard:copyFile', async (_, filePath) => {
  const normalized = path.normalize(filePath);
  if (!fs.existsSync(normalized)) throw new Error('File not found: ' + normalized);

  if (process.platform === 'darwin') {
    // macOS: NSFilenamesPboardType — a plist containing an array of file paths.
    // This is the format Finder reads when you Cmd+V to paste a file.
    // MUST be the ONLY clipboard write — a second call would erase this.
    const plist = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
      '<plist version="1.0">',
      '<array>',
      `<string>${normalized}</string>`,
      '</array>',
      '</plist>',
    ].join('\n');

    clipboard.writeBuffer('NSFilenamesPboardType', Buffer.from(plist, 'utf-8'));
    console.log('[clipboard:copyFile] macOS — wrote NSFilenamesPboardType for:', normalized);
  } else if (process.platform === 'win32') {
    // Windows: FileNameW — null-terminated UTF-16 LE path
    const buf = Buffer.alloc((normalized.length + 1) * 2);
    buf.write(normalized, 'ucs2');
    clipboard.writeBuffer('FileNameW', buf);
    console.log('[clipboard:copyFile] Windows — wrote FileNameW:', normalized);
  } else {
    // Linux fallback: copy path as text
    clipboard.writeText(normalized);
    console.log('[clipboard:copyFile] Linux — wrote text:', normalized);
  }
});


// ── Media preview window ──────────────────────────────────────────────────────
ipcMain.handle('media:preview', async (_, filePath, mediaType, theme) => {
  const previewWin = new BrowserWindow({
    width:     720,
    height:    560,
    minWidth:  320,
    minHeight: 240,
    ...(isMac
      ? { titleBarStyle: 'hidden', trafficLightPosition: { x: 12, y: 12 } }
      : { frame: false }),
    backgroundColor: theme?.mode === 'light' ? '#f0ede8' : '#0a0a0a',
    webPreferences: {
      preload:          path.join(__dirname, 'media-preview-preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      webSecurity:      false, // allow file:// media loading
    },
  });

  const fileUrl      = pathToFileURL(path.normalize(filePath)).href;
  const templatePath = path.join(__dirname, 'templates', 'media-preview.html');

  // query must be an object — Electron passes it to url.format() internally
  previewWin.loadFile(templatePath, {
    query: {
      file:   fileUrl,
      type:   mediaType,
      mode:   theme?.mode   || 'dark',
      accent: theme?.accent || 'purple',
    },
  });
});

// Close handler invoked from the preview window's preload
ipcMain.handle('media-preview:close', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close();
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

// ── Export / Import IPC handlers ──────────────────────────────────────────────

// Show native Save As dialog → return chosen path or null
ipcMain.handle('dialog:save', async (_, options) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, options);
  return canceled ? null : filePath;
});

// Show native Open File dialog → return chosen path or null
ipcMain.handle('dialog:open', async (_, options) => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, options);
  return (canceled || !filePaths.length) ? null : filePaths[0];
});

// Export sheet as plain JSON
ipcMain.handle('export:json', async (_, sheetDoc, tables, savePath) => {
  const s = settingsService.get();
  const viewerSettings = { controlsPosition: s?.general?.tableControlsPosition ?? 'footer' };
  return await exportImportService.exportSheetAsJson(sheetDoc, tables, savePath, viewerSettings);
});

// Export sheet as ZIP bundle (JSON + blobs + HTML viewer)
ipcMain.handle('export:zip', async (_, sheetDoc, tables, savePath) => {
  const s = settingsService.get();
  const blobCapMB = s?.exportImport?.maxBlobSizeMB ?? 250;
  const viewerSettings = { controlsPosition: s?.general?.tableControlsPosition ?? 'footer' };
  return await exportImportService.exportSheetAsZip(sheetDoc, tables, savePath, blobCapMB, viewerSettings);
});

// Import from .ktl.json or .ktl.zip — auto-detects from extension
ipcMain.handle('import:sheet', async (_, filePath) => {
  return await exportImportService.importSheet(filePath, app.getPath('userData'));
});

// Open external URL in default browser — safe, validates https/http only
ipcMain.handle('open-external', async (_, url) => {
  console.log('[open-external] called with:', url);
  try {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      console.warn('[open-external] Rejected invalid URL:', url);
      return { ok: false, error: 'invalid URL' };
    }
    await shell.openExternal(url);
    console.log('[open-external] success');;
    return { ok: true };
  } catch (err) {
    console.error('[open-external] Failed:', err);
    return { ok: false, error: err.message };
  }
});

// Run a shell command in the OS-native terminal, starting in the user's home dir.
// Users are responsible for cd-ing to the correct location in their command.
ipcMain.handle('command:run', async (_, cmd) => {
  const { exec } = await import('child_process');
  const homeDir = os.homedir();

  try {
    if (process.platform === 'darwin') {
      // macOS — open Terminal.app and run the command
      const escaped = cmd.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const script = `tell application "Terminal"
        activate
        do script "cd ${homeDir.replace(/"/g, '\\"')} && ${escaped}"
      end tell`;
      exec(`osascript -e '${script.replace(/'/g, "'\\''")}'`);
    } else if (process.platform === 'win32') {
      // Windows — open cmd.exe with the command pre-loaded
      const escaped = cmd.replace(/"/g, '\\"');
      exec(`start cmd.exe /K "cd /d %USERPROFILE% && ${escaped}"`);
    } else {
      // Linux — try common terminals in order of preference
      const escaped = cmd.replace(/"/g, '\\"');
      const runCmd = `cd ${homeDir} && ${escaped}`;
      const terminals = [
        `gnome-terminal -- bash -c "${runCmd}; exec bash"`,
        `konsole -e bash -c "${runCmd}; exec bash"`,
        `xfce4-terminal -e "bash -c \\"${runCmd}; exec bash\\""`,
        `xterm -e "bash -c \\"${runCmd}; exec bash\\""`,
      ];
      // Try each terminal until one works
      const tryNext = (i) => {
        if (i >= terminals.length) return;
        exec(terminals[i], (err) => { if (err) tryNext(i + 1); });
      };
      tryNext(0);
    }
    return { ok: true };
  } catch (err) {
    console.error('[command:run] Failed:', err);
    return { ok: false, error: err.message };
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
app.whenReady().then(async () => {
  const userData = app.getPath('userData');

  // ── 1. Read persisted theme BEFORE any services load ─────────────────────
  const splashTheme = readSplashTheme(userData);

  // ── 2. Show splash immediately ────────────────────────────────────────────
  createSplash(splashTheme, app.getVersion(), getOsLabel());

  // Small pause so the splash has time to render before we block the main thread
  await new Promise(r => setTimeout(r, 80));

  // ── 3. Initialize services with live log feedback ─────────────────────────
  splashLog(`platform: ${getOsLabel()}`);

  splashLog('initializing settings...');
  settingsService = new SettingsService(userData);
  const savedSettings = settingsService.get();
  splashLog('initializing settings...  [ok]');

  splashLog(`loading theme: ${splashTheme.mode} / ${splashTheme.accent}  [ok]`);

  // Apply launch-on-startup setting from persisted state
  app.setLoginItemSettings({ openAtLogin: !!savedSettings?.general?.launchOnStartup });

  splashLog('initializing database...');
  dbService = new DatabaseService(userData);
  splashLog('initializing database...  [ok]');

  splashLog('ensuring home sheet...');
  await dbService.ensureHomeSheet();
  splashLog('ensuring home sheet...  [ok]');

  exportImportService = new ExportImportService(__dirname);

  splashLog('preparing file system...');
  const imagesDir = path.join(userData, 'images');
  if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });
  const filesDir = path.join(userData, 'files');
  if (!fs.existsSync(filesDir)) fs.mkdirSync(filesDir, { recursive: true });
  splashLog('preparing file system...  [ok]');

  // ── 4. Create main window hidden, wait for it to load ────────────────────
  splashLog('loading renderer...');
  createWindow();

  mainWindow.webContents.once('did-finish-load', () => {
    splashLog('ready.  [ok]');

    // Signal splash to fade out, then show main window
    setTimeout(() => {
      try { splashWindow?.webContents?.send('splash:ready'); } catch { /* closed */ }
    }, 120);

    setTimeout(() => {
      mainWindow?.show();
      try { splashWindow?.close(); } catch { /* already closed */ }
      splashWindow = null;
    }, 550);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (!isMac) {
    app.quit();
  }
});
