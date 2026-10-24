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
