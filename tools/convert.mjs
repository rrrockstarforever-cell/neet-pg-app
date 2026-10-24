
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';

const root = path.resolve(import.meta.dirname, '..');
const exp = path.join(root, 'stitch-export');
const outDir = path.join(root, 'src', 'screens');
fs.mkdirSync(outDir, { recursive: true });

const VOID = new Set(['area','base','br','col','embed','hr','img','input','link','meta','source','track','wbr']);
const ATTR = { class:'className', for:'htmlFor', tabindex:'tabIndex', colspan:'colSpan', rowspan:'rowSpan', maxlength:'maxLength',
  readonly:'readOnly', autocomplete:'autoComplete', autofocus:'autoFocus', contenteditable:'contentEditable', crossorigin:'crossOrigin',
  srcset:'srcSet', 'accept-charset':'acceptCharset', spellcheck:'spellCheck', novalidate:'noValidate' };
const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const styleObj = (s) => {
  const o = {};
  s.split(';').forEach((d) => { const i = d.indexOf(':'); if (i < 0) return; const k = d.slice(0, i).trim(); const v = d.slice(i + 1).trim(); if (!k) return;
    o[k.startsWith('--') ? k : camel(k)] = v; });
  return JSON.stringify(o);
};
const esc = (t) => t.replace(/[{}<>]/g, (c) => `{${JSON.stringify(c)}}`);
function attrs(el) {
  const out = [];
  const isSvgChild = el.namespaceURI === 'http://www.w3.org/2000/svg';
  for (const a of el.attributes) {
    let n = a.name, v = a.value;
    if (n.startsWith('on')) continue;
    if (n === 'style') { out.push(`style={${styleObj(v)}}`); continue; }
    const tag = el.tagName.toLowerCase();
    if (n === 'checked') { out.push('defaultChecked'); continue; }
    if (n === 'value' && ['input','textarea','select'].includes(tag)) { out.push(`defaultValue=${JSON.stringify(v)}`); continue; }
    if (n === 'selected') continue;
    if (n.startsWith('aria-') || n.startsWith('data-')) { out.push(`${n}=${JSON.stringify(v)}`); continue; }
    if (isSvgChild && n.includes('-') ) n = camel(n);
    else if (ATTR[n]) n = ATTR[n];
    else if (n === 'xmlns:xlink' || n === 'xlink:href') n = camel(n.replace(':','-'));
    if (v === '' && ['disabled','required','hidden','multiple','open','readonly','autofocus','controls','loop','muted'].includes(a.name)) { out.push(n === 'readOnly' ? 'readOnly' : n); continue; }
    out.push(`${n}=${JSON.stringify(v)}`);
  }
  return out.length ? ' ' + out.join(' ') : '';
}
function node(n, depth = 0) {
  if (n.nodeType === 8) return '';
  if (n.nodeType === 3) { const t = n.textContent; if (!t.trim() && t.includes('\n')) return ''; return esc(t.replace(/\s+/g, ' ')); }
  if (n.nodeType !== 1) return '';
  const tag = n.tagName.toLowerCase();
  if (['script','style','link','meta'].includes(tag)) return '';
  if (tag === 'textarea') return `<textarea${attrs(n)} defaultValue=${JSON.stringify(n.textContent.replace(/^\n/, ''))} />`;
  if (tag === 'option') { const sel = n.hasAttribute('selected'); return `<option${attrs(n)}>${esc(n.textContent)}</option>`; }
  const kids = [...n.childNodes].map((c) => node(c, depth + 1)).join('');
  if (VOID.has(tag) || (!kids && n.namespaceURI === 'http://www.w3.org/2000/svg' && false)) return `<${tag}${attrs(n)} />`;
  return `<${tag}${attrs(n)}>${kids}</${tag}>`;
}
const toName = (d) => d.split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join('');

// ---- merge tailwind configs ----
const merged = { colors: {}, borderRadius: {}, spacing: {}, fontFamily: {}, fontSize: {} };
const extraCss = new Set();
const meta = [];
for (const d of fs.readdirSync(exp)) {
  const f = path.join(exp, d, 'code.html');
  if (!fs.existsSync(f)) continue;
  const html = fs.readFileSync(f, 'utf8');
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const cfgSrc = doc.getElementById('tailwind-config')?.textContent || '';
  const cfg = new Function('const tailwind={};' + cfgSrc.replace(/^\s*tailwind\.config\s*=/, 'tailwind.config=') + ';return tailwind.config;')();
  const ext = cfg?.theme?.extend || {};
  for (const k of Object.keys(merged)) Object.assign(merged[k], ext[k] || {});
  for (const s of doc.querySelectorAll('style')) { const t = s.textContent.trim(); if (t && !t.startsWith('@layer base{html,body')) extraCss.add(`/* ${d} */\n${t}`); else if (t) { const rest = t.replace(/@layer base\{html,body\{margin:0;padding:0;\}body\{overscroll-behavior:none;\}main>:first-child\{margin-top:0!important;\}main>:last-child\{margin-bottom:0!important;\}\}/, '').replace('::-webkit-scrollbar{display:none;}', '').trim(); if (rest) extraCss.add(`/* ${d} */\n${rest}`); } }
  const body = doc.body;
  const name = toName(d);
  const jsx = [...body.childNodes].map((c) => node(c)).join('\n');
  const bodyClass = body.getAttribute('class') || '';
  fs.writeFileSync(path.join(outDir, name + '.jsx'),
`// Generated from stitch-export/${d}/code.html by tools/convert.mjs
export const bodyClass = ${JSON.stringify(bodyClass)};
export default function ${name}() {
  return (
    <>
${jsx}
    </>
  );
}
`);
  meta.push({ dir: d, name, bodyClass });
}
fs.writeFileSync(path.join(root, 'tailwind.config.js'),
`/** Merged from all Stitch screens (Clinical Focus design system). */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: { extend: ${JSON.stringify(merged, null, 2)} },
  plugins: [],
};
`);
fs.writeFileSync(path.join(root, 'src', 'screens.extra.css'), [...extraCss].join('\n\n') + '\n');
fs.writeFileSync(path.join(root, 'src', 'screens.meta.json'), JSON.stringify(meta, null, 2));
console.log(meta.map((m) => m.name).join(', '));
