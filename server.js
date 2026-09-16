// Zero-dependency local development server
const http = require('http');
const fs = require('fs');
const path = require('path');

const authHandler = require('./api/auth');
const contentHandler = require('./api/content');
const saveHandler = require('./api/save');
const generateHandler = require('./api/generate');

const PORT = process.env.PORT || 3000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', async () => {
    try { req.body = body ? JSON.parse(body) : {}; } catch (e) { req.body = body; }
    req.query = Object.fromEntries(url.searchParams);

    const mockRes = {
      setHeader: (k, v) => res.setHeader(k, v),
      status: (c) => {
        res.statusCode = c;
        return {
          json: (d) => {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify(d));
          },
          end: () => res.end()
        };
      }
    };

    // Route Serverless APIs
    if (url.pathname === '/api/auth') return authHandler(req, mockRes);
    if (url.pathname === '/api/content') return contentHandler(req, mockRes);
    if (url.pathname === '/api/save') return saveHandler(req, mockRes);
    if (url.pathname === '/api/generate') return generateHandler(req, mockRes);

    // Route /admin to index.html
    if (url.pathname === '/admin') {
      let filePath = path.join(__dirname, 'index.html');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(filePath));
      return;
    }

    // Static Files
    let reqPath = url.pathname === '/' ? '/index.html' : url.pathname;
    let filePath = path.join(__dirname, reqPath);

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
      res.end(fs.readFileSync(filePath));
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
    }
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Noon Campaign Hub is running locally at http://localhost:${PORT}`);
  console.log(`🔐 Default Admin Password: noon@admin#2026`);
});
