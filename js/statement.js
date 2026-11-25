/* =====================================================================
   كشوف حساب الموردين PDF — تفصيلي / مختصر / إجمالي
   - محرك حسابات واحد (buildStatement) للأنواع التلاتة: نفس الحركات ونفس الأرصدة
   - كل الحسابات بالقرش وبنفس قواعد رصيد المورد في التطبيق:
       الفاتورة دائن (بتزود المستحق للمورد) — الدفعة/المرتجع/الخصم مدين (بتقلله)
       الشيك المرتد مش بيتحسب — الشيك اللي لسه ما اتصرفش محسوب مدفوع من يوم كتابته
   - الكشف الكامل بيشمل كل الحركات حتى لو تاريخها بعد النهارده (ومكتوب كده في الكشف)،
     عشان رصيده يطابق رصيد المورد في التطبيق
   - PDF حقيقي (PDFKit + خط Cairo جوه الملف)، والمعاينة بتعرض نفس الملف (pdf.js)
   - الكشف مش بيسجل أي حركة في قاعدة البيانات
   ===================================================================== */

const STMT_OPTS_KEY = 'mawredin_stmt_opts';
const ST_DEF = {mode:'full', kind:'detail', imgs:false, from:'', to:''};
const stOpts = () => { try{ return Object.assign({}, ST_DEF, JSON.parse(localStorage.getItem(STMT_OPTS_KEY) || '{}')); }catch(e){ return {...ST_DEF}; } };
const saveStOpts = o => { try{ localStorage.setItem(STMT_OPTS_KEY, JSON.stringify(o)); }catch(e){} };
const cents = v => Math.round(Number(v || 0) * 100);
const fmt2 = c => (c < 0 ? '-' : '') + (Math.abs(c) / 100).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
const dmy = d => { if(!d) return ''; const [y, m, dd] = String(d).slice(0,10).split('-'); return `${dd}/${m}/${y}`; };
const PAY_AR = {cash:'نقدي', check:'شيك', transfer:'تحويل بنكي', return:'مرتجع', discount:'خصم'};
const KIND_AR = {detail:'تفصيلي', brief:'مختصر', total:'إجمالي'};
const balDir = c => c > 0 ? 'مستحق للمورد' : c < 0 ? 'رصيد لصالح المحل' : 'مسدد';

/* ---------- محرك الحسابات (واحد للأنواع التلاتة) ---------- */
function buildStatement(sid, opt){
  if(!store.ready || !hasLocalData()) throw Object.assign(new Error('البيانات لسه ما اتحمّلتش على الجهاز — اتصل بالنت وجرّب تاني'), {retry:true});
  const s = supplierBalances().find(x => String(x.id) === String(sid));
  if(!s) throw Object.assign(new Error('المورد ده مش موجود على الجهاز (ممكن يكون اتمسح) — ارجع لقائمة الموردين'), {retry:false});
  const invs = [...store.eff.invoices.values()].filter(i => String(i.supplier_id) === String(sid));
  const pays = [...store.eff.payments.values()].filter(p => String(p.supplier_id) === String(sid));
  const today_ = today();
  const range = opt.mode === 'range';
  const from = range ? opt.from : '', to = range ? opt.to : '';      // الكامل: من غير حد أعلى
  const all = [
    ...invs.map(x => ({k:'inv', id:x.id, d:String(x.inv_date).slice(0,10), c:String(x.created_at || ''), x,
      doc: x.inv_no || ('ف ' + x.id), type:'فاتورة', desc:['فاتورة مشتريات', x.notes].filter(Boolean).join(' - '), cr:cents(x.amount), dr:0})),
    ...pays.filter(p => !CHK_PART(p)).map(p => ({k:'pay', id:p.id, d:String(p.pay_date).slice(0,10), c:String(p.created_at || ''), x:p,
      doc: p.method === 'check' ? (p.check_no || ('ش ' + p.id)) : ((IS_ADJ(p.method) ? 'م ' : 'د ') + p.id),
      type: IS_ADJ(p.method) ? PAY_AR[p.method] : 'دفعة', desc: payDesc(p, invs), cr:0, dr:cents(p.amount)})),
    // سطر معلومة للشيك نفسه (قيمته والمدفوع والباقي) — مبيأثرش على الرصيد
    ...pays.filter(CHK_PART).map(p => ({k:'chk', id:p.id, d:String(p.pay_date).slice(0,10), c:String(p.created_at || ''), x:p,
      doc: p.check_no || ('ش ' + p.id), type:'شيك', desc:`شيك ${p.check_no || ''}${p.due_date ? ' يستحق ' + dmy(p.due_date) : ''} - ${chkSummary(p)} - بيتخصم المدفوع منه بس`, cr:0, dr:0})),
    // شيك لسه أو مرتد/ملغي/مستبدل: اللي اتسدد منه فعلًا بس، كل دفعة بتاريخها
    ...pays.filter(CHK_PART).flatMap(p => checkInfo(p).live.map(c => ({k:'cp', id:c.id, d:String(c.pay_date).slice(0,10), c:String(c.created_at || ''), x:c,
      doc: p.check_no || ('ش ' + p.id), type:'سداد شيك',
      desc: [`سداد من شيك ${p.check_no || ''} (${chkSummary(p)})`, CP_METHOD[c.method], c.account, c.ref_no ? 'مرجع ' + c.ref_no : '', c.notes].filter(Boolean).join(' - '), cr:0, dr:cents(c.amount)}))),
  ].sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : (a.c < b.c ? -1 : a.c > b.c ? 1 : (a.k === b.k ? a.id - b.id : (a.k === 'inv' ? -1 : 1))));
  const inR = d => (!from || d >= from) && (!to || d <= to);
  const before = all.filter(e => from && e.d < from);
  const rows = all.filter(e => inR(e.d));
  const opening = before.reduce((a, e) => a + e.cr - e.dr, 0);
  let run = opening;
  rows.forEach((e, i) => { run += e.cr - e.dr; e.run = run; e.n = i + 1; });
  const pick = f => rows.filter(f), sumOf = l => l.reduce((a, e) => a + e.cr + e.dr, 0);
  const lInv = pick(e => e.k === 'inv'), lPay = pick(e => (e.k === 'pay' && !IS_ADJ(e.x.method)) || e.k === 'cp'), lRet = pick(e => e.k === 'pay' && e.x.method === 'return'), lDisc = pick(e => e.k === 'pay' && e.x.method === 'discount');
  const T = {opening, inv:sumOf(lInv), pay:sumOf(lPay), ret:sumOf(lRet), disc:sumOf(lDisc), other:0,
    nInv:lInv.length, nPay:lPay.length, nRet:lRet.length, nDisc:lDisc.length};
  T.cr = rows.reduce((a, e) => a + e.cr, 0); T.dr = rows.reduce((a, e) => a + e.dr, 0);
  T.closing = opening + T.cr - T.dr;
  const pendChecks = pays.filter(p => p.method === 'check' && p.check_status === 'pending' && inR(String(p.pay_date).slice(0,10)));
  const bounced = pays.filter(p => p.method === 'check' && CHK_DEAD(p.check_status) && inR(String(p.pay_date).slice(0,10)));
  const future = rows.filter(e => e.d > today_);
  const pendOps = store.queue.filter(o => (o.table === 'invoices' || o.table === 'payments') && (o.status === 'pending' || o.status === 'sending') &&
    String((o.row || o.changes || {}).supplier_id ?? (o.base || {}).supplier_id ?? store.eff[o.table]?.get(o.key)?.supplier_id) === String(sid));
  const st = {s, rows, T, from, to, today:today_, opt, pendChecks, bounced, future, pendOps, issuer: who(me?.email),
    ref:`ST-${s.id}-${today_.replace(/-/g, '')}-${new Date().toTimeString().slice(0,5).replace(':', '')}`,
    local: !sync.online || !navigator.onLine || pendOps.length > 0 || store.queue.some(o => o.status === 'pending' || o.status === 'sending')};
  st.period = range ? `من ${dmy(from)} إلى ${dmy(to)}` : `من بداية التعامل حتى ${dmy(today_)}`;
  st.audit = auditStatement(st, invs, pays, all);
  return st;
}
function payDesc(p, invs){
  const parts = [p.method === 'check' ? 'دفعة بشيك' : IS_ADJ(p.method) ? (p.method === 'return' ? 'مرتجع بضاعة' : 'خصم من المورد') : 'دفعة ' + PAY_AR[p.method]];
  if(p.method === 'check'){
    if(p.check_no) parts.push('رقم ' + p.check_no);
    if(p.bank) parts.push(p.bank);
    if(p.due_date) parts.push('استحقاق ' + dmy(p.due_date));
    const ci = checkInfo(p);
    parts.push(CHK_PAY[ci.pay] + (ci.pay === 'partial' ? ` - اتسدد ${fmt2(ci.settled)} وباقي ${fmt2(ci.remaining)}` : ''));
  }
  if(p.invoice_id){ const i = invs.find(x => x.id === p.invoice_id); if(i) parts.push('عن فاتورة ' + (i.inv_no || dmy(i.inv_date))); }
  if(p.notes) parts.push(p.notes);
  return parts.join(' - ');
}
// المراجعة المحاسبية (من غير ما نعدّل أي بيانات)
function auditStatement(st, invs, pays, all){
  const {s, rows, T, from, to} = st, out = [], ok = (c, t, d) => out.push({ok:!!c, t, d});
  ok(invs.every(i => String(i.supplier_id) === String(s.id)) && pays.every(p => String(p.supplier_id) === String(s.id)), 'كل الحركات تخص المورد ده');
  const ids = all.map(e => e.k + e.id); ok(new Set(ids).size === ids.length, 'مفيش حركة مكررة');
  ok(T.cr === T.inv, 'مجموع الفواتير = مجموع الدائن', `${fmt2(T.inv)}`);
  ok(T.dr === T.pay + T.ret + T.disc + T.other, 'المدفوعات + المرتجعات + الخصومات = مجموع المدين', `${fmt2(T.dr)}`);
  const lastRun = rows.length ? rows[rows.length - 1].run : T.opening;
  ok(lastRun === T.closing, 'الرصيد التراكمي في آخر سطر = الرصيد الختامي', `${fmt2(T.closing)}`);
  const indep = all.filter(e => !to || e.d <= to).reduce((a, e) => a + e.cr - e.dr, 0);
  ok(indep === T.closing, 'الرصيد الختامي = حساب مستقل لكل الحركات لحد آخر الفترة');
  if(!to) ok(cents(s.balance) === T.closing, 'الرصيد الختامي = رصيد المورد في التطبيق', `${fmt2(cents(s.balance))}`);
  ok(!from || !to || from <= to, 'تاريخ البداية قبل تاريخ النهاية');
  const nb = pays.filter(CHK_PART).length;
  ok(true, nb ? `${nb} شيك (لسه أو مرتد/ملغي) محسوب منه المسدد فعليًا بس` : 'كل الشيكات اتصرفت');
  // كل شيك: المتبقي = القيمة - المسدد، والمسدد مايعديش القيمة
  const chks = pays.filter(p => p.method === 'check'), badC = chks.filter(p => { const i = checkInfo(p); return i.paidRows > i.orig || i.remaining < 0 || (p.check_status === 'pending' && i.orig - i.settled !== i.remaining); });
  ok(!badC.length, 'سداد كل شيك ما يعديش قيمته والمتبقي محسوب صح', badC.map(p => p.check_no || p.id).join('، '));
  const effSum = pays.filter(p => ['cash','check','transfer'].includes(p.method)).reduce((a, p) => a + payEffect(p), 0);
  const rowSum = all.filter(e => (e.k === 'pay' && !IS_ADJ(e.x.method)) || e.k === 'cp').reduce((a, e) => a + e.dr, 0);
  ok(effSum === rowSum, 'مفيش شيك اتخصم مرتين (أثر الشيكات في الكشف = أثرها في رصيد المورد)', fmt2(rowSum));
  if(st.pendOps.length) out.push({ok:true, warn:true, t:`فيه ${st.pendOps.length} عملية للمورد ده لسه متزامنتش (الكشف مبدئي)`});
  return out;
}

/* ---------- كتابة عربي (RTL) في PDFKit ----------
   PDFKit بيشكّل الحروف العربي صح (fontkit) لكن مش بيرتب الكلمات من اليمين للشمال،
   فبنقسم السطر لكلمات ونرصّها بنفسنا: الكلمات العربي من اليمين، والأرقام/الإنجليزي بترتيبها */
const AR_RE = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;
function rtlUnits(text){
  const words = String(text ?? '').split(/\s+/).filter(Boolean), units = [];
  for(const w of words){
    if(/^[\-–—:·•|/]+$/.test(w)){ units.push({t:w, ar:true, neutral:true}); continue; }   // علامة لوحدها بتفضل في مكانها
    const ar = AR_RE.test(w), last = units[units.length - 1];
    if(!ar && last && !last.ar) last.t += ' ' + w; else units.push({t:w, ar});
  }
  return units;
}
function rtlWidth(doc, units){ const sp = doc.widthOfString(' '); return units.reduce((a, u, i) => a + doc.widthOfString(u.t) + (i ? sp : 0), 0); }
function rtlWrap(doc, text, maxW){
  const units = rtlUnits(text), lines = [[]], sp = doc.widthOfString(' ');
  let w = 0;
  for(const u of units){
    const uw = doc.widthOfString(u.t);
    if(lines[lines.length - 1].length && w + sp + uw > maxW){ lines.push([]); w = 0; }
    w += (lines[lines.length - 1].length ? sp : 0) + uw; lines[lines.length - 1].push(u);
  }
  return lines;
}
function rtlDraw(doc, units, xRight, y, opt = {}){
  if(typeof units === 'string') units = rtlUnits(units);
  const sp = doc.widthOfString(' ');
  let x = xRight;
  if(opt.align === 'center' && opt.width) x = xRight - (opt.width - rtlWidth(doc, units)) / 2;
  if(opt.align === 'left' && opt.width) x = xRight - opt.width + rtlWidth(doc, units);
  units.forEach((u, i) => { const w = doc.widthOfString(u.t); if(i) x -= sp; x -= w; doc.text(u.t, x, y, {lineBreak:false}); });
}
const numDraw = (doc, t, xRight, y, w) => { const tw = doc.widthOfString(t); doc.text(t, xRight - (w ? w : tw) + (w ? (w - tw) / 2 : 0), y, {lineBreak:false}); };


/* ---------- تحميل المكتبات (أول مرة بس، وبعدها من الجهاز) ---------- */
let pdfLibs = null;
async function loadPdfLibs(){
  if(pdfLibs) return pdfLibs;
  await loadScript('vendor/pdf/pdfkit.standalone.js');
  if(typeof PDFDocument === 'undefined') throw new Error('مكتبة الـ PDF ما اتحمّلتش على الموبايل ده');
  const [r, b, w, z] = await Promise.all(['vendor/pdf/cairo-regular.ttf', 'vendor/pdf/cairo-bold.ttf', 'icons/ward.png', 'icons/zahra.png']
    .map(u => fetch(u).then(x => { if(!x.ok) throw new Error('ملف ناقص: ' + u); return x.arrayBuffer(); })));
  pdfLibs = {r, b, w, z};
  return pdfLibs;
}
async function loadPdfJs(){
  const m = await import(new URL('vendor/pdf/pdf.min.js', location.href).href);
  m.GlobalWorkerOptions.workerSrc = new URL('vendor/pdf/pdf.worker.min.js', location.href).href;
  return m;
}

/* ---------- صور المستندات (بالصور بس) ---------- */
async function collectImages(st, onProg){
  const list = [];
  st.rows.forEach(e => { const paths = rowPages(e.x); paths.forEach((p, i) => list.push({e, path:p, page:i + 1, pages:paths.length})); });
  const missing = []; let done = 0;
  for(const it of list){
    try{
      const u = await signedUrl(it.path);
      if(!u) throw new Error(navigator.onLine ? 'مش متاحة' : 'محتاجة نت');
      const blob = await (await withTimeout(fetch(u), 30000)).blob();
      it.jpg = await shrinkJpeg(blob, 1100, 0.78);
    }catch(err){ it.err = err.message || 'تعذر التحميل'; missing.push(it); }
    onProg && onProg(++done, list.length);
  }
  return {list, missing};
}
function shrinkJpeg(blob, maxSide, q){
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(blob), img = new Image();
    img.onload = () => {
      const s = Math.min(1, maxSide / Math.max(img.width, img.height)), w = Math.round(img.width * s), h = Math.round(img.height * s);
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h);
      c.toBlob(b => { URL.revokeObjectURL(url); if(!b) return rej(new Error('صورة تالفة')); b.arrayBuffer().then(buf => res({buf, w, h})); }, 'image/jpeg', q);
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('صورة تالفة')); };
    img.src = url;
  });
}

/* ---------- إنشاء ملف الـ PDF (الأنواع التلاتة) ---------- */
async function makeStatementPdf(st, imgs){
  const L = await loadPdfLibs();
  const NAVY = '#10243D', GRAY = '#555', LINE = '#C9CED8', ZEBRA = '#F3F5F9', SOFT = '#E8ECF3', RED = '#9A1B1B', GREEN = '#14633F';
  const kind = st.opt.kind || 'detail';
  const doc = new PDFDocument({size:'A4', margins:{top:36, bottom:46, left:36, right:36}, bufferPages:true,
    info:{Title:`كشف حساب ${KIND_AR[kind]} - ${st.s.name}`, Author:'حسابات المحل', Subject:st.ref, Creator:'حسابات المحل'}});
  const chunks = []; doc.on('data', c => chunks.push(c));
  const done = new Promise(res => doc.on('end', res));
  doc.registerFont('R', L.r); doc.registerFont('B', L.b);
  const W = doc.page.width, H = doc.page.height, M = 36, R = W - M, CW = W - 2 * M, BOTTOM = H - 52;
  const F = (f, s, c) => { doc.font(f).fontSize(s).fillColor(c || '#111'); };
  let y;

  // ----- الرأس -----
  doc.image(L.w, M, M - 4, {width:42}); doc.image(L.z, M + 46, M - 4, {width:42});
  F('R', 10, GRAY); rtlDraw(doc, 'حسابات المحل', R, M - 2);
  F('B', 20, NAVY); rtlDraw(doc, `كشف حساب مورد ${KIND_AR[kind]}`, R, M + 12);
  if(st.local){ F('B', 9, RED); rtlDraw(doc, 'نسخة مبدئية من بيانات الجهاز - لم يتم التأكد من المزامنة مع السيرفر', R, M + 44); }
  y = M + 62;
  doc.moveTo(M, y).lineTo(R, y).lineWidth(1.5).strokeColor(NAVY).stroke(); y += 8;
  const info = [['اسم المورد', st.s.name], ['الهاتف', st.s.phone ? String(st.s.phone).replace(/[‪-‮‎‏]/g, '') : '-'],
    ['الفترة', st.period], ['تاريخ الإصدار', dmy(st.today)], ['أصدره', st.issuer], ['رقم الكشف', st.ref]];
  info.forEach((kv, i) => {
    const cx = R - (i % 2) * (CW / 2), cy = y + Math.floor(i / 2) * 17;
    F('R', 9.5, GRAY); rtlDraw(doc, kv[0] + ':', cx, cy);
    const lw = doc.widthOfString(kv[0] + ':') + 6;
    F('B', 10, '#111'); rtlDraw(doc, kv[1], cx - lw, cy);
  });
  y += Math.ceil(info.length / 2) * 17 + 6;
  if(st.future.length){ F('R', 8.5, RED); rtlDraw(doc, `ملحوظة: فيه ${st.future.length} حركة تاريخها بعد تاريخ الإصدار - محسوبة في الكشف زي ما هي متسجلة`, R, y); y += 14; }

  const newPage = (withHead) => { doc.addPage(); y = M; F('R', 9, GRAY); rtlDraw(doc, `تابع كشف حساب ${KIND_AR[kind]}: ${st.s.name} - ${st.ref}`, R, y); y += 18; if(withHead) withHead(); };
  const closingBox = () => {
    if(y + 34 > BOTTOM) newPage();
    doc.rect(M, y, CW, 30).fill(SOFT);
    F('B', 13, NAVY); rtlDraw(doc, 'الرصيد الختامي:', R - 10, y + 7);
    const lbw = doc.widthOfString('الرصيد الختامي:') + 14, cl = fmt2(Math.abs(st.T.closing)) + ' ج.م';
    F('B', 13, '#111'); numDraw(doc, cl, R - 10 - lbw, y + 7);
    const nw = doc.widthOfString(cl) + 14;
    F('B', 12, st.T.closing > 0 ? RED : GREEN); rtlDraw(doc, '- ' + balDir(st.T.closing), R - 10 - lbw - nw, y + 8);
    y += 38;
  };
  // ----- الملخص (نفس الأرقام في الأنواع التلاتة) -----
  const summaryRow = () => {
    const sums = [['الرصيد الافتتاحي', st.T.opening], ['إجمالي الفواتير', st.T.inv], ['إجمالي المدفوعات', st.T.pay], ['إجمالي المرتجعات', st.T.ret], ['إجمالي الخصومات', st.T.disc], ['تسويات أخرى', st.T.other]];
    doc.rect(M, y, CW, 38).lineWidth(.8).strokeColor(LINE).stroke();
    const bw = CW / 6;
    sums.forEach((kv, i) => {
      const xr = R - i * bw;
      if(i) doc.moveTo(xr, y + 6).lineTo(xr, y + 32).strokeColor(LINE).stroke();
      F('R', 8.5, GRAY); rtlDraw(doc, kv[0], xr - 3, y + 5, {align:'center', width:bw - 6});
      F('B', 10.5, '#111'); numDraw(doc, fmt2(kv[1]), xr - 3, y + 19, bw - 6);
    });
    y += 46;
  };

  // ----- جدول عام (بيتكرر عنوانه في كل صفحة ومفيش صف بيتقسم) -----
  const table = (cols, rowsData) => {
    const total = cols.reduce((a, c) => a + c.w, 0), flex = cols.find(c => !c.w);
    if(flex) flex.w = CW - total;
    const xs = []; { let x = R; cols.forEach(c => { xs.push(x); x -= c.w; }); }
    const head = () => { doc.rect(M, y, CW, 20).fill(NAVY); F('B', 9, '#fff'); cols.forEach((c, i) => rtlDraw(doc, c.t, xs[i] - 2, y + 5, {align:'center', width:c.w - 4})); y += 20; };
    head();
    rowsData.forEach(({vals, bold, fill}) => {
      F(bold ? 'B' : 'R', 8.8, '#111');
      const wraps = cols.map((c, i) => c.wrap ? rtlWrap(doc, vals[i], c.w - 8) : null);
      const h = Math.max(18, ...wraps.filter(Boolean).map(l => l.length * 12 + 6));
      if(y + h > BOTTOM) newPage(head);
      if(fill) doc.rect(M, y, CW, h).fill(fill);
      cols.forEach((c, i) => {
        const v = vals[i] ?? '', cx = xs[i] - 3, w = c.w - 6;
        F(bold || c.bold ? 'B' : 'R', 8.8, c.color ? c.color(vals) : '#111');
        if(c.wrap) wraps[i].forEach((ln, k) => rtlDraw(doc, ln, cx, y + 4 + k * 12));
        else if(AR_RE.test(v)) rtlDraw(doc, v, cx, y + 4, {align:'center', width:w});
        else numDraw(doc, v, cx, y + 4, w);
      });
      doc.moveTo(M, y + h).lineTo(R, y + h).lineWidth(.5).strokeColor(LINE).stroke();
      y += h;
    });
  };
  const openingDesc = 'رصيد افتتاحي' + (st.from ? ' - مجموع الحركات قبل بداية الفترة' : '');

  if(kind === 'detail'){
    summaryRow(); closingBox();
    table([{t:'م', w:24}, {t:'التاريخ', w:56}, {t:'رقم المستند', w:60}, {t:'نوع الحركة', w:52}, {t:'البيان', w:0, wrap:true}, {t:'مدين', w:66}, {t:'دائن', w:66}, {t:'الرصيد', w:72}], [
      {vals:['', st.from ? dmy(st.from) : '', '', 'رصيد', openingDesc, '', '', fmt2(st.T.opening)], bold:true, fill:SOFT},
      ...(st.rows.length ? st.rows.map((e, i) => ({vals:[String(e.n), dmy(e.d), String(e.doc), e.type, e.desc, e.dr ? fmt2(e.dr) : '', e.cr ? fmt2(e.cr) : '', fmt2(e.run)], fill:i % 2 ? ZEBRA : null}))
        : [{vals:['', '', '', '', 'لا توجد حركات خلال الفترة المحددة', '', '', '']}]),
      {vals:['', '', '', '', 'الإجمالي', fmt2(st.T.dr), fmt2(st.T.cr), fmt2(st.T.closing)], bold:true, fill:SOFT},
    ]);
    y += 8; if(y + 30 > BOTTOM) newPage();
    F('R', 9, GRAY); rtlDraw(doc, 'المعادلة: الرصيد الختامي = الرصيد الافتتاحي + إجمالي الدائن - إجمالي المدين', R, y); y += 14;
    rtlDraw(doc, 'الدائن: الفواتير - بتزود المستحق للمورد   |   المدين: المدفوعات والمرتجعات والخصومات - بتقلله', R, y); y += 18;
  } else if(kind === 'brief'){
    table([{t:'التاريخ', w:62}, {t:'البيان', w:0, wrap:true}, {t:'المبلغ', w:126, color:v => String(v[2]).includes('يزيد') ? RED : '#14633F'}, {t:'الرصيد بعد الحركة', w:92}], [
      {vals:[st.from ? dmy(st.from) : '', openingDesc, '', fmt2(st.T.opening)], bold:true, fill:SOFT},
      ...(st.rows.length ? st.rows.map((e, i) => ({vals:[dmy(e.d), `${e.type}${e.k === 'inv' || e.k === 'cp' || e.x.method === 'check' ? ' ' + e.doc : ''}${e.x.notes ? ' - ' + e.x.notes : ''}`,
          e.k === 'chk' ? 'معلومة - ' + chkSummary(e.x) : e.cr ? `يزيد المستحق ${fmt2(e.cr)}` : `يقلل المستحق ${fmt2(e.dr)}`, fmt2(e.run)], fill:i % 2 ? ZEBRA : null}))
        : [{vals:['', 'لا توجد حركات خلال الفترة المحددة', '', '']}]),
    ]);
    y += 12; if(y + 90 > BOTTOM) newPage();
    F('B', 12, NAVY); rtlDraw(doc, 'ملخص الكشف', R, y); y += 20;
    summaryRow(); closingBox();
  } else {
    // إجمالي: ملخص من غير سرد الحركات
    y += 4;
    table([{t:'البند', w:0}, {t:'العدد', w:80}, {t:'المبلغ (ج.م)', w:140}], [
      {vals:['الرصيد الافتتاحي' + (st.from ? ' - قبل ' + dmy(st.from) : ''), '', fmt2(st.T.opening)], bold:true, fill:SOFT},
      {vals:['إجمالي فواتير الفترة - يزيد المستحق', String(st.T.nInv), fmt2(st.T.inv)]},
      {vals:['إجمالي المدفوعات - يقلل المستحق', String(st.T.nPay), fmt2(st.T.pay)], fill:ZEBRA},
      {vals:['إجمالي المرتجعات - يقلل المستحق', String(st.T.nRet), fmt2(st.T.ret)]},
      {vals:['إجمالي الخصومات - يقلل المستحق', String(st.T.nDisc), fmt2(st.T.disc)], fill:ZEBRA},
      {vals:['إجمالي التسويات', '0', fmt2(st.T.other)]},
      {vals:['الرصيد الختامي - ' + balDir(st.T.closing), String(st.rows.length) + ' حركة', fmt2(st.T.closing)], bold:true, fill:SOFT},
    ]);
    y += 12; closingBox();
    if(!st.rows.length){ F('R', 10, GRAY); rtlDraw(doc, 'لا توجد حركات خلال الفترة المحددة', R, y); y += 18; }
  }

  // ----- معلومات الشيكات -----
  const infoList = (title, list, note) => {
    if(!list.length) return;
    if(y + 40 > BOTTOM) newPage();
    F('B', 11, NAVY); rtlDraw(doc, title, R, y); y += 16;
    F('R', 8.5, GRAY); rtlDraw(doc, note, R, y); y += 14;
    list.forEach(p => { if(y + 14 > BOTTOM) newPage(); F('R', 9, '#111');
      rtlDraw(doc, `شيك رقم ${p.check_no || '-'} - ${CHK[p.check_status]} - مكتوب ${dmy(p.pay_date)} - بمبلغ ${fmt2(cents(p.amount))} - المسدد منه ${fmt2(checkInfo(p).paidRows)} ج.م`, R - 8, y); y += 14; });
    y += 6;
  };
  // ملحق الشيكات غير المسددة أو المسددة جزئيًا (معلومة بس — أثرها محسوب مرة واحدة في الجدول)
  if(st.pendChecks.length){
    if(y + 60 > BOTTOM) newPage();
    F('B', 11, NAVY); rtlDraw(doc, 'ملحق: شيكات غير مسددة أو مسددة جزئيًا', R, y); y += 16;
    F('R', 8.5, GRAY); rtlDraw(doc, 'الشيك محسوب في الجدول باللي اتسدد منه فعلًا بس (كل دفعة بتاريخها) - المتبقي مش متخصم من المورد لحد ما يتدفع أو يتصرف:', R, y); y += 16;
    st.pendChecks.forEach(p => {
      const ci = checkInfo(p);
      if(y + 30 > BOTTOM) newPage();
      F('B', 9.5, '#111');
      rtlWrap(doc, `شيك رقم ${p.check_no || '-'} - ${p.bank || 'بدون بنك'} - استحقاق ${dmy(p.due_date)} - القيمة ${fmt2(ci.orig)} - المسدد ${fmt2(ci.settled)} - المتبقي ${fmt2(ci.remaining)} - ${CHK_PAY[ci.pay]}${ci.due ? ' / ' + CHK_DUE[ci.due] : ''}`, CW - 8).forEach(ln => { rtlDraw(doc, ln, R - 4, y); y += 13; }); y += 1;
      ci.live.forEach(c => { if(y + 14 > BOTTOM) newPage(); F('R', 8.8, GRAY);
        rtlDraw(doc, `دفعة ${dmy(c.pay_date)} - ${fmt2(cents(c.amount))} ج.م - ${CP_METHOD[c.method]}${c.account ? ' - من ' + c.account : ''}${c.ref_no ? ' - مرجع ' + c.ref_no : ''}`, R - 18, y); y += 13; });
      y += 4;
    });
    y += 6;
  }
  infoList('شيكات مرتدة أو ملغاة أو مستبدلة', st.bounced, 'محسوب منها على المورد المسدد فعليًا بس - ظاهر في الجدول باسم سداد شيك:');

  // ----- ملحق المستندات: 4 صور في كل صفحة (2 × 2) -----
  if(imgs && imgs.list.length){
    const GAP = 12, CAPH = 30, TOP = M + 28, cw = (CW - GAP) / 2, ch = (BOTTOM - TOP - GAP) / 2, ih = ch - CAPH;
    imgs.list.forEach((it, i) => {
      const slot = i % 4;
      if(slot === 0){
        doc.addPage();
        F('B', 14, NAVY); rtlDraw(doc, 'ملحق المستندات', R, M);
        F('R', 9, GRAY); rtlDraw(doc, `${st.s.name} - صور ${i + 1} إلى ${Math.min(i + 4, imgs.list.length)} من ${imgs.list.length}`, M + 260, M + 4, {align:'left', width:260});
      }
      const cx = R - (slot % 2) * (cw + GAP), x0 = cx - cw, y0 = TOP + Math.floor(slot / 2) * (ch + GAP);
      doc.rect(x0, y0, cw, ch).lineWidth(.6).strokeColor(LINE).stroke();
      const cap = `${it.e.type} ${it.e.doc} - ${dmy(it.e.d)}${it.pages > 1 ? ` - صورة ${it.page} من ${it.pages}` : ''}`;
      doc.rect(x0, y0, cw, CAPH - 6).fill(SOFT);
      F('B', 9, NAVY); rtlDraw(doc, rtlWrap(doc, cap, cw - 12)[0], cx - 6, y0 + 6);
      const by = y0 + CAPH - 2, bh = ih - 4, bw = cw - 8;
      if(!it.jpg){ F('R', 9, RED); rtlDraw(doc, 'الصورة غير متاحة', cx - 6, by + bh / 2 - 6, {align:'center', width:bw}); return; }
      const sc = Math.min(bw / it.jpg.w, bh / it.jpg.h), w = it.jpg.w * sc, h = it.jpg.h * sc;
      doc.image(it.jpg.buf, x0 + 4 + (bw - w) / 2, by + (bh - h) / 2, {width:w, height:h});
    });
  }

  // ----- ترقيم الصفحات -----
  const range = doc.bufferedPageRange();
  for(let i = range.start; i < range.start + range.count; i++){
    doc.switchToPage(i);
    const fy = H - 34;
    doc.moveTo(M, fy - 4).lineTo(R, fy - 4).lineWidth(.5).strokeColor(LINE).stroke();
    F('R', 8.5, GRAY);
    rtlDraw(doc, `صفحة ${i - range.start + 1} من ${range.count}`, R, fy);
    rtlDraw(doc, `حسابات المحل - ${st.ref}`, M + 200, fy, {align:'left', width:200});
  }
  doc.end();
  await done;
  return {blob: new Blob(chunks.map(c => c instanceof Uint8Array ? c : new Uint8Array(c)), {type:'application/pdf'}), pages: range.count};
}

function stmtFileName(st){
  const lat = (String(st.s.name).match(/[A-Za-z0-9]+/g) || []).join('_'), latin = /[A-Za-z]/.test(lat) ? lat : ('S' + st.s.id);
  const k = {detail:'Detailed', brief:'Brief', total:'Summary'}[st.opt.kind || 'detail'];
  return st.opt.mode === 'full' ? `Supplier_Statement_${k}_${latin}_from-start_to-${st.today}.pdf` : `Supplier_Statement_${k}_${latin}_${st.from}_${st.to}.pdf`;
}

/* ---------- شاشة الإصدار ---------- */
let stBusy = false, stLast = null;
async function viewStatementIssue(sid){
  window._stSid = sid; stLast = null;
  const s = (store.ready && hasLocalData()) ? supplierBalances().find(x => String(x.id) === String(sid)) : null;
  if(!s){
    shell({title:'إصدار كشف حساب', back:true, body:`<div class="card empty">${I.doc}<div>${store.ready && hasLocalData() ? 'المورد ده مش موجود على الجهاز' : 'البيانات لسه ما اتحمّلتش على الجهاز'}</div>
      <button class="btn primary" style="margin-top:12px" onclick="syncNow(true).then(()=>viewStatementIssue(${+sid}))">${I.refresh}حاول تاني</button></div>`});
    return;
  }
  // كل كشف بيبدأ «كشف كامل»: الفترة المحددة مش بتتفتكر من مورد للتاني (عشان محدش يبعت كشف ناقص من غير ما ياخد باله)
  const o = {...stOpts(), mode:'full', from:'', to:''};
  const seg = (id, items, cur) => `<div class="seg st-seg" id="${id}" style="grid-template-columns:repeat(${items.length},1fr)">${items.map(([v, l, ic]) => `<button type="button" data-v="${v}" class="${String(cur) === String(v) ? 'on' : ''}">${I[ic]}${l}</button>`).join('')}</div>`;
  shell({title:'إصدار كشف حساب', back:true, body:`
    <div class="card"><div class="kv" style="border:0"><span>المورد</span><span><b>${esc(s.name)}</b></span></div></div>
    <div class="card"><div class="section-t">نوع كشف الحساب</div>
      ${seg('st-kind', [['detail', 'تفصيلي', 'doc'], ['brief', 'مختصر', 'receipt'], ['total', 'إجمالي', 'chart']], o.kind)}
      <div class="hint" id="st-kind-h" style="margin-top:8px"></div></div>
    <div class="card"><div class="section-t">فترة الكشف</div>
      ${seg('st-mode', [['full', 'كشف كامل', 'doc'], ['range', 'لفترة محددة', 'chart']], o.mode)}
      <div id="st-range" class="row2" style="margin-top:12px;${o.mode === 'range' ? '' : 'display:none'}">
        <div class="field" id="f-sf" style="margin:0"><label>من تاريخ</label><input type="date" id="sf" value="${o.from || ''}"></div>
        <div class="field" id="f-st" style="margin:0"><label>إلى تاريخ</label><input type="date" id="stt" value="${o.to || today()}"></div>
      </div></div>
    <div class="card"><div class="section-t">الصور والمستندات</div>
      ${seg('st-img', [['0', 'بدون صور', 'doc'], ['1', 'بالصور والمرفقات', 'img']], o.imgs ? '1' : '0')}</div>
    <div id="st-sum"></div>
    <button class="btn primary block st-btn" onclick="stPreview()">${I.doc}معاينة الكشف</button>
    <div class="actions" style="margin-top:10px">
      <button class="btn ghost" onclick="stDownload()">${I.save}تحميل PDF</button>
      <button class="btn green" onclick="stSend()">${I.wa}إرسال واتساب</button>
    </div>
    <div class="hint" style="margin-top:10px;text-align:center">الكشف مش بيسجل أي حركة — بيقرا البيانات بس.</div>`});
  const refresh = () => {
    const get = id => $('#' + id + ' .on').dataset.v;
    const o2 = {kind:get('st-kind'), mode:get('st-mode'), imgs:get('st-img') === '1', from:$('#sf').value, to:$('#stt').value};
    saveStOpts(o2); stLast = null;
    $('#st-range').style.display = o2.mode === 'range' ? '' : 'none';
    $('#st-kind-h').textContent = {detail:'كل الحركات بالمدين والدائن والرصيد بعد كل حركة', brief:'كل الحركات بشكل مختصر (التاريخ - البيان - المبلغ - الرصيد) ومناسب لواتساب', total:'ملخص بالإجماليات وعدد الفواتير والمدفوعات من غير سرد الحركات'}[o2.kind];
    const box = $('#st-sum');
    if(o2.mode === 'range' && (!o2.from || !o2.to)){ box.innerHTML = '<div class="note-line">اختار تاريخ البداية والنهاية</div>'; return; }
    if(o2.mode === 'range' && o2.from > o2.to){ box.innerHTML = '<div class="note-line">تاريخ البداية لازم يكون قبل تاريخ النهاية</div>'; return; }
    try{
      const st = buildStatement(sid, o2);
      const warn = [!navigator.onLine || !sync.online ? 'من غير نت: الكشف هيتعمل من بيانات الجهاز ويتكتب عليه «نسخة مبدئية».' : '',
        st.pendOps.length ? `فيه ${st.pendOps.length} عملية للمورد ده لسه متزامنتش — الكشف هيبقى مبدئي.` : '',
        st.future.length ? `فيه ${st.future.length} حركة تاريخها بعد النهارده (أحدثها ${dmy(st.future[st.future.length - 1].d)}) — محسوبة في الكشف.` : ''].filter(Boolean);
      box.innerHTML = `<div class="card st-pre">
        <div class="section-t">${st.period}</div>
        <div class="sum6">
          <div><span>الحركات</span><b>${st.rows.length}</b></div>
          <div><span>الرصيد الافتتاحي</span><b>${money(st.T.opening / 100)}</b></div>
          <div><span>الرصيد الختامي</span><b>${money(Math.abs(st.T.closing) / 100)}</b><small>${balDir(st.T.closing)}</small></div>
        </div>
        ${st.rows.length ? '' : '<div class="note-line" style="margin-top:8px">لا توجد حركات خلال الفترة المحددة</div>'}
        ${warn.map(w => `<div class="note-line" style="margin-top:8px">${esc(w)}</div>`).join('')}</div>`;
    }catch(e){ box.innerHTML = `<div class="card empty"><div>${esc(e.message)}</div>${e.retry ? `<button class="btn primary" style="margin-top:10px" onclick="syncNow(true).then(()=>viewStatementIssue(${+sid}))">حاول تاني</button>` : ''}</div>`; }
  };
  document.querySelectorAll('.st-seg button').forEach(b => b.onclick = () => { b.parentNode.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); refresh(); });
  ['sf', 'stt'].forEach(id => { $('#' + id).addEventListener('change', refresh); $('#' + id).addEventListener('input', refresh); });
  refresh();
}
function stValidate(){
  const o = stOpts();
  if(o.mode === 'range'){
    if(!o.from){ markErr('sf', 'اختار تاريخ البداية'); return null; }
    if(!o.to){ markErr('st', 'اختار تاريخ النهاية'); return null; }
    if(o.from > o.to){ markErr('sf', 'تاريخ البداية لازم يكون قبل تاريخ النهاية'); return null; }
  }
  return o;
}
// بيعمل الملف مرة واحدة لنفس الاختيارات ونفس البيانات (المعاينة والتحميل والإرسال نفس الملف بالظبط)
async function stGenerate(){
  const o = stValidate(); if(!o) return null;
  const key = JSON.stringify(o) + '|' + window._stSid + '|' + store.ver;
  if(stLast && stLast.key === key) return stLast;
  if(stBusy){ toast('الكشف بيتجهز…'); return null; }
  stBusy = true;
  const prog = t => { const el = document.getElementById('st-prog'); if(el) el.textContent = t; };
  const ov = document.createElement('div'); ov.className = 'st-ov'; ov.innerHTML = `<div class="st-ovb"><div class="spin"></div><b id="st-prog">بجهّز الحسابات…</b></div>`;
  document.body.appendChild(ov);
  try{
    const st = buildStatement(window._stSid, o);
    const bad = st.audit.filter(a => !a.ok);
    if(bad.length){
      ov.remove();
      alert('المراجعة المحاسبية لقت اختلاف، والكشف مش هيطلع لحد ما يتحل:\n\n' + bad.map(a => '• ' + a.t + (a.d ? ' (' + a.d + ')' : '')).join('\n') + '\n\nمحدش عدّل أي بيانات. جرّب «مزامنة الآن» وبعدين اعمل الكشف تاني.');
      return null;
    }
    let imgs = null;
    if(o.imgs){
      prog('بحمّل صور المستندات…');
      imgs = await collectImages(st, (d, n) => prog(`بحمّل صور المستندات ${d} من ${n}…`));
      if(imgs.missing.length){
        ov.remove();
        const msg = imgs.missing.slice(0, 8).map(m => `• ${m.e.type} ${m.e.doc} (${dmy(m.e.d)}): ${m.err}`).join('\n');
        if(!confirm(`فيه ${imgs.missing.length} صورة مقدرتش أحمّلها:\n${msg}${imgs.missing.length > 8 ? '\n…' : ''}\n\nالأرصدة والحركات مش هتتأثر — هيتكتب مكانها «الصورة غير متاحة». تكمل؟`)) return null;
        document.body.appendChild(ov);
      }
    }
    prog('بكتب ملف الـ PDF…');
    const {blob, pages} = await makeStatementPdf(st, imgs);
    if(!blob || blob.size < 1000) throw new Error('الملف طلع فاضي');
    stLast = {key, st, blob, pages, name:stmtFileName(st)};
    return stLast;
  }catch(e){
    console.error(e);
    openModal(`<h3>مقدرتش أعمل الكشف</h3><div class="hint" style="margin-bottom:12px">${esc(e.message || String(e))}</div>
      <button class="btn primary block" onclick="closeModal();stPreview()">${I.refresh}حاول تاني</button>`);
    return null;
  }finally{ stBusy = false; ov.remove(); }
}

/* ---------- المعاينة: صفحة صفحة (خفيفة على ذاكرة الآيفون) ---------- */
let stPdf = null, stPage = 1, stScale = 1;
window.stPreview = async () => {
  const r = await stGenerate(); if(!r) return;
  document.querySelector('.st-view')?.remove();
  const v = document.createElement('div'); v.className = 'st-view';
  v.innerHTML = `<header class="top"><button class="iconbtn" aria-label="رجوع" onclick="stClosePreview()">${I.back}</button>
      <h1>معاينة الكشف ${KIND_AR[r.st.opt.kind]}</h1></header>
    <div class="st-audit">${r.st.local ? '<div class="note-line">نسخة مبدئية من بيانات الجهاز — لسه ما اتأكدتش من السيرفر</div>' : ''}
      <details><summary>المراجعة المحاسبية: ✓ كل الحسابات مطابقة</summary>
      ${r.st.audit.map(a => `<div class="${a.warn ? 'bad' : 'ok'}">${a.warn ? '⚠' : '✓'} ${esc(a.t)}${a.d ? ` <small>${esc(a.d)}</small>` : ''}</div>`).join('')}</details></div>
    <div class="st-pages" id="st-pages"><div class="spin" style="margin:40px auto"></div></div>
    <div class="st-nav"><button class="iconbtn" onclick="stGo(-1)" aria-label="الصفحة اللي فاتت">${I.back}</button>
      <b id="st-pn"></b><button class="iconbtn" onclick="stGo(1)" style="transform:scaleX(-1)" aria-label="الصفحة الجاية">${I.back}</button>
      <span class="sep"></span><button class="iconbtn" onclick="stZoom(-1)" aria-label="تصغير">−</button><button class="iconbtn" onclick="stZoom(1)" aria-label="تكبير">+</button></div>
    <div class="st-bar"><button class="btn ghost" onclick="stClosePreview()">${I.edit}تعديل</button>
      <button class="btn ghost" onclick="stDownload()">${I.save}تحميل</button><button class="btn green" onclick="stSend()">${I.wa}واتساب</button></div>`;
  document.body.appendChild(v);
  try{
    const pdfjs = await loadPdfJs();
    stPdf = await pdfjs.getDocument({data: new Uint8Array(await r.blob.arrayBuffer()), disableFontFace:true, useSystemFonts:false, isEvalSupported:false}).promise;
    stPage = 1; stScale = 1; await stRender();
  }catch(e){ console.error(e); $('#st-pages').innerHTML = `<div class="hint" style="color:#fff;padding:20px">المعاينة مش شغالة على الموبايل ده (${esc(e.message || e)}).<br>الملف نفسه جاهز — تقدر تحمّله أو تبعته.</div>`; }
};
async function stRender(){
  const box = $('#st-pages'); if(!box || !stPdf) return;
  const page = await stPdf.getPage(stPage);
  const base = page.getViewport({scale:1});
  const cssW = Math.min(box.clientWidth - 20, 900) * stScale, dpr = Math.min(2, window.devicePixelRatio || 1);
  const vp = page.getViewport({scale: (cssW / base.width) * dpr});
  const c = document.createElement('canvas'); c.width = Math.floor(vp.width); c.height = Math.floor(vp.height); c.className = 'st-page'; c.style.width = cssW + 'px';
  await page.render({canvasContext: c.getContext('2d'), viewport: vp}).promise;
  box.innerHTML = ''; box.appendChild(c);
  $('#st-pn').textContent = `صفحة ${stPage} من ${stPdf.numPages}`;
}
window.stGo = d => { if(!stPdf) return; const n = Math.max(1, Math.min(stPdf.numPages, stPage + d)); if(n !== stPage){ stPage = n; stRender(); } };
window.stZoom = d => { stScale = Math.max(.7, Math.min(3, stScale + d * .3)); stRender(); };
window.stClosePreview = () => { document.querySelector('.st-view')?.remove(); try{ stPdf?.destroy(); }catch(e){} stPdf = null; };

/* ---------- التحميل والإرسال ---------- */
function stSave(r){
  const a = document.createElement('a'); a.href = URL.createObjectURL(r.blob); a.download = r.name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}
window.stDownload = async () => { const r = await stGenerate(); if(!r) return; stSave(r); toast('اتحمّل الملف ✓'); };
const stMsg = r => `حسابات المحل\nكشف حساب المورد: ${r.st.s.name}\nنوع الكشف: ${KIND_AR[r.st.opt.kind]}\nالفترة: ${r.st.period}\nالرصيد الختامي: ${fmt2(Math.abs(r.st.T.closing))} ج.م (${balDir(r.st.T.closing)})\nيرجى مراجعة كشف الحساب المرفق.`;
const MY_WA = 'mawredin_my_wa';
// رقم موبايل مصري/دولي → صيغة واتساب (من غير + ومن غير تكرار كود الدولة)
function waNormalize(p){
  let d = String(p || '').replace(/[٠-٩]/g, x => '٠١٢٣٤٥٦٧٨٩'.indexOf(x)).replace(/\D/g, '');
  if(d.startsWith('00')) d = d.slice(2);
  if(d.startsWith('20') && d.length === 12) return d;
  if(d.startsWith('0') && d.length === 11) return '20' + d.slice(1);
  if(d.length === 10 && d.startsWith('1')) return '20' + d;
  return d.length >= 11 && d.length <= 15 ? d : '';
}
// شاشة الإرسال: واتساب حرفيًا مش بيسمح لأي تطبيق يرفق ملف ويبعته لرقم معيّن لوحده،
// فبنجهّز الملف ونديك زرارين واضحين: «مشاركة الملف» و«فتح المحادثة» — والإرسال نفسه بإيدك
window.stSend = async () => {
  const r = await stGenerate(); if(!r) return;
  const s = r.st.s, supNum = waNormalize(s.phone), myNum = waNormalize(localStorage.getItem(MY_WA));
  const file = new File([r.blob], r.name, {type:'application/pdf'});
  const canFiles = !!(navigator.canShare && navigator.canShare({files:[file]}));
  openModal(`<div class="wa-panel"><h3>${I.wa} إرسال الكشف على واتساب</h3>
    <div class="hint">${esc(r.name)} · ${r.pages} ${r.pages === 1 ? 'صفحة' : 'صفحات'}</div>
    <div class="field" style="margin-top:10px"><label>نص الرسالة (تقدر تعدّله)</label><textarea id="wamsg" rows="6">${esc(stMsg(r))}</textarea></div>
    <div class="tabs wa-tabs">
      <button data-t="sup" class="on">المورد</button><button data-t="me">رقمي</button><button data-t="other">محادثة تانية</button>
    </div>
    <div id="wa-body"></div>
    <div class="hint" style="margin-top:10px">واتساب مش بيسمح لأي تطبيق يبعت ملف لرقم معيّن لوحده — إنت اللي بتختار المحادثة وبتدوس إرسال.</div></div>`);
  const msg = () => $('#wamsg').value;
  const share = async () => {
    if(!canFiles){ stSave(r); toast('الموبايل ده مش بيدعم مشاركة الملفات — نزّلت الملف، ضيفه من المرفقات في واتساب', true); return; }
    try{ await navigator.share({files:[file], text:msg(), title:`كشف حساب ${s.name}`}); }
    catch(e){ if(e.name !== 'AbortError'){ stSave(r); toast('مقدرتش أفتح المشاركة — نزّلت الملف بدلها', true); } }
  };
  let opening = false;
  const openChat = num => { if(opening) return; opening = true; setTimeout(() => opening = false, 1500); location.href = `https://wa.me/${num}?text=${encodeURIComponent(msg())}`; };
  const body = t => {
    const el = $('#wa-body');
    if(t === 'sup'){
      el.innerHTML = supNum ? `
        <div class="kv"><span>رقم المورد</span><span class="num">+${supNum}</span></div>
        <div class="wa-steps"><div><b>1</b> ${canFiles ? 'شارك الملف واختار واتساب ثم محادثة المورد' : 'نزّل الملف'}</div>
        <button class="btn green block" id="wa-share">${I.share}${canFiles ? 'مشاركة الملف' : 'تحميل الملف'}</button>
        <div style="margin-top:10px"><b>2</b> أو افتح محادثة المورد بالرسالة وضيف الملف من المرفقات</div>
        <button class="btn ghost block" id="wa-open">${I.wa}فتح محادثة المورد</button></div>`
        : `<div class="note-line">المورد مالوش رقم صحيح متسجل.</div>
        <div class="field" style="margin-top:8px"><label>رقم واتساب المورد</label><input id="wa-supnum" type="tel" inputmode="tel" dir="ltr" placeholder="01xxxxxxxxx" value="${esc(s.phone || '')}"></div>
        <button class="btn primary block" id="wa-savesup">حفظ الرقم في بيانات المورد</button>`;
    } else if(t === 'me'){
      el.innerHTML = myNum ? `
        <div class="kv"><span>رقمي المسجل</span><span class="num">+${myNum}</span></div>
        <div class="wa-steps"><button class="btn green block" id="wa-share">${I.share}${canFiles ? 'مشاركة الملف (اختار «أنت»)' : 'تحميل الملف'}</button>
        <button class="btn ghost block" style="margin-top:8px" id="wa-open">${I.wa}فتح محادثتي</button></div>
        <button class="link" style="margin-top:8px" onclick="closeModal();go('/settings')">تغيير رقمي من الإعدادات</button>`
        : `<div class="note-line">لسه مسجلتش رقمك.</div>
        <div class="field" style="margin-top:8px"><label>رقمي الشخصي لاستقبال كشوف الحساب</label><input id="wa-mynum" type="tel" inputmode="tel" dir="ltr" placeholder="01xxxxxxxxx"></div>
        <button class="btn primary block" id="wa-savemy">حفظ رقمي</button>`;
    } else {
      el.innerHTML = `<div class="wa-steps"><button class="btn green block" id="wa-share">${I.share}${canFiles ? 'مشاركة الملف واختيار المحادثة' : 'تحميل الملف'}</button></div>`;
    }
    $('#wa-share') && ($('#wa-share').onclick = share);
    $('#wa-open') && ($('#wa-open').onclick = () => openChat(t === 'me' ? myNum : supNum));
    $('#wa-savesup') && ($('#wa-savesup').onclick = async () => {
      const n = waNormalize($('#wa-supnum').value); if(!n) return toast('الرقم مش صحيح', true);
      await q(ldb.from('suppliers').update({phone: $('#wa-supnum').value.trim()}).eq('id', s.id));
      toast('اتحفظ رقم المورد ✓'); stLast = null; closeModal(); stSend();
    });
    $('#wa-savemy') && ($('#wa-savemy').onclick = () => {
      const n = waNormalize($('#wa-mynum').value); if(!n) return toast('الرقم مش صحيح', true);
      localStorage.setItem(MY_WA, $('#wa-mynum').value.trim()); toast('اتحفظ رقمك ✓'); closeModal(); stSend();
    });
  };
  document.querySelectorAll('.wa-tabs button').forEach(b => b.onclick = () => { document.querySelectorAll('.wa-tabs button').forEach(x => x.classList.toggle('on', x === b)); body(b.dataset.t); });
  body('sup');
};
// اختصارات قديمة
window.stShare = () => stSend();
window.stWhatsApp = () => stSend();
