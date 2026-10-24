import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Layout, { card, btnPrimary, btnGhost, input } from '../components/Layout.jsx';
import Mcq from '../components/Mcq.jsx';
import * as db from '../lib/db.js';
import { generateMcqs, loadSets, saveSet, deleteSet, SUBJECTS } from '../lib/quiz.js';
import { logQuestion } from '../lib/srs.js';

export default function Practice() {
  const navigate = useNavigate();
  const [docs, setDocs] = useState([]);
  const [docId, setDocId] = useState('');
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(10);
  const [count, setCount] = useState(5);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sets, setSets] = useState(loadSets());
  const [run, setRun] = useState(null); // {set, i, chosen, score}
  const abort = useRef(null);
  useEffect(() => { db.docs().then((d) => { setDocs(d); if (d[0]) { setDocId(d[0].id); setTo(Math.min(10, d[0].pageCount)); } }); }, []);
  const doc = docs.find((d) => d.id === docId);

  async function generate() {
    setErr(''); setBusy(true); abort.current = new AbortController();
    try {
      const qs = await generateMcqs({ doc, from: Number(from), to: Number(to), count: Number(count), signal: abort.current.signal });
      saveSet({ title: `${doc.name} p.${from}-${to}`, subject: doc.subject || '', questions: qs });
      setSets(loadSets());
    } catch (e) { if (e.name !== 'AbortError') setErr(e.message); }
    setBusy(false);
  }
  async function pick(i) {
    if (run.chosen != null) return;
    const q = run.set.questions[run.i];
    await logQuestion({ source: 'practice', text: q.question, options: q.options, chosen: i, correct: q.answerIndex, subject: run.set.subject, topic: run.set.title, explanation: q.explanation });
    setRun({ ...run, chosen: i, score: run.score + (i === q.answerIndex ? 1 : 0) });
  }

  if (run) {
    const n = run.set.questions.length, done = run.i >= n;
    return (
      <Layout title="Practice" subtitle={run.set.title} actions={<button className={btnGhost} onClick={() => setRun(null)}>Exit</button>}>
        {done ? (
          <section className={card}><h2 className="font-headline-h2 text-headline-h2 text-primary" data-testid="practice-score">Score: {run.score} / {n}</h2>
            <p className="text-on-surface-variant">Missed questions were added to your Mistake Notebook for spaced review.</p>
            <div className="flex gap-space-sm"><button className={btnPrimary} onClick={() => setRun(null)}>Done</button><Link className={btnGhost} to="/mistakes">Open Mistake Notebook</Link></div></section>
        ) : (
          <section className={card}>
            <p className="font-caption-meta text-caption-meta text-on-surface-variant">Question {run.i + 1} of {n}</p>
            <Mcq q={run.set.questions[run.i]} chosen={run.chosen} reveal={run.chosen != null} onPick={pick} />
            {run.chosen != null && <button data-testid="next" className={btnPrimary + ' self-start'} onClick={() => setRun({ ...run, i: run.i + 1, chosen: null })}>{run.i + 1 === n ? 'Finish' : 'Next'}</button>}
          </section>
        )}
      </Layout>
    );
  }
  return (
    <Layout title="Practice & Modules" subtitle="Generate MCQs from your own books, then practise with instant feedback">
      <section className={card}>
        <h2 className="font-headline-h2 text-headline-h2 text-primary">New question set</h2>
        {docs.length === 0 ? <p className="text-on-surface-variant">Import a book in the <Link className="text-secondary font-bold" to="/library">Library</Link> first.</p> : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-space-md items-end">
            <label className="col-span-2 flex flex-col gap-space-xs">Book<select className={input} value={docId} onChange={(e) => { setDocId(e.target.value); const d = docs.find((x) => x.id === e.target.value); setFrom(1); setTo(Math.min(10, d.pageCount)); }}>{docs.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.pageCount} p)</option>)}</select></label>
            <label className="flex flex-col gap-space-xs">From page<input data-testid="from" className={input} type="number" min="1" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label className="flex flex-col gap-space-xs">To page<input data-testid="to" className={input} type="number" min="1" value={to} onChange={(e) => setTo(e.target.value)} /></label>
            <label className="flex flex-col gap-space-xs">Questions<input data-testid="count" className={input} type="number" min="1" max="20" value={count} onChange={(e) => setCount(e.target.value)} /></label>
            <div className="col-span-3 flex gap-space-sm"><button data-testid="generate" className={btnPrimary} disabled={busy || !doc} onClick={generate}>{busy ? 'Generating…' : 'Generate with AI'}</button>{busy && <button className={btnGhost} onClick={() => abort.current?.abort()}>Cancel</button>}</div>
          </div>
        )}
        {err && <p className="text-error whitespace-pre-wrap">{err} {/AI provider|Settings|model|API key/i.test(err) && <Link to="/settings" className="underline">Open Settings</Link>}</p>}
      </section>
      <section className="flex flex-col gap-space-md">
        <h2 className="font-headline-h2 text-headline-h2 text-primary">Saved sets ({sets.length})</h2>
        {sets.length === 0 && <p className="text-on-surface-variant">No sets yet.</p>}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-space-lg">
          {sets.map((s) => (
            <div key={s.id} data-testid="set-card" className={card}>
              <p className="font-subheading-h3 text-subheading-h3">{s.title}</p>
              <p className="text-on-surface-variant font-caption-meta text-caption-meta">{s.questions.length} questions{s.subject ? ' · ' + s.subject : ''}</p>
              <div className="flex gap-space-sm flex-wrap">
                <button className={btnPrimary} onClick={() => setRun({ set: s, i: 0, chosen: null, score: 0 })}>Practise</button>
                <button className={btnGhost} onClick={() => navigate('/test?set=' + s.id)}>Timed test</button>
                <button className={btnGhost} onClick={() => { deleteSet(s.id); setSets(loadSets()); }}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </Layout>
  );
}
