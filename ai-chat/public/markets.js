// Markets tab: global dashboard, watchlist screen, single-stock analysis, backtests, strategy guide.
// Talks to /api/market/* and hands analysis prompts to the chat through window.aiChat.
(() => {
  const $ = (id) => document.getElementById(id);
  const root = $('markets');
  const tabChat = $('tabChat');
  const tabMarkets = $('tabMarkets');
  const main = document.querySelector('.main');

  let view = 'chat';
  let lastAnalysis = null;
  let lastGlobal = null;

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pct = (v) => (v === null || v === undefined ? '–' : `${(v * 100).toFixed(1)}%`);
  const num = (v, d = 2) => (v === null || v === undefined || Number.isNaN(v) ? '–' : Number(v).toFixed(d));
  const cls = (v) => (v === null || v === undefined ? '' : v > 0 ? 'pos' : v < 0 ? 'neg' : '');
  const mark = (v) => (v === true ? '<span class="ok">✔</span>' : v === false ? '<span class="no">✘</span>' : '<span class="na">–</span>');

  function settings() {
    const s = window.aiChat ? window.aiChat.getState() : {};
    return { provider: s.marketProvider || 'yahoo', apiKey: s.alphaVantageKey || '' };
  }

  async function api(path, body) {
    const res = await fetch(`/api/market${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  function setView(next) {
    view = next;
    main.classList.toggle('mode-markets', next === 'markets');
    tabChat.classList.toggle('active', next === 'chat');
    tabMarkets.classList.toggle('active', next === 'markets');
  }

  // ---------- Layout ----------
  function skeleton() {
    const prov = settings().provider === 'alphavantage'
      ? 'Alpha Vantage: fundamentals and news are available. Free plan allows about 25 calls a day, so keep watchlists short.'
      : 'Yahoo Finance: price data only, no fundamentals. Unofficial and may rate-limit; try again later if you see HTTP 429.';
    root.innerHTML = `
      <div class="card warn">
        <strong>Educational research tool. Not financial advice.</strong>
        Past performance does not predict future results. Verify data before acting.
        <div class="muted small" id="providerNote">${esc(prov)}</div>
      </div>

      <div class="card">
        <div class="row between">
          <h3>1. Global markets and sectors</h3>
          <button class="btn small primary" id="runGlobal">Refresh</button>
        </div>
        <div id="globalOut" class="muted">Click Refresh to load indices, dollar, oil, gold, yields, VIX and sector ETFs.</div>
      </div>

      <div class="card">
        <h3>2. Watchlist screen</h3>
        <p class="muted small">Ranks tickers by the Minervini trend template and relative strength. Use Yahoo symbols: NSE stocks end in .NS (e.g. RELIANCE.NS), US stocks have no suffix.</p>
        <textarea id="watchlist" rows="2" class="wide">AAPL, MSFT, NVDA, RELIANCE.NS, TCS.NS</textarea>
        <div class="row between">
          <label class="check"><input type="checkbox" id="useFund" checked /> Include fundamentals</label>
          <button class="btn small primary" id="runScreen">Screen</button>
        </div>
        <div id="screenOut"></div>
      </div>

      <div class="card">
        <h3>3. Analyze one stock</h3>
        <div class="row">
          <input id="symbol" class="field grow" placeholder="Ticker, e.g. NVDA or INFY.NS" />
          <button class="btn small primary" id="runAnalyze">Analyze</button>
        </div>
        <label class="check"><input type="checkbox" id="withNews" /> Include news (Alpha Vantage only)</label>
        <div id="analyzeOut"></div>
      </div>

      <div class="card">
        <h3>4. Strategy guide and selection checklist</h3>
        <div id="guideOut" class="muted">Loading…</div>
      </div>`;
    $('runGlobal').addEventListener('click', loadGlobal);
    $('runScreen').addEventListener('click', runScreen);
    $('runAnalyze').addEventListener('click', () => analyze($('symbol').value));
    $('symbol').addEventListener('keydown', (e) => { if (e.key === 'Enter') analyze($('symbol').value); });
    loadGuide();
  }

  // ---------- 1. Global ----------
  async function loadGlobal() {
    const out = $('globalOut');
    out.innerHTML = '<span class="muted">Loading (this takes a while)…</span>';
    try {
      const g = await api('/global', settings());
      lastGlobal = g;
      const rows = g.rows.map((r) => r.ok
        ? `<tr><td>${esc(r.name)}<div class="muted small">${esc(r.symbol)}</div></td>
            <td class="${cls(r.return1w)}">${pct(r.return1w)}</td>
            <td class="${cls(r.return1m)}">${pct(r.return1m)}</td>
            <td class="${cls(r.return3m)}">${pct(r.return3m)}</td>
            <td>${mark(r.aboveSma200)}</td><td>${num(r.rsi14, 0)}</td></tr>`
        : `<tr><td>${esc(r.name)}</td><td colspan="5" class="muted small">${esc(r.error)}</td></tr>`).join('');
      out.innerHTML = `
        <table><thead><tr><th>Market</th><th>1W</th><th>1M</th><th>3M</th><th>Above 200D</th><th>RSI</th></tr></thead><tbody>${rows}</tbody></table>
        <div class="grid2 top">
          <div><strong>Strongest sectors (3M):</strong> ${g.strongestSectors.map(esc).join(', ') || '–'}</div>
          <div><strong>Weakest sectors (3M):</strong> ${g.weakestSectors.map(esc).join(', ') || '–'}</div>
        </div>
        <ul class="notes">${g.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>`;
    } catch (err) {
      out.innerHTML = `<span class="err">${esc(err.message)}</span>`;
    }
  }

  // ---------- 2. Screen ----------
  async function runScreen() {
    const symbols = $('watchlist').value.split(/[,\s]+/).filter(Boolean);
    const out = $('screenOut');
    out.innerHTML = '<span class="muted">Screening…</span>';
    try {
      const { rows } = await api('/screen', { ...settings(), symbols, fundamentals: $('useFund').checked });
      const body = rows.map((r) => r.ok
        ? `<tr>
            <td><strong>${esc(r.symbol)}</strong></td>
            <td>${num(r.price)}</td>
            <td>${r.trendTemplateScore}/8</td>
            <td>${mark(r.strategies.weinstein_stage2.pass)}</td>
            <td>${mark(r.strategies.darvas_livermore_breakout.pass)}</td>
            <td>${mark(r.strategies.turtle_entry.pass)}</td>
            <td class="${cls(r.relativeStrength6m)}">${pct(r.relativeStrength6m)}</td>
            <td class="${cls(r.return1y)}">${pct(r.return1y)}</td>
            <td><button class="btn small" data-analyze="${esc(r.symbol)}">Open</button></td></tr>`
        : `<tr><td>${esc(r.symbol)}</td><td colspan="8" class="err small">${esc(r.error)}</td></tr>`).join('');
      out.innerHTML = `<div class="scroll"><table><thead><tr><th>Ticker</th><th>Price</th><th>Trend 8/8</th><th>Stage 2</th><th>Breakout</th><th>Turtle</th><th>RS 6M</th><th>1Y</th><th></th></tr></thead><tbody>${body}</tbody></table></div>
        <p class="muted small">Trend 8/8 = Minervini template. RS 6M = return minus benchmark return over 6 months.</p>`;
      out.querySelectorAll('[data-analyze]').forEach((b) => b.addEventListener('click', () => {
        $('symbol').value = b.dataset.analyze;
        analyze(b.dataset.analyze);
        $('symbol').scrollIntoView({ behavior: 'smooth' });
      }));
    } catch (err) {
      out.innerHTML = `<span class="err">${esc(err.message)}</span>`;
    }
  }

  // ---------- 3. Analyze ----------
  async function analyze(raw) {
    const symbol = String(raw || '').trim();
    const out = $('analyzeOut');
    if (!symbol) return;
    out.innerHTML = '<span class="muted">Loading data…</span>';
    try {
      const a = await api('/analyze', { ...settings(), symbol, news: $('withNews').checked });
      lastAnalysis = a;
      const k = (label, value) => `<div class="kpi"><div class="muted small">${label}</div><div>${value}</div></div>`;
      const strategies = Object.entries(a.strategies).map(([id, s]) => `
        <div class="strat">
          <div class="row between"><strong>${esc(s.name)}</strong> ${mark(s.pass)}</div>
          <pre class="small">${esc(s.detail)}</pre>
        </div>`).join('');
      const f = a.fundamentals;
      const fund = f ? `
        <div class="grid3">
          ${k('Sector', esc(f.sector || '–'))}${k('P/E', num(f.pe, 1))}${k('PEG', num(f.pegRatio))}
          ${k('P/B', num(f.priceToBook))}${k('ROE', pct(f.roe))}${k('Profit margin', pct(f.profitMargin))}
          ${k('EPS growth (qtr YoY)', pct(f.epsQuarterlyGrowth))}${k('Revenue growth (qtr YoY)', pct(f.revenueQuarterlyGrowth))}${k('Beta', num(f.beta))}
        </div>` : '<p class="muted small">No fundamentals for this provider. Choose Alpha Vantage in Settings to get them.</p>';
      const news = (a.news || []).length
        ? `<ul class="notes">${a.news.map((n) => `<li><a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.title)}</a> <span class="muted small">${esc(n.source || '')} · ${esc(n.sentiment || '')}</span></li>`).join('')}</ul>`
        : '';

      out.innerHTML = `
        <div class="muted small">${esc(a.symbol)} · as of ${esc(a.asOf)} · benchmark ${esc(a.benchmark)} · ${esc(a.currency || '')}</div>
        <div class="grid3">
          ${k('Price', num(a.price))}${k('1 day', pct(a.change1d))}${k('3 months', pct(a.return3m))}
          ${k('1 year', pct(a.return1y))}${k('From 52W high', pct(a.distanceFromHigh52))}${k('RS vs benchmark 6M', pct(a.relativeStrength6m))}
          ${k('RSI(14)', num(a.rsi14, 1))}${k('MACD histogram', num(a.macdHistogram, 3))}${k('ATR(14)', num(a.atr14))}
          ${k('Stop at 2×ATR', num(a.suggestedStop2Atr))}${k('Volume vs 20D avg', num(a.volumeRatio) + '×')}${k('50D / 200D avg', `${num(a.sma50, 1)} / ${num(a.sma200, 1)}`)}
        </div>
        <h4>Fundamentals</h4>${fund}
        <h4>Rule checks</h4>${strategies}
        <h4>News</h4>${news || '<p class="muted small">Not loaded. Tick "Include news" and use Alpha Vantage.</p>'}
        <h4>Backtest</h4>
        <div class="row wrap">
          <select id="btStrategy" class="field">
            <option value="golden_cross">50/200 crossover</option>
            <option value="turtle">Turtle 20/10</option>
            <option value="rsi_pullback">RSI pullback</option>
            <option value="buy_hold">Buy and hold</option>
          </select>
          <label class="small">Cost (bps) <input id="btCost" class="field small-input" type="number" value="10" min="0" max="100" /></label>
          <button class="btn small" id="runBt">Run backtest</button>
        </div>
        <div id="btOut"></div>
        <div class="row end top">
          <span class="muted small">Gives the AI this data and asks for a structured research view.</span>
          <button class="btn primary" id="askAi">Ask AI to analyze</button>
        </div>`;
      $('runBt').addEventListener('click', () => backtestRun(a.symbol));
      $('askAi').addEventListener('click', () => askAi(a));
    } catch (err) {
      out.innerHTML = `<span class="err">${esc(err.message)}</span>`;
    }
  }

  async function backtestRun(symbol) {
    const out = $('btOut');
    out.innerHTML = '<span class="muted">Running…</span>';
    try {
      const r = await api('/backtest', { ...settings(), symbol, strategy: $('btStrategy').value, costBps: Number($('btCost').value) });
      out.innerHTML = `
        <table><tbody>
          <tr><th>Period</th><td>${esc(r.from)} to ${esc(r.to)} (${num(r.years, 1)} years)</td></tr>
          <tr><th>Strategy return</th><td class="${cls(r.totalReturn)}">${pct(r.totalReturn)}</td></tr>
          <tr><th>Buy and hold</th><td class="${cls(r.buyHoldReturn)}">${pct(r.buyHoldReturn)}</td></tr>
          <tr><th>CAGR</th><td>${pct(r.cagr)}</td></tr>
          <tr><th>Max drawdown</th><td class="neg">${pct(r.maxDrawdown)}</td></tr>
          <tr><th>Trades / win rate</th><td>${r.trades} / ${pct(r.winRate)}</td></tr>
          <tr><th>Time in market</th><td>${pct(r.timeInMarket)}</td></tr>
          <tr><th>Current signal</th><td><strong>${esc(r.currentSignal)}</strong></td></tr>
        </tbody></table>
        <p class="muted small">Backtests ignore slippage, taxes and survivorship bias, and past results do not predict the future.</p>`;
    } catch (err) {
      out.innerHTML = `<span class="err">${esc(err.message)}</span>`;
    }
  }

  // Builds the research prompt and sends it to the chat, using the data already on screen.
  function askAi(a) {
    const slim = {
      symbol: a.symbol, asOf: a.asOf, currency: a.currency, benchmark: a.benchmark,
      price: a.price, return1m: a.return1m, return3m: a.return3m, return6m: a.return6m, return1y: a.return1y,
      relativeStrength6m: a.relativeStrength6m, high52: a.high52, low52: a.low52, distanceFromHigh52: a.distanceFromHigh52,
      sma50: a.sma50, sma150: a.sma150, sma200: a.sma200, rsi14: a.rsi14, macdHistogram: a.macdHistogram,
      atr14: a.atr14, suggestedStop2Atr: a.suggestedStop2Atr, volumeRatio: a.volumeRatio,
      fundamentals: a.fundamentals,
      rules: Object.fromEntries(Object.entries(a.strategies).map(([k, v]) => [k, v.pass])),
      news: (a.news || []).map((n) => ({ title: n.title, source: n.source, sentiment: n.sentiment })),
    };
    const global = lastGlobal ? {
      asOf: lastGlobal.asOf,
      markets: lastGlobal.rows.filter((r) => r.ok).map((r) => ({ name: r.name, return1m: r.return1m, return3m: r.return3m, aboveSma200: r.aboveSma200 })),
      strongestSectors: lastGlobal.strongestSectors, weakestSectors: lastGlobal.weakestSectors, notes: lastGlobal.notes,
    } : 'Not loaded. State that global context was not checked.';
    const prompt = [
      `Analyze ${a.symbol} as a research assistant. Use only the data below plus general knowledge, and say clearly what data is missing.`,
      'Do not guarantee returns and do not give personal financial advice. End with a research view, a confidence level, and what would change it.',
      '',
      'Structure your answer:',
      '1. Global and sector context (use the global data; say which sector the stock sits in and whether that sector is leading)',
      '2. Long-term fundamentals: growth, margins, returns on capital, cash flow vs profit, debt, moat, valuation vs history and peers',
      '3. Short-term technicals: trend stage, relative strength, entry idea, stop level and invalidation',
      '4. Demand: global demand and local demand for the business (say what you know and what needs checking)',
      '5. Bull case, bear case, and the top three risks',
      '6. Research view with confidence, and what to verify next (filings, results, news)',
      '',
      'Stock data (JSON):',
      '```json', JSON.stringify(slim, null, 2), '```',
      '',
      'Global market data (JSON):',
      '```json', typeof global === 'string' ? global : JSON.stringify(global, null, 2), '```',
    ].join('\n');
    setView('chat');
    window.aiChat.ask(prompt);
  }

  // ---------- 4. Guide ----------
  async function loadGuide() {
    const out = $('guideOut');
    try {
      const g = await api('/strategies');
      const cards = g.strategies.map((s) => `
        <details class="strat">
          <summary><strong>${esc(s.name)}</strong> <span class="muted small">· ${esc(s.who)} · ${esc(s.horizon)}</span></summary>
          <p>${esc(s.idea)}</p>
          <ul>${s.rules.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
        </details>`).join('');
      const sec = (title, items) => `<h4>${esc(title)}</h4><ul>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;
      const c = g.checklist;
      out.innerHTML = `
        <p class="muted small">${esc(g.disclaimer)}</p>
        ${cards}
        ${sec('Global context', c.global)}
        ${sec('Long-term fundamentals', c.longTermFundamentals)}
        ${sec('Short-term technicals', c.shortTermTechnicals)}
        ${sec('Local and global demand', c.localDemand)}
        ${sec('Risk rules', c.riskRules)}`;
    } catch (err) {
      out.innerHTML = `<span class="err">${esc(err.message)}</span>`;
    }
  }

  // ---------- Tabs ----------
  tabChat.addEventListener('click', () => setView('chat'));
  tabMarkets.addEventListener('click', () => {
    setView('markets');
    if (!root.dataset.built) {
      root.dataset.built = '1';
      skeleton();
    }
  });
  setView('chat');
})();
