const { app, BrowserWindow, ipcMain, session, shell } = require('electron');
const path = require('path');

const CHROME_VERSION = process.versions.chrome;
const CHROME_MAJOR = CHROME_VERSION.split('.')[0];
const CHROME_UA = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_VERSION} Safari/537.36`;
let mainWindow;

function configureSlackSession(targetSession) {
  targetSession.setUserAgent(CHROME_UA);
  targetSession.webRequest.onBeforeSendHeaders((details, callback) => {
    details.requestHeaders['User-Agent'] = CHROME_UA;
    // Slack uses Client Hints as well as the legacy user agent. Electron's
    // default hints identify it as Electron, which Slack rejects.
    details.requestHeaders['sec-ch-ua'] = `"Google Chrome";v="${CHROME_MAJOR}", "Chromium";v="${CHROME_MAJOR}", "Not.A/Brand";v="24"`;
    details.requestHeaders['sec-ch-ua-mobile'] = '?0';
    details.requestHeaders['sec-ch-ua-platform'] = '"macOS"';
    callback({ requestHeaders: details.requestHeaders });
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1540,
    height: 980,
    minWidth: 1080,
    minHeight: 720,
    title: 'Slack Launcher',
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0b1020',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
  configureSlackSession(session.defaultSession);
  app.on('session-created', configureSlackSession);

  app.on('web-contents-created', (_event, contents) => {
    if (contents.getType() !== 'webview') return;
    contents.setWindowOpenHandler(({ url }) => {
      // Slack opens some links in a new window. Keep the launcher focused and
      // let the renderer decide whether to open the URL in the active pane.
      mainWindow?.webContents.send('slack-new-window', url);
      return { action: 'deny' };
    });
  });

  ipcMain.handle('open-external', (_event, url) => {
    if (!/^https:\/\//i.test(url)) throw new Error('Only HTTPS URLs can be opened externally.');
    return shell.openExternal(url);
  });

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
