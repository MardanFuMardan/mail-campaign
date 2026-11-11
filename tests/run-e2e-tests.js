// mail-campaign/tests/run-e2e-tests.js
/**
 * Master Automated E2E Verification Suite for Noon Campaign Hub
 * Executes Tiers 1-4 (+ Adversarial Edge Cases) with zero external network dependencies.
 *
 * Usage:
 *   node mail-campaign/tests/run-e2e-tests.js
 *   node mail-campaign/tests/run-e2e-tests.js --tier=1,3,4
 *   node mail-campaign/tests/run-e2e-tests.js --tier=4
 */
const fs = require('fs');
const path = require('path');
const { launchBrowser } = require('./lib/chrome-launcher');
const { startTestServer, openAuthenticatedHub } = require('./lib/test-server');

const FIXTURE_PATH = path.resolve(__dirname, 'fixtures/baseline-snapshots.json');

// CLI Arguments parsing
const args = process.argv.slice(2);
const tierArg = args.find(a => a.startsWith('--tier='));
const selectedTiers = tierArg
  ? tierArg.split('=')[1].split(',').map(t => parseInt(t.trim(), 10))
  : [1, 2, 3, 4];

async function runTestSuite() {
  const startTime = Date.now();
  const srv = await startTestServer();
  console.log('======================================================================');
  console.log('🚀 NOON CAMPAIGN HUB — MASTER AUTOMATED E2E VERIFICATION SUITE');
  console.log('======================================================================');
  console.log(`Target: ${srv.baseUrl}`);
  console.log(`Selected Tiers: ${selectedTiers.join(', ')}\n`);

  let totalAssertions = 0;
  let passedAssertions = 0;
  let failedAssertions = 0;

  const tierSummary = {
    1: { name: 'Smoke & Console Integrity', total: 0, passed: 0, failed: 0 },
    2: { name: 'DOM Layout & Brand Styling Acceptance', total: 0, passed: 0, failed: 0 },
    3: { name: 'Interactive State Synchronization', total: 0, passed: 0, failed: 0 },
    4: { name: 'Forensic Output Invariance Gate', total: 0, passed: 0, failed: 0 }
  };

  function assert(tier, condition, message, details = '') {
    totalAssertions++;
    tierSummary[tier].total++;
    if (condition) {
      console.log(`  ✅ [T${tier}] PASS: ${message}`);
      passedAssertions++;
      tierSummary[tier].passed++;
    } else {
      console.error(`  ❌ [T${tier}] FAIL: ${message}`);
      if (details) console.error(`     Details: ${details}`);
      failedAssertions++;
      tierSummary[tier].failed++;
    }
  }

  const browser = await launchBrowser();
  const page = await browser.newPage();

  const consoleErrors = [];
  const consoleWarnings = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
    if (msg.type() === 'warning') consoleWarnings.push(msg.text());
  });
  page.on('pageerror', err => consoleErrors.push(err.message));

  try {
  await openAuthenticatedHub(page, srv.baseUrl, srv.sitePassword);

  // =========================================================================
  // TIER 1: Smoke & Console Integrity
  // =========================================================================
  if (selectedTiers.includes(1)) {
    console.log('▶️ TIER 1: Smoke & Console Integrity');

    const title = await page.title();
    assert(1, title.toLowerCase().includes('noon'), `Page title contains brand name ("${title}")`);
    assert(1, consoleErrors.length === 0, `Zero initial console errors (found: ${consoleErrors.length})`, consoleErrors.join('; '));

    const coreElementIds = [
      'campaignId',
      'selectedPhase',
      'infName',
      'country',
      'discountCode',
      'platform',
      'subDay',
      'subMonth',
      'liveDay',
      'liveMonth',
      'fee',
      'kpiTarget',
      'senderName',
      'subjectText',
      'out-email-en',
      'out-email-ar',
      'out-brief-en',
      'out-brief-ar',
      'out-brief-txt-en',
      'out-brief-txt-ar',
      'copyFab',
      'copyFabBottom'
    ];

    const elementChecks = await page.evaluate((ids) => {
      const results = {};
      for (const id of ids) {
        results[id] = document.getElementById(id) !== null;
      }
      return results;
    }, coreElementIds);

    for (const id of coreElementIds) {
      assert(1, elementChecks[id] === true, `Core DOM element #${id} exists in DOM`);
    }

    const initialCampaign = await page.evaluate(() => document.getElementById('campaignId') ? document.getElementById('campaignId').value : null);
    assert(1, initialCampaign === 'nov2026', `Default initial campaign is "nov2026" (got: "${initialCampaign}")`);
    console.log('');
  }

  // =========================================================================
  // TIER 2: DOM Layout, Visual Structure & Brand Styling Acceptance
  // =========================================================================
  if (selectedTiers.includes(2)) {
    console.log('▶️ TIER 2: DOM Layout, Visual Structure & Brand Styling Acceptance');

    // AC 1: Campaign Selector vs Phase Layout Adjacency
    const layoutCheck = await page.evaluate(() => {
      const campEl = document.getElementById('campaignId');
      const phaseEl = document.getElementById('selectedPhase');
      const infNameEl = document.getElementById('infName');
      const countryEl = document.getElementById('country');

      if (!campEl || !phaseEl) return { valid: false, reason: 'Elements missing' };

      // Look for custom wrapper or use element directly
      const campWrap = campEl.closest('.form-group, .custom-select-wrap, .control-group') || campEl;
      const phaseWrap = phaseEl.closest('.form-group, .custom-select-wrap, .control-group') || phaseEl;
      const infWrap = infNameEl ? (infNameEl.closest('.form-group, .control-group') || infNameEl) : null;
      const countryWrap = countryEl ? (countryEl.closest('.form-group, .control-group') || countryEl) : null;

      const campRect = campWrap.getBoundingClientRect();
      const phaseRect = phaseWrap.getBoundingClientRect();
      const infRect = infWrap ? infWrap.getBoundingClientRect() : null;
      const countryRect = countryWrap ? countryWrap.getBoundingClientRect() : null;

      // Acceptance Criteria: Phase selector must be positioned below Campaign selector
      // AND situated immediately below it (above influencer name input and country input)
      const isPhaseBelowCamp = phaseRect.top >= (campRect.bottom - 5);
      const isPhaseAboveInfName = infRect ? (phaseRect.bottom <= (infRect.top + 10)) : true;
      const isPhaseAboveCountry = countryRect ? (phaseRect.bottom <= (countryRect.top + 10)) : true;

      return {
        valid: true,
        isPhaseBelowCamp,
        isPhaseAboveInfName,
        isPhaseAboveCountry,
        campTop: campRect.top,
        campBottom: campRect.bottom,
        phaseTop: phaseRect.top,
        phaseBottom: phaseRect.bottom,
        infTop: infRect ? infRect.top : null,
        countryTop: countryRect ? countryRect.top : null
      };
    });

    assert(2, layoutCheck.valid && layoutCheck.isPhaseBelowCamp,
      'Phase field is positioned beneath Campaign selector',
      `campBottom: ${layoutCheck.campBottom}, phaseTop: ${layoutCheck.phaseTop}`);

    assert(2, layoutCheck.valid && layoutCheck.isPhaseAboveInfName,
      'Phase field is situated immediately below Campaign selector (above influencer inputs)',
      `phaseBottom: ${layoutCheck.phaseBottom}, infTop: ${layoutCheck.infTop}`);

    // AC 2: Dynamic Active Campaign Indicator
    const indicatorCheck = await page.evaluate(() => {
      const ind = document.getElementById('activeCampaignNotice') ||
                  document.getElementById('activeCampaignBanner') ||
                  document.querySelector('.active-campaign-banner, .active-campaign-chip, [data-active-campaign]');
      if (!ind) {
        return { exists: false, reason: 'Active campaign indicator element not found' };
      }

      const initialText = ind.textContent.trim();

      // Switch to oct2026
      document.getElementById('campaignId').value = 'oct2026';
      if (typeof onCampaignChange === 'function') onCampaignChange();
      const octText = ind.textContent.trim();

      // Switch back to nov2026
      document.getElementById('campaignId').value = 'nov2026';
      if (typeof onCampaignChange === 'function') onCampaignChange();
      const novText = ind.textContent.trim();

      return {
        exists: true,
        initialText,
        octText,
        novText,
        hasArabicPhrase: novText.includes('أنت الآن') || novText.includes('الحملة') || novText.includes('النشطة'),
        updatesDynamically: octText !== novText && octText.toLowerCase().includes('oct') || octText.includes('أكتوبر')
      };
    });

    assert(2, indicatorCheck.exists, 'Dynamic active campaign indicator exists in DOM', indicatorCheck.reason);
    assert(2, indicatorCheck.hasArabicPhrase === true,
      `Active indicator contains descriptive Arabic phrasing (found: "${indicatorCheck.novText || 'none'}")`);
    assert(2, indicatorCheck.updatesDynamically === true,
      'Active indicator updates dynamically when changing campaign selection');

    // AC 3: Brand Header Styling (lowercase "noon" in #feee00, clean white title)
    const headerCheck = await page.evaluate(() => {
      const h1 = document.querySelector('header h1') || document.querySelector('h1');
      if (!h1) return { exists: false };

      const noonSpan = h1.querySelector('.brand-noon, .brand-yellow, span') || h1;
      const hubSpan = h1.querySelector('.hub-title, .brand-white') || h1;

      const noonStyle = window.getComputedStyle(noonSpan);
      const hubStyle = window.getComputedStyle(hubSpan);

      const rawH1Text = h1.textContent.trim();
      const noonText = noonSpan.textContent.trim();

      const isYellow = noonStyle.color.includes('254, 238, 0') ||
                       noonStyle.color.includes('rgb(254, 238, 0)') ||
                       noonStyle.color.includes('#feee00');

      const isWhite = hubStyle.color.includes('255, 255, 255') ||
                      hubStyle.color.includes('#ffffff') ||
                      hubStyle.color.includes('244, 244, 245');

      const isLowercaseNoon = rawH1Text.includes('noon') || noonText === 'noon';

      return {
        exists: true,
        rawH1Text,
        noonText,
        noonColor: noonStyle.color,
        hubColor: hubStyle.color,
        isLowercaseNoon,
        isYellow,
        isWhite
      };
    });

    assert(2, headerCheck.exists, 'Brand header <h1> exists in DOM');
    assert(2, headerCheck.isLowercaseNoon,
      `Brand header displays "noon" in lowercase (header text: "${headerCheck.rawH1Text}")`);
    assert(2, headerCheck.isYellow,
      `Brand "noon" is rendered in brand yellow #feee00 (computed: ${headerCheck.noonColor})`);

    // AC 4: Platform Dropdown Options
    const platformCheck = await page.evaluate(() => {
      const plat = document.getElementById('platform');
      if (!plat) return { exists: false };
      const options = Array.from(plat.querySelectorAll('option')).map(o => o.value);
      const required = ['Instagram Reels', 'TikTok', 'Instagram Reels & TikTok', 'Snapchat'];
      const hasRequired = required.every(r => options.includes(r));
      return { exists: true, optionsCount: options.length, hasRequired, options };
    });

    assert(2, platformCheck.exists && platformCheck.hasRequired,
      `Platform selector contains required platforms (${platformCheck.optionsCount} available)`);

    // AC 5: Date Inputs & Visual Hierarchy
    const dateCheck = await page.evaluate(() => {
      const subDay = document.getElementById('subDay');
      const subMonth = document.getElementById('subMonth');
      const liveDay = document.getElementById('liveDay');
      const liveMonth = document.getElementById('liveMonth');

      return {
        subDayExists: subDay !== null && subDay.type === 'number',
        subMonthExists: subMonth !== null,
        liveDayExists: liveDay !== null && liveDay.type === 'number',
        liveMonthExists: liveMonth !== null
      };
    });

    assert(2, dateCheck.subDayExists && dateCheck.subMonthExists,
      'Delivery date input correctly structured with day number and month selector');
    assert(2, dateCheck.liveDayExists && dateCheck.liveMonthExists,
      'Publishing date (Go Live) input correctly structured with day number and month selector');
    console.log('');
  }

  // =========================================================================
  // TIER 3: Interactive Component Flow & State Synchronization
  // =========================================================================
  if (selectedTiers.includes(3)) {
    console.log('▶️ TIER 3: Interactive Component Flow & State Synchronization');

    const interactionResults = await page.evaluate(() => {
      const results = {};

      // Test 3.1: Campaign Switch to oct2026 and back to nov2026
      document.getElementById('campaignId').value = 'oct2026';
      onCampaignChange();
      const octPhasesCount = document.getElementById('selectedPhase').options.length;
      const octMonth = document.getElementById('subMonth').value;

      document.getElementById('campaignId').value = 'nov2026';
      onCampaignChange();
      const novPhasesCount = document.getElementById('selectedPhase').options.length;
      const novMonth = document.getElementById('subMonth').value;

      results.octPhasesCount = octPhasesCount;
      results.octMonth = octMonth;
      results.novPhasesCount = novPhasesCount;
      results.novMonth = novMonth;

      // Test 3.2: Phase Switch updates default coupon code
      // Phase 1 (index 0) -> PROMO15
      document.getElementById('selectedPhase').value = '0';
      onPhaseChange();
      const codeP1 = document.getElementById('discountCode').value;

      // Phase 2 (index 1) -> 1111SALE
      document.getElementById('selectedPhase').value = '1';
      onPhaseChange();
      const codeP2 = document.getElementById('discountCode').value;

      // Phase 5 (index 4) -> YFS2026
      document.getElementById('selectedPhase').value = '4';
      onPhaseChange();
      const codeP5 = document.getElementById('discountCode').value;

      results.codeP1 = codeP1;
      results.codeP2 = codeP2;
      results.codeP5 = codeP5;

      // Test 3.3: Custom Discount Code Override
      document.getElementById('discountCode').value = 'TESTINFLUENCER99';
      render(true);

      const emailEnHasCode = document.getElementById('out-email-en').innerHTML.includes('TESTINFLUENCER99');
      const emailArHasCode = document.getElementById('out-email-ar').innerHTML.includes('TESTINFLUENCER99');
      const briefEnHasCode = document.getElementById('out-brief-en').innerHTML.includes('TESTINFLUENCER99');
      const briefArHasCode = document.getElementById('out-brief-ar').innerHTML.includes('TESTINFLUENCER99');

      results.customCodePropagates = emailEnHasCode && emailArHasCode && briefEnHasCode && briefArHasCode;

      // Test 3.4: Country Selection Switch
      document.getElementById('country').value = 'KW';
      onCountryChange();
      const briefKw = document.getElementById('out-brief-ar').innerHTML;
      const kwHasKwd = briefKw.includes('KWD') || briefKw.includes('دينار كويتي');

      document.getElementById('country').value = 'OM';
      onCountryChange();
      const briefOm = document.getElementById('out-brief-ar').innerHTML;
      const omHasOmr = briefOm.includes('OMR') || briefOm.includes('ريال عماني');

      results.countryKwWorks = kwHasKwd;
      results.countryOmWorks = omHasOmr;

      // Test 3.5: Tab Switching updates subjectText
      const tabs = Array.from(document.querySelectorAll('.tab'));
      let tabSubjectCheck = false;
      if (tabs.length >= 2) {
        switchOut('email-en', tabs[0]);
        const subEn = document.getElementById('subjectText').textContent;

        switchOut('email-ar', tabs[1]);
        const subAr = document.getElementById('subjectText').textContent;

        tabSubjectCheck = subEn !== subAr && subEn.includes('Collaboration Opportunity');

        // Restore active tab to email-en to keep tests isolated
        switchOut('email-en', tabs[0]);
      }
      results.tabSubjectCheck = tabSubjectCheck;

      return results;
    });

    assert(3, interactionResults.novPhasesCount === 6,
      `Campaign switch populates all 6 phases for November 2026 (found: ${interactionResults.novPhasesCount})`);
    assert(3, interactionResults.novMonth === '11' && interactionResults.octMonth === '10',
      'Campaign switch dynamically synchronizes default month selectors (11 for Nov, 10 for Oct)');
    assert(3, interactionResults.codeP1 === 'PROMO15',
      `Phase 1 selection sets default code to PROMO15 (got: ${interactionResults.codeP1})`);
    assert(3, interactionResults.codeP2 === '1111SALE',
      `Phase 2 selection sets default code to 1111SALE (got: ${interactionResults.codeP2})`);
    assert(3, interactionResults.codeP5 === 'YFS2026',
      `Phase 5 selection sets default code to YFS2026 (got: ${interactionResults.codeP5})`);
    assert(3, interactionResults.customCodePropagates === true,
      'Custom discount code typing overrides default code across all email and brief output panes');
    assert(3, interactionResults.countryKwWorks && interactionResults.countryOmWorks,
      'Country selector switch updates currencies and discount limits (KWD / OMR)');
    assert(3, interactionResults.tabSubjectCheck === true,
      'Tab switching dynamically updates #subjectText between EN and AR');

    // Test 3.6: Copy action invocation
    const copyCheck = await page.evaluate(() => {
      try {
        const fab = document.getElementById('copyFab');
        if (typeof copyCurrent === 'function' && fab) {
          copyCurrent(fab);
          return { success: true };
        }
        return { success: true, skipped: true };
      } catch (e) {
        return { success: false, error: e.message };
      }
    });
    assert(3, copyCheck.success, 'Copy action executes without unhandled exceptions', copyCheck.error);
    console.log('');
  }

  // =========================================================================
  // TIER 4: Forensic Output Invariance (Golden Baseline Regression Gate)
  // =========================================================================
  if (selectedTiers.includes(4)) {
    console.log('▶️ TIER 4: Forensic Output Invariance (Golden Baseline Regression Gate)');

    if (!fs.existsSync(FIXTURE_PATH)) {
      assert(4, false, `Baseline snapshot fixture exists at ${FIXTURE_PATH}`, 'Run node mail-campaign/tests/capture-baseline.js');
    } else {
      const fixtureData = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
      const scenarioKeys = Object.keys(fixtureData.scenarios);
      console.log(`  Evaluating ${scenarioKeys.length} golden baseline scenarios across 7 output targets...`);

      const comparisonResults = await page.evaluate((scenarios) => {
        const mismatches = [];
        let totalScenarios = 0;
        let totalPanes = 0;

        const defaultTab = document.querySelector('.tabs .tab');
        if (defaultTab && typeof switchOut === 'function') {
          switchOut('email-en', defaultTab);
        }

        for (const key of Object.keys(scenarios)) {
          totalScenarios++;
          const golden = scenarios[key];
          const inp = golden.inputs;

          // Set inputs
          document.getElementById('campaignId').value = inp.campaignId;
          if (typeof onCampaignChange === 'function') onCampaignChange(true);

          document.getElementById('country').value = inp.country;
          if (typeof onCountryChange === 'function') onCountryChange();

          document.getElementById('selectedPhase').value = String(inp.phaseIx);
          if (typeof onPhaseChange === 'function') onPhaseChange();

          document.getElementById('discountCode').value = inp.discountCode;
          if (inp.platform && document.getElementById('platform')) {
            document.getElementById('platform').value = inp.platform;
          }
          if (inp.subDay && document.getElementById('subDay')) document.getElementById('subDay').value = inp.subDay;
          if (inp.subMonth && document.getElementById('subMonth')) document.getElementById('subMonth').value = inp.subMonth;
          if (inp.liveDay && document.getElementById('liveDay')) document.getElementById('liveDay').value = inp.liveDay;
          if (inp.liveMonth && document.getElementById('liveMonth')) document.getElementById('liveMonth').value = inp.liveMonth;
          if (inp.fee && document.getElementById('fee')) document.getElementById('fee').value = inp.fee;
          if (inp.kpi && document.getElementById('kpiTarget')) document.getElementById('kpiTarget').value = inp.kpi;
          if (inp.sender && document.getElementById('senderName')) document.getElementById('senderName').value = inp.sender;

          // Render with force = true
          if (typeof render === 'function') render(true);

          const getHtml = id => {
            const el = document.getElementById(id);
            return el ? el.innerHTML : '';
          };
          const getText = id => {
            const el = document.getElementById(id);
            return el ? el.textContent : '';
          };

          const actual = {
            subjectText: getText('subjectText'),
            outEmailEn: getHtml('out-email-en'),
            outEmailAr: getHtml('out-email-ar'),
            outBriefEn: getHtml('out-brief-en'),
            outBriefAr: getHtml('out-brief-ar'),
            outBriefTxtEn: getHtml('out-brief-txt-en'),
            outBriefTxtAr: getHtml('out-brief-txt-ar')
          };

          const targets = ['subjectText', 'outEmailEn', 'outEmailAr', 'outBriefEn', 'outBriefAr', 'outBriefTxtEn', 'outBriefTxtAr'];
          for (const target of targets) {
            totalPanes++;
            if (actual[target] !== golden.outputs[target]) {
              mismatches.push({
                scenarioKey: key,
                target,
                expectedLen: golden.outputs[target] ? golden.outputs[target].length : 0,
                actualLen: actual[target] ? actual[target].length : 0,
                expectedSnippet: golden.outputs[target] ? golden.outputs[target].substring(0, 80) : '',
                actualSnippet: actual[target] ? actual[target].substring(0, 80) : ''
              });
            }
          }
        }

        return { totalScenarios, totalPanes, mismatches };
      }, fixtureData.scenarios);

      assert(4, comparisonResults.totalScenarios === 48,
        `Processed all ${comparisonResults.totalScenarios}/48 combinatorial scenarios`);

      const noMismatches = comparisonResults.mismatches.length === 0;
      let mismatchDetails = '';
      if (!noMismatches) {
        mismatchDetails = comparisonResults.mismatches.slice(0, 3).map(m =>
          `[${m.scenarioKey}] on <${m.target}>: expected len ${m.expectedLen}, got len ${m.actualLen}`
        ).join(' | ');
      }

      assert(4, noMismatches,
        `All ${comparisonResults.totalPanes} output evaluations match golden baseline byte-for-byte`,
        mismatchDetails);
    }
    console.log('');
  }

  // =========================================================================
  // Final Console Error Check
  // =========================================================================
  assert(1, consoleErrors.length === 0,
    `Browser console remained completely free of unhandled errors throughout execution (count: ${consoleErrors.length})`,
    consoleErrors.join('; '));

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log('======================================================================');
  console.log(`📊 FINAL TEST RUN SUMMARY (Completed in ${totalTime}s)`);
  console.log('======================================================================');
  for (const t of selectedTiers) {
    const s = tierSummary[t];
    console.log(`  Tier ${t} [${s.name}]: ${s.passed}/${s.total} passed (${s.failed} failed)`);
  }
  console.log('----------------------------------------------------------------------');
  console.log(`  TOTAL ASSERTIONS: ${totalAssertions} | PASSED: ${passedAssertions} | FAILED: ${failedAssertions}`);
  console.log('======================================================================');

  } finally {
    await browser.close();
    await srv.close();
  }
  return {
    totalAssertions,
    passedAssertions,
    failedAssertions,
    tierSummary
  };
}

if (require.main === module) {
  runTestSuite()
    .then(summary => {
      // If running Tier 1, 3, 4 only or all tiers:
      // In pristine baseline, Tier 2 has known requirement gaps (as planned before Milestone 1-3).
      // We exit with 0 if no fatal script crash occurred, but report exact failure count.
      process.exit(summary.failedAssertions === 0 ? 0 : 1);
    })
    .catch(err => {
      console.error('Fatal Runner Error:', err);
      process.exit(1);
    });
}

module.exports = { runTestSuite };
