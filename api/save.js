const fs = require('fs');
const path = require('path');
const { verifyToken } = require('./auth');

const REPO_OWNER = 'MardanFuMardan';
const REPO_NAME = 'mail-campaign';
const FILE_PATH = 'data/campaign-data.json';
const BRANCH = 'main';

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

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

    // 1. Verify Authentication
    const authHeader = req.headers.authorization || '';
    const token = body.token || (authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader);
    if (!verifyToken(token)) {
      res.status(401).json({ success: false, error: 'غير مصرح: يرجى تسجيل الدخول كمدير أولاً 🔒' });
      return;
    }

    const payloadData = body.data;
    if (!payloadData || typeof payloadData !== 'object') {
      res.status(400).json({ success: false, error: 'بيانات غير صالحة' });
      return;
    }

    const jsonString = JSON.stringify(payloadData, null, 2);

    // 2. Try updating local disk if available
    let savedLocally = false;
    try {
      const dataPath = path.join(process.cwd(), 'data', 'campaign-data.json');
      fs.writeFileSync(dataPath, jsonString, 'utf8');
      savedLocally = true;
    } catch (e) {
      // Disk might be read-only in Serverless environment, which is expected
    }

    // 3. GitHub API Commit for automatic Vercel Deployment
    const ghToken = (body.githubToken || process.env.GITHUB_TOKEN || '').trim();
    const commitMsg = (body.commitMessage || 'تحديث قوالب وبيانات الحملات من لوحة الإدارة').trim();

    if (!ghToken) {
      if (savedLocally) {
        res.status(200).json({
          success: true,
          savedLocally: true,
          githubCommitted: false,
          message: 'تم الحفظ محلياً بنجاح! لم يتم النشر على GitHub لعدم وجود GitHub Token. أدخل التوكن في تبويب الإعدادات لتفعيل النشر التلقائي على Vercel.'
        });
        return;
      }
      res.status(400).json({
        success: false,
        error: 'مطلوب GitHub Personal Access Token لنشر التعديلات على GitHub و Vercel. يرجى إدخاله في تبويب الإعدادات.'
      });
      return;
    }

    // Get current file SHA from GitHub
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

    // Prepare Base64 payload (preserving UTF-8 for Arabic)
    const base64Content = Buffer.from(jsonString, 'utf8').toString('base64');

    // PUT commit to GitHub
    const putUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`;
    const putPayload = {
      message: commitMsg,
      content: base64Content,
      branch: BRANCH
    };
    if (fileSha) {
      putPayload.sha = fileSha;
    }

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
      githubCommitted: true,
      commitSha: putResult.commit ? putResult.commit.sha : null,
      message: 'تم الحفظ وعمل Commit على GitHub بنجاح! 🚀 Vercel يقوم الآن بإعادة النشر التلقائي خلال لحظات.'
    });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
