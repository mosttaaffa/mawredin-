/* =====================================================================
   إصدار كشف حساب مورد PDF
   - PDF حقيقي (نص قابل للبحث والنسخ + خط Cairo جوه الملف) عن طريق PDFKit
   - المعاينة بتعرض نفس ملف الـ PDF بالظبط (pdf.js) — مفيش نسخة HTML مختلفة
   - كل الحسابات بالقرش، وبنفس قواعد رصيد المورد في التطبيق:
       الفاتورة دائن (بتزود المستحق للمورد) — الدفعة/المرتجع/الخصم مدين (بتقلله)
       الشيك المرتد مش بيتحسب — الشيك اللي لسه ما اتصرفش محسوب مدفوع من يوم إصداره (زي رصيد التطبيق)
   - الكشف مش بيسجل أي حركة في قاعدة البيانات
   ===================================================================== */

const STMT_OPTS_KEY = 'mawredin_stmt_opts';
const stOpts = () => { try{ return Object.assign({mode:'full', imgs:false, from:'', to:''}, JSON.parse(localStorage.getItem(STMT_OPTS_KEY) || '{}')); }catch(e){ return {mode:'full', imgs:false, from:'', to:''}; } };
const saveStOpts = o => { try{ localStorage.setItem(STMT_OPTS_KEY, JSON.stringify(o)); }catch(e){} };
const cents = v => Math.round(Number(v || 0) * 100);
const fmt2 = c => (c < 0 ? '-' : '') + (Math.abs(c) / 100).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
const dmy = d => { if(!d) return ''; const [y, m, dd] = String(d).slice(0,10).split('-'); return `${dd}/${m}/${y}`; };
const PAY_AR = {cash:'نقدي', check:'شيك', transfer:'تحويل بنكي', return:'مرتجع', discount:'خصم'};

/* ---------- تجهيز الحركات والحسابات ---------- */
function buildStatement(sid, opt){
  const s = supplierBalances().find(x => String(x.id) === String(sid));
  if(!s) throw new Error('المورد مش موجود');
  const invs = [...store.eff.invoices.values()].filter(i => String(i.supplier_id) === String(sid));
  const pays = [...store.eff.payments.values()].filter(p => String(p.supplier_id) === String(sid));
  const today_ = today();
  const from = opt.mode === 'range' ? opt.from : '';
  const to = opt.mode === 'range' ? opt.to : today_;
  // كل الحركات المعتمدة مرتبة: التاريخ ثم وقت التسجيل ثم الرقم
  const all = [
    ...invs.map(x => ({k:'inv', id:x.id, d:String(x.inv_date).slice(0,10), c:String(x.created_at || ''), x,
      doc: x.inv_no || ('ف ' + x.id), type:'فاتورة', desc:['فاتورة مشتريات', x.notes].filter(Boolean).join(' - '), cr:cents(x.amount), dr:0})),
    ...pays.filter(p => p.check_status !== 'bounced').map(p => ({k:'pay', id:p.id, d:String(p.pay_date).slice(0,10), c:String(p.created_at || ''), x:p,
      doc: p.method === 'check' ? (p.check_no || ('ش ' + p.id)) : ((IS_ADJ(p.method) ? 'م ' : 'د ') + p.id),
      type: IS_ADJ(p.method) ? PAY_AR[p.method] : 'دفعة',
      desc: payDesc(p, invs), cr:0, dr:cents(p.amount)})),
  ].sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : (a.c < b.c ? -1 : a.c > b.c ? 1 : (a.k === b.k ? a.id - b.id : (a.k === 'inv' ? -1 : 1))));
  const before = all.filter(e => from && e.d < from);
  const rows = all.filter(e => (!from || e.d >= from) && e.d <= to);
  const opening = before.reduce((a, e) => a + e.cr - e.dr, 0);
  let run = opening;
  rows.forEach((e, i) => { run += e.cr - e.dr; e.run = run; e.n = i + 1; });
  const sum = (f) => rows.filter(f).reduce((a, e) => a + e.cr + e.dr, 0);
  const T = {opening, inv:sum(e => e.k === 'inv'), pay:sum(e => e.k === 'pay' && !IS_ADJ(e.x.method)),
    ret:sum(e => e.k === 'pay' && e.x.method === 'return'), disc:sum(e => e.k === 'pay' && e.x.method === 'discount'), other:0};
  T.cr = rows.reduce((a, e) => a + e.cr, 0); T.dr = rows.reduce((a, e) => a + e.dr, 0);
  T.closing = opening + T.cr - T.dr;
  const pendChecks = pays.filter(p => p.method === 'check' && p.check_status === 'pending' && (!from || String(p.pay_date) >= from) && String(p.pay_date).slice(0,10) <= to);
  const bounced = pays.filter(p => p.method === 'check' && p.check_status === 'bounced' && (!from || String(p.pay_date) >= from) && String(p.pay_date).slice(0,10) <= to);
  const pendOps = store.queue.filter(o => (o.table === 'invoices' || o.table === 'payments') && String((o.row || o.changes || o.base || {}).supplier_id ?? store.eff[o.table]?.get(o.key)?.supplier_id) === String(sid));
  const audit = auditStatement(s, invs, pays, all, rows, T, from, to, today_);
  const ref = `ST-${s.id}-${today_.replace(/-/g, '')}-${new Date().toTimeString().slice(0,5).replace(':', '')}`;
  return {s, rows, T, from, to, today:today_, opt, pendChecks, bounced, pendOps, audit, ref,
    local: !sync.online || !navigator.onLine || store.queue.some(o => o.status !== 'conflict' && o.status !== 'failed') || pendOps.length > 0,
    issuer: who(me?.email)};
}
function payDesc(p, invs){
  const parts = [p.method === 'check' ? 'دفعة بشيك' : IS_ADJ(p.method) ? (p.method === 'return' ? 'مرتجع بضاعة' : 'خصم من المورد') : 'دفعة ' + PAY_AR[p.method]];
  if(p.method === 'check'){
    if(p.check_no) parts.push('رقم ' + p.check_no);
    if(p.bank) parts.push(p.bank);
    if(p.due_date) parts.push('استحقاق ' + dmy(p.due_date));
    parts.push(p.check_status === 'cleared' ? 'اتصرف' : 'لم يُصرف بعد');
  }
  if(p.invoice_id){ const i = invs.find(x => x.id === p.invoice_id); if(i) parts.push('عن فاتورة ' + (i.inv_no || dmy(i.inv_date))); }
  if(p.notes) parts.push(p.notes);
  return parts.join(' - ');
}
// المراجعة المحاسبية قبل الإصدار (من غير ما نعدّل أي بيانات)
function auditStatement(s, invs, pays, all, rows, T, from, to, today_){
  const out = [], ok = (c, t, d) => out.push({ok:!!c, t, d});
  ok(invs.every(i => String(i.supplier_id) === String(s.id)) && pays.every(p => String(p.supplier_id) === String(s.id)), 'كل الحركات تخص المورد ده');
  const ids = all.map(e => e.k + e.id); ok(new Set(ids).size === ids.length, 'مفيش حركة متحسبة مرتين');
  ok(T.cr === T.inv, 'مجموع الفواتير = مجموع الدائن', `${fmt2(T.inv)} / ${fmt2(T.cr)}`);
  ok(T.dr === T.pay + T.ret + T.disc + T.other, 'المدفوعات + المرتجعات + الخصومات = مجموع المدين', `${fmt2(T.pay + T.ret + T.disc)} / ${fmt2(T.dr)}`);
  const lastRun = rows.length ? rows[rows.length - 1].run : T.opening;
  ok(lastRun === T.closing, 'الرصيد التراكمي في آخر سطر = الرصيد الختامي', `${fmt2(lastRun)} / ${fmt2(T.closing)}`);
  const indep = all.filter(e => e.d <= to).reduce((a, e) => a + e.cr - e.dr, 0);
  ok(indep === T.closing, 'الرصيد الختامي = حساب مستقل لكل الحركات لحد آخر الفترة', `${fmt2(indep)}`);
  if(to >= today_ && !all.some(e => e.d > to)){
    ok(cents(s.balance) === T.closing, 'الرصيد الختامي = رصيد المورد في التطبيق', `${fmt2(cents(s.balance))}`);
  }
  const bouncedN = pays.filter(p => p.check_status === 'bounced').length;
  ok(true, 'الشيكات المرتدة مش متحسبة' + (bouncedN ? ` (${bouncedN})` : ''));
  ok(!from || !to || from <= to, 'تاريخ البداية قبل تاريخ النهاية');
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

/* ---------- تحميل المكتبات (أول مرة بس) ---------- */
let pdfLibs = null;
async function loadPdfLibs(){
  if(pdfLibs) return pdfLibs;
  await loadScript('vendor/pdf/pdfkit.standalone.js');
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
  st.rows.forEach(e => {
    const paths = rowPages(e.x);
    paths.forEach((p, i) => list.push({e, path:p, page:i + 1, pages:paths.length}));
  });
  const missing = [];
  let done = 0;
  for(const it of list){
    try{
      const u = await signedUrl(it.path);
      if(!u) throw new Error('مش متاحة');
      const blob = await (await withTimeout(fetch(u), 30000)).blob();
      it.jpg = await shrinkJpeg(blob, 1500, 0.78);     // تقليل الحجم مع الحفاظ على الوضوح
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

/* ---------- إنشاء ملف الـ PDF ---------- */
async function makeStatementPdf(st, imgs){
  const L = await loadPdfLibs();
  const NAVY = '#10243D', GOLD = '#B8862F', GRAY = '#555', LINE = '#C9CED8', ZEBRA = '#F3F5F9';
  const doc = new PDFDocument({size:'A4', margins:{top:36, bottom:46, left:36, right:36}, bufferPages:true, autoFirstPage:true,
    info:{Title:`كشف حساب ${st.s.name}`, Author:'حسابات المحل', Subject:st.ref, Creator:'حسابات المحل'}});
  const chunks = []; doc.on('data', c => chunks.push(c));
  const done = new Promise(res => doc.on('end', res));
  doc.registerFont('R', L.r); doc.registerFont('B', L.b);
  const W = doc.page.width, H = doc.page.height, M = 36, R = W - M, CW = W - 2 * M, BOTTOM = H - 52;
  const F = (f, s, c) => { doc.font(f).fontSize(s).fillColor(c || '#111'); };

  // ----- رأس الكشف -----
  doc.image(L.w, M, M - 4, {width:42}); doc.image(L.z, M + 46, M - 4, {width:42});
  F('R', 10, GRAY); rtlDraw(doc, 'حسابات المحل', R, M - 2);
  F('B', 20, NAVY); rtlDraw(doc, 'كشف حساب مورد', R, M + 12);
  if(st.local){ F('B', 9, '#9A1B1B'); rtlDraw(doc, 'نسخة مبدئية من بيانات الجهاز - لم يتم التأكد من المزامنة مع السيرفر', R, M + 44); }
  let y = M + 62;
  doc.moveTo(M, y).lineTo(R, y).lineWidth(1.5).strokeColor(NAVY).stroke(); y += 8;
  const period = st.opt.mode === 'full' ? `من بداية التعامل حتى ${dmy(st.today)}` : `من ${dmy(st.from)} إلى ${dmy(st.to)}`;
  const info = [['اسم المورد', st.s.name], ['كود المورد', String(st.s.id)], ['الهاتف', st.s.phone ? String(st.s.phone).replace(/[‪-‮]/g, '') : '-'],
    ['الفترة', period], ['تاريخ الإصدار', dmy(st.today)], ['أصدره', st.issuer], ['رقم الكشف', st.ref]];
  const colW = CW / 2;
  info.forEach((kv, i) => {
    const cx = R - (i % 2) * colW, cy = y + Math.floor(i / 2) * 17;
    F('R', 9.5, GRAY); rtlDraw(doc, kv[0] + ':', cx, cy);
    const lw = doc.widthOfString(kv[0] + ':') + 6;
    F('B', 10, '#111'); rtlDraw(doc, kv[1], cx - lw, cy);
  });
  y += Math.ceil(info.length / 2) * 17 + 6;

  // ----- الملخص المالي -----
  const dir = st.T.closing > 0 ? 'مستحق للمورد' : st.T.closing < 0 ? 'رصيد لصالح المحل' : 'الحساب مسدد';
  const sums = [['الرصيد الافتتاحي', st.T.opening], ['إجمالي الفواتير', st.T.inv], ['إجمالي المدفوعات', st.T.pay], ['إجمالي المرتجعات', st.T.ret],
    ['إجمالي الخصومات', st.T.disc], ['تسويات أخرى', st.T.other]];
  doc.rect(M, y, CW, 64).lineWidth(.8).strokeColor(LINE).stroke();
  const bw = CW / 6;
  sums.forEach((kv, i) => {
    const xr = R - i * bw;
    if(i) doc.moveTo(xr, y + 6).lineTo(xr, y + 36).strokeColor(LINE).stroke();
    F('R', 8.5, GRAY); rtlDraw(doc, kv[0], xr - 3, y + 6, {align:'center', width:bw - 6});
    F('B', 10.5, '#111'); numDraw(doc, fmt2(kv[1]), xr - 3, y + 19, bw - 6);
  });
  doc.moveTo(M, y + 40).lineTo(R, y + 40).strokeColor(LINE).stroke();
  F('B', 12, NAVY); rtlDraw(doc, 'الرصيد الختامي:', R - 8, y + 44);
  const cl = fmt2(Math.abs(st.T.closing)) + ' ج.م';
  const lbw = doc.widthOfString('الرصيد الختامي:') + 12;
  F('B', 12, '#111'); numDraw(doc, cl, R - 8 - lbw, y + 44);
  const nw = doc.widthOfString(cl) + 12;
  F('B', 11, st.T.closing > 0 ? '#9A1B1B' : '#14633F'); rtlDraw(doc, '- ' + dir, R - 8 - lbw - nw, y + 45);
  y += 74;

  // ----- جدول الحركات -----
  const cols = [['م', 24], ['التاريخ', 56], ['رقم المستند', 60], ['نوع الحركة', 52], ['البيان', 0], ['مدين', 66], ['دائن', 66], ['الرصيد', 72]];
  cols[4][1] = CW - cols.reduce((a, c) => a + c[1], 0);
  const colX = []; { let x = R; cols.forEach(c => { colX.push(x); x -= c[1]; }); }
  const headH = 20;
  const drawHead = () => {
    doc.rect(M, y, CW, headH).fill(NAVY);
    F('B', 9, '#fff');
    cols.forEach((c, i) => rtlDraw(doc, c[0], colX[i] - 2, y + 5, {align:'center', width:c[1] - 4}));
    y += headH;
  };
  const newPage = () => { doc.addPage(); y = M; F('R', 9, GRAY); rtlDraw(doc, `تابع كشف حساب: ${st.s.name} - ${st.ref}`, R, y); y += 18; drawHead(); };
  drawHead();
  const rowOf = (vals, bold, fill) => {
    F(bold ? 'B' : 'R', 8.8, '#111');
    const lines = rtlWrap(doc, vals[4], cols[4][1] - 8);
    const h = Math.max(18, lines.length * 12 + 6);
    if(y + h > BOTTOM) newPage();
    if(fill) doc.rect(M, y, CW, h).fill(fill);
    F(bold ? 'B' : 'R', 8.8, '#111');
    vals.forEach((v, i) => {
      const cx = colX[i] - 3, w = cols[i][1] - 6;
      if(i === 4) lines.forEach((ln, k) => rtlDraw(doc, ln, cx, y + 4 + k * 12));
      else if(i >= 5 || i === 0) numDraw(doc, v, cx, y + 4, w);
      else if(AR_RE.test(v)) rtlDraw(doc, v, cx, y + 4, {align:'center', width:w});
      else numDraw(doc, v, cx, y + 4, w);
    });
    doc.moveTo(M, y + h).lineTo(R, y + h).lineWidth(.5).strokeColor(LINE).stroke();
    y += h;
  };
  rowOf(['', st.from ? dmy(st.from) : '', '', 'رصيد', 'رصيد افتتاحي' + (st.from ? ' - مجموع الحركات قبل بداية الفترة' : ''), '', '', fmt2(st.T.opening)], true, '#E8ECF3');
  if(!st.rows.length){ rowOf(['', '', '', '', 'لا توجد حركات في هذه الفترة', '', '', ''], false); }
  st.rows.forEach((e, i) => rowOf([String(e.n), dmy(e.d), String(e.doc), e.type, e.desc, e.dr ? fmt2(e.dr) : '', e.cr ? fmt2(e.cr) : '', fmt2(e.run)], false, i % 2 ? ZEBRA : null));
  rowOf(['', '', '', '', 'الإجمالي', fmt2(st.T.dr), fmt2(st.T.cr), fmt2(st.T.closing)], true, '#E8ECF3');
  // حدود الجدول الخارجية (خطوط عمودية خفيفة) — كفاية خطوط الصفوف للطباعة الأبيض والأسود
  y += 8;
  if(y + 30 > BOTTOM) newPage();
  F('R', 9, GRAY); rtlDraw(doc, 'المعادلة: الرصيد الختامي = الرصيد الافتتاحي + إجمالي الدائن - إجمالي المدين', R, y); y += 14;
  rtlDraw(doc, 'الدائن: الفواتير اللي بتزود المستحق للمورد - المدين: المدفوعات والمرتجعات والخصومات اللي بتقلله', R, y); y += 18;

  // ----- معلومات الشيكات -----
  const infoList = (title, list, note) => {
    if(!list.length) return;
    if(y + 40 > BOTTOM) newPage();
    F('B', 11, NAVY); rtlDraw(doc, title, R, y); y += 16;
    F('R', 8.5, GRAY); rtlDraw(doc, note, R, y); y += 14;
    list.forEach(p => {
      if(y + 14 > BOTTOM) newPage();
      F('R', 9, '#111');
      rtlDraw(doc, `شيك رقم ${p.check_no || '-'} - ${p.bank || 'بدون بنك'} - مكتوب ${dmy(p.pay_date)} - استحقاق ${dmy(p.due_date)} - بمبلغ ${fmt2(cents(p.amount))} ج.م`, R - 8, y); y += 14;
    });
    y += 6;
  };
  infoList('شيكات لم تُصرف بعد', st.pendChecks, 'محسوبة ضمن المدفوعات من تاريخ كتابتها حسب طريقة حساب التطبيق، ولسه ما اتصرفتش من البنك:');
  infoList('شيكات مرتدة', st.bounced, 'غير محسوبة في الرصيد:');

  // ----- ملحق المستندات -----
  if(imgs && imgs.list.length){
    doc.addPage(); y = M;
    F('B', 16, NAVY); rtlDraw(doc, 'ملحق المستندات', R, y); y += 26;
    for(const it of imgs.list){
      const cap = `حركة ${it.e.n} - ${it.e.type} - مستند ${it.e.doc} - ${dmy(it.e.d)}${it.pages > 1 ? ` - صفحة ${it.page} من ${it.pages}` : ''}`;
      if(!it.jpg){
        if(y + 40 > BOTTOM){ doc.addPage(); y = M; }
        F('B', 10, NAVY); rtlDraw(doc, cap, R, y); y += 16;
        F('R', 9, '#9A1B1B'); rtlDraw(doc, 'الصورة غير متاحة: ' + (it.err || ''), R, y); y += 22; continue;
      }
      const maxH = 330, s = Math.min(CW / it.jpg.w, maxH / it.jpg.h), w = it.jpg.w * s, h = it.jpg.h * s;
      if(y + h + 26 > BOTTOM){ doc.addPage(); y = M; }
      F('B', 10, NAVY); rtlDraw(doc, cap, R, y); y += 16;
      doc.image(it.jpg.buf, M + (CW - w) / 2, y, {width:w, height:h});
      doc.rect(M + (CW - w) / 2, y, w, h).lineWidth(.5).strokeColor(LINE).stroke();
      y += h + 14;
    }
  }

  // ----- ترقيم الصفحات وتذييل -----
  const range = doc.bufferedPageRange();
  for(let i = range.start; i < range.start + range.count; i++){
    doc.switchToPage(i);
    const fy = H - 34;
    doc.moveTo(M, fy - 4).lineTo(R, fy - 4).lineWidth(.5).strokeColor(LINE).stroke();
    F('R', 8.5, GRAY);
    rtlDraw(doc, `صفحة ${i - range.start + 1} من ${range.count}`, R, fy, {});
    rtlDraw(doc, `حسابات المحل - ${st.ref}`, M + 200, fy, {align:'left', width:200});
  }
  doc.end();
  await done;
  return new Blob(chunks.map(c => c instanceof Uint8Array ? c : new Uint8Array(c)), {type:'application/pdf'});
}

function stmtFileName(st){
  const lat = (String(st.s.name).match(/[A-Za-z0-9]+/g) || []).join('_'); const latin = /[A-Za-z]/.test(lat) ? lat : ('S' + st.s.id);
  return st.opt.mode === 'full' ? `Supplier_Statement_${latin}_from-start_to-${st.today}.pdf` : `Supplier_Statement_${latin}_${st.from}_${st.to}.pdf`;
}

/* ---------- شاشة الإصدار ---------- */
let stBusy = false, stLast = null;
async function viewStatementIssue(sid){
  const s = supplierBalances().find(x => String(x.id) === String(sid));
  if(!s) return go('/suppliers');
  const o = stOpts();
  shell({title:'إصدار كشف حساب', back:true, body:`
    <div class="card"><div class="kv" style="border:0"><span>المورد</span><span><b>${esc(s.name)}</b></span></div></div>
    <div class="card">
      <div class="section-t">فترة الكشف</div>
      <div class="seg st-seg" id="st-mode">
        <button type="button" data-v="full" class="${o.mode === 'full' ? 'on' : ''}">${I.doc}كشف حساب كامل</button>
        <button type="button" data-v="range" class="${o.mode === 'range' ? 'on' : ''}">${I.chart}لفترة محددة</button>
      </div>
      <div id="st-range" class="row2" style="margin-top:12px;${o.mode === 'range' ? '' : 'display:none'}">
        <div class="field" id="f-sf" style="margin:0"><label>من تاريخ</label><input type="date" id="sf" value="${o.from || ''}"></div>
        <div class="field" id="f-st" style="margin:0"><label>إلى تاريخ</label><input type="date" id="stt" value="${o.to || today()}"></div>
      </div>
      <div class="hint" id="st-period" style="margin-top:8px"></div>
    </div>
    <div class="card">
      <div class="section-t">نوع الكشف</div>
      <div class="seg st-seg" id="st-img">
        <button type="button" data-v="0" class="${!o.imgs ? 'on' : ''}">${I.doc}بدون صور</button>
        <button type="button" data-v="1" class="${o.imgs ? 'on' : ''}">${I.img}بالصور</button>
      </div>
      <div class="kv" style="border:0;margin-top:6px"><span>صيغة الملف</span><span><b>PDF</b> · مقاس A4</span></div>
    </div>
    <div id="st-status"></div>
    <button class="btn primary block st-btn" onclick="stPreview()">${I.doc}معاينة كشف الحساب</button>
    <div class="actions" style="margin-top:10px">
      <button class="btn ghost" onclick="stDownload()">${I.save}تحميل PDF</button>
      <button class="btn ghost" onclick="stShare()">${I.share}مشاركة PDF</button>
    </div>
    <div class="actions" style="margin-top:10px">
      <button class="btn green" onclick="stWhatsApp('sup')">${I.wa}واتساب للمورد</button>
      <button class="btn green" onclick="stWhatsApp('me')">${I.wa}واتساب لنفسي</button>
    </div>
    <div class="hint" style="margin-top:6px;text-align:center">${s.phone ? 'رقم المورد: <span class="num">' + esc(s.phone) + '</span>' : 'المورد مالوش رقم — ضيفه من تعديل بيانات المورد'} · <a class="link" onclick="localStorage.removeItem('mawredin_my_wa');toast('هيسألك عن رقمك تاني')">تغيير رقمي</a></div>
    <div class="hint" style="margin-top:10px;text-align:center">الكشف مش بيسجل أي حركة — بيقرا البيانات بس.</div>`});
  const sync1 = () => {
    const mode = $('#st-mode .on').dataset.v;
    $('#st-range').style.display = mode === 'range' ? '' : 'none';
    const o2 = {mode, imgs:$('#st-img .on').dataset.v === '1', from:$('#sf').value, to:$('#stt').value};
    saveStOpts(o2); stLast = null;
    $('#st-period').textContent = mode === 'full' ? `الفترة: من بداية التعامل حتى ${dmy(today())}` : (o2.from && o2.to ? `الفترة: من ${dmy(o2.from)} إلى ${dmy(o2.to)} (اليومين محسوبين)` : 'اختار تاريخ البداية والنهاية');
    const pend = store.queue.filter(x => x.status === 'pending' || x.status === 'sending').length;
    $('#st-status').innerHTML = (!sync.online || !navigator.onLine) ? `<div class="note-line">من غير نت: الكشف هيتعمل من البيانات المحفوظة على الجهاز وهيتكتب عليه «نسخة مبدئية».${pend ? ` فيه ${pend} عملية لسه متزامنتش.` : ''}</div>`
      : pend ? `<div class="note-line">فيه ${pend} عملية على الجهاز لسه متزامنتش — الكشف هيتكتب عليه «نسخة مبدئية» لحد ما تتزامن.</div>` : '';
  };
  document.querySelectorAll('.st-seg button').forEach(b => b.onclick = () => { b.parentNode.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); sync1(); });
  ['sf', 'stt'].forEach(id => $('#' + id).addEventListener('change', sync1));
  sync1();
  window._stSid = sid;
}
function stValidate(){
  const o = stOpts();
  if(o.mode === 'range'){
    if(!o.from) return markErr('sf', 'اختار تاريخ البداية'), null;
    if(!o.to) return markErr('st', 'اختار تاريخ النهاية'), null;
    if(o.from > o.to) return markErr('sf', 'تاريخ البداية لازم يكون قبل تاريخ النهاية'), null;
  }
  return o;
}
// بيعمل الملف مرة واحدة لنفس الاختيارات (المعاينة والتحميل والمشاركة نفس الملف بالظبط)
async function stGenerate(){
  const o = stValidate(); if(!o) return null;
  const key = JSON.stringify(o) + '|' + store.ver;
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
      if(!confirm('المراجعة المحاسبية لقت اختلاف:\n\n' + bad.map(a => '• ' + a.t + (a.d ? ' (' + a.d + ')' : '')).join('\n') + '\n\nمحدش عدّل أي بيانات. تكمل وتطلع الكشف برضه؟')) return null;
      document.body.appendChild(ov);
    }
    let imgs = null;
    if(o.imgs){
      prog('بحمّل صور المستندات…');
      imgs = await collectImages(st, (d, n) => prog(`بحمّل صور المستندات ${d} من ${n}…`));
      if(imgs.missing.length){
        ov.remove();
        const msg = imgs.missing.slice(0, 8).map(m => `• حركة ${m.e.n} - ${m.e.type} ${m.e.doc} (${dmy(m.e.d)}): ${m.err}`).join('\n');
        if(!confirm(`فيه ${imgs.missing.length} صورة مقدرتش أحمّلها:\n${msg}${imgs.missing.length > 8 ? '\n…' : ''}\n\nالأرصدة والحركات مش هتتأثر — هيتكتب مكانها «الصورة غير متاحة». تكمل؟`)) return null;
        document.body.appendChild(ov);
      }
    }
    prog('بكتب ملف الـ PDF…');
    const blob = await makeStatementPdf(st, imgs);
    stLast = {key, st, blob, name:stmtFileName(st)};
    return stLast;
  }catch(e){ console.error(e); toast('مقدرتش أعمل الكشف: ' + (e.message || e), true); return null; }
  finally{ stBusy = false; ov.remove(); }
}
window.stPreview = async () => {
  const r = await stGenerate(); if(!r) return;
  const v = document.createElement('div'); v.className = 'st-view';
  v.innerHTML = `<header class="top"><button class="iconbtn" aria-label="رجوع" onclick="this.closest('.st-view').remove()">${I.back}</button>
      <h1>معاينة الكشف</h1><button class="iconbtn" onclick="stZoom(-1)" aria-label="تصغير">−</button><button class="iconbtn" onclick="stZoom(1)" aria-label="تكبير">+</button></header>
    <div class="st-audit">${r.st.local ? '<div class="note-line">نسخة مبدئية من بيانات الجهاز — لسه ما اتأكدتش من السيرفر</div>' : ''}
      <details><summary>المراجعة المحاسبية: ${r.st.audit.every(a => a.ok) ? '✓ كل الحسابات مطابقة' : '⚠ فيه اختلاف'}</summary>
      ${r.st.audit.map(a => `<div class="${a.ok ? 'ok' : 'bad'}">${a.ok ? '✓' : '✗'} ${esc(a.t)}${a.d ? ` <small>${esc(a.d)}</small>` : ''}</div>`).join('')}</details></div>
    <div class="st-pages" id="st-pages"><div class="spin" style="margin:40px auto"></div></div>
    <div class="st-bar"><button class="btn ghost" onclick="this.closest('.st-view').remove()">${I.edit}تعديل</button>
      <button class="btn ghost" onclick="stDownload()">${I.save}تحميل</button><button class="btn ghost" onclick="stShare()">${I.share}مشاركة</button>
      <button class="btn green" onclick="stWhatsApp('sup')">${I.wa}للمورد</button><button class="btn green" onclick="stWhatsApp('me')">${I.wa}لنفسي</button></div>`;
  document.body.appendChild(v);
  try{
    const pdfjs = await loadPdfJs();
    const pdf = await pdfjs.getDocument({data: new Uint8Array(await r.blob.arrayBuffer()), disableFontFace: true, useSystemFonts: false, isEvalSupported: false}).promise;
    const box = $('#st-pages'); box.innerHTML = `<div class="hint" style="text-align:center;color:#cfd7ea">${pdf.numPages} ${pdf.numPages === 1 ? 'صفحة' : 'صفحات'} · ${esc(r.name)}</div>`;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    for(let i = 1; i <= pdf.numPages; i++){
      const page = await pdf.getPage(i), vp = page.getViewport({scale: 1.6 * dpr});
      const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height; c.className = 'st-page';
      box.appendChild(c);
      await page.render({canvasContext: c.getContext('2d'), viewport: vp}).promise;
    }
    stZoom(0);
  }catch(e){ console.error(e); $('#st-pages').innerHTML = `<div class="hint" style="color:#fff">المعاينة مش شغالة على الموبايل ده (${esc(e.message || e)}) — حمّل الملف وافتحه.</div>`; }
};
let stScale = 1;
window.stZoom = d => { stScale = d === 0 ? stScale : Math.max(.6, Math.min(3, stScale + d * .25)); document.querySelectorAll('.st-page').forEach(c => c.style.width = (stScale * 100) + '%'); };
window.stDownload = async () => { const r = await stGenerate(); if(!r) return; stSave(r); toast('اتحمّل الملف ✓'); };
// المشاركة لازم تحصل بعد ضغطة مباشرة؛ لو تجهيز الملف طوّل والموبايل رفض، بنطلب ضغطة تانية
async function shareFile(r, text, fallbackNum){
  const file = new File([r.blob], r.name, {type:'application/pdf'});
  const canFiles = navigator.canShare && navigator.canShare({files:[file]});
  if(canFiles){
    try{ await navigator.share({files:[file], text, title:`كشف حساب ${r.st.s.name}`}); return true; }
    catch(e){
      if(e.name === 'AbortError') return false;
      if(e.name === 'NotAllowedError'){
        openModal(`<h3>الكشف جاهز</h3><div class="hint" style="margin-bottom:12px">${esc(r.name)}</div>
          <button class="btn green block" id="shareNow">${I.share}ابعته دلوقتي</button>`);
        $('#shareNow').onclick = async () => { closeModal(); try{ await navigator.share({files:[file], text, title:`كشف حساب ${r.st.s.name}`}); }catch(_){} };
        return true;
      }
    }
  }
  // الموبايل مش بيدعم مشاركة الملفات: ننزّل الملف ونفتح واتساب بالرسالة، وتضيف الملف من الملفات
  stSave(r);
  if(fallbackNum !== undefined){ window.open(`https://wa.me/${fallbackNum || ''}?text=${encodeURIComponent(text + '\n(الملف اتحمّل على الموبايل — ضيفه من المرفقات)')}`, '_blank'); }
  else toast('الموبايل ده مش بيدعم المشاركة المباشرة — نزّلت الملف وتقدر تبعته من الملفات', true);
  return false;
}
function stSave(r){
  const a = document.createElement('a'); a.href = URL.createObjectURL(r.blob); a.download = r.name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}
const stMsg = r => {
  const c = r.st.T.closing, dir = c > 0 ? 'مستحق للمورد' : c < 0 ? 'رصيد لصالح المحل' : 'الحساب مسدد';
  const period = r.st.opt.mode === 'full' ? `من بداية التعامل حتى ${dmy(r.st.today)}` : `من ${dmy(r.st.from)} إلى ${dmy(r.st.to)}`;
  return `كشف حساب ${r.st.s.name}\nالفترة: ${period}\nالرصيد الختامي: ${fmt2(Math.abs(c))} ج.م (${dir})\nحسابات المحل - ورد · زهرة`;
};
window.stShare = async () => { const r = await stGenerate(); if(r) shareFile(r, stMsg(r)); };
// واتساب: للمورد أو لنفسك
const MY_WA = 'mawredin_my_wa';
window.stWhatsApp = async who_ => {
  const s = supplierBalances().find(x => String(x.id) === String(window._stSid));
  let num;
  if(who_ === 'me'){
    num = localStorage.getItem(MY_WA) || '';
    if(!num){ const v = prompt('رقم الواتساب بتاعك (مرة واحدة بس، بيتحفظ على الموبايل ده):', ''); if(!v) return; num = waNum(v); localStorage.setItem(MY_WA, num); }
  } else {
    num = s?.phone ? waNum(s.phone) : '';
    if(!num) toast('المورد مالوش رقم متسجل — هتختار الشات بنفسك', false);
  }
  const r = await stGenerate(); if(!r) return;
  toast(who_ === 'me' ? 'اختار واتساب وبعدين «أنت» أو الشات بتاعك' : `اختار واتساب وبعدين شات ${r.st.s.name}`);
  await shareFile(r, stMsg(r), num);
};
