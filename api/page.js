const fs = require('fs');
const path = require('path');
const {
  getAuthConfig,
  verifyToken,
  parseCookies,
  applyPageSecurityHeaders,
  safeJsonForHtmlScript
} = require('./_lib/auth-core');

const PRIVATE_DIR = path.join(__dirname, '_private');

function readPrivateFile(filename) {
  return fs.readFileSync(path.join(PRIVATE_DIR, filename), 'utf8');
}

function sendHtml(req, res, statusCode, html) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (req.method === 'HEAD') {
    res.status(statusCode).end();
    return;
  }
  res.status(statusCode).send(html);
}

function sendText(req, res, statusCode, text) {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  if (req.method === 'HEAD') {
    res.status(statusCode).end();
    return;
  }
  res.status(statusCode).send(text);
}

function injectBootstrap(hubHtml, bootstrap) {
  const payloadScript =
    `<script id="noon-bootstrap-data">window.__NOON_BOOTSTRAP__ = ${safeJsonForHtmlScript(bootstrap)};</script>`;

  if (hubHtml.includes('</head>')) {
    return hubHtml.replace('</head>', `  ${payloadScript}\n</head>`);
  }
  if (hubHtml.includes('</body>')) {
    return hubHtml.replace('</body>', `${payloadScript}\n</body>`);
  }
  return `${payloadScript}\n${hubHtml}`;
}

module.exports = async function handler(req, res) {
  applyPageSecurityHeaders(res);

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(405).json({ success: false, error: 'Method Not Allowed' });
    return;
  }

  try {
    let pathname = '/';
    try {
      const parsed = new URL(req.url || '/', 'http://localhost');
      pathname = parsed.pathname;
    } catch (e) {
      pathname = '/';
    }

    const p = req.query && req.query.p ? String(req.query.p).trim().toLowerCase() : '';

    if (p === 'notfound') {
      sendText(req, res, 404, '404 Not Found');
      return;
    }

    const allowedDirectPaths = ['/', '/index.html', '/admin', '/admin/', '/api/page'];
    if (p && p !== 'home' && p !== 'admin') {
      sendText(req, res, 404, '404 Not Found');
      return;
    }
    if (!p && !allowedDirectPaths.includes(pathname)) {
      sendText(req, res, 404, '404 Not Found');
      return;
    }

    const isAdminPath = p === 'admin' || pathname === '/admin' || pathname === '/admin/';
    const loginHtml = readPrivateFile('login.html');
    const cfg = getAuthConfig();

    if (!cfg.configured) {
      sendHtml(req, res, 503, loginHtml);
      return;
    }

    const cookies = parseCookies(req);
    const isSiteAuthed = verifyToken(cookies.noon_site, 'site', cfg.signingKey);

    if (!isSiteAuthed) {
      sendHtml(req, res, 200, loginHtml);
      return;
    }

    const isAdmin = verifyToken(cookies.noon_admin, 'admin', cfg.signingKey);
    const rawData = readPrivateFile('campaign-data.json');
    const data = JSON.parse(rawData);
    const hubHtml = readPrivateFile('hub.html');

    const bootstrap = {
      static: (data && data.static) ? data.static : {},
      campaigns: Array.isArray(data && data.campaigns) ? data.campaigns : [],
      isAdmin: Boolean(isAdmin),
      openAdmin: Boolean(isAdminPath)
    };

    const renderedHtml = injectBootstrap(hubHtml, bootstrap);
    sendHtml(req, res, 200, renderedHtml);
  } catch (err) {
    res.status(500).json({ success: false, error: 'حدث خطأ داخلي في الخادم' });
  }
};
