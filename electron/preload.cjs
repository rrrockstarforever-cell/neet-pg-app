// Runs in the app window before the page. Exposes a small, fixed set of functions; nothing else from Node.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('native', {
  fetch: (id, url, init) => ipcRenderer.invoke('native:fetch', id, url, init),
  abort: (id) => ipcRenderer.send('native:abort', id),
  savePdf: (html, name) => ipcRenderer.invoke('pdf:save', html, name),
  browser: {
    open: (url) => ipcRenderer.invoke('browser:open', url),
    setBounds: (b) => ipcRenderer.send('browser:bounds', b),
    go: (url) => ipcRenderer.invoke('browser:go', url),
    action: (a) => ipcRenderer.send('browser:action', a),
    block: (on) => ipcRenderer.invoke('browser:block', on),
    capture: () => ipcRenderer.invoke('browser:capture'),
    text: () => ipcRenderer.invoke('browser:text'),
    onState: (cb) => {
      const h = (_e, s) => cb(s);
      ipcRenderer.on('browser:state', h);
      return () => ipcRenderer.removeListener('browser:state', h);
    },
  },
});
