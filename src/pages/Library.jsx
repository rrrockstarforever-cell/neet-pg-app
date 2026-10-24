import { useEffect, useRef, useState } from 'react';
import Layout, { card, btnPrimary, btnGhost, input } from '../components/Layout.jsx';
import * as db from '../lib/db.js';
import { importPdf, searchPages } from '../lib/pdf.js';

const SUBJECTS = ['', 'Anatomy', 'Physiology', 'Biochemistry', 'Pathology', 'Pharmacology', 'Microbiology', 'Forensic Medicine', 'PSM', 'ENT', 'Ophthalmology', 'Medicine', 'Surgery', 'Obstetrics & Gynaecology', 'Paediatrics', 'Orthopaedics', 'Dermatology', 'Psychiatry', 'Anaesthesia', 'Radiology'];
const mb = (n) => (n / 1048576).toFixed(1) + ' MB';

export default function Library() {
  const [docs, setDocs] = useState(null);
  const [progress, setProgress] = useState(null);
  const [errors, setErrors] = useState([]);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState([]);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef(null);
  const load = () => db.docs().then(setDocs).catch((e) => setErrors([e.message]));
  useEffect(() => { load(); }, []);
  useEffect(() => { const t = setTimeout(() => searchPages(q).then(setHits), 250); return () => clearTimeout(t); }, [q, docs]);

  async function add(files) {
    const list = [...files].filter((f) => /\.pdf$/i.test(f.name) || f.type === 'application/pdf');
    const bad = [...files].length - list.length;
    setErrors(bad ? [`${bad} file(s) skipped: only PDFs are supported.`] : []);
    for (const f of list) {
      try { setProgress({ name: f.name, n: 0, total: 1 }); await importPdf(f, (n, total) => setProgress({ name: f.name, n, total })); }
      catch (e) { setErrors((x) => [...x, `${f.name}: ${e.message}`]); }
    }
    setProgress(null); load();
  }
  async function open(d) {
    const f = await db.getFile(d.id);
    if (f) window.open(URL.createObjectURL(f), '_blank');
  }
  async function remove(d) { if (confirm(`Delete "${d.name}" and its notes?`)) { await db.deleteDocument(d.id); load(); } }
  async function subject(d, s) { await db.setSubject(d.id, s); load(); }

  const grouped = {};
  (docs ?? []).forEach((d) => (grouped[d.subject || 'Unsorted'] ??= []).push(d));

  return (
    <Layout title="Library (PDF & Books)" subtitle={docs ? `${docs.length} book${docs.length === 1 ? '' : 's'} · ${docs.reduce((a, d) => a + (d.pageCount || 0), 0)} pages` : ''}
      actions={<button className={btnPrimary} onClick={() => fileRef.current.click()}><span className="material-symbols-outlined text-[18px]">upload_file</span>Import PDF</button>}>
      <input ref={fileRef} data-testid="pdf-input" type="file" accept="application/pdf,.pdf" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
      <div onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files); }}
        className={`rounded-xl border-2 border-dashed p-space-xl text-center ${drag ? 'border-secondary bg-secondary-container/30' : 'border-outline-variant'}`}>
        {progress ? <p>Reading <b>{progress.name}</b> — page {progress.n} of {progress.total}</p> : <p className="text-on-surface-variant">Drop PDFs here, or use Import PDF. Text is extracted on this computer.</p>}
      </div>
      {errors.map((e, i) => <p key={i} className="text-error font-caption-meta text-caption-meta">{e}</p>)}
      <div className="flex items-center gap-space-sm bg-surface-container-lowest border border-outline-variant rounded-lg px-space-md">
        <span className="material-symbols-outlined text-on-surface-variant">search</span>
        <input className={input + ' !border-0'} placeholder="Search the text of every book…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {q.trim().length >= 2 && (
        <section className={card}>
          <h2 className="font-headline-h2 text-headline-h2 text-primary">{hits.length} match{hits.length === 1 ? '' : 'es'}</h2>
          {hits.map((h, i) => <p key={i} className="font-body-compact text-body-compact"><b>{h.doc.name}</b> · p.{h.page} — <span className="text-on-surface-variant">{h.snippet}</span></p>)}
        </section>
      )}
      {docs && docs.length === 0 && !progress && <section className={card}><p className="text-on-surface-variant">Your library is empty. Import a textbook or notes PDF to begin.</p></section>}
      {Object.entries(grouped).sort().map(([sub, list]) => (
        <section key={sub} className="flex flex-col gap-space-md">
          <h2 className="font-headline-h2 text-headline-h2 text-primary">{sub} <span className="text-on-surface-variant font-caption-meta text-caption-meta">({list.length})</span></h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-space-lg">
            {list.map((d) => (
              <div key={d.id} data-testid="doc-card" className={card}>
                <div className="flex items-start gap-space-md">
                  <span className="material-symbols-outlined text-secondary text-[32px]">picture_as_pdf</span>
                  <div className="min-w-0"><p className="font-subheading-h3 text-subheading-h3 truncate" title={d.name}>{d.name}</p>
                    <p className="font-caption-meta text-caption-meta text-on-surface-variant">{d.pageCount} pages · {mb(d.size)}{d.needsOcr ? ` · ${d.needsOcr} page(s) need OCR` : ''}</p></div>
                </div>
                <select className={input} value={d.subject || ''} onChange={(e) => subject(d, e.target.value)}>
                  {SUBJECTS.map((s) => <option key={s} value={s}>{s || 'Choose subject…'}</option>)}
                </select>
                <div className="flex gap-space-sm"><button className={btnGhost} onClick={() => open(d)}>Open</button><button className={btnGhost} onClick={() => remove(d)}>Delete</button></div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </Layout>
  );
}
