/* الرئيسية (ملخص حسابات المحل) + قائمة «المزيد» والأقسام */

/* =================== الرئيسية =================== */
async function viewDashboard(){
  if(!$('.dash')) shell({title:'حسابات المحل', right:refreshBtn, nav:'home', body:skeleton('home')});
  const ym = today().slice(0,7);
  const [rows, cs, rm, log] = await Promise.all([api.balances(), api.checkSummary(), api.reportMonth(ym), api.log(0, 6)]);
  const checks = soonToChecks(cs); notifyChecks(checks);
  const N = v => Number(v || 0);
  const owed = rows.reduce((a,r) => a + Math.max(0, N(r.balance)), 0);
  const paidMonth = N(rm.cash) + N(rm.check) + N(rm.transfer);
  const top = rows.filter(r => N(r.balance) > 0).slice(0, 5);
  const names = new Map(rows.map(r => [r.id, r.name]));
  const logLine = r => {
    const o = r.old_row || {}, n = r.new_row || {}, row = r.action === 'delete' ? o : n;
    const verb = {insert:'سجّل', update:'عدّل', delete:'مسح'}[r.action];
    if(r.entity === 'invoices') return `${verb} فاتورة بـ ${Number(row.amount).toLocaleString('en-US')} ج`;
    if(r.entity === 'payments') return `${verb} ${IS_ADJ(row.method) ? METHOD[row.method] : 'دفعة ' + METHOD[row.method]} بـ ${Number(row.amount).toLocaleString('en-US')} ج`;
    if(r.entity === 'suppliers') return `${{insert:'أضاف', update:'عدّل', delete:'مسح'}[r.action]} المورد ${row.name}`;
    return `${r.action === 'insert' ? 'أضاف' : 'شال'} ${row.email || 'عضو'}`;
  };
  shell({title:'حسابات المحل', right:refreshBtn, nav:'home', body:`
    <div class="dash">
    ${dueAlert(checks)}
    <div class="card hero">
      <div class="lbl">المستحق للموردين</div>
      <div class="big">${money(owed)}</div>
      <div class="row">
        <div class="mini" onclick="go('/checks')" style="cursor:pointer"><span>شيكات لسه</span><b>${money(cs.sum)}</b><span>${N(cs.n)} شيك</span></div>
        <div class="mini" onclick="go('/checks')" style="cursor:pointer"><span>أقرب شيك</span><b>${cs.next ? fmtDate(cs.next.due_date) : '—'}</b><span>${cs.next ? esc(cs.next.name) : 'مفيش'}</span></div>
      </div>
    </div>
    <div class="stat4">
      <div class="card" onclick="go('/reports')" style="cursor:pointer"><span>مشتريات الشهر</span><b>${money(rm.buy)}</b></div>
      <div class="card" onclick="go('/reports')" style="cursor:pointer"><span>مدفوعات الشهر</span><b>${money(paidMonth)}</b></div>
    </div>
    <div class="qa">
      <button onclick="go('/invoice')">${I.receipt}<span>فاتورة</span></button>
      <button onclick="go('/payment')">${I.cash}<span>دفعة</span></button>
      <button onclick="go('/adjust')">${I.ret}<span>مرتجع</span></button>
      <button onclick="go('/supplier')">${I.plus}<span>مورد جديد</span></button>
    </div>
    <div class="card">
      <div class="sec-h"><span>أكبر المستحقات</span><a href="#/suppliers">كل الموردين ${I.chev}</a></div>
      <div class="list">${top.length ? top.map(r => `
        <div class="item" onclick="go('/s/${r.id}')">
          <div class="avatar">${esc(r.name.trim()[0]||'؟')}</div>
          <div class="grow"><div class="t">${esc(r.name)}</div><div class="s">فواتير ${money(r.total_invoices)}</div></div>
          <div class="amt debt">${money(r.balance)}</div>
        </div>`).join('') : `<div class="empty" style="padding:16px">${rows.length ? 'مفيش مستحقات — كله خالص' : 'لسه مفيش موردين'}</div>`}</div>
    </div>
    ${log.length ? `<div class="card">
      <div class="sec-h"><span>آخر الحركات</span><a href="#/log">السجل ${I.chev}</a></div>
      ${log.map(r => `<div class="act"><i class="dot ${r.action}"></i><div><b>${esc(shortName(r.actor))}</b> ${esc(logLine(r))}${r.supplier_id && names.get(r.supplier_id) ? ' — ' + esc(names.get(r.supplier_id)) : ''}</div></div>`).join('')}
    </div>` : ''}
    </div>`});
}

/* =================== المزيد =================== */
const MODULES = [
  {k:'employees', t:'الموظفين',          i:'emp',     c:'#2b6cb0', d:'المرتبات والسلف والخصومات ورصيد كل موظف'},
  {k:'loans',     t:'القروض',            i:'loan',    c:'#b7791f', d:'القروض اللي عليك أو ليك، والأقساط والمتبقي'},
  {k:'cash',      t:'الخزينة',           i:'safe',    c:'#2f855a', d:'الكاش اللي في المحل: الداخل والخارج والرصيد'},
  {k:'banks',     t:'الحسابات البنكية',  i:'bank',    c:'#6b46c1', d:'البنوك، الإيداع والسحب، والشيكات اللي بتتصرف منها'},
  {k:'expenses',  t:'المصروفات',         i:'expense', c:'#c2546b', d:'إيجار وكهربا ونقل وغيره، بالتصنيف والصورة'},
  {k:'other',     t:'حسابات أخرى',       i:'folder',  c:'#4a5568', d:'أي حساب تاني: شريك، عميل بالأجل، أمانات'},
];
function viewMore(){
  shell({title:'المزيد', nav:'more', body:`
    <div class="more-grid">
      ${MODULES.map(m => `<button class="more-tile" onclick="go('/m/${m.k}')">
        <span class="mt-ico" style="--c:${m.c}">${I[m.i]}</span>
        <span class="mt-t">${m.t}</span><span class="mt-d">${m.d}</span>
        <span class="soon">قريبًا</span></button>`).join('')}
    </div>
    <div class="card list more-list">
      <div class="item" onclick="go('/settings')"><div class="ico" style="background:var(--brand-soft);color:var(--brand)">${I.gear}</div><div class="grow"><div class="t">الإعدادات</div><div class="s">الأعضاء، الألوان، التنبيهات، التصدير</div></div>${I.chev.replace('<svg','<svg class="chev"')}</div>
      <div class="item" onclick="go('/log')"><div class="ico" style="background:var(--amber-soft);color:var(--amber)">${I.hist}</div><div class="grow"><div class="t">سجل التعديلات</div><div class="s">مين عمل إيه وإمتى</div></div>${I.chev.replace('<svg','<svg class="chev"')}</div>
    </div>`});
}
function viewModule(k){
  const m = MODULES.find(x => x.k === k); if(!m) return go('/more');
  shell({title:m.t, back:true, nav:'more', body:`
    <div class="card mod-hero">
      <span class="mt-ico big" style="--c:${m.c}">${I[m.i]}</span>
      <h2>${m.t}</h2><p>${m.d}</p>
      <span class="soon">القسم ده تحت التجهيز</span>
    </div>
    <div class="hint" style="text-align:center;margin:0 10px">الحسابات اللي متسجلة دلوقتي (الموردين والشيكات والتقارير) شغالة زي ما هي ومش هتتأثر.</div>`});
}
