import { chat } from './ai.js';
import * as db from './db.js';

const SYSTEM = 'You write NEET PG / INI-CET style single-best-answer MCQs strictly from the supplied source text. Reply with JSON only.';

export function parseJson(text) {
  let t = String(text).trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const a = t.search(/[\[{]/); if (a < 0) throw new Error('The AI did not return JSON.');
  const open = t[a], close = open === '[' ? ']' : '}';
  t = t.slice(a, t.lastIndexOf(close) + 1);
  return JSON.parse(t);
}
export function normalize(list) {
  const arr = Array.isArray(list) ? list : list?.questions ?? [];
  return arr.filter((e) => e && typeof e.question === 'string' && Array.isArray(e.options) && e.options.length >= 2).map((e) => ({
    question: e.question, options: e.options.map(String),
    answerIndex: Math.max(0, Math.min(e.options.length - 1, Number(e.answerIndex) || 0)),
    explanation: String(e.explanation ?? ''), sourcePage: typeof e.sourcePage === 'number' ? e.sourcePage : undefined,
  }));
}

/** Ask the configured AI for MCQs from pages [from..to] of a stored document. */
export async function generateMcqs({ doc, from, to, count, signal }) {
  const pages = (await db.getAll('pages')).filter((p) => p.docId === doc.id && p.page >= from && p.page <= to).sort((a, b) => a.page - b.page);
  let src = '';
  for (const p of pages) { const s = `\n=== PAGE ${p.page} ===\n${p.text}\n`; if (src.length + s.length > 40000) break; src += s; }
  if (src.replace(/=== PAGE \d+ ===|\s/g, '').length < 100) throw new Error('These pages contain almost no readable text. If the book is scanned, use "Read pages (OCR)" in the Library first.');
  const prompt = `Source document: "${doc.name}"\nWrite exactly ${count} MCQs with 4 options each. Return ONLY a JSON array: [{"question":string,"options":string[],"answerIndex":number,"explanation":string,"sourcePage":number}]. Use only facts present in the source; do not invent doses or values.\n\nSOURCE TEXT:${src}`;
  const out = await chat([{ role: 'user', text: prompt }], { system: SYSTEM, signal });
  let qs;
  try { qs = normalize(parseJson(out)); } catch { throw new Error('The AI did not return valid JSON. Try again or use fewer pages.\n\n' + out.slice(0, 200)); }
  if (!qs.length) throw new Error('The AI returned no usable questions. Try again.');
  return qs;
}

// ---- saved question sets (localStorage, shared by Practice and Test Runner) ----
const KEY = 'neetpg.sets.v1';
export const loadSets = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
const store = (s) => localStorage.setItem(KEY, JSON.stringify(s.slice(0, 30)));
export function saveSet(set) { const s = { id: crypto.randomUUID(), createdAt: Date.now(), ...set }; store([s, ...loadSets()]); return s; }
export const deleteSet = (id) => store(loadSets().filter((s) => s.id !== id));

export const SUBJECTS = ['', 'Anatomy', 'Physiology', 'Biochemistry', 'Pathology', 'Pharmacology', 'Microbiology', 'Forensic Medicine', 'PSM', 'ENT', 'Ophthalmology', 'Medicine', 'Surgery', 'Obstetrics & Gynaecology', 'Paediatrics', 'Orthopaedics', 'Dermatology', 'Psychiatry', 'Anaesthesia', 'Radiology'];
