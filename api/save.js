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

const REPO_OWNER = 'MardanFuMardan';
const REPO_NAME = 'mail-campaign';
const FILE_PATH = 'api/_private/campaign-data.json';
const DATA_PATH = path.join(__dirname, '_private', 'campaign-data.json');
const BRANCH = 'main';
const MAX_PAYLOAD_BYTES = 2 * 1024 * 1024;

function validateCampaignPayload(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return 'بيانات غير صالحة';
  }
  if (!data.static || typeof data.static !== 'object' || Array.isArray(data.static)) {
    return 'قسم الثوابت (static) غير صالح';
  }
  if (!Array.isArray(data.campaigns)) {
    return 'قائمة الحملات (campaigns) غير صالحة';
  }
  if (data.campaigns.length > 500) {
    return 'عدد الحملات يتجاوز الحد المسموح';
  }
  for (let i = 0; i < data.campaigns.length; i++) {
    const c = data.campaigns[i];
    if (!c || typeof c !== 'object' || typeof c.id !== 'string' || !c.id.trim()) {
      return `الحملة رقم ${i + 1} تفتقد المعرّف (id)`;
    }
    if (typeof c.nameEn !== 'string' || !c.nameEn.trim()) {
      return `الحملة رقم ${i + 1} تفتقد الاسم الإنجليزي`;
    }
    if (!Array.isArray(c.phases) || c.phases.length === 0) {
      return `الحملة (${c.nameEn}) يجب أن تحتوي على مرحلة واحدة على الأقل`;
    }
  }
  return null;
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
    res.status(401).json({ success: false, error: 'غير مصرح — يرجى تسجيل الدخول للمنصة أولاً.' });
    return;
  }

  const isAdmin = verifyToken(cookies.noon_admin, 'admin', cfg.signingKey);
  if (!isAdmin) {
    res.status(403).json({ success: false, error: 'هذه العملية تتطلب تسجيل الدخول كمدير أولاً' });
    return;
  }

  let body;
  try {
    body = parseJsonBody(req);
  } catch (err) {
    res.status(err.statusCode || 400).json({ success: false, error: err.message || 'طلب غير صالح' });
    return;
  }

  const payloadData = body.data;
  const validationErr = validateCampaignPayload(payloadData);
  if (validationErr) {
    res.status(400).json({ success: false, error: validationErr });
    return;
  }

  const jsonString = JSON.stringify(payloadData, null, 2);
  if (Buffer.byteLength(jsonString, 'utf8') > MAX_PAYLOAD_BYTES) {
    res.status(413).json({ success: false, error: 'حجم البيانات يتجاوز الحد الأقصى (2MB)' });
    return;
  }

  let savedLocally = false;
  try {
    fs.writeFileSync(DATA_PATH, jsonString, 'utf8');
    savedLocally = true;
  } catch (e) {
    // Expected on read-only serverless filesystems such as Vercel
  }

  const ghToken = String((body.githubToken || process.env.GITHUB_TOKEN || '')).trim();
  const commitMsg = String(body.commitMessage || 'تحديث قوالب وبيانات الحملات من لوحة الإدارة').trim();

  if (!ghToken) {
    if (savedLocally) {
      res.status(200).json({
        success: true,
        savedLocally: true,
        githubCommitted: false,
        message: 'تم الحفظ محلياً بنجاح!'
      });
      return;
    }
    res.status(400).json({
      success: false,
      error: 'مطلوب GitHub Personal Access Token (أو GITHUB_TOKEN في Vercel) لنشر التعديلات من الخادم السحابي.'
    });
    return;
  }

  try {
    const getUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}?ref=${BRANCH}`;
    const getResp = await fetch(getUrl, {
      headers: {
        'Authorization': `token ${ghToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Noon-Campaign-Admin'
      }
    });

    let fileSha = null;
    if (getResp.ok) {
      const fileData = await getResp.json();
      fileSha = fileData.sha;
    }

    const base64Content = Buffer.from(jsonString, 'utf8').toString('base64');
    const putUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`;
    const putPayload = {
      message: commitMsg,
      content: base64Content,
      branch: BRANCH
    };
    if (fileSha) putPayload.sha = fileSha;

    const putResp = await fetch(putUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${ghToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'Noon-Campaign-Admin'
      },
      body: JSON.stringify(putPayload)
    });

    const putResult = await putResp.json();
    if (!putResp.ok) {
      res.status(putResp.status).json({
        success: false,
        error: `خطأ من GitHub API: ${putResult.message || 'فشل التحديث'}`
      });
      return;
    }

    res.status(200).json({
      success: true,
      savedLocally: savedLocally,
      githubCommitted: true,
      commitSha: putResult.commit ? putResult.commit.sha : null,
      message: 'تم الحفظ وعمل Commit على GitHub بنجاح! 🚀 يتم تحديث النشر تلقائياً.'
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'تعذر الاتصال بخدمة GitHub لحفظ التغييرات' });
  }
};
