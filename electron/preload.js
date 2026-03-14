const { contextBridge, ipcRenderer } = require('electron');

// Expose platform information and window controls to renderer
contextBridge.exposeInMainWorld('electron', {
    platform: process.platform,
    isMac: process.platform === 'darwin',
    isWindows: process.platform === 'win32',

    // Window control methods
    windowControls: {
        minimize: () => ipcRenderer.invoke('window-minimize'),
        maximize: () => ipcRenderer.invoke('window-maximize'),
        close: () => ipcRenderer.invoke('window-close'),
        isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
    },

    // Listen for window state changes
    onWindowMaximized: (callback) => {
        ipcRenderer.on('window-maximized', (_, isMaximized) => callback(isMaximized));
    },

    // Database methods
    database: {
        create: (tableData) => ipcRenderer.invoke('db:create', tableData),
        getAll: () => ipcRenderer.invoke('db:getAll'),
        getBySheetId: (sheetId) => ipcRenderer.invoke('db:getBySheetId', sheetId),
        update: (id, updates) => ipcRenderer.invoke('db:update', id, updates),
        delete: (id) => ipcRenderer.invoke('db:delete', id),
    },

    // Sheet methods
    sheets: {
        ensureHome: () => ipcRenderer.invoke('sheets:ensureHome'),
        create: (name) => ipcRenderer.invoke('sheets:create', name),
        getAll: () => ipcRenderer.invoke('sheets:getAll'),
        delete: (id) => ipcRenderer.invoke('sheets:delete', id),
        rename: (id, name) => ipcRenderer.invoke('sheets:rename', id, name),
    },

    // Image methods
    images: {
        save: (buffer, mimeType) => ipcRenderer.invoke('image:save', buffer, mimeType),
        delete: (filePath) => ipcRenderer.invoke('image:delete', filePath),
    },

    // File blob methods
    files: {
        save: (buffer, name) => ipcRenderer.invoke('file:save', buffer, name),
        delete: (filePath) => ipcRenderer.invoke('file:delete', filePath),
        readText: (filePath) => ipcRenderer.invoke('file:readText', filePath),
        open: (filePath) => ipcRenderer.invoke('file:open', filePath),
        reveal: (filePath) => ipcRenderer.invoke('file:reveal', filePath),
    },

    // Native file drag-out — hands file to OS, works with Claude, Finder, etc.
    startDrag: (filePath) => ipcRenderer.send('native-drag-start', filePath),

    // Native clipboard — copy file so it can be pasted in Finder / Explorer
    clipboard: {
        copyFile: (filePath) => ipcRenderer.invoke('clipboard:copyFile', filePath),
    },

    // Path utility methods for cross-platform compatibility
    pathUtils: {
        toFileUrl: (filePath) => ipcRenderer.invoke('path-to-file-url', filePath),
    },

    // Settings methods
    settings: {
        get: () => ipcRenderer.invoke('settings:get'),
        update: (dotPath, value) => ipcRenderer.invoke('settings:update', dotPath, value),
        reset: () => ipcRenderer.invoke('settings:reset'),
    },

    // Export / Import methods
    exportImport: {
        saveDialog:  (options)                 => ipcRenderer.invoke('dialog:save',    options),
        openDialog:  (options)                 => ipcRenderer.invoke('dialog:open',    options),
        exportJson:  (sheet, tables, filePath) => ipcRenderer.invoke('export:json',    sheet, tables, filePath),
        exportZip:   (sheet, tables, filePath) => ipcRenderer.invoke('export:zip',     sheet, tables, filePath),
        importSheet: (filePath)                => ipcRenderer.invoke('import:sheet',   filePath),
    },

    // App info (version + OS label)
    getAppInfo: () => ipcRenderer.invoke('app:info'),

    // DB file path (for footer path-copy feature)
    getDbPath: () => ipcRenderer.invoke('app:dbPath'),

    // Open URL in default system browser (cross-platform)
    openExternal: (url) => ipcRenderer.invoke('open-external', url),

    // Media preview window — spawns a separate BrowserWindow for images/GIFs/videos
    media: {
        preview: (filePath, mediaType, theme) =>
            ipcRenderer.invoke('media:preview', filePath, mediaType, theme),
    },

    // Run a shell command in the OS native terminal
    commands: {
        run: (cmd) => ipcRenderer.invoke('command:run', cmd),
    },
});
