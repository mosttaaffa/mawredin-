/* كشف الحساب، التقارير، سجل التعديلات، التصدير والنسخة الاحتياطية */
/* =================== كشف حساب المورد =================== */
// ملاحظة الحركة في سطر واحد (لو مكتوبة على كذا سطر)
const stNote = n => { const t = String(n || '').split(/\n+/).map(x => x.trim()).filter(Boolean).join(' · '); return ['تحويل', 'كاش', 'نقدي', 'فاتورة', 'دفعة'].includes(t) ? '' : t; };   // اللي بيكرر نوع الحركة مش محتاج يتكتب
async function viewStatement(id, from, to){
  // الكشف السريع بيفتح على كل الحركات (قبل كده كان آخر 3 شهور بس، فالقديم كان بيتجمع في «رصيد أول المدة» ومش باين)
  if(from === null && to === null) from = 'all';
  if(from === 'all') from = '';
  shell({title:'كشف حساب', back:true, body:skeleton('sup')});
  const [s, invs, pays] = await Promise.all([api.supplier(id), api.invoices(id), api.payments(id)]);
  const inRange = d => (!from || d >= from) && (!to || d <= to);
  const ev = [
    ...invs.map(x => ({d:String(x.inv_date).slice(0,10), c:x.created_at, desc:'فاتورة' + (x.inv_no ? ' رقم ' + x.inv_no : ''), note:stNote(x.notes), deb:Number(x.amount), cre:0})),
    ...pays.filter(CHK_PART).flatMap(p => [
      {d:String(p.pay_date).slice(0,10), c:p.created_at, info:true, desc:`شيك ${p.check_no || ''}${(p.check_status || 'pending') === 'pending' && p.due_date ? ` (يستحق ${String(p.due_date).slice(5,10).split('-').reverse().join('/')})` : ''}`.replace('  ', ' '),
       note:chkSummary(p) + ' — بيتخصم المدفوع بس', deb:0, cre:0},
      ...checkInfo(p).live.map(c => ({d:String(c.pay_date).slice(0,10), c:c.created_at, desc:`سداد من شيك ${p.check_no || ''}`.trim() + (CP_METHOD[c.method] ? ' — ' + CP_METHOD[c.method] : ''),
       note:chkSummary(p), deb:0, cre:Number(c.amount)}))]),
    ...pays.filter(p => !CHK_PART(p) && payEffect(p) > 0).map(p => ({d:String(p.pay_date).slice(0,10), c:p.created_at,
      desc: IS_ADJ(p.method) ? METHOD[p.method] : ('دفعة ' + METHOD[p.method] + (p.method === 'check' ? (p.check_no ? ` ${p.check_no}` : '') + (p.check_status === 'pending' ? ` (يستحق ${String(p.due_date).slice(5,10).split('-').reverse().join('/')})` : '') : '')),
      note:stNote(p.notes), deb:0, cre:payEffect(p) / 100})),
  ].sort((a,b) => a.d === b.d ? (a.c < b.c ? -1 : 1) : (a.d < b.d ? -1 : 1));
  let open = 0; ev.filter(e => from && e.d < from).forEach(e => open += e.deb - e.cre);
  let run = open, td = 0, tc = 0;
  const lines = [];
  const rows = ev.filter(e => inRange(e.d)).map(e => { run += e.deb - e.cre; td += e.deb; tc += e.cre; lines.push({...e, run});
    return `<tr><td>${fmtDate(e.d)}</td><td>${esc(e.desc)}${e.note ? `<br><small>${esc(e.note)}</small>` : ''}</td><td class="n deb">${e.deb ? money(e.deb) : ''}</td><td class="n cre">${e.cre ? money(e.cre) : ''}</td><td class="n">${money(run)}</td></tr>`; }).join('');
  window._stmt = {s, open, td, tc, run, from, to, lines};
  const presets = [['آخر 3 شهور', -3], ['السنة دي', 'y'], ['آخر سنة', -12], ['كل الحركات', 'all']].map(([l,v]) => {
    let f; if(v === 'all') f = 'all'; else if(v === 'y') f = today().slice(0,4) + '-01-01'; else { const d = new Date(); d.setMonth(d.getMonth() + v); f = d.toISOString().slice(0,10); }
    return {l, f, on: !to && ((from || 'all') === f)};
  });
  const custom = !presets.some(p => p.on);
  const period = from || to ? `${from ? fmtDate(from) : 'من البداية'} — ${to ? fmtDate(to) : 'لحد النهارده'}` : 'كل الحركات';
  const gn = v => `<bdi dir="ltr">${v < 0 ? '−' : ''}${Math.abs(Number(v) || 0).toLocaleString('en-US', {maximumFractionDigits:0})}</bdi>`;
  const gd = d => { const [y, m, dd] = String(d).slice(0, 10).split('-'); return `${dd}/${m}<small>${y}</small>`; };
  const grow = e => `<div class="stg-r${e.info ? ' stg-i' : ''}"><span class="stg-d">${gd(e.d)}</span><span class="stg-b"><b>${esc(e.desc)}</b>${e.note ? `<small>${esc(e.note)}</small>` : ''}</span>
      <span class="deb">${e.deb ? gn(e.deb) : ''}</span><span class="cre">${e.cre ? gn(e.cre) : ''}</span><span class="stg-run">${e.info ? '' : gn(e.run)}</span></div>`;
  const mrow = (e) => `<div class="sl">
      <div class="sl-r"><div class="sl-t">${esc(e.desc)}</div>${e.note ? `<div class="sl-n">${esc(e.note)}</div>` : ''}<div class="sl-d">${fmtDate(e.d)}</div></div>
      <div class="sl-l"><div class="sl-a ${e.info ? 'info' : e.deb ? 'deb' : 'cre'}">${e.info ? 'معلومة' : e.deb ? '+ ' + money(e.deb) : '− ' + money(e.cre)}</div><div class="sl-b">الرصيد ${money(e.run)}</div></div>
    </div>`;
  shell({title:'كشف حساب', back:true, body:`
    <div class="no-print">
      <div class="chip-row st-per">
        ${presets.map(p => `<button class="chip ${p.on ? 'on' : ''}" onclick="location.replace('#/statement/${id}?from=${p.f}&to=')">${p.l}</button>`).join('')}
        <button class="chip ${custom ? 'on' : ''}" onclick="$('#range').hidden = !$('#range').hidden">فترة تانية…</button>
      </div>
      <div class="card" id="range" ${custom ? '' : 'hidden'}>
        <div class="row2">
          <div class="field" style="margin:0"><label>من</label><input type="date" id="sf" value="${from||''}"></div>
          <div class="field" style="margin:0"><label>إلى</label><input type="date" id="st" value="${to||''}"></div>
        </div>
        <button class="btn ghost block" style="margin-top:10px" onclick="location.replace('#/statement/${id}?from='+($('#sf').value||'all')+'&to='+($('#st').value||''))">عرض</button>
      </div>
      <div class="qa4 st-acts">
        <button class="btn green" onclick="sendStatementWA()">${I.wa}صورة واتساب</button>
        <button class="btn ghost" onclick="shareStatementWA()">${I.wa}رسالة نص</button>
        <button class="btn ghost" onclick="shareStatementImage()">${I.img}حفظ صورة</button>
        <button class="btn ghost" onclick="go('/stmt/${id}')">${I.doc}كشف PDF</button>
      </div>
    </div>
    <div class="stmt" id="stmt">
      <div class="stmt-h"><img src="icons/ward.png" alt=""><div><small>ورد · زهرة</small><h2>${esc(s.name)}</h2><small>${period}</small></div><img src="icons/zahra.png" alt=""></div>
      <div class="sum3">
        <div class="a"><span>الفواتير</span><b>${money(td)}</b></div>
        <div class="b"><span>المدفوع</span><b>${money(tc)}</b></div>
        <div class="c ${run > 0 ? '' : 'zero'}"><span>${run >= 0 ? 'الرصيد المستحق' : 'رصيد لينا'}</span><b>${money(Math.abs(run))}</b></div>
      </div>
      <div class="stg">
        <div class="stg-r stg-h"><span>التاريخ</span><span>البيان</span><span>فواتير</span><span>مدفوع</span><span>الرصيد</span></div>
        ${from ? `<div class="stg-r stg-o"><span></span><span><b>رصيد أول المدة</b></span><span></span><span></span><span>${gn(open)}</span></div>` : ''}
        ${lines.map(grow).join('') || '<div class="empty" style="padding:18px">مفيش حركات في الفترة دي</div>'}
        ${lines.length ? `<div class="stg-r stg-t"><span></span><span><b>الإجمالي</b></span><span class="deb">${gn(td)}</span><span class="cre">${gn(tc)}</span><span>${gn(run)}</span></div>` : ''}
      </div>
      <div class="stmt-print"><table class="tbl">
        <thead><tr><th>التاريخ</th><th>البيان</th><th class="n">فواتير</th><th class="n">مدفوع</th><th class="n">الرصيد</th></tr></thead>
        <tbody>
          ${from ? `<tr><td></td><td>رصيد أول المدة</td><td></td><td></td><td class="n">${money(open)}</td></tr>` : ''}
          ${rows}
          <tr class="tot"><td></td><td>الإجمالي</td><td class="n">${money(td)}</td><td class="n">${money(tc)}</td><td class="n">${money(run)}</td></tr>
        </tbody>
      </table></div>
      <div class="stmt-foot"><span>اتعمل يوم ${fmtDate(today())}</span><span>ورد · زهرة</span></div>
    </div>`});
}
/* ---------- صورة كشف الحساب (مقاس واتساب) ---------- */
const STMT_PER_PAGE = 28;
function stmtImageHTML(page, pages, chunk){
  const {s, open, td, tc, run, from, to} = window._stmt;
  const cs = getComputedStyle(document.documentElement), v = k => cs.getPropertyValue(k).trim();
  const brand = '#9B1B30', soft = '#FBEFF1',   // ألوان المحل ثابتة في الصورة
  accent = v('--accent'), red = v('--red'), green = v('--green');
  const f = n => `<span style="direction:ltr;unicode-bidi:isolate;font-variant-numeric:tabular-nums">${Number(n).toLocaleString('en-US', {maximumFractionDigits:0})}</span>`;
  const dd = d => { const [y,m,x] = String(d).slice(0,10).split('-'); return `<span style="direction:ltr;unicode-bidi:isolate">${x}/${m}/${y}</span>`; };
  const period = from || to ? `${from ? dd(from) : 'من البداية'} — ${to ? dd(to) : 'لحد النهارده'}` : 'كل الحركات';
  const first = page === 0;
  return `<div style="width:1080px;background:#fff;font-family:Cairo,Tahoma,Arial,sans-serif;color:#262626;direction:rtl;padding:48px 52px 40px;box-sizing:border-box">
    <div style="display:flex;align-items:center;gap:22px;padding-bottom:22px;border-bottom:4px solid ${soft}">
      <img src="icons/ward.png" style="width:96px;height:96px;border-radius:50%">
      <div style="flex:1;text-align:center">
        <div style="font-size:24px;color:#888;font-weight:700">ورد · زهرة</div>
        <div style="font-size:44px;font-weight:800;color:${brand};line-height:1.25">كشف حساب</div>
        <div style="font-size:34px;font-weight:800">${esc(s.name)}</div>
        <div style="font-size:22px;color:#777;margin-top:4px">الفترة: ${period}</div>
      </div>
      <img src="icons/zahra.png" style="width:96px;height:96px;border-radius:50%">
    </div>
    ${first ? `<div style="display:flex;gap:16px;margin:26px 0 8px">
      <div style="flex:1;border-radius:20px;padding:18px;background:#eef4fb;text-align:center"><div style="font-size:22px;color:#666">إجمالي الفواتير</div><div style="font-size:36px;font-weight:800;color:#2b6cb0">${f(td)}</div></div>
      <div style="flex:1;border-radius:20px;padding:18px;background:#e8f5ee;text-align:center"><div style="font-size:22px;color:#666">المدفوع والمرتجعات</div><div style="font-size:36px;font-weight:800;color:${green}">${f(tc)}</div></div>
      <div style="flex:1;border-radius:20px;padding:18px;background:${run > 0 ? '#fdecef' : '#e8f5ee'};text-align:center"><div style="font-size:22px;color:#666">${run >= 0 ? 'الرصيد المستحق' : 'رصيد لينا'}</div><div style="font-size:40px;font-weight:800;color:${run > 0 ? red : green}">${f(Math.abs(run))}</div></div>
    </div>` : ''}
    <table style="width:100%;border-collapse:collapse;margin-top:18px;font-size:23px">
      <thead><tr style="background:${brand};color:#fff">
        <th style="background:${brand};color:#fff;padding:12px 10px;text-align:right;border-radius:0 14px 0 0">التاريخ</th><th style="background:${brand};color:#fff;padding:12px 10px;text-align:right">البيان</th>
        <th style="background:${brand};color:#fff;padding:12px 10px;text-align:left">فواتير</th><th style="background:${brand};color:#fff;padding:12px 10px;text-align:left">مدفوع</th><th style="background:${brand};color:#fff;padding:12px 10px;text-align:left;border-radius:14px 0 0 0">الرصيد</th></tr></thead>
      <tbody>
        ${first && from ? `<tr style="background:#faf7f2"><td style="padding:10px"></td><td style="padding:10px;font-weight:700">رصيد أول المدة</td><td></td><td></td><td style="padding:10px;text-align:left;font-weight:700">${f(open)}</td></tr>` : ''}
        ${chunk.map((e,i) => `<tr style="background:${i % 2 ? '#faf8f5' : '#fff'}">
          <td style="padding:10px;white-space:nowrap;color:#555">${dd(e.d)}</td>
          <td style="padding:10px">${esc(e.desc)}${e.note ? `<div style="font-size:18px;color:#777">${esc(e.note)}</div>` : ''}</td>
          <td style="padding:10px;text-align:left;color:#2b6cb0;font-weight:700">${e.deb ? f(e.deb) : ''}</td>
          <td style="padding:10px;text-align:left;color:${green};font-weight:700">${e.cre ? f(e.cre) : ''}</td>
          <td style="padding:10px;text-align:left;font-weight:700">${f(e.run)}</td></tr>`).join('')}
        ${!chunk.length ? `<tr><td colspan="5" style="padding:24px;text-align:center;color:#888">مفيش حركات في الفترة دي</td></tr>` : ''}
        ${page === pages - 1 ? `<tr style="background:${soft};font-weight:800"><td style="padding:12px 10px"></td><td style="padding:12px 10px">الإجمالي</td><td style="padding:12px 10px;text-align:left">${f(td)}</td><td style="padding:12px 10px;text-align:left">${f(tc)}</td><td style="padding:12px 10px;text-align:left">${f(run)}</td></tr>` : ''}
      </tbody>
    </table>
    <div style="display:flex;justify-content:space-between;margin-top:22px;font-size:20px;color:#888">
      <span>اتعمل يوم ${dd(today())}</span>${pages > 1 ? `<span>صفحة ${page + 1} من ${pages}</span>` : '<span></span>'}<span style="color:${accent};font-weight:700">ورد · زهرة</span>
    </div>
  </div>`;
}
async function statementImages(){
  await loadScript('vendor/html2canvas.min.js');
  const lines = window._stmt.lines, pages = Math.max(1, Math.ceil(lines.length / STMT_PER_PAGE));
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:-20000px;top:0;z-index:-1';
  document.body.appendChild(box);
  const files = [];
  try{
    for(let p = 0; p < pages; p++){
      box.innerHTML = stmtImageHTML(p, pages, lines.slice(p * STMT_PER_PAGE, (p + 1) * STMT_PER_PAGE));
      await Promise.all([...box.querySelectorAll('img')].map(im => im.complete ? 0 : new Promise(r => { im.onload = im.onerror = r; })));
      if(document.fonts) await document.fonts.ready;
      const canvas = await html2canvas(box.firstElementChild, {scale: 1, backgroundColor: '#ffffff', useCORS: true});
      const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.9));
      const nm = `كشف حساب ${window._stmt.s.name} ${today()}${pages > 1 ? ' - ' + (p + 1) : ''}.jpg`;
      files.push(new File([blob], nm, {type: 'image/jpeg'}));
    }
  } finally { box.remove(); }
  return files;
}
function stmtCaption(){
  const {s, td, tc, run} = window._stmt, f = n => Number(n).toLocaleString('en-US') + ' ج';
  return `كشف حساب: ${s.name}\nإجمالي الفواتير: ${f(td)}\nالمدفوع والمرتجعات: ${f(tc)}\nالرصيد المستحق: ${f(run)}\n— ورد · زهرة`;
}
function waPhone(){ let ph = String(window._stmt.s.phone || '').replace(/\D/g, ''); if(ph.startsWith('0')) ph = '2' + ph; return ph; }
// ابعت كشف الحساب صورة على واتساب
window.sendStatementWA = async () => {
  busy(true);
  let files;
  try{ files = await statementImages(); }
  catch(e){ console.error(e); busy(false); return toast('مقدرتش أعمل الصورة', true); }
  busy(false);
  // على الموبايل (والكمبيوتر لو بيدعم): قايمة المشاركة بالصورة جاهزة — اختار واتساب
  if(navigator.canShare && navigator.canShare({files})){
    try{ await navigator.share({files, text: stmtCaption()}); buzz(15); return; }
    catch(e){ if(e.name === 'AbortError') return; }
  }
  // غير كده: نحفظ الصورة ونفتح شات المورد على واتساب عشان ترفقها
  files.forEach((f, i) => setTimeout(() => download(f, f.name), i * 400));
  setTimeout(() => window.open(`https://wa.me/${waPhone()}?text=${encodeURIComponent(stmtCaption())}`, '_blank'), files.length * 400 + 300);
  toast(files.length > 1 ? `اتحفظت ${files.length} صور — ارفقهم في شات واتساب اللي هيفتح` : 'اتحفظت الصورة — ارفقها في شات واتساب اللي هيفتح');
};
window.shareStatementImage = async () => {
  busy(true);
  try{ const files = await statementImages(); files.forEach((f, i) => setTimeout(() => download(f, f.name), i * 400)); toast('اتحفظت الصورة ✓'); }
  catch(e){ console.error(e); toast('مقدرتش أعمل الصورة', true); } finally{ busy(false); }
};
window.shareStatementWA = () => window.open(`https://wa.me/${waPhone()}?text=${encodeURIComponent(stmtCaption())}`, '_blank');

/* =================== التقارير =================== */
let repMonth = today().slice(0,7);
const AR_MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const monthName = ym => `${AR_MONTHS[+ym.slice(5,7)-1]} ${ym.slice(0,4)}`;
const addMonth = (ym, n) => { const d = new Date(+ym.slice(0,4), +ym.slice(5,7)-1+n, 1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; };
const CH = document.documentElement.dataset.theme === 'bordeaux' ? {buy:'#9B1B30', pay:'#178A3C'} : document.documentElement.dataset.theme === 'greige' ? {buy:'#A68B67', pay:'#247A45'} : {buy:'#3a6f2c', pay:'#ea8fa6'};   // ألوان اتراجعت لعمى الألوان
let repTab = (() => { try{ return localStorage.getItem('mawredin_rep_tab') || 'shop'; }catch(e){ return 'shop'; } })();
window.setRepTab = t => { repTab = t; try{ localStorage.setItem('mawredin_rep_tab', t); }catch(e){} viewReports(); };
const repHead = ym => `
    <div class="tabs rep-tabs" hidden><button class="${repTab === 'shop' ? 'on' : ''}" onclick="setRepTab('shop')">ملخص المحل</button><button class="${repTab === 'sup' ? 'on' : ''}" onclick="setRepTab('sup')">الموردين</button></div>
    <div class="month-bar">
      <button class="iconbtn" onclick="repMonth=addMonth(repMonth,-1);viewReports()" aria-label="الشهر اللي فات">${I.back}</button>
      <b>${monthName(ym)}</b>
      <button class="iconbtn" style="transform:scaleX(-1)" onclick="repMonth=addMonth(repMonth,1);viewReports()" aria-label="الشهر الجاي">${I.back}</button>
    </div>`;
async function viewReports(){
  if(repTab === 'shop') return viewRepShop();
  return viewRepSuppliers();
}
/* ---------- قايمة التقارير (زي الرئيسية): بتختار التقرير اللي عايزه ---------- */
function viewReportsMenu(){
  const mk = today().slice(0, 7), d = repMonthData(mk), net = d.sales - d.exp;
  const m = c => `<span class="m"><span class="num">${fmt0(Math.abs(c) / 100)}</span> ج.م</span>`;
  const sb = supplierBalances(), supDue = sb.reduce((a, r) => a + Math.max(0, Math.round(Number(r.balance) * 100)), 0);
  const LS = loansSummary(), BS = bankSummary(), XS = expSummary();
  const chk = [...(store.eff?.payments?.values() || [])].filter(p => p.method === 'check' && p.check_status === 'pending');
  const chkRem = chk.reduce((a, p) => a + checkInfo(p).remaining, 0);
  const tile = (k, t, go, extra = '') => `<button class="db-tile${extra ? ' rich' : ''}" onclick="${go}" aria-label="${t}">
      <span class="db-ic">${dbIcon(k)}</span><span class="db-tb"><b>${t}</b>${extra}</span><span class="db-go">${I.chevL}</span></button>`;
  const row = (ic, t, s, go) => `<button class="db-op" onclick="${go}"><span class="db-oi">${I[ic] || I.doc}</span><span class="db-ot"><b>${t}</b><small>${s}</small></span><span class="db-go">${I.chevL}</span></button>`;
  shell({title:'التقارير', nav:'reports', body:`
    <div class="db one rp-menu">
    <div class="db-h"><span>${I.chart || I.grid}تقارير الشهر</span><i></i></div>
    <div class="db-grid">
      ${tile('cash', 'ملخص المحل', "go('/reports/shop')", `<em class="${net < 0 ? 'neg' : ''}">${net < 0 ? '−' : ''}${m(net)}</em><small class="c">صافي الشهر</small>`)}
      ${tile('suppliers', 'تقرير الموردين', "go('/reports/sup')", `<em class="neg">${m(supDue)}</em><small class="c">مستحق للموردين</small>`)}
      ${tile('expenses', 'المصروفات', "go('/expenses')", XS.month ? `<em class="neg">${m(XS.month)}</em><small class="c">مصروفات الشهر</small>` : '<small class="c">مفيش مصروفات الشهر ده</small>')}
      ${tile('banks', 'البنك', "go('/banks')", BS.n ? `<em class="${BS.bal < 0 ? 'neg' : ''}">${BS.bal < 0 ? '−' : ''}${m(BS.bal)}</em><small class="c">رصيد البنك</small>` : '<small class="c">حركة البنك</small>')}
      ${tile('checks', 'الشيكات', "go('/checks')", `<em>${m(chkRem)}</em><small class="c">باقي على ${chk.length} شيك</small>`)}
      ${tile('loans', 'القروض', "go('/loans')", LS.n ? `<em class="neg">${m(LS.remaining)}</em><small class="c">${LS.late ? LS.late + ' قسط متأخر' : LS.n + ' قرض جاري'}</small>` : '<small class="c">مفيش قروض</small>')}
    </div>
    <div class="db-h"><span>${I.doc}كشوف الحساب</span><i></i></div>
    <div class="card db-ops">
      ${row('box', 'كشف حساب مورد', 'اختار المورد وشوف كل حركاته وابعته واتساب', 'rpPick(\'sup\')')}
      ${row('users', 'كشف حساب موظف', 'المستحقات والاستقطاعات لكل شهر', 'rpPick(\'emp\')')}
    </div>
    <div class="db-h"><span>${I.layers || I.grid}تانية</span><i></i></div>
    <div class="card db-ops">
      ${row('hist', 'سجل التعديلات', 'كل اللي اتضاف واتعدل واتمسح ومين عمله', "go('/log')")}
      ${row('xls', 'تصدير Excel', 'الموردين والفواتير والدفعات والشيكات في ملف واحد', 'exportExcel()')}
    </div>
    </div>`});
}
// اختيار المورد أو الموظف لكشف الحساب
window.rpPick = k => {
  const list = k === 'sup' ? supplierBalances().slice().sort((a, b) => a.name.localeCompare(b.name, 'ar')).map(r => ({id:r.id, n:r.name, b:Number(r.balance), go:`/statement/${r.id}`}))
    : employeeBalances().filter(r => r.active !== false).sort((a, b) => a.name.localeCompare(b.name, 'ar')).map(r => ({id:r.id, n:r.name, b:Number(r.balance), go:`/emp/${r.id}`}));
  openModal(`<h3 style="margin:0 0 10px">${k === 'sup' ? 'كشف حساب مورد' : 'كشف حساب موظف'}</h3>
    <input class="search" placeholder="ابحث بالاسم..." oninput="const q=this.value.trim();document.querySelectorAll('#rpl .db-op').forEach(b=>b.hidden=q&&!b.dataset.n.includes(q))" style="margin-bottom:8px">
    <div class="db-ops rp-pick" id="rpl">${list.map(r => `<button class="db-op" data-n="${esc(r.n)}" onclick="closeModal();go('${r.go}')"><span class="db-ot"><b>${esc(r.n)}</b></span><span class="db-oa ${r.b > 0 ? 'neg' : r.b < 0 ? 'pos' : ''}"><bdi dir="ltr">${r.b < 0 ? '−' : ''}${fmt0(Math.abs(r.b))}</bdi> ج</span></button>`).join('') || '<div class="empty">مفيش</div>'}</div>`);
};

/* ---------- ملخص المحل: المبيعات والمصروفات والصافي لكل شهر (من البيانات اللي على الجهاز — بيشتغل من غير نت) ---------- */
function repMonthData(mk){
  const S = salesByMonth()[mk], X = expByMonth()[mk];
  const sales = salesAll().filter(r => String(r.sale_date).startsWith(mk));
  const cash = sales.reduce((a, r) => a + SC(r.cash), 0), tr = sales.reduce((a, r) => a + SC(r.transfer), 0);
  const days = S ? Object.values(S.days) : [];
  const best = days.reduce((b, D) => !b || D.total > b.total ? D : b, null);
  return {sales:S ? S.total : 0, exp:X ? X.total : 0, cash, tr, sBy:S ? S.by : {}, xBy:X ? X.by : {}, cats:X ? X.cats : {}, nDays:days.length, best};
}
function viewRepShop(){
  const ym = repMonth, cur = repMonthData(ym), prev = repMonthData(addMonth(ym, -1));
  const net = cur.sales - cur.exp;
  const m = c => `<span class="num">${(Math.abs(c) / 100).toLocaleString('en-US', {maximumFractionDigits:0})}</span> ج`;
  const sm = c => c < 0 ? `(${m(c)})` : m(c);
  const shortM = k => `${AR_MONTHS[+k.slice(5, 7) - 1]} ${k.slice(2, 4)}`;
  // مقارنة بالشهر اللي فات: «طالع» في المبيعات كويس، و«طالع» في المصروفات وحش
  const delta = (a, b, upGood) => { if(!b) return '<small class="rp-d">—</small>'; const pc = Math.round((a - b) / Math.abs(b) * 100);
    if(!pc) return '<small class="rp-d">زي الشهر اللي فات</small>';
    const good = (pc > 0) === upGood; return `<small class="rp-d ${good ? 'up' : 'dn'}">${pc > 0 ? '▲' : '▼'} ${Math.abs(pc)}% عن الشهر اللي فات</small>`; };
  // البنك آخر الشهر
  let bankEnd = null; if(bankStart() && bankStart() <= ym + '-31'){ bankEnd = 0; for(const x of bankItems()) if(x.d <= ym + '-31') bankEnd += x.amt; }
  // الفروع
  const BR = ['ورد', 'زهرة'];
  const brRow = b => { const sv = cur.sBy[b] || 0, xv = cur.xBy[b] || 0; return `<tr><td>${b}</td><td class="n">${m(sv)}</td><td class="n">${m(xv)}</td><td class="n ${sv - xv < 0 ? 'neg' : ''}">${sm(sv - xv)}</td></tr>`; };
  // بنود المصروفات (أكبر 8 + الباقي «أخرى»)
  const cats = Object.entries(cur.cats).map(([k, v]) => ({k, amt:v.amt, auto:v.auto})).sort((a, b) => b.amt - a.amt);
  const top = cats.slice(0, 8), rest = cats.slice(8).reduce((a, c) => a + c.amt, 0); if(rest) top.push({k:'باقي البنود', amt:rest});
  const cmax = Math.max(1, ...top.map(c => c.amt));
  // آخر 6 شهور
  const series = []; for(let i = 5; i >= 0; i--){ const k = addMonth(ym, -i), d = repMonthData(k); series.push({m:k, sales:d.sales / 100, exp:d.exp / 100}); }
  const defs = [{k:'sales', c:CH.pay, l:'مبيعات'}, {k:'exp', c:CH.buy, l:'مصروفات'}];
  const pct = (a, t) => t ? Math.round(a / t * 100) : 0;
  shell({title:repTab === 'shop' ? 'ملخص المحل' : 'تقرير الموردين', back:true, right:refreshBtn, nav:'reports', body:`${repHead(ym)}
    <div class="rp-k">
      <div class="rp-t hl"><span>${I.store}المبيعات</span><b>${m(cur.sales)}</b>${delta(cur.sales, prev.sales, true)}</div>
      <div class="rp-t"><span>${I.expense}المصروفات</span><b>${m(cur.exp)}</b>${delta(cur.exp, prev.exp, false)}</div>
      <div class="rp-t"><span>${I.layers}الصافي</span><b class="${net < 0 ? 'neg' : 'pos'}">${sm(net)}</b><small class="rp-d">المبيعات − كل اللي اتصرف</small></div>
      <div class="rp-t"><span>${I.bank}البنك آخر الشهر</span><b class="${bankEnd < 0 ? 'neg' : ''}">${bankEnd == null ? '—' : sm(bankEnd)}</b><small class="rp-d">${bankEnd == null ? 'سجّل رصيد أول المدة' : 'من حساب البنك'}</small></div>
    </div>
    ${cur.sales ? `<div class="card rp-split">
      <div class="section-t">المبيعات كاش وتحويلات</div>
      <div class="rp-bar" role="img" aria-label="كاش ${pct(cur.cash, cur.sales)}% وتحويلات ${pct(cur.tr, cur.sales)}%"><i style="--w:${pct(cur.cash, cur.sales)}%;--c:${CH.pay}"></i><i style="--w:${pct(cur.tr, cur.sales)}%;--c:${CH.buy}"></i></div>
      <div class="rp-lg"><span><i style="background:${CH.pay}"></i>كاش ${m(cur.cash)} · ${pct(cur.cash, cur.sales)}%</span><span><i style="background:${CH.buy}"></i>تحويلات ${m(cur.tr)} · ${pct(cur.tr, cur.sales)}%</span></div>
      <div class="rp-mini"><span>متوسط اليوم <b>${m(Math.round(cur.sales / Math.max(1, cur.nDays)))}</b></span>${cur.best ? `<span>أعلى يوم <b>${m(cur.best.total)}</b> <small>${fmtDate(cur.best.date)}</small></span>` : ''}</div>
    </div>` : ''}
    <div class="card">
      <div class="section-t">الفروع في ${monthName(ym)}</div>
      <table class="tbl"><thead><tr><th>الفرع</th><th class="n">مبيعات</th><th class="n">مصروفات</th><th class="n">الصافي</th></tr></thead><tbody>
        ${BR.map(brRow).join('')}
        <tr><td>مشترك</td><td class="n">—</td><td class="n">${m(cur.xBy['مشترك'] || 0)}</td><td class="n neg">${cur.xBy['مشترك'] ? sm(-(cur.xBy['مشترك'])) : m(0)}</td></tr>
        <tr class="tot"><td>الإجمالي</td><td class="n">${m(cur.sales)}</td><td class="n">${m(cur.exp)}</td><td class="n ${net < 0 ? 'neg' : ''}">${sm(net)}</td></tr>
      </tbody></table>
      <div class="hint" style="margin-top:6px">«مشترك» = دفعات الموردين والأقساط والمصروفات اللي مش على فرع معين.</div>
    </div>
    <div class="card">
      <div class="section-t">المبيعات والمصروفات — آخر 6 شهور</div>
      <div class="legend">${defs.map(d => `<span><i style="background:${d.c}"></i>${d.l}</span>`).join('')}</div>
      <div class="chart-wrap" id="chart">${barChart(series, defs)}<div class="chart-tip" id="tip"></div></div>
      <table class="tbl" style="margin-top:10px">
        <thead><tr><th>الشهر</th><th class="n">مبيعات</th><th class="n">مصروفات</th><th class="n">الصافي</th></tr></thead>
        <tbody>${series.slice().reverse().map(x => `<tr${x.m === ym ? ' class="cur"' : ''}><td>${shortM(x.m)}</td><td class="n">${m(x.sales * 100)}</td><td class="n">${m(x.exp * 100)}</td><td class="n ${x.sales - x.exp < 0 ? 'neg' : ''}">${sm((x.sales - x.exp) * 100)}</td></tr>`).join('')}</tbody>
      </table>
    </div>
    <div class="card">
      <div class="section-t">المصروفات حسب البند</div>
      ${top.length ? `<div class="rp-cats">${top.map(c => `<button class="rp-c" onclick="expMonth='${ym}';expOpen=new Set(['${ym}']);go('/expenses')">
          <span class="rp-cn">${esc(c.k)}${c.auto ? ' <small>تلقائي</small>' : ''}</span><span class="rp-cv">${m(c.amt)} <small>${pct(c.amt, cur.exp)}%</small></span>
          <i style="--w:${Math.max(2, Math.round(c.amt / cmax * 100))}%"></i></button>`).join('')}</div>` : '<div class="empty" style="padding:14px">مفيش مصروفات في الشهر ده</div>'}
    </div>`});
  wireChart();
}

async function viewRepSuppliers(){
  if(!$('.month-bar')) shell({title:'تقرير الموردين', back:true, right:refreshBtn, nav:'reports', body:skeleton('home')});
  const ym = repMonth;
  const [r, series] = await Promise.all([api.reportMonth(ym), api.reportSeries(ym, 6)]);
  const N = v => Number(v || 0);
  const buy = N(r.buy), paid = N(r.cash) + N(r.check) + N(r.transfer), adj = N(r.return) + N(r.discount);
  series.forEach(x => { x.buy = N(x.buy); x.pay = N(x.pay); });
  const perRows = r.per || [];
  const PER_MAX = 50;
  shell({title:repTab === 'shop' ? 'ملخص المحل' : 'تقرير الموردين', back:true, right:refreshBtn, nav:'reports', body:`${repHead(ym)}
    <div class="card hero" style="padding:14px">
      <div class="lbl">مشتريات الشهر (فواتير)</div><div class="big">${money(buy)}</div>
      <div class="row"><div class="mini"><span>اتدفع في الشهر</span><b>${money(paid)}</b></div><div class="mini"><span>الفرق</span><b>${money(buy - paid - adj)}</b></div></div>
    </div>
    <div class="stat4">
      <div class="card"><span>كاش</span><b>${money(r.cash)}</b></div>
      <div class="card"><span>شيكات</span><b>${money(r.check)}</b></div>
      <div class="card"><span>تحويلات</span><b>${money(r.transfer)}</b></div>
      <div class="card"><span>مرتجعات وخصومات</span><b>${money(adj)}</b></div>
    </div>
    ${N(r.due_n) ? `<div class="card" onclick="go('/checks')" style="cursor:pointer"><div class="set-row"><span>${I.bell.replace('<svg','<svg style="width:20px;height:20px;vertical-align:-4px;color:var(--amber)"')} شيكات مستحقة الشهر ده (${N(r.due_n)})</span><b>${money(r.due_sum)}</b></div></div>` : ''}
    <div class="card">
      <div class="section-t">آخر 6 شهور</div>
      <div class="legend"><span><i style="background:${CH.buy}"></i>مشتريات</span><span><i style="background:${CH.pay}"></i>مدفوعات</span></div>
      <div class="chart-wrap" id="chart">${barChart(series)}<div class="chart-tip" id="tip"></div></div>
      <table class="tbl" style="margin-top:10px">
        <thead><tr><th>الشهر</th><th class="n">مشتريات</th><th class="n">مدفوعات</th></tr></thead>
        <tbody>${series.slice().reverse().map(x => `<tr><td>${monthName(x.m)}</td><td class="n">${money(x.buy)}</td><td class="n">${money(x.pay)}</td></tr>`).join('')}</tbody>
      </table>
    </div>
    <div class="card">
      <div class="section-t">الموردين في ${monthName(ym)} (${perRows.length})</div>
      ${perRows.length ? `<table class="tbl"><thead><tr><th>المورد</th><th class="n">مشتريات</th><th class="n">مدفوع</th></tr></thead><tbody id="perbody">
        ${perRows.slice(0, PER_MAX).map(o => `<tr onclick="go('/s/${o.id}')" style="cursor:pointer"><td>${esc(o.name)}</td><td class="n">${money(o.buy)}</td><td class="n">${money(o.pay)}</td></tr>`).join('')}
      </tbody></table>${perRows.length > PER_MAX ? `<button class="btn ghost block" style="margin-top:10px" onclick="this.remove();$('#perbody').insertAdjacentHTML('beforeend', window._perRest)">عرض الكل (${perRows.length})</button>` : ''}` : '<div class="empty" style="padding:14px">مفيش حركات في الشهر ده</div>'}
    </div>`});
  window._perRest = perRows.slice(PER_MAX).map(o => `<tr onclick="go('/s/${o.id}')" style="cursor:pointer"><td>${esc(o.name)}</td><td class="n">${money(o.buy)}</td><td class="n">${money(o.pay)}</td></tr>`).join('');
  wireChart();
}
const CH_DEF = () => [{k:'buy', c:CH.buy, l:'مشتريات'}, {k:'pay', c:CH.pay, l:'مدفوعات'}];
function barChart(series, defs = CH_DEF()){
  const W = 340, H = 190, pl = 6, pr = 44, pt = 10, pb = 26;
  const max = Math.max(1, ...series.flatMap(r => defs.map(d => r[d.k])));
  const step = Math.pow(10, Math.floor(Math.log10(max))); const top = Math.ceil(max / step) * step;
  const iw = W - pl - pr, ih = H - pt - pb, gw = iw / series.length, bw = Math.min(18, (gw - 14) / 2);
  const y = v => pt + ih - (v / top) * ih;
  const fmtK = v => v >= 1e6 ? (v/1e6).toFixed(v%1e6?1:0) + 'م' : v >= 1e3 ? Math.round(v/1e3) + 'ك' : String(v);
  let g = '';
  [0, .5, 1].forEach(f => { const yy = y(top*f); g += `<line x1="${pl}" x2="${W-pr}" y1="${yy}" y2="${yy}" stroke="#ece6e0" stroke-width="1"/><text x="${W-pr+6}" y="${yy+4}" font-size="10" fill="#8a7f82">${fmtK(top*f)}</text>`; });
  const bar = (x, v, c, k, i) => { const h = Math.max(v ? 2 : 0, pt + ih - y(v)); if(!h) return '';
    return `<path d="M${x},${pt+ih} v${-(h-4)} q0,-4 4,-4 h${bw-8} q4,0 4,4 v${h-4} z" fill="${c}" data-i="${i}" data-k="${k}"/>`; };
  series.forEach((r, i) => {
    const cx = pl + gw*i + gw/2;
    g += bar(cx - bw - 1, r[defs[0].k], defs[0].c, defs[0].k, i) + bar(cx + 1, r[defs[1].k], defs[1].c, defs[1].k, i);
    g += `<rect x="${pl+gw*i}" y="${pt}" width="${gw}" height="${ih}" fill="transparent" data-hit="${i}"/>`;
    g += `<text x="${cx}" y="${H-8}" font-size="10.5" text-anchor="middle" fill="#8a7f82">${AR_MONTHS[+r.m.slice(5,7)-1]}</text>`;
  });
  window._series = series; window._chartDefs = defs;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${defs.map(d => d.l).join(' و')} آخر 6 شهور" style="direction:ltr">${g}</svg>`;
}
function wireChart(){
  const wrap = $('#chart'), tip = $('#tip'); if(!wrap) return;
  const show = e => {
    const t = e.target.closest('[data-hit],[data-i]'); if(!t){ tip.style.display = 'none'; return; }
    const i = +(t.dataset.hit ?? t.dataset.i), r = window._series[i], b = wrap.getBoundingClientRect();
    tip.innerHTML = `<b>${monthName(r.m)}</b>` + (window._chartDefs || CH_DEF()).map(d => `<br><i style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${d.c}"></i> ${d.l} ${money(r[d.k])}`).join('');
    tip.style.display = 'block'; tip.style.left = Math.min(b.width - 70, Math.max(70, e.clientX - b.left)) + 'px'; tip.style.top = (e.clientY - b.top - 8) + 'px';
  };
  wrap.addEventListener('pointermove', show); wrap.addEventListener('pointerdown', show);
  wrap.addEventListener('pointerleave', () => tip.style.display = 'none');
}

/* =================== سجل التعديلات =================== */
let logShown = 200;
async function viewLog(){
  shell({title:'سجل التعديلات', back:true, body:skeleton('home')});
  const [rows, sups] = await Promise.all([api.log(0, logShown), api.suppliers()]);
  const name = new Map(sups.map(x => [x.id, x.name]));
  const f = n => Number(n).toLocaleString('en-US') + ' ج';
  const what = r => {
    const o = r.old_row || {}, n = r.new_row || {}, row = r.action === 'delete' ? o : n;
    const sup = r.supplier_id && name.get(r.supplier_id) ? ' — ' + name.get(r.supplier_id) : (r.entity !== 'members' && (o.name || n.name) ? '' : '');
    const verb = {insert:'سجّل', update:'عدّل', delete:'مسح'}[r.action];
    let t = '', ch = [];
    if(r.entity === 'suppliers') t = `${{insert:'أضاف', update:'عدّل بيانات', delete:'مسح'}[r.action]} المورد ${row.name}`;
    else if(r.entity === 'members') t = r.action === 'insert' ? `أضاف المستخدم ${row.display_name || row.email} للتطبيق` : r.action === 'delete' ? `شال المستخدم ${row.display_name || row.email} من التطبيق` : (o.display_name !== n.display_name ? `غيّر اسم العرض ${o.display_name ? 'من ' + o.display_name + ' ' : ''}لـ ${n.display_name || '—'}` : `عدّل بيانات مستخدم`);
    else if(r.entity === 'invoices') t = `${verb} فاتورة${row.inv_no ? ' رقم ' + row.inv_no : ''} بـ ${f(row.amount)}${sup}`;
    else if(r.entity === 'payments'){
      const kind = IS_ADJ(row.method) ? METHOD[row.method] : 'دفعة ' + METHOD[row.method];
      if(r.action === 'update' && o.check_status !== n.check_status && n.check_status) t = `علّم الشيك${n.check_no ? ' رقم ' + n.check_no : ''} (${f(n.amount)}) إنه «${CHK[n.check_status]}»${sup}`;
      else t = `${verb} ${kind} بـ ${f(row.amount)}${sup}`;
    }
    else if(r.entity === 'check_payments'){
      const ck = store.eff.payments.get(row.payment_id), cn = ck?.check_no ? ' رقم ' + ck.check_no : '';
      t = r.action === 'insert' ? `سجّل سداد ${f(row.amount)} على الشيك${cn} (${CP_METHOD[row.method] || ''})${sup}`
        : (r.action === 'update' && !o.voided && n.voided) ? `ألغى دفعة سداد ${f(row.amount)} من الشيك${cn}${n.void_reason ? ' — السبب: ' + n.void_reason : ''}${sup}`
        : `عدّل دفعة سداد على الشيك${cn}${sup}`;
    }
    else if(r.entity === 'loans') t = `${{insert:'سجّل', update:'عدّل', delete:'مسح'}[r.action]} قرض ${row.bank || ''} (${f(row.total_amount)})`;
    else if(r.entity === 'expenses') t = `${{insert:'سجّل', update:'عدّل', delete:'مسح'}[r.action]} مصروف ${row.category || ''} (${row.branch || ''}) يوم ${row.exp_date ? fmtDate(row.exp_date) : ''} — ${f(row.amount)}`;
    else if(r.entity === 'bank_moves') t = `${{insert:'سجّل', update:'عدّل', delete:'مسح'}[r.action]} حركة بنك: ${BANK_KIND[row.kind] || ''} يوم ${row.move_date ? fmtDate(row.move_date) : ''} — ${f(row.amount)}`;
    else if(r.entity === 'daily_sales') t = `${{insert:'سجّل', update:'عدّل', delete:'مسح'}[r.action]} مبيع ${row.branch || ''} يوم ${row.sale_date ? fmtDate(row.sale_date) : ''} (كاش ${f(row.cash)} + تحويل ${f(row.transfer)})`;
    else if(r.entity === 'loan_payments'){ const Lq = store.eff.loans?.get(row.loan_id); t = `${{insert:'سجّل', update:'عدّل', delete:'مسح'}[r.action]} قسط ${f(row.amount)}${Number(row.penalty) ? ' + غرامة ' + f(row.penalty) : ''} لقرض ${Lq?.bank || ''}`; }
    else if(r.entity === 'employees') t = `${{insert:'أضاف', update:'عدّل بيانات', delete:'مسح'}[r.action]} الموظف ${row.name}`;
    else if(r.entity === 'emp_settlements') t = `${verb} تسوية موظف (${row.period_from} — ${row.period_to}) صافي ${f(row.net_balance ?? 0)}`;
    else if(r.entity === 'emp_transactions') t = `${verb} حركة موظف (${({salary:'مرتب',commission:'عمولة',advance:'سلفة',deduction:'خصم',payment:'صرف',adjustment:'تسوية'})[row.kind] || ''}) بـ ${f(row.amount)}`;
    else if(r.entity === 'emp_import_batches') t = `استورد كشف موظفين (${row.employee_count} موظف) ${row.period_from} — ${row.period_to}`;
    if(r.action === 'update'){
      const L = {amount:'المبلغ', inv_date:'التاريخ', pay_date:'التاريخ', inv_no:'رقم الفاتورة', due_date:'الاستحقاق', method:'النوع', name:'الاسم', phone:'التليفون', image_path:'الصورة', invoice_id:'الفاتورة المربوطة', notes:'الملاحظات', check_no:'رقم الشيك', bank:'البنك'};
      Object.keys(L).forEach(k => { if(k in n && JSON.stringify(o[k]) !== JSON.stringify(n[k])){
        if(k === 'image_path') ch.push('غيّر الصورة');
        else if(k === 'amount') ch.push(`المبلغ: ${f(o[k])} ← ${f(n[k])}`);
        else if(k === 'method') ch.push(`النوع: ${METHOD[o[k]]} ← ${METHOD[n[k]]}`);
        else if(k !== 'invoice_id') ch.push(`${L[k]}: ${o[k] ?? '—'} ← ${n[k] ?? '—'}`);
      }});
    }
    return {t, ch};
  };
  const when = a => { const d = new Date(a); return d.toLocaleDateString('en-GB') + ' ' + d.toLocaleTimeString('ar-EG', {hour:'numeric', minute:'2-digit'}); };
  shell({title:'سجل التعديلات', back:true, body:`
    <div class="hint" style="margin:0 4px 10px">آخر ${rows.length} حركة — مين عمل إيه وإمتى. السجل ده محدش يقدر يعدّله أو يمسحه.</div>
    ${''}
    <div class="card">${rows.length ? rows.map(r => { const w = what(r); return `
      <div class="log-row"><div class="log-dot ${r.action}">${r.action === 'insert' ? I.plus : r.action === 'update' ? I.edit : I.close}</div>
        <div style="flex:1;min-width:0"><div class="t">${esc(who(r.actor))} ${esc(w.t)}</div>
        ${w.ch.length ? `<div class="chg">${w.ch.map(esc).join(' · ')}</div>` : ''}
        <div class="s"><span class="num">${when(r.at)}</span></div></div></div>`; }).join('') : `<div class="empty">${I.hist}<div>لسه مفيش حركات</div></div>`}
    </div>
    ${rows.length === logShown ? `<button class="btn ghost block" onclick="logShown+=300;viewLog()">عرض أقدم</button>` : ''}`});
}

/* =================== تصدير Excel ونسخة احتياطية =================== */
window.exportExcel = async () => {
  toast('بيجهّز الملف... لو البيانات كبيرة ممكن ياخد دقيقة');
  busy(true);
  try{
    await loadScript('vendor/xlsx.full.min.js');
    const [bal, sups, invs, pays] = await Promise.all([api.balances(), api.allSuppliers(), api.allInvoices(), api.allPayments()]);
    const name = new Map(sups.map(x => [x.id, x.name])), invNo = new Map(invs.map(i => [i.id, i.inv_no || i.inv_date]));
    const N = v => Number(v);
    const sheet = (rows, widths) => { const ws = XLSX.utils.json_to_sheet(rows); ws['!cols'] = widths.map(w => ({wch:w})); return ws; };
    const wb = XLSX.utils.book_new(); wb.Workbook = {Views:[{RTL:true}]};
    XLSX.utils.book_append_sheet(wb, sheet(bal.map(b => ({'المورد':b.name, 'التليفون':b.phone||'', 'الفواتير':N(b.total_invoices), 'المدفوع':N(b.total_paid), 'مرتجعات وخصومات':N(b.total_adjust), 'الباقي':N(b.balance), 'شيكات لسه':N(b.pending_checks)})), [24,14,14,14,16,14,14]), 'الموردين');
    XLSX.utils.book_append_sheet(wb, sheet(invs.map(i => ({'التاريخ':String(i.inv_date).slice(0,10), 'المورد':name.get(i.supplier_id), 'رقم الفاتورة':i.inv_no||'', 'المبلغ':N(i.amount), 'ملاحظات':i.notes||'', 'سجّلها':shortName(i.created_by)})), [12,24,14,14,24,12]), 'الفواتير');
    XLSX.utils.book_append_sheet(wb, sheet(pays.map(p => ({'التاريخ':String(p.pay_date).slice(0,10), 'المورد':name.get(p.supplier_id), 'النوع':METHOD[p.method], 'المبلغ':N(p.amount), 'رقم الشيك':p.check_no||'', 'البنك':p.bank||'', 'الاستحقاق':p.due_date?String(p.due_date).slice(0,10):'', 'حالة الشيك':p.check_status?CHK[p.check_status]:'', 'عن فاتورة':p.invoice_id?invNo.get(p.invoice_id)||'':'', 'ملاحظات':p.notes||'', 'سجّلها':shortName(p.created_by)})), [12,24,10,14,12,14,12,14,14,24,12]), 'الدفعات');
    XLSX.utils.book_append_sheet(wb, sheet(pays.filter(p => p.method === 'check').sort((a,b) => a.due_date < b.due_date ? -1 : 1).map(p => ({'الاستحقاق':String(p.due_date).slice(0,10), 'المورد':name.get(p.supplier_id), 'المبلغ':N(p.amount), 'رقم الشيك':p.check_no||'', 'البنك':p.bank||'', 'الحالة':CHK_PAY[checkInfo(p).pay], 'المسدد':checkInfo(p).settled/100, 'المتبقي':checkInfo(p).remaining/100})), [12,24,14,12,14,16,14,14]), 'الشيكات');
    XLSX.writeFile(wb, `حسابات الموردين ${today()}.xlsx`);
    toast('اتعمل ملف Excel ✓');
  }catch(e){ console.error(e); toast('مقدرتش أعمل الملف', true); } finally{ busy(false); }
};
window.enableNotifs = async () => {
  if(!('Notification' in window) || !window.isSecureContext) return toast('الإشعارات بتشتغل لما التطبيق يتفتح من رابط https (بعد الرفع على GitHub) أو من localhost على الكمبيوتر', true);
  const r = await Notification.requestPermission();
  if(r === 'granted'){ toast('اتفعّلت تنبيهات الشيكات ✓'); try{ notifyChecks(soonToChecks(await api.checkSummary())); }catch(e){} }
  else toast('الإشعارات اترفضت — فعّلها من إعدادات المتصفح', true);
  viewSettings();
};
