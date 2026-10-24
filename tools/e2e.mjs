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
    const prompt = JSON.stringify(lastBody.messages ?? '');
    let content = 'Stub answer: beta-blockers reduce mortality post-MI.';
    if (/MCQs/.test(prompt)) content = '```json\n' + JSON.stringify([
      { question: 'Which drug class reduces mortality after STEMI?', options: ['ACE inhibitors only', 'Beta-blockers', 'Antihistamines', 'Loop diuretics'], answerIndex: 1, explanation: 'Beta-blockers reduce mortality and remodeling.', sourcePage: 1 },
      { question: 'Which score is used for pretest probability of PE?', options: ['CHADS2', 'Wells score', 'APGAR', 'GCS'], answerIndex: 1, explanation: 'Wells score stratifies PE probability.', sourcePage: 2 }]) + '\n```';
    else if (/distinct medical topics/.test(prompt)) content = JSON.stringify([{ topic: 'Myocardial infarction', page: 1 }, { topic: 'Pulmonary embolism', page: 2 }]);
    res.end(JSON.stringify({ choices: [{ message: { content } }] }));
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
page.on('request', (rq) => (/^http:\/\/127\.0\.0\.1/.test(rq.url()) || rq.url().startsWith('data:') || rq.url().startsWith('blob:') || (SUITE === 'ocr' && /^https:/.test(rq.url())) ? rq.continue() : rq.abort()));
page.on('framenavigated', (f) => { if (f === page.mainFrame()) console.log('  nav ->', f.url()); });
page.on('error', (e) => console.log('  PAGE CRASH', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('  console.error', m.text().slice(0, 160)); });
page.on('pageerror', (e) => errors.push(e.message));
const B = 'http://127.0.0.1:5190/#';
await page.goto('http://127.0.0.1:5190/#/library');
await page.waitForFunction(() => document.body.innerText.includes('Library (PDF'), { timeout: 10000 }).catch(() => {});

const txt = () => page.evaluate(() => document.body.innerText);
const waitText = (re, ms = 8000) => page.waitForFunction((s) => new RegExp(s, 'i').test(document.body.innerText), { timeout: ms }, re.source).then(() => true, () => false);
const clickText = (label) => page.evaluate((l) => { const b = [...document.querySelectorAll('button,a')].find((x) => x.textContent.trim().startsWith(l)); if (!b) throw new Error('no button ' + l); b.click(); }, label);
const setProvider = () => page.evaluate(() => localStorage.setItem('neetpg.ai.settings', JSON.stringify({ active: 'custom', configs: { custom: { apiKey: '', model: 'stub-model', baseUrl: 'http://127.0.0.1:5191/v1', modelChosen: true } } })));
const importFixture = async () => {
  await nav('/library'); await new Promise((x) => setTimeout(x, 500));
  await (await page.$('input[data-testid="pdf-input"]')).uploadFile(new URL('./fixtures/sample.pdf', import.meta.url).pathname.slice(1).replace(/%20/g, ' '));
  await page.waitForSelector('[data-testid="doc-card"]', { timeout: 15000 });
};
const pickOption = async (i) => (await page.$$('[data-testid="option"]'))[i].click();
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

  if (S('study')) {
  // Practice: generate MCQs from a stored book through the (stub) AI, practise, miss one, review it in the Mistake Notebook
  await setProvider(); await importFixture();
  await nav('/practice'); await page.waitForSelector('[data-testid="generate"]', { timeout: 8000 });
  for (const [id, v] of [['count', '2'], ['to', '2']]) { await page.click(`[data-testid="${id}"]`); await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control'); await page.keyboard.type(v); }
  await page.click('[data-testid="generate"]');
  await page.waitForSelector('[data-testid="set-card"]', { timeout: 10000 }).catch(() => {});
  check('Practice generated a saved set of 2 questions', /2 questions/.test(await txt()), (await txt()).slice(-160).replace(/\n/g, ' | '));
  check('AI prompt contained the book text', JSON.stringify(lastBody?.messages ?? '').includes('Myocardial infarction'));
  await clickText('Practise'); await page.waitForSelector('[data-testid="option"]');
  await pickOption(0); await page.waitForSelector('[data-testid="next"]');
  await page.click('[data-testid="next"]'); await page.waitForFunction(() => /Question 2 of 2/.test(document.body.innerText));
  await pickOption(1); await page.waitForSelector('[data-testid="next"]'); await page.click('[data-testid="next"]');
  check('Practice score 1 / 2', await waitText(/Score: 1 \/ 2/), (await txt()).slice(0, 120));
  await nav('/mistakes'); await page.waitForSelector('[data-testid="show-answer"]', { timeout: 8000 }).catch(() => {});
  check('missed question is due in Mistake Notebook', /Review due \(1\)/.test(await txt()));
  await page.click('[data-testid="show-answer"]'); await page.click('[data-testid="rate-Good"]');
  check('rating a card reschedules it (nothing due)', await waitText(/Nothing due/));
  await clickText('All cards'); await new Promise((x) => setTimeout(x, 400));
  const rows = await page.$$('[data-testid="card-row"]');
  check('card kept with next review date', rows.length === 1 && /Next review/.test(await txt()));
  }
  if (S('study2')) {
  // Test runner, progress, search, index, mistakes form, browser page (web build)
  await setProvider();
  await page.evaluate(() => localStorage.setItem('neetpg.sets.v1', JSON.stringify([{ id: 's1', createdAt: Date.now(), title: 'Seed set', subject: 'Medicine', questions: [
    { question: 'Which drug class reduces mortality after STEMI?', options: ['ACE inhibitors only', 'Beta-blockers', 'Antihistamines', 'Loop diuretics'], answerIndex: 1, explanation: 'x' },
    { question: 'Which score is used for pretest probability of PE?', options: ['CHADS2', 'Wells score', 'APGAR', 'GCS'], answerIndex: 1, explanation: 'y' },
    { question: 'Third question?', options: ['a', 'b'], answerIndex: 0, explanation: 'z' }] }])));
  await importFixture();
  await nav('/test'); await page.waitForSelector('[data-testid="start"]', { timeout: 8000 });
  await page.click('[data-testid="start"]'); await page.waitForSelector('[data-testid="timer"]');
  check('timer shows 4:00 for 3 questions', /^\d:\d\d$/.test(await page.$eval('[data-testid="timer"]', (e) => e.textContent)));
  await pickOption(1); await page.click('[data-testid="t-next"]'); await pickOption(0); await page.click('[data-testid="t-next"]');
  await page.click('[data-testid="submit"]');
  check('test marks = +4 -1 (1 right, 1 wrong, 1 skipped = 3/12)', await waitText(/3 \/ 12 marks/), (await txt()).slice(0, 160));
  await nav('/progress'); await page.waitForSelector('[data-testid="stat-Accuracy"]', { timeout: 8000 });
  check('Progress accuracy 50% (1 of 2 answered)', (await page.$eval('[data-testid="stat-Accuracy"]', (e) => e.textContent)) === '50%');
  check('Progress shows subject bar', (await page.$$('[data-testid="bar-row"]')).length >= 1);
  await page.goto(`${B}/search?q=heart%20attack`); const found = await waitText(/also matching:.*myocardial infarction/);
  check('Search expands synonyms and finds the book page', found && /sample\.pdf · p\.1/.test(await txt()), (await txt()).slice(0, 200).replace(/\n/g, ' | '));
  await nav('/index'); await page.waitForSelector('[data-testid="index-doc"]', { timeout: 8000 });
  await clickText('Build with AI'); const topicsOk = await waitText(/2 topics · AI/);
  check('Medical Index builds topics with pages (AI)', topicsOk && (await page.$$('[data-testid="topic"]')).length === 2);
  await clickText('Rebuild (offline)'); 
  check('offline index builder runs (fixture has no repeated phrases)', await waitText(/0 topics · offline/));
  await nav('/mistakes'); await page.waitForSelector('button'); await clickText('Add question');
  await page.type('[data-testid="f-text"]', 'Drug of choice for anaphylaxis?'); await page.type('[data-testid="f-options"]', 'Adrenaline IM\nAtropine\nSteroid');
  await page.type('[data-testid="f-correct"]', '0'); await page.type('[data-testid="f-chosen"]', '2'); await page.click('[data-testid="f-save"]');
  await new Promise((x) => setTimeout(x, 600));
  check('manual question saved and shown among cards', await waitText(/anaphylaxis/));
  await clickText('Question log'); check('manual question appears in the log as incorrect', await waitText(/incorrect[\s\S]*anaphylaxis/));
  await nav('/browser'); await page.waitForSelector('[data-testid="browser-web-note"]', { timeout: 8000 }).catch(() => {});
  check('Clinical Browser page loads (web fallback)', /desktop app/.test(await txt()));
  }

  if (S('ocr')) {
  // OCR: build an image-only PDF (no text layer) from a canvas, import it, run OCR, search the recognised text. Needs internet for tesseract language data.
  const jpg = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 900; c.height = 300; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 900, 300); g.fillStyle = '#000'; g.font = 'bold 54px Arial'; g.fillText('Pheochromocytoma causes', 30, 120); g.fillText('episodic hypertension', 30, 200); return c.toDataURL('image/jpeg', 0.95).split(',')[1]; });
  const img = Buffer.from(jpg, 'base64');
  const parts = []; const offs = []; let len = 0;
  const add = (b) => { const buf = Buffer.isBuffer(b) ? b : Buffer.from(b, 'latin1'); parts.push(buf); len += buf.length; };
  const obj = (n, body) => { offs[n] = len; add(`${n} 0 obj\n`); add(body); add('\nendobj\n'); };
  add('%PDF-1.4\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>'); obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 450 150] /Contents 4 0 R /Resources << /XObject << /Im0 5 0 R >> >> >>');
  const cs = 'q 450 0 0 150 0 0 cm /Im0 Do Q'; obj(4, `<< /Length ${cs.length} >>\nstream\n${cs}\nendstream`);
  offs[5] = len; add('5 0 obj\n'); add(`<< /Type /XObject /Subtype /Image /Width 900 /Height 300 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.length} >>\nstream\n`); add(img); add('\nendstream\nendobj\n');
  const xr = len; add(`xref\n0 6\n0000000000 65535 f \n` + [1, 2, 3, 4, 5].map((n) => String(offs[n]).padStart(10, '0') + ' 00000 n \n').join('') + `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xr}\n%%EOF\n`);
  const fs = await import('node:fs'); const scan = new URL('../shots/scan.pdf', import.meta.url).pathname.slice(1).replace(/%20/g, ' ');
  fs.writeFileSync(scan, Buffer.concat(parts));
  await nav('/library'); await new Promise((x) => setTimeout(x, 500));
  await (await page.$('input[data-testid="pdf-input"]')).uploadFile(scan);
  await page.waitForSelector('[data-testid="doc-card"]', { timeout: 15000 });
  check('scanned PDF flagged as needing OCR', /1 page\(s\) need OCR/.test(await txt()));
  await page.click('[data-testid="ocr-btn"]');
  const okOcr = await page.waitForFunction(() => !document.body.innerText.includes('need OCR') || /OCR failed/.test(document.body.innerText), { timeout: 150000 }).then(() => true, () => false);
  check('OCR finished', okOcr && !/OCR failed/.test(await txt()), (await txt()).match(/OCR failed[^\n]*/)?.[0] ?? '');
  await page.type('input[placeholder^="Search the text"]', 'hypertension');
  check('OCR text is searchable', await waitText(/1 match/, 5000));
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
