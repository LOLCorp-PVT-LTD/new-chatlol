/** Exposes a tiny, safe bridge to the React Native (web) renderer as window.chatlolDesktop. */
const { contextBridge, ipcRenderer } = require('electron');

// sendSync works inside the sandboxed preload (process.argv is not guaranteed there).
const config = ipcRenderer.sendSync('chatlol:config');

contextBridge.exposeInMainWorld('chatlolDesktop', {
  apiUrl: config.apiUrl,
  platform: config.platform,
  notify: (title, body, link) => ipcRenderer.send('chatlol:notify', { title, body, link }),
  setBadge: (count) => ipcRenderer.send('chatlol:badge', count),
  openExternal: (url) => ipcRenderer.send('chatlol:open-external', url),
  setAlwaysOnTop: (on) => ipcRenderer.send('chatlol:always-on-top', on),
  onDeepLink: (cb) => {
    const handler = (_e, route) => cb(route);
    ipcRenderer.on('chatlol:deeplink', handler);
    return () => ipcRenderer.removeListener('chatlol:deeplink', handler);
  },
});
