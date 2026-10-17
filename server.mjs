import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('./dist', import.meta.url));
const base = process.argv.find(arg => arg.startsWith('--base='))?.slice(7) || '/';
if (!base.startsWith('/') || !base.endsWith('/')) throw Error('The base path must start and end with a slash.');
const mime = { '.html': 'text/html', '.css': 'text/css', '.mjs': 'text/javascript' };
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (base !== '/' && pathname === base.slice(0, -1)) { res.writeHead(301, { Location: base }).end(); return; }
    if (!pathname.startsWith(base)) { res.writeHead(404).end('Not found'); return; }
    const relative = pathname.slice(base.length) || 'index.html';
    const path = resolve(root, relative);
    if (!path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    const data = await readFile(path);
    res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(data);
  } catch { res.writeHead(404).end('Not found'); }
});
const port = Number(process.env.PORT || 4174);
server.listen(port, '127.0.0.1', () => console.log(`Local: http://127.0.0.1:${port}${base}`));
