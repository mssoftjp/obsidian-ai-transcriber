import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { resolve, basename } from 'node:path';
const root = resolve('tmp/media-browser');
createServer((req, res) => {
  if (req.url === '/') { res.end('<!doctype html><html><body><script src="/harness.js"></script></body></html>'); return; }
  const name = basename(new URL(req.url, 'http://localhost').pathname);
  const file = resolve(root, req.url.startsWith('/fixtures/') ? 'fixtures' : '.', name);
  try {
    const { size } = statSync(file);
    const types = { mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mkv: 'video/x-matroska', js: 'text/javascript' };
    const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
    const start = range ? Number(range[1]) : 0;
    const end = range?.[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start >= size || end < start) { res.writeHead(416); res.end(); return; }
    res.writeHead(range ? 206 : 200, {
      'Content-Type': types[name.split('.').pop()] || 'application/octet-stream',
      'Content-Length': end - start + 1,
      'Accept-Ranges': 'bytes',
      ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {})
    });
    createReadStream(file, { start, end }).pipe(res);
  } catch { res.writeHead(404); res.end(); }
}).listen(8771, '127.0.0.1');
