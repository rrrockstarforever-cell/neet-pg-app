import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newPortfolio, buy, sell, checkExits, valuation } from '../public/paper-core.js';

const T = '2026-01-01T00:00:00Z';

test('buy deducts value plus cost and creates a position', () => {
  const pf = buy(newPortfolio(100000), { symbol: 'RELIANCE.NS', qty: 10, price: 1000, time: T, costBps: 10 });
  assert.equal(pf.positions.length, 1);
  assert.equal(pf.positions[0].qty, 10);
  assert.equal(pf.cash, 100000 - 10000 - 10); // 10 bps on 10,000 = 10
});

test('buy rejects insufficient cash, bad quantity and wrong stop or target', () => {
  const pf = newPortfolio(5000);
  assert.throws(() => buy(pf, { symbol: 'X', qty: 10, price: 1000 }), /Not enough paper cash/);
  assert.throws(() => buy(pf, { symbol: 'X', qty: 0, price: 10 }), /whole number/);
  assert.throws(() => buy(pf, { symbol: 'X', qty: 1, price: 100, stop: 105 }), /Stop-loss must be below/);
  assert.throws(() => buy(pf, { symbol: 'X', qty: 1, price: 100, target: 95 }), /Target must be above/);
});

test('averaging down uses weighted cost basis', () => {
  let pf = buy(newPortfolio(1e6), { symbol: 'A', qty: 10, price: 100, costBps: 0 });
  pf = buy(pf, { symbol: 'A', qty: 10, price: 80, costBps: 0 });
  const v = valuation(pf, { A: 90 });
  assert.equal(v.rows[0].qty, 20);
  assert.equal(v.rows[0].avgCost, 90);
  assert.equal(v.rows[0].unrealized, 0);
});

test('sell realizes profit and removes a closed position', () => {
  const pf = buy(newPortfolio(1e6), { symbol: 'A', qty: 10, price: 100, costBps: 0 });
  const { portfolio, realized } = sell(pf, { symbol: 'A', price: 120, costBps: 0 });
  assert.equal(realized, 200);
  assert.equal(portfolio.positions.length, 0);
  assert.equal(portfolio.cash, 1e6 + 200);
});

test('stop-loss triggers at or below the stop and fills at the current price', () => {
  const pf = buy(newPortfolio(1e6), { symbol: 'A', qty: 10, price: 100, stop: 95, costBps: 0 });
  const held = checkExits(pf, { A: 96 }, T, 0);
  assert.equal(held.closed.length, 0);
  const gapped = checkExits(pf, { A: 90 }, T, 0);
  assert.equal(gapped.closed[0].reason, 'stop');
  assert.equal(gapped.closed[0].price, 90);
  assert.equal(gapped.closed[0].realized, -100);
});

test('target triggers at or above the target', () => {
  const pf = buy(newPortfolio(1e6), { symbol: 'A', qty: 10, price: 100, target: 110, costBps: 0 });
  const out = checkExits(pf, { A: 111 }, T, 0);
  assert.equal(out.closed[0].reason, 'target');
  assert.equal(out.closed[0].realized, 110);
});

test('valuation reports equity and unrealized P&L', () => {
  const pf = buy(newPortfolio(10000), { symbol: 'A', qty: 10, price: 100, costBps: 0 });
  const v = valuation(pf, { A: 110 });
  assert.equal(v.cash, 9000);
  assert.equal(v.invested, 1100);
  assert.equal(v.equity, 10100);
  assert.equal(v.rows[0].unrealized, 100);
  assert.equal(v.rows[0].unrealizedPct, 10);
});

test('the input portfolio is not mutated', () => {
  const pf = newPortfolio(1e5);
  buy(pf, { symbol: 'A', qty: 1, price: 10 });
  assert.equal(pf.positions.length, 0);
  assert.equal(pf.cash, 1e5);
});
