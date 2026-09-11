// Dev server: serves dist/ and accepts POST /frame?name=X with a data-URL body,
// writing the decoded image to the directory given as argv[2]. Used for
// headless render checks; not part of the game.
const http = require('http');
const fs = require('fs');
const path = require('path');
const dist = path.join(__dirname, 'dist');
const outDir = process.argv[2] || __dirname;
const port = parseInt(process.argv[3] || '8767', 10);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.png': 'image/png' };

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'POST' && url.pathname === '/frame') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      const name = (url.searchParams.get('name') || 'frame').replace(/[^a-z0-9_-]/gi, '');
      const m = /^data:image\/(png|jpeg);base64,(.*)$/s.exec(body);
      if (!m) { res.writeHead(400); res.end('bad body'); return; }
      const file = path.join(outDir, `${name}.${m[1] === 'png' ? 'png' : 'jpg'}`);
      fs.writeFileSync(file, Buffer.from(m[2], 'base64'));
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(file);
    });
    return;
  }
  const file = path.join(dist, url.pathname === '/' ? 'tidewright.html' : url.pathname);
  if (!file.startsWith(dist) || !fs.existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}).listen(port, () => console.log(`devserver on http://localhost:${port} writing frames to ${outDir}`));
