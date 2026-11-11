// mail-campaign/tests/lib/chrome-launcher.js
/**
 * Resilient Chrome and Puppeteer launcher for Noon Campaign Hub tests.
 * Resolves Chrome binary and Puppeteer module even across Windows Junction / Drive redirection.
 */
const fs = require('fs');
const path = require('path');

function getPuppeteer() {
  try {
    return require('puppeteer');
  } catch (e) {
    const candidatePaths = [
      'C:\\Users\\pc\\node_modules\\puppeteer',
      path.join(process.env.USERPROFILE || 'C:\\Users\\pc', 'node_modules', 'puppeteer'),
      'C:\\Users\\pc\\AppData\\Roaming\\npm\\node_modules\\hyperframes\\node_modules\\puppeteer-core'
    ];
    for (const p of candidatePaths) {
      try {
        return require(p);
      } catch (err) {}
    }
    throw new Error('Puppeteer could not be loaded from standard or global paths: ' + e.message);
  }
}

function getChromeExecutablePath() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google\\Chrome\\Application\\chrome.exe')
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

async function launchBrowser(extraOptions = {}) {
  const puppeteer = getPuppeteer();
  const chromePath = getChromeExecutablePath();

  const launchOptions = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--allow-file-access-from-files',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process'
    ],
    ...extraOptions
  };

  if (chromePath && !launchOptions.executablePath) {
    launchOptions.executablePath = chromePath;
  }

  return await puppeteer.launch(launchOptions);
}

module.exports = {
  getPuppeteer,
  getChromeExecutablePath,
  launchBrowser
};
