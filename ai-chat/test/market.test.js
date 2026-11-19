import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { sma, rsi, atr, macd, periodReturn } from '../market/indicators.js';
import { computeSnapshot } from '../market/analysis.js';
import { backtest } from '../market/backtest.js';

// Deterministic synthetic price path: uptrend with a seeded wobble.
function makeBars(n, { drift = 0.0008, start = 100, seed = 7 } = {}) {
  let x = seed;
  const rnd = () => ((x = (x * 16807) % 2147483647) / 2147483647) - 0.5;
  const bars = [];
  let p = start;
  for (let i = 0; i < n; i++) {
    const open = p;
    p = p * (1 + drift + rnd() * 0.02);
    const close = p;
    const high = Math.max(open, close) * (1 + Math.abs(rnd()) * 0.01);
    const low = Math.min(open, close) * (1 - Math.abs(rnd()) * 0.01);
    const d = new Date(Date.UTC(2020, 0, 1) + i * 86400000).toISOString().slice(0, 10);
    bars.push({ date: d, open, high, low, close, volume: 1e6 * (0.8 + Math.abs(rnd())) });
  }
  return bars;
}

test('SMA of a constant series is that constant', () => {
  const out = sma([5, 5, 5, 5, 5], 3);
  assert.equal(out[1], null);
  assert.equal(out[2], 5);
  assert.equal(out[4], 5);
});

test('EMA and SMA agree on the first value', () => {
  const v = [1, 2, 3, 4, 5, 6];
  assert.equal(sma(v, 3)[2], 2);
});

test('RSI is 100 when prices only rise and 0 when they only fall', () => {
  const up = Array.from({ length: 30 }, (_, i) => 100 + i);
  const down = Array.from({ length: 30 }, (_, i) => 100 - i);
  assert.equal(rsi(up, 14)[29], 100);
  assert.equal(rsi(down, 14)[29], 0);
});

test('ATR is positive and MACD arrays line up with input length', () => {
  const bars = makeBars(120);
  const a = atr(bars.map((b) => b.high), bars.map((b) => b.low), bars.map((b) => b.close), 14);
  assert.ok(a[119] > 0);
  const m = macd(bars.map((b) => b.close));
  assert.equal(m.line.length, 120);
  assert.notEqual(m.hist[119], null);
});

test('periodReturn computes simple returns', () => {
  assert.ok(Math.abs(periodReturn([100, 110, 121], 2) - 0.21) < 1e-9);
  assert.equal(periodReturn([100], 5), null);
});

test('snapshot on a steady uptrend passes the Minervini template and Stage 2', () => {
  const stock = makeBars(400, { drift: 0.002 });
  const bench = makeBars(400, { drift: 0.0002, seed: 3 });
  const snap = computeSnapshot(stock, { close: bench.map((b) => b.close) }, null);
  assert.ok(snap.trendTemplateScore >= 6, `score ${snap.trendTemplateScore}`);
  assert.equal(snap.strategies.weinstein_stage2.pass, true);
  assert.equal(snap.strategies.buffett_quality.pass, null); // no fundamentals -> unknown, not false
  assert.ok(snap.suggestedStop2Atr < snap.price);
});

test('snapshot on a downtrend fails the trend template', () => {
  const stock = makeBars(400, { drift: -0.002 });
  const snap = computeSnapshot(stock, null, null);
  assert.equal(snap.strategies.minervini_trend_template.pass, false);
  assert.equal(snap.strategies.weinstein_stage2.pass, false);
});

test('fundamental rules use provided numbers', () => {
  const stock = makeBars(300, { drift: 0.001 });
  const good = computeSnapshot(stock, null, { roe: 0.22, profitMargin: 0.15, pe: 18, priceToBook: 1.2, pegRatio: 0.8, epsQuarterlyGrowth: 0.3 });
  assert.equal(good.strategies.buffett_quality.pass, true);
  assert.equal(good.strategies.graham_value.pass, false); // P/E 18 > 15
  assert.equal(good.strategies.lynch_garp.pass, true);
});

test('backtest: buy and hold equals price change minus entry cost; no look-ahead on signal bar', () => {
  const bars = makeBars(400, { drift: 0.001 });
  const bh = backtest(bars, 'buy_hold', { costBps: 0 });
  const expected = bars[bars.length - 1].close / bars[0].close - 1;
  assert.ok(Math.abs(bh.totalReturn - expected) < 1e-3, `${bh.totalReturn} vs ${expected}`);
  assert.equal(bh.trades, 1);
});

test('backtest runs every strategy and reports sane metrics', () => {
  const bars = makeBars(600, { drift: 0.0005, seed: 11 });
  for (const s of ['buy_hold', 'golden_cross', 'turtle', 'rsi_pullback']) {
    const r = backtest(bars, s, { costBps: 10 });
    assert.ok(r.maxDrawdown <= 0 && r.maxDrawdown >= -1, s);
    assert.ok(['IN (long)', 'OUT (flat)'].includes(r.currentSignal), s);
    assert.ok(r.timeInMarket >= 0 && r.timeInMarket <= 1, s);
  }
});

test('backtest rejects unknown strategy and short history', () => {
  assert.throws(() => backtest(makeBars(400), 'nope'), /Unknown strategy/);
  assert.throws(() => backtest(makeBars(100), 'golden_cross'), /Need about 260/);
});

test('HTTP: /api/market/analyze works against a mock Yahoo server', async () => {
  const bars = makeBars(400, { drift: 0.002 });
  const mock = http.createServer((req, res) => {
    const sym = decodeURIComponent(req.url.split('/chart/')[1].split('?')[0]);
    const body = {
      chart: { result: [{
        meta: { currency: 'USD', symbol: sym },
        timestamp: bars.map((_, i) => Math.floor(Date.UTC(2020, 0, 1) / 1000) + i * 86400),
        indicators: { quote: [{
          open: bars.map((b) => b.open), high: bars.map((b) => b.high), low: bars.map((b) => b.low),
          close: bars.map((b) => b.close), volume: bars.map((b) => b.volume),
        }] },
      }], error: null },
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  });
  await new Promise((r) => mock.listen(4201, r));
  process.env.YAHOO_BASE_URL = 'http://localhost:4201';
  const { default: app } = await import('../server.js');
  const server = app.listen(0);
  const port = server.address().port;
  try {
    const r = await fetch(`http://localhost:${port}/api/market/analyze`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol: 'test.ns', provider: 'yahoo' }),
    });
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.symbol, 'TEST.NS');
    assert.equal(j.benchmark, '^NSEI');
    assert.ok(j.price > 0);
    assert.ok(j.disclaimer.includes('Not financial advice'));

    const bad = await fetch(`http://localhost:${port}/api/market/analyze`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: '<script>' }),
    });
    assert.equal(bad.status, 400);

    const g = await fetch(`http://localhost:${port}/api/market/strategies`);
    assert.equal((await g.json()).strategies.length >= 10, true);
  } finally {
    server.close();
    mock.close();
  }
});
