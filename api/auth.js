const {
  SITE_TTL_MS,
  ADMIN_TTL_MS,
  getAuthConfig,
  verifyPassword,
  signToken,
  verifyToken,
  parseCookies,
  buildCookieHeader,
  appendSetCookie,
  verifySameOrigin,
  checkRateLimit,
  recordFailure,
  resetRateLimit,
  applySecurityHeaders,
  parseJsonBody,
  sleep
} = require('./_lib/auth-core');

function clearSessionCookie(req, res, name) {
  appendSetCookie(res, buildCookieHeader(req, name, '', 0));
}

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

  let body;
  try {
    body = parseJsonBody(req);
  } catch (err) {
    res.status(err.statusCode || 400).json({ success: false, error: err.message || 'طلب غير صالح' });
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
  const action = String(body.action || '').trim();

  if (action === 'status') {
    const isSite = verifyToken(cookies.noon_site, 'site', cfg.signingKey);
    const isAdmin = isSite && verifyToken(cookies.noon_admin, 'admin', cfg.signingKey);
    res.status(200).json({
      success: true,
      authenticated: isSite,
      isAdmin: isAdmin
    });
    return;
  }

  if (action === 'site_login') {
    const rl = checkRateLimit(req, 'site');
    if (!rl.allowed) {
      res.setHeader('Retry-After', String(rl.retryAfterSec));
      res.status(429).json({
        success: false,
        error: `تم حظر المحاولات مؤقتاً لكثرة الأخطاء. يرجى الانتظار ${rl.retryAfterSec} ثانية.`
      });
      return;
    }

    const password = typeof body.password === 'string' ? body.password.trim() : '';
    if (!password) {
      res.status(400).json({ success: false, error: 'يرجى كتابة كلمة مرور الدخول.' });
      return;
    }

    const ok = verifyPassword(password, cfg.sitePassword);
    if (!ok) {
      recordFailure(req, 'site');
      await sleep(220);
      clearSessionCookie(req, res, 'noon_site');
      clearSessionCookie(req, res, 'noon_admin');
      res.status(401).json({ success: false, error: 'كلمة مرور الدخول غير صحيحة' });
      return;
    }

    resetRateLimit(req, 'site');
    const siteToken = signToken('site', SITE_TTL_MS, cfg.signingKey);
    appendSetCookie(res, buildCookieHeader(req, 'noon_site', siteToken, Math.floor(SITE_TTL_MS / 1000)));
    clearSessionCookie(req, res, 'noon_admin');
    res.status(200).json({
      success: true,
      authenticated: true,
      message: 'تم التحقق بنجاح'
    });
    return;
  }

  if (action === 'admin_login') {
    const isSite = verifyToken(cookies.noon_site, 'site', cfg.signingKey);
    if (!isSite) {
      res.status(401).json({
        success: false,
        error: 'يجب تسجيل الدخول للمنصة أولاً قبل فتح صلاحيات المدير.'
      });
      return;
    }

    const rl = checkRateLimit(req, 'admin');
    if (!rl.allowed) {
      res.setHeader('Retry-After', String(rl.retryAfterSec));
      res.status(429).json({
        success: false,
        error: `تم حظر محاولات دخول المدير مؤقتاً. يرجى الانتظار ${rl.retryAfterSec} ثانية.`
      });
      return;
    }

    const password = typeof body.password === 'string' ? body.password.trim() : '';
    if (!password) {
      res.status(400).json({ success: false, error: 'يرجى كتابة كلمة مرور المدير.' });
      return;
    }

    const ok = verifyPassword(password, cfg.adminPassword);
    if (!ok) {
      recordFailure(req, 'admin');
      await sleep(220);
      clearSessionCookie(req, res, 'noon_admin');
      res.status(401).json({ success: false, error: 'كلمة مرور المدير غير صحيحة' });
      return;
    }

    resetRateLimit(req, 'admin');
    const adminToken = signToken('admin', ADMIN_TTL_MS, cfg.signingKey);
    appendSetCookie(res, buildCookieHeader(req, 'noon_admin', adminToken, Math.floor(ADMIN_TTL_MS / 1000)));
    res.status(200).json({
      success: true,
      isAdmin: true,
      message: 'تم تفعيل صلاحيات المدير بنجاح'
    });
    return;
  }

  if (action === 'admin_logout') {
    clearSessionCookie(req, res, 'noon_admin');
    res.status(200).json({ success: true, isAdmin: false });
    return;
  }

  if (action === 'logout') {
    clearSessionCookie(req, res, 'noon_site');
    clearSessionCookie(req, res, 'noon_admin');
    res.status(200).json({ success: true, authenticated: false, isAdmin: false });
    return;
  }

  res.status(400).json({ success: false, error: 'Invalid action' });
};
