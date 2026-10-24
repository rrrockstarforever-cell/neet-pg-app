import http from 'node:http';
import puppeteer from 'puppeteer-core';
import { serve } from './serve.mjs';

const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SUITE = process.argv[2] || 'all';
const S = (n) => SUITE === 'all' || SUITE === n;
let disconnected = false, closing = false;
const results = [];
const check = (name, ok, extra = '') => { results.push([name, !!ok]); console.log(ok ? 'PASS' : 'FAIL', name, extra); };

// Stub OpenAI-compatible provider
let lastBody = null;
const stub = http.createServer((req, res) => {
  let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
    res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Headers', '*');
    if (req.method === 'OPTIONS') return res.end();
    lastBody = JSON.parse(b || '{}');
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: { content: 'Stub answer: beta-blockers reduce mortality post-MI.' } }] }));
  });
});
await new Promise((r) => stub.listen(5191, '127.0.0.1', r));
const app = await serve(5190);
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run', '--disable-extensions', '--disable-background-networking', '--user-data-dir=' + new URL('../shots/prof-' + Date.now(), import.meta.url).pathname.slice(1).replace(/%20/g, ' ')] });
browser.on('disconnected', () => { if (!closing) { disconnected = true; console.log('  BROWSER DISCONNECTED'); } });
browser.on('targetdestroyed', (t) => console.log('  target destroyed', t.type(), t.url().slice(0,60)));
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
const errors = [];
await page.setRequestInterception(true);
page.on('request', (rq) => (/^http:\/\/127\.0\.0\.1/.test(rq.url()) || rq.url().startsWith('data:') ? rq.continue() : rq.abort()));
page.on('framenavigated', (f) => { if (f === page.mainFrame()) console.log('  nav ->', f.url()); });
page.on('error', (e) => console.log('  PAGE CRASH', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('  console.error', m.text().slice(0, 160)); });
page.on('pageerror', (e) => errors.push(e.message));
const B = 'http://127.0.0.1:5190/#';
await page.goto('http://127.0.0.1:5190/#/library');
await page.waitForFunction(() => document.body.innerText.includes('Library (PDF'), { timeout: 10000 }).catch(() => {});
const nav = (route) => page.evaluate((r) => { location.hash = r; }, route);
try {
  if (S('routes')) {
  // 1. every route renders without runtime errors
  for (const r of ['library', 'ai', 'index', 'practice', 'test', 'mistakes', 'progress', 'highlights', 'browser', 'settings', 'search']) {
    await page.goto(`${B}/${r}`); await new Promise((x) => setTimeout(x, 400));
    const n = await page.evaluate(() => document.body.innerText.length);
    check(`route /${r} renders`, n > 100, `(${n} chars)`);
  }
  check('no page errors on routes', errors.length === 0, errors.join(' | '));

  }
  if (S('data')) {
  // 2. legacy-DB compatibility: seed a highlight the way the old app stores it
  await nav('/settings');
  await page.waitForFunction(() => /highlights\s*0/i.test(document.body.innerText), { timeout: 8000 }).catch(() => {});
  await page.evaluate(() => new Promise((res, rej) => {
    const rq = indexedDB.open('neetpg', 4);
    rq.onupgradeneeded = () => {};
    rq.onsuccess = () => { const tx = rq.result.transaction('highlights', 'readwrite'); tx.objectStore('highlights').put({ id: 'seed1', createdAt: Date.now(), text: 'Seeded legacy highlight', source: { label: 'Old book p.12' }, thread: [] }); tx.oncomplete = res; tx.onerror = () => rej(tx.error); };
    rq.onerror = () => rej(rq.error);
  }));
  await page.reload(); await page.waitForFunction(() => /Your data/.test(document.body.innerText) && !/Reading library/.test(document.body.innerText), { timeout: 8000 }).catch(() => {});
  const summaryTxt = await page.evaluate(() => document.body.innerText);
  check('Settings shows data counts from DB', /highlights\s*1/i.test(summaryTxt), JSON.stringify(summaryTxt.slice(-260)));
  await nav('/highlights'); await new Promise((x) => setTimeout(x, 600));
  check('Highlights lists seeded record', (await page.evaluate(() => document.body.innerText)).includes('Seeded legacy highlight'));

  }
  if (S('settings')) {
  // 3. configure custom provider in Settings through the UI, save, check storage shape
  await nav('/settings'); await new Promise((x) => setTimeout(x, 500));
  await page.waitForSelector('select', { timeout: 8000 });
  await page.select('select', 'custom');
  const inputs = await page.$$('input');
  const texts = []; for (const i of inputs) texts.push(await i.evaluate((e) => e.placeholder + '|' + e.type));
  const base = inputs[texts.findIndex((t) => t.endsWith('|text') && !t.startsWith('e.g.'))];
  await base.click({ clickCount: 3 }); await base.type('http://127.0.0.1:5191/v1');
  const model = inputs[texts.findIndex((t) => t.startsWith('e.g.'))];
  await model.type('stub-model');
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /save settings/i.test(b.textContent)).click());
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('neetpg.ai.settings')));
  check('settings saved in legacy shape', stored.active === 'custom' && stored.configs.custom.model === 'stub-model' && stored.configs.custom.baseUrl.includes('5191'), JSON.stringify(stored));

  }
  if (S('chat')) {
  await nav('/settings'); await page.evaluate(() => localStorage.setItem('neetpg.ai.settings', JSON.stringify({ active: 'custom', configs: { custom: { apiKey: '', model: 'stub-model', baseUrl: 'http://127.0.0.1:5191/v1', modelChosen: true } } })));
  // 4. chat end-to-end
  await nav('/ai'); await new Promise((x) => setTimeout(x, 500));
  await page.type('textarea', 'Role of beta-blockers after MI?');
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /^\s*sendAsk\s*$/i.test(b.textContent) || /Ask$/.test(b.textContent)).click());
  await page.waitForFunction(() => document.body.innerText.includes('Stub answer'), { timeout: 8000 }).catch(() => {});
  const chatTxt = await page.evaluate(() => document.body.innerText);
  check('chat returns provider answer', chatTxt.includes('Stub answer: beta-blockers'));
  check('request body has system + user msg', lastBody?.model === 'stub-model' && lastBody.messages?.[0]?.role === 'system' && lastBody.messages.at(-1).content.includes('beta-blockers'));

  // 5. save answer to highlights
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /save to highlights/i.test(b.textContent)).click());
  await new Promise((x) => setTimeout(x, 400));
  await nav('/highlights'); await new Promise((x) => setTimeout(x, 600));
  check('saved answer appears in Highlights', (await page.evaluate(() => document.body.innerText)).includes('Stub answer'));

  // 6. helper API status through real server/api.mjs
  const st = await page.evaluate(() => fetch('/api/oauth/status').then((r) => r.json()));
  check('/api/oauth/status works', 'codex' in st && 'claude' in st && 'xai' in st, JSON.stringify(st));


  }
  if (S('library')) {
  // 8. Library: import a PDF, text extraction, search, delete
  await nav('/library'); await new Promise((x) => setTimeout(x, 500));
  const fin = await page.$('input[data-testid="pdf-input"]');
  await fin.uploadFile(new URL('./fixtures/sample.pdf', import.meta.url).pathname.slice(1).replace(/%20/g, ' '));
  await page.waitForSelector('[data-testid="doc-card"]', { timeout: 15000 }).catch(() => {});
  const cardTxt = await page.evaluate(() => document.querySelector('[data-testid="doc-card"]')?.innerText ?? '');
  check('PDF imported into Library (2 pages)', /sample\.pdf/.test(cardTxt) && /2 pages/.test(cardTxt), cardTxt.replace(/\n/g, ' | '));
  const pdfStored = await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('neetpg', 4); r.onsuccess = () => { const tx = r.result.transaction(['pages', 'files', 'docs']); const a = tx.objectStore('pages').getAll(); const f = tx.objectStore('files').count(); const d = tx.objectStore('docs').getAll(); tx.oncomplete = () => res({ pages: a.result.map((p) => [p.page, p.text.slice(0, 24)]), files: f.result, doc: d.result.find((x) => x.name === 'sample.pdf') }); }; }));
  check('pages/files stored in legacy schema', pdfStored.pages.length === 2 && pdfStored.files >= 1 && pdfStored.doc?.pageCount === 2 && pdfStored.pages[0][1].startsWith('Myocardial'), JSON.stringify(pdfStored.pages));
  await page.type('input[placeholder^="Search the text"]', 'wells score');
  await page.waitForFunction(() => /1 match/.test(document.body.innerText), { timeout: 5000 }).catch(() => {});
  check('full-text search finds page 2', /p\.2/.test(await page.evaluate(() => document.body.innerText)));
  page.on('dialog', (d) => d.accept());
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent === 'Delete').click());
  await new Promise((x) => setTimeout(x, 800));
  check('document deleted', !(await page.evaluate(() => document.body.innerText)).includes('sample.pdf'));

  }
  if (S('nav')) {
  // 7. sidebar navigation on a static screen (click delegation) + live page
  await nav('/test'); await new Promise((x) => setTimeout(x, 400));
  await page.evaluate(() => [...document.querySelectorAll('aside a')].find((a) => /Settings/.test(a.textContent)).click());
  await new Promise((x) => setTimeout(x, 400));
  check('static screen sidebar → Settings', page.url().endsWith('#/settings'), page.url());
  await page.evaluate(() => [...document.querySelectorAll('aside a')].find((a) => /Highlights/.test(a.textContent)).click());
  await new Promise((x) => setTimeout(x, 400));
  check('live page sidebar → Highlights', page.url().endsWith('#/highlights'), page.url());
  await page.screenshot({ path: 'shots/e2e-highlights.png' }).catch((e) => console.log('  (screenshot skipped:', e.message.slice(0, 50) + ')'));
  await nav('/settings'); await new Promise((x) => setTimeout(x, 500)); await page.screenshot({ path: 'shots/e2e-settings.png' }).catch((e) => console.log('  (screenshot skipped:', e.message.slice(0, 50) + ')'));
  await nav('/ai'); await new Promise((x) => setTimeout(x, 500)); await page.screenshot({ path: 'shots/e2e-ai.png' }).catch((e) => console.log('  (screenshot skipped:', e.message.slice(0, 50) + ')'));
  }
} catch (e) { if (/detached Frame|Session closed|Target closed|Connection closed/i.test(e.message)) disconnected = true; check('test run completed', false, e.message.slice(0, 80)); }
closing = true;
await browser.close(); app.close(); stub.close();
const failed = results.filter((r) => !r[1]);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(disconnected ? 2 : failed.length ? 1 : 0);
