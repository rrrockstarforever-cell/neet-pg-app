// AI Chat server.
// Serves the web UI and proxies chat requests to the provider you choose.
// API keys are either sent by the browser per request or read from environment variables.
// The server never stores keys or chats.

import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const MAX_IMAGES_PER_MESSAGE = 8;

// type "openai"    -> any OpenAI-compatible Chat Completions API (ChatGPT, Gemini, DeepSeek, Grok, Ollama, custom)
// type "anthropic" -> Anthropic Messages API (Claude)
// vision: whether image input is supported by this provider's default setup
export const PROVIDERS = {
  openai: {
    label: 'ChatGPT (OpenAI)',
    type: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    envKey: 'OPENAI_API_KEY',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini'],
    vision: true,
  },
  anthropic: {
    label: 'Claude (Anthropic)',
    type: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    envKey: 'ANTHROPIC_API_KEY',
    models: ['claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-opus-5-5'],
    vision: true,
  },
  gemini: {
    label: 'Gemini (Google)',
    type: 'openai',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    envKey: 'GEMINI_API_KEY',
    models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
    vision: true,
  },
  deepseek: {
    label: 'DeepSeek',
    type: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    envKey: 'DEEPSEEK_API_KEY',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    vision: false,
  },
  xai: {
    label: 'Grok (xAI)',
    type: 'openai',
    baseUrl: 'https://api.x.ai/v1',
    envKey: 'XAI_API_KEY',
    models: ['grok-3', 'grok-3-mini'],
    vision: true,
  },
  ollama: {
    label: 'Ollama (local, no key)',
    type: 'openai',
    baseUrl: 'http://localhost:11434/v1',
    envKey: null,
    models: ['llama3.2', 'qwen2.5'],
    vision: false,
  },
  custom: {
    label: 'Custom OpenAI-compatible',
    type: 'openai',
    baseUrl: '',
    envKey: 'CUSTOM_API_KEY',
    models: [],
    vision: true,
  },
};

const app = express();
app.use(express.json({ limit: '25mb' })); // allows base64 image attachments
app.use(express.static(path.join(__dirname, 'public')));

// Tells the UI which providers exist and whether a server-side key is already configured.
app.get('/api/providers', (_req, res) => {
  res.json(
    Object.entries(PROVIDERS).map(([id, p]) => ({
      id,
      label: p.label,
      baseUrl: p.baseUrl,
      models: p.models,
      vision: p.vision,
      needsKey: p.envKey !== null,
      serverKeyConfigured: Boolean(p.envKey && process.env[p.envKey]),
    })),
  );
});

app.get('/api/config', (_req, res) => {
  res.json({ searchServerKey: Boolean(process.env.BRAVE_API_KEY) });
});

// Streams the model's reply as plain text.
app.post('/api/chat', async (req, res) => {
  const { provider: id, model, messages, system, apiKey, baseUrl, webSearch, searchKey } = req.body ?? {};
  const p = PROVIDERS[id];

  if (!p) return res.status(400).json({ error: `Unknown provider: ${id}` });
  if (!model || typeof model !== 'string') return res.status(400).json({ error: 'Model name is required.' });
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'No messages to send.' });
  }

  const key = (typeof apiKey === 'string' && apiKey.trim()) || (p.envKey && process.env[p.envKey]) || '';
  if (p.envKey && !key) {
    return res.status(401).json({ error: `No API key for ${p.label}. Add it in Settings or set ${p.envKey}.` });
  }

  const base = String((typeof baseUrl === 'string' && baseUrl.trim()) || p.baseUrl || '').replace(/\/+$/, '');
  if (!base) return res.status(400).json({ error: 'Base URL is required for this provider.' });

  // Keep only clean user/assistant turns. Images are data: URLs of image types only.
  const clean = messages
    .filter((m) => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({
      role: m.role,
      content: m.content,
      images: Array.isArray(m.images)
        ? m.images.filter((s) => typeof s === 'string' && /^data:image\/(png|jpe?g|gif|webp);base64,/.test(s)).slice(0, MAX_IMAGES_PER_MESSAGE)
        : [],
    }));

  let finalSystem = typeof system === 'string' ? system.trim() : '';

  // Optional web search: results are added to the system prompt so any provider can use them.
  if (webSearch) {
    const lastUser = [...clean].reverse().find((m) => m.role === 'user');
    const skey = (typeof searchKey === 'string' && searchKey.trim()) || process.env.BRAVE_API_KEY || '';
    if (!skey) {
      return res.status(400).json({ error: 'Web search is on, but no Brave Search API key is set. Add it in Settings or set BRAVE_API_KEY.' });
    }
    try {
      const results = await braveSearch(lastUser?.content ?? '', skey);
      if (results.length) {
        const block = results
          .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.snippet}`)
          .join('\n\n');
        finalSystem += `\n\nWeb search results for the latest question. Use them when relevant and cite sources as [n] with URLs:\n\n${block}`;
      }
    } catch (err) {
      return res.status(502).json({ error: `Web search failed: ${err.message}` });
    }
  }

  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) controller.abort(); // client pressed Stop or closed the tab
  });

  let upstream;
  try {
    upstream = await callProvider(p, { base, key, model, system: finalSystem, messages: clean }, controller.signal);
  } catch (err) {
    if (controller.signal.aborted) return;
    return res.status(502).json({ error: `Could not reach ${p.label}: ${err.message}` });
  }

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => '');
    return res.status(502).json({ error: `${p.label} returned HTTP ${upstream.status}: ${text.slice(0, 500)}` });
  }

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');

  try {
    for await (const delta of textDeltas(upstream.body, p.type)) {
      res.write(delta);
    }
  } catch (err) {
    if (!controller.signal.aborted) res.write(`\n\n[Error: ${err.message}]`);
  }
  res.end();
});

async function braveSearch(query, key) {
  const q = query.trim().slice(0, 400);
  if (!q) return [];
  const url = `https://api.search.brave.com/res/v1/web/search?count=5&q=${encodeURIComponent(q)}`;
  const r = await fetch(url, { headers: { Accept: 'application/json', 'X-Subscription-Token': key } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const data = await r.json();
  return (data.web?.results ?? []).slice(0, 5).map((x) => ({
    title: x.title ?? '',
    url: x.url ?? '',
    snippet: (x.description ?? '').replace(/<[^>]+>/g, ''),
  }));
}

// Converts one parsed data URL into { media_type, data }.
function parseDataUrl(url) {
  const m = /^data:(image\/[a-z+.-]+);base64,(.*)$/s.exec(url);
  return m ? { media_type: m[1], data: m[2] } : null;
}

function toOpenAIMessage(m) {
  if (!m.images.length) return { role: m.role, content: m.content };
  return {
    role: m.role,
    content: [
      { type: 'text', text: m.content || 'Describe this image.' },
      ...m.images.map((url) => ({ type: 'image_url', image_url: { url } })),
    ],
  };
}

function toAnthropicMessage(m) {
  if (!m.images.length) return { role: m.role, content: m.content };
  const parts = [];
  for (const url of m.images) {
    const img = parseDataUrl(url);
    if (img) parts.push({ type: 'image', source: { type: 'base64', media_type: img.media_type, data: img.data } });
  }
  parts.push({ type: 'text', text: m.content || 'Describe this image.' });
  return { role: m.role, content: parts };
}

function callProvider(p, { base, key, model, system, messages }, signal) {
  if (p.type === 'anthropic') {
    const headers = {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    };
    const body = {
      model,
      max_tokens: 4096,
      stream: true,
      messages: messages.map(toAnthropicMessage),
    };
    if (system) body.system = system;
    return fetch(`${base}/messages`, { method: 'POST', headers, body: JSON.stringify(body), signal });
  }

  const headers = { 'Content-Type': 'application/json' };
  if (key) headers.Authorization = `Bearer ${key}`;
  const msgs = [];
  if (system) msgs.push({ role: 'system', content: system });
  msgs.push(...messages.map(toOpenAIMessage));
  const body = { model, messages: msgs, stream: true };
  return fetch(`${base}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body), signal });
}

async function* readLines(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      yield buf.slice(0, idx).replace(/\r$/, '');
      buf = buf.slice(idx + 1);
    }
  }
  buf += decoder.decode();
  if (buf) yield buf;
}

async function* textDeltas(stream, type) {
  for await (const line of readLines(stream)) {
    if (!line.startsWith('data:')) continue;
    const data = line.slice(5).trim();
    if (!data) continue;
    if (data === '[DONE]') return;

    let json;
    try {
      json = JSON.parse(data);
    } catch {
      continue;
    }

    if (type === 'anthropic') {
      if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') yield json.delta.text;
      else if (json.type === 'error') throw new Error(json.error?.message ?? 'Anthropic stream error');
    } else {
      if (json.error) throw new Error(json.error.message ?? 'Stream error');
      const text = json.choices?.[0]?.delta?.content;
      if (text) yield text;
    }
  }
}

// Only start listening when run directly (lets tests import PROVIDERS).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(PORT, () => {
    console.log(`AI Chat running at http://localhost:${PORT}`);
  });
}

export default app;
