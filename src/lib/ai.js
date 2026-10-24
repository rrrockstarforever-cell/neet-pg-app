// AI settings + calls. Settings key and shape match the legacy app: localStorage "neetpg.ai.settings" = { active, configs:{[id]:{apiKey,model,baseUrl,modelChosen}} }.
export const SETTINGS_KEY = 'neetpg.ai.settings';

export const PROVIDERS = [
  { id: 'codex', name: 'ChatGPT subscription (Codex)', kind: 'oauth', sub: 'codex', baseUrl: '', note: 'Sign in with your ChatGPT account. No API credits needed.' },
  { id: 'claude-sub', name: 'Claude subscription (Pro/Max)', kind: 'oauth', sub: 'claude', baseUrl: '', note: 'Sign in with your Claude.ai account. You paste back a code.' },
  { id: 'xai-sub', name: 'Grok subscription (SuperGrok)', kind: 'oauth', sub: 'xai', baseUrl: '', note: 'Sign in with your X / Grok account.' },
  { id: 'gemini', name: 'Google Gemini (API key)', kind: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', defaultModel: 'gemini-2.5-flash', needsKey: true },
  { id: 'openai', name: 'OpenAI (API key)', kind: 'openai', baseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4.1-mini', needsKey: true },
  { id: 'openrouter', name: 'OpenRouter (API key)', kind: 'openai', baseUrl: 'https://openrouter.ai/api/v1', defaultModel: '', needsKey: true },
  { id: 'ollama', name: 'Ollama (local)', kind: 'openai', baseUrl: 'http://localhost:11434/v1', defaultModel: '', needsKey: false },
  { id: 'custom', name: 'Custom OpenAI-compatible', kind: 'openai', baseUrl: '', defaultModel: '', needsKey: false },
];
export const provider = (id) => PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[3];

export function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    if (s && s.configs && s.active) return s;
  } catch { /* fall through */ }
  return { active: 'gemini', configs: {} };
}
export const saveSettings = (s) => localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
export function activeConfig(s = loadSettings()) {
  const p = provider(s.active);
  const c = s.configs[s.active] ?? {};
  return { p, cfg: { apiKey: '', model: p.defaultModel ?? '', baseUrl: p.baseUrl, ...c } };
}
export function isReady(s = loadSettings(), oauth = {}) {
  const { p, cfg } = activeConfig(s);
  if (p.kind === 'oauth') return !!oauth[p.sub] && !!cfg.model;
  return (!p.needsKey || !!cfg.apiKey) && !!cfg.model && !!cfg.baseUrl;
}

// ---- local helper API (Electron app:// protocol or dev server) ----
async function api(path, body) {
  const r = await fetch('/api' + path, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Helper returned HTTP ${r.status}`);
  return j;
}
export const oauth = {
  status: () => api('/oauth/status'),
  start: (provider) => api('/oauth/start', { provider }),
  poll: (id) => api('/oauth/poll?id=' + encodeURIComponent(id)),
  complete: (id, code) => api('/oauth/complete', { id, code }),
  logout: (provider) => api('/oauth/logout', { provider }),
};
export const research = (query) => api('/web/research', { query });

const SYSTEM = 'You are an expert tutor for Indian postgraduate medical entrance exams (NEET PG and INI-CET). Be accurate, concise and high-yield. Keep drug names, eponyms and standard medical terms in English. If something is not supported by the provided source text, say so instead of inventing facts, doses or values.';

// fetch via Electron main process when available (no CORS), else the page's fetch
async function xfetch(url, init) {
  if (window.native && /^https?:/i.test(url)) {
    const id = crypto.randomUUID(), h = {};
    new Headers(init.headers).forEach((v, k) => (h[k] = v));
    const r = await window.native.fetch(id, url, { method: init.method, headers: h, body: init.body });
    return new Response(r.status === 204 ? null : r.body, { status: r.status, headers: r.headers });
  }
  return fetch(url, init);
}
const errMsg = async (r, who) => {
  const j = await r.json().catch(() => ({}));
  const m = j?.error?.message || j?.message || (typeof j?.error === 'string' ? j.error : '');
  return new Error(m ? `${who}: ${m}` : `${who} returned HTTP ${r.status}`);
};

/** messages: [{role:'user'|'assistant', text}] -> reply text */
export async function chat(messages, { system = SYSTEM, signal } = {}) {
  const s = loadSettings();
  const { p, cfg } = activeConfig(s);
  if (!cfg.model) throw new Error('No model chosen. Open Settings and enter a model name.');
  if (p.kind === 'oauth') {
    const r = await fetch('/api/oauth/chat', { method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: p.sub, model: cfg.model, system, messages: messages.map((m) => ({ role: m.role, content: m.text })), json: false }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `Login server error ${r.status}`);
    if (!j.text) throw new Error('Empty response.');
    return j.text;
  }
  if (p.needsKey && !cfg.apiKey) throw new Error('Add your API key in Settings first.');
  const base = cfg.baseUrl.replace(/\/$/, '');
  if (p.kind === 'gemini') {
    const r = await xfetch(`${base}/models/${encodeURIComponent(cfg.model)}:generateContent`, { method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.apiKey },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.text }] })) }) });
    if (!r.ok) throw await errMsg(r, p.name);
    const j = await r.json();
    const t = j?.candidates?.[0]?.content?.parts?.map((x) => x.text).join('') ?? '';
    if (!t) throw new Error('Empty response.');
    return t;
  }
  const r = await xfetch(`${base}/chat/completions`, { method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}) },
    body: JSON.stringify({ model: cfg.model, messages: [{ role: 'system', content: system }, ...messages.map((m) => ({ role: m.role, content: m.text }))] }) });
  if (!r.ok) throw await errMsg(r, p.name);
  const j = await r.json();
  const t = j?.choices?.[0]?.message?.content ?? '';
  if (!t) throw new Error('Empty response.');
  return t;
}

export function webPrompt(res, question) {
  const src = res.sources.map((s, i) => `[${i + 1}] ${s.title}\n${s.url}\n${s.text}`).join('\n\n');
  return `WEB SOURCES (retrieved ${res.retrievedAt}). Answer using ONLY these sources. Cite sources as [n] and list their URLs at the end.\n\n${src}\n\nQUESTION: ${question}`;
}
