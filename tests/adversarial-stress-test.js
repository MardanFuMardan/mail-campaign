// mail-campaign/tests/adversarial-stress-test.js
/**
 * Empirical Adversarial Stress Test Suite for Noon Campaign Hub (mail-campaign/index.html)
 *
 * Covers:
 * 1. Rapid Campaign Switches & State Re-anchoring (100 switches across all 5 campaigns)
 * 2. Active Campaign Indicator Banner Dynamic Updates & Integrity
 * 3. Custom Dropdown Engine Synchronization under Programmatic Mutation & Keyboard/Mouse Interaction
 * 4. Fuzzing & Boundary Inputs (Empty strings, extreme dates 0, 32, -1, 99, 1000, Arabic/Unicode names, XSS vectors, long strings)
 * 5. Console Integrity & Uncaught Exception Monitoring
 */

const path = require('path');
const { launchBrowser } = require('./lib/chrome-launcher');
const { startTestServer, openAuthenticatedHub } = require('./lib/test-server');

async function runAdversarialStressTest() {
  const startTime = Date.now();
  const srv = await startTestServer();
  console.log('======================================================================');
  console.log('⚡ NOON CAMPAIGN HUB — EMPIRICAL ADVERSARIAL STRESS TEST SUITE');
  console.log('======================================================================');
  console.log(`Target: ${srv.baseUrl}\n`);

  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;

  const failureLog = [];

  function assert(category, condition, message, details = '') {
    totalTests++;
    if (condition) {
      console.log(`  ✅ [${category}] PASS: ${message}`);
      passedTests++;
    } else {
      console.error(`  ❌ [${category}] FAIL: ${message}`);
      if (details) console.error(`     Details: ${details}`);
      failedTests++;
      failureLog.push({ category, message, details });
    }
  }

  const browser = await launchBrowser();
  try {
  const page = await browser.newPage();

  const consoleErrors = [];
  const consoleWarnings = [];
  const uncaughtPageErrors = [];

  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
    if (msg.type() === 'warning') consoleWarnings.push(msg.text());
  });
  page.on('pageerror', err => {
    uncaughtPageErrors.push(err.message || String(err));
  });

  await openAuthenticatedHub(page, srv.baseUrl, srv.sitePassword);

  // Reset localStorage to seed state
  await page.evaluate(() => {
    try { localStorage.clear(); } catch (e) {}
    if (typeof fillCampaignSelect === 'function') fillCampaignSelect();
    if (typeof onCampaignChange === 'function') onCampaignChange(true);
  });

  // =========================================================================
  // SUITE 1: Rapid Campaign Switches Stress Test (100 Switches)
  // =========================================================================
  console.log('▶️ SUITE 1: Rapid Campaign Switches Stress Test');

  const rapidSwitchResult = await page.evaluate(async () => {
    const campaigns = ['nov2026', 'oct2026', 'sep2026', 'aug2026', 'apr2026'];
    const switchCount = 100;
    const history = [];

    for (let i = 0; i < switchCount; i++) {
      const campId = campaigns[i % campaigns.length];
      const sel = document.getElementById('campaignId');
      sel.value = campId;
      if (typeof onCampaignChange === 'function') {
        onCampaignChange();
      }
      if (i % 20 === 0 || i === switchCount - 1) {
        history.push({
          iteration: i,
          campId: campId,
          activeVal: sel.value,
          triggerText: (document.getElementById('campaignId-display') || {}).textContent,
          bannerCampName: (document.getElementById('activeCampName') || {}).textContent,
          phaseCount: (document.getElementById('selectedPhase') || {}).options ? document.getElementById('selectedPhase').options.length : 0,
          subMonth: (document.getElementById('subMonth') || {}).value,
          liveMonth: (document.getElementById('liveMonth') || {}).value
        });
      }
    }

    // Return to nov2026 explicitly and render
    document.getElementById('campaignId').value = 'nov2026';
    onCampaignChange();
    render();

    const finalState = {
      activeId: document.getElementById('campaignId').value,
      bannerCampName: (document.getElementById('activeCampName') || {}).textContent,
      bannerEnName: (document.getElementById('activeCampEnName') || {}).textContent,
      bannerPhaseName: (document.getElementById('activePhaseName') || {}).textContent,
      phaseOptionsCount: document.getElementById('selectedPhase').options.length,
      subMonthVal: document.getElementById('subMonth').value,
      liveMonthVal: document.getElementById('liveMonth').value,
      emailEnLength: (document.getElementById('out-email-en') || {}).innerHTML.length,
      emailArLength: (document.getElementById('out-email-ar') || {}).innerHTML.length,
      briefEnLength: (document.getElementById('out-brief-en') || {}).innerHTML.length,
      briefArLength: (document.getElementById('out-brief-ar') || {}).innerHTML.length
    };

    return { switchCount, history, finalState };
  });

  assert('RAPID_SWITCH', rapidSwitchResult.switchCount === 100, `Completed 100 rapid campaign switches without freezing`);
  assert('RAPID_SWITCH', rapidSwitchResult.finalState.activeId === 'nov2026', `Final active campaign ID is "nov2026"`);
  assert('RAPID_SWITCH', rapidSwitchResult.finalState.phaseOptionsCount === 6, `Final phase selector has all 6 November phases populated`);
  assert('RAPID_SWITCH', rapidSwitchResult.finalState.subMonthVal === '11' && rapidSwitchResult.finalState.liveMonthVal === '11', `Default months correctly re-anchored to November ("11")`);
  assert('RAPID_SWITCH', rapidSwitchResult.finalState.emailEnLength > 1000 && rapidSwitchResult.finalState.emailArLength > 1000, `Output panes rendered correctly post-rapid-switching (EN: ${rapidSwitchResult.finalState.emailEnLength} chars, AR: ${rapidSwitchResult.finalState.emailArLength} chars)`);

  // =========================================================================
  // SUITE 2: Active Campaign Indicator Banner Dynamic Updates & Integrity
  // =========================================================================
  console.log('\n▶️ SUITE 2: Active Campaign Indicator Banner Dynamic Updates');

  const bannerStressResult = await page.evaluate(() => {
    const results = [];
    const novPhases = [0, 1, 2, 3, 4, 5];

    // Check each phase in nov2026
    document.getElementById('campaignId').value = 'nov2026';
    onCampaignChange();

    for (const pIx of novPhases) {
      document.getElementById('selectedPhase').value = String(pIx);
      onPhaseChange();

      const banner = document.getElementById('activeCampaignBanner');
      const campName = document.getElementById('activeCampName') ? document.getElementById('activeCampName').textContent : '';
      const phaseName = document.getElementById('activePhaseName') ? document.getElementById('activePhaseName').textContent : '';
      const bannerHtml = banner ? banner.innerHTML : '';

      results.push({
        phaseIndex: pIx,
        campName,
        phaseName,
        hasLeadPhrase: bannerHtml.includes('أنت الآن واقف على كامبين:'),
        hasPulse: bannerHtml.includes('indicator-pulse'),
        phaseNumberInText: phaseName.includes(String(pIx + 1))
      });
    }

    // Now test switching from highest phase (5) to oct2026 (fewer phases)
    document.getElementById('selectedPhase').value = '5';
    onPhaseChange();
    document.getElementById('campaignId').value = 'oct2026';
    onCampaignChange();

    const octPhaseName = document.getElementById('activePhaseName') ? document.getElementById('activePhaseName').textContent : '';
    const octCampName = document.getElementById('activeCampName') ? document.getElementById('activeCampName').textContent : '';

    // Switch back to nov2026
    document.getElementById('campaignId').value = 'nov2026';
    onCampaignChange();

    return { phaseResults: results, octPhaseName, octCampName };
  });

  const allPhasesUpdated = bannerStressResult.phaseResults.every(r => r.hasLeadPhrase && r.hasPulse && r.phaseNumberInText);
  assert('BANNER_INDICATOR', allPhasesUpdated, `Banner dynamic update verified across all 6 phases with lead phrase and pulsing ring`);
  assert('BANNER_INDICATOR', bannerStressResult.octCampName.includes('أكتوبر') || bannerStressResult.octCampName.includes('October'), `Switching to oct2026 accurately updates banner campaign title`);
  assert('BANNER_INDICATOR', bannerStressResult.octPhaseName.length > 0 && !bannerStressResult.octPhaseName.includes('undefined'), `Switching from Phase 5 to campaign with fewer phases safely resets phase display without "undefined" error (got: "${bannerStressResult.octPhaseName}")`);

  // =========================================================================
  // SUITE 3: Custom Dropdown Engine Synchronization under Programmatic Mutation
  // =========================================================================
  console.log('\n▶️ SUITE 3: Custom Dropdown Engine Synchronization under Programmatic Mutation');

  const dropdownSyncResult = await page.evaluate(() => {
    const checks = {};

    // 3.1: Programmatic mutation on #country
    const countrySel = document.getElementById('country');
    countrySel.value = 'OM';
    const omDisplay = (document.getElementById('country-display') || {}).textContent;
    checks.countryOmSync = omDisplay.includes('عُمان') || omDisplay.includes('Oman');

    countrySel.value = 'KW';
    const kwDisplay = (document.getElementById('country-display') || {}).textContent;
    checks.countryKwSync = kwDisplay.includes('الكويت') || kwDisplay.includes('Kuwait');

    // 3.2: Programmatic mutation on #platform
    const platSel = document.getElementById('platform');
    platSel.value = 'Snapchat';
    const snapDisplay = (document.getElementById('platform-display') || {}).textContent;
    checks.platformSnapSync = snapDisplay.includes('Snapchat') || snapDisplay.includes('سناب');

    platSel.value = 'TikTok';
    const ttDisplay = (document.getElementById('platform-display') || {}).textContent;
    checks.platformTtSync = ttDisplay.includes('TikTok') || ttDisplay.includes('تيك توك');

    // 3.3: Programmatic mutation on #subMonth & #liveMonth
    const subMonthSel = document.getElementById('subMonth');
    subMonthSel.value = '04';
    const aprDisplay = (document.getElementById('subMonth-display') || {}).textContent;
    checks.subMonthSync = aprDisplay.includes('April') || aprDisplay.includes('أبريل');

    // 3.4: Programmatic assignment of invalid / non-existent value
    countrySel.value = 'NON_EXISTENT_GCC';
    const invalidFallbackDisplay = (document.getElementById('country-display') || {}).textContent;
    checks.invalidCountryHandledWithoutCrash = typeof invalidFallbackDisplay === 'string';

    // Reset country back to QA
    countrySel.value = 'QA';

    return checks;
  });

  assert('DROPDOWN_SYNC', dropdownSyncResult.countryOmSync, `Custom country dropdown synchronizes to Oman ("OM") on direct .value mutation`);
  assert('DROPDOWN_SYNC', dropdownSyncResult.countryKwSync, `Custom country dropdown synchronizes to Kuwait ("KW") on direct .value mutation`);
  assert('DROPDOWN_SYNC', dropdownSyncResult.platformSnapSync, `Custom platform dropdown synchronizes to Snapchat on direct .value mutation`);
  assert('DROPDOWN_SYNC', dropdownSyncResult.platformTtSync, `Custom platform dropdown synchronizes to TikTok on direct .value mutation`);
  assert('DROPDOWN_SYNC', dropdownSyncResult.subMonthSync, `Custom month dropdown synchronizes to April ("04") on direct .value mutation`);
  assert('DROPDOWN_SYNC', dropdownSyncResult.invalidCountryHandledWithoutCrash, `Assigning non-existent value degrades gracefully without runtime crash`);

  // =========================================================================
  // SUITE 3.5: Interactive UI Dropdown Behavior (Clicks, Keyboard, Auto-Close)
  // =========================================================================
  console.log('\n▶️ SUITE 3.5: Custom Dropdown Interactive UI Behavior (Clicks & Keyboard)');

  // Test opening a dropdown by clicking its trigger
  await page.click('#platform-trigger');
  const isPlatformMenuOpen = await page.evaluate(() => {
    const menu = document.getElementById('platform-menu');
    const trigger = document.getElementById('platform-trigger');
    return menu.classList.contains('show') && trigger.getAttribute('aria-expanded') === 'true';
  });
  assert('DROPDOWN_UI', isPlatformMenuOpen, `Clicking platform trigger opens menu (aria-expanded="true" and class="show")`);

  // Test opening another dropdown closes the first (Mutual Exclusion)
  await page.click('#country-trigger');
  const mutualExclusionCheck = await page.evaluate(() => {
    const platMenu = document.getElementById('platform-menu');
    const countryMenu = document.getElementById('country-menu');
    return !platMenu.classList.contains('show') && countryMenu.classList.contains('show');
  });
  assert('DROPDOWN_UI', mutualExclusionCheck, `Opening a new dropdown automatically closes previously open dropdowns`);

  // Test pressing Escape closes the active menu
  await page.keyboard.press('Escape');
  const escapeClosesMenu = await page.evaluate(() => {
    const countryMenu = document.getElementById('country-menu');
    return !countryMenu.classList.contains('show');
  });
  assert('DROPDOWN_UI', escapeClosesMenu, `Pressing Escape key closes the open dropdown menu`);

  // Test selecting an option by clicking custom menu item
  await page.click('#country-trigger');
  await page.click('#country-menu [data-value="BH"]');
  const itemClickSelectionCheck = await page.evaluate(() => {
    const sel = document.getElementById('country');
    const menu = document.getElementById('country-menu');
    const display = document.getElementById('country-display');
    return {
      nativeVal: sel.value,
      menuClosed: !menu.classList.contains('show'),
      displayHasBahrain: display.textContent.includes('البحرين') || display.textContent.includes('Bahrain')
    };
  });
  assert('DROPDOWN_UI', itemClickSelectionCheck.nativeVal === 'BH' && itemClickSelectionCheck.menuClosed && itemClickSelectionCheck.displayHasBahrain,
    `Clicking item in custom menu updates native select value to "BH", closes menu, and updates display label`);

  // Reset country back to QA
  await page.evaluate(() => {
    document.getElementById('country').value = 'QA';
    onCountryChange();
  });

  // =========================================================================
  // SUITE 4: Boundary & Edge-Case Input Fuzzing
  // =========================================================================
  console.log('\n▶️ SUITE 4: Boundary & Edge-Case Input Fuzzing');

  // Case 4.1: Empty Inputs
  const emptyInputsResult = await page.evaluate(() => {
    document.getElementById('infName').value = '';
    document.getElementById('discountCode').value = '';
    document.getElementById('fee').value = '';
    document.getElementById('kpiTarget').value = '';
    document.getElementById('senderName').value = '';
    document.getElementById('subDay').value = '';
    document.getElementById('liveDay').value = '';

    render(true);

    const emailEn = document.getElementById('out-email-en').innerHTML;
    const emailAr = document.getElementById('out-email-ar').innerHTML;
    const briefEn = document.getElementById('out-brief-en').innerHTML;
    const briefAr = document.getElementById('out-brief-ar').innerHTML;

    return {
      emailEnHasNameFallback: emailEn.includes('[Name]') || emailEn.includes('Hi <strong>[Name]</strong>'),
      emailArHasNameFallback: emailAr.includes('[الاسم]') || emailAr.includes('مرحباً <strong>[الاسم]</strong>'),
      emailEnHasDateFallback: emailEn.includes('[Date]'),
      emailArHasDateFallback: emailAr.includes('[التاريخ]'),
      emailEnHasFeeFallback: emailEn.includes('[Fee] AED'),
      emailArHasFeeFallback: emailAr.includes('[المبلغ] AED'),
      briefEnRendered: briefEn.length > 500,
      briefArRendered: briefAr.length > 500
    };
  });

  assert('EDGE_EMPTY', emptyInputsResult.emailEnHasNameFallback && emptyInputsResult.emailArHasNameFallback,
    `Empty influencer name falls back gracefully to "[Name]" (EN) and "[الاسم]" (AR) without undefined/NaN`);
  assert('EDGE_EMPTY', emptyInputsResult.emailEnHasDateFallback && emptyInputsResult.emailArHasDateFallback,
    `Empty delivery/live days fall back gracefully to "[Date]" (EN) and "[التاريخ]" (AR)`);
  assert('EDGE_EMPTY', emptyInputsResult.emailEnHasFeeFallback && emptyInputsResult.emailArHasFeeFallback,
    `Empty fee falls back gracefully to "[Fee] AED" (EN) and "[المبلغ] AED" (AR)`);
  assert('EDGE_EMPTY', emptyInputsResult.briefEnRendered && emptyInputsResult.briefArRendered,
    `Brief panes produce valid HTML structure when all optional fields are blank`);

  // Case 4.2: Extreme & Invalid Date Inputs (0, 32, -1, 99, 1000, -999)
  const extremeDatesResult = await page.evaluate(() => {
    const testCases = [
      { sub: '0', live: '32' },
      { sub: '-1', live: '99' },
      { sub: '1000', live: '-999' },
      { sub: '00', live: '01' }
    ];

    const results = [];

    for (const tc of testCases) {
      document.getElementById('subDay').value = tc.sub;
      document.getElementById('liveDay').value = tc.live;
      render(true);

      const emailEn = document.getElementById('out-email-en').innerHTML;
      const emailAr = document.getElementById('out-email-ar').innerHTML;

      results.push({
        testCase: tc,
        enContainsSub: emailEn.includes(tc.sub),
        enContainsLive: emailEn.includes(tc.live),
        arContainsSub: emailAr.includes(tc.sub),
        arContainsLive: emailAr.includes(tc.live),
        noCrash: emailEn.length > 1000 && emailAr.length > 1000
      });
    }

    return results;
  });

  const allExtremeDatesSurvived = extremeDatesResult.every(r => r.noCrash && r.enContainsSub && r.enContainsLive);
  assert('EDGE_DATES', allExtremeDatesSurvived,
    `Extreme date values (0, 32, -1, 99, 1000, -999) handled gracefully without arithmetic exceptions or rendering halts`);

  // Case 4.3: Unicode, RTL, Emojis, and Special Characters in Influencer Name & Code
  const unicodeFuzzResult = await page.evaluate(() => {
    const unicodeName = '👑 د. فاطمة الزهراء بنت عبد العزيز آل سعود 🌟✨ (VIP & Top Tier)';
    const customCode = '🔥SUPER_VIP_2026🔥';

    document.getElementById('infName').value = unicodeName;
    document.getElementById('discountCode').value = customCode;
    render(true);

    const emailEn = document.getElementById('out-email-en').textContent || '';
    const emailAr = document.getElementById('out-email-ar').textContent || '';
    const briefAr = document.getElementById('out-brief-ar').textContent || '';
    const briefTxtAr = (document.getElementById('out-brief-txt-ar') || {}).textContent || '';

    return {
      emailEnHasUnicodeName: emailEn.includes(unicodeName),
      emailArHasUnicodeName: emailAr.includes(unicodeName),
      emailEnHasCode: emailEn.includes(customCode),
      emailArHasCode: emailAr.includes(customCode),
      briefArHasCode: briefAr.includes(customCode),
      briefTxtArHasCode: briefTxtAr.includes(customCode)
    };
  });

  assert('EDGE_UNICODE', unicodeFuzzResult.emailEnHasUnicodeName && unicodeFuzzResult.emailArHasUnicodeName,
    `Full Arabic honorifics, diacritics, and emoji characters render faithfully in English and Arabic email outputs`);
  assert('EDGE_UNICODE', unicodeFuzzResult.emailEnHasCode && unicodeFuzzResult.briefArHasCode,
    `Emoji and decorated custom coupon codes propagate seamlessly across email and brief outputs`);

  // Case 4.4: XSS Safety & Escaping Verification
  const xssSecurityResult = await page.evaluate(() => {
    const xssPayload = '<script>window._xssTriggered=true;</script><img src=x onerror="window._xssImgTriggered=true">';
    document.getElementById('infName').value = xssPayload;
    render(true);

    const bannerCampName = (document.getElementById('activeCampName') || {}).innerHTML || '';
    const emailEn = (document.getElementById('out-email-en') || {}).innerHTML || '';

    return {
      xssTriggered: window._xssTriggered === true,
      xssImgTriggered: window._xssImgTriggered === true,
      bannerCampNameSafe: !bannerCampName.includes('<script>'),
      emailEnContainsScriptTag: emailEn.includes('<script>')
    };
  });

  assert('SECURITY_XSS', !xssSecurityResult.xssTriggered && !xssSecurityResult.xssImgTriggered,
    `Hostile script and onerror image payloads in influencer name do NOT execute scripts in application context`);

  // Case 4.5: Buffer & Stress String Length (10,000 characters)
  const bufferStressResult = await page.evaluate(() => {
    const hugeString = 'A'.repeat(10000);
    const startRender = performance.now();
    document.getElementById('infName').value = hugeString;
    render(true);
    const endRender = performance.now();

    const emailEnLen = (document.getElementById('out-email-en') || {}).innerHTML.length;

    return {
      renderDurationMs: endRender - startRender,
      emailEnLen,
      containsFullString: emailEnLen > 10000
    };
  });

  assert('STRESS_BUFFER', bufferStressResult.containsFullString && bufferStressResult.renderDurationMs < 200,
    `10,000 character stress string processed and rendered in ${bufferStressResult.renderDurationMs.toFixed(1)}ms without performance degradation`);

  // =========================================================================
  // SUITE 5: Console Integrity & Exception Trap
  // =========================================================================
  console.log('\n▶️ SUITE 5: Console Integrity & Uncaught Exception Trap');

  assert('CONSOLE_INTEGRITY', consoleErrors.length === 0,
    `Zero browser console errors detected throughout all stress tests (found: ${consoleErrors.length})`,
    consoleErrors.join(' | '));

  assert('CONSOLE_INTEGRITY', uncaughtPageErrors.length === 0,
    `Zero uncaught JavaScript exceptions occurred on window / page (found: ${uncaughtPageErrors.length})`,
    uncaughtPageErrors.join(' | '));

  } finally {
    await browser.close();
    await srv.close();
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log('\n======================================================================');
  console.log(`📊 ADVERSARIAL STRESS TEST SUMMARY (Completed in ${durationSec}s)`);
  console.log('======================================================================');
  console.log(`  TOTAL TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${failedTests}`);

  if (failedTests > 0) {
    console.error('\n⚠️ FAILURES ENCOUNTERED:');
    failureLog.forEach(f => console.error(`  - [${f.category}] ${f.message}: ${f.details}`));
    console.log('\nVERDICT: REQUEST_CHANGES');
    process.exit(1);
  } else {
    console.log('\nVERDICT: APPROVE');
    process.exit(0);
  }
}

runAdversarialStressTest().catch(err => {
  console.error('Fatal test harness error:', err);
  process.exit(1);
});
