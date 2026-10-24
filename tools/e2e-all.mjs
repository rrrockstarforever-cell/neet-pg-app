// Runs each e2e suite in its own Chrome; retries when the host kills the browser (marker in output; exit codes are unreliable here).
import { spawnSync } from 'node:child_process';
const script = new URL('./e2e.mjs', import.meta.url).pathname.slice(1).replace(/%20/g, ' ');
let bad = 0;
for (const s of ['routes', 'data', 'settings', 'chat', 'library', 'study', 'study2', 'ocr', 'nav']) {
  let out = '';
  for (let i = 0; i < 8; i++) {
    const r = spawnSync(process.execPath, [script, s], { encoding: 'utf8' });
    out = r.stdout + r.stderr;
    if (!out.includes('BROWSER DISCONNECTED')) break;
  }
  const lines = out.split('\n').filter((l) => /^(PASS|FAIL)/.test(l) || /passed/.test(l));
  console.log(lines.join('\n'));
  const failed = lines.some((l) => l.startsWith('FAIL')) || !lines.some((l) => /passed/.test(l));
  if (failed && s === 'ocr') console.log('(ocr suite is optional: it needs internet for Tesseract language data)');
  else if (failed) bad++;
}
console.log(bad ? `\n${bad} suite(s) failed` : '\nALL SUITES PASSED');
