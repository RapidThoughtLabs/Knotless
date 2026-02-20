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
        getByType: (type) => ipcRenderer.invoke('db:getByType', type),
        update: (id, updates) => ipcRenderer.invoke('db:update', id, updates),
        delete: (id) => ipcRenderer.invoke('db:delete', id),
    },

    // Image methods
    images: {
        save: (buffer) => ipcRenderer.invoke('image:save', buffer),
        delete: (filePath) => ipcRenderer.invoke('image:delete', filePath),
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
});

