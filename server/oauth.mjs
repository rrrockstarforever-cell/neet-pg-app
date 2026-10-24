// Subscription logins (device-code OAuth) for ChatGPT/Codex and xAI Grok, same pattern Hermes uses.
// Runs server-side because these endpoints don't allow browser (CORS) calls. Tokens live in
// ~/.neet-pg-prep/oauth.json (mode 600) and never reach the web page.
import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DIR = join(homedir(), '.neet-pg-prep');
const FILE = join(DIR, 'oauth.json');

const CODEX = {
  issuer: 'https://auth.openai.com',
  clientId: 'app_EMoamEEZ73f0CkXaXp7hrann',
  tokenUrl: 'https://auth.openai.com/oauth/token',
  base: 'https://chatgpt.com/backend-api/codex',
};
const XAI = {
  issuer: 'https://auth.x.ai',
  clientId: 'b1a00492-073a-47ea-816f-4c329264a828',
  scope: 'openid profile email offline_access grok-cli:access api:access',
  base: 'https://api.x.ai/v1',
};

const CLAUDE = {
  clientId: '9d1c250a-e61b-44d9-88ed-5944d1962f5e',
  authorize: 'https://claude.ai/oauth/authorize',
  tokenUrls: ['https://platform.claude.com/v1/oauth/token', 'https://console.anthropic.com/v1/oauth/token'],
  redirect: 'https://console.anthropic.com/oauth/code/callback',
  scope: 'org:create_api_key user:profile user:inference',
  base: 'https://api.anthropic.com/v1',
  ua: 'axios/1.7.9', // the token endpoint rejects claude-code/ user agents
  betas: 'claude-code-20250219,oauth-2025-04-20',
  version: '2.1.74',
};
const b64u = (buf) => Buffer.from(buf).toString('base64url');
async function claudeToken(body) {
  let last = 'unknown error';
  for (const url of CLAUDE.tokenUrls) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': CLAUDE.ua }, body: JSON.stringify(body) });
    if (r.ok) return r.json();
    last = `HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`;
  }
  throw new Error(last);
}

const load = () => (existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : {});
function save(d) {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(FILE, JSON.stringify(d, null, 2));
  try { chmodSync(FILE, 0o600); } catch {}
}
const pending = new Map(); // login id -> { provider, ... , status, error }

const form = (o) => new URLSearchParams(o).toString();
async function jpost(url, body, headers = {}) {
  return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
}
async function fpost(url, body) {
  return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: form(body) });
}
const jwt = (t) => { try { return JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString()); } catch { return {}; } };

// ---------- login ----------
export async function startLogin(provider) {
  const id = Math.random().toString(36).slice(2);
  if (provider === 'codex') {
    const r = await jpost(`${CODEX.issuer}/api/accounts/deviceauth/usercode`, { client_id: CODEX.clientId });
    if (r.status === 429) throw new Error('OpenAI is rate-limiting logins. Wait a minute and try again.');
    if (!r.ok) throw new Error(`OpenAI device-code request failed (HTTP ${r.status}).`);
    const d = await r.json();
    const p = { provider, status: 'pending', device_auth_id: d.device_auth_id, user_code: d.user_code, interval: Math.max(3, +d.interval || 5) };
    pending.set(id, p);
    return { id, userCode: d.user_code, url: `${CODEX.issuer}/codex/device`, interval: p.interval };
  }
  if (provider === 'xai') {
    const disc = await (await fetch(`${XAI.issuer}/.well-known/openid-configuration`)).json();
    const r = await fpost(`${XAI.issuer}/oauth2/device/code`, { client_id: XAI.clientId, scope: XAI.scope });
    if (!r.ok) throw new Error(`xAI device-code request failed (HTTP ${r.status}): ${(await r.text()).slice(0, 200)}`);
    const d = await r.json();
    pending.set(id, { provider, status: 'pending', device_code: d.device_code, token_endpoint: disc.token_endpoint, interval: Math.max(1, +d.interval || 5) });
    return { id, userCode: d.user_code, url: d.verification_uri_complete || d.verification_uri, interval: Math.max(1, +d.interval || 5) };
  }
  if (provider === 'claude') {
    // Claude Pro/Max login: open the link, approve, then paste the code shown on the page.
    const { createHash, randomBytes } = await import('node:crypto');
    const verifier = b64u(randomBytes(32));
    const state = b64u(randomBytes(32));
    const challenge = b64u(createHash('sha256').update(verifier).digest());
    pending.set(id, { provider, status: 'pending', mode: 'code', verifier, state });
    const q = new URLSearchParams({ code: 'true', client_id: CLAUDE.clientId, response_type: 'code', redirect_uri: CLAUDE.redirect, scope: CLAUDE.scope, code_challenge: challenge, code_challenge_method: 'S256', state });
    return { id, mode: 'code', url: `${CLAUDE.authorize}?${q}`, interval: 0 };
  }
  throw new Error('Unknown provider');
}

export async function completeLogin(id, pasted) {
  const p = pending.get(id);
  if (!p || p.provider !== 'claude') throw new Error('Login expired. Start again.');
  const [code, state = ''] = String(pasted || '').trim().split('#');
  if (!code) throw new Error('Paste the code shown after you approve.');
  if (state !== p.state) throw new Error('That code does not match this login attempt. Click sign in again and use the new link.');
  const tok = await claudeToken({ grant_type: 'authorization_code', client_id: CLAUDE.clientId, code, state, redirect_uri: CLAUDE.redirect, code_verifier: p.verifier });
  if (!tok.access_token) throw new Error('No access token returned.');
  const d = load();
  d.claude = { access: tok.access_token, refresh: tok.refresh_token, exp: Date.now() + (tok.expires_in || 3600) * 1000 };
  save(d);
  p.status = 'done';
  return { status: 'done' };
}

export async function pollLogin(id) {
  const p = pending.get(id);
  if (!p) return { status: 'error', error: 'Login expired. Start again.' };
  if (p.status !== 'pending') return { status: p.status, error: p.error };
  try {
    if (p.provider === 'codex') {
      const r = await jpost(`${CODEX.issuer}/api/accounts/deviceauth/token`, { device_auth_id: p.device_auth_id, user_code: p.user_code });
      if (r.status === 403 || r.status === 404) return { status: 'pending' };
      if (!r.ok) throw new Error(`Sign-in check failed (HTTP ${r.status}).`);
      const c = await r.json();
      const t = await fpost(CODEX.tokenUrl, {
        grant_type: 'authorization_code', code: c.authorization_code, redirect_uri: `${CODEX.issuer}/deviceauth/callback`,
        client_id: CODEX.clientId, code_verifier: c.code_verifier,
      });
      if (!t.ok) throw new Error(`Token exchange failed (HTTP ${t.status}).`);
      const tok = await t.json();
      const d = load();
      d.codex = { access: tok.access_token, refresh: tok.refresh_token, at: Date.now() };
      save(d);
    } else {
      const r = await fpost(p.token_endpoint, { grant_type: 'urn:ietf:params:oauth:grant-type:device_code', client_id: XAI.clientId, device_code: p.device_code });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (b.error === 'authorization_pending' || b.error === 'slow_down') return { status: 'pending' };
        throw new Error(b.error_description || b.error || `HTTP ${r.status}`);
      }
      const d = load();
      d.xai = { access: b.access_token, refresh: b.refresh_token, tokenUrl: p.token_endpoint, at: Date.now() };
      save(d);
    }
    p.status = 'done';
    return { status: 'done' };
  } catch (e) {
    p.status = 'error';
    p.error = e.message;
    return { status: 'error', error: e.message };
  }
}

export const status = () => { const d = load(); return { codex: !!d.codex, xai: !!d.xai, claude: !!d.claude }; };
export function logout(provider) { const d = load(); delete d[provider]; save(d); }

// ---------- tokens ----------
async function token(provider) {
  const d = load();
  const s = d[provider];
  if (!s) throw new Error('Not signed in. Open Settings and sign in.');
  if (provider === 'claude') {
    if (s.exp - Date.now() > 120_000) return s.access;
    try {
      const b = await claudeToken({ grant_type: 'refresh_token', client_id: CLAUDE.clientId, refresh_token: s.refresh });
      s.access = b.access_token;
      if (b.refresh_token) s.refresh = b.refresh_token;
      s.exp = Date.now() + (b.expires_in || 3600) * 1000;
      save(d);
      return s.access;
    } catch { throw new Error('Your Claude login expired. Open Settings and sign in again.'); }
  }
  const exp = (jwt(s.access).exp || 0) * 1000;
  if (exp && exp - Date.now() > 120_000) return s.access;
  const r = await fpost(provider === 'codex' ? CODEX.tokenUrl : s.tokenUrl, { grant_type: 'refresh_token', client_id: provider === 'codex' ? CODEX.clientId : XAI.clientId, refresh_token: s.refresh });
  if (!r.ok) throw new Error('Your login expired. Open Settings and sign in again.');
  const b = await r.json();
  s.access = b.access_token;
  if (b.refresh_token) s.refresh = b.refresh_token;
  save(d);
  return s.access;
}

// ---------- chat ----------
export async function chat({ provider, model, system, messages, json }) {
  const tok = await token(provider);
  if (provider === 'claude') {
    const r = await fetch(`${CLAUDE.base}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', Authorization: `Bearer ${tok}`, 'anthropic-version': '2023-06-01',
        'anthropic-beta': CLAUDE.betas, 'User-Agent': `claude-code/${CLAUDE.version} (external, cli)`,
      },
      body: JSON.stringify({
        model, max_tokens: json ? 16384 : 8192,
        system: [{ type: 'text', text: "You are Claude Code, Anthropic's official CLI for Claude." }, { type: 'text', text: system + (json ? '\n\nRespond with ONLY a single valid JSON object. No markdown fences.' : '') }],
        messages,
      }),
    });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Claude: ${b?.error?.message || 'HTTP ' + r.status}`);
    return (b.content || []).map((x) => x.text || '').join('');
  }
  if (provider === 'xai') {
    const r = await fetch(`${XAI.base}/chat/completions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, ...messages], ...(json ? { response_format: { type: 'json_object' } } : {}) }),
    });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`xAI: ${b?.error?.message || b?.error || b?.message || 'HTTP ' + r.status}`);
    return b.choices?.[0]?.message?.content ?? '';
  }
  const claims = jwt(tok)['https://api.openai.com/auth'] || {};
  const r = await fetch(`${CODEX.base}/responses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', Accept: 'text/event-stream', Authorization: `Bearer ${tok}`,
      originator: 'neet-pg-prep', 'User-Agent': 'NEETPGPrep/0.1',
      ...(claims.chatgpt_account_id ? { 'ChatGPT-Account-ID': claims.chatgpt_account_id } : {}),
    },
    body: JSON.stringify({
      model, instructions: system, store: false, stream: true,
      input: messages.map((m) => ({ role: m.role, content: [{ type: m.role === 'assistant' ? 'output_text' : 'input_text', text: m.content }] })),
      ...(json ? { text: { format: { type: 'json_object' } } } : {}),
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    let msg = t.slice(0, 300);
    try { const j = JSON.parse(t); msg = j?.error?.message || j?.detail || msg; } catch {}
    throw new Error(`ChatGPT: ${msg} (HTTP ${r.status})`);
  }
  let out = '';
  const dec = new TextDecoder();
  let buf = '';
  for await (const chunk of r.body) {
    buf += dec.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const ev = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const line = ev.split('\n').find((l) => l.startsWith('data:'));
      if (!line) continue;
      try {
        const j = JSON.parse(line.slice(5));
        if (j.type === 'response.output_text.delta') out += j.delta;
        else if (j.type === 'response.failed' || j.type === 'error') throw new Error(j.response?.error?.message || j.message || 'Request failed');
      } catch (e) { if (e.message && !(e instanceof SyntaxError)) throw e; }
    }
  }
  return out;
}

// ---------- HTTP glue (connect-style) ----------
const body = (req) => new Promise((res) => { let s = ''; req.on('data', (c) => (s += c)); req.on('end', () => res(s ? JSON.parse(s) : {})); });
export async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  const send = (code, o) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); };
  try {
    if (url.pathname === '/status') return send(200, status());
    if (url.pathname === '/poll') return send(200, await pollLogin(url.searchParams.get('id')));
    const b = await body(req);
    if (url.pathname === '/start') return send(200, await startLogin(b.provider));
    if (url.pathname === '/complete') return send(200, await completeLogin(b.id, b.code));
    if (url.pathname === '/logout') return (logout(b.provider), send(200, { ok: true }));
    if (url.pathname === '/chat') return send(200, { text: await chat(b) });
    send(404, { error: 'not found' });
  } catch (e) {
    send(500, { error: e.message });
  }
}
