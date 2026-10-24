import * as db from './db.js';

const GROUPS = [['mi', 'myocardial infarction', 'heart attack'], ['htn', 'hypertension', 'high blood pressure'], ['dm', 'diabetes mellitus', 'diabetes'], ['tb', 'tuberculosis'], ['pe', 'pulmonary embolism'], ['dvt', 'deep vein thrombosis'], ['copd', 'chronic obstructive pulmonary disease'], ['ckd', 'chronic kidney disease'], ['aki', 'acute kidney injury'], ['uti', 'urinary tract infection'], ['cva', 'stroke', 'cerebrovascular accident'], ['gerd', 'reflux', 'gastroesophageal reflux'], ['ards', 'acute respiratory distress syndrome'], ['hiv', 'aids'], ['sle', 'lupus', 'systemic lupus erythematosus'], ['ra', 'rheumatoid arthritis'], ['pcos', 'polycystic ovary'], ['ecg', 'ekg', 'electrocardiogram'], ['anemia', 'anaemia'], ['edema', 'oedema'], ['hemorrhage', 'haemorrhage'], ['pediatric', 'paediatric'], ['esophagus', 'oesophagus'], ['dka', 'diabetic ketoacidosis'], ['stemi', 'st elevation myocardial infarction'], ['afib', 'atrial fibrillation'], ['chf', 'heart failure', 'cardiac failure'], ['bp', 'blood pressure'], ['pcm', 'paracetamol', 'acetaminophen'], ['tpn', 'total parenteral nutrition']];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Query + synonyms / spelling variants (MI <-> myocardial infarction, anemia <-> anaemia ...). */
export function expand(q) {
  q = q.trim().toLowerCase();
  const out = new Set([q]);
  for (const g of GROUPS) for (const t of g) {
    if (new RegExp(`\\b${esc(t)}\\b`).test(q)) for (const o of g) if (o !== t) out.add(q.replace(new RegExp(`\\b${esc(t)}\\b`), o));
  }
  return [...out];
}
const count = (hay, terms) => terms.reduce((n, t) => n + (hay.split(t).length - 1), 0);
const snip = (text, terms) => {
  const low = text.toLowerCase(); let at = -1, len = 0;
  for (const t of terms) { const i = low.indexOf(t); if (i >= 0 && (at < 0 || i < at)) { at = i; len = t.length; } }
  if (at < 0) return text.slice(0, 160);
  return (at > 60 ? '…' : '') + text.slice(Math.max(0, at - 60), at + len + 120);
};

export async function searchAll(query) {
  const terms = expand(query);
  if (terms[0].length < 2) return { terms, pages: [], highlights: [], questions: [], cards: [], docs: [] };
  const [docs, pages, hl, qs, cards] = await Promise.all([db.docs(), db.getAll('pages'), db.highlights(), db.questions(), db.cards()]);
  const byId = new Map(docs.map((d) => [d.id, d]));
  const rank = (arr, get) => arr.map((x) => ({ x, n: count(get(x).toLowerCase(), terms) })).filter((r) => r.n > 0).sort((a, b) => b.n - a.n);
  return {
    terms,
    docs: docs.filter((d) => count(d.name.toLowerCase(), terms) > 0),
    pages: rank(pages.filter((p) => byId.has(p.docId)), (p) => p.text).slice(0, 40).map(({ x, n }) => ({ doc: byId.get(x.docId), page: x.page, hits: n, snippet: snip(x.text, terms) })),
    highlights: rank(hl, (h) => h.text ?? '').slice(0, 20).map(({ x }) => ({ ...x, snippet: snip(x.text, terms) })),
    questions: rank(qs, (q) => `${q.text} ${(q.options ?? []).join(' ')} ${q.topic ?? ''} ${q.explanation ?? ''}`).slice(0, 20).map(({ x }) => x),
    cards: rank(cards, (c) => `${c.text} ${(c.options ?? []).join(' ')} ${c.explanation ?? ''}`).slice(0, 20).map(({ x }) => x),
  };
}
