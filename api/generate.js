const fs = require('fs');
const path = require('path');
const {
  getAuthConfig,
  verifyToken,
  parseCookies,
  verifySameOrigin,
  applySecurityHeaders,
  parseJsonBody
} = require('./_lib/auth-core');
const { generateAllOutputs } = require('./_lib/generator-core');

const DATA_PATH = path.join(__dirname, '_private', 'campaign-data.json');

module.exports = async function handler(req, res) {
  applySecurityHeaders(res);

  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method Not Allowed' });
    return;
  }

  if (!verifySameOrigin(req)) {
    res.status(403).json({ success: false, error: 'طلب غير مصرح به من مصدر خارجي' });
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

  let body;
  try {
    body = parseJsonBody(req);
  } catch (err) {
    res.status(err.statusCode || 400).json({ success: false, error: err.message || 'طلب غير صالح' });
    return;
  }

  try {
    if (!fs.existsSync(DATA_PATH)) {
      res.status(404).json({ success: false, error: 'Campaign data not found' });
      return;
    }

    const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
    const outputs = generateAllOutputs(data, body);
    if (!outputs) {
      res.status(404).json({ success: false, error: 'No campaigns found' });
      return;
    }

    res.status(200).json({
      success: true,
      ...outputs
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'تعذر توليد المخرجات على الخادم' });
  }
};
