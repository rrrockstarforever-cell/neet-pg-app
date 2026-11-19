// Long-only backtest on daily closes.
// A signal decided at the close of day t is held during day t+1 (no look-ahead).
// Transaction cost is charged on every position change.

import { sma, rsi, highestOver, lowestOver } from './indicators.js';

export const BACKTEST_STRATEGIES = {
  buy_hold: 'Buy and hold (benchmark for comparison)',
  golden_cross: '50/200-day moving average crossover (medium-term trend)',
  turtle: 'Turtle: enter on a 20-day high, exit on a 10-day low (trend following)',
  rsi_pullback: 'Buy RSI below 30 in an uptrend (above 200-day), exit above RSI 55',
};

export function backtest(bars, strategy = 'golden_cross', { costBps = 10 } = {}) {
  if (!BACKTEST_STRATEGIES[strategy]) throw new Error(`Unknown strategy: ${strategy}`);
  const n = bars.length;
  if (n < 260) throw new Error(`Need about 260 bars for a backtest; got ${n}.`);

  const close = bars.map((b) => b.close);
  const high = bars.map((b) => b.high);
  const low = bars.map((b) => b.low);
  const sma50 = sma(close, 50);
  const sma200 = sma(close, 200);
  const rsi14 = rsi(close, 14);

  // Desired position after the close of each bar (1 = long, 0 = flat).
  const pos = new Array(n).fill(0);
  let state = strategy === 'buy_hold' ? 1 : 0;
  for (let t = 0; t < n; t++) {
    if (strategy === 'buy_hold') {
      state = 1;
    } else if (strategy === 'golden_cross') {
      if (sma50[t] !== null && sma200[t] !== null) state = sma50[t] > sma200[t] ? 1 : 0;
    } else if (strategy === 'turtle') {
      if (t >= 20) {
        if (state === 0 && close[t] > highestOver(high, t - 20, t)) state = 1;
        else if (state === 1 && close[t] < lowestOver(low, t - 10, t)) state = 0;
      }
    } else if (strategy === 'rsi_pullback') {
      if (rsi14[t] !== null && sma200[t] !== null) {
        if (state === 0 && rsi14[t] < 30 && close[t] > sma200[t]) state = 1;
        else if (state === 1 && rsi14[t] > 55) state = 0;
      }
    }
    pos[t] = state;
  }

  const cost = costBps / 10000;
  let equity = 1;
  const curve = [1];
  let investedBars = 0;
  let peak = 1;
  let maxDrawdown = 0;
  let trades = 0;
  const closedTrades = [];
  let entry = null;

  for (let t = 1; t < n; t++) {
    const held = pos[t - 1];
    const changed = t >= 2 ? pos[t - 1] !== pos[t - 2] : pos[0] === 1;
    if (changed) equity *= 1 - cost;
    equity *= 1 + held * (close[t] / close[t - 1] - 1);
    if (held) investedBars++;
    curve.push(equity);
    peak = Math.max(peak, equity);
    maxDrawdown = Math.min(maxDrawdown, equity / peak - 1);
  }

  // Trade log from position changes (entry and exit at the signal bar's close).
  for (let t = 0; t < n; t++) {
    const prev = t === 0 ? 0 : pos[t - 1];
    if (pos[t] === 1 && prev === 0) {
      entry = { date: bars[t].date, price: close[t] };
      trades++;
    } else if (pos[t] === 0 && prev === 1 && entry) {
      closedTrades.push({ entryDate: entry.date, exitDate: bars[t].date, return: close[t] / entry.price - 1 - 2 * cost });
      entry = null;
    }
  }
  const wins = closedTrades.filter((t) => t.return > 0).length;
  const years = (n - 1) / 252;
  const totalReturn = equity - 1;
  const cagr = years > 0 ? equity ** (1 / years) - 1 : null;
  const buyHold = close[n - 1] / close[0] - 1;

  return {
    strategy,
    description: BACKTEST_STRATEGIES[strategy],
    from: bars[0].date,
    to: bars[n - 1].date,
    years: round(years, 2),
    totalReturn: round(totalReturn, 4),
    cagr: cagr === null ? null : round(cagr, 4),
    buyHoldReturn: round(buyHold, 4),
    maxDrawdown: round(maxDrawdown, 4),
    trades: trades,
    closedTrades: closedTrades.length,
    winRate: closedTrades.length ? round(wins / closedTrades.length, 3) : null,
    timeInMarket: round(investedBars / (n - 1), 3),
    currentSignal: pos[n - 1] === 1 ? 'IN (long)' : 'OUT (flat)',
    lastTrades: closedTrades.slice(-5),
    costBps,
  };
}

function round(v, d) {
  if (v === null || v === undefined || Number.isNaN(v)) return null;
  const p = 10 ** d;
  return Math.round(v * p) / p;
}
