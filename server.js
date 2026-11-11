// Zero-dependency local development & SSR auth server
const http = require('http');
const { loadLocalEnvOnce, getAuthConfig } = require('./api/_lib/auth-core');
const authHandler = require('./api/auth');
const contentHandler = require('./api/content');
const saveHandler = require('./api/save');
const generateHandler = require('./api/generate');
const pageHandler = require('./api/page');

const MAX_BODY_BYTES = 2 * 1024 * 1024;

function createAppServer() {
  return http.createServer((req, res) => {
    const chunks = [];
    let totalBytes = 0;
    let abortedForSize = false;

    req.on('data', (chunk) => {
      if (abortedForSize) return;
      totalBytes += chunk.length;
      if (totalBytes > MAX_BODY_BYTES) {
        abortedForSize = true;
        res.statusCode = 413;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ success: false, error: 'Payload too large' }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', async () => {
      if (abortedForSize) return;

      const rawBody = chunks.length ? Buffer.concat(chunks).toString('utf8') : '';
      try {
        req.body = rawBody ? JSON.parse(rawBody) : {};
      } catch (e) {
        req.body = rawBody;
      }

      let parsedUrl;
      try {
        const host = req.headers.host || '127.0.0.1';
        parsedUrl = new URL(req.url || '/', `http://${host}`);
      } catch (e) {
        parsedUrl = new URL('http://127.0.0.1/');
      }

      req.query = Object.fromEntries(parsedUrl.searchParams);

      const mockRes = {
        getHeader: (k) => res.getHeader(k),
        setHeader: (k, v) => res.setHeader(k, v),
        status: (code) => {
          res.statusCode = code;
          return {
            json: (data) => {
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify(data));
            },
            send: (data) => {
              if (!res.getHeader('Content-Type')) {
                res.setHeader(
                  'Content-Type',
                  typeof data === 'string' && data.trim().startsWith('<')
                    ? 'text/html; charset=utf-8'
                    : 'text/plain; charset=utf-8'
                );
              }
              res.end(data);
            },
            end: (data) => res.end(data)
          };
        }
      };

      const pathname = parsedUrl.pathname;

      try {
        if (pathname.startsWith('/api/_')) {
          req.query = { ...req.query, p: 'notfound' };
          return await pageHandler(req, mockRes);
        }
        if (pathname === '/api/auth') return await authHandler(req, mockRes);
        if (pathname === '/api/content') return await contentHandler(req, mockRes);
        if (pathname === '/api/save') return await saveHandler(req, mockRes);
        if (pathname === '/api/generate') return await generateHandler(req, mockRes);
        if (pathname === '/api/page') return await pageHandler(req, mockRes);

        if (pathname === '/' || pathname === '/index.html') {
          req.query = { ...req.query, p: 'home' };
          return await pageHandler(req, mockRes);
        }

        if (pathname === '/admin' || pathname === '/admin/') {
          req.query = { ...req.query, p: 'admin' };
          return await pageHandler(req, mockRes);
        }

        req.query = { ...req.query, p: 'notfound' };
        return await pageHandler(req, mockRes);
      } catch (err) {
        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ success: false, error: 'Internal Server Error' }));
        }
      }
    });
  });
}

if (require.main === module) {
  loadLocalEnvOnce();
  const PORT = process.env.PORT || 3000;
  const cfg = getAuthConfig();
  const server = createAppServer();
  server.listen(PORT, () => {
    console.log(`🚀 Noon Campaign Hub server running at http://localhost:${PORT}`);
    if (cfg.configured) {
      console.log('🔐 Server password gate is ACTIVE (SITE_PASSWORD & ADMIN_PASSWORD loaded).');
    } else {
      console.warn('⚠️  WARNING: SITE_PASSWORD or ADMIN_PASSWORD not set! All pages/APIs fail closed with 503.');
      console.warn('   Create a .env.local file with SITE_PASSWORD=... and ADMIN_PASSWORD=... for local testing.');
    }
  });
}

module.exports = { createAppServer };
