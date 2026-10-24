import { useEffect, useRef, useState } from 'react';
import Layout, { card, btnPrimary, btnGhost, input } from '../components/Layout.jsx';
import { PROVIDERS, provider, loadSettings, saveSettings, oauth } from '../lib/ai.js';
import { summary } from '../lib/db.js';

function Pill({ ok, children }) {
  return <span className={`px-space-sm py-0.5 rounded-full font-badge-label text-badge-label ${ok ? 'bg-secondary-container text-on-secondary-container' : 'bg-surface-container-high text-on-surface-variant'}`}>{children}</span>;
}

function SubscriptionLogin({ p, connected, onChange }) {
  const [flow, setFlow] = useState(null); // {id,userCode,url,mode}
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function poll(id, every) {
    try {
      const r = await oauth.poll(id);
      if (r.status === 'done') { setFlow(null); setMsg('Signed in.'); onChange(); return; }
      if (r.status === 'error') { setFlow(null); setMsg(r.error || 'Sign-in failed.'); return; }
    } catch (e) { setMsg(e.message); return; }
    timer.current = setTimeout(() => poll(id, every), (every || 5) * 1000);
  }
  async function start() {
    setMsg('');
    try {
      const f = await oauth.start(p.sub);
      setFlow(f);
      window.open(f.url, '_blank');
      if (f.mode !== 'code') poll(f.id, f.interval);
    } catch (e) { setMsg(e.message); }
  }
  async function finish() {
    try { await oauth.complete(flow.id, code.trim()); setFlow(null); setCode(''); setMsg('Signed in.'); onChange(); }
    catch (e) { setMsg(e.message); }
  }
  async function out() { await oauth.logout(p.sub); onChange(); }

  return (
    <div className="flex flex-col gap-space-sm">
      <div className="flex items-center gap-space-md">
        <Pill ok={connected}>{connected ? 'Connected' : flow ? 'Waiting for sign-in…' : 'Not connected'}</Pill>
        {connected ? <button className={btnGhost} onClick={out}>Sign out</button> : <button className={btnPrimary} onClick={start}>Sign in</button>}
      </div>
      {flow && flow.userCode && (
        <div className="bg-surface-container-low rounded-lg p-space-md flex items-center gap-space-md">
          <span className="font-stat-numeral text-stat-numeral tracking-widest text-primary">{flow.userCode}</span>
          <button className={btnGhost} onClick={() => navigator.clipboard.writeText(flow.userCode)}>Copy code</button>
          <span className="text-on-surface-variant font-caption-meta text-caption-meta">Enter it on the page that opened, then approve.</span>
        </div>
      )}
      {flow && flow.mode === 'code' && (
        <div className="flex gap-space-sm">
          <input className={input} placeholder="Paste the code shown after approving" value={code} onChange={(e) => setCode(e.target.value)} />
          <button className={btnPrimary} onClick={finish} disabled={!code.trim()}>Finish</button>
        </div>
      )}
      {msg && <p className="font-caption-meta text-caption-meta text-on-surface-variant">{msg}</p>}
    </div>
  );
}

export default function Settings() {
  const [s, setS] = useState(loadSettings);
  const [status, setStatus] = useState({});
  const [helper, setHelper] = useState('checking');
  const [data, setData] = useState(null);
  const [saved, setSaved] = useState(false);

  const refresh = () => oauth.status().then((r) => { setStatus(r); setHelper('ok'); }).catch(() => setHelper('down'));
  useEffect(() => { refresh(); summary().then(setData).catch(() => setData(false)); }, []);

  const p = provider(s.active);
  const cfg = { apiKey: '', model: p.defaultModel ?? '', baseUrl: p.baseUrl, ...(s.configs[s.active] ?? {}) };
  const setCfg = (patch) => { setSaved(false); setS((x) => ({ ...x, configs: { ...x.configs, [x.active]: { ...cfg, ...patch, modelChosen: true } } })); };
  const save = () => { saveSettings(s); setSaved(true); };

  return (
    <Layout title="Settings & AI Model Connections" subtitle="Choose the AI that powers chat, notes and question explanations."
      actions={<button className={btnPrimary} onClick={save}><span className="material-symbols-outlined text-[18px]">save</span>{saved ? 'Saved' : 'Save settings'}</button>}>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-xl">
        <div className="lg:col-span-8 flex flex-col gap-space-xl">
          <section className={card}>
            <h2 className="font-headline-h2 text-headline-h2 text-primary">Active provider</h2>
            <select className={input} value={s.active} onChange={(e) => { setSaved(false); setS({ ...s, active: e.target.value }); }}>
              {PROVIDERS.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
            {p.note && <p className="text-on-surface-variant font-caption-meta text-caption-meta">{p.note}</p>}
            {p.kind === 'oauth' ? (
              helper === 'down'
                ? <p className="text-error font-caption-meta text-caption-meta">The local sign-in helper is not running. Subscription login works in the desktop app.</p>
                : <SubscriptionLogin p={p} connected={!!status[p.sub]} onChange={refresh} />
            ) : (
              <>
                {p.needsKey !== false && (
                  <label className="flex flex-col gap-space-xs"><span className="font-caption-meta text-caption-meta font-bold">API key</span>
                    <input className={input} type="password" autoComplete="off" value={cfg.apiKey} onChange={(e) => setCfg({ apiKey: e.target.value })} /></label>
                )}
                <label className="flex flex-col gap-space-xs"><span className="font-caption-meta text-caption-meta font-bold">Base URL</span>
                  <input className={input} value={cfg.baseUrl} onChange={(e) => setCfg({ baseUrl: e.target.value })} /></label>
              </>
            )}
            <label className="flex flex-col gap-space-xs"><span className="font-caption-meta text-caption-meta font-bold">Model</span>
              <input className={input} placeholder="e.g. gpt-5, claude-sonnet-4-5, gemini-2.5-flash" value={cfg.model} onChange={(e) => setCfg({ model: e.target.value })} /></label>
          </section>
          <section className={card}>
            <h2 className="font-headline-h2 text-headline-h2 text-primary">Connection status</h2>
            <div className="flex flex-wrap gap-space-md">
              {PROVIDERS.filter((x) => x.kind === 'oauth').map((x) => (
                <div key={x.id} className="flex items-center gap-space-sm"><span className="font-caption-meta text-caption-meta">{x.name}</span><Pill ok={!!status[x.sub]}>{status[x.sub] ? 'Connected' : 'Not connected'}</Pill></div>
              ))}
            </div>
          </section>
        </div>
        <div className="lg:col-span-4 flex flex-col gap-space-xl">
          <section className={card}>
            <h2 className="font-headline-h2 text-headline-h2 text-primary">Your data</h2>
            {data === null && <p className="text-on-surface-variant">Reading library…</p>}
            {data === false && <p className="text-error">Could not open the library database.</p>}
            {data && Object.entries(data).map(([k, v]) => (
              <div key={k} className="flex justify-between font-body-compact text-body-compact"><span className="capitalize text-on-surface-variant">{k}</span><span className="font-bold text-primary">{v}</span></div>
            ))}
            <p className="font-caption-meta text-caption-meta text-on-surface-variant">Stored on this computer in the same database the previous version used.</p>
          </section>
        </div>
      </div>
    </Layout>
  );
}
