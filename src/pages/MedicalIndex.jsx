import { useEffect, useMemo, useState } from 'react';
import Layout, { card, btnPrimary, btnGhost, input } from '../components/Layout.jsx';
import * as db from '../lib/db.js';
import { chat } from '../lib/ai.js';
import { parseJson } from '../lib/quiz.js';

const KEY = 'neetpg.index.v1';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
const STOP = new Set('the and for with that this from are was were has have had not but can may will its their these those which when than then also into such more most other only over between under after before been being through during about while where there what each both any all one two use used using due often may must should could would our your they them his her she him who how why per via'.split(' '));

/** Offline topic index: repeated two-word phrases, with the pages they appear on. */
export function localTopics(pages) {
  const m = new Map();
  for (const p of pages) {
    const w = p.text.toLowerCase().replace(/[^a-z0-9\- ]+/g, ' ').split(/\s+/).filter(Boolean);
    const seen = new Set();
    for (let i = 0; i < w.length - 1; i++) {
      const a = w[i], b = w[i + 1];
      if (a.length < 4 || b.length < 4 || STOP.has(a) || STOP.has(b)) continue;
      const k = a + ' ' + b; if (seen.has(k)) continue; seen.add(k);
      const v = m.get(k) ?? { topic: k, pages: [], n: 0 }; v.pages.push(p.page); v.n++; m.set(k, v);
    }
  }
  return [...m.values()].filter((v) => v.n >= 2).sort((a, b) => b.n - a.n).slice(0, 60).map(({ topic, pages }) => ({ topic, pages: pages.slice(0, 12) }));
}

export default function MedicalIndex() {
  const [docs, setDocs] = useState(null);
  const [idx, setIdx] = useState(load());
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => { db.docs().then(setDocs); }, []);
  const save = (n) => { setIdx(n); localStorage.setItem(KEY, JSON.stringify(n)); };
  const pagesOf = async (id) => (await db.getAll('pages')).filter((p) => p.docId === id).sort((a, b) => a.page - b.page);

  async function build(d, useAi) {
    setErr(''); setBusy(d.id);
    try {
      const pages = await pagesOf(d.id);
      let topics;
      if (!useAi) topics = localTopics(pages);
      else {
        topics = [];
        for (let i = 0; i < pages.length && i < 60; i += 15) {
          const chunk = pages.slice(i, i + 15).map((p) => `=== PAGE ${p.page} ===\n${p.text.slice(0, 1500)}`).join('\n');
          const out = await chat([{ role: 'user', text: `List the distinct medical topics covered in this text. Return ONLY JSON [{"topic":string,"page":number}] (max 25).\n\n${chunk}` }], { system: 'You build an index of medical textbook topics. JSON only.' });
          topics.push(...parseJson(out).filter((t) => t?.topic && typeof t.page === 'number'));
        }
        const m = new Map(); for (const t of topics) { const k = t.topic.toLowerCase(); const v = m.get(k) ?? { topic: t.topic, pages: [] }; if (!v.pages.includes(t.page)) v.pages.push(t.page); m.set(k, v); }
        topics = [...m.values()].sort((a, b) => a.topic.localeCompare(b.topic));
      }
      save({ ...idx, [d.id]: { builtAt: Date.now(), ai: useAi, topics } });
    } catch (e) { setErr(e.message); }
    setBusy('');
  }
  async function open(d, page) { const f = await db.getFile(d.id); if (f) window.open(URL.createObjectURL(f) + '#page=' + page, '_blank'); }

  const grouped = useMemo(() => { const g = {}; (docs ?? []).forEach((d) => (g[d.subject || 'Unsorted'] ??= []).push(d)); return Object.entries(g).sort(); }, [docs]);
  const f = q.toLowerCase();
  return (
    <Layout title="Medical Index & Topics" subtitle="Topics per book and subject, linked to the pages">
      <input className={input} placeholder="Filter topics…" value={q} onChange={(e) => setQ(e.target.value)} />
      {err && <p className="text-error">{err}</p>}
      {docs && docs.length === 0 && <section className={card}><p className="text-on-surface-variant">Import books in the Library to build an index.</p></section>}
      {grouped.map(([sub, list]) => (
        <section key={sub} className="flex flex-col gap-space-md">
          <h2 className="font-headline-h2 text-headline-h2 text-primary">{sub}</h2>
          {list.map((d) => {
            const e = idx[d.id]; const topics = (e?.topics ?? []).filter((t) => !f || t.topic.toLowerCase().includes(f));
            return (
              <div key={d.id} data-testid="index-doc" className={card}>
                <div className="flex justify-between items-center gap-space-md flex-wrap"><p className="font-subheading-h3 text-subheading-h3">{d.name} <span className="text-on-surface-variant font-caption-meta text-caption-meta">{d.pageCount} pages</span></p>
                  <div className="flex gap-space-sm"><button data-testid="build-local" className={btnPrimary} disabled={!!busy} onClick={() => build(d, false)}>{busy === d.id ? 'Building…' : e ? 'Rebuild (offline)' : 'Build index (offline)'}</button><button className={btnGhost} disabled={!!busy} onClick={() => build(d, true)}>Build with AI</button></div></div>
                {e && <p className="text-on-surface-variant font-caption-meta text-caption-meta">{e.topics.length} topics · {e.ai ? 'AI' : 'offline'} · built {new Date(e.builtAt).toLocaleString()}</p>}
                <div className="flex flex-wrap gap-space-sm">
                  {topics.map((t) => <span key={t.topic} data-testid="topic" className="bg-surface-container-low rounded-lg px-space-md py-space-xs"><b>{t.topic}</b> {t.pages.map((p) => <button key={p} className="text-secondary underline ml-1" onClick={() => open(d, p)}>p.{p}</button>)}</span>)}
                </div>
              </div>
            );
          })}
        </section>
      ))}
    </Layout>
  );
}
