import { useEffect, useState } from 'react';
import Layout, { card } from '../components/Layout.jsx';
import * as db from '../lib/db.js';

const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
function Bar({ label, a, b }) {
  return (
    <div className="flex items-center gap-space-md" data-testid="bar-row">
      <span className="w-48 truncate" title={label}>{label}</span>
      <div className="flex-1 h-3 rounded-full bg-surface-container-high overflow-hidden"><div className={`h-full ${pct(a, b) >= 70 ? 'bg-green-600' : pct(a, b) >= 40 ? 'bg-tertiary' : 'bg-error'}`} style={{ width: pct(a, b) + '%' }} /></div>
      <span className="w-28 text-right text-on-surface-variant">{pct(a, b)}% · {a}/{b}</span>
    </div>
  );
}

export default function Progress() {
  const [d, setD] = useState(null);
  useEffect(() => { Promise.all([db.questions(), db.cards(), db.summary()]).then(([qs, cards, sum]) => setD({ qs, cards, sum })); }, []);
  if (!d) return <Layout title="Performance Analytics"><p>Loading…</p></Layout>;
  const { qs, cards, sum } = d;
  const answered = qs.filter((q) => q.result === 'correct' || q.result === 'incorrect');
  const right = answered.filter((q) => q.result === 'correct').length;
  const group = (key) => {
    const m = new Map();
    for (const q of answered) { const k = q[key] || 'Unlabelled'; const v = m.get(k) ?? [0, 0]; v[1]++; if (q.result === 'correct') v[0]++; m.set(k, v); }
    return [...m.entries()].sort((a, b) => a[1][0] / a[1][1] - b[1][0] / b[1][1]);
  };
  const days = [...Array(14)].map((_, i) => { const t = new Date(); t.setHours(0, 0, 0, 0); t.setDate(t.getDate() - (13 - i)); return t.getTime(); });
  const perDay = days.map((t) => qs.filter((q) => q.createdAt >= t && q.createdAt < t + 864e5).length);
  const maxDay = Math.max(1, ...perDay);
  const dueNow = cards.filter((c) => c.due <= Date.now()).length;
  const streak = (() => { let n = 0; for (let i = days.length - 1; i >= 0; i--) { if (perDay[i] > 0) n++; else if (i !== days.length - 1) break; } return n; })();
  const stat = (label, value) => <div className={card + ' !p-space-lg'}><p className="text-on-surface-variant font-caption-meta text-caption-meta">{label}</p><p className="font-headline-h1 text-headline-h1 text-primary" data-testid={'stat-' + label}>{value}</p></div>;
  return (
    <Layout title="Performance Analytics" subtitle="From the questions you practised, tested and logged">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-space-md">
        {stat('Accuracy', answered.length ? pct(right, answered.length) + '%' : '—')}{stat('Answered', answered.length)}{stat('Cards due', dueNow)}{stat('Books', sum.docs)}{stat('Day streak', streak)}
      </div>
      <section className={card}><h2 className="font-headline-h2 text-headline-h2 text-primary">Questions per day (last 14 days)</h2>
        <div className="flex items-end gap-space-xs h-32">{perDay.map((n, i) => <div key={i} title={`${new Date(days[i]).toLocaleDateString()}: ${n}`} className="flex-1 bg-secondary rounded-t" style={{ height: Math.max(2, (n / maxDay) * 100) + '%', opacity: n ? 1 : 0.2 }} />)}</div></section>
      <section className={card}><h2 className="font-headline-h2 text-headline-h2 text-primary">Accuracy by subject (weakest first)</h2>
        {group('subject').length === 0 ? <p className="text-on-surface-variant">Answer some questions to see this.</p> : group('subject').map(([k, [a, b]]) => <Bar key={k} label={k} a={a} b={b} />)}</section>
      <section className={card}><h2 className="font-headline-h2 text-headline-h2 text-primary">Weakest topics</h2>
        {group('topic').slice(0, 8).map(([k, [a, b]]) => <Bar key={k} label={k} a={a} b={b} />)}</section>
    </Layout>
  );
}
