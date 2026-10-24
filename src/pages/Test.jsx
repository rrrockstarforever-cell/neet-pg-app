import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Layout, { card, btnPrimary, btnGhost, input } from '../components/Layout.jsx';
import Mcq from '../components/Mcq.jsx';
import * as db from '../lib/db.js';
import { loadSets } from '../lib/quiz.js';
import { logQuestion } from '../lib/srs.js';

const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export default function Test() {
  const [sp] = useSearchParams();
  const sets = useMemo(loadSets, []);
  const [setId, setSetId] = useState(sp.get('set') || sets[0]?.id || '');
  const [mins, setMins] = useState(null);
  const [exam, setExam] = useState(null); // {set, answers:[], flags:Set, i, left}
  const [result, setResult] = useState(null);
  const submitted = useRef(false);
  const set = sets.find((s) => s.id === setId);
  const minutes = mins ?? (set ? Math.max(1, Math.ceil(set.questions.length * 1.2)) : 0);

  useEffect(() => {
    if (!exam || result) return;
    const t = setInterval(() => setExam((e) => (e ? { ...e, left: e.left - 1 } : e)), 1000);
    return () => clearInterval(t);
  }, [!!exam, !!result]);
  useEffect(() => { if (exam && !result && exam.left <= 0) submit(); }, [exam?.left]);

  function start() { submitted.current = false; setResult(null); setExam({ set, answers: set.questions.map(() => null), flags: new Set(), i: 0, left: minutes * 60 }); }
  async function submit() {
    if (submitted.current || !exam) return; submitted.current = true;
    let right = 0, wrong = 0, skipped = 0;
    for (const [i, q] of exam.set.questions.entries()) {
      const a = exam.answers[i];
      if (a == null) skipped++; else if (a === q.answerIndex) right++; else wrong++;
      await logQuestion({ source: 'test', text: q.question, options: q.options, chosen: a ?? undefined, correct: q.answerIndex, subject: exam.set.subject, topic: exam.set.title, explanation: q.explanation });
    }
    setResult({ right, wrong, skipped, marks: right * 4 - wrong, max: exam.set.questions.length * 4, used: minutes * 60 - exam.left });
  }

  if (exam && result) {
    return (
      <Layout title="Test result" subtitle={exam.set.title}>
        <section className={card}>
          <h2 className="font-headline-h2 text-headline-h2 text-primary" data-testid="test-score">{result.marks} / {result.max} marks</h2>
          <p>{result.right} correct · {result.wrong} wrong · {result.skipped} skipped · time {fmt(result.used)} <span className="text-on-surface-variant">(+4 / −1 marking)</span></p>
          <div className="flex gap-space-sm"><Link className={btnPrimary} to="/mistakes">Review in Mistake Notebook</Link><button className={btnGhost} onClick={() => { setExam(null); setResult(null); }}>Back</button></div>
        </section>
        {exam.set.questions.map((q, i) => <section key={i} className={card}><Mcq q={q} number={i + 1} chosen={exam.answers[i]} reveal /></section>)}
      </Layout>
    );
  }
  if (exam) {
    const q = exam.set.questions[exam.i], n = exam.set.questions.length;
    const set_ = (patch) => setExam({ ...exam, ...patch });
    return (
      <Layout title="Test in progress" subtitle={exam.set.title} actions={<span data-testid="timer" className={`font-headline-h2 text-headline-h2 ${exam.left < 60 ? 'text-error' : 'text-primary'}`}>{fmt(Math.max(0, exam.left))}</span>}>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-space-lg">
          <section className={card}>
            <Mcq q={q} number={exam.i + 1} chosen={exam.answers[exam.i]} onPick={(k) => set_({ answers: exam.answers.map((a, j) => (j === exam.i ? k : a)) })} />
            <div className="flex gap-space-sm flex-wrap">
              <button className={btnGhost} disabled={exam.i === 0} onClick={() => set_({ i: exam.i - 1 })}>Previous</button>
              <button data-testid="t-next" className={btnGhost} disabled={exam.i === n - 1} onClick={() => set_({ i: exam.i + 1 })}>Next</button>
              <button className={btnGhost} onClick={() => set_({ answers: exam.answers.map((a, j) => (j === exam.i ? null : a)) })}>Clear</button>
              <button className={btnGhost} onClick={() => { const f = new Set(exam.flags); f.has(exam.i) ? f.delete(exam.i) : f.add(exam.i); set_({ flags: f }); }}>{exam.flags.has(exam.i) ? 'Unmark' : 'Mark for review'}</button>
            </div>
          </section>
          <aside className={card}>
            <p className="font-bold">Questions</p>
            <div className="grid grid-cols-5 gap-space-xs">
              {exam.set.questions.map((_, j) => <button key={j} onClick={() => set_({ i: j })} className={`rounded p-space-xs border ${j === exam.i ? 'border-secondary' : 'border-outline-variant'} ${exam.flags.has(j) ? 'bg-tertiary-fixed' : exam.answers[j] != null ? 'bg-secondary-container/50' : ''}`}>{j + 1}</button>)}
            </div>
            <p className="text-on-surface-variant font-caption-meta text-caption-meta">{exam.answers.filter((a) => a == null).length} unanswered</p>
            <button data-testid="submit" className={btnPrimary} onClick={submit}>Submit test</button>
          </aside>
        </div>
      </Layout>
    );
  }
  return (
    <Layout title="Test Runner & Exam" subtitle="Timed exam from a saved question set · +4 / −1 marking">
      <section className={card}>
        {sets.length === 0 ? <p className="text-on-surface-variant">No question sets yet. Create one in <Link className="text-secondary font-bold" to="/practice">Practice</Link>.</p> : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-space-md items-end">
            <label className="md:col-span-2 flex flex-col gap-space-xs">Question set<select data-testid="set-select" className={input} value={setId} onChange={(e) => { setSetId(e.target.value); setMins(null); }}>{sets.map((s) => <option key={s.id} value={s.id}>{s.title} ({s.questions.length} Q)</option>)}</select></label>
            <label className="flex flex-col gap-space-xs">Minutes<input data-testid="minutes" className={input} type="number" min="1" value={minutes} onChange={(e) => setMins(Number(e.target.value))} /></label>
            <button data-testid="start" className={btnPrimary + ' self-start'} disabled={!set} onClick={start}>Start test</button>
          </div>
        )}
      </section>
    </Layout>
  );
}
