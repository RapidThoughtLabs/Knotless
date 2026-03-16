import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('splashAPI', {
  onLog:   (cb) => ipcRenderer.on('splash:log',   (_, line) => cb(line)),
  onReady: (cb) => ipcRenderer.on('splash:ready', ()        => cb()),
});
