const { contextBridge, ipcRenderer } = require('electron');

// Minimal preload for the media preview window.
// Exposes only what the template needs: platform, GIF clipboard, and close.
contextBridge.exposeInMainWorld('preview', {
    platform: process.platform,

    // Copy file to native clipboard (used for GIFs to preserve animation)
    copyFile: (filePath) => ipcRenderer.invoke('clipboard:copyFile', filePath),

    // Close this window
    close: () => ipcRenderer.invoke('media-preview:close'),
});
