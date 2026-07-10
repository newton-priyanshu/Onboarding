import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(__dirname, 'dist');

const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json',
  '.woff2': 'font/woff2',
};

const server = http.createServer((req, res) => {
  // Resolve the requested path and verify it stays within the dist directory
  // Use path.join first (keeps dist as prefix even when request path starts with /),
  // then path.resolve to normalize any .. traversal segments.
  let fp = path.resolve(path.join(dist, req.url.split('?')[0] === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0])));
  if (!fp.startsWith(dist + path.sep) && fp !== dist) {
    // Path traversal attempt — serve index.html safely instead
    fp = path.join(dist, 'index.html');
  }
  if (!fs.existsSync(fp) || !fs.statSync(fp).isFile()) fp = path.join(dist, 'index.html');
  const ext = path.extname(fp);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
  res.end(fs.readFileSync(fp));
});

server.listen(5199, '127.0.0.1', () => {
  console.log(`Serving on http://127.0.0.1:5199`);
});
