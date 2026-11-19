// AI Chat server.
// Serves the web UI and proxies chat requests to the provider you choose.
// API keys are either sent by the browser per request or read from environment variables.
// The server never stores keys.

import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;

// type "openai"    -> any OpenAI-compatible Chat Completions API (ChatGPT, Gemini, DeepSeek, Grok, Ollama, custom)
// type "anthropic" -> Anthropic Messages API (Claude)
export const PROVIDERS = {
  openai: {
    label: 'ChatGPT (OpenAI)',
    type: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    envKey: 'OPENAI_API_KEY',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini'],
  },
  anthropic: {
    label: 'Claude (Anthropic)',
    type: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    envKey: 'ANTHROPIC_API_KEY',
    models: ['claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-opus-5-5'],
  },
  gemini: {
    label: 'Gemini (Google)',
    type: 'openai',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    envKey: 'GEMINI_API_KEY',
    models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
  },
  deepseek: {
    label: 'DeepSeek',
    type: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    envKey: 'DEEPSEEK_API_KEY',
    models: ['deepseek-chat', 'deepseek-reasoner'],
  },
  xai: {
    label: 'Grok (xAI)',
    type: 'openai',
    baseUrl: 'https://api.x.ai/v1',
    envKey: 'XAI_API_KEY',
    models: ['grok-3', 'grok-3-mini'],
  },
  ollama: {
    label: 'Ollama (local, no key)',
    type: 'openai',
    baseUrl: 'http://localhost:11434/v1',
    envKey: null,
    models: ['llama3.2', 'qwen2.5'],
  },
  custom: {
    label: 'Custom OpenAI-compatible',
    type: 'openai',
    baseUrl: '',
    envKey: 'CUSTOM_API_KEY',
    models: [],
  },
};

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Tells the UI which providers exist and whether a server-side key is already configured.
app.get('/api/providers', (_req, res) => {
  res.json(
    Object.entries(PROVIDERS).map(([id, p]) => ({
      id,
      label: p.label,
      baseUrl: p.baseUrl,
      models: p.models,
      needsKey: p.envKey !== null,
      serverKeyConfigured: Boolean(p.envKey && process.env[p.envKey]),
    })),
  );
});

// Streams the model's reply as plain text.
app.post('/api/chat', async (req, res) => {
  const { provider: id, model, messages, system, apiKey, baseUrl } = req.body ?? {};
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

  // Keep only clean user/assistant turns.
  const clean = messages
    .filter((m) => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({ role: m.role, content: m.content }));

  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) controller.abort(); // client pressed Stop or closed the tab
  });

  let upstream;
  try {
    upstream = await callProvider(p, { base, key, model, system, messages: clean }, controller.signal);
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
      messages,
    };
    if (system && system.trim()) body.system = system.trim();
    return fetch(`${base}/messages`, { method: 'POST', headers, body: JSON.stringify(body), signal });
  }

  const headers = { 'Content-Type': 'application/json' };
  if (key) headers.Authorization = `Bearer ${key}`;
  const msgs = [];
  if (system && system.trim()) msgs.push({ role: 'system', content: system.trim() });
  msgs.push(...messages);
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
