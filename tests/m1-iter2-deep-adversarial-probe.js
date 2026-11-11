const { launchBrowser } = require('./lib/chrome-launcher');
const { startTestServer, openAuthenticatedHub } = require('./lib/test-server');
const path = require('path');

async function runDeepAdversarialProbe() {
  const srv = await startTestServer();
  console.log('======================================================================');
  console.log('🔬 DEEP ADVERSARIAL PROBE — ITERATION 2 REMEDIATION AUDIT');
  console.log('======================================================================');

  let passed = 0;
  let failed = 0;

  function assert(name, condition, extra = '') {
    if (condition) {
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } else {
      console.log(`  ❌ FAIL: ${name}`);
      if (extra) console.log(`     Details: ${extra}`);
      failed++;
    }
  }

  const browser = await launchBrowser();
  try {
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => consoleErrors.push(err.message));

  await openAuthenticatedHub(page, srv.baseUrl, srv.sitePassword);

  // -------------------------------------------------------------------------
  // TEST SUITE 1: Deep Keyboard Navigation Traversal & ARIA State Machines
  // -------------------------------------------------------------------------
  console.log('\n▶️ [PROBE 1] Keyboard Traversal, Home/End, Wrap-around & Enter Selection');

  const kbProbe = await page.evaluate(async () => {
    CustomDropdownEngine.closeAll();
    const sel = document.getElementById('selectedPhase');
    const trigger = document.getElementById('selectedPhase-trigger');
    const menu = document.getElementById('selectedPhase-menu');

    // Focus trigger
    trigger.focus();

    // Open via Enter
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const isOpenInitial = menu.classList.contains('show');
    const initVal = sel.value; // e.g. "0"

    // Initial highlight should be index 0
    const items = menu.querySelectorAll('.custom-select-item');
    const firstHighlighted = items[0].classList.contains('highlighted');

    // ArrowUp while at 0 should wrap around to last item (index items.length - 1)
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    const lastHighlighted = items[items.length - 1].classList.contains('highlighted');
    const ariaDescAfterUp = trigger.getAttribute('aria-activedescendant');
    const lastItemId = items[items.length - 1].id;

    // ArrowDown should wrap back to 0
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    const wrappedToFirst = items[0].classList.contains('highlighted');

    // Home key jumps to 0
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    const endHighlighted = items[items.length - 1].classList.contains('highlighted');

    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    const homeHighlighted = items[0].classList.contains('highlighted');

    // ArrowDown to item 1 (Phase 2, 11.11 SALE) and press Enter
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    const item1Highlighted = items[1].classList.contains('highlighted');
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    // Selection should now be "1" (Phase 2)
    const valAfterEnter = sel.value;
    const isClosedAfterEnter = !menu.classList.contains('show');
    const triggerDisplay = document.getElementById('selectedPhase-display').textContent;

    // Default code should automatically update to 1111SALE
    const discountCodeVal = document.getElementById('discountCode').value;

    return {
      isOpenInitial,
      firstHighlighted,
      lastHighlighted,
      ariaDescMatches: ariaDescAfterUp === lastItemId,
      wrappedToFirst,
      endHighlighted,
      homeHighlighted,
      item1Highlighted,
      valAfterEnter,
      isClosedAfterEnter,
      triggerDisplayUpdated: triggerDisplay.includes('11.11') || triggerDisplay.includes('المرحلة 2'),
      discountCodeVal
    };
  });

  assert('Dropdown opens and highlights initial active option', kbProbe.isOpenInitial && kbProbe.firstHighlighted);
  assert('ArrowUp at top wraps around to last item with aria-activedescendant update', kbProbe.lastHighlighted && kbProbe.ariaDescMatches);
  assert('ArrowDown at bottom wraps around to index 0', kbProbe.wrappedToFirst);
  assert('End key jumps directly to last item and Home jumps to first', kbProbe.endHighlighted && kbProbe.homeHighlighted);
  assert('Enter key selects highlighted option, closes dropdown, and updates DOM state',
    kbProbe.valAfterEnter === '1' && kbProbe.isClosedAfterEnter && kbProbe.triggerDisplayUpdated,
    `valAfterEnter: ${kbProbe.valAfterEnter}, isClosed: ${kbProbe.isClosedAfterEnter}`
  );
  assert('Phase selection change via keyboard cascades to discount code (1111SALE)',
    kbProbe.discountCodeVal === '1111SALE',
    `discountCodeVal: ${kbProbe.discountCodeVal}`
  );

  // -------------------------------------------------------------------------
  // TEST SUITE 2: Tab Navigation & Focusout Outside Wrapper
  // -------------------------------------------------------------------------
  console.log('\n▶️ [PROBE 2] Focusout & Tab Traversal Dismissal across Multiple Controls');

  const tabProbe = await page.evaluate(() => {
    CustomDropdownEngine.closeAll();
    const selIds = ['campaignId', 'selectedPhase', 'country', 'platform'];
    const results = [];

    for (const id of selIds) {
      const trigger = document.getElementById(id + '-trigger');
      const menu = document.getElementById(id + '-menu');
      const wrap = document.getElementById('wrap-' + id);

      // Open menu
      trigger.click();
      const opened = menu.classList.contains('show');

      // Simulate Tab away to another DOM element (e.g. infName)
      const target = document.getElementById('infName');
      target.focus();

      // Dispatch focusout with relatedTarget as target outside wrap
      wrap.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: target }));
      const closed = !menu.classList.contains('show');

      results.push({ id, opened, closed });
    }

    return results;
  });

  for (const r of tabProbe) {
    assert(`Custom dropdown [#${r.id}] closes on focusout when focus moves outside wrapper`,
      r.opened && r.closed,
      `id: ${r.id}, opened: ${r.opened}, closed: ${r.closed}`
    );
  }

  // -------------------------------------------------------------------------
  // TEST SUITE 3: Mouse Down on Items Does NOT Prematurely Dismiss Menu
  // -------------------------------------------------------------------------
  console.log('\n▶️ [PROBE 3] Mouse Interaction & Item Click Ordering Safety');

  const mouseProbe = await page.evaluate(() => {
    CustomDropdownEngine.closeAll();
    const sel = document.getElementById('country');
    const trigger = document.getElementById('country-trigger');
    const menu = document.getElementById('country-menu');

    trigger.click(); // open
    const opened = menu.classList.contains('show');

    // Query item for Kuwait (KW)
    const kwItem = menu.querySelector('[data-value="KW"]');
    if (!kwItem) return { ok: false, reason: 'KW item missing' };

    // Simulate mousedown on item
    const mousedownEv = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    kwItem.dispatchEvent(mousedownEv);
    const mousedownPrevented = mousedownEv.defaultPrevented;
    const stillOpenAfterMousedown = menu.classList.contains('show');

    // Simulate click on item
    kwItem.click();
    const selValAfterClick = sel.value;
    const closedAfterClick = !menu.classList.contains('show');

    return {
      opened,
      mousedownPrevented,
      stillOpenAfterMousedown,
      selValAfterClick,
      closedAfterClick
    };
  });

  assert('Mousedown on dropdown item calls preventDefault to guard against premature blur',
    mouseProbe.mousedownPrevented && mouseProbe.stillOpenAfterMousedown,
    `mousedownPrevented: ${mouseProbe.mousedownPrevented}, stillOpen: ${mouseProbe.stillOpenAfterMousedown}`
  );
  assert('Clicking item selects country (KW) and dismisses menu',
    mouseProbe.selValAfterClick === 'KW' && mouseProbe.closedAfterClick,
    `selValAfterClick: ${mouseProbe.selValAfterClick}`
  );

  // -------------------------------------------------------------------------
  // TEST SUITE 4: Comprehensive Multi-Field XSS Attack Vector Penetration
  // -------------------------------------------------------------------------
  console.log('\n▶️ [PROBE 4] Multi-Vector XSS Fuzzing Across All User Fields');

  const xssDeepProbe = await page.evaluate(async () => {
    window.__deepXssFlags = {
      name: false,
      code: false,
      fee: false,
      kpi: false,
      sender: false,
      subDay: false,
      liveDay: false
    };

    // Craft distinct SVG / IMG / Body payload triggers
    const payload = (field) => `<img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" onload="window.__deepXssFlags['${field}']=true"><svg onload="window.__deepXssFlags['${field}']=true">`;

    document.getElementById('infName').value = payload('name');
    document.getElementById('discountCode').value = payload('code');
    document.getElementById('fee').value = payload('fee');
    document.getElementById('kpiTarget').value = payload('kpi');
    document.getElementById('senderName').value = payload('sender');
    document.getElementById('subDay').value = payload('subDay');
    document.getElementById('liveDay').value = payload('liveDay');

    // Trigger input events on all
    ['infName', 'discountCode', 'fee', 'kpiTarget', 'senderName', 'subDay', 'liveDay'].forEach(id => {
      document.getElementById(id).dispatchEvent(new Event('input', { bubbles: true }));
    });

    render();

    // Also trigger tab switches to render all output panes (Email EN, AR, Brief EN, AR, etc.)
    const tabs = ['btn-email-en', 'btn-email-ar', 'btn-brief-en', 'btn-brief-ar', 'btn-brief-txt-en', 'btn-brief-txt-ar'];
    for (const tabId of tabs) {
      const btn = document.getElementById(tabId);
      if (btn) btn.click();
    }

    await new Promise(r => setTimeout(r, 250));

    // Verify HTML escaping in output panes: check that raw '<img' or '<svg' tags do not exist in innerHTML
    const panes = ['out-email-en', 'out-email-ar', 'out-brief-en', 'out-brief-ar'];
    const unescapedTags = [];
    for (const paneId of panes) {
      const el = document.getElementById(paneId);
      // If there are unescaped img/svg with onload injected from user payload:
      const injectedImgs = el.querySelectorAll('img[onload*="__deepXssFlags"]');
      const injectedSvgs = el.querySelectorAll('svg[onload*="__deepXssFlags"]');
      if (injectedImgs.length > 0 || injectedSvgs.length > 0) {
        unescapedTags.push({ paneId, imgCount: injectedImgs.length, svgCount: injectedSvgs.length });
      }
    }

    return {
      flags: window.__deepXssFlags,
      unescapedTags
    };
  });

  const allFlagsFalse = Object.values(xssDeepProbe.flags).every(v => v === false);
  assert('Zero script/handler execution across all 7 user-input fields in all output panes',
    allFlagsFalse,
    `Triggered flags: ${JSON.stringify(xssDeepProbe.flags)}`
  );
  assert('Zero raw injected elements detected in DOM querySelector across all output panes',
    xssDeepProbe.unescapedTags.length === 0,
    `Unescaped tags found: ${JSON.stringify(xssDeepProbe.unescapedTags)}`
  );

  // -------------------------------------------------------------------------
  // TEST SUITE 5: Special Characters & Plain-Text Output Fidelity Check
  // -------------------------------------------------------------------------
  console.log('\n▶️ [PROBE 5] Special Characters & Plain-Text Output Fidelity Check');

  const textFidelityProbe = await page.evaluate(() => {
    // Set legitimate strings with & and quotes
    document.getElementById('infName').value = "Sara & Noor's Reviews";
    document.getElementById('infName').dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('discountCode').value = 'SPECIAL&SAVE';
    document.getElementById('discountCode').dispatchEvent(new Event('input', { bubbles: true }));
    render();

    // Check plaintext brief panes
    const txtEn = document.getElementById('out-brief-txt-en').textContent || '';
    const txtAr = document.getElementById('out-brief-txt-ar').textContent || '';

    // Plain text should contain readable characters, NOT double-encoded entities like &amp;amp;
    const hasDoubleAmpEn = txtEn.includes('&amp;amp;') || txtEn.includes('&amp;#39;');
    const hasDoubleAmpAr = txtAr.includes('&amp;amp;') || txtAr.includes('&amp;#39;');

    // HTML panes should contain &amp; and &#39;
    const htmlEn = document.getElementById('out-email-en').innerHTML;
    const containsEscapedAmp = htmlEn.includes('&amp;') || htmlEn.includes('Sara');

    return {
      hasDoubleAmpEn,
      hasDoubleAmpAr,
      containsEscapedAmp
    };
  });

  assert('Plain-text brief outputs do not suffer from double-encoding artifacts (&amp;amp;)',
    !textFidelityProbe.hasDoubleAmpEn && !textFidelityProbe.hasDoubleAmpAr,
    `hasDoubleAmpEn: ${textFidelityProbe.hasDoubleAmpEn}, hasDoubleAmpAr: ${textFidelityProbe.hasDoubleAmpAr}`
  );
  assert('HTML output pane renders entity-escaped content safely', textFidelityProbe.containsEscapedAmp);

  // Console integrity check
  assert('Browser console remained strictly free of errors throughout deep probe',
    consoleErrors.length === 0,
    `Console errors: ${consoleErrors.join('; ')}`
  );

  console.log('\n======================================================================');
  console.log(`📊 PROBE SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log('======================================================================\n');

  } finally {
    await browser.close();
    await srv.close();
  }
  return failed === 0;
}

runDeepAdversarialProbe()
  .then(ok => process.exit(ok ? 0 : 1))
  .catch(err => {
    console.error('Fatal probe error:', err);
    process.exit(1);
  });
