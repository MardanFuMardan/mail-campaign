// mail-campaign/tests/capture-baseline.js
/**
 * Baseline Output Snapshot Generator
 * Captures 48 combinatorial scenarios across all 6 phases of November 2026,
 * 4 GCC countries, and 2 coupon modes (default vs custom).
 */
const fs = require('fs');
const path = require('path');
const { launchBrowser } = require('./lib/chrome-launcher');
const { startTestServer, openAuthenticatedHub } = require('./lib/test-server');

const FIXTURES_DIR = path.resolve(__dirname, 'fixtures');
const SNAPSHOT_OUT = path.resolve(FIXTURES_DIR, 'baseline-snapshots.json');

async function captureBaseline() {
  const srv = await startTestServer();
  console.log('===============================================================');
  console.log('📸 NOON CAMPAIGN HUB — BASELINE OUTPUT SNAPSHOT GENERATOR');
  console.log('===============================================================');
  console.log(`Target: ${srv.baseUrl}`);

  const browser = await launchBrowser();
  try {
  const page = await browser.newPage();

  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', err => errors.push(err.message));

  await openAuthenticatedHub(page, srv.baseUrl, srv.sitePassword);

  if (errors.length > 0) {
    console.warn('⚠️ Console errors detected during initial load:', errors);
  }

  console.log('Running snapshot capture across 48 combinatorial scenarios...');

  const result = await page.evaluate(() => {
    // Reset local storage to guarantee pristine seed state
    try {
      localStorage.clear();
    } catch (e) {}

    if (typeof fillCampaignSelect === 'function') {
      fillCampaignSelect();
    }

    const campaignSelect = document.getElementById('campaignId');
    if (campaignSelect) {
      campaignSelect.value = 'nov2026';
      if (typeof onCampaignChange === 'function') {
        onCampaignChange(true);
      }
    }

    const countries = ['QA', 'KW', 'BH', 'OM'];
    const phases = [0, 1, 2, 3, 4, 5];
    const couponModes = ['default', 'custom'];
    const snapshots = {};

    let count = 0;

    for (const country of countries) {
      const countryEl = document.getElementById('country');
      countryEl.value = country;
      if (typeof onCountryChange === 'function') {
        onCountryChange();
      }

      for (const phaseIx of phases) {
        const phaseEl = document.getElementById('selectedPhase');
        phaseEl.value = String(phaseIx);
        if (typeof onPhaseChange === 'function') {
          onPhaseChange();
        }

        for (const mode of couponModes) {
          const discountEl = document.getElementById('discountCode');
          if (mode === 'custom') {
            discountEl.value = 'CUSTOMVIP26';
            if (typeof render === 'function') {
              render(true);
            }
          } else {
            // Restore default code for this phase and country
            if (typeof onPhaseChange === 'function') {
              onPhaseChange();
            }
            if (typeof render === 'function') {
              render(true);
            }
          }

          const scenarioKey = `nov2026_p${phaseIx + 1}_${country}_${mode}`;
          count++;

          const getHtml = id => {
            const el = document.getElementById(id);
            return el ? el.innerHTML : '';
          };
          const getText = id => {
            const el = document.getElementById(id);
            return el ? el.textContent : '';
          };

          snapshots[scenarioKey] = {
            scenarioKey,
            campaign: 'nov2026',
            phaseNumber: phaseIx + 1,
            phaseIx,
            country,
            couponMode: mode,
            inputs: {
              campaignId: document.getElementById('campaignId').value,
              phaseIx: phaseIx,
              country: country,
              discountCode: discountEl ? discountEl.value : '',
              platform: document.getElementById('platform') ? document.getElementById('platform').value : '',
              subDay: document.getElementById('subDay') ? document.getElementById('subDay').value : '',
              subMonth: document.getElementById('subMonth') ? document.getElementById('subMonth').value : '',
              liveDay: document.getElementById('liveDay') ? document.getElementById('liveDay').value : '',
              liveMonth: document.getElementById('liveMonth') ? document.getElementById('liveMonth').value : '',
              fee: document.getElementById('fee') ? document.getElementById('fee').value : '',
              kpi: document.getElementById('kpiTarget') ? document.getElementById('kpiTarget').value : '',
              sender: document.getElementById('senderName') ? (document.getElementById('senderName').value || 'Mahmoud') : 'Mahmoud'
            },
            outputs: {
              subjectText: getText('subjectText'),
              outEmailEn: getHtml('out-email-en'),
              outEmailAr: getHtml('out-email-ar'),
              outBriefEn: getHtml('out-brief-en'),
              outBriefAr: getHtml('out-brief-ar'),
              outBriefTxtEn: getHtml('out-brief-txt-en'),
              outBriefTxtAr: getHtml('out-brief-txt-ar')
            }
          };
        }
      }
    }

    return { snapshots, count };
  });

  if (!fs.existsSync(FIXTURES_DIR)) {
    fs.mkdirSync(FIXTURES_DIR, { recursive: true });
  }

  const payload = {
    version: '1.0.0',
    capturedAt: new Date().toISOString(),
    campaignId: 'nov2026',
    scenarioCount: result.count,
    scenarios: result.snapshots
  };

  const jsonStr = JSON.stringify(payload, null, 2);
  fs.writeFileSync(SNAPSHOT_OUT, jsonStr, 'utf8');

  console.log(`\n✅ Successfully generated ${result.count} snapshots.`);
  console.log(`📁 File saved: ${SNAPSHOT_OUT}`);
  console.log(`📦 Size: ${(jsonStr.length / 1024).toFixed(2)} KB`);

  } finally {
    await browser.close();
    await srv.close();
  }
  return result.count;
}

if (require.main === module) {
  captureBaseline()
    .then(count => {
      console.log(`\nDone! Successfully captured ${count} baseline scenarios.`);
      process.exit(0);
    })
    .catch(err => {
      console.error('Fatal error during baseline capture:', err);
      process.exit(1);
    });
}

module.exports = { captureBaseline };
