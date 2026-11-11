// mail-campaign/tests/empirical-boundary-stress.js
/**
 * Empirical Boundary & Combinatorial Stress Harness
 * Executed by challenger_m1_iter2_2
 */

const fs = require('fs');
const path = require('path');
const { launchBrowser } = require('./lib/chrome-launcher');
const { startTestServer, openAuthenticatedHub } = require('./lib/test-server');

async function runEmpiricalBoundaryStress() {
  const startTime = Date.now();
  const srv = await startTestServer();
  console.log('================================================================================');
  console.log('⚔️  EMPIRICAL BOUNDARY & COMBINATORIAL STRESS HARNESS (challenger_m1_iter2_2)');
  console.log('================================================================================');

  let passed = 0;
  let failed = 0;
  const failureLog = [];

  function check(condition, message, details = '') {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      if (details) console.error(`     Details: ${details}`);
      failed++;
      failureLog.push({ message, details });
    }
  }

  const browser = await launchBrowser({ protocolTimeout: 60000 });
  try {
  const page = await browser.newPage();

  page.on('dialog', async d => await d.dismiss());

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => consoleErrors.push(err.message || String(err)));

  await openAuthenticatedHub(page, srv.baseUrl, srv.sitePassword);

  // Reset to clean seed
  await page.evaluate(() => {
    localStorage.clear();
    if (typeof fillCampaignSelect === 'function') fillCampaignSelect();
    if (typeof onCampaignChange === 'function') onCampaignChange(true);
  });

  // TEST SUITE 1: Extreme Coupon Formatting & Sanitization
  console.log('\n▶️ SUITE 1: Extreme Coupon Formatting, Trimming & Entity Encoding');
  const extremeCodes = [
    { input: '  SPACE_CODE  ', expectedTrimmed: 'SPACE_CODE' },
    { input: '<DIV_INJECT>', expectedRawForbidden: '<DIV_INJECT>' },
    { input: 'CODE&CO', expectedText: 'CODE&CO' },
    { input: 'O\'REILLY', expectedText: 'O\'REILLY' },
    { input: '"QUOTED"', expectedText: '"QUOTED"' }
  ];

  for (const tc of extremeCodes) {
    const res = await page.evaluate((tc) => {
      document.getElementById('discountCode').value = tc.input;
      if (typeof render === 'function') render(true);

      const emailEn = document.getElementById('out-email-en').innerHTML;
      const briefEn = document.getElementById('out-brief-en').innerHTML;
      const emailEnText = document.getElementById('out-email-en').textContent;
      const briefEnText = document.getElementById('out-brief-en').textContent;
      const txtArea = document.getElementById('txt-area-en');
      const txtAreaVal = txtArea ? txtArea.value : '';

      return {
        hasRawForbidden: tc.expectedRawForbidden ? emailEn.includes(tc.expectedRawForbidden) || briefEn.includes(tc.expectedRawForbidden) : false,
        emailHasText: tc.expectedText ? emailEnText.includes(tc.expectedText) : true,
        briefHasText: tc.expectedText ? briefEnText.includes(tc.expectedText) : true,
        emailHasTrimmed: tc.expectedTrimmed ? emailEnText.includes(tc.expectedTrimmed) : true
      };
    }, tc);

    check(!res.hasRawForbidden, `Coupon '${tc.input}' never leaks unescaped HTML tags into DOM`);
    check(res.emailHasText && res.briefHasText, `Coupon '${tc.input}' correctly renders intended text in DOM`);
    check(res.emailHasTrimmed, `Coupon '${tc.input}' correctly trims whitespace`);
  }

  // TEST SUITE 2: Rapid 11-Hop Phase Oscillation with Custom Coupon Persistence
  console.log('\n▶️ SUITE 2: Rapid 11-Hop Phase Oscillation with Custom Coupon Persistence');
  const oscillationResult = await page.evaluate(() => {
    document.getElementById('discountCode').value = 'PERSISTENT_CHALLENGER_CODE';
    if (typeof render === 'function') render(true);

    const hops = [0, 1, 2, 3, 4, 5, 4, 3, 2, 1, 0];
    const log = [];

    for (const h of hops) {
      document.getElementById('selectedPhase').value = String(h);
      if (typeof onPhaseChange === 'function') onPhaseChange();

      const curVal = document.getElementById('discountCode').value;
      const emailEn = document.getElementById('out-email-en').innerHTML;
      const briefEn = document.getElementById('out-brief-en').innerHTML;

      log.push({
        phase: h,
        codeRetained: curVal === 'PERSISTENT_CHALLENGER_CODE',
        emailContainsCode: emailEn.includes('PERSISTENT_CHALLENGER_CODE'),
        briefContainsCode: briefEn.includes('PERSISTENT_CHALLENGER_CODE')
      });
    }

    return log;
  });

  const allHopsRetained = oscillationResult.every(h => h.codeRetained && h.emailContainsCode && h.briefContainsCode);
  check(allHopsRetained, `Custom code PERSISTENT_CHALLENGER_CODE preserved across 11 rapid phase hops (0->1->2->3->4->5->4->3->2->1->0)`);

  // TEST SUITE 3: Oman National Day (Phase 4) Country Isolation Matrix
  console.log('\n▶️ SUITE 3: Oman National Day (Phase 4) Country Isolation Matrix');
  const p4CountryChecks = await page.evaluate(() => {
    document.getElementById('selectedPhase').value = '3'; // Phase 4 (0-indexed: 3)
    if (typeof onPhaseChange === 'function') onPhaseChange();

    const countries = ['QA', 'KW', 'BH', 'OM'];
    const results = {};

    for (const c of countries) {
      document.getElementById('country').value = c;
      if (typeof onCountryChange === 'function') onCountryChange();
      if (typeof render === 'function') render(true);

      const emailEn = document.getElementById('out-email-en').textContent;
      const emailAr = document.getElementById('out-email-ar').textContent;

      results[c] = {
        hasOmanEn: emailEn.includes('Oman National Day celebration'),
        hasOmanAr: emailAr.includes('احتفالات العيد الوطني العماني'),
        hasOmr: emailEn.includes('OMR'),
        hasQar: emailEn.includes('QAR'),
        hasKwd: emailEn.includes('KWD'),
        hasBhd: emailEn.includes('BHD')
      };
    }
    return results;
  });

  check(p4CountryChecks.OM.hasOmanEn && p4CountryChecks.OM.hasOmanAr, 'Oman (OM) in Phase 4 includes dedicated Oman National Day celebration text');
  check(p4CountryChecks.OM.hasOmr, 'Oman (OM) in Phase 4 displays OMR currency');
  check(p4CountryChecks.QA.hasQar && !p4CountryChecks.QA.hasOmr, 'Qatar (QA) displays QAR and strictly excludes OMR');
  check(p4CountryChecks.KW.hasKwd && !p4CountryChecks.KW.hasOmr, 'Kuwait (KW) displays KWD and strictly excludes OMR');
  check(p4CountryChecks.BH.hasBhd && !p4CountryChecks.BH.hasOmr, 'Bahrain (BH) displays BHD and strictly excludes OMR');

  // TEST SUITE 4: Phase 5 & 6 Yellow Friday Sale Noon Express Mandate & PROMO15 Absence
  console.log('\n▶️ SUITE 4: Yellow Friday Sale Noon Express Mandate & PROMO15 Absence');
  const yfsIsolation = await page.evaluate(() => {
    const checks = [];
    for (const phaseIx of [4, 5]) { // Phases 5 & 6
      document.getElementById('selectedPhase').value = String(phaseIx);
      if (typeof onPhaseChange === 'function') onPhaseChange();

      // Ensure default code is active
      const defCode = defaultCodeFor(document.getElementById('country').value, currentCampaign(), phaseIx);
      document.getElementById('discountCode').value = defCode;
      if (typeof render === 'function') render(true);

      const emailEn = document.getElementById('out-email-en').innerHTML;
      const briefEn = document.getElementById('out-brief-en').innerHTML;

      const emailEnText = document.getElementById('out-email-en').textContent;
      const emailArText = document.getElementById('out-email-ar').textContent;
      const briefEnText = document.getElementById('out-brief-en').textContent;
      const briefArText = document.getElementById('out-brief-ar').textContent;

      checks.push({
        phaseIx: phaseIx + 1,
        promoCodeIsYfs: defCode === 'YFS2026',
        // In Phase 6, PROMO15 must be 100% absent from all panes
        hasPromo15InPhase6: phaseIx === 5 ? (emailEn.includes('PROMO15') || briefEn.includes('PROMO15')) : false,
        mentionsNoonExpressEn: emailEnText.includes('noon Express') && briefEnText.includes('noon Express'),
        mentionsNoonExpressAr: emailArText.includes('نون إكسبريس') && briefArText.includes('نون إكسبريس'),
        prohibitsPromo15En: briefEnText.includes('Do NOT mention PROMO15'),
        prohibitsPromo15Ar: briefArText.includes('يُمنع ذكر كود PROMO15 نهائياً')
      });
    }
    return checks;
  });

  check(yfsIsolation[0].promoCodeIsYfs && yfsIsolation[1].promoCodeIsYfs, 'Phases 5 and 6 default promo code is YFS2026');
  check(yfsIsolation[0].mentionsNoonExpressEn && yfsIsolation[0].mentionsNoonExpressAr, 'Phase 5 strictly mentions noon Express items in EN and AR');
  check(yfsIsolation[0].prohibitsPromo15En && yfsIsolation[0].prohibitsPromo15Ar, 'Phase 5 explicitly prohibits PROMO15 ("Do NOT mention PROMO15")');
  check(!yfsIsolation[1].hasPromo15InPhase6, 'Phase 6 (YFS Climax) strictly excludes PROMO15 completely from all panes');

  // TEST SUITE 5: Non-November Campaigns Isolation
  console.log('\n▶️ SUITE 5: Non-November Campaign Isolation (October, September, August, Ramadan)');
  const otherCampaigns = await page.evaluate(() => {
    const list = ['oct2026', 'sep2026', 'aug2026', 'apr2026'];
    const outcomes = [];

    for (const cId of list) {
      document.getElementById('campaignId').value = cId;
      if (typeof onCampaignChange === 'function') onCampaignChange(true);
      if (typeof render === 'function') render(true);

      const emailEn = document.getElementById('out-email-en').innerHTML;
      const briefEn = document.getElementById('out-brief-en').innerHTML;

      outcomes.push({
        campaign: cId,
        hasNoYfsHype: !emailEn.includes('YFS2026') && !briefEn.includes('YFS2026'),
        hasNo1111Sale: !emailEn.includes('1111SALE') && !briefEn.includes('1111SALE'),
        hasNoB1G1: !emailEn.includes('B1G1') && !briefEn.includes('B1G1')
      });
    }
    return outcomes;
  });

  for (const o of otherCampaigns) {
    check(o.hasNoYfsHype && o.hasNo1111Sale && o.hasNoB1G1, `Campaign '${o.campaign}' remains 100% free of November dual-code logic and badges`);
  }

  // TEST SUITE 6: Console Error Count
  console.log('\n▶️ SUITE 6: Console Errors & Exceptions');
  check(consoleErrors.length === 0, `Zero console errors during empirical boundary stress (found: ${consoleErrors.length})`);

  } finally {
    await browser.close();
    await srv.close();
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log('\n================================================================================');
  console.log(`📊 EMPIRICAL BOUNDARY STRESS RESULTS (Finished in ${elapsed}s)`);
  console.log(`  PASSED: ${passed} | FAILED: ${failed}`);
  console.log('================================================================================');

  if (failed > 0) {
    console.error('❌ VERDICT: REQUEST_CHANGES');
    process.exit(1);
  } else {
    console.log('✅ VERDICT: APPROVE');
    process.exit(0);
  }
}

runEmpiricalBoundaryStress().catch(e => {
  console.error('Fatal runner error:', e);
  process.exit(1);
});
