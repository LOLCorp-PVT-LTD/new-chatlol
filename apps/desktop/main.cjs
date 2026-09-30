/**
 * ChatLOL desktop shell.
 * Hosts the React Native app (exported with react-native-web into ./renderer) and adds native desktop features:
 * tray with unread badge, OS notifications, dock/taskbar badges, chatlol:// deep links, a global shortcut,
 * launch-at-login, window-state persistence and a native menu with keyboard shortcuts.
 */
const { app, BrowserWindow, Menu, Tray, Notification, globalShortcut, ipcMain, nativeImage, net, protocol, shell, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { resolveRendererPath, deepLinkToRoute } = require('./lib/paths.cjs');

const DEV_URL = process.env.CHATLOL_DEV_URL;
const API_URL = process.env.CHATLOL_API_URL || 'https://api.chatlol.app';
const RENDERER = path.join(__dirname, 'renderer');
const STATE_FILE = path.join(app.getPath('userData'), 'window-state.json');
const ICON = path.join(__dirname, 'build', 'icon.png');

let win = null;
let tray = null;
let unread = 0;
let pendingRoute = null;

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);

// ——— Single instance + deep links ———
if (!app.requestSingleInstanceLock()) app.quit();
if (process.defaultApp && process.argv.length >= 2) app.setAsDefaultProtocolClient('chatlol', process.execPath, [path.resolve(process.argv[1])]);
else app.setAsDefaultProtocolClient('chatlol');

function openRoute(route) {
  if (!route) return;
  if (!win) { pendingRoute = route; return; }
  showWindow();
  win.webContents.send('chatlol:deeplink', route);
}
app.on('open-url', (e, url) => { e.preventDefault(); openRoute(deepLinkToRoute(url)); }); // macOS
app.on('second-instance', (_e, argv) => {                                                // Windows / Linux
  const link = argv.find((a) => a.startsWith('chatlol://'));
  if (link) openRoute(deepLinkToRoute(link));
  else showWindow();
});

// ——— Window state ———
function loadState() {
  try {
    const s = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    const visible = screen.getAllDisplays().some((d) => s.x >= d.bounds.x - 50 && s.y >= d.bounds.y - 50 && s.x < d.bounds.x + d.bounds.width && s.y < d.bounds.y + d.bounds.height);
    return visible ? s : { width: s.width, height: s.height };
  } catch { return { width: 1180, height: 820 }; }
}
function saveState() {
  if (!win || win.isMinimized()) return;
  try { fs.writeFileSync(STATE_FILE, JSON.stringify({ ...win.getBounds(), maximized: win.isMaximized() })); } catch { /* ignore */ }
}

function showWindow() {
  if (!win) return createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createWindow() {
  const st = loadState();
  win = new BrowserWindow({
    ...st,
    minWidth: 380,
    minHeight: 600,
    title: 'ChatLOL',
    icon: ICON,
    backgroundColor: '#fff8f5',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 18 },
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  if (st.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());
  win.on('resize', saveState);
  win.on('move', saveState);
  win.on('close', (e) => {
    // Closing hides to tray on macOS/Windows so notifications keep flowing.
    if (!app.isQuitting && process.platform !== 'linux') { e.preventDefault(); win.hide(); }
  });
  win.on('closed', () => { win = null; });

  // External links open in the default browser; in-app navigation stays inside.
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) void shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('app://') && !(DEV_URL && url.startsWith(DEV_URL))) { e.preventDefault(); void shell.openExternal(url); }
  });
  // Camera/mic for Go Live, notifications — everything else denied.
  win.webContents.session.setPermissionRequestHandler((_wc, permission, cb) => cb(['media', 'notifications', 'clipboard-sanitized-write'].includes(permission)));

  void win.loadURL(DEV_URL || 'app://chatlol/');
  win.webContents.once('did-finish-load', () => { if (pendingRoute) { openRoute(pendingRoute); pendingRoute = null; } });
}

// ——— Tray + badge ———
function updateBadge(count) {
  unread = Math.max(0, count | 0);
  if (process.platform === 'darwin' || process.platform === 'linux') app.setBadgeCount(unread);
  if (process.platform === 'win32' && win) {
    win.setOverlayIcon(unread ? nativeImage.createFromDataURL(badgeDataUrl(unread)) : null, unread ? `${unread} unread` : '');
  }
  tray?.setToolTip(unread ? `ChatLOL — ${unread} unread` : 'ChatLOL');
  if (process.platform === 'darwin') tray?.setTitle(unread ? ` ${unread}` : '');
}
function badgeDataUrl(n) {
  const text = n > 99 ? '99+' : String(n);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="16" fill="#ff3366"/><text x="16" y="21" font-size="${text.length > 2 ? 11 : 15}" font-family="Arial" font-weight="bold" fill="#fff" text-anchor="middle">${text}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

function createTray() {
  const img = nativeImage.createFromPath(path.join(__dirname, 'build', 'tray.png')).resize({ width: 18, height: 18 });
  tray = new Tray(img);
  tray.setToolTip('ChatLOL');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open ChatLOL', click: showWindow },
    { type: 'separator' },
    { label: '🌅 Today’s Sunset Drop', click: () => openRoute('/drops') },
    { label: '🎰 Vibe Roulette', click: () => openRoute('/roulette') },
    { label: '💬 Messages', click: () => openRoute('/messages') },
    { type: 'separator' },
    { label: 'Launch at login', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin, click: (i) => app.setLoginItemSettings({ openAtLogin: i.checked }) },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } },
  ]));
  tray.on('click', showWindow);
}

// ——— Menu ———
function createMenu() {
  const go = (route) => () => openRoute(route);
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { label: 'File', submenu: [{ label: 'New Post', accelerator: 'CmdOrCtrl+N', click: go('/compose') }, { type: 'separator' }, process.platform === 'darwin' ? { role: 'close' } : { role: 'quit' }] },
    { role: 'editMenu' },
    {
      label: 'Go',
      submenu: [
        { label: 'Stream', accelerator: 'CmdOrCtrl+1', click: go('/') },
        { label: 'Vibe Roulette', accelerator: 'CmdOrCtrl+2', click: go('/roulette') },
        { label: 'Sunset Drops', accelerator: 'CmdOrCtrl+3', click: go('/drops') },
        { label: 'Hot Take Arena', accelerator: 'CmdOrCtrl+4', click: go('/arena') },
        { label: 'Lounges', accelerator: 'CmdOrCtrl+5', click: go('/lounges') },
        { type: 'separator' },
        { label: 'Messages', accelerator: 'CmdOrCtrl+Shift+M', click: go('/messages') },
        { label: 'Notifications', accelerator: 'CmdOrCtrl+Shift+N', click: go('/notifications') },
        { label: 'Sparks Vault', accelerator: 'CmdOrCtrl+Shift+V', click: go('/vault') },
        { label: 'Settings', accelerator: 'CmdOrCtrl+,', click: go('/settings') },
      ],
    },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ]));
}

// ——— IPC from the renderer (see preload.cjs) ———
ipcMain.on('chatlol:notify', (_e, { title, body, link }) => {
  if (!Notification.isSupported() || (win && win.isFocused())) return;
  const n = new Notification({ title: String(title).slice(0, 120), body: String(body).slice(0, 300), icon: ICON, silent: false });
  n.on('click', () => { showWindow(); if (typeof link === 'string' && link.startsWith('/')) openRoute(link); });
  n.show();
});
ipcMain.on('chatlol:config', (e) => { e.returnValue = { apiUrl: API_URL, platform: process.platform }; });
ipcMain.on('chatlol:badge', (_e, count) => updateBadge(Number(count)));
ipcMain.on('chatlol:open-external', (_e, url) => { if (/^https:\/\//.test(url)) void shell.openExternal(url); });
ipcMain.on('chatlol:always-on-top', (_e, on) => win?.setAlwaysOnTop(!!on, 'floating'));

app.whenReady().then(() => {
  protocol.handle('app', (req) => {
    const file = resolveRendererPath(RENDERER, req.url, (p) => fs.existsSync(p) && fs.statSync(p).isFile());
    return net.fetch(pathToFileURL(file).toString());
  });
  if (process.platform === 'win32') app.setAppUserModelId('app.chatlol.desktop');
  createMenu();
  createWindow();
  createTray();
  // Quick toggle from anywhere.
  globalShortcut.register('CommandOrControl+Shift+L', () => (win && win.isVisible() && win.isFocused() ? win.hide() : showWindow()));
  const link = process.argv.find((a) => a.startsWith('chatlol://'));
  if (link) openRoute(deepLinkToRoute(link));
});

app.on('activate', showWindow);
app.on('before-quit', () => { app.isQuitting = true; });
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => { if (process.platform === 'linux') app.quit(); });
