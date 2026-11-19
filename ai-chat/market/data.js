// Market data providers.
//   yahoo         - Yahoo Finance chart endpoint. No key. Unofficial and rate-limited.
//                   Price history only (no fundamentals or news).
//   alphavantage  - Alpha Vantage. Needs a free API key. Price history, fundamentals (OVERVIEW)
//                   and news sentiment. Free tier allows about 25 requests a day.
//
// Base URLs can be overridden with env vars so tests can point at a local mock server.

const yahooBase = () => process.env.YAHOO_BASE_URL || 'https://query1.finance.yahoo.com';
const avBase = () => process.env.ALPHAVANTAGE_BASE_URL || 'https://www.alphavantage.co';
const UA = 'Mozilla/5.0 (compatible; ai-chat/1.0)';

const HISTORY_TTL_MS = 15 * 60 * 1000;
const OVERVIEW_TTL_MS = 60 * 60 * 1000;
const NEWS_TTL_MS = 30 * 60 * 1000;
const cache = new Map();

function cached(key, ttl, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return Promise.resolve(hit.value);
  return fn().then((value) => {
    cache.set(key, { at: Date.now(), value });
    return value;
  });
}

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function resolveKey(provider, apiKey) {
  if (provider !== 'alphavantage') return '';
  return (apiKey && apiKey.trim()) || process.env.ALPHAVANTAGE_API_KEY || '';
}

// Returns { symbol, currency, bars: [{date, open, high, low, close, volume}] } oldest first.
export function getDailyBars(symbol, { provider = 'yahoo', apiKey = '' } = {}) {
  const key = `${provider}|${symbol}`;
  return cached(`bars|${key}`, HISTORY_TTL_MS, async () => {
    if (provider === 'alphavantage') return avBars(symbol, apiKey);
    return yahooBars(symbol);
  });
}

async function yahooBars(symbol) {
  const url = `${yahooBase()}/v8/finance/chart/${encodeURIComponent(symbol)}?range=5y&interval=1d`;
  const json = await getJson(url);
  const result = json?.chart?.result?.[0];
  if (!result || !result.timestamp) {
    throw new Error(`Yahoo returned no data for ${symbol}${json?.chart?.error ? `: ${json.chart.error.description}` : ''}`);
  }
  const q = result.indicators?.quote?.[0] || {};
  const bars = [];
  result.timestamp.forEach((ts, i) => {
    const close = q.close?.[i];
    const open = q.open?.[i];
    const high = q.high?.[i];
    const low = q.low?.[i];
    if ([open, high, low, close].some((v) => v === null || v === undefined || Number.isNaN(v))) return;
    bars.push({
      date: new Date(ts * 1000).toISOString().slice(0, 10),
      open,
      high,
      low,
      close,
      volume: q.volume?.[i] ?? 0,
    });
  });
  return { symbol, currency: result.meta?.currency || '', bars };
}

async function avBars(symbol, apiKey) {
  const key = resolveKey('alphavantage', apiKey);
  if (!key) throw new Error('Alpha Vantage needs an API key (Settings, or ALPHAVANTAGE_API_KEY on the server).');
  const url = `${avBase()}/query?function=TIME_SERIES_DAILY&outputsize=full&symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(key)}`;
  const json = await getJson(url);
  avCheck(json, symbol);
  const series = json['Time Series (Daily)'];
  if (!series) throw new Error(`Alpha Vantage returned no price data for ${symbol}.`);
  const bars = Object.keys(series)
    .sort()
    .map((date) => {
      const d = series[date];
      return {
        date,
        open: Number(d['1. open']),
        high: Number(d['2. high']),
        low: Number(d['3. low']),
        close: Number(d['4. close']),
        volume: Number(d['5. volume']),
      };
    });
  return { symbol, currency: '', bars };
}

// Alpha Vantage reports errors and rate limits inside a 200 response.
function avCheck(json, symbol) {
  if (json['Error Message']) throw new Error(`Alpha Vantage: unknown symbol ${symbol}.`);
  const msg = json.Note || json.Information;
  if (msg) throw new Error(`Alpha Vantage limit reached: ${msg}`);
}

// Fundamentals. Returns null when the provider has none (Yahoo here).
export function getFundamentals(symbol, { provider = 'yahoo', apiKey = '' } = {}) {
  if (provider !== 'alphavantage') return Promise.resolve(null);
  return cached(`overview|alphavantage|${symbol}`, OVERVIEW_TTL_MS, async () => {
    const key = resolveKey(provider, apiKey);
    if (!key) return null;
    const url = `${avBase()}/query?function=OVERVIEW&symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(key)}`;
    const o = await getJson(url);
    avCheck(o, symbol);
    if (!o.Symbol) return null;
    const num = (v) => (v === undefined || v === 'None' || v === '-' || v === '' ? null : Number(v));
    return {
      name: o.Name || symbol,
      sector: o.Sector || null,
      industry: o.Industry || null,
      marketCap: num(o.MarketCapitalization),
      pe: num(o.PERatio),
      pegRatio: num(o.PEGRatio),
      priceToBook: num(o.PriceToBookRatio),
      roe: num(o.ReturnOnEquityTTM),
      profitMargin: num(o.ProfitMargin),
      epsQuarterlyGrowth: num(o.QuarterlyEarningsGrowthYOY),
      revenueQuarterlyGrowth: num(o.QuarterlyRevenueGrowthYOY),
      dividendYield: num(o.DividendYield),
      beta: num(o.Beta),
      eps: num(o.EPS),
    };
  });
}

// Recent news with sentiment. Alpha Vantage only.
export function getNews(symbol, { provider = 'yahoo', apiKey = '' } = {}, limit = 5) {
  if (provider !== 'alphavantage') return Promise.resolve([]);
  return cached(`news|alphavantage|${symbol}`, NEWS_TTL_MS, async () => {
    const key = resolveKey(provider, apiKey);
    if (!key) return [];
    const url = `${avBase()}/query?function=NEWS_SENTIMENT&tickers=${encodeURIComponent(symbol)}&limit=${limit}&apikey=${encodeURIComponent(key)}`;
    const j = await getJson(url);
    avCheck(j, symbol);
    return (j.feed || []).slice(0, limit).map((n) => ({
      title: n.title,
      url: n.url,
      source: n.source,
      published: n.time_published,
      sentiment: n.overall_sentiment_label,
    }));
  });
}
