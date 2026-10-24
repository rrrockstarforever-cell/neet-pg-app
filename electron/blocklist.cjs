// Sites blocked in the app's built-in browser. Source: the user's Focuser "Study" list.
// A snapshot ships with the app (blocklist.json); if Focuser's database is found on this computer, its current list is
// read (read-only) and added, so changes in Focuser carry over. Nothing is ever written to Focuser.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SNAPSHOT = path.join(__dirname, 'blocklist.json');
const candidates = () => [
  path.join(os.homedir(), '.local', 'share', 'focuser', 'focuser.db'),
  process.env.APPDATA && path.join(process.env.APPDATA, 'focuser', 'focuser.db'),
  process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'focuser', 'focuser.db'),
].filter(Boolean);

let domains = new Set();
let wild = [];
let info = { source: 'none', count: 0 };
let liveStamp = 0;

const wildToRegex = (w) => new RegExp('^' + w.toLowerCase().replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');

function loadSnapshot() {
  try {
    const j = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
    domains = new Set(j.domains);
    wild = (j.wildcards || []).map(wildToRegex);
    info = { source: 'built-in copy of your Focuser list', count: domains.size };
  } catch { /* no snapshot: nothing blocked */ }
}

function loadLive() {
  for (const p of candidates()) {
    try {
      const m = fs.statSync(p).mtimeMs;
      if (m === liveStamp) return;
      const { DatabaseSync } = require('node:sqlite');
      const db = new DatabaseSync(p, { readOnly: true });
      const rows = db.prepare('select data from block_lists where enabled = 1').all();
      db.close();
      const d = new Set(domains);
      const w = [...wild];
      for (const r of rows) {
        for (const s of JSON.parse(r.data).websites || []) {
          if (s.enabled === false || !s.match_type) continue;
          if (s.match_type.Domain) d.add(String(s.match_type.Domain).toLowerCase().trim());
          if (s.match_type.Wildcard) w.push(wildToRegex(String(s.match_type.Wildcard)));
        }
      }
      domains = d;
      wild = w;
      liveStamp = m;
      info = { source: 'your Focuser list (read from this computer)', count: domains.size };
      return;
    } catch { /* Focuser not installed, locked, or unreadable: keep the built-in copy */ }
  }
}

loadSnapshot();
loadLive();

function isBlocked(url) {
  let h;
  try { h = new URL(url).hostname.toLowerCase().replace(/\.$/, ''); } catch { return false; }
  if (!h) return false;
  const parts = h.split('.');
  for (let i = 0; i < parts.length - 1; i++) if (domains.has(parts.slice(i).join('.'))) return true; // the site or any parent domain
  return wild.some((re) => re.test(h));
}

const refresh = () => loadLive();
const status = () => ({ ...info });

const blockPage = (url) => {
  let h = '';
  try { h = new URL(url).hostname; } catch { /* ignore */ }
  const esc = h.replace(/[&<>"]/g, '');
  return 'data:text/html;charset=utf-8,' + encodeURIComponent(
    `<!doctype html><meta charset="utf-8"><title>Blocked</title><body style="font-family:system-ui;max-width:520px;margin:15vh auto;color:#1f2937;text-align:center">` +
    `<h1 style="font-size:1.4rem">🚫 ${esc} is on your Focuser block list</h1>` +
    `<p>The app's browser blocks the same sites as Focuser. You can turn this off with the checkbox above the browser.</p></body>`);
};

module.exports = { isBlocked, refresh, status, blockPage };
