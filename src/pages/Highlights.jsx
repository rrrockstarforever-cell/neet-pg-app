import { useEffect, useState } from 'react';
import Layout, { card, btnGhost } from '../components/Layout.jsx';
import { highlights, deleteHighlight } from '../lib/db.js';

export default function Highlights() {
  const [items, setItems] = useState(null);
  const [err, setErr] = useState('');
  const load = () => highlights().then(setItems).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);
  async function remove(id) { await deleteHighlight(id); load(); }
  return (
    <Layout title="Highlights & Saved" subtitle={items ? `${items.length} saved passage${items.length === 1 ? '' : 's'}` : ''}>
      {err && <p className="text-error">{err}</p>}
      {items && items.length === 0 && <section className={card}><p className="text-on-surface-variant">Nothing saved yet. Save an AI answer or a PDF selection and it appears here.</p></section>}
      {items?.map((h) => (
        <section key={h.id} className={card}>
          <div className="flex justify-between gap-space-md font-caption-meta text-caption-meta text-on-surface-variant">
            <span>{h.source?.label ?? 'Saved passage'}</span><span>{new Date(h.createdAt).toLocaleString()}</span>
          </div>
          <p className="whitespace-pre-wrap font-body-reading text-body-reading">{h.text}</p>
          {h.thread?.length > 1 && (
            <details className="bg-surface-container-low rounded-lg p-space-md">
              <summary className="cursor-pointer font-caption-meta text-caption-meta font-bold">Conversation ({h.thread.length})</summary>
              {h.thread.map((m, i) => <p key={i} className="mt-space-sm whitespace-pre-wrap"><b>{m.role === 'user' ? 'You' : 'AI'}:</b> {m.text}</p>)}
            </details>
          )}
          <div className="flex gap-space-sm">
            <button className={btnGhost} onClick={() => navigator.clipboard.writeText(h.text)}>Copy</button>
            <button className={btnGhost} onClick={() => remove(h.id)}>Delete</button>
          </div>
        </section>
      ))}
    </Layout>
  );
}
