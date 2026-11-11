const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;   // 7 days
const ADMIN_TTL_MS = 8 * 60 * 60 * 1000;       // 8 hours
const RATE_WINDOW_MS = 15 * 60 * 1000;         // 15 minutes
const RATE_MAX_FAILURES = 8;
const MAX_RATE_ENTRIES = 2000;

let _localEnvLoaded = false;
const _rateStore = new Map();

function loadLocalEnvOnce(rootDir) {
  if (_localEnvLoaded || process.env.VERCEL) return;
  _localEnvLoaded = true;
  const baseDir = rootDir || path.resolve(__dirname, '..', '..');
  const envFiles = ['.env', '.env.local'];

  for (const file of envFiles) {
    const fullPath = path.join(baseDir, file);
    if (!fs.existsSync(fullPath)) continue;
    try {
      const content = fs.readFileSync(fullPath, 'utf8');
      const lines = content.split(/\r?\n/);
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const eqIdx = line.indexOf('=');
        if (eqIdx <= 0) continue;
        const key = line.slice(0, eqIdx).trim();
        let val = line.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (key && process.env[key] === undefined) {
          process.env[key] = val;
        }
      }
    } catch (e) {
      // Fail safely without exposing paths or partial env lines
    }
  }
}

function getAuthConfig() {
  loadLocalEnvOnce();
  const sitePassword = typeof process.env.SITE_PASSWORD === 'string' ? process.env.SITE_PASSWORD.trim() : '';
  const adminPassword = typeof process.env.ADMIN_PASSWORD === 'string' ? process.env.ADMIN_PASSWORD.trim() : '';

  if (!sitePassword || !adminPassword) {
    return {
      configured: false,
      sitePassword: '',
      adminPassword: '',
      signingKey: null,
      reason: 'MISSING_ENV_PASSWORDS'
    };
  }

  const explicitSecret = typeof process.env.AUTH_SECRET === 'string' ? process.env.AUTH_SECRET.trim() : '';
  const signingKey = explicitSecret
    ? crypto.createHash('sha256').update('noon-auth-secret-v2:' + explicitSecret, 'utf8').digest()
    : crypto.createHmac('sha256', 'noon-campaign-hub-key-derivation-v2')
        .update(sitePassword + '\x00' + adminPassword, 'utf8')
        .digest();

  return {
    configured: true,
    sitePassword,
    adminPassword,
    signingKey,
    reason: null
  };
}

function verifyPassword(candidate, expected) {
  if (typeof candidate !== 'string' || typeof expected !== 'string') return false;
  const candTrim = candidate.trim();
  const expTrim = expected.trim();
  if (!candTrim || !expTrim) return false;

  const candDigest = crypto.createHash('sha256').update(candTrim, 'utf8').digest();
  const expDigest = crypto.createHash('sha256').update(expTrim, 'utf8').digest();
  return crypto.timingSafeEqual(candDigest, expDigest);
}

function signToken(scope, ttlMs, signingKey) {
  if (!signingKey || (scope !== 'site' && scope !== 'admin')) {
    throw new Error('Cannot sign token without valid scope and key');
  }
  const expiresAt = Date.now() + ttlMs;
  const nonce = crypto.randomBytes(16).toString('hex');
  const message = `${scope}:${expiresAt}:${nonce}`;
  const sig = crypto.createHmac('sha256', signingKey).update(message, 'utf8').digest('hex');
  return `${expiresAt}.${nonce}.${sig}`;
}

function verifyToken(token, expectedScope, signingKey) {
  if (!signingKey || typeof token !== 'string') return false;
  if (expectedScope !== 'site' && expectedScope !== 'admin') return false;

  const trimmed = token.trim();
  const parts = trimmed.split('.');
  if (parts.length !== 3) return false;

  const [expStr, nonce, sig] = parts;
  if (!/^\d{10,16}$/.test(expStr)) return false;
  if (!/^[a-f0-9]{32}$/.test(nonce)) return false;
  if (!/^[a-f0-9]{64}$/.test(sig)) return false;

  const expiresAt = Number(expStr);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;

  const expectedSig = crypto
    .createHmac('sha256', signingKey)
    .update(`${expectedScope}:${expiresAt}:${nonce}`, 'utf8')
    .digest('hex');

  const sigBuf = Buffer.from(sig, 'hex');
  const expectedBuf = Buffer.from(expectedSig, 'hex');
  if (sigBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expectedBuf);
}

function parseCookies(req) {
  const out = Object.create(null);
  const header = (req && req.headers && req.headers.cookie) ? String(req.headers.cookie) : '';
  if (!header) return out;

  const pairs = header.split(';');
  for (let i = 0; i < pairs.length; i++) {
    const part = pairs[i];
    const eqIdx = part.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = part.slice(0, eqIdx).trim();
    const rawVal = part.slice(eqIdx + 1).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(rawVal);
    } catch (e) {
      out[key] = rawVal;
    }
  }
  return out;
}

function isHttpsRequest(req) {
  if (process.env.VERCEL === '1') return true;
  if (!req || !req.headers) return false;
  const proto = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
  if (proto.split(',')[0].trim() === 'https') return true;
  if (req.socket && req.socket.encrypted) return true;
  return false;
}

function buildCookieHeader(req, name, value, maxAgeSeconds) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax'
  ];
  if (typeof maxAgeSeconds === 'number') {
    parts.push(`Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`);
  }
  if (maxAgeSeconds === 0) {
    parts.push('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  }
  if (isHttpsRequest(req)) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

function appendSetCookie(res, cookieHeader) {
  if (!res || !res.setHeader) return;
  let existing = [];
  if (typeof res.getHeader === 'function') {
    const cur = res.getHeader('Set-Cookie');
    if (Array.isArray(cur)) existing = cur.slice();
    else if (typeof cur === 'string' && cur) existing = [cur];
  }
  existing.push(cookieHeader);
  res.setHeader('Set-Cookie', existing);
}

function verifySameOrigin(req) {
  if (!req || !req.headers) return true;
  const origin = req.headers.origin;
  const referer = req.headers.referer;
  const hostHeader = String(req.headers['x-forwarded-host'] || req.headers.host || '').trim().toLowerCase();

  if (origin !== undefined) {
    if (!origin || origin === 'null') return false;
    try {
      const parsedOrigin = new URL(origin);
      if (!hostHeader) return false;
      return parsedOrigin.host.toLowerCase() === hostHeader;
    } catch (e) {
      return false;
    }
  }

  if (referer !== undefined && referer !== '') {
    try {
      const parsedRef = new URL(referer);
      if (!hostHeader) return false;
      return parsedRef.host.toLowerCase() === hostHeader;
    } catch (e) {
      return false;
    }
  }

  return true;
}

function getClientIp(req) {
  if (!req || !req.headers) return 'unknown';
  const xRealIp = req.headers['x-real-ip'];
  if (xRealIp) return String(xRealIp).trim();
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  if (req.socket && req.socket.remoteAddress) return String(req.socket.remoteAddress);
  return 'unknown';
}

function sweepExpiredRateEntries(now) {
  for (const [k, v] of _rateStore.entries()) {
    if (!v || now - v.windowStart >= RATE_WINDOW_MS) {
      _rateStore.delete(k);
    }
  }
  while (_rateStore.size >= MAX_RATE_ENTRIES) {
    const oldestKey = _rateStore.keys().next().value;
    if (oldestKey === undefined) break;
    _rateStore.delete(oldestKey);
  }
}

function checkRateLimit(req, scope) {
  const now = Date.now();
  const key = `${scope}:${getClientIp(req)}`;
  const entry = _rateStore.get(key);
  if (!entry) return { allowed: true, retryAfterSec: 0 };

  if (now - entry.windowStart >= RATE_WINDOW_MS) {
    _rateStore.delete(key);
    return { allowed: true, retryAfterSec: 0 };
  }

  if (entry.failures >= RATE_MAX_FAILURES) {
    const retryAfterSec = Math.max(1, Math.ceil((RATE_WINDOW_MS - (now - entry.windowStart)) / 1000));
    return { allowed: false, retryAfterSec };
  }

  return { allowed: true, retryAfterSec: 0 };
}

function recordFailure(req, scope) {
  const now = Date.now();
  sweepExpiredRateEntries(now);
  const key = `${scope}:${getClientIp(req)}`;
  const entry = _rateStore.get(key);

  if (!entry || now - entry.windowStart >= RATE_WINDOW_MS) {
    _rateStore.set(key, { windowStart: now, failures: 1 });
    return 1;
  }

  entry.failures += 1;
  return entry.failures;
}

function resetRateLimit(req, scope) {
  const key = `${scope}:${getClientIp(req)}`;
  _rateStore.delete(key);
}

function clearRateStoreForTest() {
  _rateStore.clear();
}

function applySecurityHeaders(res) {
  if (!res || !res.setHeader) return;
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
}

function applyPageSecurityHeaders(res) {
  applySecurityHeaders(res);
  res.setHeader('Content-Security-Policy', "frame-ancestors 'none'; base-uri 'self'; object-src 'none'");
}

function safeJsonForHtmlScript(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function parseJsonBody(req) {
  let body = req && req.body;
  if (typeof body === 'string') {
    if (body.length > 2 * 1024 * 1024) {
      throw Object.assign(new Error('Payload too large'), { statusCode: 413 });
    }
    try {
      body = JSON.parse(body);
    } catch (e) {
      return {};
    }
  }
  return (body && typeof body === 'object') ? body : {};
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function resetConfigCache() {
  _localEnvLoaded = false;
}

module.exports = {
  SITE_TTL_MS,
  ADMIN_TTL_MS,
  RATE_MAX_FAILURES,
  RATE_WINDOW_MS,
  loadLocalEnvOnce,
  resetConfigCache,
  getAuthConfig,
  verifyPassword,
  signToken,
  verifyToken,
  parseCookies,
  isHttpsRequest,
  buildCookieHeader,
  appendSetCookie,
  verifySameOrigin,
  getClientIp,
  checkRateLimit,
  recordFailure,
  resetRateLimit,
  clearRateStoreForTest,
  applySecurityHeaders,
  applyPageSecurityHeaders,
  safeJsonForHtmlScript,
  parseJsonBody,
  sleep
};
