const fs = require('fs');
const path = require('path');
const {
  getAuthConfig,
  verifyToken,
  parseCookies,
  applySecurityHeaders
} = require('./_lib/auth-core');

const DATA_PATH = path.join(__dirname, '_private', 'campaign-data.json');

module.exports = async function handler(req, res) {
  applySecurityHeaders(res);

  if (req.method !== 'GET') {
    res.status(405).json({ success: false, error: 'Method Not Allowed' });
    return;
  }

  const cfg = getAuthConfig();
  if (!cfg.configured) {
    res.status(503).json({
      success: false,
      error: 'لم يتم تهيئة كلمات مرور المنصة على الخادم (SITE_PASSWORD / ADMIN_PASSWORD).'
    });
    return;
  }

  const cookies = parseCookies(req);
  const isSite = verifyToken(cookies.noon_site, 'site', cfg.signingKey);
  if (!isSite) {
    res.status(401).json({ success: false, error: 'غير مصرح — يرجى تسجيل الدخول أولاً' });
    return;
  }

  const isAdmin = verifyToken(cookies.noon_admin, 'admin', cfg.signingKey);

  try {
    if (!fs.existsSync(DATA_PATH)) {
      res.status(404).json({ success: false, error: 'Campaign data file not found' });
      return;
    }

    const raw = fs.readFileSync(DATA_PATH, 'utf8');
    const json = JSON.parse(raw);

    res.status(200).json({
      success: true,
      isAdmin: isAdmin,
      data: json
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'تعذر قراءة بيانات الحملات من الخادم' });
  }
};
