# AI Chat

A Grok-style chat app where you choose the AI model. Use Claude, Gemini, ChatGPT, DeepSeek, Grok, a local Ollama model, or any OpenAI-compatible API, with your own keys.

## Features

- Streaming replies with a Stop button
- Multiple saved chats (sidebar), delete chat, delete all
- Switch provider and model at any time, per message
- Markdown and code blocks, copy button on replies
- Optional system prompt
- Light and dark theme (follows your OS), works on phones

## Supported providers

| Provider | API type | Notes |
|---|---|---|
| Claude (Anthropic) | Anthropic Messages API | Native support |
| ChatGPT (OpenAI) | OpenAI Chat Completions | |
| Gemini (Google) | OpenAI-compatible endpoint | |
| DeepSeek | OpenAI-compatible | `deepseek-chat`, `deepseek-reasoner` |
| Grok (xAI) | OpenAI-compatible | |
| Ollama (local) | OpenAI-compatible | No key. Run `ollama serve` first |
| Custom | Any OpenAI-compatible server | Set the base URL in Settings (LM Studio, vLLM, OpenRouter, Groq, etc.) |

Model names are free text, so you can use any model your key has access to. The dropdown only lists suggestions.

## Run it

Requires Node.js 18 or newer.

```bash
cd ai-chat
npm install
npm start
```

Then open http://localhost:3000.

## Add your API keys

Either:

1. **In the app:** click *Settings & API keys*, paste the key for a provider, and set a default model. Keys stay in this browser's localStorage and are sent to your local server with each request.
2. **On the server:** copy `.env.example` to `.env` and fill in the keys. Keys are read from environment variables when the browser sends none.

Never put keys in code or commit `.env`. The included `.gitignore` excludes it.

## Notes

- The server only forwards requests. It does not store chats or keys.
- Chats are stored in this browser's localStorage. Clearing site data deletes them.
- Images, file uploads, and web search are not included yet. They can be added per provider.
- `deepseek-reasoner` returns its reasoning in a separate field, which this version does not display. Only the final answer appears.
