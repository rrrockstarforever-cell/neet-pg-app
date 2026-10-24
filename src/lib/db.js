// Same IndexedDB database as the legacy app ("neetpg", v4) so existing books, questions, cards and highlights show up unchanged.
const NAME = 'neetpg', VERSION = 4;
let dbp = null;

function open() {
  return (dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(NAME, VERSION);
    req.onupgradeneeded = (ev) => {
      const db = req.result, tx = req.transaction, old = ev.oldVersion;
      const has = (n) => db.objectStoreNames.contains(n);
      if (old < 1) {
        db.createObjectStore('docs', { keyPath: 'id' });
        db.createObjectStore('files');
        db.createObjectStore('pages', { keyPath: ['docId', 'page'] }).createIndex('byDoc', 'docId');
        db.createObjectStore('notes', { keyPath: 'id' }).createIndex('byDoc', 'docId');
      }
      for (const n of ['questions', 'mocknotes', 'cards', 'highlights']) if (!has(n)) db.createObjectStore(n, { keyPath: 'id' });
      void tx;
    };
    req.onsuccess = () => { req.result.onversionchange = () => { req.result.close(); dbp = null; }; resolve(req.result); };
    req.onerror = () => { dbp = null; reject(req.error); };
  }));
}
const wrap = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function store(name, mode = 'readonly') { return (await open()).transaction(name, mode).objectStore(name); }

export const getAll = async (name) => wrap((await store(name)).getAll());
export const get = async (name, key) => wrap((await store(name)).get(key));
export const put = async (name, val, key) => wrap((await store(name, 'readwrite')).put(val, key));
export const del = async (name, key) => wrap((await store(name, 'readwrite')).delete(key));
export const count = async (name) => wrap((await store(name)).count());

const byNew = (k) => (a, b) => (b[k] ?? 0) - (a[k] ?? 0);
export const docs = async () => (await getAll('docs')).sort(byNew('addedAt'));
export const questions = async () => (await getAll('questions')).sort(byNew('createdAt'));
export const highlights = async () => (await getAll('highlights')).sort(byNew('createdAt'));
export const cards = () => getAll('cards');
export const notes = () => getAll('notes');
export const mockNotes = async () => (await getAll('mocknotes')).sort(byNew('createdAt'));
export const saveHighlight = (h) => put('highlights', { id: crypto.randomUUID(), createdAt: Date.now(), ...h });
export const deleteHighlight = (id) => del('highlights', id);
export const saveQuestion = (q) => put('questions', q);

export async function summary() {
  const [d, q, c, h, n] = await Promise.all(['docs', 'questions', 'cards', 'highlights', 'notes'].map(count));
  return { docs: d, questions: q, cards: c, highlights: h, notes: n };
}
