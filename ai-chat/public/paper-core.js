// Paper trading logic. Pure functions, no network, no real money.
// Used by the Markets tab in the browser and tested with `npm test`.
// Prices are whatever the caller passes in (for example the last close).
// Orders fill at the given price, plus a cost in basis points on the traded value.

export const DEFAULT_CASH = 1000000; // play money, in the account's currency

export function newPortfolio(cash = DEFAULT_CASH) {
  return { cash, positions: [], trades: [] };
}

const clone = (pf) => JSON.parse(JSON.stringify(pf));
const round = (n) => Math.round(n * 100) / 100;

function fail(msg) {
  throw new Error(msg);
}

// Buys `qty` shares at `price`. Adds to an existing position (average cost) and can set stop and target.
export function buy(pf, { symbol, qty, price, stop = null, target = null, time = new Date().toISOString(), costBps = 10 }) {
  const next = clone(pf);
  if (!symbol) fail('Enter a symbol.');
  if (!Number.isInteger(qty) || qty <= 0) fail('Quantity must be a whole number above 0.');
  if (!(price > 0)) fail('Price must be above 0.');
  if (stop !== null && !(stop > 0 && stop < price)) fail('Stop-loss must be below the price.');
  if (target !== null && !(target > price)) fail('Target must be above the price.');

  const value = qty * price;
  const cost = value * (costBps / 10000);
  const total = value + cost;
  if (total > next.cash) fail(`Not enough paper cash. Needed ${round(total)}, have ${round(next.cash)}.`);

  let pos = next.positions.find((p) => p.symbol === symbol);
  if (!pos) {
    pos = { symbol, qty: 0, basis: 0, stop: null, target: null, openedAt: time };
    next.positions.push(pos);
  }
  pos.qty += qty;
  pos.basis += total;
  if (stop !== null) pos.stop = stop;
  if (target !== null) pos.target = target;

  next.cash -= total;
  next.trades.push({ time, side: 'BUY', symbol, qty, price, cost: round(cost), reason: 'manual' });
  return next;
}

// Sells `qty` shares (default: all) at `price`. Returns the realized profit or loss.
export function sell(pf, { symbol, qty = null, price, time = new Date().toISOString(), costBps = 10, reason = 'manual' }) {
  const next = clone(pf);
  const pos = next.positions.find((p) => p.symbol === symbol);
  if (!pos) fail(`No open paper position in ${symbol}.`);
  const sellQty = qty === null ? pos.qty : qty;
  if (!Number.isInteger(sellQty) || sellQty <= 0 || sellQty > pos.qty) fail(`Quantity must be between 1 and ${pos.qty}.`);
  if (!(price > 0)) fail('Price must be above 0.');

  const value = sellQty * price;
  const cost = value * (costBps / 10000);
  const proceeds = value - cost;
  const costBasis = (pos.basis / pos.qty) * sellQty;
  const realized = proceeds - costBasis;

  pos.basis -= costBasis;
  pos.qty -= sellQty;
  next.cash += proceeds;
  next.trades.push({ time, side: 'SELL', symbol, qty: sellQty, price, cost: round(cost), realized: round(realized), reason });
  if (pos.qty === 0) next.positions = next.positions.filter((p) => p.symbol !== symbol);
  return { portfolio: next, realized: round(realized) };
}

// Checks stops and targets against current prices. A closed position fills at the current price,
// so a gap below the stop fills below the stop. That is how a real stop order behaves.
export function checkExits(pf, prices, time = new Date().toISOString(), costBps = 10) {
  let current = clone(pf);
  const closed = [];
  for (const pos of [...current.positions]) {
    const price = prices[pos.symbol];
    if (!(price > 0)) continue;
    let reason = null;
    if (pos.stop !== null && price <= pos.stop) reason = 'stop';
    else if (pos.target !== null && price >= pos.target) reason = 'target';
    if (!reason) continue;
    const res = sell(current, { symbol: pos.symbol, price, time, costBps, reason });
    current = res.portfolio;
    closed.push({ symbol: pos.symbol, price, reason, realized: res.realized });
  }
  return { portfolio: current, closed };
}

// Current value, unrealized profit or loss per position, and total equity.
export function valuation(pf, prices) {
  const rows = pf.positions.map((p) => {
    const price = prices[p.symbol] ?? null;
    const value = price === null ? null : p.qty * price;
    const unrealized = value === null ? null : value - p.basis;
    return {
      symbol: p.symbol,
      qty: p.qty,
      avgCost: round(p.basis / p.qty),
      price,
      value: value === null ? null : round(value),
      unrealized: unrealized === null ? null : round(unrealized),
      unrealizedPct: unrealized === null ? null : round((unrealized / p.basis) * 100),
      stop: p.stop,
      target: p.target,
    };
  });
  const invested = rows.reduce((s, r) => s + (r.value ?? 0), 0);
  return {
    cash: round(pf.cash),
    invested: round(invested),
    equity: round(pf.cash + invested),
    rows,
  };
}
