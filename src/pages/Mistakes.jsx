import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Layout, { card, btnPrimary, btnGhost, input } from '../components/Layout.jsx';
import Mcq, { LETTERS } from '../components/Mcq.jsx';
import * as db from '../lib/db.js';
import { grade, previews, human, addCard } from '../lib/srs.js';
import { chat } from '../lib/ai.js';
import { parseJson, SUBJECTS } from '../lib/quiz.js';

const blank = { text: '', options: '', chosen: '', correct: '', result: 'incorrect', subject: '', topic: '', explanation: '' };

export default function Mistakes() {
  const [sp] = useSearchParams();
  const [tab, setTab] = useState(sp.get('add') ? 'add' : 'due');
  const [cards, setCards] = useState([]);
  const [qs, setQs] = useState([]);
  const [shown, setShown] = useState(false);
  const [form, setForm] = useState(() => { try { const d = JSON.parse(sessionStorage.getItem('neetpg.draft') || 'null'); return d ? { ...blank, text: d.text } : blank; } catch { return blank; } });
  const [msg, setMsg] = useState('');
  const [filter, setFilter] = useState('');
  const load = () => Promise.all([db.cards(), db.questions()]).then(([c, q]) => { setCards(c.sort((a, b) => a.due - b.due)); setQs(q); });
  useEffect(() => { load(); }, []);

  const due = cards.filter((c) => c.due <= Date.now());
  const cur = due[0];
  async function rate(g) { await db.put('cards', grade(cur, g)); setShown(false); load(); }
  async function removeCard(id) { await db.del('cards', id); load(); }
  async function removeQ(id) { await db.del('questions', id); load(); }
  async function tidy() {
    setMsg('Reading the question with AI…');
    try {
      const out = await chat([{ role: 'user', text: `Below is raw OCR text of one MCQ. Return ONLY JSON {"text":string,"options":string[],"correct":number|null,"subject":string,"topic":string,"explanation":string} (options without A/B/C/D labels, correct is a 0-based index or null).\n\n${form.text}` }], { system: 'You clean OCR text of medical MCQs. JSON only.' });
      const j = parseJson(out);
      setForm({ ...form, text: j.text || form.text, options: (j.options || []).join('\n'), correct: j.correct == null ? '' : String(j.correct), subject: j.subject || '', topic: j.topic || '', explanation: j.explanation || '' });
      setMsg('');
    } catch (e) { setMsg(e.message); }
  }
  async function saveForm() {
    if (!form.text.trim()) return setMsg('Add the question text first.');
    const options = form.options.split('\n').map((s) => s.trim()).filter(Boolean);
    const num = (v) => (v === '' ? undefined : Number(v));
    const q = { id: crypto.randomUUID(), createdAt: Date.now(), source: 'manual', text: form.text.trim(), options, chosen: num(form.chosen), correct: num(form.correct), result: form.result, subject: form.subject.trim(), topic: form.topic.trim(), explanation: form.explanation.trim() };
    await db.saveQuestion(q);
    if (q.result !== 'correct') await addCard({ id: 'q:' + q.id, kind: 'mock', text: q.text, options, correct: q.correct, chosen: q.chosen, explanation: q.explanation, subject: q.subject, topic: q.topic });
    sessionStorage.removeItem('neetpg.draft');
    setForm(blank); setMsg('Saved.'); load(); setTab('all');
  }
  const f = filter.toLowerCase();
  const match = (x) => !f || `${x.text} ${x.subject} ${x.topic}`.toLowerCase().includes(f);
  const tabBtn = (k, label) => <button onClick={() => setTab(k)} className={`px-space-lg py-space-sm rounded-lg font-bold ${tab === k ? 'bg-primary-container text-on-primary' : 'bg-surface-container-low text-on-surface-variant'}`}>{label}</button>;

  return (
    <Layout title="Mistake Notebook & Review" subtitle={`${due.length} due now · ${cards.length} cards · ${qs.length} logged questions`}>
      <div className="flex gap-space-sm flex-wrap">{tabBtn('due', `Review due (${due.length})`)}{tabBtn('all', 'All cards')}{tabBtn('log', 'Question log')}{tabBtn('add', 'Add question')}</div>
      {tab === 'due' && (cur ? (
        <section className={card}>
          <p className="font-caption-meta text-caption-meta text-on-surface-variant">{[cur.subject, cur.topic].filter(Boolean).join(' · ') || 'Revision card'}</p>
          <Mcq q={cur} chosen={cur.chosen} reveal={shown} />
          {!shown ? <button data-testid="show-answer" className={btnPrimary + ' self-start'} onClick={() => setShown(true)}>Show answer</button> : (
            <div className="flex gap-space-sm flex-wrap">{previews(cur).map((p) => <button key={p.g} data-testid={'rate-' + p.label} className={btnGhost} onClick={() => rate(p.g)}>{p.label} <span className="text-on-surface-variant">· {human(p.due)}</span></button>)}</div>
          )}
        </section>
      ) : <section className={card}><p className="text-on-surface-variant" data-testid="none-due">Nothing due. Missed questions from Practice and Tests appear here automatically.</p></section>)}
      {(tab === 'all' || tab === 'log') && <input className={input} placeholder="Filter by text, subject or topic…" value={filter} onChange={(e) => setFilter(e.target.value)} />}
      {tab === 'all' && cards.filter(match).map((c) => (
        <section key={c.id} data-testid="card-row" className={card}><Mcq q={c} chosen={c.chosen} reveal />
          <div className="flex justify-between items-center"><span className="text-on-surface-variant font-caption-meta text-caption-meta">Next review {new Date(c.due).toLocaleDateString()} · {c.subject || 'no subject'}</span><button className={btnGhost} onClick={() => removeCard(c.id)}>Delete</button></div></section>
      ))}
      {tab === 'log' && qs.filter(match).map((q) => (
        <section key={q.id} className={card}><div className="flex justify-between"><span className={`font-bold ${q.result === 'correct' ? 'text-green-700' : 'text-error'}`}>{q.result}</span><span className="text-on-surface-variant font-caption-meta text-caption-meta">{new Date(q.createdAt).toLocaleString()} · {q.source}</span></div>
          <p className="whitespace-pre-wrap">{q.text}</p>
          {q.options?.length > 0 && <p className="text-on-surface-variant font-caption-meta text-caption-meta">{q.options.map((o, i) => `${LETTERS[i]}. ${o}`).join('  ·  ')}</p>}
          <button className={btnGhost + ' self-start'} onClick={() => removeQ(q.id)}>Delete</button></section>
      ))}
      {tab === 'add' && (
        <section className={card}>
          <h2 className="font-headline-h2 text-headline-h2 text-primary">Log a question you got wrong (or right)</h2>
          <textarea data-testid="f-text" className={input} rows="4" placeholder="Question text (or paste OCR text)" value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} />
          <textarea data-testid="f-options" className={input} rows="4" placeholder="One option per line" value={form.options} onChange={(e) => setForm({ ...form, options: e.target.value })} />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-space-md">
            <input data-testid="f-chosen" className={input} placeholder="You chose (0-based)" value={form.chosen} onChange={(e) => setForm({ ...form, chosen: e.target.value })} />
            <input data-testid="f-correct" className={input} placeholder="Correct (0-based)" value={form.correct} onChange={(e) => setForm({ ...form, correct: e.target.value })} />
            <select className={input} value={form.result} onChange={(e) => setForm({ ...form, result: e.target.value })}><option value="incorrect">Incorrect</option><option value="correct">Correct</option><option value="skipped">Skipped</option></select>
            <select className={input} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })}>{SUBJECTS.map((s) => <option key={s} value={s}>{s || 'Subject…'}</option>)}</select>
          </div>
          <input className={input} placeholder="Topic" value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} />
          <textarea className={input} rows="3" placeholder="Explanation / why I got it wrong" value={form.explanation} onChange={(e) => setForm({ ...form, explanation: e.target.value })} />
          {msg && <p className="text-on-surface-variant">{msg}</p>}
          <div className="flex gap-space-sm"><button data-testid="f-save" className={btnPrimary} onClick={saveForm}>Save</button><button className={btnGhost} onClick={tidy}>Tidy with AI</button></div>
        </section>
      )}
    </Layout>
  );
}
