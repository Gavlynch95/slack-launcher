const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');

const chromeUserAgent = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`;

contextBridge.exposeInMainWorld('electronAPI', {
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  onSlackNewWindow: (callback) => ipcRenderer.on('slack-new-window', (_event, url) => callback(url)),
  chromeUserAgent,
  webviewPreloadPath: path.join(__dirname, 'webview-preload.js')
});
