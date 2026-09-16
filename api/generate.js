const fs = require('fs');
const path = require('path');

const COUNTRIES = { QA: 'Qatar', KW: 'Kuwait', BH: 'Bahrain', OM: 'Oman' };
const MONTHS_AR = { '01':'يناير','02':'فبراير','03':'مارس','04':'أبريل','05':'مايو','06':'يونيو','07':'يوليو','08':'أغسطس','09':'سبتمبر','10':'أكتوبر','11':'نوفمبر','12':'ديسمبر' };
const MONTHS_EN = { '01':'January','02':'February','03':'March','04':'April','05':'May','06':'June','07':'July','08':'August','09':'September','10':'October','11':'November','12':'December' };

function loadData() {
  const p = path.join(process.cwd(), 'data', 'campaign-data.json');
  if (fs.existsSync(p)) {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  }
  return null;
}

function defaultCodeFor(country, c) {
  var m = c.countryDiscounts && c.countryDiscounts[country];
  if (m) { var x = (m.en || '').match(/code \(?([A-Z0-9]{3,20})\)?/); if (x) return x[1]; }
  return c.promoCode || 'PROMO15';
}

function dateStr(day, monthKey, l) {
  var m = l === 'ar' ? MONTHS_AR[monthKey] : MONTHS_EN[monthKey];
  return day ? (day + ' ' + m) : (l === 'ar' ? '[التاريخ]' : '[Date]');
}

function kpiText(kpi, l) {
  if (kpi) return l === 'ar' ? 'تحقيق <strong>' + kpi + ' مشاهدة</strong>.' : 'Achieve <strong>' + kpi + ' Views</strong>.';
  return l === 'ar' ? 'تحقيق مشاهدات تعادل 50% من إجمالي عدد متابعيك.' : 'Achieve views equivalent to 50% of your total followers.';
}

function phaseBox(phase, l, code) {
  var p = phase[l];
  if (l === 'ar') {
    return '<div style="background-color: #f8fafc; padding: 14px; margin: 12px 0; border-right: 3px solid #eab308; border-radius: 6px;">' +
      '<strong>' + p.title + '</strong><br>' + p.date + '<br><strong>الفئات:</strong> ' + p.categories + '</div>';
  }
  return '<div style="background-color: #f8fafc; padding: 14px; margin: 12px 0; border-left: 3px solid #eab308; border-radius: 6px;">' +
    '<strong>' + p.title + '</strong><br>' + p.date + '<br><strong>Categories:</strong> ' + p.categories + '</div>';
}

function discountBox(dis, code, l, STATIC) {
  var rtl = l === 'ar' ? 'border-right' : 'border-left';
  var text = dis[l] || '';
  return '<div style="background-color: #fff7ed; ' + rtl + ': 3px solid #fb923c; padding: 14px; border-radius: 6px; margin: 16px 0;">' +
    '<div style="font-size: 13px; color: #c2410c; margin-bottom: 4px; font-weight: bold;">' + (l === 'ar' ? 'كود الخصم الإلزامي' : 'Mandatory Discount Code') + '</div>' +
    '<div style="font-size: 18px; font-weight: bold; color: #ea580c; letter-spacing: 1px; margin-bottom: 6px; background-color: #ffedd5; display: inline-block; padding: 2px 10px; border-radius: 4px;">' + code + '</div>' +
    '<div style="margin-top: 4px; color: #9a3412; font-size: 14px;"><strong>' + (l === 'ar' ? 'تفاصيل العرض:' : 'Offer Details:') + '</strong><br>' + text + '</div>' +
    '<div style="margin-top: 10px; font-size: 12px; color: #b45309; border-top: 1px solid #fdba74; padding-top: 8px;"><em>' + (l === 'ar' ? STATIC.goldenRuleAr : STATIC.goldenRuleEn.replace(/\{CODE\}/g, code)) + '</em></div>' +
    '</div>';
}

function buildEmail(c, I, phase, dis, l, STATIC) {
  var inf = I.name || (l === 'ar' ? '[الاسم]' : '[Name]');
  var sub = dateStr(I.subDay, I.subMonth, l);
  var live = dateStr(I.liveDay, I.liveMonth, l);
  var fee = I.fee ? I.fee + ' AED' : (l === 'ar' ? '[المبلغ] AED' : '[Fee] AED');
  var briefTxt = l === 'ar' ? 'الدليل الإرشادي الشامل (Brief)' : 'Full Campaign Brief';
  var clickTxt = l === 'ar' ? 'اضغط هنا لبريف حملة ' + c.monthAr : 'Click Here for the ' + c.monthEn + ' Campaign Brief';
  var rtl = l === 'ar' ? 'border-right' : 'border-left';

  var hasDualBrief = !!(c.briefUrlEn && c.briefUrlAr);
  var briefBlock;
  if (hasDualBrief) {
    var lblEn = l === 'ar' ? 'البريف بالإنجليزية (Brief EN)' : 'English Brief (EN)';
    var lblAr = l === 'ar' ? 'البريف بالعربية (Brief AR)' : 'Arabic Brief (AR)';
    var clickEn = l === 'ar' ? 'اضغط هنا لفتح البريف الإنجليزي' : 'Click Here for the English Brief';
    var clickAr = l === 'ar' ? 'اضغط هنا لفتح البريف العربي' : 'Click Here for the Arabic Brief';
    briefBlock = '<div style="background-color: #f8fafc; padding: 12px; ' + rtl + ': 3px solid #64748b; border-radius: 6px; margin: 16px 0;"><strong>🔗 ' + briefTxt + ':</strong><br>' +
      (l === 'ar' ? 'يُرجى قراءة البريف المناسب للغتك بدقة قبل البدء بالتصوير لمعرفة كافة التفاصيل والرسائل المطلوبة:' : 'Please read the brief in your preferred language carefully before filming to understand all guidelines and messaging:') + '<br><br>' +
      '👉 <a href="' + c.briefUrlEn + '" style="color: #0284c7; text-decoration: none; font-weight: 500; border-bottom: 1px solid #7dd3fc;">' + clickEn + ' — ' + lblEn + '</a><br><br>' +
      '👉 <a href="' + c.briefUrlAr + '" style="color: #0284c7; text-decoration: none; font-weight: 500; border-bottom: 1px solid #7dd3fc;">' + clickAr + ' — ' + lblAr + '</a></div>';
  } else {
    briefBlock = '<div style="background-color: #f8fafc; padding: 12px; ' + rtl + ': 3px solid #64748b; border-radius: 6px; margin: 16px 0;"><strong>🔗 ' + briefTxt + ':</strong><br>' +
      (l === 'ar' ? 'يُرجى قراءة الملف التالي (باللغة الإنجليزية) بدقة قبل البدء بالتصوير لمعرفة كافة التفاصيل والرسائل المطلوبة:' : 'Please read the full detailed brief carefully before filming to understand all guidelines and messaging:') + '<br>👉 <a href="' + c.briefUrl + '" style="color: #0284c7; text-decoration: none; font-weight: 500; border-bottom: 1px solid #7dd3fc;">' + clickTxt + '</a></div>';
  }

  var o;
  if (l === 'ar') {
    o = '<strong>أهداف الحملة</strong><br>' + STATIC.objectivesAr.map(function (b) { return '• ' + b; }).join('<br>') + '<br><br>' +
      '<strong>مرحلة الحملة المخصصة لك</strong><br>' + phaseBox(phase, l) + '<br>' +
      discountBox(dis, I.code, l, STATIC) + '<br>' +
      '<strong>إرشادات المحتوى والعناصر الإلزامية</strong><br>' + STATIC.guidelinesAr.map(function (b) { return '• ' + b; }).join('<br>') + '<br><br>' +
      '<strong>المخرجات المطلوبة (Deliverables)</strong><br>• ريلز / فيديوهات قصيرة (التنسيق الأساسي)<br>• ستوري داعمة لكل فيديو<br><br>' +
      '<strong>التسليم والجدول الزمني</strong><br>نحتاج إلى استلام الفيديو بحلول <strong>' + sub + '</strong> كحد أقصى، حيث سيتم النشر في <strong>' + live + '</strong>.<br>الموافقة النهائية مطلوبة قبل النشر.<br><br>' +
      briefBlock + '<br>' +
      '<strong>تفاصيل الدفع</strong><br>قيمة الحملة: <strong>' + fee + '</strong><br><br>سيتم تحويل المبلغ إلى حسابك البنكي خلال 30 يومًا من انتهاء الحملة.<br><br>' +
      '<div style="background-color: #f0fdf4; padding: 12px; ' + rtl + ': 3px solid #22c55e; border-radius: 6px; margin: 16px 0;"><strong>🧾 الفاتورة المطلوبة:</strong><br>يُرجى إصدار فاتورتك عبر البورتال أدناه — سيتم توليد ملف الـ PDF وتسليمه لفريقنا تلقائياً، ويمكنك الاحتفاظ بنسخة من الفاتورة:<br>🔗 <a href="' + c.portalUrl + '" style="color: #166534; text-decoration: none; font-weight: bold; border-bottom: 1px solid #86efac;">بورتال فواتير نون</a></div><br>' +
      '<strong>ملاحظات هامة ومؤشرات الأداء (KPIs)</strong><br>' + STATIC.kpiAr.replace('{KPI}', kpiText(I.kpi, l)) + '<br><br>' +
      '<strong>الخطوات التالية</strong><br>يُرجى تأكيد مدى توفرك واهتمامك بالمشاركة في هذه الحملة.<br><br>إذا كان لديك أي أسئلة، لا تتردد في التواصل معنا، نحن متحمسون لرؤية إبداعك في هذه الحملة.<br><br>مع خالص التحيات،<br><strong>' + I.sender + '</strong><br>فريق تسويق نون';
  } else {
    o = '<strong>Campaign Objectives</strong><br>' + STATIC.objectivesEn.map(function (b) { return '• ' + b; }).join('<br>') + '<br><br>' +
      '<strong>Assigned Campaign Phase</strong><br>' + phaseBox(phase, l) + '<br>' +
      discountBox(dis, I.code, l, STATIC) + '<br>' +
      '<strong>Content Guidelines & Mandatory Elements</strong><br>' + STATIC.guidelinesEn.map(function (b) { return '• ' + b; }).join('<br>') + '<br><br>' +
      '<strong>Deliverables</strong><br>• Reels / Short Videos (Primary Format)<br>• Stories supporting each video<br><br>' +
      '<strong>Submission & Timeline</strong><br>We need the video by <strong>' + sub + '</strong> at the latest, as the post will go live on <strong>' + live + '</strong>.<br>Final approval is required before posting.<br><br>' +
      briefBlock + '<br>' +
      '<strong>Payment Details</strong><br>Campaign fee: <strong>' + fee + '</strong><br><br>The payment will be transferred to your bank account within 30 days after the campaign ends.<br><br>' +
      '<div style="background-color: #f0fdf4; padding: 12px; ' + rtl + ': 3px solid #22c55e; border-radius: 6px; margin: 16px 0;"><strong>🧾 Invoice Submission:</strong><br>Please generate your invoice through our portal below — your PDF is created and delivered to our team automatically, and you keep a copy:<br>🔗 <a href="' + c.portalUrl + '" style="color: #166534; text-decoration: none; font-weight: bold; border-bottom: 1px solid #86efac;">noon Invoice Portal</a></div><br>' +
      '<strong>Notes & KPIs</strong><br>' + STATIC.kpiEn.replace('{KPI}', kpiText(I.kpi, l)) + '<br><br>' +
      '<strong>Next Steps</strong><br>Please confirm your availability and interest in participating in this campaign.<br><br>If you have any questions, feel free to reach out, we\'d love to see your creative take on this campaign.<br><br>Best regards,<br><strong>' + I.sender + '</strong><br>noon Marketing Team';
  }

  var intro;
  if (l === 'ar') {
    intro = 'مرحباً <strong>' + inf + '</strong>،<br><br>نأمل أن تكون بخير ✨<br><br>يسعدنا التعاون معك في ' + c.nameAr + ' في دول الخليج (قطر، البحرين، عُمان، والكويت).<br><br>تهدف هذه الحملة إلى زيادة عمليات تثبيت تطبيق نون، واستكشاف الفئات، والمشتريات من خلال صانعي المحتوى. ستقوم بالترويج لفئات منتجات محددة بناءً على فترة الحملة المجدولة لك، وتوجيه الزيارات عبر لافتات (Banners) مخصصة داخل التطبيق.<br><br>';
  } else {
    intro = 'Hi <strong>' + inf + '</strong>,<br><br>We hope you’re doing well ✨<br><br>We’re excited to collaborate with you on the ' + c.nameEn + ' across Qatar, Bahrain, Oman, and Kuwait.<br><br>This campaign aims to drive noon app installs, category exploration, and purchases across GCC markets through influencer-generated content. You will promote specific product categories based on scheduled campaign periods, driving traffic via dedicated in-app banners.<br><br>';
  }
  return intro + o;
}

function buildBrief(c, I, phase, dis, l, STATIC) {
  var p = phase[l];
  var code = I.code;
  var angles = p.msg || '';
  var bullets = function (s) { return String(s || '').replace(/\s+•\s+/g, '<br>• '); };
  var list = function (arr) { return arr.map(function (b) { return '<li style="margin-bottom:4px;">' + b + '</li>'; }).join(''); };
  var ol = function (arr) { return arr.map(function (b) { return '<li style="margin-bottom:4px;">' + b + '</li>'; }).join(''); };
  var rule = l === 'ar' ? 'border-right' : 'border-left';
  var hashtags = c.hashtags || '';

  if (l === 'ar') {
    return '<div style="font-size:15px; font-weight:800; color:#000; margin-bottom:2px;">' + c.nameAr + '</div>' +
      '<div style="font-size:12px; font-weight:600; color:#71717a; margin-bottom:16px;">بريف المؤثر</div>' +
      '<strong style="color:#0284c7; font-size:13px;">🎯 نافذة الحملة والفئات</strong><br><br>' +
      '<div style="background-color:#f0f9ff; padding:12px; ' + rule + ':3px solid #38bdf8; border-radius:6px; margin-bottom:12px;"><strong style="color:#0c4a6e; font-size:14px;">المرحلة: ' + p.title + ' (' + p.date + ')</strong><br><br><strong style="color:#0369a1;">الفئات:</strong> <span style="color:#000">' + p.categories + '</span><br><br><strong style="color:#0369a1;">متطلبات المحتوى:</strong><div style="color:#000; margin-top:4px;">• ' + bullets(p.action) + '</div></div>' +
      '<div style="border-top:1px solid #e4e4e7; margin:14px 0"></div>' +
      '<strong style="color:#0284c7; font-size:13px;">🏆 القاعدة الذهبية — كود الخصم إلزامي</strong><br><br>' +
      '<div style="background-color:#fff7ed; padding:12px; ' + rule + ':3px solid #fb923c; border-radius:6px; margin-bottom:12px;"><div style="font-size:14px; color:#c2410c; margin-bottom:4px; font-weight:bold;">كود الخصم</div><div style="font-size:20px; font-weight:bold; color:#ea580c; letter-spacing:2px; margin-bottom:8px; display:inline-block;">' + code + '</div><div style="color:#9a3412; font-size:14px;"><strong>تفاصيل العرض:</strong><br>' + (dis.ar || '') + '</div></div>' +
      '<div style="color:#3f3f46; margin-top:8px; font-size:13px;"><em>' + STATIC.goldenRuleAr + '</em></div>' +
      '<div style="border-top:1px solid #e4e4e7; margin:14px 0"></div>' +
      '<strong style="color:#0284c7; font-size:13px;">🎨 التوجيه الإبداعي وإرشادات المحتوى</strong><br><br>' +
      '<ul style="margin:0; padding-right:20px; color:#3f3f46; font-size:13px;">' + list(STATIC.creativeAr.map(function (b) { return b.replace('{ANGLES}', angles); })) + '</ul>' +
      '<div style="border-top:1px solid #e4e4e7; margin:14px 0"></div>' +
      '<strong style="color:#0284c7; font-size:13px;">✅ عناصر إلزامية في المحتوى</strong><br><br>' +
      '<div style="color:#3f3f46; font-size:13px; margin-bottom:8px;">يجب إظهار أو ذكر ما يلي بوضوح:</div>' +
      '<ol style="margin:0; padding-right:20px; color:#3f3f46; font-size:13px;">' + ol(STATIC.mandatoryAr) + '</ol>' +
      '<div style="border-top:1px solid #e4e4e7; margin:14px 0"></div>' +
      '<strong style="color:#0284c7; font-size:13px;">🔤 الخطوط والترجمة</strong><br><br>' +
      '<div style="color:#3f3f46; font-size:13px;">' + STATIC.typographyAr + '</div>' +
      '<div style="border-top:1px solid #e4e4e7; margin:14px 0"></div>' +
      '<strong style="color:#0284c7; font-size:13px;">🎬 شاهد قبل التصوير</strong><br><br>' +
      '<div style="color:#3f3f46; font-size:13px;">لضمان قبول الفيديو من أول مسودة، لازم تشوف دليل "افعل ولا تفعل":<br>👉 <a href="' + c.guideUrl + '">اضغط هنا لمشاهدة الدليل الإبداعي</a></div>' +
      '<div style="border-top:1px solid #e4e4e7; margin:14px 0"></div>' +
      '<strong style="color:#0284c7; font-size:13px;">📌 الهاشتاقات والتاج</strong><br><br>' +
      '<div style="color:#3f3f46; font-size:13px;">• <strong>التاج والتعاون:</strong> ' + (dis.tag || '') + '<br>• <strong>الهاشتاقات:</strong> ' + hashtags + '</div>' +
      '<div style="border-top:1px solid #e4e4e7; margin:14px 0"></div>' +
      '<strong style="color:#0284c7; font-size:13px;">⏳ عملية المراجعة والموافقة</strong><br><br>' +
      '<ul style="margin:0; padding-right:20px; color:#3f3f46; font-size:13px;">' + list(STATIC.approvalAr) + '</ul>' +
      '<div style="border-top:1px solid #e4e4e7; margin:14px 0"></div>' +
      '<strong style="color:#0284c7; font-size:13px;">📦 المخرجات الإلزامية</strong><br><br>' +
      '<div style="color:#3f3f46; font-size:13px;">' + STATIC.deliverablesAr + '</div>' +
      '<div style="border-top:1px solid #e4e4e7; margin:14px 0"></div>' +
      '<strong style="color:#0284c7; font-size:13px;">📱 المنصة وتفاصيل النشر</strong><br><br>' +
      '<ul style="margin:0; padding-right:20px; color:#3f3f46; font-size:13px;"><li style="margin-bottom:4px;"><strong>المنصة المتفق عليها:</strong> ' + (I.platform || '[المنصة]') + '</li><li style="margin-bottom:4px;"><strong>TikTok:</strong> إن كانت من منصاتك، أرسل الـ Spark Code فوراً بعد النشر.</li><li style="margin-bottom:4px;"><strong>اللوجو:</strong> استخدم الشعار الرسمي فقط. <strong style="background-color: #fef08a; padding: 2px 4px; border-radius: 4px; color: #854d0e;">يجب أن يظهر اللوجو لمدة 5 ثوانٍ فقط ثم يختفي</strong>. التحميل: <a href="' + (c.logoUrl || 'https://drive.google.com/drive/folders/17Mp6al1btsHeSDRo19z6J0DLT4177JAS') + '" style="color:#0284c7; text-decoration:none; border-bottom:1px solid #7dd3fc;">لينك Google Drive</a></li><li><strong>الكابشن والهاشتاق:</strong> يُرسلان لك بعد الموافقة — لا تكتبهما بنفسك.</li></ul>';
  }

  return '<div style="font-size:15px; font-weight:800; color:#000; margin-bottom:2px;">' + c.nameEn + '</div>' +
    '<div style="font-size:12px; font-weight:600; color:#71717a; margin-bottom:16px; text-transform:uppercase; letter-spacing:1px;">Influencer Brief</div>' +
    '<strong style="color:#0284c7; font-size:13px; text-transform:uppercase;">🎯 CAMPAIGN WINDOW & CATEGORIES</strong><br><br>' +
    '<div style="background-color:#f0f9ff; padding:12px; ' + rule + ':3px solid #38bdf8; border-radius:6px; margin-bottom:12px;"><strong style="color:#0c4a6e; font-size:14px;">Phase: ' + p.title + ' (' + p.date + ')</strong><br><br><strong style="color:#0369a1;">Categories:</strong> <span style="color:#000">' + p.categories + '</span><br><br><strong style="color:#0369a1;">Content Requirements:</strong><div style="color:#000; margin-top:4px;">• ' + bullets(p.action) + '</div></div>' +
    '<div style="border-top:1px solid #e4e4e7; margin:14px 0"></div>' +
    '<strong style="color:#0284c7; font-size:13px; text-transform:uppercase;">🏆 THE GOLDEN RULE — DISCOUNT CODE MANDATE</strong><br><br>' +
    '<div style="background-color:#fff7ed; padding:12px; ' + rule + ':3px solid #fb923c; border-radius:6px; margin-bottom:12px;"><div style="font-size:14px; color:#c2410c; margin-bottom:4px; font-weight:bold; text-transform:uppercase;">Discount Code</div><div style="font-size:20px; font-weight:bold; color:#ea580c; letter-spacing:2px; margin-bottom:8px; display:inline-block;">' + code + '</div><div style="color:#9a3412; font-size:14px;"><strong>Offer Details:</strong><br>' + (dis.en || '') + '</div></div>' +
    '<div style="color:#3f3f46; margin-top:8px; font-size:13px;">' + STATIC.goldenRuleEn.replace(/\{CODE\}/g, code) + '</div>' +
    '<div style="border-top:1px solid #e4e4e7; margin:14px 0"></div>' +
    '<strong style="color:#0284c7; font-size:13px; text-transform:uppercase;">🎨 CREATIVE DIRECTION & CONTENT GUIDELINES</strong><br><br>' +
    '<ul style="margin:0; padding-left:20px; color:#3f3f46; font-size:13px;">' + list(STATIC.creativeEn.map(function (b) { return b.replace('{ANGLES}', angles); })) + '</ul>' +
    '<div style="border-top:1px solid #e4e4e7; margin:14px 0"></div>' +
    '<strong style="color:#0284c7; font-size:13px; text-transform:uppercase;">✅ MANDATORY ELEMENTS IN CONTENT</strong><br><br>' +
    '<div style="color:#3f3f46; font-size:13px; margin-bottom:8px;">Influencers must clearly show or mention:</div>' +
    '<ol style="margin:0; padding-left:20px; color:#3f3f46; font-size:13px;">' + ol(STATIC.mandatoryEn) + '</ol>' +
    '<div style="border-top:1px solid #e4e4e7; margin:14px 0"></div>' +
    '<strong style="color:#0284c7; font-size:13px; text-transform:uppercase;">🔤 TYPOGRAPHY & SUBTITLES</strong><br><br>' +
    '<div style="color:#3f3f46; font-size:13px;">' + STATIC.typographyEn + '</div>' +
    '<div style="border-top:1px solid #e4e4e7; margin:14px 0"></div>' +
    '<strong style="color:#0284c7; font-size:13px; text-transform:uppercase;">🎬 WATCH BEFORE FILMING</strong><br><br>' +
    '<div style="color:#3f3f46; font-size:13px;">To ensure the video gets approved from the first draft, you must watch this "Do\'s & Don\'ts" guide:<br>👉 <a href="' + c.guideUrl + '">Click Here to Watch the Creative Guide</a></div>' +
    '<div style="border-top:1px solid #e4e4e7; margin:14px 0"></div>' +
    '<strong style="color:#0284c7; font-size:13px; text-transform:uppercase;">📌 HASHTAGS & TAGS</strong><br><br>' +
    '<div style="color:#3f3f46; font-size:13px;">• <strong>Tag & Collab:</strong> ' + (dis.tag || '') + '<br>• <strong>Hashtags:</strong> ' + hashtags + '</div>' +
    '<div style="border-top:1px solid #e4e4e7; margin:14px 0"></div>' +
    '<strong style="color:#0284c7; font-size:13px; text-transform:uppercase;">⏳ REVIEW & APPROVAL PROCESS</strong><br><br>' +
    '<ul style="margin:0; padding-left:20px; color:#3f3f46; font-size:13px;">' + list(STATIC.approvalEn) + '</ul>' +
    '<div style="border-top:1px solid #e4e4e7; margin:14px 0"></div>' +
    '<strong style="color:#0284c7; font-size:13px; text-transform:uppercase;">📦 MANDATORY DELIVERABLES</strong><br><br>' +
    '<div style="color:#3f3f46; font-size:13px;">' + STATIC.deliverablesEn + '</div>' +
    '<div style="border-top:1px solid #e4e4e7; margin:14px 0"></div>' +
    '<strong style="color:#0284c7; font-size:13px; text-transform:uppercase;">📱 PLATFORM & POSTING DETAILS</strong><br><br>' +
    '<ul style="margin:0; padding-left:20px; color:#3f3f46; font-size:13px;"><li style="margin-bottom:4px;"><strong>Agreed Platform(s):</strong> ' + (I.platform || '[Platform]') + '</li><li style="margin-bottom:4px;"><strong>TikTok:</strong> If applicable, provide the Spark Code immediately after posting.</li><li style="margin-bottom:4px;"><strong>Logo:</strong> Use ONLY the official logo. <strong style="background-color: #fef08a; padding: 2px 4px; border-radius: 4px; color: #854d0e;">The logo must appear for ONLY 5 seconds and then disappear</strong>. Download: <a href="' + (c.logoUrl || 'https://drive.google.com/drive/folders/17Mp6al1btsHeSDRo19z6J0DLT4177JAS') + '" style="color:#0284c7; text-decoration:none; border-bottom:1px solid #7dd3fc;">Google Drive Link</a></li><li><strong>Captions & Tags:</strong> Will be provided AFTER approval. Do NOT write your own.</li></ul>';
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch(e) {}
  }
  body = body || {};

  const data = loadData();
  if (!data) return res.status(500).json({ error: 'Data not found' });

  const { static: STATIC, campaigns } = data;
  const campaignId = body.campaignId;
  const c = (campaigns || []).filter(x => x.id === campaignId)[0] || campaigns[0];
  if (!c) return res.status(404).json({ error: 'Campaign not found' });

  const country = body.country || 'QA';
  const I = {
    name: body.name || '',
    country: country,
    code: body.code || defaultCodeFor(country, c),
    phaseIx: parseInt(body.phaseIx || '0', 10),
    platform: body.platform || '',
    subDay: body.subDay || '',
    subMonth: body.subMonth || '01',
    liveDay: body.liveDay || '',
    liveMonth: body.liveMonth || '01',
    fee: body.fee || '',
    kpi: body.kpi || '',
    sender: body.sender || c.sender || 'Mahmoud'
  };

  const dis = (c.countryDiscounts && c.countryDiscounts[country]) || {};
  const phase = (c.phases && c.phases[I.phaseIx]) || (c.phases && c.phases[0]) || { en: {}, ar: {} };

  const subjectEn = c.nameEn + ' | Collaboration Opportunity – ' + (COUNTRIES[country] || '');
  const subjectAr = c.nameAr;
  const briefSubjectEn = c.nameEn + ' — Influencer Brief';
  const briefSubjectAr = c.nameAr + ' — بريف المؤثر';

  const emailEn = buildEmail(c, I, phase, dis, 'en', STATIC);
  const emailAr = buildEmail(c, I, phase, dis, 'ar', STATIC);
  const briefEn = buildBrief(c, I, phase, dis, 'en', STATIC);
  const briefAr = buildBrief(c, I, phase, dis, 'ar', STATIC);

  res.status(200).json({
    success: true,
    subjects: {
      'email-en': subjectEn,
      'email-ar': subjectAr,
      'brief-en': briefSubjectEn,
      'brief-ar': briefSubjectAr
    },
    emailEn,
    emailAr,
    briefEn,
    briefAr
  });
};
