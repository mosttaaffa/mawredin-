/* الرئيسية (ملخص حسابات المحل) + قائمة «المزيد» والأقسام */

/* =================== الرئيسية: مربعات الأقسام (بنفس شكل «المزيد» من غير الإعدادات والسجل) =================== */
async function viewDashboard(){
  if(!$('.dash')) shell({title:'حسابات المحل', right:refreshBtn, nav:'home', body:skeleton('home')});
  const N = v => Number(v || 0);
  const [rows, cs, emps] = await Promise.all([
    api.balances(), api.checkSummary(),
    fetchAll(() => sb.from('employee_balances').select('id,balance').order('id')).catch(() => []),
  ]);
  const checks = soonToChecks(cs); notifyChecks(checks);
  const owed = rows.reduce((a,r) => a + Math.max(0, N(r.balance)), 0);
  const empDue = emps.reduce((a,r) => a + Math.max(0, N(r.balance)), 0), empOwe = emps.reduce((a,r) => a + Math.min(0, N(r.balance)), 0);
  const tiles = [
    {go:'/suppliers', t:'الموردين', i:'box', c:'#c2546b', v:money(owed), s:`مستحق لـ ${rows.filter(r => N(r.balance) > 0).length} مورد`},
    {go:'/checks', t:'الشيكات', i:'check', c:'#b7791f', v:money(cs.sum), s:cs.next ? `أقرب شيك ${fmtDate(cs.next.due_date)}` : `${N(cs.n)} شيك لسه`},
    {go:'/employees', t:'الموظفين', i:'emp', c:'#2b6cb0', v:emps.length ? money(Math.abs(empOwe)) : '', s:emps.length ? `عليهم للمحل · ${emps.length} موظف` : 'استيراد كشف الموظفين'},
    {go:'/reports', t:'التقارير', i:'chart', c:'#2f855a', v:'', s:'المشتريات والمدفوعات شهريًا'},
    ...MODULES.filter(m => !m.ready).map(m => ({go:'/m/' + m.k, t:m.t, i:m.i, c:m.c, s:m.d, soon:true})),
  ];
  shell({title:'حسابات المحل', right:refreshBtn, nav:'home', body:`
    <div class="dash">
    ${dueAlert(checks)}
    <div class="more-grid">
      ${tiles.map(m => `<button class="more-tile" onclick="go('${m.go}')">
        <span class="mt-ico" style="--c:${m.c}">${I[m.i] || I.folder}</span>
        <span class="mt-t">${m.t}</span>${m.v ? `<span class="mt-v">${m.v}</span>` : ''}<span class="mt-d">${m.s}</span>
        ${m.soon ? '<span class="soon">قريبًا</span>' : ''}</button>`).join('')}
    </div>
    <div class="qa">
      <button onclick="go('/invoice')">${I.receipt}<span>فاتورة</span></button>
      <button onclick="go('/payment')">${I.cash}<span>دفعة</span></button>
      <button onclick="go('/emp-tx')">${I.emp}<span>حركة موظف</span></button>
      <button onclick="go('/adjust')">${I.ret}<span>مرتجع</span></button>
    </div>
    </div>`});
}

/* =================== المزيد =================== */
const MODULES = [
  {k:'employees', t:'الموظفين',          i:'emp',     c:'#2b6cb0', ready:true, d:'المرتبات والسلف والخصومات ورصيد كل موظف'},
  {k:'loans',     t:'القروض',            i:'loan',    c:'#b7791f', d:'القروض اللي عليك أو ليك، والأقساط والمتبقي'},
  {k:'cash',      t:'الخزينة',           i:'safe',    c:'#2f855a', d:'الكاش اللي في المحل: الداخل والخارج والرصيد'},
  {k:'banks',     t:'الحسابات البنكية',  i:'bank',    c:'#6b46c1', d:'البنوك، الإيداع والسحب، والشيكات اللي بتتصرف منها'},
  {k:'expenses',  t:'المصروفات',         i:'expense', c:'#c2546b', d:'إيجار وكهربا ونقل وغيره، بالتصنيف والصورة'},
  {k:'other',     t:'حسابات أخرى',       i:'folder',  c:'#4a5568', d:'أي حساب تاني: شريك، عميل بالأجل، أمانات'},
];
function viewMore(){
  shell({title:'المزيد', nav:'more', body:`
    <div class="more-grid">
      ${MODULES.map(m => `<button class="more-tile" onclick="go('${m.ready ? '/' + m.k : '/m/' + m.k}')">
        <span class="mt-ico" style="--c:${m.c}">${I[m.i]}</span>
        <span class="mt-t">${m.t}</span><span class="mt-d">${m.d}</span>
        ${m.ready ? '' : '<span class="soon">قريبًا</span>'}</button>`).join('')}
    </div>
    <div class="card list more-list">
      <div class="item" onclick="go('/settings')"><div class="ico" style="background:var(--brand-soft);color:var(--brand)">${I.gear}</div><div class="grow"><div class="t">الإعدادات</div><div class="s">الأعضاء، الألوان، التنبيهات، التصدير</div></div>${I.chev.replace('<svg','<svg class="chev"')}</div>
      <div class="item" onclick="go('/log')"><div class="ico" style="background:var(--amber-soft);color:var(--amber)">${I.hist}</div><div class="grow"><div class="t">سجل التعديلات</div><div class="s">مين عمل إيه وإمتى</div></div>${I.chev.replace('<svg','<svg class="chev"')}</div>
    </div>`});
}
function viewModule(k){
  const m = MODULES.find(x => x.k === k); if(!m) return go('/more');
  if(m.ready) return go('/' + m.k);
  shell({title:m.t, back:true, nav:'more', body:`
    <div class="card mod-hero">
      <span class="mt-ico big" style="--c:${m.c}">${I[m.i]}</span>
      <h2>${m.t}</h2><p>${m.d}</p>
      <span class="soon">القسم ده تحت التجهيز</span>
    </div>
    <div class="hint" style="text-align:center;margin:0 10px">الحسابات اللي متسجلة دلوقتي (الموردين والشيكات والتقارير) شغالة زي ما هي ومش هتتأثر.</div>`});
}
