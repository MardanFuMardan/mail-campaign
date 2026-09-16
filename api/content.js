const fs = require('fs');
const path = require('path');
const { verifyToken } = require('./auth');

module.exports = async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ success: false, error: 'Method Not Allowed' });
    return;
  }

  try {
    const dataPath = path.join(process.cwd(), 'data', 'campaign-data.json');
    let json = null;
    if (fs.existsSync(dataPath)) {
      const raw = fs.readFileSync(dataPath, 'utf8');
      json = JSON.parse(raw);
    } else {
      // Fallback: fetch from GitHub repository raw content if deployed in read-only / custom environment
      const rawUrl = 'https://raw.githubusercontent.com/MardanFuMardan/mail-campaign/main/data/campaign-data.json';
      const ghRes = await fetch(rawUrl);
      if (ghRes.ok) {
        json = await ghRes.json();
      }
    }

    if (!json) {
      res.status(404).json({ success: false, error: 'Campaign data file not found' });
      return;
    }

    // Verify Admin authentication
    const authHeader = req.headers.authorization || '';
    const token = (authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader) || (req.query && req.query.token) || '';
    const isAdmin = verifyToken(token);

    if (isAdmin) {
      // Admin gets full data for editor
      res.status(200).json({ success: true, isAdmin: true, data: json });
      return;
    }

    // Public / Non-admin gets ONLY form selection metadata (no proprietary templates, no drive links)
    const publicCampaigns = (json.campaigns || []).map(c => ({
      id: c.id,
      nameEn: c.nameEn,
      nameAr: c.nameAr,
      hidden: c.hidden,
      promoCode: c.promoCode,
      sender: c.sender,
      countryDiscounts: c.countryDiscounts,
      phases: (c.phases || []).map(p => ({
        en: { title: p.en ? p.en.title : '', date: p.en ? p.en.date : '' },
        ar: { title: p.ar ? p.ar.title : '', date: p.ar ? p.ar.date : '' }
      }))
    }));

    res.status(200).json({
      success: true,
      isAdmin: false,
      data: {
        campaigns: publicCampaigns
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
