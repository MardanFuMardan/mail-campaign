// mail-campaign/tests/security-auth-gate.js
/**
 * Comprehensive OWASP / Zero-Leak / Dual-Password Authentication & API Parity Suite
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { launchBrowser } = require('./lib/chrome-launcher');
const { startTestServer } = require('./lib/test-server');
const { signToken } = require('../api/_lib/auth-core');

const ROOT = path.resolve(__dirname, '..');
const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'baseline-snapshots.json');
const DATA_PATH = path.join(ROOT, 'api', '_private', 'campaign-data.json');

function extractCookieMap(headersSetCookie) {
  const list = Array.isArray(headersSetCookie) ? headersSetCookie : (headersSetCookie ? [headersSetCookie] : []);
  const map = {};
  for (const raw of list) {
    const first = String(raw).split(';')[0];
    const eq = first.indexOf('=');
    if (eq > 0) {
      map[first.slice(0, eq).trim()] = decodeURIComponent(first.slice(eq + 1).trim());
    }
  }
  return map;
}

function formatCookieHeader(jar) {
  return Object.entries(jar)
    .filter(([, v]) => Boolean(v))
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('; ');
}

function updateJarFromResponse(jar, res) {
  const rawList = typeof res.headers.getSetCookie === 'function'
    ? res.headers.getSetCookie()
    : (res.headers.get('set-cookie') ? [res.headers.get('set-cookie')] : []);
  const parsed = extractCookieMap(rawList);
  for (const [k, v] of Object.entries(parsed)) {
    if (!v) delete jar[k];
    else jar[k] = v;
  }
  return rawList;
}

function decodeHtmlText(s) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

async function runSecurityAuthSuite() {
  const startTime = Date.now();
  console.log('======================================================================');
  console.log('🛡️  NOON CAMPAIGN HUB — SECURITY GATE, DUAL-AUTH & API PARITY SUITE');
  console.log('======================================================================\n');

  let total = 0;
  let passed = 0;
  let failed = 0;

  function assert(section, cond, msg, details = '') {
    total++;
    if (cond) {
      console.log(`  ✅ [${section}] PASS: ${msg}`);
      passed++;
    } else {
      console.error(`  ❌ [${section}] FAIL: ${msg}`);
      if (details) console.error(`     Details: ${details}`);
      failed++;
    }
  }

  // =========================================================================
  // PHASE A: Static Source & Zero-Secret Leak Audit
  // =========================================================================
  console.log('▶️ PHASE A: Static Source & Zero-Secret Leak Audit');
  const rootGateHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const privateGateHtml = fs.readFileSync(path.join(ROOT, 'api', '_private', 'login.html'), 'utf8');
  const hubHtml = fs.readFileSync(path.join(ROOT, 'api', '_private', 'hub.html'), 'utf8');
  const gitignoreText = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
  const vercelText = fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8');

  assert('A', rootGateHtml === privateGateHtml, 'Root index.html matches api/_private/login.html cleanly');

  const forbiddenInPublicGate = [
    'noon@admin#2026', 'PROMO15', '1111SALE', 'YFS2026', 'nov2026', 'oct2026', 'sep2026',
    'drive.google.com', 'noon-invoice.vercel.app', 'STORE_KEY', 'ADMIN_PIN_KEY',
    'fillCampaignSelect', 'buildEmail', 'buildBrief'
  ];
  for (const term of forbiddenInPublicGate) {
    assert('A', !rootGateHtml.includes(term), `Public login gate has ZERO trace of "${term}"`);
  }

  const codeFilesToCheck = [
    'server.js',
    'api/page.js',
    'api/auth.js',
    'api/content.js',
    'api/save.js',
    'api/generate.js',
    'api/_lib/auth-core.js',
    'api/_lib/generator-core.js',
    'api/_private/hub.html',
    'api/_private/login.html'
  ];
  for (const rel of codeFilesToCheck) {
    const content = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert('A', !content.includes('noon@admin#2026'), `${rel} contains NO hardcoded legacy password`);
  }
  assert('A', gitignoreText.includes('.env.local') && gitignoreText.includes('.env'), '.gitignore protects .env and .env.local');
  assert('A', vercelText.includes('api/_private/**') && vercelText.includes('/api/page?p=notfound'), 'vercel.json bundles api/_private/** and blocks unknown routes');

  // =========================================================================
  // PHASE B: Fail-Closed Unconfigured Server (Missing Env Passwords -> 503)
  // =========================================================================
  console.log('\n▶️ PHASE B: Fail-Closed Unconfigured Server (HTTP 503)');
  const unconf = await startTestServer({ unconfigured: true });
  try {
    const rHome = await fetch(`${unconf.baseUrl}/`);
    const tHome = await rHome.text();
    assert('B', rHome.status === 503, `GET / fails closed with 503 when passwords unset (got ${rHome.status})`);
    assert('B', !tHome.includes('nov2026') && !tHome.includes('PROMO15'), '503 page leaks zero campaign data');

    const rAdmin = await fetch(`${unconf.baseUrl}/admin`);
    assert('B', rAdmin.status === 503, `GET /admin fails closed with 503 (got ${rAdmin.status})`);

    const rAuth = await fetch(`${unconf.baseUrl}/api/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'site_login', password: 'anything' })
    });
    assert('B', rAuth.status === 503, `POST /api/auth fails closed with 503 (got ${rAuth.status})`);
    assert('B', !rAuth.headers.get('set-cookie'), '503 auth response sets zero cookies');

    const rContent = await fetch(`${unconf.baseUrl}/api/content`);
    assert('B', rContent.status === 503, `GET /api/content fails closed with 503 (got ${rContent.status})`);

    const rGen = await fetch(`${unconf.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaignId: 'nov2026' })
    });
    assert('B', rGen.status === 503, `POST /api/generate fails closed with 503 (got ${rGen.status})`);

    const rSave = await fetch(`${unconf.baseUrl}/api/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: {} })
    });
    assert('B', rSave.status === 503, `POST /api/save fails closed with 503 (got ${rSave.status})`);
  } finally {
    await unconf.close();
  }

  // =========================================================================
  // PHASE C, D, E, F: Configured Server Security & API Parity
  // =========================================================================
  console.log('\n▶️ PHASE C: Unauthenticated Gate, Headers & Static File Blocking');
  const srv = await startTestServer({
    sitePassword: 'TeamGate#Secret2026!',
    adminPassword: 'BossVault#Strong2026!'
  });

  const origDataJson = fs.readFileSync(DATA_PATH, 'utf8');

  try {
    const publicRoutes = ['/', '/index.html', '/admin', '/admin/', '/api/page?p=home', '/api/page?p=admin'];
    for (const route of publicRoutes) {
      const resp = await fetch(`${srv.baseUrl}${route}`);
      const html = await resp.text();
      assert('C', resp.status === 200, `Unauthenticated ${route} returns HTTP 200 Login Gate`);
      assert('C', html.includes('siteGateForm') && !html.includes('nov2026') && !html.includes('PROMO15') && !html.includes('drive.google.com'),
        `Unauthenticated ${route} hides ALL campaign & template data`);
      if (route === '/') {
        const cc = resp.headers.get('cache-control') || '';
        const xfo = resp.headers.get('x-frame-options') || '';
        const xcto = resp.headers.get('x-content-type-options') || '';
        const ref = resp.headers.get('referrer-policy') || '';
        const xrob = resp.headers.get('x-robots-tag') || '';
        const csp = resp.headers.get('content-security-policy') || '';
        const acao = resp.headers.get('access-control-allow-origin');
        assert('C', cc.includes('no-store') && cc.includes('private'), `Cache-Control enforces no-store & private (${cc})`);
        assert('C', xfo === 'DENY' && csp.includes("frame-ancestors 'none'"), 'Clickjacking headers set (DENY + frame-ancestors none)');
        assert('C', xcto === 'nosniff' && ref === 'no-referrer' && xrob.includes('noindex'), 'nosniff, no-referrer & noindex headers present');
        assert('C', !acao, `No permissive Access-Control-Allow-Origin header (got: ${acao})`);
      }
    }

    const blockedFiles = [
      '/api/_private/hub.html',
      '/api/_private/campaign-data.json',
      '/api/_lib/auth-core.js',
      '/api/_lib/generator-core.js',
      '/data/campaign-data.json',
      '/package.json',
      '/server.js',
      '/vercel.json',
      '/.env',
      '/.env.local',
      '/tests/fixtures/baseline-snapshots.json',
      '/archive/Brief April.html'
    ];
    for (const p of blockedFiles) {
      const r = await fetch(`${srv.baseUrl}${p}`);
      const txt = await r.text();
      assert('C', r.status === 404 && !txt.includes('nov2026') && !txt.includes('noon-campaign-hub'),
        `Sensitive/static path blocked with 404: ${p} (status=${r.status})`);
    }

    // Unauthenticated API blocking
    const rUnauthContent = await fetch(`${srv.baseUrl}/api/content`);
    const jUnauthContent = await rUnauthContent.json();
    assert('C', rUnauthContent.status === 401 && !jUnauthContent.data, 'Unauthenticated GET /api/content fails closed (401) with zero metadata leak');

    const rUnauthGen = await fetch(`${srv.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaignId: 'nov2026', country: 'QA' })
    });
    assert('C', rUnauthGen.status === 401, `Unauthenticated POST /api/generate blocked (401, got ${rUnauthGen.status})`);

    const rUnauthSave = await fetch(`${srv.baseUrl}/api/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: JSON.parse(origDataJson) })
    });
    assert('C', rUnauthSave.status === 401, `Unauthenticated POST /api/save blocked (401, got ${rUnauthSave.status})`);

    const rDirectAdmin = await fetch(`${srv.baseUrl}/api/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'admin_login', password: srv.adminPassword })
    });
    assert('C', rDirectAdmin.status === 401, `Direct admin_login without noon_site cookie rejected (401, got ${rDirectAdmin.status})`);

    const rLegacyVerify = await fetch(`${srv.baseUrl}/api/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'verify', token: 'anything' })
    });
    assert('C', rLegacyVerify.status === 400, `Removed legacy action=verify rejected (400, got ${rLegacyVerify.status})`);

    const rLegacyLogin = await fetch(`${srv.baseUrl}/api/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'login', password: srv.adminPassword })
    });
    assert('C', rLegacyLogin.status === 400, `Removed legacy action=login rejected (400, got ${rLegacyLogin.status})`);

    const rGetAuth = await fetch(`${srv.baseUrl}/api/auth`);
    assert('C', rGetAuth.status === 405, `GET /api/auth rejected with 405 (got ${rGetAuth.status})`);

    // CSRF Origin checks
    for (const evilOrigin of ['https://evil.example', 'null']) {
      const rCsrf = await fetch(`${srv.baseUrl}/api/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Origin': evilOrigin },
        body: JSON.stringify({ action: 'site_login', password: srv.sitePassword })
      });
      assert('C', rCsrf.status === 403, `Cross-origin Origin=${evilOrigin} blocked on /api/auth (403, got ${rCsrf.status})`);
    }

    // =========================================================================
    // PHASE D: Dual-Password Separation & Crypto Token Integrity
    // =========================================================================
    console.log('\n▶️ PHASE D: Dual-Password Separation & Cryptographic Scope Integrity');

    // 1. Admin password CANNOT unlock site gate
    const rAdminAtSite = await fetch(`${srv.baseUrl}/api/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'site_login', password: srv.adminPassword })
    });
    const adminAtSiteCookies = extractCookieMap(rAdminAtSite.headers.getSetCookie ? rAdminAtSite.headers.getSetCookie() : []);
    assert('D', rAdminAtSite.status === 401 && !adminAtSiteCookies.noon_site, 'ADMIN_PASSWORD rejected at Team Site Login gate (dual-password separation)');

    // 2. Site password unlocks site session ONLY
    const teamJar = {};
    const rSiteOk = await fetch(`${srv.baseUrl}/api/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'site_login', password: srv.sitePassword })
    });
    const rawSetCookies = updateJarFromResponse(teamJar, rSiteOk);
    assert('D', rSiteOk.status === 200 && Boolean(teamJar.noon_site), 'Valid SITE_PASSWORD unlocks noon_site session cookie');
    const siteCookieLine = rawSetCookies.find(l => l.startsWith('noon_site=')) || '';
    assert('D', siteCookieLine.includes('HttpOnly') && siteCookieLine.includes('SameSite=Lax'), `noon_site sets HttpOnly + SameSite=Lax (${siteCookieLine})`);

    // 3. Site cookie unlocks Hub SSR & /api/content with isAdmin: false
    const rHub = await fetch(`${srv.baseUrl}/`, { headers: { Cookie: formatCookieHeader(teamJar) } });
    const hubSsrHtml = await rHub.text();
    assert('D', rHub.status === 200 && hubSsrHtml.includes('window.__NOON_BOOTSTRAP__') && hubSsrHtml.includes('"isAdmin":false'),
      'Authenticated team GET / serves Hub with SSR bootstrap & isAdmin=false');

    const rTeamContent = await fetch(`${srv.baseUrl}/api/content`, { headers: { Cookie: formatCookieHeader(teamJar) } });
    const jTeamContent = await rTeamContent.json();
    assert('D', rTeamContent.status === 200 && jTeamContent.success && jTeamContent.isAdmin === false && jTeamContent.data && jTeamContent.data.campaigns.length >= 5,
      'Team user can fetch /api/content with isAdmin=false');

    // 4. Site password CANNOT unlock Admin Login
    const rSiteAtAdmin = await fetch(`${srv.baseUrl}/api/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: formatCookieHeader(teamJar) },
      body: JSON.stringify({ action: 'admin_login', password: srv.sitePassword })
    });
    assert('D', rSiteAtAdmin.status === 401, 'SITE_PASSWORD rejected at admin_login endpoint (401)');

    // 5. Team user CANNOT POST /api/save
    const rTeamSave = await fetch(`${srv.baseUrl}/api/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: formatCookieHeader(teamJar) },
      body: JSON.stringify({ data: JSON.parse(origDataJson) })
    });
    assert('D', rTeamSave.status === 403, `Non-admin team user blocked from POST /api/save (403, got ${rTeamSave.status})`);

    // 6. Token confusion check: copy noon_site token into noon_admin cookie
    const confusedHeader = formatCookieHeader({ noon_site: teamJar.noon_site, noon_admin: teamJar.noon_site });
    const rConfusedSave = await fetch(`${srv.baseUrl}/api/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: confusedHeader },
      body: JSON.stringify({ data: JSON.parse(origDataJson) })
    });
    assert('D', rConfusedSave.status === 403, 'Copied noon_site token rejected as noon_admin (HMAC domain separation holds)');

    // 7. Tampered cookie signature fails closed
    const tamperedSite = teamJar.noon_site.slice(0, -4) + 'dead';
    const rTampered = await fetch(`${srv.baseUrl}/api/content`, {
      headers: { Cookie: formatCookieHeader({ noon_site: tamperedSite }) }
    });
    assert('D', rTampered.status === 401, 'Tampered HMAC signature on noon_site rejected (401)');

    // 8. Expired signed token fails closed
    const signingKey = crypto.createHash('sha256').update('noon-auth-secret-v2:ephemeral-test-signing-secret-2026', 'utf8').digest();
    const expiredToken = signToken('site', -5000, signingKey);
    const rExpired = await fetch(`${srv.baseUrl}/api/content`, {
      headers: { Cookie: formatCookieHeader({ noon_site: expiredToken }) }
    });
    assert('D', rExpired.status === 401, 'Expired site token fails closed (401)');

    // =========================================================================
    // PHASE E: Admin Save, Logout Isolation & Rate Limiting
    // =========================================================================
    console.log('\n▶️ PHASE E: Admin Save Flow, Logout Isolation & Rate Limiting');
    const adminJar = { ...teamJar };
    const rAdminOk = await fetch(`${srv.baseUrl}/api/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: formatCookieHeader(adminJar) },
      body: JSON.stringify({ action: 'admin_login', password: srv.adminPassword })
    });
    updateJarFromResponse(adminJar, rAdminOk);
    assert('E', rAdminOk.status === 200 && Boolean(adminJar.noon_admin), 'Valid ADMIN_PASSWORD issues noon_admin HttpOnly cookie');

    // Payload validation check on /api/save
    const rBadSave = await fetch(`${srv.baseUrl}/api/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: formatCookieHeader(adminJar) },
      body: JSON.stringify({ data: { static: {}, campaigns: [{ id: 'bad' }] } })
    });
    assert('E', rBadSave.status === 400, `POST /api/save rejects malformed campaign payload (400, got ${rBadSave.status})`);

    // Valid round-trip save + guaranteed restore
    try {
      const modified = JSON.parse(origDataJson);
      modified._testMarker = 'sec_roundtrip_check';
      const rGoodSave = await fetch(`${srv.baseUrl}/api/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: formatCookieHeader(adminJar) },
        body: JSON.stringify({ data: modified, commitMessage: 'test roundtrip' })
      });
      const jGoodSave = await rGoodSave.json();
      assert('E', rGoodSave.status === 200 && jGoodSave.success && jGoodSave.savedLocally, 'Admin POST /api/save persists validated data locally');

      const rVerifySaved = await fetch(`${srv.baseUrl}/api/content`, {
        headers: { Cookie: formatCookieHeader(adminJar) }
      });
      const jVerifySaved = await rVerifySaved.json();
      assert('E', jVerifySaved.isAdmin === true && jVerifySaved.data._testMarker === 'sec_roundtrip_check',
        'Admin save round-trips via GET /api/content with isAdmin=true');
    } finally {
      fs.writeFileSync(DATA_PATH, origDataJson, 'utf8');
    }

    // Admin logout drops ONLY admin scope, keeping site session
    const rAdminOut = await fetch(`${srv.baseUrl}/api/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: formatCookieHeader(adminJar) },
      body: JSON.stringify({ action: 'admin_logout' })
    });
    updateJarFromResponse(adminJar, rAdminOut);
    assert('E', Boolean(adminJar.noon_site) && !adminJar.noon_admin, 'admin_logout clears noon_admin while keeping noon_site active');

    const rAfterAdminOut = await fetch(`${srv.baseUrl}/api/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: formatCookieHeader(adminJar) },
      body: JSON.stringify({ data: JSON.parse(origDataJson) })
    });
    assert('E', rAfterAdminOut.status === 403, 'After admin_logout, POST /api/save returns 403 immediately');

    // Full logout drops both
    const rSiteOut = await fetch(`${srv.baseUrl}/api/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: formatCookieHeader(adminJar) },
      body: JSON.stringify({ action: 'logout' })
    });
    updateJarFromResponse(adminJar, rSiteOut);
    assert('E', !adminJar.noon_site && !adminJar.noon_admin, 'logout clears both noon_site and noon_admin');

    const rAfterSiteOut = await fetch(`${srv.baseUrl}/`, { headers: { Cookie: formatCookieHeader(adminJar) } });
    const tAfterSiteOut = await rAfterSiteOut.text();
    assert('E', tAfterSiteOut.includes('siteGateForm') && !tAfterSiteOut.includes('nov2026'), 'After logout, GET / serves Login Gate again');

    // Rate limiting check (isolated synthetic client IP so test browser still works)
    const rlHeaders = { 'Content-Type': 'application/json', 'X-Real-Ip': '203.0.113.55' };
    let allEightUnauthorized = true;
    for (let i = 0; i < 8; i++) {
      const rFail = await fetch(`${srv.baseUrl}/api/auth`, {
        method: 'POST',
        headers: rlHeaders,
        body: JSON.stringify({ action: 'site_login', password: 'wrong-' + i })
      });
      if (rFail.status !== 401) allEightUnauthorized = false;
    }
    const rNinth = await fetch(`${srv.baseUrl}/api/auth`, {
      method: 'POST',
      headers: rlHeaders,
      body: JSON.stringify({ action: 'site_login', password: srv.sitePassword })
    });
    const retryAfter = parseInt(rNinth.headers.get('retry-after') || '0', 10);
    assert('E', allEightUnauthorized && rNinth.status === 429 && retryAfter > 0,
      `Rate limiter enforces 429 + Retry-After after 8 bad attempts (9th status=${rNinth.status}, retryAfter=${retryAfter}s)`);

    // =========================================================================
    // PHASE F: /api/generate 48-Scenario Golden Baseline Parity Check
    // + PHASE G: Real Headless Chrome E2E Login, HttpOnly, Admin & Lockout Flow
    // =========================================================================
    console.log('\n▶️ PHASE F: Server /api/generate vs 48-Scenario Golden Baseline Parity');
    const fixtureData = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
    const scenarios = fixtureData.scenarios;

    const apiPayloads = [];
    for (const [key, golden] of Object.entries(scenarios)) {
      const inp = golden.inputs;
      const gRes = await fetch(`${srv.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: formatCookieHeader(teamJar) },
        body: JSON.stringify({
          campaignId: inp.campaignId,
          country: inp.country,
          phaseIx: inp.phaseIx,
          code: inp.discountCode,
          platform: inp.platform,
          subDay: inp.subDay,
          subMonth: inp.subMonth,
          liveDay: inp.liveDay,
          liveMonth: inp.liveMonth,
          fee: inp.fee,
          kpi: inp.kpi,
          sender: inp.sender
        })
      });
      const gJson = await gRes.json();
      apiPayloads.push({ key, golden, gJson });
    }

    const browser = await launchBrowser();
    const page = await browser.newPage();
    const unexpectedConsoleErrors = [];
    const expected401Logs = [];
    const pageErrors = [];
    let expecting401 = false;

    page.on('console', m => {
      if (m.type() === 'error') {
        const text = m.text();
        if (expecting401 && text.includes('status of 401')) {
          expected401Logs.push(text);
        } else {
          unexpectedConsoleErrors.push(text);
        }
      }
    });
    page.on('pageerror', e => pageErrors.push(e.message || String(e)));

    try {
      await page.goto(`${srv.baseUrl}/`, { waitUntil: 'load' });

      // Normalize server-rendered HTML fragments through Chrome's HTML5 DOM serializer
      // (matching how out-email-en.innerHTML etc. were serialized in baseline-snapshots.json)
      const genParity = await page.evaluate((items) => {
        const div = document.createElement('div');
        function normHtml(raw) {
          div.innerHTML = raw || '';
          return div.innerHTML;
        }
        const diffs = [];
        let checks = 0;
        for (const item of items) {
          const { key, golden, gJson } = item;
          const htmlChecks = [
            ['emailEn', normHtml(gJson.emailEn), golden.outputs.outEmailEn],
            ['emailAr', normHtml(gJson.emailAr), golden.outputs.outEmailAr],
            ['briefEn', normHtml(gJson.briefEn), golden.outputs.outBriefEn],
            ['briefAr', normHtml(gJson.briefAr), golden.outputs.outBriefAr]
          ];
          for (const [field, actual, expected] of htmlChecks) {
            checks++;
            if (actual !== expected) {
              diffs.push(`${key}.${field} (actual len=${actual.length}, expected len=${expected.length})`);
            }
          }
          const subjActual = (gJson.subjects && gJson.subjects['email-en']) || '';
          checks++;
          if (subjActual !== golden.outputs.subjectText) {
            diffs.push(`${key}.subjectText`);
          }
        }
        return { checks, diffs };
      }, apiPayloads);

      let genChecks = genParity.checks;
      let genMismatches = genParity.diffs.length;
      if (genParity.diffs.length > 0) {
        genParity.diffs.slice(0, 5).forEach(d => console.error(`     [Mismatch ${d}]`));
      }

      for (const { key, golden, gJson } of apiPayloads) {
        const matchEn = golden.outputs.outBriefTxtEn.match(/<textarea[^>]*>([\s\S]*?)<\/textarea>/i);
        const matchAr = golden.outputs.outBriefTxtAr.match(/<textarea[^>]*>([\s\S]*?)<\/textarea>/i);
        genChecks += 2;
        if (!matchEn || decodeHtmlText(matchEn[1]) !== gJson.briefTxtEn) {
          genMismatches++;
          if (genMismatches <= 5) console.error(`     [Mismatch ${key}.briefTxtEn]`);
        }
        if (!matchAr || decodeHtmlText(matchAr[1]) !== gJson.briefTxtAr) {
          genMismatches++;
          if (genMismatches <= 5) console.error(`     [Mismatch ${key}.briefTxtAr]`);
        }
      }

      assert('F', genChecks === 336 && genMismatches === 0,
        `/api/generate matches 48-scenario golden baseline cleanly (${genChecks - genMismatches}/${genChecks} panes)`);

      // =========================================================================
      // PHASE G: Real Headless Chrome E2E Login, HttpOnly, Admin & Lockout Flow
      // =========================================================================
      console.log('\n▶️ PHASE G: Headless Chrome E2E Auth Gate, Admin Modal & Session Lock');
      const gateInitial = await page.evaluate(() => ({
        hasForm: Boolean(document.getElementById('siteGateForm')),
        docCookie: document.cookie,
        htmlLen: document.documentElement.innerHTML.length,
        hasSecrets: document.documentElement.innerHTML.includes('nov2026') ||
                    document.documentElement.innerHTML.includes('PROMO15')
      }));
      assert('G', gateInitial.hasForm && !gateInitial.hasSecrets && gateInitial.docCookie === '',
        'Browser initial load renders Login Gate with empty document.cookie and zero leaked data');

      // Eye toggle test
      await page.click('#toggleVisBtn');
      const eyeOpenedType = await page.evaluate(() => document.getElementById('sitePasswordInput').type);
      await page.click('#toggleVisBtn');
      const eyeClosedType = await page.evaluate(() => document.getElementById('sitePasswordInput').type);
      assert('G', eyeOpenedType === 'text' && eyeClosedType === 'password', 'Password visibility eye button toggles input type');

      // Wrong password error & shake (expect single 401 response log)
      expecting401 = true;
      await page.type('#sitePasswordInput', 'WrongPass123');
      await page.click('#submitBtn');
      await page.waitForFunction(() => {
        const s = document.getElementById('gateStatus');
        return s && s.classList.contains('err');
      }, { timeout: 5000 });
      expecting401 = false;
      assert('G', true, 'Submitting wrong password shows Arabic error box and keeps user on gate');

      // Login with valid team password
      await page.type('#sitePasswordInput', srv.sitePassword);
      await Promise.all([
        page.waitForFunction(() => Boolean(document.getElementById('campaignId') && document.getElementById('out-email-en')), { timeout: 10000 }),
        page.click('#submitBtn')
      ]);

      const hubLoaded = await page.evaluate(() => ({
        docCookie: document.cookie,
        campVal: document.getElementById('campaignId').value,
        adminBadgeVisible: document.getElementById('adminHeaderBadge').style.display !== 'none',
        sessionLockVisible: Boolean(document.getElementById('sessionLockBtn')),
        isAdminVar: typeof isAdmin !== 'undefined' ? isAdmin : null
      }));
      assert('G', hubLoaded.campVal === 'nov2026' && hubLoaded.docCookie === '' && !hubLoaded.adminBadgeVisible && hubLoaded.sessionLockVisible && hubLoaded.isAdminVar === false,
        'Team login unlocks Hub with HttpOnly cookie (invisible to JS), hidden admin badge, and visible Session Lock button');

      // LocalStorage privilege escalation spoof test
      await page.evaluate(() => {
        try {
          localStorage.setItem('noon_admin_session', '1');
          localStorage.setItem('isAdmin', 'true');
        } catch (e) {}
      });
      await page.reload({ waitUntil: 'load' });
      const afterSpoof = await page.evaluate(() => ({ isAdminVar: isAdmin }));
      assert('G', afterSpoof.isAdminVar === false, 'Reload ignores localStorage admin spoofing (SSR authority enforced)');

      // Trigger Admin Modal -> opens Admin Password Modal
      await page.evaluate(() => triggerAdminEntry());
      await page.waitForFunction(() => document.getElementById('adminLoginModal').classList.contains('show'), { timeout: 3000 });

      // Wrong admin password rejected (expect single 401 response log)
      expecting401 = true;
      await page.type('#adminPasswordInput', srv.sitePassword);
      await page.click('#adminLoginSubmitBtn');
      await page.waitForFunction(() => {
        const el = document.getElementById('adminLoginStatus');
        return el && el.classList.contains('err');
      }, { timeout: 5000 });
      expecting401 = false;
      assert('G', true, 'Submitting SITE_PASSWORD into Admin modal is rejected cleanly');

      // Correct admin password unlocks full Admin Panel
      await page.type('#adminPasswordInput', srv.adminPassword);
      await page.click('#adminLoginSubmitBtn');
      await page.waitForFunction(() => document.getElementById('adminModal').classList.contains('show') && isAdmin === true, { timeout: 8000 });
      assert('G', true, 'Valid ADMIN_PASSWORD unlocks full Admin Panel & Campaign List');

      // Reload /admin while authenticated -> remains admin & auto-opens modal
      await page.goto(`${srv.baseUrl}/admin`, { waitUntil: 'load' });
      await page.waitForFunction(() => typeof isAdmin !== 'undefined' && isAdmin === true && document.getElementById('adminModal').classList.contains('show'), { timeout: 5000 });
      assert('G', true, 'Direct navigation to /admin persists Admin session and opens Admin Panel');

      // Click Session Lock -> drops session back to Login Gate
      await page.evaluate(() => closeAdminModal());
      await Promise.all([
        page.waitForFunction(() => Boolean(document.getElementById('siteGateForm')), { timeout: 10000 }),
        page.click('#sessionLockBtn')
      ]);
      await page.reload({ waitUntil: 'load' });
      const lockedAfterReload = await page.evaluate(() => Boolean(document.getElementById('siteGateForm')));
      assert('G', lockedAfterReload, 'Clicking Session Lock drops session cookies and keeps / locked after reload');

      assert('G', expected401Logs.length === 2, `Both intentional wrong-password checks triggered real HTTP 401 responses (logged ${expected401Logs.length})`);
      assert('G', unexpectedConsoleErrors.length === 0 && pageErrors.length === 0,
        `Zero unexpected console/page errors in Chrome E2E auth flow (found ${unexpectedConsoleErrors.length + pageErrors.length})`,
        [...unexpectedConsoleErrors, ...pageErrors].join('; '));
    } finally {
      await browser.close();
    }
  } finally {
    await srv.close();
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log('\n======================================================================');
  console.log(`📊 SECURITY GATE SUMMARY: ${passed}/${total} PASSED (${failed} FAILED) in ${elapsed}s`);
  console.log('======================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runSecurityAuthSuite().catch((err) => {
    console.error('Fatal Security Suite Error:', err);
    process.exit(1);
  });
}

module.exports = { runSecurityAuthSuite };
