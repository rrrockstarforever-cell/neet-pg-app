import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout, { btnGhost, btnPrimary, input } from '../components/Layout.jsx';
import { ocrImage } from '../lib/ocr.js';
import { saveHighlight } from '../lib/db.js';

const LINKS = [['PubMed', 'https://pubmed.ncbi.nlm.nih.gov/'], ['StatPearls', 'https://www.ncbi.nlm.nih.gov/books/NBK430685/'], ['WHO', 'https://www.who.int/'], ['MedlinePlus', 'https://medlineplus.gov/'], ['DuckDuckGo', 'https://duckduckgo.com/']];
const norm = (u) => (/^https?:\/\//i.test(u) ? u : /\s|^[^.]+$/.test(u) ? 'https://duckduckgo.com/?q=' + encodeURIComponent(u) : 'https://' + u);

export default function Browser() {
  const nb = window.native?.browser;
  const navigate = useNavigate();
  const box = useRef(null);
  const [st, setSt] = useState({ url: '', title: '', canBack: false, canForward: false, loading: false });
  const [url, setUrl] = useState('');
  const [msg, setMsg] = useState('');
  const [block, setBlock] = useState(true);

  useEffect(() => {
    if (!nb) return;
    nb.open('https://pubmed.ncbi.nlm.nih.gov/');
    const off = nb.onState((s) => { setSt(s); setUrl(s.url); });
    const push = () => { const r = box.current?.getBoundingClientRect(); if (r) nb.setBounds({ x: r.x, y: r.y, width: r.width, height: r.height }); };
    const ro = new ResizeObserver(push); ro.observe(box.current);
    window.addEventListener('resize', push); window.addEventListener('scroll', push, true); push();
    return () => { ro.disconnect(); window.removeEventListener('resize', push); window.removeEventListener('scroll', push, true); off(); nb.setBounds(null); };
  }, []);

  const go = (u) => (nb ? nb.go(norm(u)) : window.open(norm(u), '_blank', 'noopener'));
  async function capture() {
    setMsg('Reading the page…');
    try {
      const png = await nb.capture();
      const text = await ocrImage('data:image/png;base64,' + png);
      sessionStorage.setItem('neetpg.draft', JSON.stringify({ text }));
      navigate('/mistakes?add=1');
    } catch (e) { setMsg(e.message); }
  }
  async function saveText() {
    try { const t = await nb.text(); await saveHighlight({ text: t.text.slice(0, 6000), source: { label: t.title || t.url, url: t.url } }); setMsg('Saved page text to Highlights.'); } catch (e) { setMsg(e.message); }
  }
  return (
    <Layout title="Clinical Browser" subtitle="Isolated browser: your study data is never visible to the pages you open">
      <form className="flex gap-space-sm" onSubmit={(e) => { e.preventDefault(); go(url); }}>
        <button type="button" className={btnGhost} disabled={!st.canBack} onClick={() => nb.action('back')}>←</button>
        <button type="button" className={btnGhost} disabled={!st.canForward} onClick={() => nb.action('forward')}>→</button>
        <button type="button" className={btnGhost} onClick={() => nb?.action(st.loading ? 'stop' : 'reload')}>{st.loading ? 'Stop' : 'Reload'}</button>
        <input data-testid="url" className={input} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Search or type a web address" />
        <button className={btnPrimary}>Go</button>
      </form>
      <div className="flex gap-space-sm flex-wrap items-center">
        {LINKS.map(([n, u]) => <button key={n} className={btnGhost} onClick={() => go(u)}>{n}</button>)}
        {nb && <>
          <button className={btnPrimary} onClick={capture}>Capture question (OCR)</button>
          <button className={btnGhost} onClick={saveText}>Save page text</button>
          <label className="flex items-center gap-space-xs"><input type="checkbox" checked={block} onChange={(e) => { setBlock(e.target.checked); nb.block(e.target.checked); }} />Block distracting sites</label>
        </>}
      </div>
      {msg && <p className="text-on-surface-variant">{msg}</p>}
      {nb ? <div ref={box} data-testid="browser-area" className="w-full rounded-xl border border-outline-variant bg-surface-container-lowest" style={{ height: 'calc(100vh - 330px)', minHeight: 320 }} />
        : <div className="rounded-xl border border-outline-variant p-space-xl text-on-surface-variant" data-testid="browser-web-note">The embedded isolated browser is available in the desktop app. In a normal browser, these buttons open sites in a new tab.</div>}
    </Layout>
  );
}
