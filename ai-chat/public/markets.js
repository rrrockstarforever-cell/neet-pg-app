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
        <h3>4. Paper trading (simulated, no real money)</h3>
        <p class="muted small">Practise a rule before you risk money. Orders fill at the latest price from the data source. Stops and targets are checked on each refresh. Saved in this browser only.</p>
        <div class="grid2">
          <input id="pSymbol" class="field" placeholder="Ticker, e.g. INFY.NS" />
          <input id="pQty" class="field" type="number" min="1" step="1" placeholder="Quantity" />
          <input id="pStop" class="field" type="number" min="0" step="0.01" placeholder="Stop-loss (optional)" />
          <input id="pTarget" class="field" type="number" min="0" step="0.01" placeholder="Target (optional)" />
        </div>
        <div class="row between wrap">
          <button class="btn small primary" id="pBuy">Simulate buy</button>
          <div class="row wrap">
            <select id="pInterval" class="field" title="Automatic refresh">
              <option value="0">Refresh: off</option>
              <option value="60">Every 1 min</option>
              <option value="300">Every 5 min</option>
            </select>
            <button class="btn small" id="pRefresh">Refresh prices</button>
            <button class="btn small ghost" id="pReset">Reset</button>
          </div>
        </div>
        <div id="pMsg"></div>
        <div id="paperOut"></div>
        <p class="muted small">Refresh uses the same data source as the rest of this tab. Yahoo rate-limits, so intervals below one minute are not offered. For true second-by-second prices you need a broker's live feed.</p>
      </div>

      <div class="card">
        <h3>Position size and trade record</h3>
        <p class="muted small">Set how much of your total capital you may lose on one trade. The calculator shows how many shares to buy and how much of your capital that means. The record tracks your win rate and results.</p>
        <div class="grid3">
          <label class="label">Total capital<input id="sCapital" class="field" type="number" min="0" step="1000" placeholder="e.g. 500000" /></label>
          <label class="label">Max loss per trade (%)<input id="sRisk" class="field" type="number" min="0.1" max="100" step="0.1" value="1" /></label>
          <label class="label">Max position (% of capital, optional)<input id="sMax" class="field" type="number" min="0" max="100" step="1" placeholder="e.g. 25" /></label>
          <label class="label">Entry price<input id="sEntry" class="field" type="number" min="0" step="0.01" /></label>
          <label class="label">Stop-loss price<input id="sStop" class="field" type="number" min="0" step="0.01" /></label>
        </div>
        <div class="row between wrap">
          <button class="btn small primary" id="sCalc">Calculate</button>
          <span class="muted small" id="sFormula"></span>
        </div>
        <div id="sOut"></div>

        <h4>Trade record</h4>
        <div class="grid3">
          <input id="jSymbol" class="field" placeholder="Ticker" />
          <input id="jDate" class="field" type="date" aria-label="Entry date" />
          <input id="jQty" class="field" type="number" min="1" step="1" placeholder="Shares" />
          <input id="jEntry" class="field" type="number" min="0" step="0.01" placeholder="Entry price" />
          <input id="jStop" class="field" type="number" min="0" step="0.01" placeholder="Stop-loss" />
          <input id="jExit" class="field" type="number" min="0" step="0.01" placeholder="Exit price (blank if still open)" />
          <input id="jFees" class="field" type="number" min="0" step="0.01" placeholder="Fees and taxes (optional)" />
        </div>
        <div class="row between wrap">
          <button class="btn small primary" id="jSave">Save trade</button>
          <span class="muted small" id="jMsg"></span>
        </div>
        <div id="jOut"></div>
      </div>

      <div class="card">
        <h3>5. Strategy guide, famous investors and selection checklist</h3>
        <div id="guideOut" class="muted">Loading…</div>
      </div>`;
    $('runGlobal').addEventListener('click', loadGlobal);
    $('pBuy').addEventListener('click', paperBuy);
    $('pRefresh').addEventListener('click', () => refreshPaper());
    $('pReset').addEventListener('click', paperReset);
    $('pInterval').addEventListener('change', setPaperTimer);
    $('sCalc').addEventListener('click', calcSize);
    $('jSave').addEventListener('click', saveJournal);
    $('jOut').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-del]');
      if (btn) deleteJournal(Number(btn.dataset.del));
    });
    initSizing();
    $('paperOut').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-sell]');
      if (btn) paperSell(btn.dataset.sell);
    });
    initPaper();
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

  // ---------- 4. Paper trading ----------
  const PAPER_KEY = 'ai-chat-paper-v1';
  let paperLib = null;
  let paperTimer = null;

  async function lib() {
    paperLib = paperLib || (await import('/paper-core.js'));
    return paperLib;
  }

  function storedPaper() {
    try {
      const raw = localStorage.getItem(PAPER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function storePaper(pf) {
    try {
      localStorage.setItem(PAPER_KEY, JSON.stringify(pf));
    } catch {
      paperMsg('Browser storage is full or blocked, so paper trades were not saved.', 'err');
    }
  }

  async function currentPaper() {
    const L = await lib();
    return storedPaper() || L.newPortfolio();
  }

  function paperMsg(text, cls = 'muted') {
    $('pMsg').innerHTML = `<span class="${cls}">${esc(text)}</span>`;
  }

  async function currentPrice(symbol) {
    const a = await api('/analyze', { ...settings(), symbol, news: false, fundamentals: false });
    return a.price;
  }

  function renderPaper(L, pf, prices) {
    const v = L.valuation(pf, prices);
    const summary = `
      <div class="grid3">
        <div class="kpi"><div class="muted small">Equity</div><div>${num(v.equity)}</div></div>
        <div class="kpi"><div class="muted small">Cash</div><div>${num(v.cash)}</div></div>
        <div class="kpi"><div class="muted small">Invested</div><div>${num(v.invested)}</div></div>
      </div>`;
    const rows = v.rows.map((r) => `
      <tr>
        <td>${esc(r.symbol)}</td>
        <td>${r.qty}</td>
        <td>${num(r.avgCost)}</td>
        <td>${num(r.price)}</td>
        <td class="${cls(r.unrealized)}">${num(r.unrealized)} (${num(r.unrealizedPct, 1)}%)</td>
        <td>${r.stop ?? '–'}</td>
        <td>${r.target ?? '–'}</td>
        <td><button class="btn small" data-sell="${esc(r.symbol)}">Sell all</button></td>
      </tr>`).join('');
    const positions = v.rows.length
      ? `<div class="scroll"><table><thead><tr><th>Ticker</th><th>Qty</th><th>Avg cost</th><th>Price</th><th>P&amp;L</th><th>Stop</th><th>Target</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
      : '<p class="muted small">No open paper positions.</p>';
    const log = pf.trades.slice(-10).reverse().map((t) => `
      <tr>
        <td class="small">${esc(new Date(t.time).toLocaleString())}</td>
        <td>${esc(t.side)}</td>
        <td>${esc(t.symbol)}</td>
        <td>${t.qty}</td>
        <td>${num(t.price)}</td>
        <td class="${cls(t.realized)}">${t.realized === undefined ? '–' : num(t.realized)}</td>
        <td>${esc(t.reason)}</td>
      </tr>`).join('');
    const trades = pf.trades.length
      ? `<h4>Recent trades</h4><div class="scroll"><table><thead><tr><th>Time</th><th>Side</th><th>Ticker</th><th>Qty</th><th>Price</th><th>Realized</th><th>Reason</th></tr></thead><tbody>${log}</tbody></table></div>`
      : '';
    $('paperOut').innerHTML = summary + positions + trades;
  }

  async function initPaper() {
    const L = await lib();
    renderPaper(L, storedPaper() || L.newPortfolio(), {});
  }

  async function paperBuy() {
    const L = await lib();
    const symbol = $('pSymbol').value.trim().toUpperCase();
    const qty = Number($('pQty').value);
    const stopRaw = $('pStop').value;
    const targetRaw = $('pTarget').value;
    if (!symbol) return paperMsg('Enter a ticker.', 'err');
    paperMsg('Getting the latest price…');
    try {
      const price = await currentPrice(symbol);
      const pf = L.buy(await currentPaper(), {
        symbol,
        qty,
        price,
        stop: stopRaw ? Number(stopRaw) : null,
        target: targetRaw ? Number(targetRaw) : null,
        time: new Date().toISOString(),
      });
      storePaper(pf);
      renderPaper(L, pf, { [symbol]: price });
      paperMsg(`Simulated buy: ${qty} ${symbol} at ${num(price)}.`, 'ok');
    } catch (err) {
      paperMsg(err.message, 'err');
    }
  }

  async function paperSell(symbol) {
    const L = await lib();
    try {
      const price = await currentPrice(symbol);
      const res = L.sell(await currentPaper(), { symbol, price, time: new Date().toISOString() });
      storePaper(res.portfolio);
      renderPaper(L, res.portfolio, {});
      paperMsg(`Simulated sell of ${symbol} at ${num(price)}. Realized P&L: ${num(res.realized)}.`, res.realized >= 0 ? 'ok' : 'err');
    } catch (err) {
      paperMsg(err.message, 'err');
    }
  }

  // Prices every open position one at a time (to stay under rate limits), then checks stops and targets.
  async function refreshPaper() {
    const L = await lib();
    let pf = await currentPaper();
    const prices = {};
    const errors = [];
    for (const p of pf.positions) {
      try {
        prices[p.symbol] = await currentPrice(p.symbol);
      } catch (err) {
        errors.push(`${p.symbol}: ${err.message}`);
      }
    }
    const res = L.checkExits(pf, prices, new Date().toISOString());
    pf = res.portfolio;
    storePaper(pf);
    renderPaper(L, pf, prices);
    const notes = res.closed.map((c) => `${c.symbol} closed on ${c.reason} at ${num(c.price)} (P&L ${num(c.realized)})`);
    if (errors.length) notes.push(`Could not price: ${errors.join('; ')}`);
    paperMsg(notes.length ? notes.join(' · ') : `Prices updated at ${new Date().toLocaleTimeString()}.`, errors.length ? 'err' : 'ok');
  }

  function setPaperTimer() {
    clearInterval(paperTimer);
    const secs = Number($('pInterval').value);
    if (secs > 0) paperTimer = setInterval(() => refreshPaper().catch(() => {}), secs * 1000);
  }

  async function paperReset() {
    if (!confirm('Reset paper trading? All simulated positions and history are deleted.')) return;
    const L = await lib();
    storePaper(L.newPortfolio());
    renderPaper(L, L.newPortfolio(), {});
    paperMsg('Paper account reset.');
  }

  // ---------- Position size and trade record ----------
  const CAPITAL_KEY = 'ai-chat-capital-v1';
  const JOURNAL_KEY = 'ai-chat-journal-v1';
  let sizingLib = null;
  const sizingLibP = () => (sizingLib ||= import('/sizing-core.js'));

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  function initSizing() {
    const saved = readJson(CAPITAL_KEY, null);
    if (saved?.capital) $('sCapital').value = saved.capital;
    $('sCapital').addEventListener('change', () => {
      const capital = Number($('sCapital').value);
      if (capital > 0) writeJson(CAPITAL_KEY, { capital });
    });
    $('jDate').value = new Date().toISOString().slice(0, 10);
    renderJournal();
  }

  async function calcSize() {
    const S = await sizingLibP();
    const capital = Number($('sCapital').value);
    const riskRaw = Number($('sRisk').value) || 1;
    const maxRaw = Number($('sMax').value);
    try {
      const r = S.sizePosition({
        capital,
        riskPct: riskRaw,
        entry: Number($('sEntry').value),
        stop: Number($('sStop').value),
        maxPositionPct: maxRaw > 0 ? maxRaw : null,
      });
      if (capital > 0) writeJson(CAPITAL_KEY, { capital });
      $('sFormula').textContent = `Invested % = risk % ÷ stop distance % = ${riskRaw} ÷ ${r.stopDistancePct} = ${r.idealInvestedPct}%`;
      const k = (label, value, c = '') => `<div class="kpi"><div class="muted small">${label}</div><div class="${c}">${value}</div></div>`;
      $('sOut').innerHTML = `
        <div class="grid3" style="margin-top:10px">
          ${k('Shares to buy', r.qty)}
          ${k('Capital to invest', num(r.invested, 0))}
          ${k('% of total capital invested', `${r.investedPct}%`)}
          ${k('Max loss if stop hits', `${num(r.actualRisk, 0)} (${r.actualRiskPct}%)`, 'neg')}
          ${k('Planned max loss', `${num(r.riskAmount, 0)} (${riskRaw}%)`)}
          ${k('Stop distance', `${r.stopDistancePct}%`)}
        </div>
        ${r.tooSmall ? '<p class="err small">The stop is too wide for this capital and risk. Even one share risks more than the limit.</p>' : ''}
        ${r.capped ? '<p class="muted small">Capped by your maximum position size, so the loss is below the limit.</p>' : ''}`;
    } catch (err) {
      $('sOut').innerHTML = `<span class="err">${esc(err.message)}</span>`;
    }
  }

  async function saveJournal() {
    const trade = {
      symbol: $('jSymbol').value.trim().toUpperCase(),
      date: $('jDate').value,
      qty: Number($('jQty').value),
      entry: Number($('jEntry').value),
      stop: Number($('jStop').value),
      exit: $('jExit').value === '' ? null : Number($('jExit').value),
      fees: Number($('jFees').value) || 0,
    };
    const msg = (text, cls = 'muted') => { $('jMsg').innerHTML = `<span class="${cls}">${esc(text)}</span>`; };
    if (!trade.symbol) return msg('Enter a ticker.', 'err');
    if (!(trade.qty > 0) || !(trade.entry > 0) || !(trade.stop > 0)) return msg('Enter shares, entry and stop.', 'err');
    if (!(trade.stop < trade.entry)) return msg('For a long trade the stop must be below the entry.', 'err');
    if (trade.exit !== null && !(trade.exit > 0)) return msg('Exit price must be above 0.', 'err');
    const trades = readJson(JOURNAL_KEY, []);
    trades.push({ id: Date.now(), ...trade });
    if (!writeJson(JOURNAL_KEY, trades)) return msg('Browser storage is full or blocked; trade not saved.', 'err');
    ['jSymbol', 'jQty', 'jEntry', 'jStop', 'jExit', 'jFees'].forEach((id) => { $(id).value = ''; });
    msg(`Saved ${trade.symbol}.`, 'ok');
    renderJournal();
  }

  function deleteJournal(id) {
    if (!confirm('Delete this trade from the record?')) return;
    writeJson(JOURNAL_KEY, readJson(JOURNAL_KEY, []).filter((t) => t.id !== id));
    renderJournal();
  }

  async function renderJournal() {
    const S = await sizingLibP();
    const capital = Number(readJson(CAPITAL_KEY, {}).capital) || null;
    const riskPct = Number($('sRisk').value) || 1;
    const trades = readJson(JOURNAL_KEY, []);
    const st = S.tradeStats(trades, { capital, riskPct });
    const stat = (label, value, c = '') => `<div class="kpi"><div class="muted small">${label}</div><div class="${c}">${value}</div></div>`;
    const rows = st.trades.slice().reverse().map((t) => `
      <tr>
        <td>${esc(t.date || '')}</td>
        <td>${esc(t.symbol)}</td>
        <td>${num(t.entry)}</td>
        <td>${num(t.stop)}</td>
        <td>${t.qty}</td>
        <td>${num(t.exit)}</td>
        <td class="${cls(t.pnl)}">${num(t.pnl)}</td>
        <td class="${cls(t.r)}">${t.r === null ? '–' : `${num(t.r)}R`}</td>
        <td>${t.riskPct === null ? '–' : `${num(t.riskPct, 2)}%`}</td>
        <td><button class="btn small" data-del="${t.id}">Delete</button></td>
      </tr>`).join('');
    const open = trades.filter((t) => t.exit === null || t.exit === undefined);
    const openRows = open.map((t) => `<li>${esc(t.date || '')} · ${esc(t.symbol)} · ${t.qty} shares at ${num(t.entry)}, stop ${num(t.stop)} <button class="btn small" data-del="${t.id}">Delete</button></li>`).join('');
    $('jOut').innerHTML = trades.length ? `
      <div class="grid3" style="margin-top:10px">
        ${stat('Win rate', st.winRatePct === null ? '–' : `${st.winRatePct}%`)}
        ${stat('Closed trades', `${st.closedTrades} (${st.wins}W / ${st.losses}L)`)}
        ${stat('Expectancy per trade', st.expectancyR === null ? '–' : `${st.expectancyR}R`, cls(st.expectancyR))}
        ${stat('Avg win / avg loss', st.avgWinR === null || st.avgLossR === null ? '–' : `${st.avgWinR}R / ${st.avgLossR}R`)}
        ${stat('Profit factor', st.profitFactor ?? '–')}
        ${stat('Total P&amp;L', num(st.totalPnl), cls(st.totalPnl))}
      </div>
      ${capital ? `<p class="muted small">Trades that risked more than ${riskPct}% of your capital: <strong>${st.ruleBreaches}</strong></p>` : '<p class="muted small">Save your total capital above to check the risk rule on each trade.</p>'}
      ${open.length ? `<h4>Open trades</h4><ul class="small">${openRows}</ul>` : ''}
      ${st.trades.length ? `<div class="scroll"><table><thead><tr><th>Date</th><th>Ticker</th><th>Entry</th><th>Stop</th><th>Qty</th><th>Exit</th><th>P&amp;L</th><th>R</th><th>Risk % of capital</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : ''}
      <p class="muted small">Expectancy is the average result per trade in R (1R = the amount you planned to lose). Above 0 means the method made money on average. A small sample tells you little.</p>`
      : '<p class="muted small">No trades yet. Save a trade to start your record.</p>';
  }

  // ---------- 5. Guide ----------
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
      const traders = (g.traders || []).map((t) => `
        <details class="strat">
          <summary><strong>${esc(t.name)}</strong> <span class="muted small">· ${esc(t.market)} · ${esc(t.horizon)}</span></summary>
          <p>${esc(t.idea)}</p>
          <ul>${t.rules.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
          <p class="muted small">${esc(t.verify)}</p>
        </details>`).join('');
      const sec = (title, items) => `<h4>${esc(title)}</h4><ul>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;
      const c = g.checklist;
      out.innerHTML = `
        <p class="muted small">${esc(g.disclaimer)}</p>
        ${cards}
        <h4>Famous investors (India and NSE focus)</h4>
        <p class="muted small">Summaries of publicly known approaches, not quotes. Verify before relying on them.</p>
        ${traders}
        ${sec('NSE-specific checks', g.nseChecklist || [])}
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
