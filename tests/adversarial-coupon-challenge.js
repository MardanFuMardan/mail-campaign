// mail-campaign/tests/adversarial-coupon-challenge.js
/**
 * Empirical Adversarial Challenge Suite 2: Combinatorial Coupon Rule Validation & Output Integrity
 * 
 * Objectives:
 * 1. 100% Output Fidelity: Compare live generated outputs with baseline fixtures across 48 scenarios (336 panes).
 * 2. Combinatorial Coupon Rules: Stress-test all 6 phases of November 2026 across all 4 countries.
 * 3. Custom Influencer Codes: Validate propagation and persistence of custom codes (e.g. SUPERDEAL26).
 * 4. Automatic Default Code Transition: Verify default code switching (PROMO15 <-> 1111SALE <-> YFS2026) vs custom code retention.
 * 5. Dual-Code Alert Mandate: Validate mandatory alerts in Phase 2 (1111SALE + B1G1) and Phases 3 & 4 (PROMO15 + YFS2026 hype).
 * 6. noon Express Isolation: Validate YFS2026 strictly restricted to noon Express in Phases 5 & 6 and PROMO15 forbidden.
 * 7. Oman National Day: Validate Oman National Day messaging, celebration tags, and OMR limits in OM during Phase 4.
 * 8. Campaign Isolation: Ensure non-Nov campaigns (oct2026, sep2026, aug2026, apr2026) are not contaminated.
 * 9. Chaotic State Transition Fuzzing: Multi-hop rapid transitions without state bleed or console errors.
 */

const fs = require('fs');
const path = require('path');
const { launchBrowser } = require('./lib/chrome-launcher');
const { startTestServer, openAuthenticatedHub } = require('./lib/test-server');

const FIXTURE_PATH = path.resolve(__dirname, 'fixtures/baseline-snapshots.json');

async function runAdversarialChallenge() {
  const startTime = Date.now();
  const srv = await startTestServer();
  console.log('======================================================================');
  console.log('⚔️  EMPIRICAL ADVERSARIAL CHALLENGE — COUPON RULES & OUTPUT INTEGRITY');
  console.log('======================================================================');
  console.log(`Target: ${srv.baseUrl}`);
  console.log(`Baseline Fixture: ${FIXTURE_PATH}\n`);

  let totalAssertions = 0;
  let passedAssertions = 0;
  let failedAssertions = 0;
  const failureDetails = [];

  function assert(condition, message, details = '') {
    totalAssertions++;
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passedAssertions++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      if (details) console.error(`     Details: ${details}`);
      failedAssertions++;
      failureDetails.push({ message, details });
    }
  }

  const browser = await launchBrowser({ protocolTimeout: 60000 });
  try {
  const page = await browser.newPage();

  // Auto-dismiss any potential dialog popups
  page.on('dialog', async dialog => {
    console.warn(`[Browser Dialog] auto-dismissing: ${dialog.message()}`);
    await dialog.dismiss();
  });

  const consoleErrors = [];
  const consoleWarnings = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
    if (msg.type() === 'warning') consoleWarnings.push(msg.text());
  });
  page.on('pageerror', err => consoleErrors.push(err.message));

  await openAuthenticatedHub(page, srv.baseUrl, srv.sitePassword);

  // Reset localStorage to seed state
  await page.evaluate(() => {
    try { localStorage.clear(); } catch (e) {}
    if (typeof fillCampaignSelect === 'function') fillCampaignSelect();
    if (typeof onCampaignChange === 'function') onCampaignChange(true);
  });

  // =========================================================================
  // SECTION 1: Baseline Fixture 48-Scenario Byte-for-Byte Regression Gate
  // =========================================================================
  console.log('▶️ SECTION 1: Baseline Fixture 48-Scenario Byte-for-Byte Regression Gate');
  if (!fs.existsSync(FIXTURE_PATH)) {
    assert(false, `Baseline snapshot exists at ${FIXTURE_PATH}`, 'Fixture file not found!');
  } else {
    const fixtureData = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
    const scenarioKeys = Object.keys(fixtureData.scenarios);
    console.log(`  Checking ${scenarioKeys.length} baseline scenarios across 7 output targets (336 panes)...`);

    const baselineResult = await page.evaluate((scenarios) => {
      const mismatches = [];
      let evaluatedPanes = 0;

      const getHtml = id => {
        const el = document.getElementById(id);
        return el ? el.innerHTML : '';
      };
      const getText = id => {
        const el = document.getElementById(id);
        return el ? el.textContent : '';
      };

      for (const key of Object.keys(scenarios)) {
        const golden = scenarios[key];
        const inp = golden.inputs;

        document.getElementById('campaignId').value = inp.campaignId;
        if (typeof onCampaignChange === 'function') onCampaignChange(true);

        document.getElementById('country').value = inp.country;
        if (typeof onCountryChange === 'function') onCountryChange();

        document.getElementById('selectedPhase').value = String(inp.phaseIx);
        if (typeof onPhaseChange === 'function') onPhaseChange();

        document.getElementById('discountCode').value = inp.discountCode;
        if (inp.platform && document.getElementById('platform')) document.getElementById('platform').value = inp.platform;
        if (inp.subDay && document.getElementById('subDay')) document.getElementById('subDay').value = inp.subDay;
        if (inp.subMonth && document.getElementById('subMonth')) document.getElementById('subMonth').value = inp.subMonth;
        if (inp.liveDay && document.getElementById('liveDay')) document.getElementById('liveDay').value = inp.liveDay;
        if (inp.liveMonth && document.getElementById('liveMonth')) document.getElementById('liveMonth').value = inp.liveMonth;
        if (inp.fee && document.getElementById('fee')) document.getElementById('fee').value = inp.fee;
        if (inp.kpi && document.getElementById('kpiTarget')) document.getElementById('kpiTarget').value = inp.kpi;
        if (inp.sender && document.getElementById('senderName')) document.getElementById('senderName').value = inp.sender;

        if (typeof render === 'function') render(true);

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
        for (const t of targets) {
          evaluatedPanes++;
          if (actual[t] !== golden.outputs[t]) {
            mismatches.push({
              scenarioKey: key,
              target: t,
              expectedSnippet: golden.outputs[t] ? golden.outputs[t].substring(0, 100) : '',
              actualSnippet: actual[t] ? actual[t].substring(0, 100) : ''
            });
          }
        }
      }

      return { evaluatedPanes, mismatches };
    }, fixtureData.scenarios);

    assert(baselineResult.evaluatedPanes === 336, `Evaluated exactly 336 output targets (got: ${baselineResult.evaluatedPanes})`);
    assert(baselineResult.mismatches.length === 0,
      `All 336 output targets match baseline fixture byte-for-byte (mismatches: ${baselineResult.mismatches.length})`,
      baselineResult.mismatches.length > 0 ? JSON.stringify(baselineResult.mismatches.slice(0, 3)) : '');
  }
  console.log('');

  // =========================================================================
  // SECTION 2: Phase-by-Phase Coupon Rule Matrix Verification
  // =========================================================================
  console.log('▶️ SECTION 2: Phase-by-Phase Coupon Rule Matrix Verification');

  const phaseMatrixTest = await page.evaluate(() => {
    const results = [];
    const countries = ['QA', 'KW', 'BH', 'OM'];
    const phases = [
      { ix: 0, num: 1, name: 'Wishlist Teaser', expectedDefCode: 'PROMO15', expectedSecondary: null, isDual: false },
      { ix: 1, num: 2, name: '11.11 Single\'s Day', expectedDefCode: '1111SALE', expectedSecondary: 'B1G1', isDual: true },
      { ix: 2, num: 3, name: 'Gap Fill & Feed Sustainment', expectedDefCode: 'PROMO15', expectedSecondary: 'YFS2026', isDual: true },
      { ix: 3, num: 4, name: 'Oman National Day', expectedDefCode: 'PROMO15', expectedSecondary: 'YFS2026', isDual: true },
      { ix: 4, num: 5, name: 'Yellow Friday Mega Launch', expectedDefCode: 'YFS2026', expectedSecondary: null, isDual: false },
      { ix: 5, num: 6, name: 'YFS Climax Weekend', expectedDefCode: 'YFS2026', expectedSecondary: null, isDual: false }
    ];

    document.getElementById('campaignId').value = 'nov2026';
    if (typeof onCampaignChange === 'function') onCampaignChange(true);

    for (const ph of phases) {
      document.getElementById('selectedPhase').value = String(ph.ix);
      if (typeof onPhaseChange === 'function') onPhaseChange();

      for (const country of countries) {
        document.getElementById('country').value = country;
        if (typeof onCountryChange === 'function') onCountryChange();

        // 1. Default Code Resolution
        const actualDefCode = typeof defaultCodeFor === 'function'
          ? defaultCodeFor(country, currentCampaign(), ph.ix)
          : null;

        // 2. Render and verify DOM outputs
        if (typeof render === 'function') render(true);

        const emailEn = document.getElementById('out-email-en').innerHTML;
        const emailAr = document.getElementById('out-email-ar').innerHTML;
        const briefEn = document.getElementById('out-brief-en').innerHTML;
        const briefAr = document.getElementById('out-brief-ar').innerHTML;
        const briefTxtEn = document.getElementById('out-brief-txt-en').innerHTML;
        const briefTxtAr = document.getElementById('out-brief-txt-ar').innerHTML;

        const hasDefCodeInEmailEn = emailEn.includes(ph.expectedDefCode);
        const hasDefCodeInEmailAr = emailAr.includes(ph.expectedDefCode);
        const hasDefCodeInBriefEn = briefEn.includes(ph.expectedDefCode);
        const hasDefCodeInBriefAr = briefAr.includes(ph.expectedDefCode);
        const hasDefCodeInTxtEn = briefTxtEn.includes(ph.expectedDefCode);
        const hasDefCodeInTxtAr = briefTxtAr.includes(ph.expectedDefCode);

        // Dual code alert detection
        const hasDualAlertEn = emailEn.includes('Mandatory Campaign Codes') || emailEn.includes('Mandatory Discount Codes') || briefEn.includes('MANDATORY CAMPAIGN CODES') || briefEn.includes('DUAL PROMO CODES');
        const hasDualAlertAr = emailAr.includes('أكواد الحملة الإلزامية') || emailAr.includes('أكواد الخصم الإلزامية') || briefAr.includes('القاعدة الذهبية — التحدث عن كلا الكودين إلزامي') || briefTxtAr.includes('أكواد الحملة الإلزامية') || briefTxtAr.includes('أكواد الخصم والعروض الإلزامية');

        // Secondary code presence
        const hasSecondaryCode = ph.expectedSecondary
          ? (emailEn.includes(ph.expectedSecondary) && emailAr.includes(ph.expectedSecondary) && briefEn.includes(ph.expectedSecondary) && briefAr.includes(ph.expectedSecondary))
          : false;

        // noon Express restriction check for Phase 5 & 6
        const mentionsNoonExpress = emailEn.includes('noon Express') && emailAr.includes('نون إكسبريس');
        const promo15InPhase5or6 = (ph.ix === 4 || ph.ix === 5) && (
          // In Phase 5 & 6, PROMO15 should NOT be in active discount box
          emailEn.includes('Use code (PROMO15)') || emailAr.includes('استخدم كود (PROMO15)')
        );

        // Oman National Day check for Phase 4 in OM
        const omanNationalDayCheck = (ph.ix === 3 && country === 'OM')
          ? (emailEn.includes('Oman National Day') && emailAr.includes('العيد الوطني العماني') && emailEn.includes('OMR'))
          : true;

        results.push({
          phaseNum: ph.num,
          phaseName: ph.name,
          country,
          defCodeMatches: actualDefCode === ph.expectedDefCode,
          actualDefCode,
          expectedDefCode: ph.expectedDefCode,
          codePropagatesToAllPanes: hasDefCodeInEmailEn && hasDefCodeInEmailAr && hasDefCodeInBriefEn && hasDefCodeInBriefAr && hasDefCodeInTxtEn && hasDefCodeInTxtAr,
          isDual: ph.isDual,
          hasDualAlertEn,
          hasDualAlertAr,
          secondaryCodeMatches: ph.expectedSecondary ? hasSecondaryCode : true,
          mentionsNoonExpress: (ph.ix === 4 || ph.ix === 5) ? mentionsNoonExpress : true,
          promo15ForbiddenPassed: !promo15InPhase5or6,
          omanNationalDayCheck
        });
      }
    }
    return results;
  });

  for (const r of phaseMatrixTest) {
    const tag = `P${r.phaseNum}-${r.country}`;
    assert(r.defCodeMatches, `[${tag}] Default code matches ${r.expectedDefCode} (got: ${r.actualDefCode})`);
    assert(r.codePropagatesToAllPanes, `[${tag}] Default code propagates to all 6 email/brief output panes`);
    if (r.isDual) {
      assert(r.hasDualAlertEn && r.hasDualAlertAr, `[${tag}] Dual-code mandate alert is active in EN & AR panes`);
      assert(r.secondaryCodeMatches, `[${tag}] Secondary code is correctly present in all output panes`);
    } else {
      assert(!r.hasDualAlertEn && !r.hasDualAlertAr, `[${tag}] Dual-code alert is properly absent in single-code phase`);
    }
    if (r.phaseNum === 5 || r.phaseNum === 6) {
      assert(r.mentionsNoonExpress, `[${tag}] noon Express exclusive restriction is specified in EN & AR`);
      assert(r.promo15ForbiddenPassed, `[${tag}] PROMO15 is strictly absent from active offers`);
    }
    if (r.phaseNum === 4 && r.country === 'OM') {
      assert(r.omanNationalDayCheck, `[${tag}] Oman National Day celebration messaging and OMR limits verified`);
    }
  }
  console.log('');

  // =========================================================================
  // SECTION 3: Custom Influencer Codes & Edge Input Handling
  // =========================================================================
  console.log('▶️ SECTION 3: Custom Influencer Codes & Edge Input Handling');

  const adversarialCodes = [
    { label: 'Standard custom code', code: 'SUPERDEAL26', type: 'custom' },
    { label: 'Underscore & numbers', code: 'VIP_NOON_2026', type: 'custom' },
    { label: 'Lowercase code', code: 'superdeal26', type: 'custom' },
    { label: 'Punctuation and symbols', code: 'SAVE50NOW!', type: 'custom' },
    { label: 'Numeric only code', code: '998877', type: 'custom' },
    { label: 'Very long code (70 chars)', code: 'NOON_MEGA_DISCOUNT_SUPER_VIP_INFLUENCER_CODE_VALID_NOVEMBER_2026_GCC', type: 'custom' },
    { label: 'Empty code string', code: '', type: 'fallback' },
    { label: 'Whitespace only', code: '    ', type: 'fallback' },
    { label: 'Placeholder {CODE}', code: '{CODE}', type: 'fallback' },
    { label: 'Arabic placeholder', code: 'ضع الكود هنا', type: 'fallback' },
    { label: 'English placeholder', code: 'put the code here', type: 'fallback' }
  ];

  const customCodeResults = await page.evaluate((testCases) => {
    const res = [];
    document.getElementById('campaignId').value = 'nov2026';
    if (typeof onCampaignChange === 'function') onCampaignChange(true);

    // Test across Phase 1 (single), Phase 2 (dual 1111), Phase 3 (dual YFS), Phase 5 (Express)
    const testPhases = [0, 1, 2, 4];

    for (const pIx of testPhases) {
      document.getElementById('selectedPhase').value = String(pIx);
      if (typeof onPhaseChange === 'function') onPhaseChange();

      for (const tc of testCases) {
        document.getElementById('discountCode').value = tc.code;
        if (typeof render === 'function') render(true);

        const emailEn = document.getElementById('out-email-en').innerHTML;
        const emailAr = document.getElementById('out-email-ar').innerHTML;
        const briefEn = document.getElementById('out-brief-en').innerHTML;
        const briefAr = document.getElementById('out-brief-ar').innerHTML;
        const briefTxtEn = document.getElementById('out-brief-txt-en').innerHTML;
        const briefTxtAr = document.getElementById('out-brief-txt-ar').innerHTML;

        let passed = true;
        let note = '';

        if (tc.type === 'custom') {
          // Custom code must appear in all HTML and text panes
          const appearsInEmailEn = emailEn.includes(tc.code);
          const appearsInEmailAr = emailAr.includes(tc.code);
          const appearsInBriefEn = briefEn.includes(tc.code);
          const appearsInBriefAr = briefAr.includes(tc.code);
          const appearsInTxtEn = briefTxtEn.includes(tc.code);
          const appearsInTxtAr = briefTxtAr.includes(tc.code);

          passed = appearsInEmailEn && appearsInEmailAr && appearsInBriefEn && appearsInBriefAr && appearsInTxtEn && appearsInTxtAr;
          if (!passed) {
            note = `Failed propagation. EN:${appearsInEmailEn}, AR:${appearsInEmailAr}, B_EN:${appearsInBriefEn}, B_AR:${appearsInBriefAr}, T_EN:${appearsInTxtEn}, T_AR:${appearsInTxtAr}`;
          }
        } else if (tc.type === 'fallback') {
          // Fallback should resolve gracefully to default code or placeholder prompt
          const hasFallbackEn = emailEn.includes('PROMO15') || emailEn.includes('1111SALE') || emailEn.includes('YFS2026') || emailEn.includes('[put the code here]');
          const hasFallbackAr = emailAr.includes('PROMO15') || emailAr.includes('1111SALE') || emailAr.includes('YFS2026') || emailAr.includes('[ضع الكود هنا]');
          passed = hasFallbackEn && hasFallbackAr;
          if (!passed) note = 'Fallback handling failed for empty/placeholder code';
        }

        res.push({
          phaseIx: pIx,
          label: tc.label,
          code: tc.code,
          passed,
          note
        });
      }
    }

    return res;
  }, adversarialCodes);

  for (const cr of customCodeResults) {
    assert(cr.passed, `[P${cr.phaseIx + 1}] ${cr.label} ('${cr.code.substring(0, 25)}') handled correctly`, cr.note);
  }
  console.log('');

  // =========================================================================
  // SECTION 4: Dual-Code Alert Mandate & Stacking Deep-Dive
  // =========================================================================
  console.log('▶️ SECTION 4: Dual-Code Alert Mandate & Stacking Deep-Dive');

  const dualCodeAlertDeepDive = await page.evaluate(() => {
    const checks = {};

    document.getElementById('campaignId').value = 'nov2026';
    if (typeof onCampaignChange === 'function') onCampaignChange(true);

    // Test Phase 2: 1111SALE + B1G1 with custom code override
    document.getElementById('selectedPhase').value = '1';
    if (typeof onPhaseChange === 'function') onPhaseChange();
    document.getElementById('discountCode').value = 'CUSTOM_1111_VIP';
    if (typeof render === 'function') render(true);

    const p2EmailEn = document.getElementById('out-email-en').innerHTML;
    const p2BriefEn = document.getElementById('out-brief-en').innerHTML;
    const p2BriefAr = document.getElementById('out-brief-ar').innerHTML;
    const p2TxtAr = document.getElementById('out-brief-txt-ar').innerHTML;

    checks.p2HasCustomCode = p2EmailEn.includes('CUSTOM_1111_VIP') && p2BriefEn.includes('CUSTOM_1111_VIP');
    checks.p2HasB1G1 = p2EmailEn.includes('B1G1') && p2BriefEn.includes('B1G1') && p2BriefAr.includes('B1G1');
    checks.p2MentionsDualRuleEn = p2EmailEn.includes('Mandatory Creator Mandate (Speak About Both Codes)') && p2BriefEn.includes('THE GOLDEN RULE — SPEAKING ABOUT BOTH CODES IN VIDEO IS MANDATORY');
    checks.p2MentionsDualRuleAr = p2BriefAr.includes('القاعدة الذهبية — التحدث عن كلا الكودين إلزامي في الفيديو') && p2TxtAr.includes('🚨 تنبيه إلزامي لصانع المحتوى (التحدث عن الكودين معاً بصوتك)');

    // Test Phase 3: PROMO15 + YFS2026 Hype with custom code override
    document.getElementById('selectedPhase').value = '2';
    if (typeof onPhaseChange === 'function') onPhaseChange();
    document.getElementById('discountCode').value = 'CUSTOM_P3_VIP';
    if (typeof render === 'function') render(true);

    const p3EmailEn = document.getElementById('out-email-en').innerHTML;
    const p3BriefEn = document.getElementById('out-brief-en').innerHTML;
    const p3BriefAr = document.getElementById('out-brief-ar').innerHTML;
    const p3TxtAr = document.getElementById('out-brief-txt-ar').innerHTML;

    checks.p3HasCustomCode = p3EmailEn.includes('CUSTOM_P3_VIP');
    checks.p3HasYfsHype = p3EmailEn.includes('YFS2026') && p3BriefEn.includes('YFS2026') && p3BriefAr.includes('YFS2026');
    checks.p3MentionsHypeRuleEn = (p3EmailEn.includes('Mandatory Creator Mandate (Dual Code Callout &amp; YFS Hype)') || p3EmailEn.includes('Mandatory Creator Mandate (Dual Code Callout & YFS Hype)')) &&
                                  (p3BriefEn.includes('Dual Code Callout &amp; YFS Hype on noon Express') || p3BriefEn.includes('Dual Code Callout & YFS Hype on noon Express'));
    checks.p3MentionsHypeRuleAr = p3BriefAr.includes('التحدث عن الكودين معاً وعمل هايب لكود YFS2026 على نون إكسبريس') && p3TxtAr.includes('عمل هايب وتشويق ضخم للإعلان أنه سينطلق رسمياً يوم 19 نوفمبر');

    // Test Phase 4: PROMO15 + YFS2026 Hype in Oman (OM)
    document.getElementById('selectedPhase').value = '3';
    if (typeof onPhaseChange === 'function') onPhaseChange();
    document.getElementById('country').value = 'OM';
    if (typeof onCountryChange === 'function') onCountryChange();
    if (typeof render === 'function') render(true);

    const p4EmailEn = document.getElementById('out-email-en').innerHTML;
    const p4EmailAr = document.getElementById('out-email-ar').innerHTML;
    checks.p4HasOmanCelebrationEn = p4EmailEn.includes('Oman National Day celebration') && p4EmailEn.includes('7.5 OMR') && p4EmailEn.includes('6.25 OMR');
    checks.p4HasOmanCelebrationAr = p4EmailAr.includes('احتفالات العيد الوطني العماني') && p4EmailAr.includes('7.5 ريال') && p4EmailAr.includes('6.25 ريال');

    // Test Phase 5: YFS2026 (No Dual Code Alert, noon Express only)
    document.getElementById('selectedPhase').value = '4';
    if (typeof onPhaseChange === 'function') onPhaseChange();
    if (typeof render === 'function') render(true);

    const p5EmailEn = document.getElementById('out-email-en').innerHTML;
    const p5BriefEn = document.getElementById('out-brief-en').innerHTML;
    checks.p5NoDualAlert = !p5EmailEn.includes('Mandatory Campaign Codes') && !p5BriefEn.includes('SPEAKING ABOUT BOTH CODES');
    checks.p5MentionsNoonExpress = p5EmailEn.includes('noon Express items') && p5BriefEn.includes('noon Express');
    checks.p5ForbidsPromo15 = p5EmailEn.includes('Do NOT mention PROMO15') || p5BriefEn.includes('Do NOT mention PROMO15');

    return checks;
  });

  assert(dualCodeAlertDeepDive.p2HasCustomCode, 'Phase 2 preserves custom creator code in dual-code output');
  assert(dualCodeAlertDeepDive.p2HasB1G1, 'Phase 2 injects B1G1 secondary code into email & brief');
  assert(dualCodeAlertDeepDive.p2MentionsDualRuleEn, 'Phase 2 enforces dual-code speech requirement in English');
  assert(dualCodeAlertDeepDive.p2MentionsDualRuleAr, 'Phase 2 enforces dual-code speech requirement in Arabic');

  assert(dualCodeAlertDeepDive.p3HasCustomCode, 'Phase 3 preserves custom creator code alongside hype code');
  assert(dualCodeAlertDeepDive.p3HasYfsHype, 'Phase 3 injects YFS2026 secondary hype code into email & brief');
  assert(dualCodeAlertDeepDive.p3MentionsHypeRuleEn, 'Phase 3 enforces YFS2026 hype instructions in English');
  assert(dualCodeAlertDeepDive.p3MentionsHypeRuleAr, 'Phase 3 enforces YFS2026 hype instructions in Arabic');

  assert(dualCodeAlertDeepDive.p4HasOmanCelebrationEn, 'Phase 4 OM contains Oman National Day celebration and OMR limits in English');
  assert(dualCodeAlertDeepDive.p4HasOmanCelebrationAr, 'Phase 4 OM contains Oman National Day celebration and OMR limits in Arabic');

  assert(dualCodeAlertDeepDive.p5NoDualAlert, 'Phase 5 correctly suppresses dual-code alert (single code mode)');
  assert(dualCodeAlertDeepDive.p5MentionsNoonExpress, 'Phase 5 restricts YFS2026 exclusively to noon Express items');
  assert(dualCodeAlertDeepDive.p5ForbidsPromo15, 'Phase 5 explicitly forbids PROMO15 mention');
  console.log('');

  // =========================================================================
  // SECTION 5: Default Code Transition vs Custom Retention Verification
  // =========================================================================
  console.log('▶️ SECTION 5: Default Code Transition vs Custom Retention Verification');

  const transitionTest = await page.evaluate(() => {
    const log = [];
    document.getElementById('campaignId').value = 'nov2026';
    if (typeof onCampaignChange === 'function') onCampaignChange(true);

    // 1. Initial Phase 1 should have PROMO15
    document.getElementById('selectedPhase').value = '0';
    if (typeof onPhaseChange === 'function') onPhaseChange();
    const codeP1 = document.getElementById('discountCode').value;

    // 2. Switch to Phase 2: default code should update to 1111SALE
    document.getElementById('selectedPhase').value = '1';
    if (typeof onPhaseChange === 'function') onPhaseChange();
    const codeP2 = document.getElementById('discountCode').value;

    // 3. Switch to Phase 5: default code should update to YFS2026
    document.getElementById('selectedPhase').value = '4';
    if (typeof onPhaseChange === 'function') onPhaseChange();
    const codeP5 = document.getElementById('discountCode').value;

    // 4. Switch to Phase 6: default code should stay YFS2026
    document.getElementById('selectedPhase').value = '5';
    if (typeof onPhaseChange === 'function') onPhaseChange();
    const codeP6 = document.getElementById('discountCode').value;

    // 5. Switch back to Phase 1: default code should reset to PROMO15
    document.getElementById('selectedPhase').value = '0';
    if (typeof onPhaseChange === 'function') onPhaseChange();
    const codeP1Reset = document.getElementById('discountCode').value;

    // 6. Enter custom influencer code: SUPERDEAL26
    document.getElementById('discountCode').value = 'SUPERDEAL26';
    if (typeof render === 'function') render(true);

    // Switch across all phases: custom code SUPERDEAL26 MUST be retained!
    const customRetainedInPhases = [];
    for (let p = 0; p < 6; p++) {
      document.getElementById('selectedPhase').value = String(p);
      if (typeof onPhaseChange === 'function') onPhaseChange();
      const retainedCode = document.getElementById('discountCode').value;
      customRetainedInPhases.push({
        phaseIx: p,
        retainedCode,
        isRetained: retainedCode === 'SUPERDEAL26'
      });
    }

    return {
      codeP1,
      codeP2,
      codeP5,
      codeP6,
      codeP1Reset,
      customRetainedInPhases
    };
  });

  assert(transitionTest.codeP1 === 'PROMO15', `Initial Phase 1 default code is PROMO15 (got: ${transitionTest.codeP1})`);
  assert(transitionTest.codeP2 === '1111SALE', `Phase 2 default code automatically transitions to 1111SALE (got: ${transitionTest.codeP2})`);
  assert(transitionTest.codeP5 === 'YFS2026', `Phase 5 default code automatically transitions to YFS2026 (got: ${transitionTest.codeP5})`);
  assert(transitionTest.codeP6 === 'YFS2026', `Phase 6 default code remains YFS2026 (got: ${transitionTest.codeP6})`);
  assert(transitionTest.codeP1Reset === 'PROMO15', `Transitioning back to Phase 1 automatically restores PROMO15 (got: ${transitionTest.codeP1Reset})`);

  for (const cr of transitionTest.customRetainedInPhases) {
    assert(cr.isRetained, `Phase ${cr.phaseIx + 1}: Custom influencer code SUPERDEAL26 is preserved without being overwritten by defaults (got: ${cr.retainedCode})`);
  }
  console.log('');

  // =========================================================================
  // SECTION 6: Campaign Isolation (Non-November Campaigns)
  // =========================================================================
  console.log('▶️ SECTION 6: Campaign Isolation Verification (Non-Nov Campaigns)');

  const nonNovTest = await page.evaluate(() => {
    const results = [];
    const nonNovCampaigns = ['oct2026', 'sep2026', 'aug2026', 'apr2026'];

    for (const cId of nonNovCampaigns) {
      document.getElementById('campaignId').value = cId;
      if (typeof onCampaignChange === 'function') onCampaignChange(true);

      const emailEn = document.getElementById('out-email-en').innerHTML;
      const briefEn = document.getElementById('out-brief-en').innerHTML;

      // Ensure nov-specific dual code alerts do NOT leak into other campaigns
      const leaks1111 = emailEn.includes('1111SALE') || briefEn.includes('1111SALE');
      const leaksYfsHype = emailEn.includes('UPCOMING YFS HYPE CODE') || briefEn.includes('UPCOMING YFS HYPE CODE');
      const leaksDualMandate = emailEn.includes('Mandatory Creator Mandate (Speak About Both Codes)');

      results.push({
        cId,
        isolated: !leaks1111 && !leaksYfsHype && !leaksDualMandate,
        leaks: { leaks1111, leaksYfsHype, leaksDualMandate }
      });
    }

    return results;
  });

  for (const nnc of nonNovTest) {
    assert(nnc.isolated, `Campaign '${nnc.cId}' is completely isolated from November 2026 dual-code logic`, JSON.stringify(nnc.leaks));
  }
  console.log('');

  // =========================================================================
  // SECTION 7: Chaotic State Transition Stress Harness
  // =========================================================================
  console.log('▶️ SECTION 7: Chaotic State Transition Stress Harness');

  const chaoticTransitions = [
    { camp: 'nov2026', phase: 5, country: 'OM', code: 'CHAOS_OM_P6' },
    { camp: 'nov2026', phase: 0, country: 'QA', code: 'CHAOS_QA_P1' },
    { camp: 'nov2026', phase: 3, country: 'KW', code: 'CHAOS_KW_P4' },
    { camp: 'nov2026', phase: 1, country: 'BH', code: 'CHAOS_BH_P2' },
    { camp: 'nov2026', phase: 4, country: 'QA', code: 'CHAOS_QA_P5' },
    { camp: 'nov2026', phase: 2, country: 'OM', code: 'CHAOS_OM_P3' },
    { camp: 'oct2026', phase: 0, country: 'KW', code: 'OCT_RESET' },
    { camp: 'nov2026', phase: 1, country: 'QA', code: 'FINAL_NOV_P2' }
  ];

  const chaoticResults = await page.evaluate((transitions) => {
    const log = [];
    for (let i = 0; i < transitions.length; i++) {
      const step = transitions[i];
      document.getElementById('campaignId').value = step.camp;
      if (typeof onCampaignChange === 'function') onCampaignChange(true);

      document.getElementById('selectedPhase').value = String(step.phase);
      if (typeof onPhaseChange === 'function') onPhaseChange();

      document.getElementById('country').value = step.country;
      if (typeof onCountryChange === 'function') onCountryChange();

      document.getElementById('discountCode').value = step.code;
      if (typeof render === 'function') render(true);

      const emailEn = document.getElementById('out-email-en').innerHTML;
      const briefAr = document.getElementById('out-brief-ar').innerHTML;

      const codeReflected = emailEn.includes(step.code) && briefAr.includes(step.code);
      log.push({
        step: i + 1,
        transition: `${step.camp} -> P${step.phase + 1} -> ${step.country}`,
        codeReflected,
        emailLen: emailEn.length,
        briefLen: briefAr.length
      });
    }
    return log;
  }, chaoticTransitions);

  for (const cr of chaoticResults) {
    assert(cr.codeReflected, `[Step ${cr.step}] Transition (${cr.transition}) correctly rendered outputs (email: ${cr.emailLen} chars, brief: ${cr.briefLen} chars)`);
  }
  console.log('');

  // =========================================================================
  // Final Console Integrity Check
  // =========================================================================
  assert(consoleErrors.length === 0, `Browser console has zero errors during adversarial challenge (count: ${consoleErrors.length})`, consoleErrors.join('; '));

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log('======================================================================');
  console.log(`📊 ADVERSARIAL CHALLENGE SUMMARY (Completed in ${durationSec}s)`);
  console.log('======================================================================');
  console.log(`  TOTAL ASSERTIONS: ${totalAssertions}`);
  console.log(`  PASSED:           ${passedAssertions}`);
  console.log(`  FAILED:           ${failedAssertions}`);
  console.log('======================================================================');

  } finally {
    await browser.close();
    await srv.close();
  }

  return {
    totalAssertions,
    passedAssertions,
    failedAssertions,
    failureDetails
  };
}

if (require.main === module) {
  runAdversarialChallenge()
    .then(res => {
      process.exit(res.failedAssertions === 0 ? 0 : 1);
    })
    .catch(err => {
      console.error('Fatal Adversarial Runner Error:', err);
      process.exit(1);
    });
}

module.exports = { runAdversarialChallenge };
