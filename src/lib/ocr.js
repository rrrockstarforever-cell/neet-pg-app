import { createWorker } from 'tesseract.js';

let worker = null;
/** OCR an image/canvas/data-URL. Language data is fetched once by tesseract.js and cached. */
export async function ocrImage(src) {
  worker ??= await createWorker('eng');
  const { data } = await worker.recognize(src);
  return (data.text || '').trim();
}
export async function closeOcr() { if (worker) { const w = worker; worker = null; await w.terminate(); } }
