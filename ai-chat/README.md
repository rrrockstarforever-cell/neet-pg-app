# AI Chat

A Grok-style chat app where you choose the AI model. Use Claude, Gemini, ChatGPT, DeepSeek, Grok, a local Ollama model, or any OpenAI-compatible API, with your own keys.

## Features

- Streaming replies with a Stop button
- Multiple saved chats (sidebar), rename, search by title or content, delete chat, delete all
- Edit a sent message and resend it, or regenerate the last reply
- Export a chat as Markdown
- Keyboard: Enter sends, Shift+Enter for a new line, Ctrl/Cmd+K for a new chat, Esc stops a reply
- Switch provider and model at any time, per message
- Markdown and code blocks, copy button on replies
- Optional system prompt
- Light and dark theme (follows your OS)
- Phone-first layout: menu drawer, bottom composer, large touch targets, suggestion chips on a new chat
- Voice mode: full-screen orb. Tap to speak, the reply is read aloud, and it returns to listening
- Install as an app: in Safari or Chrome on your phone, choose "Add to Home Screen"

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
- Image and text-file attachments, web search (Brave), projects, and voice are included. PDFs are not extracted yet.
- `deepseek-reasoner` returns its reasoning in a separate field, which this version does not display. Only the final answer appears.

## Markets tab (trading and stock analysis)

Switch to **Markets** in the sidebar. It has four parts:

1. **Global markets and sectors.** Indices (US, India, Japan, Hong Kong, UK, Germany), dollar, oil, gold, 10-year yield, VIX, and US sector ETFs. Shows 1-week, 1-month and 3-month returns, trend vs the 200-day average, and the strongest and weakest sectors.
2. **Watchlist screen.** Ranks tickers by the Minervini Trend Template (8 checks), Weinstein Stage 2, Darvas/Livermore breakouts, Turtle entries, and relative strength vs a benchmark.
3. **Single-stock analysis.** Indicators (SMA 50/150/200, RSI, MACD, ATR, Bollinger), a suggested stop at 2×ATR, every rule check with its detail, fundamentals and news (Alpha Vantage), and a backtest of four long-only strategies with costs, drawdown, win rate and time in market. **Ask AI to analyze** sends the data to the chat and asks for a structured research view covering global context, fundamentals, technicals, local and global demand, bull and bear cases, and risks.
4. **Strategy guide.** The rules used by Minervini, Weinstein, Darvas, Livermore, the Turtles, O'Neil (CAN SLIM style), Buffett, Graham and Lynch, plus a checklist for global context, long-term fundamentals, short-term technicals, local and global demand, and risk.

### Data sources

- **Yahoo Finance (default).** No key. Price history only. The endpoint is unofficial and rate-limits heavily (HTTP 429), so use it lightly.
- **Alpha Vantage.** Free key. Adds fundamentals (P/E, PEG, ROE, margins, EPS growth) and news sentiment. The free plan allows about 25 calls a day, so keep watchlists short. Set the key in Settings or as `ALPHAVANTAGE_API_KEY`.

Use Yahoo symbols: NSE stocks end in `.NS` (e.g. `RELIANCE.NS`), BSE in `.BO`, and US stocks have no suffix. Alpha Vantage symbol coverage for Indian stocks is limited.

### Important limits

- These are simplified versions of published methods. Thresholds are conventions, not validated edges. Read the original books before relying on any rule.
- Backtests ignore slippage, taxes, dividends and survivorship bias. A good backtest does not guarantee future returns.
- Benchmark alignment is by trading-day position, not by exact date, so relative strength is approximate for markets with different holidays.
- This is an educational research tool, not financial advice. Verify data and consult a licensed adviser (in India, a SEBI-registered one) before investing.

### Tests

```bash
npm test
```

The tests use synthetic prices and a mock Yahoo server, so they do not need the internet.
