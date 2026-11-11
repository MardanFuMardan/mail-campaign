// mail-campaign/tests/verify-logic-vm.js
/**
 * Ultra-Fast Zero-Dependency Node VM Logic Verifier
 * Validates campaign data structures, 6 phases of November 2026,
 * coupon isolation rules, SSR bootstrap hydration, and server generator-core parity.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { generateAllOutputs } = require('../api/_lib/generator-core');

function runVmLogicVerification() {
  const startTime = Date.now();
  console.log('===============================================================');
  console.log('⚡ NOON CAMPAIGN HUB — NODE VM LOGIC INTEGRITY VERIFIER');
  console.log('===============================================================\n');

  const htmlPath = path.resolve(__dirname, '../api/_private/hub.html');
  const dataPath = path.resolve(__dirname, '../api/_private/campaign-data.json');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const rawData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

  const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/i);
  if (!scriptMatch) {
    throw new Error('No <script> tag found in ' + htmlPath);
  }

  const domState = {};
  function createMockElement(id) {
    return {
      id,
      value: '',
      innerHTML: '',
      textContent: '',
      style: {},
      classList: {
        add: () => {},
        remove: () => {},
        contains: () => false
      },
      children: [],
      querySelectorAll: () => [],
      querySelector: () => null,
      addEventListener: () => {}
    };
  }

  const mockDoc = {
    getElementById: (id) => domState[id] || (domState[id] = createMockElement(id)),
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {}
  };

  const mockStorage = {
    _data: {},
    getItem: (k) => mockStorage._data[k] || null,
    setItem: (k, v) => { mockStorage._data[k] = String(v); },
    removeItem: (k) => { delete mockStorage._data[k]; },
    clear: () => { mockStorage._data = {}; }
  };

  const mockWin = {
    location: { pathname: '/', search: '' },
    addEventListener: () => {},
    localStorage: mockStorage,
    __NOON_BOOTSTRAP__: {
      static: rawData.static,
      campaigns: rawData.campaigns,
      isAdmin: false,
      openAdmin: false
    }
  };

  const context = vm.createContext({
    document: mockDoc,
    window: mockWin,
    localStorage: mockStorage,
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    console: {
      log: () => {},
      warn: () => {},
      error: () => {}
    },
    parseInt,
    parseFloat,
    Math,
    encodeURIComponent,
    decodeURIComponent,
    String,
    Array,
    Object,
    RegExp,
    Date,
    JSON,
    setTimeout: (fn) => setTimeout(fn, 0),
    clearTimeout: (t) => clearTimeout(t)
  });

  vm.runInContext(scriptMatch[1], context);

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  console.log('▶️ Checking Campaign Seed Structures...');
  assert(typeof context.seedCampaigns === 'function', 'seedCampaigns function is defined in script');
  const seeds = context.seedCampaigns();
  assert(Array.isArray(seeds) && seeds.length >= 5, `seedCampaigns returns array with ${seeds.length} campaigns`);

  const nov = seeds.find(s => s.id === 'nov2026');
  assert(!!nov, 'nov2026 campaign exists in seeds');
  assert(nov && nov.phases && nov.phases.length === 6, `nov2026 contains exactly 6 phases (found: ${nov ? nov.phases.length : 0})`);

  console.log('\n▶️ Checking Coupon Isolation & Phase Rules for November 2026...');
  assert(nov.phases[0].promoCode === 'PROMO15', 'Phase 1 promoCode is PROMO15');
  assert(!nov.phases[0].secondaryCode, 'Phase 1 secondaryCode is null or empty');

  assert(nov.phases[1].promoCode === '1111SALE', 'Phase 2 promoCode is 1111SALE');
  assert(nov.phases[1].secondaryCode === 'B1G1', 'Phase 2 secondaryCode is B1G1');

  assert(nov.phases[2].promoCode === 'PROMO15', 'Phase 3 promoCode is PROMO15');
  assert(nov.phases[2].secondaryCode === 'YFS2026', 'Phase 3 secondaryCode is YFS2026 hype');

  assert(nov.phases[3].promoCode === 'PROMO15', 'Phase 4 promoCode is PROMO15');
  assert(nov.phases[3].secondaryCode === 'YFS2026', 'Phase 4 secondaryCode is YFS2026 hype');

  assert(nov.phases[4].promoCode === 'YFS2026', 'Phase 5 promoCode is YFS2026');
  assert(!nov.phases[4].secondaryCode, 'Phase 5 secondaryCode is null (PROMO15 strictly absent)');

  assert(nov.phases[5].promoCode === 'YFS2026', 'Phase 6 promoCode is YFS2026');
  assert(!nov.phases[5].secondaryCode, 'Phase 6 secondaryCode is null (PROMO15 strictly absent)');

  console.log('\n▶️ Checking GCC Country Discount Currencies and Limits...');
  const countries = ['QA', 'KW', 'BH', 'OM'];
  for (const country of countries) {
    const p1Dis = nov.phases[0].countryDiscounts[country];
    assert(!!p1Dis && !!p1Dis.en && !!p1Dis.ar, `Country ${country} has bilingual discounts in Phase 1`);
    assert(p1Dis.en.includes('15%'), `Country ${country} Phase 1 mentions 15% discount`);
  }

  console.log('\n▶️ Checking defaultCodeFor Helper Resolution...');
  for (let i = 0; i < 6; i++) {
    const codeQA = context.defaultCodeFor('QA', nov, i);
    const expected = (i === 1) ? '1111SALE' : (i >= 4) ? 'YFS2026' : 'PROMO15';
    assert(codeQA === expected, `defaultCodeFor Phase ${i + 1} resolves to ${expected} (got: ${codeQA})`);
  }

  console.log('\n▶️ Checking Content Generators & Server Parity...');
  const dummyInput = {
    name: 'Ahmed Test',
    country: 'QA',
    code: 'TESTCODE',
    phaseIx: 1,
    platform: 'Instagram Reels',
    subDay: '5',
    subMonth: '11',
    liveDay: '10',
    liveMonth: '11',
    fee: '500',
    kpi: '50K',
    sender: 'Mahmoud'
  };
  const phase1 = nov.phases[1];
  const disQA = phase1.countryDiscounts['QA'];

  const emailEn = context.buildEmail(nov, dummyInput, phase1, disQA, 'en');
  assert(typeof emailEn === 'string' && emailEn.length > 500, `buildEmail (EN) produces populated HTML (${emailEn.length} chars)`);
  assert(emailEn.includes('Ahmed Test'), 'buildEmail contains influencer name');
  assert(emailEn.includes('TESTCODE'), 'buildEmail contains custom code');

  const emailAr = context.buildEmail(nov, dummyInput, phase1, disQA, 'ar');
  assert(typeof emailAr === 'string' && emailAr.length > 500, `buildEmail (AR) produces populated HTML (${emailAr.length} chars)`);
  assert(emailAr.includes('Ahmed Test'), 'buildEmail (AR) contains influencer name');

  const briefEn = context.buildBrief(nov, dummyInput, phase1, disQA, 'en');
  assert(typeof briefEn === 'string' && briefEn.length > 500, `buildBrief (EN) produces populated HTML (${briefEn.length} chars)`);

  const briefAr = context.buildBrief(nov, dummyInput, phase1, disQA, 'ar');
  assert(typeof briefAr === 'string' && briefAr.length > 500, `buildBrief (AR) produces populated HTML (${briefAr.length} chars)`);

  const briefTxtAr = context.buildBriefTextHtml(nov, dummyInput, phase1, disQA, 'ar');
  assert(typeof briefTxtAr === 'string' && briefTxtAr.length > 300, `buildBriefTextHtml (AR) produces populated text (${briefTxtAr.length} chars)`);

  const serverOut = generateAllOutputs(rawData, {
    campaignId: 'nov2026',
    name: 'Ahmed Test',
    country: 'QA',
    code: 'TESTCODE',
    phaseIx: 1,
    platform: 'Instagram Reels',
    subDay: '5',
    subMonth: '11',
    liveDay: '10',
    liveMonth: '11',
    fee: '500',
    kpi: '50K',
    sender: 'Mahmoud'
  });
  assert(
    serverOut &&
    serverOut.emailEn === emailEn &&
    serverOut.emailAr === emailAr &&
    serverOut.briefEn === briefEn &&
    serverOut.briefAr === briefAr,
    'api/_lib/generator-core.js output matches client VM generators 100% byte-for-byte'
  );

  console.log('\n▶️ Checking Dubai Mall Online Launch Campaign (UAE Only & Optional Promo Code)...');
  const dm = seeds.find(s => s.id === 'dubaiMall2026');
  assert(!!dm, 'dubaiMall2026 campaign exists in seeds');
  assert(dm && dm.market === 'UAE', 'dubaiMall2026 market is UAE');
  assert(dm && Array.isArray(dm.countries) && dm.countries.length === 1 && dm.countries[0] === 'AE', 'dubaiMall2026 restricts countries strictly to [AE]');
  assert(dm && dm.optionalPromo === true && dm.brandProfile === 'dubai_mall', 'dubaiMall2026 uses optionalPromo=true and brandProfile=dubai_mall');
  assert(dm && Array.isArray(dm.phases) && dm.phases.length === 2, 'dubaiMall2026 contains 2 creative tracks (Physical & Digital)');
  assert(context.defaultCodeFor('AE', dm, 0) === '' && context.defaultCodeFor('AE', dm, 1) === '', 'defaultCodeFor returns empty string for optionalPromo campaign');

  const dmEmptyInput = {
    name: 'Salma Test',
    country: 'AE',
    code: '',
    phaseIx: 0,
    platform: 'Instagram Reels',
    subDay: '12',
    subMonth: '05',
    liveDay: '18',
    liveMonth: '05',
    fee: '3500',
    kpi: '80K',
    sender: 'Mahmoud'
  };
  const dmP0 = dm.phases[0];
  const dmDis0 = (dmP0.countryDiscounts && dmP0.countryDiscounts.AE) || (dm.countryDiscounts && dm.countryDiscounts.AE) || {};
  const dmEmailEn0 = context.buildEmail(dm, dmEmptyInput, dmP0, dmDis0, 'en');
  const dmEmailAr0 = context.buildEmail(dm, dmEmptyInput, dmP0, dmDis0, 'ar');
  const dmBriefEn0 = context.buildBrief(dm, dmEmptyInput, dmP0, dmDis0, 'en');
  const dmBriefAr0 = context.buildBrief(dm, dmEmptyInput, dmP0, dmDis0, 'ar');
  const dmTxtEn0 = context.buildBriefText(dm, dmEmptyInput, dmP0, dmDis0, 'en');
  const dmTxtAr0 = context.buildBriefText(dm, dmEmptyInput, dmP0, dmDis0, 'ar');

  const dmServer0 = generateAllOutputs(rawData, {
    campaignId: 'dubaiMall2026',
    name: 'Salma Test',
    country: 'AE',
    code: '',
    phaseIx: 0,
    platform: 'Instagram Reels',
    subDay: '12',
    subMonth: '05',
    liveDay: '18',
    liveMonth: '05',
    fee: '3500',
    kpi: '80K',
    sender: 'Mahmoud'
  });

  assert(
    dmServer0 &&
    dmServer0.emailEn === dmEmailEn0 &&
    dmServer0.emailAr === dmEmailAr0 &&
    dmServer0.briefEn === dmBriefEn0 &&
    dmServer0.briefAr === dmBriefAr0 &&
    dmServer0.briefTxtEn === dmTxtEn0 &&
    dmServer0.briefTxtAr === dmTxtAr0,
    'dubaiMall2026 Phase 1 (empty promo) matches server generator-core.js 100% byte-for-byte'
  );

  const emptyPromoAll = [dmEmailEn0, dmEmailAr0, dmBriefEn0, dmBriefAr0, dmTxtEn0, dmTxtAr0].join('\n');
  assert(
    !emptyPromoAll.includes('{CODE}') &&
    !emptyPromoAll.includes('PROMO15') &&
    !emptyPromoAll.includes('[ضع الكود هنا]') &&
    !emptyPromoAll.includes('[put the code here]') &&
    !emptyPromoAll.includes('الكرتونة') &&
    !dmEmailEn0.includes('Discount Code') &&
    !dmBriefEn0.includes('CAMPAIGN PROMO CODE'),
    'dubaiMall2026 with empty code omits all promo sections, placeholders, and noon box references'
  );
  assert(
    dmEmailEn0.includes('3500 AED') &&
    dmEmailEn0.includes('@thedubaimall') &&
    dmBriefEn0.includes('00:03') &&
    dmBriefEn0.includes('5 seconds') &&
    dmBriefEn0.includes('Come Spend the Day at Dubai Mall With Me') &&
    dmBriefEn0.includes('The 10,000 Step Fatigue') &&
    dmBriefAr0.includes('يُمنع ذكر أو منشن أو تسمية'),
    'dubaiMall2026 Phase 1 includes AED fee, @thedubaimall, 5s logo rule, tenant exclusion & Part 1 concepts'
  );

  // Part 2 + custom optional promo code
  const dmPromoInput = {
    name: 'Mariam Test',
    country: 'AE',
    code: 'DXB15',
    phaseIx: 1,
    platform: 'TikTok',
    subDay: '14',
    subMonth: '06',
    liveDay: '20',
    liveMonth: '06',
    fee: '4200',
    kpi: '',
    sender: 'Sara'
  };
  const dmP1 = dm.phases[1];
  const dmDis1 = (dmP1.countryDiscounts && dmP1.countryDiscounts.AE) || (dm.countryDiscounts && dm.countryDiscounts.AE) || {};
  const dmEmailEn1 = context.buildEmail(dm, dmPromoInput, dmP1, dmDis1, 'en');
  const dmEmailAr1 = context.buildEmail(dm, dmPromoInput, dmP1, dmDis1, 'ar');
  const dmBriefEn1 = context.buildBrief(dm, dmPromoInput, dmP1, dmDis1, 'en');
  const dmBriefAr1 = context.buildBrief(dm, dmPromoInput, dmP1, dmDis1, 'ar');
  const dmTxtEn1 = context.buildBriefText(dm, dmPromoInput, dmP1, dmDis1, 'en');
  const dmTxtAr1 = context.buildBriefText(dm, dmPromoInput, dmP1, dmDis1, 'ar');

  const dmServer1 = generateAllOutputs(rawData, {
    campaignId: 'dubaiMall2026',
    name: 'Mariam Test',
    country: 'AE',
    code: 'DXB15',
    phaseIx: 1,
    platform: 'TikTok',
    subDay: '14',
    subMonth: '06',
    liveDay: '20',
    liveMonth: '06',
    fee: '4200',
    kpi: '',
    sender: 'Sara'
  });

  assert(
    dmServer1 &&
    dmServer1.emailEn === dmEmailEn1 &&
    dmServer1.emailAr === dmEmailAr1 &&
    dmServer1.briefEn === dmBriefEn1 &&
    dmServer1.briefAr === dmBriefAr1 &&
    dmServer1.briefTxtEn === dmTxtEn1 &&
    dmServer1.briefTxtAr === dmTxtAr1,
    'dubaiMall2026 Phase 2 (custom code DXB15) matches server generator-core.js 100% byte-for-byte'
  );
  assert(
    dmEmailEn1.includes('DXB15') &&
    dmEmailAr1.includes('DXB15') &&
    dmBriefEn1.includes('DXB15') &&
    dmBriefAr1.includes('DXB15') &&
    dmTxtEn1.includes('DXB15') &&
    dmTxtAr1.includes('DXB15') &&
    dmBriefEn1.includes('ChatGPT') &&
    dmBriefEn1.includes('The Lazy Weekend Scroll'),
    'dubaiMall2026 Phase 2 renders custom promo code DXB15 across all 6 panes and includes Part 2 concepts + ChatGPT'
  );

  // Disallowed country QA coerced to AE
  const dmServerCoerced = generateAllOutputs(rawData, {
    campaignId: 'dubaiMall2026',
    name: 'Laila Test',
    country: 'QA',
    code: '',
    phaseIx: 0,
    platform: 'Instagram Reels',
    subDay: '5',
    subMonth: '05',
    liveDay: '8',
    liveMonth: '05',
    fee: '2000',
    kpi: '',
    sender: ''
  });
  assert(
    dmServerCoerced &&
    dmServerCoerced.subjects['email-en'].includes('United Arab Emirates') &&
    !dmServerCoerced.emailEn.includes('Qatar') &&
    !dmServerCoerced.emailEn.includes('@noon_qar'),
    'dubaiMall2026 rejects/normalizes non-UAE country QA strictly to United Arab Emirates (AE)'
  );

  const elapsed = Date.now() - startTime;
  console.log('\n===============================================================');
  console.log(`📊 NODE VM RESULTS: ${passed} PASSED, ${failed} FAILED in ${elapsed}ms`);
  console.log('===============================================================');

  if (failed > 0) {
    throw new Error(`${failed} VM logic assertions failed!`);
  }

  return { passed, failed, elapsed };
}

if (require.main === module) {
  try {
    runVmLogicVerification();
    process.exit(0);
  } catch (err) {
    console.error('Fatal error in VM Logic Verifier:', err);
    process.exit(1);
  }
}

module.exports = { runVmLogicVerification };
