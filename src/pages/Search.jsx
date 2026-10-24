import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Layout, { card } from '../components/Layout.jsx';
import { searchAll } from '../lib/search.js';
import * as db from '../lib/db.js';

async function openPdf(docId, page) {
  const f = await db.getFile(docId);
  if (f) window.open(URL.createObjectURL(f) + '#page=' + page, '_blank');
}

export default function Search() {
  const [sp] = useSearchParams();
  const q = sp.get('q') ?? '';
  const [r, setR] = useState(null);
  useEffect(() => { setR(null); searchAll(q).then(setR); }, [q]);
  const total = r ? r.pages.length + r.highlights.length + r.questions.length + r.cards.length + r.docs.length : 0;
  return (
    <Layout title="Search" subtitle={q ? `“${q}”${r && r.terms.length > 1 ? ' · also matching: ' + r.terms.slice(1).join(', ') : ''}` : 'Type in the search bar above'}>
      {r && q && <p className="text-on-surface-variant" data-testid="search-total">{total} result{total === 1 ? '' : 's'} across books, highlights, questions and revision cards.</p>}
      {r && r.docs.length > 0 && <section className={card}><h2 className="font-headline-h2 text-headline-h2 text-primary">Books</h2>{r.docs.map((d) => <Link key={d.id} to="/library" className="text-secondary font-bold">{d.name}</Link>)}</section>}
      {r && r.pages.length > 0 && (
        <section className={card}><h2 className="font-headline-h2 text-headline-h2 text-primary">Book pages</h2>
          {r.pages.map((p, i) => <button key={i} onClick={() => openPdf(p.doc.id, p.page)} className="text-left hover:bg-surface-container-low rounded-lg p-space-sm"><b>{p.doc.name}</b> · p.{p.page} <span className="text-on-surface-variant">— {p.snippet}</span></button>)}
        </section>
      )}
      {r && r.highlights.length > 0 && <section className={card}><h2 className="font-headline-h2 text-headline-h2 text-primary">Highlights</h2>{r.highlights.map((h) => <Link key={h.id} to="/highlights" className="hover:bg-surface-container-low rounded-lg p-space-sm">{h.snippet}</Link>)}</section>}
      {r && r.questions.length > 0 && <section className={card}><h2 className="font-headline-h2 text-headline-h2 text-primary">Logged questions</h2>{r.questions.map((x) => <Link key={x.id} to="/mistakes" className="hover:bg-surface-container-low rounded-lg p-space-sm">{x.text.slice(0, 200)} <span className="text-on-surface-variant">({x.result})</span></Link>)}</section>}
      {r && r.cards.length > 0 && <section className={card}><h2 className="font-headline-h2 text-headline-h2 text-primary">Revision cards</h2>{r.cards.map((x) => <Link key={x.id} to="/mistakes" className="hover:bg-surface-container-low rounded-lg p-space-sm">{x.text.slice(0, 200)}</Link>)}</section>}
      {r && q && total === 0 && <section className={card}><p className="text-on-surface-variant">Nothing found. Try a shorter or different term.</p></section>}
    </Layout>
  );
}
