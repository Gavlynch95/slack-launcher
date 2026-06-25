const { app, BrowserWindow, session, ipcMain, shell, net } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execSync } = require('child_process');

// Suppress EPIPE errors from broken console pipes
process.stdout.on('error', (err) => { if (err.code === 'EPIPE') return; });
process.stderr.on('error', (err) => { if (err.code === 'EPIPE') return; });
process.on('uncaughtException', (err) => {
  if (err.code === 'EPIPE' || err.message === 'write EPIPE') return;
  console.error('Uncaught:', err);
});

// Shared sync file path
const SYNC_DIR = path.join(app.getPath('home'), '.slack-launcher');
const SYNC_FILE = path.join(SYNC_DIR, 'jira-sync.json');

const CHROME_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';

const UA_OVERRIDE_SCRIPT = `
  // Spoof navigator.userAgentData
  Object.defineProperty(navigator, 'userAgentData', {
    get: () => ({
      brands: [
        { brand: 'Chromium', version: '136' },
        { brand: 'Google Chrome', version: '136' },
        { brand: 'Not-A.Brand', version: '99' }
      ],
      mobile: false,
      platform: 'macOS',
      getHighEntropyValues: () => Promise.resolve({
        brands: [
          { brand: 'Chromium', version: '136' },
          { brand: 'Google Chrome', version: '136' },
          { brand: 'Not-A.Brand', version: '99' }
        ],
        mobile: false,
        platform: 'macOS',
        platformVersion: '15.0.0',
        architecture: 'arm',
        model: '',
        fullVersionList: [
          { brand: 'Chromium', version: '136.0.0.0' },
          { brand: 'Google Chrome', version: '136.0.0.0' },
          { brand: 'Not-A.Brand', version: '99.0.0.0' }
        ]
      })
    }),
    configurable: true
  });

  // Spoof window.chrome to look like real Chrome
  if (!window.chrome) window.chrome = {};
  window.chrome.runtime = {
    id: undefined,
    connect: function() {},
    sendMessage: function() {},
    onMessage: { addListener: function() {} },
    getManifest: function() { return null; }
  };
  window.chrome.app = {
    isInstalled: false,
    InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
    RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' }
  };
  window.chrome.csi = function() { return {}; };
  window.chrome.loadTimes = function() { return {}; };
`;

let mainWindow;

app.on('ready', () => {
  // Override user-agent for all sessions
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    details.requestHeaders['User-Agent'] = CHROME_UA;
    callback({ requestHeaders: details.requestHeaders });
  });

  // Override for persist: partitions as they're created
  app.on('session-created', (sess) => {
    sess.setUserAgent(CHROME_UA);
    sess.webRequest.onBeforeSendHeaders((details, callback) => {
      details.requestHeaders['User-Agent'] = CHROME_UA;
      callback({ requestHeaders: details.requestHeaders });
    });
  });

  // Inject overrides into every webview as early as possible
  app.on('web-contents-created', (event, contents) => {
    if (contents.getType() === 'webview') {
      // Intercept new window requests and send to renderer for split-screen
      contents.setWindowOpenHandler(({ url }) => {
        mainWindow.webContents.send('open-in-split', url);
        return { action: 'deny' };
      });

      contents.on('dom-ready', () => {
        contents.executeJavaScript(UA_OVERRIDE_SCRIPT).catch(() => {});
      });
    }
  });

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webviewTag: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile('index.html');

  ipcMain.handle('open-external', async (event, url) => {
    console.log('open-external called with:', url);
    await shell.openExternal(url);
  });

  // Open project tracker in default browser (where user's data lives)
  ipcMain.handle('open-tracker', () => {
    const trackerPath = path.join(require('os').homedir(), 'Desktop', 'project-tracker.html');
    shell.openExternal('file://' + trackerPath);
  });

  // Import JIRA cookies from Chrome and verify auth
  ipcMain.handle('jira-open-login', async () => {
    try {
      const imported = await importChromeCookies('jira.tinyspeck.com');
      console.log('JIRA: importChromeCookies returned:', imported);
      if (imported === 0) {
        shell.openExternal('https://jira.tinyspeck.com/secure/Dashboard.jspa');
        return { ok: false, error: 'no_cookies', message: `No JIRA cookies could be imported from Chrome. Log in to JIRA in Chrome, then click Sync again.` };
      }
      // Verify the imported cookies work
      const jiraSession = session.fromPartition('persist:jira');
      const resp = await net.fetch('https://jira.tinyspeck.com/rest/api/2/myself', { session: jiraSession });
      console.log('JIRA: /myself response status:', resp.status);
      if (resp.status === 200) {
        const data = await resp.json();
        mainWindow.webContents.send('jira-auth-success', { user: data.displayName || data.name });
        return { ok: true, user: data.displayName || data.name };
      }
      shell.openExternal('https://jira.tinyspeck.com/secure/Dashboard.jspa');
      return { ok: false, error: 'not_authenticated', message: `Imported ${imported} cookies but session not valid (status ${resp.status}). Log in to JIRA in Chrome, then click Sync again.` };
    } catch (e) {
      console.log('JIRA: Error during login:', e.message, e.stack);
      shell.openExternal('https://jira.tinyspeck.com/secure/Dashboard.jspa');
      return { ok: false, error: e.message, message: 'Error: ' + e.message };
    }
  });

  // Import Chrome cookies for a given domain into persist:jira session
  async function importChromeCookies(domain) {
    // Check both Default and Profile 1
    const profiles = ['Default', 'Profile 1'];
    const chromeBase = path.join(app.getPath('home'), 'Library/Application Support/Google/Chrome');
    let chromeCookiePath = null;

    for (const profile of profiles) {
      const p = path.join(chromeBase, profile, 'Cookies');
      if (fs.existsSync(p)) {
        chromeCookiePath = p;
        break;
      }
    }

    if (!chromeCookiePath) {
      console.log('JIRA: No Chrome cookie file found');
      return 0;
    }

    // Copy the DB to a temp file (Chrome may have it locked)
    const tmpPath = path.join(app.getPath('temp'), 'chrome_cookies_copy');
    fs.copyFileSync(chromeCookiePath, tmpPath);

    const Database = require('better-sqlite3');
    const db = new Database(tmpPath, { readonly: true });

    // Get Chrome's encryption key from macOS Keychain
    let encKey;
    try {
      const rawKey = execSync(
        'security find-generic-password -s "Chrome Safe Storage" -w',
        { encoding: 'utf-8' }
      ).trim();
      encKey = crypto.pbkdf2Sync(rawKey, 'saltysalt', 1003, 16, 'sha1');
    } catch (e) {
      console.log('JIRA: Keychain access failed:', e.message);
      db.close();
      try { fs.unlinkSync(tmpPath); } catch(e2) {}
      throw new Error('Could not access Chrome keychain. Grant access when prompted.');
    }

    // Query cookies for the domain — include parent domain cookies too
    const rows = db.prepare(
      `SELECT name, encrypted_value, host_key, path, is_secure, is_httponly, expires_utc, samesite
       FROM cookies WHERE host_key LIKE ? OR host_key LIKE ?`
    ).all(`%${domain}%`, '%.tinyspeck.com');

    console.log(`JIRA: Found ${rows.length} cookies for ${domain} / .tinyspeck.com`);

    db.close();
    try { fs.unlinkSync(tmpPath); } catch(e) {}

    const jiraSession = session.fromPartition('persist:jira');
    let imported = 0;
    let decryptFailed = 0;

    for (const row of rows) {
      let value = '';
      if (row.encrypted_value && row.encrypted_value.length > 0) {
        const buf = Buffer.from(row.encrypted_value);
        const prefix = buf.slice(0, 3).toString('ascii');
        if (prefix === 'v10') {
          try {
            const iv = Buffer.alloc(16, ' ');
            const decipher = crypto.createDecipheriv('aes-128-cbc', encKey, iv);
            decipher.setAutoPadding(false);
            let decrypted = Buffer.concat([decipher.update(buf.slice(3)), decipher.final()]);
            // Remove PKCS7 padding
            const padLen = decrypted[decrypted.length - 1];
            if (padLen > 0 && padLen <= 16) {
              decrypted = decrypted.slice(0, decrypted.length - padLen);
            }
            value = decrypted.toString('utf-8');
          } catch (e) {
            decryptFailed++;
            continue;
          }
        } else {
          // Unrecognized prefix — skip
          console.log(`JIRA: Unknown cookie prefix for ${row.name}: ${prefix} (hex: ${buf.slice(0,4).toString('hex')})`);
          decryptFailed++;
          continue;
        }
      }

      if (!value) continue;

      // Convert Chrome's expires_utc (microseconds since 1601-01-01) to Unix epoch seconds
      let expirationDate = undefined;
      if (row.expires_utc && row.expires_utc > 0) {
        expirationDate = (row.expires_utc / 1000000) - 11644473600;
      }

      const cookieUrl = `http${row.is_secure ? 's' : ''}://${row.host_key.replace(/^\./, '')}${row.path}`;

      try {
        await jiraSession.cookies.set({
          url: cookieUrl,
          name: row.name,
          value: value,
          domain: row.host_key,
          path: row.path,
          secure: !!row.is_secure,
          httpOnly: !!row.is_httponly,
          expirationDate: expirationDate,
          sameSite: row.samesite === 1 ? 'lax' : row.samesite === 2 ? 'strict' : 'no_restriction'
        });
        imported++;
      } catch (e) {
        console.log(`JIRA: Failed to set cookie ${row.name}:`, e.message);
      }
    }

    console.log(`JIRA: Imported ${imported} cookies, ${decryptFailed} failed to decrypt`);
    return imported;
  }

  // JIRA sync: fetch issue data using the persist:jira session
  ipcMain.handle('jira-fetch-issue', async (event, issueKey) => {
    const jiraSession = session.fromPartition('persist:jira');
    try {
      const resp = await net.fetch(
        `https://jira.tinyspeck.com/rest/api/2/issue/${issueKey}?expand=names`,
        { session: jiraSession }
      );
      if (resp.status === 200) {
        const data = await resp.json();
        return { ok: true, data };
      }
      return { ok: false, status: resp.status };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  // JIRA sync: write sync results to shared file
  ipcMain.handle('jira-write-sync', async (event, syncData) => {
    try {
      if (!fs.existsSync(SYNC_DIR)) fs.mkdirSync(SYNC_DIR, { recursive: true });
      fs.writeFileSync(SYNC_FILE, JSON.stringify(syncData, null, 2));
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  // JIRA sync: read sync file
  ipcMain.handle('jira-read-sync', async () => {
    try {
      if (fs.existsSync(SYNC_FILE)) {
        const data = JSON.parse(fs.readFileSync(SYNC_FILE, 'utf-8'));
        return { ok: true, data };
      }
      return { ok: true, data: {} };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  // JIRA sync: check if session is authenticated
  ipcMain.handle('jira-check-auth', async () => {
    const jiraSession = session.fromPartition('persist:jira');
    try {
      const resp = await net.fetch(
        'https://jira.tinyspeck.com/rest/api/2/myself',
        { session: jiraSession }
      );
      if (resp.status === 200) {
        const data = await resp.json();
        return { authenticated: true, user: data.displayName || data.name };
      }
      return { authenticated: false };
    } catch (e) {
      return { authenticated: false, error: e.message };
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    mainWindow = new BrowserWindow({
      width: 1400,
      height: 900,
      titleBarStyle: 'hiddenInset',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        webviewTag: true,
        preload: path.join(__dirname, 'preload.js')
      }
    });
    mainWindow.loadFile('index.html');
  }
});
