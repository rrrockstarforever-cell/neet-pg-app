// Position sizing and trade-record statistics. Pure functions, no network.
// Long trades only. Amounts are in your account currency. Percentages are of total capital.

// How much to invest so that hitting the stop loses at most `riskPct` of total capital.
// Investment % = riskPct / stop distance %, e.g. a stop 5% below entry with 1% risk means 20% of capital.
export function sizePosition({ capital, riskPct = 1, entry, stop, maxPositionPct = null }) {
  if (!(capital > 0)) throw new Error('Enter your total capital.');
  if (!(riskPct > 0 && riskPct <= 100)) throw new Error('Risk per trade must be above 0% and at most 100%.');
  if (!(entry > 0)) throw new Error('Enter the entry price.');
  if (!(stop > 0)) throw new Error('Enter the stop-loss price.');
  if (!(stop < entry)) throw new Error('For a long trade the stop-loss must be below the entry price.');

  const riskAmount = (capital * riskPct) / 100;
  const perShareRisk = entry - stop;
  const stopDistancePct = (perShareRisk / entry) * 100;
  let qty = Math.floor(riskAmount / perShareRisk);
  let capped = false;

  if (maxPositionPct !== null && maxPositionPct > 0) {
    const maxInvest = (capital * maxPositionPct) / 100;
    const maxQty = Math.floor(maxInvest / entry);
    if (qty > maxQty) {
      qty = maxQty;
      capped = true;
    }
  }

  const invested = qty * entry;
  const actualRisk = qty * perShareRisk;
  return {
    qty,
    invested: round(invested),
    investedPct: round((invested / capital) * 100, 2),
    stopDistancePct: round(stopDistancePct, 2),
    riskAmount: round(riskAmount),
    actualRisk: round(actualRisk),
    actualRiskPct: round((actualRisk / capital) * 100, 3),
    idealInvestedPct: round(riskPct / stopDistancePct * 100, 2),
    capped,
    tooSmall: qty === 0,
  };
}

// Statistics over closed trades. Each trade: { symbol, entry, stop, exit, qty, date, fees? }.
// R is the profit or loss divided by the amount risked at entry (1R = the planned loss).
// Open trades (exit missing) are ignored.
export function tradeStats(trades, { capital = null, riskPct = 1 } = {}) {
  const closed = trades
    .filter((t) => t.exit !== null && t.exit !== undefined && t.exit !== '')
    .map((t) => {
      const fees = Number(t.fees) || 0;
      const pnl = (t.exit - t.entry) * t.qty - fees;
      const risk = (t.entry - t.stop) * t.qty;
      const r = risk > 0 ? pnl / risk : null;
      const riskOfCapitalPct = capital ? (risk / capital) * 100 : null;
      return { ...t, pnl: round(pnl), r: r === null ? null : round(r, 2), riskPct: riskOfCapitalPct === null ? null : round(riskOfCapitalPct, 3) };
    });

  const wins = closed.filter((t) => t.pnl > 0);
  const losses = closed.filter((t) => t.pnl < 0);
  const n = closed.length;
  const winRate = n ? wins.length / n : null;
  const avgWinR = wins.length ? avg(wins.map((t) => t.r)) : null;
  const avgLossR = losses.length ? avg(losses.map((t) => Math.abs(t.r))) : null;
  const grossWin = sum(wins.map((t) => t.pnl));
  const grossLoss = Math.abs(sum(losses.map((t) => t.pnl)));
  // Average result per trade, in R: win rate x average win - loss rate x average loss.
  const expectancyR = n ? round(winRate * (avgWinR ?? 0) - (1 - winRate) * (avgLossR ?? 0), 2) : null;

  return {
    closedTrades: n,
    openTrades: trades.length - n,
    wins: wins.length,
    losses: losses.length,
    winRatePct: winRate === null ? null : round(winRate * 100, 1),
    avgWinR: avgWinR === null ? null : round(avgWinR, 2),
    avgLossR: avgLossR === null ? null : round(avgLossR, 2),
    expectancyR,
    profitFactor: grossLoss > 0 ? round(grossWin / grossLoss, 2) : null,
    totalPnl: round(sum(closed.map((t) => t.pnl))),
    // Trades that risked more than the chosen percentage of capital (the rule you set).
    ruleBreaches: capital ? closed.filter((t) => t.riskPct > riskPct + 1e-9).length : null,
    trades: closed,
  };
}

function sum(xs) {
  return xs.reduce((s, x) => s + x, 0);
}
function avg(xs) {
  return xs.length ? sum(xs) / xs.length : 0;
}
function round(n, d = 2) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}
