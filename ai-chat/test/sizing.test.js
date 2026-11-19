import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sizePosition, tradeStats } from '../public/sizing-core.js';

test('1% risk: stop 5% below entry means investing 20% of capital', () => {
  // capital 1,00,000; risk 1,000; entry 100; stop 95 -> risk per share 5 -> 200 shares -> 20,000 invested
  const r = sizePosition({ capital: 100000, riskPct: 1, entry: 100, stop: 95 });
  assert.equal(r.qty, 200);
  assert.equal(r.invested, 20000);
  assert.equal(r.investedPct, 20);
  assert.equal(r.stopDistancePct, 5);
  assert.equal(r.idealInvestedPct, 20);
  assert.equal(r.actualRisk, 1000);
  assert.equal(r.actualRiskPct, 1);
});

test('tight stop allows a larger position, wide stop a smaller one', () => {
  const tight = sizePosition({ capital: 100000, entry: 100, stop: 98 }); // 2% stop -> 50% of capital
  const wide = sizePosition({ capital: 100000, entry: 100, stop: 90 });  // 10% stop -> 10% of capital
  assert.equal(tight.investedPct, 50);
  assert.equal(wide.investedPct, 10);
});

test('max position cap limits the size and is flagged', () => {
  const r = sizePosition({ capital: 100000, entry: 100, stop: 98, maxPositionPct: 25 });
  assert.equal(r.capped, true);
  assert.equal(r.invested, 25000);
  assert.ok(r.actualRiskPct < 1);
});

test('rounds shares down so the loss never exceeds the limit', () => {
  const r = sizePosition({ capital: 100000, riskPct: 1, entry: 333, stop: 300 }); // 1000 / 33 = 30.3 -> 30
  assert.equal(r.qty, 30);
  assert.ok(r.actualRisk <= r.riskAmount);
});

test('validation: stop must be below entry for a long trade', () => {
  assert.throws(() => sizePosition({ capital: 1e5, entry: 100, stop: 105 }), /below the entry/);
  assert.throws(() => sizePosition({ capital: 0, entry: 100, stop: 95 }), /total capital/);
  assert.throws(() => sizePosition({ capital: 1e5, riskPct: 0, entry: 100, stop: 95 }), /Risk per trade/);
});

test('tradeStats: win rate, R multiples, expectancy and rule breaches', () => {
  const trades = [
    { symbol: 'A', entry: 100, stop: 95, exit: 110, qty: 10 }, // +100 = +2R
    { symbol: 'B', entry: 100, stop: 95, exit: 95, qty: 10 },  // -50 = -1R
    { symbol: 'C', entry: 100, stop: 95, exit: 90, qty: 40 },  // -400 = -2R, risk 200
    { symbol: 'D', entry: 100, stop: 95, exit: null, qty: 10 }, // open, ignored
  ];
  const s = tradeStats(trades, { capital: 100000, riskPct: 1 });
  assert.equal(s.closedTrades, 3);
  assert.equal(s.openTrades, 1);
  assert.equal(s.wins, 1);
  assert.equal(s.losses, 2);
  assert.equal(s.winRatePct, 33.3);
  assert.equal(s.totalPnl, 100 - 50 - 400);
  assert.equal(s.trades[0].r, 2);
  assert.equal(s.trades[2].r, -2);
  assert.equal(s.expectancyR, -0.33); // 1/3 x 2R - 2/3 x 1.5R
  assert.equal(s.ruleBreaches, 0); // every trade here risks 0.2% of capital, within the 1% rule
});

test('tradeStats: fees reduce P&L and a big loss counts as a rule breach', () => {
  const s = tradeStats(
    [{ symbol: 'X', entry: 100, stop: 95, exit: 110, qty: 10, fees: 20 }, // pnl 80 -> +1.6R
     { symbol: 'Y', entry: 100, stop: 80, exit: 80, qty: 100 }],          // risk 2000 on 100k = 2%
    { capital: 100000, riskPct: 1 },
  );
  assert.equal(s.trades[0].pnl, 80);
  assert.equal(s.trades[1].riskPct, 2);
  assert.equal(s.ruleBreaches, 1);
});

test('tradeStats handles no closed trades', () => {
  const s = tradeStats([{ symbol: 'A', entry: 100, stop: 95, exit: null, qty: 1 }]);
  assert.equal(s.closedTrades, 0);
  assert.equal(s.winRatePct, null);
  assert.equal(s.expectancyR, null);
});
