// Stock analysis: technical snapshot, rule-based trader screens, watchlist screen, global dashboard.
//
// Every rule is an approximation of a published method. Thresholds are conventions, not
// validated edges. The output is information for research, not financial advice.

import { sma, rsi, atr, macd, bollinger, periodReturn, highestOver, lowestOver } from './indicators.js';
import { getDailyBars, getFundamentals, getNews } from './data.js';

export const GLOBAL_YAHOO = [
  { symbol: '^GSPC', name: 'S&P 500 (US)', group: 'index' },
  { symbol: '^NDX', name: 'Nasdaq 100 (US tech)', group: 'index' },
  { symbol: '^NSEI', name: 'Nifty 50 (India)', group: 'index' },
  { symbol: '^BSESN', name: 'Sensex (India)', group: 'index' },
  { symbol: '^N225', name: 'Nikkei 225 (Japan)', group: 'index' },
  { symbol: '^HSI', name: 'Hang Seng (Hong Kong)', group: 'index' },
  { symbol: '^FTSE', name: 'FTSE 100 (UK)', group: 'index' },
  { symbol: '^GDAXI', name: 'DAX (Germany)', group: 'index' },
  { symbol: 'DX-Y.NYB', name: 'US Dollar Index', group: 'macro' },
  { symbol: 'CL=F', name: 'Crude oil (WTI)', group: 'macro' },
  { symbol: 'GC=F', name: 'Gold', group: 'macro' },
  { symbol: '^TNX', name: 'US 10-year yield', group: 'macro' },
  { symbol: '^VIX', name: 'VIX (fear gauge)', group: 'macro' },
];

// ETF proxies work on both providers. Sector ETFs are US sectors.
export const SECTOR_ETFS = [
  { symbol: 'XLK', name: 'Technology', group: 'sector' },
  { symbol: 'XLF', name: 'Financials', group: 'sector' },
  { symbol: 'XLE', name: 'Energy', group: 'sector' },
  { symbol: 'XLV', name: 'Health care', group: 'sector' },
  { symbol: 'XLY', name: 'Consumer discretionary', group: 'sector' },
  { symbol: 'XLP', name: 'Consumer staples', group: 'sector' },
  { symbol: 'XLI', name: 'Industrials', group: 'sector' },
  { symbol: 'XLU', name: 'Utilities', group: 'sector' },
  { symbol: 'XLB', name: 'Materials', group: 'sector' },
  { symbol: 'XLRE', name: 'Real estate', group: 'sector' },
  { symbol: 'XLC', name: 'Communication services', group: 'sector' },
];

export const GLOBAL_ETF = [
  { symbol: 'SPY', name: 'S&P 500 ETF (US)', group: 'index' },
  { symbol: 'QQQ', name: 'Nasdaq 100 ETF (US tech)', group: 'index' },
  { symbol: 'INDA', name: 'India ETF', group: 'index' },
  { symbol: 'EWJ', name: 'Japan ETF', group: 'index' },
  { symbol: 'FXI', name: 'China ETF', group: 'index' },
  { symbol: 'EWU', name: 'UK ETF', group: 'index' },
  { symbol: 'EWG', name: 'Germany ETF', group: 'index' },
  { symbol: 'UUP', name: 'US Dollar ETF', group: 'macro' },
  { symbol: 'USO', name: 'Oil ETF', group: 'macro' },
  { symbol: 'GLD', name: 'Gold ETF', group: 'macro' },
  { symbol: 'TLT', name: '20+ year Treasuries ETF', group: 'macro' },
  ...SECTOR_ETFS,
];

// Strategy checks use a window of 21 bars (about one month) for "rising" tests.
const RISING = 21;

function series(bars) {
  return {
    dates: bars.map((b) => b.date),
    open: bars.map((b) => b.open),
    high: bars.map((b) => b.high),
    low: bars.map((b) => b.low),
    close: bars.map((b) => b.close),
    volume: bars.map((b) => b.volume),
  };
}

// Pick a benchmark that suits the symbol's market.
export function defaultBenchmark(symbol, provider) {
  if (/\.(NS|BO)$/i.test(symbol)) return provider === 'alphavantage' ? 'SPY' : '^NSEI';
  return provider === 'alphavantage' ? 'SPY' : '^GSPC';
}

// Computes indicators and rule results for one symbol. `bench` is an optional benchmark series.
export function computeSnapshot(bars, bench = null, fundamentals = null) {
  const s = series(bars);
  const n = s.close.length;
  const last = n - 1;
  if (n < 210) throw new Error(`Need about 210 trading days of history; got ${n}.`);

  const sma20 = sma(s.close, 20);
  const sma50 = sma(s.close, 50);
  const sma150 = sma(s.close, 150);
  const sma200 = sma(s.close, 200);
  const rsi14 = rsi(s.close, 14);
  const atr14 = atr(s.high, s.low, s.close, 14);
  const macd12 = macd(s.close);
  const bb = bollinger(s.close, 20, 2);
  const volAvg20 = sma(s.volume, 20);

  const price = s.close[last];
  const high52 = highestOver(s.high, n - 252, n);
  const low52 = lowestOver(s.low, n - 252, n);
  const ret6m = periodReturn(s.close, 126);
  const benchRet6m = bench ? periodReturn(bench.close, 126) : null;
  const rs6m = ret6m !== null && benchRet6m !== null ? ret6m - benchRet6m : null;
  const volRatio = volAvg20[last - 1] ? s.volume[last] / volAvg20[last - 1] : null;

  const f = fundamentals || {};
  const strategies = {
    minervini_trend_template: trendTemplate({ price, sma50, sma150, sma200, high52, low52, rs6m, last }),
    weinstein_stage2: {
      name: 'Weinstein Stage 2 (advancing phase)',
      pass: price > sma150[last] && sma150[last] > sma150[last - RISING],
      detail: 'Price above the 150-day (about 30-week) average, and that average rising.',
    },
    darvas_livermore_breakout: breakout({ s, last, volRatio }),
    turtle_entry: {
      name: 'Turtle entry (20-day high breakout)',
      pass: price > highestOver(s.high, last - 20, last),
      detail: `Close vs prior 20-day high ${highestOver(s.high, last - 20, last).toFixed(2)}. Exit level (10-day low) ${lowestOver(s.low, last - 10, last).toFixed(2)}.`,
    },
    golden_cross_trend: {
      name: 'Trend: 50-day above 200-day and rising',
      pass: sma50[last] > sma200[last] && sma50[last] > sma50[last - RISING],
      detail: 'Medium-term uptrend confirmed by moving averages.',
    },
    rsi_pullback: {
      name: 'Pullback in uptrend (RSI below 35, price above 200-day)',
      pass: rsi14[last] < 35 && price > sma200[last],
      detail: `RSI(14) ${rsi14[last].toFixed(1)}.`,
    },
    buffett_quality: fundamentalRule('Buffett-style quality', f, (x) =>
      x.roe != null && x.profitMargin != null && x.pe != null
        ? x.roe >= 0.15 && x.profitMargin >= 0.1 && x.pe > 0 && x.pe <= 25
        : null,
      'ROE at least 15%, profit margin at least 10%, P/E between 0 and 25.'),
    graham_value: fundamentalRule('Graham-style value', f, (x) =>
      x.pe != null && x.priceToBook != null ? x.pe > 0 && x.pe <= 15 && x.priceToBook <= 1.5 : null,
      'P/E at most 15 and price-to-book at most 1.5.'),
    lynch_garp: fundamentalRule('Lynch-style growth at a reasonable price', f, (x) =>
      x.pegRatio != null ? x.pegRatio > 0 && x.pegRatio < 1 : null,
      'PEG ratio below 1 (P/E divided by earnings growth).'),
    oneil_canslim_style: fundamentalRule('O\'Neil CAN SLIM-style (growth plus leadership)', f, (x) =>
      x.epsQuarterlyGrowth != null && rs6m !== null
        ? x.epsQuarterlyGrowth >= 0.25 && price >= 0.85 * high52 && rs6m > 0
        : null,
      'Quarterly EPS growth at least 25%, within 15% of the 52-week high, outperforming the benchmark.'),
  };

  const tt = strategies.minervini_trend_template;
  const technicalPasses = ['weinstein_stage2', 'golden_cross_trend', 'darvas_livermore_breakout', 'turtle_entry', 'rsi_pullback']
    .filter((k) => strategies[k].pass === true).length;

  const stopAtr = atr14[last] ? price - 2 * atr14[last] : null;

  return {
    asOf: s.dates[last],
    price,
    change1d: periodReturn(s.close, 1),
    return1m: periodReturn(s.close, 21),
    return3m: periodReturn(s.close, 63),
    return6m: ret6m,
    return1y: periodReturn(s.close, 252),
    relativeStrength6m: rs6m,
    high52,
    low52,
    distanceFromHigh52: high52 ? price / high52 - 1 : null,
    sma20: sma20[last],
    sma50: sma50[last],
    sma150: sma150[last],
    sma200: sma200[last],
    rsi14: rsi14[last],
    macdHistogram: macd12.hist[last],
    bollingerUpper: bb.upper[last],
    bollingerLower: bb.lower[last],
    atr14: atr14[last],
    volumeRatio: volRatio,
    suggestedStop2Atr: stopAtr,
    trendTemplateScore: tt.score,
    technicalPassCount: technicalPasses,
    strategies,
    fundamentals: fundamentals || null,
  };
}

function trendTemplate({ price, sma50, sma150, sma200, high52, low52, rs6m, last }) {
  const checks = [
    ['Price above 150-day and 200-day averages', price > sma150[last] && price > sma200[last]],
    ['150-day average above 200-day average', sma150[last] > sma200[last]],
    ['200-day average rising for about a month', sma200[last] > sma200[last - RISING]],
    ['50-day average above 150-day and 200-day', sma50[last] > sma150[last] && sma50[last] > sma200[last]],
    ['Price above 50-day average', price > sma50[last]],
    ['At least 30% above 52-week low', price >= 1.3 * low52],
    ['Within 25% of 52-week high', price >= 0.75 * high52],
    ['Outperforming benchmark over 6 months', rs6m !== null && rs6m > 0],
  ];
  const score = checks.filter(([, ok]) => ok).length;
  return {
    name: 'Minervini Trend Template (8 checks)',
    pass: score === 8,
    score,
    detail: checks.map(([label, ok]) => `${ok ? 'PASS' : 'fail'}: ${label}`).join('\n'),
  };
}

function breakout({ s, last, volRatio }) {
  const prior = highestOver(s.high, last - 20, last);
  const pass = s.close[last] > prior && volRatio !== null && volRatio >= 1.5;
  return {
    name: 'Darvas / Livermore breakout on volume',
    pass,
    detail: `Close vs 20-day box top ${prior.toFixed(2)}; volume ${volRatio ? volRatio.toFixed(2) : 'n/a'}x average (needs 1.5x).`,
  };
}

function fundamentalRule(name, f, test, rule) {
  const pass = test(f);
  return {
    name,
    pass,
    detail: pass === null ? `Needs fundamentals (Alpha Vantage). Rule: ${rule}` : `Rule: ${rule}`,
  };
}

export async function analyzeSymbol(symbol, { provider = 'yahoo', apiKey = '', benchmark, withFundamentals = true, withNews = false } = {}) {
  const bench = benchmark || defaultBenchmark(symbol, provider);
  const [stock, benchBars, fundamentals, news] = await Promise.all([
    getDailyBars(symbol, { provider, apiKey }),
    getDailyBars(bench, { provider, apiKey }).catch(() => null),
    withFundamentals ? getFundamentals(symbol, { provider, apiKey }).catch(() => null) : Promise.resolve(null),
    withNews ? getNews(symbol, { provider, apiKey }).catch(() => []) : Promise.resolve([]),
  ]);
  const snap = computeSnapshot(stock.bars, benchBars ? series(benchBars.bars) : null, fundamentals);
  return { symbol, benchmark: bench, currency: stock.currency, ...snap, news };
}

// Screens several symbols and ranks them. Failures are reported per symbol, not fatal.
export async function screenSymbols(symbols, opts = {}) {
  const rows = [];
  for (const symbol of symbols) {
    try {
      const a = await analyzeSymbol(symbol, opts);
      rows.push({ symbol, ok: true, ...a });
    } catch (err) {
      rows.push({ symbol, ok: false, error: err.message });
      if (/limit reached/i.test(err.message)) break; // no point continuing when rate-limited
    }
  }
  const good = rows.filter((r) => r.ok).sort((a, b) =>
    (b.trendTemplateScore - a.trendTemplateScore) || ((b.relativeStrength6m ?? -9) - (a.relativeStrength6m ?? -9)));
  const bad = rows.filter((r) => !r.ok);
  return [...good, ...bad];
}

// Global dashboard: market indices, macro proxies and sector ETFs with trend and returns.
export async function globalDashboard({ provider = 'yahoo', apiKey = '', list } = {}) {
  const universe = list || (provider === 'alphavantage' ? GLOBAL_ETF : [...GLOBAL_YAHOO, ...SECTOR_ETFS]);
  const rows = [];
  for (const item of universe) {
    try {
      const { bars } = await getDailyBars(item.symbol, { provider, apiKey });
      const s = series(bars);
      const n = s.close.length;
      const sma200 = sma(s.close, 200)[n - 1];
      rows.push({
        ...item,
        ok: true,
        price: s.close[n - 1],
        return1w: periodReturn(s.close, 5),
        return1m: periodReturn(s.close, 21),
        return3m: periodReturn(s.close, 63),
        aboveSma200: sma200 !== null ? s.close[n - 1] > sma200 : null,
        rsi14: rsi(s.close, 14)[n - 1],
      });
    } catch (err) {
      rows.push({ ...item, ok: false, error: err.message });
      if (/limit reached/i.test(err.message)) break;
    }
  }
  const sectors = rows.filter((r) => r.group === 'sector' && r.ok).sort((a, b) => (b.return3m ?? -9) - (a.return3m ?? -9));
  const find = (sym) => rows.find((r) => r.symbol === sym && r.ok);
  const vix = find('^VIX') || find('VIXY');
  const dxy = find('DX-Y.NYB') || find('UUP');
  const oil = find('CL=F') || find('USO');
  const gold = find('GC=F') || find('GLD');
  const notes = [];
  if (vix) notes.push(`Volatility gauge at ${vix.price.toFixed(2)} (${vix.price >= 25 ? 'high stress' : vix.price >= 18 ? 'elevated' : 'calm'}).`);
  if (dxy && dxy.return1m !== null) notes.push(`Dollar index 1-month change ${(dxy.return1m * 100).toFixed(1)}% (a rising dollar often pressures emerging markets and commodities).`);
  if (oil && oil.return1m !== null) notes.push(`Oil 1-month change ${(oil.return1m * 100).toFixed(1)}%.`);
  if (gold && gold.return1m !== null) notes.push(`Gold 1-month change ${(gold.return1m * 100).toFixed(1)}% (strength can signal risk-off demand).`);
  return {
    asOf: new Date().toISOString().slice(0, 10),
    provider,
    rows,
    strongestSectors: sectors.slice(0, 3).map((r) => r.name),
    weakestSectors: sectors.slice(-3).reverse().map((r) => r.name),
    notes,
  };
}
