// mail-campaign/tests/lib/test-server.js
const { createAppServer } = require('../../server');
const { clearRateStoreForTest, resetConfigCache } = require('../../api/_lib/auth-core');

const DEFAULT_SITE_PASSWORD = 'NoonTeam#Gate2026!';
const DEFAULT_ADMIN_PASSWORD = 'NoonAdmin#Vault2026!';
const DEFAULT_AUTH_SECRET = 'ephemeral-test-signing-secret-2026';

async function startTestServer(options = {}) {
  const savedEnv = {
    SITE_PASSWORD: process.env.SITE_PASSWORD,
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
    AUTH_SECRET: process.env.AUTH_SECRET,
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    VERCEL: process.env.VERCEL
  };

  resetConfigCache();
  clearRateStoreForTest();

  const sitePassword = options.unconfigured
    ? ''
    : (options.sitePassword || DEFAULT_SITE_PASSWORD);
  const adminPassword = options.unconfigured
    ? ''
    : (options.adminPassword || DEFAULT_ADMIN_PASSWORD);

  if (options.unconfigured) {
    delete process.env.SITE_PASSWORD;
    delete process.env.ADMIN_PASSWORD;
    delete process.env.AUTH_SECRET;
    // Prevent loadLocalEnvOnce() from reading a developer's local .env.local during 503 test
    process.env.VERCEL = '1';
  } else {
    process.env.SITE_PASSWORD = sitePassword;
    process.env.ADMIN_PASSWORD = adminPassword;
    process.env.AUTH_SECRET = options.authSecret || DEFAULT_AUTH_SECRET;
    delete process.env.VERCEL;
  }

  const server = createAppServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  async function close() {
    clearRateStoreForTest();
    resetConfigCache();
    await new Promise((resolve) => server.close(resolve));
    for (const [key, val] of Object.entries(savedEnv)) {
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }
  }

  return {
    server,
    baseUrl,
    sitePassword,
    adminPassword,
    close
  };
}

async function openAuthenticatedHub(page, baseUrl, sitePassword = DEFAULT_SITE_PASSWORD) {
  await page.goto(`${baseUrl}/`, { waitUntil: 'load' });

  const onGate = await page.evaluate(() => Boolean(document.getElementById('sitePasswordInput')));
  if (onGate) {
    await page.type('#sitePasswordInput', sitePassword);
    await Promise.all([
      page.waitForFunction(() => Boolean(document.getElementById('campaignId') && document.getElementById('out-email-en')), { timeout: 15000 }),
      page.click('#submitBtn')
    ]);
  } else {
    await page.waitForFunction(() => Boolean(document.getElementById('campaignId') && document.getElementById('out-email-en')), { timeout: 15000 });
  }

  // Ensure seeded form state and custom dropdowns are initialized
  await page.evaluate(() => {
    if (typeof fillCampaignSelect === 'function') fillCampaignSelect();
    if (typeof onCampaignChange === 'function') onCampaignChange(true);
    if (typeof render === 'function') render(true);
  });
}

module.exports = {
  DEFAULT_SITE_PASSWORD,
  DEFAULT_ADMIN_PASSWORD,
  startTestServer,
  openAuthenticatedHub
};
