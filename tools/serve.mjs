// Serves dist-new + the real local helper API (same routes the Electron app exposes). `node tools/serve.mjs [port]`
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { handleNode } from '../server/api.mjs';

const root = path.resolve(import.meta.dirname, '..', 'dist-new');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff': 'font/woff', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.json': 'application/json' };
export function serve(port = 5190) {
  const srv = http.createServer((req, res) => {
    if (req.url.startsWith('/api/')) { req.url = req.url.slice(4); return handleNode(req, res); }
    let f = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(root, 'index.html');
    res.setHeader('Content-Type', types[path.extname(f)] || 'application/octet-stream');
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((r) => srv.listen(port, '127.0.0.1', () => r(srv)));
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) serve(+process.argv[2] || 5190).then(() => console.log('serving'));
