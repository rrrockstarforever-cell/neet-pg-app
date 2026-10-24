import { useEffect, useRef, useState } from 'react';
import Layout, { card, btnPrimary, btnGhost, input } from '../components/Layout.jsx';
import { chat, research, webPrompt, loadSettings, activeConfig, oauth, isReady } from '../lib/ai.js';
import { saveHighlight } from '../lib/db.js';
import { Link } from 'react-router-dom';

export default function AiChat() {
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [web, setWeb] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ready, setReady] = useState(true);
  const [savedIds, setSavedIds] = useState(new Set());
  const abort = useRef(null);
  const end = useRef(null);
  const s = loadSettings();
  const { p, cfg } = activeConfig(s);

  useEffect(() => { oauth.status().catch(() => ({})).then((o) => setReady(isReady(s, o))); }, []);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, busy]);

  async function send() {
    const q = text.trim();
    if (!q || busy) return;
    setErr(''); setText(''); setBusy(true);
    const history = [...msgs, { role: 'user', text: q, web }];
    setMsgs(history);
    abort.current = new AbortController();
    try {
      let prompt = q;
      if (web) prompt = webPrompt(await research(q), q);
      const out = await chat([...msgs.map((m) => ({ role: m.role, text: m.prompt ?? m.text })), { role: 'user', text: prompt }], { signal: abort.current.signal });
      setMsgs([...history.slice(0, -1), { ...history.at(-1), prompt }, { role: 'assistant', text: out, id: crypto.randomUUID() }]);
    } catch (e) { if (e.name !== 'AbortError') setErr(e.message); }
    setBusy(false);
  }
  async function keep(m, i) {
    const q = msgs[i - 1]?.text ?? 'Chat answer';
    await saveHighlight({ text: m.text, source: { label: `AI chat: ${q.slice(0, 80)}` }, thread: [{ role: 'user', text: q }, { role: 'assistant', text: m.text }] });
    setSavedIds((x) => new Set(x).add(m.id));
  }

  return (
    <Layout title="AI Knowledge Engine" subtitle={`${p.name}${cfg.model ? ' · ' + cfg.model : ''}`}
      actions={<button className={btnGhost} onClick={() => { abort.current?.abort(); setMsgs([]); setErr(''); }}><span className="material-symbols-outlined text-[18px]">delete_sweep</span>New chat</button>}>
      {!ready && (
        <div className="bg-tertiary-fixed text-on-tertiary-fixed-variant rounded-xl p-space-lg flex items-center justify-between">
          <span>No AI provider is set up yet.</span><Link className="font-bold underline" to="/settings">Open Settings</Link>
        </div>
      )}
      <section className={`${card} min-h-[50vh]`}>
        {msgs.length === 0 && <p className="text-on-surface-variant">Ask anything high-yield: a mechanism, a drug, a differential. Turn on “Use web sources” to ground the answer in PubMed and trusted sites.</p>}
        {msgs.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-xl px-space-lg py-space-md whitespace-pre-wrap font-body-reading text-body-reading ${m.role === 'user' ? 'bg-primary-container text-on-primary' : 'bg-surface-container-low text-on-surface'}`}>
              {m.text}
              {m.role === 'assistant' && (
                <div className="mt-space-sm flex gap-space-sm">
                  <button className="text-secondary font-caption-meta text-caption-meta font-bold" onClick={() => keep(m, i)} disabled={savedIds.has(m.id)}>{savedIds.has(m.id) ? 'Saved to Highlights' : 'Save to Highlights'}</button>
                  <button className="text-on-surface-variant font-caption-meta text-caption-meta" onClick={() => navigator.clipboard.writeText(m.text)}>Copy</button>
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && <p className="text-on-surface-variant font-caption-meta text-caption-meta">{web ? 'Searching the web, then thinking…' : 'Thinking…'}</p>}
        {err && <p className="text-error font-caption-meta text-caption-meta">{err}</p>}
        <div ref={end} />
      </section>
      <div className="flex flex-col gap-space-sm">
        <textarea className={input + ' min-h-[88px]'} placeholder="Ask a question…  (Ctrl+Enter to send)" value={text}
          onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(); }} />
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-space-sm font-caption-meta text-caption-meta"><input type="checkbox" checked={web} onChange={(e) => setWeb(e.target.checked)} />Use web sources</label>
          <div className="flex gap-space-sm">
            {busy && <button className={btnGhost} onClick={() => abort.current?.abort()}>Stop</button>}
            <button className={btnPrimary} onClick={send} disabled={busy || !text.trim()}><span className="material-symbols-outlined text-[18px]">send</span>Ask</button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
