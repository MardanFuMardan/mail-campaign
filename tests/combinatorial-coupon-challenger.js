// mail-campaign/tests/combinatorial-coupon-challenger.js
/**
 * Combinatorial Coupon Rules & Boundary Challenger Test Suite
 * Designed by challenger_gen2_2 for Milestone 1 Verification.
 * 
 * Tests strictly:
 * 1. 48 Combinatorial Golden Baseline Invariance Gate (336 output panes byte-for-byte).
 * 2. Phase 1: Promo code PROMO15, 0 secondary codes, no dual-code badges or alerts.
 * 3. Phase 2 (11.11 Single's Day): Promo code 1111SALE + B1G1 secondary alert badge & dual-code mandate.
 * 4. Phase 3 & 4 (Feed Sustainment & Oman National Day): PROMO15 + YFS2026 hype alert.
 * 5. Phase 5 & 6 (Yellow Friday Sale): Promo code YFS2026 strictly restricted to noon Express items. PROMO15 strictly absent.
 * 6. Country variations: QA, KW, BH, OM discount caps and bilingual currencies across all 6 phases.
 * 7. Custom discount code overrides across all 6 phases without corrupting currency or formatting.
 * 8. Fallback boundary safety: empty, whitespace, {CODE}, Arabic/English placeholders.
 * 9. Custom code persistence across phase transitions vs default code auto-transition.
 * 10. Console cleanliness & zero runtime exceptions.
 */

const fs = require('fs');
const path = require('path');
const { launchBrowser } = require('./lib/chrome-launcher');
const { startTestServer, openAuthenticatedHub } = require('./lib/test-server');

const FIXTURE_PATH = path.resolve(__dirname, 'fixtures/baseline-snapshots.json');

async function runCombinatorialCouponChallenger() {
  const startTime = Date.now();
  const srv = await startTestServer();
  console.log('================================================================================');
  console.log('🎯 COMBINATORIAL COUPON RULES & BOUNDARY CHALLENGER (challenger_gen2_2)');
  console.log('================================================================================');
  console.log(`Target Application: ${srv.baseUrl}`);
  console.log(`Baseline Fixture:   ${FIXTURE_PATH}\n`);

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

  const browser = await launchBrowser({ protocolTimeout: 60000 });
  const page = await browser.newPage();

  page.on('dialog', async dialog => {
    console.warn(`[Browser Dialog Dismissed]: ${dialog.message()}`);
    await dialog.dismiss();
  });

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => consoleErrors.push(err.message || String(err)));

  try {
  await openAuthenticatedHub(page, srv.baseUrl, srv.sitePassword);

  // ===========================================================================
  // GATE 1: 48 Combinatorial Golden Baseline Invariance Gate (336 Targets)
  // ===========================================================================
  console.log('▶️ GATE 1: 48-Scenario Golden Baseline Invariance Check');
  if (!fs.existsSync(FIXTURE_PATH)) {
    assert('GATE1_BASELINE', false, 'Golden baseline fixture exists', `Missing file: ${FIXTURE_PATH}`);
  } else {
    const fixtureData = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
    const scenarioKeys = Object.keys(fixtureData.scenarios);

    const baselineResult = await page.evaluate((scenarios) => {
      const mismatches = [];
      let evaluatedCount = 0;

      const getHtml = id => {
        const el = document.getElementById(id);
        return el ? el.innerHTML : '';
      };
      const getText = id => {
        const el = document.getElementById(id);
        return el ? el.textContent : '';
      };

      for (const key of Object.keys(scenarios)) {
        const sc = scenarios[key];
        document.getElementById('campaignId').value = sc.inputs.campaignId;
        if (typeof onCampaignChange === 'function') onCampaignChange(true);

        document.getElementById('country').value = sc.inputs.country;
        if (typeof onCountryChange === 'function') onCountryChange();

        document.getElementById('selectedPhase').value = String(sc.inputs.phaseIx);
        if (typeof onPhaseChange === 'function') onPhaseChange();

        document.getElementById('discountCode').value = sc.inputs.discountCode || sc.inputs.code || '';
        document.getElementById('infName').value = sc.inputs.infName || sc.inputs.name || '';
        document.getElementById('platform').value = sc.inputs.platform || '';
        document.getElementById('subDay').value = sc.inputs.subDay || '';
        document.getElementById('subMonth').value = sc.inputs.subMonth || '';
        document.getElementById('liveDay').value = sc.inputs.liveDay || '';
        document.getElementById('liveMonth').value = sc.inputs.liveMonth || '';
        document.getElementById('fee').value = sc.inputs.fee || '';
        document.getElementById('kpiTarget').value = sc.inputs.kpi || '';
        document.getElementById('senderName').value = sc.inputs.sender || '';

        if (typeof render === 'function') render(true);

        const currentOutputs = {
          subjectText: getText('subjectText'),
          outEmailEn: getHtml('out-email-en'),
          outEmailAr: getHtml('out-email-ar'),
          outBriefEn: getHtml('out-brief-en'),
          outBriefAr: getHtml('out-brief-ar'),
          outBriefTxtEn: getHtml('out-brief-txt-en'),
          outBriefTxtAr: getHtml('out-brief-txt-ar')
        };

        for (const targetKey of Object.keys(sc.outputs)) {
          evaluatedCount++;
          const expected = sc.outputs[targetKey];
          const actual = currentOutputs[targetKey];
          if (expected !== actual) {
            mismatches.push({
              scenario: key,
              target: targetKey,
              expectedLen: expected ? expected.length : 0,
              actualLen: actual ? actual.length : 0
            });
          }
        }
      }

      return { evaluatedCount, mismatches };
    }, fixtureData.scenarios);

    assert('GATE1_BASELINE', baselineResult.evaluatedCount === 336,
      `Evaluated exactly 336 baseline targets across 48 scenarios (got: ${baselineResult.evaluatedCount})`);
    assert('GATE1_BASELINE', baselineResult.mismatches.length === 0,
      `All 336 targets match golden baseline byte-for-byte without regression (mismatches: ${baselineResult.mismatches.length})`,
      JSON.stringify(baselineResult.mismatches.slice(0, 3)));
  }

  // ===========================================================================
  // GATE 2: Strictest Business Logic & Coupon Rules across all 6 Phases
  // ===========================================================================
  console.log('\n▶️ GATE 2: Strict Business Logic & Coupon Rules across Phases 1 through 6');

  const phaseResults = await page.evaluate(() => {
    const results = [];
    document.getElementById('campaignId').value = 'nov2026';
    if (typeof onCampaignChange === 'function') onCampaignChange(true);

    const getText = id => {
      const el = document.getElementById(id);
      return el ? el.textContent : '';
    };
    const getHtml = id => {
      const el = document.getElementById(id);
      return el ? el.innerHTML : '';
    };

    for (let phaseIx = 0; phaseIx < 6; phaseIx++) {
      document.getElementById('selectedPhase').value = String(phaseIx);
      if (typeof onPhaseChange === 'function') onPhaseChange();

      // Ensure default code is active
      const defCode = defaultCodeFor(document.getElementById('country').value, currentCampaign(), phaseIx);
      document.getElementById('discountCode').value = defCode;
      if (typeof render === 'function') render(true);

      const emailEn = getHtml('out-email-en');
      const emailAr = getHtml('out-email-ar');
      const briefEn = getHtml('out-brief-en');
      const briefAr = getHtml('out-brief-ar');
      const briefTxtEn = getHtml('out-brief-txt-en');
      const briefTxtAr = getHtml('out-brief-txt-ar');

      const emailEnText = getText('out-email-en');
      const emailArText = getText('out-email-ar');
      const briefEnText = getText('out-brief-en');
      const briefArText = getText('out-brief-ar');
      const briefTxtEnText = getText('out-brief-txt-en');
      const briefTxtArText = getText('out-brief-txt-ar');

      results.push({
        phaseIx: phaseIx,
        promoCode: currentCampaign().phases[phaseIx].promoCode,
        secondaryCode: currentCampaign().phases[phaseIx].secondaryCode,
        inputVal: document.getElementById('discountCode').value,
        emailEnHasPromo: emailEn.includes(currentCampaign().phases[phaseIx].promoCode),
        briefEnHasPromo: briefEn.includes(currentCampaign().phases[phaseIx].promoCode),
        // Secondary badge checks
        hasB1G1Badge: briefEn.includes('B1G1') || briefAr.includes('B1G1'),
        hasYfsHypeBadge: briefEn.includes('YFS2026') && (phaseIx === 2 || phaseIx === 3),
        // Alert checks
        has1111MandateEn: briefEnText.includes('Mandatory Approval Requirement for 11.11 Phase (Both Codes Spoken in Video)') ||
                          emailEnText.includes('Mandatory Creator Mandate (Speak About Both Codes)'),
        has1111MandateAr: briefArText.includes('شرط إلزامي لقبول الفيديو في مرحلة 11.11 (التحدث عن الكودين معاً)') ||
                          emailArText.includes('شرط إلزامي لصانع المحتوى (التحدث عن الكودين معاً بصوتك)'),
        hasYfsHypeMandateEn: briefEnText.includes('Dual Code Callout & YFS Hype on noon Express') ||
                             emailEnText.includes('Mandatory Creator Mandate (Dual Code Callout & YFS Hype)'),
        hasYfsHypeMandateAr: briefArText.includes('التحدث عن الكودين معاً وعمل هايب لكود YFS2026 على نون إكسبريس') ||
                             emailArText.includes('التحدث عن الكودين معاً وعمل هايب لكود YFS2026'),
        // Isolation of PROMO15 from discount codes in phases 5 & 6
        hasPromo15InDiscountBox: (briefEn.includes('Discount Code') && briefEn.slice(briefEn.indexOf('Discount Code'), briefEn.indexOf('Discount Code') + 400).includes('PROMO15')) ||
                                 (emailEn.includes('Mandatory Discount Code') && emailEn.slice(emailEn.indexOf('Mandatory Discount Code'), emailEn.indexOf('Mandatory Discount Code') + 400).includes('PROMO15')),
        hasPromo15InPhase6: (phaseIx === 5) && (emailEn.includes('PROMO15') || briefEn.includes('PROMO15') || emailAr.includes('PROMO15') || briefAr.includes('PROMO15')),
        mentionsNoonExpressEn: emailEnText.includes('noon Express') && briefEnText.includes('noon Express'),
        mentionsNoonExpressAr: emailArText.includes('نون إكسبريس') && briefArText.includes('نون إكسبريس'),
        explicitlyForbidsPromo15En: emailEnText.includes('Do NOT mention PROMO15') || briefEnText.includes('Do NOT mention PROMO15'),
        explicitlyForbidsPromo15Ar: emailArText.includes('يُمنع ذكر كود PROMO15 نهائياً') || briefArText.includes('يُمنع ذكر كود PROMO15 نهائياً')
      });
    }

    return results;
  });

  // Verify Phase 1
  const p1 = phaseResults[0];
  assert('PHASE1_RULES', p1.promoCode === 'PROMO15' && p1.inputVal === 'PROMO15',
    'Phase 1: Default promo code is PROMO15');
  assert('PHASE1_RULES', p1.secondaryCode === null || p1.secondaryCode === undefined,
    'Phase 1: secondaryCode is strictly null/empty (no secondary codes)');
  assert('PHASE1_RULES', !p1.hasB1G1Badge && !p1.hasYfsHypeBadge && !p1.has1111MandateEn && !p1.hasYfsHypeMandateEn,
    'Phase 1: Dual-code badges and alerts are strictly absent');

  // Verify Phase 2 (11.11 Single's Day)
  const p2 = phaseResults[1];
  assert('PHASE2_RULES', p2.promoCode === '1111SALE' && p2.inputVal === '1111SALE',
    'Phase 2 (11.11): Default promo code is 1111SALE');
  assert('PHASE2_RULES', p2.secondaryCode === 'B1G1',
    'Phase 2 (11.11): secondaryCode is strictly B1G1');
  assert('PHASE2_RULES', p2.hasB1G1Badge,
    'Phase 2 (11.11): B1G1 secondary alert badge is present in brief & email');
  assert('PHASE2_RULES', p2.has1111MandateEn && p2.has1111MandateAr,
    'Phase 2 (11.11): Spoken dual-code mandate enforced in both English and Arabic');

  // Verify Phase 3 (Feed Sustainment)
  const p3 = phaseResults[2];
  assert('PHASE3_RULES', p3.promoCode === 'PROMO15' && p3.inputVal === 'PROMO15',
    'Phase 3: Promo code is PROMO15');
  assert('PHASE3_RULES', p3.secondaryCode === 'YFS2026',
    'Phase 3: secondaryCode is YFS2026 (upcoming hype)');
  assert('PHASE3_RULES', p3.hasYfsHypeBadge,
    'Phase 3: YFS2026 hype badge present');
  assert('PHASE3_RULES', p3.hasYfsHypeMandateEn && p3.hasYfsHypeMandateAr,
    'Phase 3: YFS2026 hype alert mandate enforced in both English and Arabic');

  // Verify Phase 4 (Oman National Day Celebration)
  const p4 = phaseResults[3];
  assert('PHASE4_RULES', p4.promoCode === 'PROMO15' && p4.inputVal === 'PROMO15',
    'Phase 4: Promo code is PROMO15');
  assert('PHASE4_RULES', p4.secondaryCode === 'YFS2026',
    'Phase 4: secondaryCode is YFS2026 (upcoming hype)');
  assert('PHASE4_RULES', p4.hasYfsHypeBadge,
    'Phase 4: YFS2026 hype badge present');
  assert('PHASE4_RULES', p4.hasYfsHypeMandateEn && p4.hasYfsHypeMandateAr,
    'Phase 4: YFS2026 hype alert mandate enforced in both English and Arabic');

  // Verify Phase 5 (Yellow Friday Sale Mega Launch)
  const p5 = phaseResults[4];
  assert('PHASE5_RULES', p5.promoCode === 'YFS2026' && p5.inputVal === 'YFS2026',
    'Phase 5: Promo code is YFS2026');
  assert('PHASE5_RULES', p5.secondaryCode === null || p5.secondaryCode === undefined,
    'Phase 5: secondaryCode is strictly null');
  assert('PHASE5_RULES', !p5.hasPromo15InDiscountBox,
    'Phase 5: PROMO15 is strictly absent from discount boxes and promo badges');
  assert('PHASE5_RULES', p5.mentionsNoonExpressEn && p5.mentionsNoonExpressAr,
    'Phase 5: Promo code YFS2026 strictly restricted to noon Express items');
  assert('PHASE5_RULES', p5.explicitlyForbidsPromo15En && p5.explicitlyForbidsPromo15Ar,
    'Phase 5: Explicitly forbids mentioning PROMO15 ("Do NOT mention PROMO15")');

  // Verify Phase 6 (YFS Climax Weekend)
  const p6 = phaseResults[5];
  assert('PHASE6_RULES', p6.promoCode === 'YFS2026' && p6.inputVal === 'YFS2026',
    'Phase 6: Promo code is YFS2026');
  assert('PHASE6_RULES', p6.secondaryCode === null || p6.secondaryCode === undefined,
    'Phase 6: secondaryCode is strictly null');
  assert('PHASE6_RULES', !p6.hasPromo15InPhase6 && !p6.hasPromo15InDiscountBox,
    'Phase 6: PROMO15 is strictly absent from all output panes and badges');
  assert('PHASE6_RULES', p6.mentionsNoonExpressEn && p6.mentionsNoonExpressAr,
    'Phase 6: Promo code YFS2026 strictly restricted to noon Express items in final 48h countdown');

  // ===========================================================================
  // GATE 3: Country Variations, Discount Caps, and Currencies (QA, KW, BH, OM)
  // ===========================================================================
  console.log('\n▶️ GATE 3: GCC Country Variations, Discount Caps, and Bilingual Currencies');

  const countryMatrix = await page.evaluate(() => {
    const countries = ['QA', 'KW', 'BH', 'OM'];
    const results = {};

    for (const c of countries) {
      results[c] = {};
      document.getElementById('country').value = c;
      if (typeof onCountryChange === 'function') onCountryChange();

      for (let p = 0; p < 6; p++) {
        document.getElementById('selectedPhase').value = String(p);
        if (typeof onPhaseChange === 'function') onPhaseChange();
        if (typeof render === 'function') render(true);

        const emailEn = document.getElementById('out-email-en').innerHTML;
        const emailAr = document.getElementById('out-email-ar').innerHTML;
        const briefEn = document.getElementById('out-brief-en').innerHTML;
        const briefAr = document.getElementById('out-brief-ar').innerHTML;

        results[c]['P' + (p + 1)] = {
          emailEn,
          emailAr,
          briefEn,
          briefAr
        };
      }
    }
    return results;
  });

  // Qatar (QA): QAR / ريال قطري
  assert('COUNTRY_QA',
    countryMatrix.QA.P1.emailEn.includes('75 QAR') && countryMatrix.QA.P1.emailAr.includes('75 ريال قطري'),
    'Qatar (QA) Phase 1: 15% discount capped at 75 QAR / 75 ريال قطري');
  assert('COUNTRY_QA',
    countryMatrix.QA.P2.emailEn.includes('62.5 QAR') && countryMatrix.QA.P2.emailEn.includes('250 QAR') && countryMatrix.QA.P2.emailEn.includes('111 QAR'),
    'Qatar (QA) Phase 2: 25% capped at 62.5 QAR (min 250 QAR) + B1G1 over 111 QAR');
  assert('COUNTRY_QA',
    countryMatrix.QA.P5.emailEn.includes('62.5 QAR') && countryMatrix.QA.P5.emailAr.includes('62.5 ريال قطري'),
    'Qatar (QA) Phase 5: YFS 25% capped at 62.5 QAR (min 250 QAR)');
  assert('COUNTRY_QA',
    countryMatrix.QA.P1.emailEn.includes('@noon_qar'),
    'Qatar (QA): Mandatory Collab tag @noon_qar present');

  // Kuwait (KW): KWD / دينار كويتي
  assert('COUNTRY_KW',
    countryMatrix.KW.P1.emailEn.includes('6 KWD') && countryMatrix.KW.P1.emailAr.includes('6 دينار كويتي'),
    'Kuwait (KW) Phase 1: 15% discount capped at 6 KWD / 6 دينار كويتي');
  assert('COUNTRY_KW',
    countryMatrix.KW.P2.emailEn.includes('5 KWD') && countryMatrix.KW.P2.emailEn.includes('20 KWD') && countryMatrix.KW.P2.emailEn.includes('9 KWD'),
    'Kuwait (KW) Phase 2: 25% capped at 5 KWD (min 20 KWD) + B1G1 over 9 KWD');
  assert('COUNTRY_KW',
    countryMatrix.KW.P5.emailEn.includes('5 KWD') && countryMatrix.KW.P5.emailAr.includes('5 دينار كويتي'),
    'Kuwait (KW) Phase 5: YFS 25% capped at 5 KWD (min 20 KWD)');
  assert('COUNTRY_KW',
    countryMatrix.KW.P1.emailEn.includes('@noon_kuwt'),
    'Kuwait (KW): Mandatory Collab tag @noon_kuwt present');

  // Bahrain (BH): BHD / دينار بحريني
  assert('COUNTRY_BH',
    countryMatrix.BH.P1.emailEn.includes('7.5 BHD') && countryMatrix.BH.P1.emailAr.includes('7.5 دينار بحريني'),
    'Bahrain (BH) Phase 1: 15% discount capped at 7.5 BHD / 7.5 دينار بحريني');
  assert('COUNTRY_BH',
    countryMatrix.BH.P2.emailEn.includes('6.25 BHD') && countryMatrix.BH.P2.emailEn.includes('25 BHD') && countryMatrix.BH.P2.emailEn.includes('11.1 BHD'),
    'Bahrain (BH) Phase 2: 25% capped at 6.25 BHD (min 25 BHD) + B1G1 over 11.1 BHD');
  assert('COUNTRY_BH',
    countryMatrix.BH.P5.emailEn.includes('6.25 BHD') && countryMatrix.BH.P5.emailAr.includes('6.25 دينار بحريني'),
    'Bahrain (BH) Phase 5: YFS 25% capped at 6.25 BHD (min 25 BHD)');
  assert('COUNTRY_BH',
    countryMatrix.BH.P1.emailEn.includes('@noon.bahr'),
    'Bahrain (BH): Mandatory Collab tag @noon.bahr present');

  // Oman (OM): OMR / ريال عماني + National Day
  assert('COUNTRY_OM',
    countryMatrix.OM.P1.emailEn.includes('7.5 OMR') && countryMatrix.OM.P1.emailAr.includes('7.5 ريال عماني'),
    'Oman (OM) Phase 1: 15% discount capped at 7.5 OMR / 7.5 ريال عماني');
  assert('COUNTRY_OM',
    countryMatrix.OM.P2.emailEn.includes('6.25 OMR') && countryMatrix.OM.P2.emailEn.includes('25 OMR') && countryMatrix.OM.P2.emailEn.includes('11.1 OMR'),
    'Oman (OM) Phase 2: 25% capped at 6.25 OMR (min 25 OMR) + B1G1 over 11.1 OMR');
  assert('COUNTRY_OM',
    countryMatrix.OM.P4.emailEn.includes('Oman National Day celebration') && countryMatrix.OM.P4.emailAr.includes('احتفالات العيد الوطني العماني'),
    'Oman (OM) Phase 4: Dedicated 56th Oman National Day celebration messaging');
  assert('COUNTRY_OM',
    countryMatrix.OM.P5.emailEn.includes('6.25 OMR') && countryMatrix.OM.P5.emailAr.includes('6.25 ريال عماني'),
    'Oman (OM) Phase 5: YFS 25% capped at 6.25 OMR (min 25 OMR)');
  assert('COUNTRY_OM',
    countryMatrix.OM.P1.emailEn.includes('@noon_omn'),
    'Oman (OM): Mandatory Collab tag @noon_omn present');

  // ===========================================================================
  // GATE 4: Custom Discount Code Overrides Across All Panes & Boundary Safety
  // ===========================================================================
  console.log('\n▶️ GATE 4: Custom Discount Code Overrides & Boundary Safety');

  const customOverrideResults = await page.evaluate(() => {
    const customCodes = [
      'CHALLENGE2026',
      'VIP_NOON_SUPER',
      'deals99',
      'OFFER-50-SPECIAL'
    ];

    const results = [];

    for (let phaseIx = 0; phaseIx < 6; phaseIx++) {
      document.getElementById('selectedPhase').value = String(phaseIx);
      if (typeof onPhaseChange === 'function') onPhaseChange();

      for (const custom of customCodes) {
        document.getElementById('discountCode').value = custom;
        if (typeof render === 'function') render(true);

        const emailEn = document.getElementById('out-email-en').innerHTML;
        const emailAr = document.getElementById('out-email-ar').innerHTML;
        const briefEn = document.getElementById('out-brief-en').innerHTML;
        const briefAr = document.getElementById('out-brief-ar').innerHTML;
        const briefTxtEn = (document.getElementById('out-brief-txt-en') || {}).innerHTML || '';
        const briefTxtAr = (document.getElementById('out-brief-txt-ar') || {}).innerHTML || '';

        const phase = currentCampaign().phases[phaseIx];
        const secondary = phase.secondaryCode;

        results.push({
          phaseIx,
          custom,
          emailEnHasCustom: emailEn.includes(custom),
          emailArHasCustom: emailAr.includes(custom),
          briefEnHasCustom: briefEn.includes(custom),
          briefArHasCustom: briefAr.includes(custom),
          briefTxtEnHasCustom: briefTxtEn.includes(custom),
          briefTxtArHasCustom: briefTxtAr.includes(custom),
          // Check that secondary code was not destroyed
          secondaryPreserved: secondary ? (briefEn.includes(secondary) && emailEn.includes(secondary)) : true
        });
      }
    }

    return results;
  });

  const allCustomPropagated = customOverrideResults.every(r =>
    r.emailEnHasCustom && r.emailArHasCustom &&
    r.briefEnHasCustom && r.briefArHasCustom &&
    r.briefTxtEnHasCustom && r.briefTxtArHasCustom &&
    r.secondaryPreserved
  );

  assert('CUSTOM_OVERRIDE', allCustomPropagated,
    `Custom codes propagate across all 6 output panes without corrupting structure (24 permutations evaluated)`);

  // Boundary fallbacks: Empty, Whitespace, {CODE}, Placeholders
  const fallbackResults = await page.evaluate(() => {
    const boundaryInputs = ['', '   ', '{CODE}', 'ضع الكود هنا', 'put the code here'];
    const outcomes = [];

    for (let phaseIx = 0; phaseIx < 6; phaseIx++) {
      document.getElementById('selectedPhase').value = String(phaseIx);
      if (typeof onPhaseChange === 'function') onPhaseChange();

      const defCode = defaultCodeFor(document.getElementById('country').value, currentCampaign(), phaseIx);

      for (const bInput of boundaryInputs) {
        document.getElementById('discountCode').value = bInput;
        if (typeof render === 'function') render(true);

        const emailEn = document.getElementById('out-email-en').innerHTML;
        const briefEn = document.getElementById('out-brief-en').innerHTML;

        // getInputs() should resolve to defCode when empty/placeholder
        const inputs = getInputs();
        outcomes.push({
          phaseIx,
          bInput,
          resolvedCode: inputs.code,
          matchesDef: inputs.code === defCode,
          emailHasDef: emailEn.includes(defCode),
          briefHasDef: briefEn.includes(defCode)
        });
      }
    }

    return outcomes;
  });

  const allFallbacksSafe = fallbackResults.every(r => r.matchesDef && r.emailHasDef && r.briefHasDef);
  assert('BOUNDARY_SAFETY', allFallbacksSafe,
    `Empty string, whitespace, {CODE}, and Arabic/English placeholders gracefully fall back to default code (30 tests)`);

  // ===========================================================================
  // GATE 5: Custom Code Retention vs Default Code Transition
  // ===========================================================================
  console.log('\n▶️ GATE 5: Custom Code Retention vs Default Auto-Transition');

  const transitionResult = await page.evaluate(() => {
    // 1. Start with default code at Phase 0
    document.getElementById('selectedPhase').value = '0';
    if (typeof onPhaseChange === 'function') onPhaseChange();
    const p1Code = document.getElementById('discountCode').value;

    // 2. Switch to Phase 1 -> should become 1111SALE
    document.getElementById('selectedPhase').value = '1';
    if (typeof onPhaseChange === 'function') onPhaseChange();
    const p2Code = document.getElementById('discountCode').value;

    // 3. Switch to Phase 4 -> should become YFS2026
    document.getElementById('selectedPhase').value = '4';
    if (typeof onPhaseChange === 'function') onPhaseChange();
    const p5Code = document.getElementById('discountCode').value;

    // 4. Enter custom code 'PERSIST_VIP'
    document.getElementById('discountCode').value = 'PERSIST_VIP';
    if (typeof render === 'function') render(true);

    // 5. Switch to Phase 0, 1, 2, 3, 4, 5 -> custom code MUST be retained!
    const customRetained = [];
    for (let i = 0; i < 6; i++) {
      document.getElementById('selectedPhase').value = String(i);
      if (typeof onPhaseChange === 'function') onPhaseChange();
      customRetained.push(document.getElementById('discountCode').value === 'PERSIST_VIP');
    }

    return {
      p1Code,
      p2Code,
      p5Code,
      allRetained: customRetained.every(v => v === true)
    };
  });

  assert('STATE_TRANSITION', transitionResult.p1Code === 'PROMO15' && transitionResult.p2Code === '1111SALE' && transitionResult.p5Code === 'YFS2026',
    'Default codes automatically transition across phases (PROMO15 -> 1111SALE -> YFS2026)');
  assert('STATE_TRANSITION', transitionResult.allRetained,
    'Custom influencer codes (e.g. PERSIST_VIP) are strictly preserved across all phase changes without being overwritten');

  // ===========================================================================
  // GATE 6: Console Integrity
  // ===========================================================================
  console.log('\n▶️ GATE 6: Console Integrity & Exception Trap');
  assert('CONSOLE_INTEGRITY', consoleErrors.length === 0,
    `Browser console remained completely free of unhandled errors (found: ${consoleErrors.length})`,
    consoleErrors.join('\n'));

  } finally {
    await browser.close();
    await srv.close();
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log('\n================================================================================');
  console.log(`📊 COMBINATORIAL CHALLENGER SUMMARY (Completed in ${duration}s)`);
  console.log('================================================================================');
  console.log(`  TOTAL ASSERTIONS: ${totalTests}`);
  console.log(`  PASSED:           ${passedTests}`);
  console.log(`  FAILED:           ${failedTests}`);
  console.log('================================================================================');

  if (failedTests > 0) {
    console.error('\n❌ VERDICT: REQUEST_CHANGES');
    process.exit(1);
  } else {
    console.log('\n✅ VERDICT: APPROVE');
    process.exit(0);
  }
}

runCombinatorialCouponChallenger().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
