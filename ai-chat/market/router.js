// HTTP routes for the market module. Mounted at /api/market by server.js.

import express from 'express';
import { analyzeSymbol, screenSymbols, globalDashboard } from './analysis.js';
import { backtest, BACKTEST_STRATEGIES } from './backtest.js';
import { getDailyBars } from './data.js';
import { STRATEGY_GUIDE, SELECTION_CHECKLIST, DISCLAIMER } from './guide.js';

const SYMBOL_RE = /^[A-Za-z0-9.^=\-]{1,20}$/;
const PROVIDERS = ['yahoo', 'alphavantage'];
const MAX_SYMBOLS = 30;

export const marketRouter = express.Router();

function clean(sym) {
  const s = String(sym || '').trim().toUpperCase();
  return SYMBOL_RE.test(s) ? s : null;
}

function options(body = {}) {
  return {
    provider: PROVIDERS.includes(body.provider) ? body.provider : 'yahoo',
    apiKey: typeof body.apiKey === 'string' ? body.apiKey : '',
    benchmark: clean(body.benchmark) || undefined,
    withFundamentals: body.fundamentals !== false,
  };
}

function fail(res, err) {
  const limited = /limit reached/i.test(err.message);
  res.status(limited ? 429 : 502).json({ error: err.message });
}

marketRouter.get('/strategies', (_req, res) => {
  res.json({
    disclaimer: DISCLAIMER,
    strategies: STRATEGY_GUIDE,
    backtestStrategies: BACKTEST_STRATEGIES,
    checklist: SELECTION_CHECKLIST,
  });
});

marketRouter.post('/analyze', async (req, res) => {
  const symbol = clean(req.body?.symbol);
  if (!symbol) return res.status(400).json({ error: 'Enter a valid ticker, for example AAPL or RELIANCE.NS.' });
  try {
    const out = await analyzeSymbol(symbol, { ...options(req.body), withNews: req.body?.news === true });
    res.json({ disclaimer: DISCLAIMER, ...out });
  } catch (err) {
    fail(res, err);
  }
});

marketRouter.post('/screen', async (req, res) => {
  const list = Array.isArray(req.body?.symbols) ? req.body.symbols.map(clean).filter(Boolean) : [];
  const symbols = [...new Set(list)].slice(0, MAX_SYMBOLS);
  if (!symbols.length) return res.status(400).json({ error: 'Give at least one valid ticker.' });
  try {
    const rows = await screenSymbols(symbols, options(req.body));
    res.json({ disclaimer: DISCLAIMER, rows });
  } catch (err) {
    fail(res, err);
  }
});

marketRouter.post('/backtest', async (req, res) => {
  const symbol = clean(req.body?.symbol);
  if (!symbol) return res.status(400).json({ error: 'Enter a valid ticker.' });
  const strategy = BACKTEST_STRATEGIES[req.body?.strategy] ? req.body.strategy : 'golden_cross';
  const costBps = Number.isFinite(req.body?.costBps) ? Math.min(Math.max(req.body.costBps, 0), 100) : 10;
  try {
    const { bars } = await getDailyBars(symbol, options(req.body));
    res.json({ symbol, disclaimer: DISCLAIMER, ...backtest(bars, strategy, { costBps }) });
  } catch (err) {
    fail(res, err);
  }
});

marketRouter.post('/global', async (req, res) => {
  try {
    const out = await globalDashboard(options(req.body));
    res.json({ disclaimer: DISCLAIMER, ...out });
  } catch (err) {
    fail(res, err);
  }
});
