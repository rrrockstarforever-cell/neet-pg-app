import { createEmptyCard, fsrs, Rating } from 'ts-fsrs';
import * as db from './db.js';

const f = fsrs();
export const RATINGS = [[Rating.Again, 'Again'], [Rating.Hard, 'Hard'], [Rating.Good, 'Good'], [Rating.Easy, 'Easy']];

export const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };

/** Add a revision card unless it already exists. Same record shape as the legacy app: {id, kind, text, options, correct, chosen, explanation, subject, topic, card, due, createdAt}. */
export async function addCard(c) {
  if (await db.get('cards', c.id)) return false;
  const card = createEmptyCard(new Date());
  await db.put('cards', { ...c, card, due: card.due.getTime(), createdAt: Date.now() });
  return true;
}
export function grade(rec, rating, now = new Date()) {
  const r = f.next(rec.card, now, rating);
  return { ...rec, card: r.card, due: r.card.due.getTime() };
}
export function previews(rec, now = new Date()) {
  const r = f.repeat(rec.card, now);
  return RATINGS.map(([g, label]) => ({ g, label, due: r[g].card.due }));
}
export function human(date, now = new Date()) {
  const m = Math.round((date.getTime() - now.getTime()) / 6e4);
  if (m < 1) return 'now'; if (m < 60) return `${m} min`;
  const h = Math.round(m / 60); if (h < 24) return `${h} h`;
  const d = Math.round(h / 24); return d < 31 ? `${d} d` : `${Math.round(d / 30)} mo`;
}

/** Log a answered question the way the legacy "mock" log does, and make a revision card when it was missed. */
export async function logQuestion({ source, text, options, chosen, correct, subject = '', topic = '', explanation = '' }) {
  const result = chosen == null ? 'skipped' : chosen === correct ? 'correct' : 'incorrect';
  const q = { id: crypto.randomUUID(), createdAt: Date.now(), source, text, options, chosen: chosen ?? undefined, correct, result, subject, topic, explanation };
  await db.saveQuestion(q);
  if (result !== 'correct') await addCard({ id: 'q:' + q.id, kind: 'mock', text, options, correct, chosen, explanation, subject, topic });
  return q;
}
