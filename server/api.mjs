// One request router for the local helper. Used by the dev server (Vite) and by the desktop app (Electron main).
import * as oauth from './oauth.mjs';
import { research } from './web.mjs';

/** path is relative to /api, e.g. "/oauth/start". Returns { code, json }. */
export async function route(path, method, body, query) {
  const ok = (json) => ({ code: 200, json });
  try {
    if (path === '/oauth/status') return ok(oauth.status());
    if (path === '/oauth/poll') return ok(await oauth.pollLogin(query.get('id')));
    if (method !== 'POST') return { code: 405, json: { error: 'POST required' } };
    if (path === '/oauth/start') return ok(await oauth.startLogin(body.provider));
    if (path === '/oauth/complete') return ok(await oauth.completeLogin(body.id, body.code));
    if (path === '/oauth/logout') return (oauth.logout(body.provider), ok({ ok: true }));
    if (path === '/oauth/chat') return ok({ text: await oauth.chat(body) });
    if (path === '/web/research') return ok(await research(body.query));
    return { code: 404, json: { error: 'not found' } };
  } catch (e) {
    return { code: 500, json: { error: e.message } };
  }
}

/** connect-style handler (Vite dev server). The mount point strips "/api". */
export async function handleNode(req, res) {
  const url = new URL(req.url, 'http://x');
  let body = {};
  if (req.method === 'POST') {
    const raw = await new Promise((r) => { let s = ''; req.on('data', (c) => (s += c)); req.on('end', () => r(s)); });
    try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
  }
  const out = await route(url.pathname, req.method, body, url.searchParams);
  res.statusCode = out.code;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(out.json));
}
