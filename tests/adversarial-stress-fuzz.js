// mail-campaign/tests/adversarial-stress-fuzz.js
/**
 * Empirical Adversarial Stress-Test & Fuzzing Harness for Noon Campaign Hub
 * Milestone 1 Stress Verification
 */
const fs = require('fs');
const path = require('path');
const { launchBrowser } = require('./lib/chrome-launcher');
const { startTestServer, openAuthenticatedHub } = require('./lib/test-server');

async function runAdversarialSuite() {
  const srv = await startTestServer();
  console.log('======================================================================');
  console.log('🔥 NOON CAMPAIGN HUB — ADVERSARIAL STRESS & FUZZING HARNESS');
  console.log('======================================================================');
  console.log(`Target: ${srv.baseUrl}\n`);

  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;
  const findings = [];

  function recordResult(name, pass, details = '') {
    totalTests++;
    if (pass) {
      passedTests++;
      console.log(`  ✅ PASS: ${name}`);
    } else {
      failedTests++;
      console.error(`  ❌ FAIL: ${name}`);
      if (details) console.error(`     Details: ${details}`);
      findings.push({ name, details });
    }
  }

  const browser = await launchBrowser();
  try {
  const context = browser.defaultBrowserContext();
  try {
    await context.overridePermissions(srv.baseUrl, ['clipboard-read', 'clipboard-write']);
  } catch (e) {}

  const page = await browser.newPage();
  const consoleErrors = [];
  const consoleWarnings = [];

  page.on('console', msg => {
    // Filter out expected missing image resource errors triggered during XSS testing
    const text = msg.text();
    if (msg.type() === 'error') {
      consoleErrors.push(text);
    }
    if (msg.type() === 'warning') consoleWarnings.push(text);
  });
  page.on('pageerror', err => consoleErrors.push(err.message));

  await openAuthenticatedHub(page, srv.baseUrl, srv.sitePassword);

  // Reset localStorage to clean seed
  await page.evaluate(() => {
    try { localStorage.clear(); } catch (e) {}
    if (typeof fillCampaignSelect === 'function') fillCampaignSelect();
    if (typeof onCampaignChange === 'function') onCampaignChange(true);
  });

  // =========================================================================
  // 1. RAPID CAMPAIGN & PHASE SWITCHING IN NON-STANDARD SEQUENCES
  // =========================================================================
  console.log('▶️ [CATEGORY 1] Rapid Campaign & Phase Switching in Non-Standard Sequences');

  const campaignSeqTest = await page.evaluate(async () => {
    const campSelect = document.getElementById('campaignId');
    const phaseSelect = document.getElementById('selectedPhase');
    const bannerCampName = document.getElementById('activeCampName');
    const bannerPhaseName = document.getElementById('activePhaseName');

    const availableCamps = Array.from(campSelect.options).map(o => o.value);

    // Non-standard campaign switching sequence: Nov -> Oct -> Nov
    const sequences = ['nov2026', 'oct2026', 'nov2026'];
    for (const cid of sequences) {
      if (!availableCamps.includes(cid)) continue;
      campSelect.value = cid;
      campSelect.dispatchEvent(new Event('change', { bubbles: true }));

      // Phase switching in non-standard order: Phase 6 (5), Phase 1 (0), Phase 4 (3), Phase 2 (1)
      const phaseOptions = Array.from(phaseSelect.options).map(o => o.value);
      for (const pVal of ['5', '0', '3', '1', '4', '2']) {
        if (phaseOptions.includes(pVal)) {
          phaseSelect.value = pVal;
          phaseSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    }

    return {
      campValue: campSelect.value,
      phaseValue: phaseSelect.value,
      bannerCampText: bannerCampName ? bannerCampName.textContent.trim() : '',
      bannerPhaseText: bannerPhaseName ? bannerPhaseName.textContent.trim() : ''
    };
  });

  recordResult(
    'Rapid campaign & phase switching completes without unhandled exceptions',
    consoleErrors.length === 0,
    `Console errors: ${consoleErrors.join('; ')}`
  );

  recordResult(
    'Active banner correctly displays active campaign and phase after rapid switching',
    campaignSeqTest.bannerCampText.length > 0 && campaignSeqTest.bannerPhaseText.length > 0,
    `bannerCampText: "${campaignSeqTest.bannerCampText}", bannerPhaseText: "${campaignSeqTest.bannerPhaseText}"`
  );

  // High-frequency burst test: 50 back-to-back synchronous mutations
  const burstResult = await page.evaluate(() => {
    const campSelect = document.getElementById('campaignId');
    const phaseSelect = document.getElementById('selectedPhase');
    const opts = Array.from(campSelect.options).map(o => o.value);
    if (opts.length === 0) return { ok: false, reason: 'No campaign options' };

    for (let i = 0; i < 50; i++) {
      const c = opts[i % opts.length];
      campSelect.value = c;
      campSelect.dispatchEvent(new Event('change', { bubbles: true }));

      const pOpts = Array.from(phaseSelect.options).map(o => o.value);
      if (pOpts.length > 0) {
        phaseSelect.value = pOpts[(i * 3) % pOpts.length];
        phaseSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    return { ok: true, finalCamp: campSelect.value, finalPhase: phaseSelect.value };
  });

  recordResult(
    '50 high-frequency synchronous campaign/phase burst events completed safely',
    burstResult.ok && consoleErrors.length === 0,
    `Console errors: ${consoleErrors.join('; ')}`
  );

  // =========================================================================
  // 2. CUSTOM DROPDOWN KEYBOARD NAVIGATION & FOCUS/BLUR BEHAVIOR
  // =========================================================================
  console.log('\n▶️ [CATEGORY 2] Custom Dropdown Keyboard Navigation & Blur/Focus Handling');

  const kbTest = await page.evaluate(async () => {
    CustomDropdownEngine.closeAll();
    const sel = document.getElementById('campaignId');
    const trigger = document.getElementById('campaignId-trigger');
    const menu = document.getElementById('campaignId-menu');
    if (!trigger || !menu) return { ok: false, error: 'trigger or menu missing' };

    trigger.focus();

    // 1. Enter key opens menu
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const openedWithEnter = menu.classList.contains('show') && trigger.getAttribute('aria-expanded') === 'true';

    // 2. Escape key closes menu
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    const closedWithEscape = !menu.classList.contains('show') && trigger.getAttribute('aria-expanded') === 'false';

    // 3. Space key opens menu
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    const openedWithSpace = menu.classList.contains('show') && trigger.getAttribute('aria-expanded') === 'true';

    // 4. Escape closes again
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    // 5. ArrowDown opens menu
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    const openedWithArrowDown = menu.classList.contains('show') && trigger.getAttribute('aria-expanded') === 'true';

    // 6. ArrowDown/ArrowUp option traversal while open: does it change selection or focus?
    const initVal = sel.value;
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    const valAfterArrowDown = sel.value;
    const hasFocusHighlight = !!menu.querySelector('.custom-select-item.focused, .custom-select-item:focus, .custom-select-item.active');

    // 7. Blur / Focusout handling: User tabs away (focuses #infName)
    const infName = document.getElementById('infName');
    infName.focus();
    trigger.dispatchEvent(new FocusEvent('blur', { bubbles: false }));
    trigger.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    const closedOnBlur = !menu.classList.contains('show');

    // 8. Click outside handling
    CustomDropdownEngine.closeAll();
    trigger.click();
    const openedForClickOutside = menu.classList.contains('show');
    document.body.click();
    const closedOnClickOutside = !menu.classList.contains('show');

    return {
      openedWithEnter,
      closedWithEscape,
      openedWithSpace,
      openedWithArrowDown,
      canNavigateOptionsWithArrows: initVal !== valAfterArrowDown || hasFocusHighlight,
      closedOnBlur,
      openedForClickOutside,
      closedOnClickOutside
    };
  });

  recordResult(
    'Dropdown trigger opens on Enter key and reflects aria-expanded="true"',
    kbTest.openedWithEnter
  );
  recordResult(
    'Dropdown trigger closes on Escape key and reflects aria-expanded="false"',
    kbTest.closedWithEscape
  );
  recordResult(
    'Dropdown trigger opens on Space key',
    kbTest.openedWithSpace
  );
  recordResult(
    'Dropdown trigger opens on ArrowDown key',
    kbTest.openedWithArrowDown
  );
  recordResult(
    'Dropdown menu closes when clicked outside',
    kbTest.openedForClickOutside && kbTest.closedOnClickOutside
  );
  recordResult(
    'Dropdown supports keyboard arrow navigation between options (ArrowUp/ArrowDown)',
    kbTest.canNavigateOptionsWithArrows,
    'ArrowDown while menu is open does not navigate options or change selection.'
  );
  recordResult(
    'Dropdown closes on blur/focusout when user navigates away via Tab',
    kbTest.closedOnBlur,
    'Menu remains open when focus moves to another input element.'
  );

  // Test selecting an item via click on custom dropdown item
  const itemClickTest = await page.evaluate(() => {
    CustomDropdownEngine.closeAll();
    const sel = document.getElementById('campaignId');
    const trigger = document.getElementById('campaignId-trigger');
    const menu = document.getElementById('campaignId-menu');
    trigger.click(); // open

    const items = menu.querySelectorAll('.custom-select-item');
    if (items.length < 2) return { ok: false, reason: 'Less than 2 items in menu' };

    const secondItem = items[1];
    const targetVal = secondItem.getAttribute('data-value');
    secondItem.click();

    return {
      targetVal,
      actualSelectVal: sel.value,
      isMenuClosed: !menu.classList.contains('show')
    };
  });

  recordResult(
    'Clicking an item in custom dropdown synchronizes native select and closes menu',
    itemClickTest.actualSelectVal === itemClickTest.targetVal && itemClickTest.isMenuClosed,
    `targetVal: ${itemClickTest.targetVal}, actualSelectVal: ${itemClickTest.actualSelectVal}`
  );

  // Restore nov2026
  await page.evaluate(() => {
    const sel = document.getElementById('campaignId');
    sel.value = 'nov2026';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });

  // =========================================================================
  // 3. TEXT FUZZING IN INPUT FIELDS (XSS, Emojis, Long Strings, RTL Marks)
  // =========================================================================
  console.log('\n▶️ [CATEGORY 3] Text Fuzzing in Input Fields');

  // Test 3.1: Long string resilience
  const longStringTest = await page.evaluate(() => {
    const infName = document.getElementById('infName');
    infName.value = 'A'.repeat(10000);
    infName.dispatchEvent(new Event('input', { bubbles: true }));
    render();
    const out = document.getElementById('out-email-en').innerHTML;
    return out.includes('A'.repeat(100));
  });
  recordResult('10,000 character long string handled without DOM crash or hang', longStringTest);

  // Test 3.2: Emojis and RTL marks
  const unicodeTest = await page.evaluate(() => {
    const payload = '🌟 حملة نون الخليج 2026 \u200F(Special VIP) \u202Ereversed\u202C 🚀 %$#@! 🛒';
    document.getElementById('infName').value = payload;
    document.getElementById('infName').dispatchEvent(new Event('input', { bubbles: true }));
    render();
    const out = document.getElementById('out-email-ar').innerHTML;
    return out.includes('🌟') && out.includes('حملة نون الخليج');
  });
  recordResult('Arabic / English mixed text with emojis and RTL marks renders cleanly', unicodeTest);

  // Test 3.3: Numeric boundaries in #fee
  const feeTest = await page.evaluate(() => {
    const feeInput = document.getElementById('fee');
    const values = ['0', '-500', '999999999999', '1e10', 'NaN', 'abc', '3.14159', ''];
    let allOk = true;
    for (const v of values) {
      feeInput.value = v;
      feeInput.dispatchEvent(new Event('input', { bubbles: true }));
      render();
      const out = document.getElementById('out-email-en').innerHTML;
      if (!out || out.length < 500) allOk = false;
    }
    return allOk;
  });
  recordResult('Fee input handles boundary numeric and invalid strings safely', feeTest);

  // Test 3.4: DOM-based XSS injection resistance
  const xssTest = await page.evaluate(async () => {
    window.__xssInfPwned = false;
    window.__xssKpiPwned = false;
    window.__xssCodePwned = false;

    // Test payload for infName
    document.getElementById('infName').value = '<img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" onload="window.__xssInfPwned=true">';
    document.getElementById('infName').dispatchEvent(new Event('input', { bubbles: true }));

    // Test payload for kpiTarget
    document.getElementById('kpiTarget').value = '<img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" onload="window.__xssKpiPwned=true">';
    document.getElementById('kpiTarget').dispatchEvent(new Event('input', { bubbles: true }));

    // Test payload for discountCode
    document.getElementById('discountCode').value = '<img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" onload="window.__xssCodePwned=true">';
    document.getElementById('discountCode').dispatchEvent(new Event('input', { bubbles: true }));

    render();

    // Check if scripts or img onloads executed
    await new Promise(r => setTimeout(r, 200));

    return {
      infXss: window.__xssInfPwned === true,
      kpiXss: window.__xssKpiPwned === true,
      codeXss: window.__xssCodePwned === true
    };
  });

  recordResult(
    'Input fields are resilient against DOM-based XSS (HTML escaping verification)',
    !xssTest.infXss && !xssTest.kpiXss && !xssTest.codeXss,
    `HTML injection payloads executed: infXss=${xssTest.infXss}, kpiXss=${xssTest.kpiXss}, codeXss=${xssTest.codeXss}`
  );

  // Reset inputs
  await page.evaluate(() => {
    document.getElementById('infName').value = 'Ahmed';
    document.getElementById('discountCode').value = 'PROMO15';
    document.getElementById('fee').value = '500';
    document.getElementById('kpiTarget').value = '100K';
    document.getElementById('senderName').value = 'Mahmoud';
    render();
  });

  // =========================================================================
  // 4. DATE MILESTONE CARDS: BOUNDARY DAYS & MONTH CHANGES
  // =========================================================================
  console.log('\n▶️ [CATEGORY 4] Date Milestone Cards: Boundary Days & Month Changes');

  const dateBoundaryTests = [
    { subDay: '0', subMonth: '11', liveDay: '0', liveMonth: '11', desc: 'Day 0 (falsy)' },
    { subDay: '1', subMonth: '11', liveDay: '30', liveMonth: '11', desc: 'Day 1 & Day 30 (Nov boundaries)' },
    { subDay: '31', subMonth: '11', liveDay: '31', liveMonth: '11', desc: 'Day 31 in 30-day month (Nov)' },
    { subDay: '32', subMonth: '11', liveDay: '100', liveMonth: '11', desc: 'Day 32 & Day 100 (Out of range)' },
    { subDay: '', subMonth: '11', liveDay: '', liveMonth: '11', desc: 'Empty Day inputs' },
    { subDay: '-5', subMonth: '11', liveDay: '-1', liveMonth: '11', desc: 'Negative day inputs' },
    { subDay: '29', subMonth: '02', liveDay: '28', liveMonth: '02', desc: 'February leap day boundary (28 vs 29)' },
    { subDay: '15', subMonth: '12', liveDay: '5', liveMonth: '01', desc: 'Cross-year boundary (Dec -> Jan)' }
  ];

  for (const tc of dateBoundaryTests) {
    const res = await page.evaluate((testCase) => {
      const subDay = document.getElementById('subDay');
      const subMonth = document.getElementById('subMonth');
      const liveDay = document.getElementById('liveDay');
      const liveMonth = document.getElementById('liveMonth');

      subDay.value = testCase.subDay;
      subDay.dispatchEvent(new Event('input', { bubbles: true }));
      subMonth.value = testCase.subMonth;
      subMonth.dispatchEvent(new Event('change', { bubbles: true }));

      liveDay.value = testCase.liveDay;
      liveDay.dispatchEvent(new Event('input', { bubbles: true }));
      liveMonth.value = testCase.liveMonth;
      liveMonth.dispatchEvent(new Event('change', { bubbles: true }));

      render();

      const enOut = document.getElementById('out-email-en').innerHTML;
      const arOut = document.getElementById('out-email-ar').innerHTML;

      return {
        enOutValid: enOut.length > 500 && !enOut.includes('undefined'),
        arOutValid: arOut.length > 500 && !arOut.includes('undefined')
      };
    }, tc);

    recordResult(
      `Date boundary [${tc.desc}]: Renders cleanly without undefined strings or crashing`,
      res.enOutValid && res.arOutValid,
      `enOutValid: ${res.enOutValid}, arOutValid: ${res.arOutValid}`
    );
  }

  // Restore valid dates
  await page.evaluate(() => {
    document.getElementById('subDay').value = '5';
    document.getElementById('subMonth').value = '11';
    document.getElementById('liveDay').value = '10';
    document.getElementById('liveMonth').value = '11';
    render();
  });

  // =========================================================================
  // 5. OUTPUT PANE STABILITY & TAB SWITCHING / COPY OPERATIONS
  // =========================================================================
  console.log('\n▶️ [CATEGORY 5] Output Pane Stability & Copy Operations');

  const tabs = [
    { id: 'email-en', label: 'Email EN' },
    { id: 'email-ar', label: 'Email AR' },
    { id: 'brief-en', label: 'Brief EN' },
    { id: 'brief-ar', label: 'Brief AR' },
    { id: 'brief-txt-en', label: 'Brief TXT EN' },
    { id: 'brief-txt-ar', label: 'Brief TXT AR' }
  ];

  for (const tab of tabs) {
    const tabResult = await page.evaluate(async (tabId) => {
      const allTabs = Array.from(document.querySelectorAll('.tab'));
      const targetBtn = allTabs.find(t => {
        const onclickAttr = t.getAttribute('onclick') || '';
        return onclickAttr.includes(`'${tabId}'`);
      });

      if (!targetBtn) return { found: false };
      targetBtn.click();

      const pane = document.getElementById('out-' + tabId);
      const isVisible = pane && pane.style.display !== 'none';

      let copyFabThrew = false;
      let copyBottomThrew = false;
      try {
        const copyFab = document.getElementById('copyFab');
        if (copyFab) copyFab.click();
      } catch (e) {
        copyFabThrew = true;
      }

      try {
        const copyBottom = document.getElementById('copyFabBottom');
        if (copyBottom) copyBottom.click();
      } catch (e) {
        copyBottomThrew = true;
      }

      return {
        found: true,
        isVisible,
        copyFabThrew,
        copyBottomThrew,
        contentLength: pane ? pane.innerHTML.length : 0
      };
    }, tab.id);

    recordResult(
      `Output tab [${tab.label}]: Displays correctly and executes copy operations safely`,
      tabResult.found && tabResult.isVisible && !tabResult.copyFabThrew && !tabResult.copyBottomThrew && tabResult.contentLength > 50,
      `isVisible: ${tabResult.isVisible}, copyFabThrew: ${tabResult.copyFabThrew}, len: ${tabResult.contentLength}`
    );
  }

  // Test copySubject button
  const copySubjectResult = await page.evaluate(() => {
    let threw = false;
    try {
      const subjectBox = document.querySelector('.subject-box');
      const copyBtn = subjectBox ? subjectBox.querySelector('.copy-btn') : null;
      if (copyBtn) copyBtn.click();
    } catch (e) {
      threw = true;
    }
    return { threw };
  });

  recordResult(
    'Subject copy button executes without unhandled exceptions',
    !copySubjectResult.threw
  );

  // =========================================================================
  // 6. RANDOM COMBINATORIAL CHAOS FUZZ LOOP (100 RAPID MUTATIONS)
  // =========================================================================
  console.log('\n▶️ [CATEGORY 6] Random Combinatorial Chaos Fuzzing (100 Iterations)');

  const chaosResult = await page.evaluate(async () => {
    const errors = [];
    const camps = Array.from(document.getElementById('campaignId').options).map(o => o.value);
    const countries = Array.from(document.getElementById('country').options).map(o => o.value);
    const platforms = Array.from(document.getElementById('platform').options).map(o => o.value);
    const tabsList = ['email-en', 'email-ar', 'brief-en', 'brief-ar', 'brief-txt-en', 'brief-txt-ar'];

    const sampleNames = ['Shorouk', 'سارة محمد', 'Noon VIP Influencer', 'Omar Al-Ghamdi', 'Mohammed & Co. 🔥'];
    const sampleCodes = ['PROMO15', '1111SALE', 'YFS2026', 'CUSTOM99', 'FIRST20', ''];

    for (let i = 0; i < 100; i++) {
      try {
        const c = camps[Math.floor(Math.random() * camps.length)];
        const campEl = document.getElementById('campaignId');
        campEl.value = c;
        campEl.dispatchEvent(new Event('change', { bubbles: true }));

        const phaseEl = document.getElementById('selectedPhase');
        const pOpts = Array.from(phaseEl.options).map(o => o.value);
        if (pOpts.length > 0) {
          phaseEl.value = pOpts[Math.floor(Math.random() * pOpts.length)];
          phaseEl.dispatchEvent(new Event('change', { bubbles: true }));
        }

        const countryEl = document.getElementById('country');
        countryEl.value = countries[Math.floor(Math.random() * countries.length)];
        countryEl.dispatchEvent(new Event('change', { bubbles: true }));

        const platformEl = document.getElementById('platform');
        platformEl.value = platforms[Math.floor(Math.random() * platforms.length)];
        platformEl.dispatchEvent(new Event('change', { bubbles: true }));

        document.getElementById('infName').value = sampleNames[i % sampleNames.length];
        document.getElementById('discountCode').value = sampleCodes[i % sampleCodes.length];
        document.getElementById('subDay').value = String((i % 30) + 1);
        document.getElementById('liveDay').value = String(((i + 5) % 30) + 1);
        document.getElementById('fee').value = String(Math.floor(Math.random() * 5000));

        const targetTab = tabsList[i % tabsList.length];
        const allTabs = Array.from(document.querySelectorAll('.tab'));
        const tabBtn = allTabs.find(t => (t.getAttribute('onclick') || '').includes(`'${targetTab}'`));
        if (tabBtn) tabBtn.click();

        if (i % 10 === 0) {
          const copyFab = document.getElementById('copyFab');
          if (copyFab) copyFab.click();
        }
      } catch (err) {
        errors.push({ iteration: i, msg: err.message });
      }
    }

    return {
      completedIterations: 100,
      errorsCount: errors.length,
      errors
    };
  });

  recordResult(
    '100 Random Chaos combinatorial mutations completed with 0 runtime errors',
    chaosResult.errorsCount === 0,
    `Errors: ${JSON.stringify(chaosResult.errors)}`
  );

  // Close browser & ephemeral server
  } finally {
    await browser.close();
    await srv.close();
  }

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log('\n======================================================================');
  console.log('📊 ADVERSARIAL STRESS SUITE SUMMARY');
  console.log('======================================================================');
  console.log(`  Total Tests Run : ${totalTests}`);
  console.log(`  Passed          : ${passedTests}`);
  console.log(`  Failed          : ${failedTests}`);
  console.log('======================================================================');

  return { totalTests, passedTests, failedTests, findings };
}

runAdversarialSuite()
  .then(res => {
    if (res.failedTests > 0) {
      console.log(`\n⚠️ ADVERSARIAL STRESS HARNESS COMPLETED WITH ${res.failedTests} FINDING(S).`);
      process.exit(1);
    } else {
      console.log('\n✅ ALL ADVERSARIAL TESTS PASSED.');
      process.exit(0);
    }
  })
  .catch(err => {
    console.error('Fatal test error:', err);
    process.exit(1);
  });
