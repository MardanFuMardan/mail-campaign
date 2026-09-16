const crypto = require('crypto');

// Secret for signing session tokens (fallback to fixed secret if env var not set)
const JWT_SECRET = process.env.ADMIN_SECRET || process.env.ADMIN_PASSWORD || 'noon-campaign-hub-secret-salt-2026';
// Admin password (can be set in Vercel Environment Variables: ADMIN_PASSWORD)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'noon@admin#2026';

function signToken(role = 'admin') {
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
  const payload = `${expiresAt}:${role}`;
  const hmac = crypto.createHmac('sha256', JWT_SECRET).update(payload).digest('hex');
  return `${expiresAt}.${hmac}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [expiresAtStr, sig] = parts;
  const expiresAt = parseInt(expiresAtStr, 10);
  if (isNaN(expiresAt) || Date.now() > expiresAt) return false;
  const expectedHmac = crypto.createHmac('sha256', JWT_SECRET).update(`${expiresAt}:admin`).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedHmac));
}

module.exports = async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method Not Allowed' });
    return;
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) {}
    }
    body = body || {};

    const action = body.action || 'login';

    if (action === 'verify') {
      const authHeader = req.headers.authorization || '';
      const token = body.token || (authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader);
      const isValid = verifyToken(token);
      res.status(200).json({ success: isValid, valid: isValid });
      return;
    }

    if (action === 'login') {
      const password = (body.password || '').trim();
      if (!password) {
        res.status(400).json({ success: false, error: 'يرجى كتابة كلمة المرور' });
        return;
      }

      // Timing-safe password check
      const expectedBuf = Buffer.from(ADMIN_PASSWORD);
      const inputBuf = Buffer.from(password);
      const isMatch = expectedBuf.length === inputBuf.length && crypto.timingSafeEqual(expectedBuf, inputBuf);

      if (!isMatch) {
        res.status(401).json({ success: false, error: 'كلمة المرور غير صحيحة ❌' });
        return;
      }

      const token = signToken('admin');
      res.status(200).json({
        success: true,
        message: 'تم تسجيل الدخول بنجاح 👑',
        token: token,
        expiresIn: 7 * 24 * 60 * 60
      });
      return;
    }

    res.status(400).json({ success: false, error: 'Invalid action' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

module.exports.verifyToken = verifyToken;
