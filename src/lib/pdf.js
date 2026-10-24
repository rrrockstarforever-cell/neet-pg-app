import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import * as db from './db.js';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/** Import a PDF File: extract text per page and store it exactly like the legacy app (docs + files + pages). */
export async function importPdf(file, onProgress = () => {}) {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data: data.slice() }).promise;
  const pages = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const tc = await page.getTextContent();
    pages.push(tc.items.map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim());
    onProgress(n, pdf.numPages);
  }
  const id = crypto.randomUUID();
  const doc = {
    id, name: file.name, size: file.size, pageCount: pdf.numPages,
    textChars: pages.reduce((a, t) => a + t.length, 0), addedAt: Date.now(),
    needsOcr: pages.filter((t) => t.length < 40).length, ocrPages: 0, subject: '',
  };
  await db.putDocument(doc, file, pages.map((text, i) => ({ docId: id, page: i + 1, text })));
  return doc;
}

/** Case-insensitive search across all stored pages. Returns [{doc, page, snippet}] */
export async function searchPages(query, limit = 50) {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const [docs, pages] = await Promise.all([db.docs(), db.getAll('pages')]);
  const names = new Map(docs.map((d) => [d.id, d]));
  const out = [];
  for (const p of pages) {
    const i = p.text.toLowerCase().indexOf(q);
    if (i < 0 || !names.has(p.docId)) continue;
    out.push({ doc: names.get(p.docId), page: p.page, snippet: (i > 60 ? '…' : '') + p.text.slice(Math.max(0, i - 60), i + q.length + 100) });
    if (out.length >= limit) break;
  }
  return out;
}

/** OCR every page that has almost no text layer. Updates pages + doc counters in the legacy schema. */
export async function ocrDocument(doc, onProgress = () => {}) {
  const { ocrImage, closeOcr } = await import('./ocr.js');
  const file = await db.getFile(doc.id);
  if (!file) throw new Error('The stored PDF file is missing.');
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages = (await db.getAll('pages')).filter((p) => p.docId === doc.id);
  const todo = pages.filter((p) => p.text.trim().length < 40).sort((a, b) => a.page - b.page);
  let done = 0;
  try {
    for (const p of todo) {
      onProgress(done, todo.length);
      const page = await pdf.getPage(p.page);
      const vp = page.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas'); canvas.width = vp.width; canvas.height = vp.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
      const text = (await ocrImage(canvas)).replace(/\s+/g, ' ').trim();
      await db.put('pages', { docId: doc.id, page: p.page, text, ocr: true });
      done++;
    }
  } finally { await closeOcr(); }
  const all = (await db.getAll('pages')).filter((p) => p.docId === doc.id);
  const d = await db.get('docs', doc.id);
  await db.put('docs', { ...d, ocrPages: (d.ocrPages || 0) + done, needsOcr: all.filter((p) => p.text.trim().length < 40).length, textChars: all.reduce((a, p) => a + p.text.length, 0) });
  onProgress(todo.length, todo.length);
  return done;
}
