const { app, BrowserWindow, session, ipcMain, Menu, nativeTheme } = require('electron');
const path = require('path');
const { readChromeCookies, getChromeProfilePath } = require('./cookie-import');

let mainWindow;

const DOMAIN_MAP = {
  chatgpt: ['chatgpt.com', 'openai.com'],
  claude:  ['claude.ai', 'anthropic.com'],
  gemini:  ['google.com', 'googleapis.com', 'youtube.com']
};

function createWindow() {
  const isDark = nativeTheme.shouldUseDarkColors;

  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    webPreferences: {
      webviewTag: true,
      nodeIntegration: true,
      contextIsolation: false
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: isDark ? '#0d1117' : '#ffffff'
  });

  mainWindow.loadFile('index.html');
  mainWindow.maximize();

  // Update background on theme change
  nativeTheme.on('updated', () => {
    const bg = nativeTheme.shouldUseDarkColors ? '#0d1117' : '#ffffff';
    mainWindow.setBackgroundColor(bg);
  });
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Chat', accelerator: 'CmdOrCtrl+N', click: () => mainWindow?.webContents.send('new-chat') },
        { label: 'New Tab', accelerator: 'CmdOrCtrl+T', click: () => mainWindow?.webContents.send('new-tab') },
        { label: 'Close Tab', accelerator: 'CmdOrCtrl+W', click: () => mainWindow?.webContents.send('close-tab') },
        { type: 'separator' },
        ...(isMac ? [{ role: 'close' }] : [{ role: 'quit' }])
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }
      ]
    },
    {
      label: 'Tab',
      submenu: [
        { label: 'Next Tab', accelerator: 'CmdOrCtrl+Shift+]', click: () => mainWindow?.webContents.send('next-tab') },
        { label: 'Previous Tab', accelerator: 'CmdOrCtrl+Shift+[', click: () => mainWindow?.webContents.send('prev-tab') },
        { type: 'separator' },
        ...[1,2,3,4,5,6,7,8,9].map(n => ({
          label: `Tab ${n}`, accelerator: `CmdOrCtrl+${n}`,
          click: () => mainWindow?.webContents.send('goto-tab', n - 1)
        }))
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' }, { role: 'togglefullscreen' },
        { type: 'separator' }, { role: 'toggleDevTools' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' }, { role: 'zoom' },
        ...(isMac ? [{ type: 'separator' }, { role: 'front' }] : [])
      ]
    },
    {
      label: 'Tools',
      submenu: [
        { label: 'Command Palette', accelerator: 'CmdOrCtrl+K', click: () => mainWindow?.webContents.send('toggle-command-palette') },
        { label: 'Command Palette (Alt)', accelerator: 'CmdOrCtrl+P', visible: false, click: () => mainWindow?.webContents.send('toggle-command-palette') },
        { type: 'separator' },
        { label: 'Toggle ChatGPT', accelerator: 'Ctrl+Alt+1', click: () => mainWindow?.webContents.send('toggle-platform', 'chatgpt') },
        { label: 'Toggle Claude', accelerator: 'Ctrl+Alt+2', click: () => mainWindow?.webContents.send('toggle-platform', 'claude') },
        { label: 'Toggle Gemini', accelerator: 'Ctrl+Alt+3', click: () => mainWindow?.webContents.send('toggle-platform', 'gemini') },
        { type: 'separator' },
        { label: 'Reload All Panels', accelerator: 'CmdOrCtrl+Shift+R', click: () => mainWindow?.webContents.send('reload-all') },
        { label: 'Focus Input', accelerator: 'CmdOrCtrl+L', click: () => mainWindow?.webContents.send('focus-input') },
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── Deep link protocol ──
app.setAsDefaultProtocolClient('llmux');

let pendingDeepLinkQuery = null;

app.on('open-url', (event, url) => {
  event.preventDefault();
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'query' || parsed.pathname === '//query' || parsed.pathname === '/query') {
      const text = parsed.searchParams.get('text');
      if (text && mainWindow) {
        mainWindow.show();
        mainWindow.focus();
        mainWindow.webContents.send('deep-link-query', text);
      } else if (text) {
        pendingDeepLinkQuery = text;
      }
    }
  } catch {}
});

app.whenReady().then(() => {
  const chromeUA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

  const partitions = ['persist:chatgpt', 'persist:claude', 'persist:gemini'];
  for (const part of partitions) {
    const ses = session.fromPartition(part);
    ses.setUserAgent(chromeUA);
    ses.webRequest.onHeadersReceived((details, callback) => {
      const headers = { ...details.responseHeaders };
      delete headers['x-frame-options'];
      delete headers['X-Frame-Options'];
      callback({ responseHeaders: headers });
    });
  }

  // Intercept Ctrl+Tab / Ctrl+Shift+Tab on ALL webContents (including webviews)
  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(() => ({ action: 'allow' }));

    contents.on('before-input-event', (event, input) => {
      const cmdOrCtrl = process.platform === 'darwin' ? input.meta : input.control;

      if (input.control && input.key === 'Tab') {
        event.preventDefault();
        mainWindow?.webContents.send(input.shift ? 'prev-tab' : 'next-tab');
      }

      // Intercept palette/tool shortcuts before webviews can hijack them
      if (cmdOrCtrl && input.key === 'k') {
        event.preventDefault();
        mainWindow?.webContents.send('toggle-command-palette');
      }
      if (cmdOrCtrl && input.key === 'l') {
        event.preventDefault();
        mainWindow?.webContents.send('focus-input');
      }
      if (cmdOrCtrl && input.shift && input.key === 'r') {
        event.preventDefault();
        mainWindow?.webContents.send('reload-all');
      }
      // Ctrl+Option+1/2/3 for platform toggles
      if (input.control && input.alt && input.key === '1') {
        event.preventDefault();
        mainWindow?.webContents.send('toggle-platform', 'chatgpt');
      }
      if (input.control && input.alt && input.key === '2') {
        event.preventDefault();
        mainWindow?.webContents.send('toggle-platform', 'claude');
      }
      if (input.control && input.alt && input.key === '3') {
        event.preventDefault();
        mainWindow?.webContents.send('toggle-platform', 'gemini');
      }
    });
  });

  // ── IPC: Cookie import ──
  ipcMain.handle('import-cookies', async (_event, platform) => {
    try {
      const domains = DOMAIN_MAP[platform];
      if (!domains) return { success: false, error: `Unknown platform: ${platform}` };
      const { cookies, profileName } = readChromeCookies(domains);
      const ses = session.fromPartition(`persist:${platform}`);
      let imported = 0, failed = 0;
      for (const cookie of cookies) {
        try { await ses.cookies.set(cookie); imported++; } catch { failed++; }
      }
      return { success: true, imported, failed, total: cookies.length, profileName };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('import-all-cookies', async () => {
    const results = {};
    for (const platform of Object.keys(DOMAIN_MAP)) {
      try {
        const domains = DOMAIN_MAP[platform];
        const { cookies, profileName } = readChromeCookies(domains);
        const ses = session.fromPartition(`persist:${platform}`);
        let imported = 0, failed = 0;
        for (const cookie of cookies) {
          try { await ses.cookies.set(cookie); imported++; } catch { failed++; }
        }
        results[platform] = { success: true, imported, failed, total: cookies.length, profileName };
      } catch (err) {
        results[platform] = { success: false, error: err.message };
      }
    }
    return results;
  });

  ipcMain.handle('get-chrome-profile', async () => {
    try {
      const { profileName } = getChromeProfilePath();
      return { success: true, profileName };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  buildMenu();
  createWindow();

  // Send any pending deep link query once the window is ready
  mainWindow.webContents.on('did-finish-load', () => {
    if (pendingDeepLinkQuery) {
      mainWindow.webContents.send('deep-link-query', pendingDeepLinkQuery);
      pendingDeepLinkQuery = null;
    }
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
