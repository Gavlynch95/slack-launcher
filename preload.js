const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  onSlackNewWindow: (callback) => ipcRenderer.on('slack-new-window', (_event, url) => callback(url))
});
