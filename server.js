const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.webp': 'image/webp',
  '.webm': 'video/webm',
  '.mp4':  'video/mp4',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
};

http.createServer((req, res) => {
  const reqPath = req.url === '/' ? 'index.html' : req.url.split('?')[0];
  const filePath = path.join(__dirname, reqPath);
  const fallbackPath = path.join(__dirname, 'public', reqPath.replace(/^\//, ''));

  function sendFile(targetPath, next) {
    const ext = path.extname(targetPath).toLowerCase();
    fs.readFile(targetPath, (err, data) => {
      if (err) {
        next?.();
        return;
      }
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=86400',
      });
      res.end(data);
    });
  }

  sendFile(filePath, () => {
    if (reqPath === 'index.html') {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }
    sendFile(fallbackPath, () => {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
    });
  });
}).listen(PORT, () => {
  console.log(`看点 server running on http://0.0.0.0:${PORT}`);
});
