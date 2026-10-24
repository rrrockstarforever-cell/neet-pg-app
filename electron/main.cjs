// Desktop shell. Serves the built UI from a private app:// scheme, runs the local login/web-research
// service in-process (same code as the dev server), proxies provider requests (no browser CORS limits),
// and hosts the isolated browser used to capture mock-test questions.
const { app, BrowserWindow, WebContentsView, protocol, net, shell, Menu, ipcMain, session, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

// New Stitch/React build; falls back to the legacy bundle if it has not been built.
const NEW_DIST = path.join(__dirname, '..', 'dist-new');
const DIST = fs.existsSync(path.join(NEW_DIST, 'index.html')) && !process.env.NEET_LEGACY_UI ? NEW_DIST : path.join(__dirname, '..', 'dist');
const DEV_URL = process.env.NEET_DEV_URL; // e.g. http://localhost:5173 for live-reload dev

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

let win = null;
let view = null; // the isolated browser
let apiMod = null;
const api = () => (apiMod ??= import(pathToFileURL(path.join(__dirname, '..', 'server', 'api.mjs')).href));

const fromMain = (e) => win && !win.isDestroyed() && e.sender === win.webContents;
const isHttp = (u) => /^https?:\/\//i.test(String(u));

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 900, minHeight: 600,
    title: 'NEET PG Prep', icon: path.join(__dirname, '..', 'build', 'icon.png'), backgroundColor: '#f6f7f9',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(__dirname, 'preload.cjs') },
  });
  // Links in the app open in the system browser, never inside the app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isHttp(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('app://') && !(DEV_URL && url.startsWith(DEV_URL))) {
      e.preventDefault();
      if (isHttp(url)) shell.openExternal(url);
    }
  });
  win.on('closed', () => { win = null; view = null; });
  win.loadURL(DEV_URL || 'app://neetpg/index.html');
  if (process.env.NEET_SMOKE) smoke();
}

// ---------- app:// protocol: static files + /api ----------
function registerProtocol() {
  protocol.handle('app', async (req) => {
    const u = new URL(req.url);
    if (u.pathname.startsWith('/api/')) {
      if (req.headers.get('sec-fetch-site') === 'cross-site') return new Response('Forbidden', { status: 403 });
      let body = {};
      if (req.method === 'POST') { try { body = await req.json(); } catch { body = {}; } }
      const out = await (await api()).route(u.pathname.slice(4), req.method, body, u.searchParams);
      return new Response(JSON.stringify(out.json), { status: out.code, headers: { 'Content-Type': 'application/json' } });
    }
    const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.normalize(path.join(DIST, rel));
    if (!file.startsWith(DIST)) return new Response('Forbidden', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
}

// ---------- provider requests from the app (bypasses browser CORS) ----------
const inflight = new Map();
ipcMain.handle('native:fetch', async (e, id, url, init = {}) => {
  if (!fromMain(e) || !isHttp(url)) throw new Error('Blocked request.');
  const ac = new AbortController();
  inflight.set(id, ac);
  try {
    const r = await net.fetch(url, { method: init.method || 'GET', headers: init.headers, body: init.body, signal: ac.signal });
    return { status: r.status, statusText: r.statusText, headers: [...r.headers.entries()], body: await r.arrayBuffer() };
  } finally {
    inflight.delete(id);
  }
});
ipcMain.on('native:abort', (e, id) => { if (fromMain(e)) inflight.get(id)?.abort(); });

// ---------- notes -> real PDF file (selectable text, A4) ----------
async function htmlToPdf(html) {
  const tmp = path.join(app.getPath('temp'), `neet-notes-${Date.now()}.html`);
  fs.writeFileSync(tmp, html);
  const w = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } });
  try {
    await w.loadFile(tmp);
    return await w.webContents.printToPDF({ pageSize: 'A4', printBackground: true, preferCSSPageSize: true });
  } finally {
    w.destroy();
    fs.rmSync(tmp, { force: true });
  }
}
ipcMain.handle('pdf:save', async (e, html, name) => {
  if (!fromMain(e) || typeof html !== 'string') throw new Error('Blocked.');
  const base = String(name || 'notes').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
  const r = await dialog.showSaveDialog(win, { defaultPath: `${base}.pdf`, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
  if (r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, await htmlToPdf(html));
  return r.filePath;
});
module.exports.htmlToPdf = htmlToPdf;

// ---------- isolated browser for capturing questions ----------
const blocklist = require('./blocklist.cjs');
let blockOn = true; // on by default; the Browser screen can switch it off
ipcMain.handle('browser:block', (e, on) => {
  if (!fromMain(e)) return null;
  if (typeof on === 'boolean') blockOn = on;
  blocklist.refresh();
  return { on: blockOn, ...blocklist.status() };
});
function pushState() {
  if (!view || !win) return;
  const wc = view.webContents;
  win.webContents.send('browser:state', { url: wc.getURL(), title: wc.getTitle(), canBack: wc.navigationHistory.canGoBack(), canForward: wc.navigationHistory.canGoForward(), loading: wc.isLoading() });
}
function ensureView() {
  if (view) return view;
  const ses = session.fromPartition('persist:browser'); // separate cookies/storage; the app's own data is never visible to pages
  ses.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  // Sites on the user's Focuser list are refused (page loads and anything a page pulls in), unless switched off.
  ses.webRequest.onBeforeRequest((d, cb) => {
    if (!blockOn || !/^https?:/i.test(d.url) || !blocklist.isBlocked(d.url)) return cb({});
    if (d.resourceType === 'mainFrame' && view) setImmediate(() => view && view.webContents.loadURL(blocklist.blockPage(d.url)));
    cb({ cancel: true });
  });
  view = new WebContentsView({ webPreferences: { session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false } });
  const wc = view.webContents;
  wc.setWindowOpenHandler(({ url }) => { if (isHttp(url)) wc.loadURL(url); return { action: 'deny' }; });
  wc.on('will-navigate', (e, url) => { if (!isHttp(url)) e.preventDefault(); });
  for (const ev of ['did-navigate', 'did-navigate-in-page', 'page-title-updated', 'did-start-loading', 'did-stop-loading']) wc.on(ev, pushState);
  win.contentView.addChildView(view);
  view.setVisible(false);
  return view;
}
ipcMain.handle('browser:open', (e, url) => {
  if (!fromMain(e)) return;
  const v = ensureView();
  v.setVisible(true);
  if (!v.webContents.getURL()) v.webContents.loadURL(isHttp(url) ? url : 'https://duckduckgo.com/');
  pushState();
});
ipcMain.on('browser:bounds', (e, b) => {
  if (!fromMain(e) || !view) return;
  if (!b) return view.setVisible(false);
  view.setBounds({ x: Math.round(b.x), y: Math.round(b.y), width: Math.max(1, Math.round(b.width)), height: Math.max(1, Math.round(b.height)) });
  view.setVisible(true);
});
ipcMain.handle('browser:go', (e, url) => { if (fromMain(e) && view && isHttp(url)) return view.webContents.loadURL(url); });
ipcMain.on('browser:action', (e, a) => {
  if (!fromMain(e) || !view) return;
  const wc = view.webContents;
  if (a === 'back') wc.navigationHistory.goBack();
  else if (a === 'forward') wc.navigationHistory.goForward();
  else if (a === 'reload') wc.reload();
  else if (a === 'stop') wc.stop();
});
ipcMain.handle('browser:capture', async (e) => {
  if (!fromMain(e) || !view) throw new Error('Browser is not open.');
  const b = view.getBounds();
  if (b.width < 2 || b.height < 2) throw new Error('The browser area has no size yet.');
  const png = (await view.webContents.capturePage()).toPNG();
  if (!png.length) throw new Error('The page produced an empty screenshot.');
  return png.toString('base64');
});
ipcMain.handle('browser:text', async (e) => {
  if (!fromMain(e) || !view) throw new Error('Browser is not open.');
  const wc = view.webContents;
  return { title: wc.getTitle(), url: wc.getURL(), text: await wc.executeJavaScript('document.body ? document.body.innerText : ""') };
});

// ---------- self-test used to verify packaged builds: NEET_SMOKE=/path/result.json ----------
function smoke() {
  const out = process.env.NEET_SMOKE;
  win.webContents.once('did-finish-load', () => setTimeout(async () => {
    const res = {};
    try {
      res.url = win.webContents.getURL();
      res.checks = await win.webContents.executeJavaScript(`(async () => {
        const r = {};
        r.nativeBridge = !!window.native;
        r.oauthStatus = await (await fetch('/api/oauth/status')).json();
        r.providerViaNative = (await window.native.fetch('s1', 'https://api.openai.com/v1/models', {})).status; // 401 without a key = reachable, no CORS problem
        r.webResearch = await fetch('/api/web/research', { method: 'POST', body: JSON.stringify({ query: 'cerebellar ataxia' }) }).then(async x => { const j = await x.json(); return j.sources ? j.sources.length + ' sources' : j.error; });
        r.title = document.title; r.text = document.body.innerText.slice(0, 120);
        return r;
      })()`);
      await win.webContents.executeJavaScript(`window.native.browser.open('https://example.com/')`);
      await win.webContents.executeJavaScript(`window.native.browser.setBounds({ x: 240, y: 60, width: 900, height: 600 })`);
      await new Promise((r) => setTimeout(r, 4000));
      const t = await win.webContents.executeJavaScript(`window.native.browser.text()`);
      const png = await win.webContents.executeJavaScript(`window.native.browser.capture()`);
      res.browser = { title: t.title, textStart: t.text.slice(0, 60), screenshotBytes: Buffer.from(png, 'base64').length };
    } catch (e) { res.error = String(e); }
    fs.writeFileSync(out, JSON.stringify(res, null, 2));
    app.quit();
  }, 2500));
}

// Only one copy may use the library at a time: a second copy cannot open the database (it is locked by the first)
// and shows "Internal error opening backing store". A second launch just brings the first window forward.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
else app.on('second-instance', () => {
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

if (gotLock) app.whenReady().then(() => {
  registerProtocol();
  Menu.setApplicationMenu(null);
  createWindow();
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
