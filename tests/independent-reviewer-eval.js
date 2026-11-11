// mail-campaign/tests/independent-reviewer-eval.js
const { launchBrowser } = require('./lib/chrome-launcher');
const { startTestServer, openAuthenticatedHub } = require('./lib/test-server');
const path = require('path');

(async () => {
  console.log('======================================================================');
  console.log('🕵️ INDEPENDENT REVIEWER VERIFICATION GATE — MILESTONE 1 ITERATION 2');
  console.log('======================================================================');

  const srv = await startTestServer();
  const browser = await launchBrowser();
  const page = await browser.newPage();

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => consoleErrors.push(err.message));

  await openAuthenticatedHub(page, srv.baseUrl, srv.sitePassword);

  let totalChecks = 0;
  let passedChecks = 0;
  let failedChecks = 0;

  function assert(title, condition, details = '') {
    totalChecks++;
    if (condition) {
      console.log(`  ✅ PASS: ${title}`);
      passedChecks++;
    } else {
      console.error(`  ❌ FAIL: ${title}`);
      if (details) console.error(`     Details: ${details}`);
      failedChecks++;
    }
  }

  // -------------------------------------------------------------------------
  // 1. Layout Hierarchy Verification
  // -------------------------------------------------------------------------
  console.log('\n▶️ [CHECK 1] Layout Hierarchy Verification');
  const layout = await page.evaluate(() => {
    const campWrap = document.getElementById('wrap-campaignId');
    const phaseWrap = document.getElementById('wrap-selectedPhase');
    const banner = document.getElementById('activeCampaignBanner');
    const infGroup = document.getElementById('influencerGroup');

    const campRect = campWrap.getBoundingClientRect();
    const phaseRect = phaseWrap.getBoundingClientRect();
    const bannerRect = banner.getBoundingClientRect();
    const infRect = infGroup.getBoundingClientRect();

    return {
      campRect,
      phaseRect,
      bannerRect,
      infRect,
      isPhaseDirectlyBelowCamp: phaseRect.top >= (campRect.bottom - 4) && phaseRect.top <= (campRect.bottom + 30),
      isBannerBelowPhase: bannerRect.top >= (phaseRect.bottom - 4),
      isInfBelowBanner: infRect.top >= (bannerRect.bottom - 4)
    };
  });

  assert('Phase selector is positioned directly below Campaign selector', layout.isPhaseDirectlyBelowCamp,
    `campBottom: ${layout.campRect.bottom}, phaseTop: ${layout.phaseRect.top}`);
  assert('Active campaign banner is positioned below Phase selector', layout.isBannerBelowPhase,
    `phaseBottom: ${layout.phaseRect.bottom}, bannerTop: ${layout.bannerRect.top}`);
  assert('Influencer input group is positioned below Active Campaign banner', layout.isInfBelowBanner,
    `bannerBottom: ${layout.bannerRect.bottom}, infTop: ${layout.infRect.top}`);

  // -------------------------------------------------------------------------
  // 2. Dynamic Active Campaign Status Indicator Banner
  // -------------------------------------------------------------------------
  console.log('\n▶️ [CHECK 2] Active Campaign Status Indicator Banner');
  const bannerCheck = await page.evaluate(() => {
    const banner = document.getElementById('activeCampaignBanner');
    const pulseDot = banner.querySelector('.pulse-dot');
    const pulseRing = banner.querySelector('.pulse-ring');
    const campName = document.getElementById('activeCampName').textContent.trim();
    const phaseName = document.getElementById('activePhaseName').textContent.trim();
    const leadPhrase = banner.querySelector('.banner-lead').textContent.trim();
    const kicker = banner.querySelector('.banner-kicker').textContent.trim();

    const ringStyle = window.getComputedStyle(pulseRing);
    const hasPulseAnim = ringStyle.animationName && ringStyle.animationName.includes('Pulse');

    // Test dynamic update
    const campSel = document.getElementById('campaignId');
    campSel.value = 'oct2026';
    onCampaignChange();
    const octCampName = document.getElementById('activeCampName').textContent.trim();

    // Revert back to nov2026
    campSel.value = 'nov2026';
    onCampaignChange(true);
    const revertedCampName = document.getElementById('activeCampName').textContent.trim();

    return {
      hasPulseDot: !!pulseDot,
      hasPulseRing: !!pulseRing,
      hasPulseAnim,
      campName,
      phaseName,
      leadPhrase,
      kicker,
      octCampName,
      revertedCampName
    };
  });

  assert('Pulsing dot and animated pulse ring exist with CSS animation', bannerCheck.hasPulseDot && bannerCheck.hasPulseRing && bannerCheck.hasPulseAnim);
  assert('Banner displays Arabic text "أنت الآن واقف على كامبين:"', bannerCheck.leadPhrase.includes('أنت الآن واقف على كامبين'));
  assert('Banner shows kicker "الحملة النشطة حالياً"', bannerCheck.kicker.includes('الحملة النشطة حالياً'));
  assert('Banner dynamically updates campaign name on change',
    bannerCheck.octCampName.includes('أكتوبر') || bannerCheck.octCampName.includes('October'),
    `got: ${bannerCheck.octCampName}`);
  assert('Banner dynamically restores November campaign on revert',
    bannerCheck.revertedCampName.includes('نوفمبر') || bannerCheck.revertedCampName.includes('November'),
    `got: ${bannerCheck.revertedCampName}`);

  // -------------------------------------------------------------------------
  // 3. Custom Dropdown Components (Visual Styling, Keyboard & Mouse)
  // -------------------------------------------------------------------------
  console.log('\n▶️ [CHECK 3] Custom Dropdown Components (Puppeteer Real Keyboard)');

  const dropdownStyles = await page.evaluate(() => {
    const trigger = document.getElementById('platform-trigger');
    const style = window.getComputedStyle(trigger);
    const menu = document.getElementById('platform-menu');
    const menuStyle = window.getComputedStyle(menu);

    return {
      triggerBg: style.backgroundColor || style.background,
      triggerBorder: style.borderColor,
      borderRadius: style.borderRadius,
      menuZIndex: menuStyle.zIndex,
      menuRadius: menuStyle.borderRadius
    };
  });

  assert('Dropdown trigger matches executive dark theme styling',
    dropdownStyles.borderRadius === '12px' && parseInt(dropdownStyles.menuZIndex, 10) >= 100,
    JSON.stringify(dropdownStyles));

  // Traversal & Keyboard Interactions with REAL Puppeteer keyboard events
  await page.focus('#platform-trigger');
  await page.keyboard.press('ArrowDown'); // opens menu, highlights current (index 2: IG+TT)

  const checkOpened = await page.evaluate(() => {
    const menu = document.getElementById('platform-menu');
    const trigger = document.getElementById('platform-trigger');
    const items = menu.querySelectorAll('.custom-select-item');
    const currentHighlighted = Array.from(items).findIndex(i => i.classList.contains('highlighted'));
    return {
      isOpen: menu.classList.contains('show'),
      ariaExpanded: trigger.getAttribute('aria-expanded') === 'true',
      currentHighlighted
    };
  });
  assert('Dropdown opens on ArrowDown key and highlights active option (index 2)',
    checkOpened.isOpen && checkOpened.ariaExpanded && checkOpened.currentHighlighted === 2,
    JSON.stringify(checkOpened));

  // Navigate ArrowDown to index 3 (Snapchat)
  await page.keyboard.press('ArrowDown');
  const checkNavDown = await page.evaluate(() => {
    const menu = document.getElementById('platform-menu');
    const trigger = document.getElementById('platform-trigger');
    const items = menu.querySelectorAll('.custom-select-item');
    const highlightedIdx = Array.from(items).findIndex(i => i.classList.contains('highlighted'));
    const expectedId = items[3].id;
    return {
      highlightedIdx,
      ariaActiveDesc: trigger.getAttribute('aria-activedescendant') === expectedId
    };
  });
  assert('ArrowDown navigates option highlight to next item (index 3) and updates aria-activedescendant',
    checkNavDown.highlightedIdx === 3 && checkNavDown.ariaActiveDesc);

  // Navigate ArrowUp back to index 2
  await page.keyboard.press('ArrowUp');
  const checkNavUp = await page.evaluate(() => {
    const menu = document.getElementById('platform-menu');
    const items = menu.querySelectorAll('.custom-select-item');
    return Array.from(items).findIndex(i => i.classList.contains('highlighted'));
  });
  assert('ArrowUp navigates back to previous option (index 2)', checkNavUp === 2);

  // Press Enter to select index 2
  await page.keyboard.press('Enter');
  const checkEnterSelect = await page.evaluate(() => {
    const sel = document.getElementById('platform');
    const menu = document.getElementById('platform-menu');
    const trigger = document.getElementById('platform-trigger');
    return {
      val: sel.value,
      isClosed: !menu.classList.contains('show'),
      ariaExpanded: trigger.getAttribute('aria-expanded') === 'false'
    };
  });
  assert('Enter selects highlighted option, syncs native select, and closes menu',
    checkEnterSelect.val === 'Instagram Reels & TikTok' && checkEnterSelect.isClosed && checkEnterSelect.ariaExpanded);

  // Space key opens menu
  await page.keyboard.press(' ');
  const checkSpaceOpen = await page.evaluate(() => {
    const menu = document.getElementById('platform-menu');
    return menu.classList.contains('show');
  });
  assert('Space key opens dropdown menu', checkSpaceOpen);

  // Escape key closes menu
  await page.keyboard.press('Escape');
  const checkEscapeClose = await page.evaluate(() => {
    const menu = document.getElementById('platform-menu');
    const trigger = document.getElementById('platform-trigger');
    return !menu.classList.contains('show') && trigger.getAttribute('aria-expanded') === 'false';
  });
  assert('Escape key dismisses menu returning aria-expanded="false"', checkEscapeClose);

  // Focusout / blur dismissal
  const focusoutCheck = await page.evaluate(() => {
    CustomDropdownEngine.closeAll();
    const trigger = document.getElementById('country-trigger');
    const menu = document.getElementById('country-menu');
    const wrap = document.getElementById('wrap-country');
    const outsideTarget = document.getElementById('infName');

    // Open menu
    trigger.click();
    const opened = menu.classList.contains('show');

    // Dispatch focusout outside wrap
    outsideTarget.focus();
    wrap.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: outsideTarget }));
    const closed = !menu.classList.contains('show');

    return { opened, closed };
  });
  assert('Dropdown dismisses on focusout when focus moves outside wrapper', focusoutCheck.opened && focusoutCheck.closed);

  // Mouse click selection
  const mouseClickCheck = await page.evaluate(() => {
    CustomDropdownEngine.closeAll();
    const trigger = document.getElementById('country-trigger');
    const menu = document.getElementById('country-menu');
    const sel = document.getElementById('country');

    trigger.click();
    const items = menu.querySelectorAll('.custom-select-item');
    const omanItem = Array.from(items).find(i => i.getAttribute('data-value') === 'OM');

    // Dispatch mousedown (which should preventDefault to prevent premature blur)
    const mdEvt = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    omanItem.dispatchEvent(mdEvt);
    const mousedownDefaultPrevented = mdEvt.defaultPrevented;

    // Dispatch click
    omanItem.click();
    const selVal = sel.value;
    const isClosed = !menu.classList.contains('show');

    return { mousedownDefaultPrevented, selVal, isClosed };
  });

  assert('Dropdown option mousedown protects against premature blur (defaultPrevented)', mouseClickCheck.mousedownDefaultPrevented);
  assert('Dropdown option mouse click commits value to native select (OM) and closes menu',
    mouseClickCheck.selVal === 'OM' && mouseClickCheck.isClosed,
    `selVal: ${mouseClickCheck.selVal}, isClosed: ${mouseClickCheck.isClosed}`);

  // -------------------------------------------------------------------------
  // 4. Platform Selector Options
  // -------------------------------------------------------------------------
  console.log('\n▶️ [CHECK 4] Platform Selector Verification');
  const platformOptions = await page.evaluate(() => {
    const sel = document.getElementById('platform');
    return Array.from(sel.options).map(o => o.value);
  });

  const expectedPlatforms = ['Instagram Reels', 'TikTok', 'Instagram Reels & TikTok', 'Snapchat', 'YouTube Shorts'];
  const hasExpectedPlatforms = expectedPlatforms.every(p => platformOptions.includes(p));
  assert('Platform dropdown contains Instagram, TikTok, Snapchat, YouTube Shorts, and combos',
    hasExpectedPlatforms && platformOptions.length >= 8,
    `Available: ${platformOptions.join(', ')}`);

  // -------------------------------------------------------------------------
  // 5. Delivery & Publishing Date Milestone Cards
  // -------------------------------------------------------------------------
  console.log('\n▶️ [CHECK 5] Date Milestone Cards Hierarchy');
  const dateMilestones = await page.evaluate(() => {
    const cardSub = document.getElementById('card-subDate');
    const cardLive = document.getElementById('card-liveDate');
    const subDay = document.getElementById('subDay');
    const subMonth = document.getElementById('subMonth');
    const liveDay = document.getElementById('liveDay');
    const liveMonth = document.getElementById('liveMonth');

    const subCardText = cardSub ? cardSub.textContent : '';
    const liveCardText = cardLive ? cardLive.textContent : '';

    return {
      hasCardSub: !!cardSub,
      hasCardLive: !!cardLive,
      hasInputs: !!subDay && !!subMonth && !!liveDay && !!liveMonth,
      subCardTitle: subCardText.includes('تاريخ التسليم') && subCardText.includes('Draft Submission'),
      liveCardTitle: liveCardText.includes('تاريخ النشر') && liveCardText.includes('Go Live'),
      hasMilestoneBadges: subCardText.includes('مسودة المراجعة') && liveCardText.includes('النشر المباشر')
    };
  });

  assert('Milestone 1 (Submission) and Milestone 2 (Go Live) cards exist',
    dateMilestones.hasCardSub && dateMilestones.hasCardLive);
  assert('Milestone cards contain separate day inputs and month custom dropdown selectors',
    dateMilestones.hasInputs);
  assert('Milestone cards display clear titles and workflow badges',
    dateMilestones.subCardTitle && dateMilestones.liveCardTitle && dateMilestones.hasMilestoneBadges);

  // -------------------------------------------------------------------------
  // 6. Brand Header Alignment
  // -------------------------------------------------------------------------
  console.log('\n▶️ [CHECK 6] Brand Header Alignment');
  const brandCheck = await page.evaluate(() => {
    const noonEl = document.querySelector('.brand-noon');
    const hubTitle = document.querySelector('.hub-title');
    const hubTitleAr = document.querySelector('.hub-title-ar');

    const noonText = noonEl ? noonEl.textContent.trim() : '';
    const noonColor = noonEl ? window.getComputedStyle(noonEl).color : '';
    const titleColor = hubTitle ? window.getComputedStyle(hubTitle).color : '';
    const titleArColor = hubTitleAr ? window.getComputedStyle(hubTitleAr).color : '';

    return {
      noonText,
      isNoonLowercase: noonText === 'noon',
      noonColor,
      titleColor,
      titleArColor,
      isNoonYellow: noonColor === 'rgb(254, 238, 0)',
      isTitleWhite: titleColor === 'rgb(255, 255, 255)',
      isTitleArWhite: titleArColor === 'rgb(255, 255, 255)'
    };
  });

  assert('Brand name is strictly lowercase "noon"', brandCheck.isNoonLowercase, `got: "${brandCheck.noonText}"`);
  assert('Brand "noon" is rendered in official yellow (#feee00 / rgb(254, 238, 0))', brandCheck.isNoonYellow, `got: ${brandCheck.noonColor}`);
  assert('Campaign Hub title and Arabic title are rendered in clean white',
    brandCheck.isTitleWhite && brandCheck.isTitleArWhite,
    `EN: ${brandCheck.titleColor}, AR: ${brandCheck.titleArColor}`);

  // -------------------------------------------------------------------------
  // 7. Console Health
  // -------------------------------------------------------------------------
  console.log('\n▶️ [CHECK 7] Unhandled Console Errors');
  assert('Zero unhandled console errors during independent review', consoleErrors.length === 0, consoleErrors.join('; '));

  console.log('\n======================================================================');
  console.log(`📊 REVIEW SUMMARY: ${passedChecks}/${totalChecks} CHECKS PASSED (${failedChecks} FAILED)`);
  console.log('======================================================================');

  await browser.close();
  await srv.close();
  process.exit(failedChecks === 0 ? 0 : 1);
})();
