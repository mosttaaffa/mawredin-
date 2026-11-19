/* الرئيسية (ملخص حسابات المحل) + قائمة «المزيد» والأقسام */

/* =================== الرئيسية: بطاقات الأقسام بصور ثلاثية الأبعاد =================== */
// بطاقة قسم قابلة لإعادة الاستخدام
function tile3d(m){
  return `<button class="tile3d t-${m.k}" onclick="go('${m.go}')">
    <span class="t3-top"><span class="t3-ico">${I[m.i] || I.folder}</span><span class="t3-arrow">${I.back}</span></span>
    <img class="t3-img" src="icons/3d/${m.k}.webp" alt="" loading="eager" decoding="async" width="96" height="96">
    <span class="t3-name">${m.t}</span>
    ${m.v != null && m.v !== '' ? `<span class="t3-v">${m.v}</span>` : ''}
    <span class="t3-s">${m.s}</span>
    ${m.soon ? '<span class="soon">قريبًا</span>' : ''}
  </button>`;
}
function homeSkeleton(){
  return `<div class="dash fit"><div class="tiles3d">${'<div class="skel tile-sk"></div>'.repeat(8)}</div></div>`;
}
async function viewDashboard(){
  if(!$('.dash')){ shell({title:'حسابات المحل', nav:'home', home:{}, body:homeSkeleton()}); fitDash(); }
  const N = v => Number(v || 0);
  let rows, cs, emps;
  try{
    [rows, cs, emps] = await Promise.all([
      api.balances(), api.checkSummary(),
      fetchAll(() => sb.from('employee_balances').select('id,balance').order('id')).catch(() => null),
    ]);
  }catch(e){
    shell({title:'حسابات المحل', nav:'home', home:{}, body:`<div class="card empty">${I.refresh}<div>مقدرناش نجيب البيانات — اتأكد من النت</div><button class="btn primary" style="margin-top:12px" onclick="route()">حاول تاني</button></div>`});
    return;
  }
  const checks = soonToChecks(cs); notifyChecks(checks);
  const owed = rows.reduce((a,r) => a + Math.max(0, N(r.balance)), 0);
  const owedN = rows.filter(r => N(r.balance) > 0).length;
  const empSum = (emps || []).reduce((a,r) => a + N(r.balance), 0);
  const ready = k => MODULES.find(m => m.k === k)?.ready;
  const tiles = [
    {k:'suppliers', go:'/suppliers', t:'الموردين', i:'users', v:money(owed), s:`${rows.length} مورد · مستحق لـ ${owedN}`},
    {k:'checks', go:'/checks', t:'الشيكات', i:'check', v:money(cs.sum), s:`${N(cs.n)} شيك مستحق${cs.next ? ' · أقربها ' + fmtDate(cs.next.due_date) : ''}`},
    {k:'employees', go:'/employees', t:'الموظفين', i:'emp', v:emps ? signMoney(empSum) : '', s:emps ? `${emps.length} موظف مسجل` : 'مش متاح دلوقتي'},
    {k:'reports', go:'/reports', t:'التقارير', i:'chart', s:'المشتريات والمدفوعات شهريًا'},
    {k:'loans', t:'القروض', i:'loan', s:'القروض والأقساط والمتبقي'},
    {k:'cash', t:'الخزينة', i:'safe', s:'الكاش في المحل، الداخل والخارج والرصيد'},
    {k:'banks', t:'الحسابات البنكية', i:'bank', s:'البنوك والإيداع والسحب والشيكات'},
    {k:'expenses', t:'المصروفات', i:'expense', s:'إدارة مصروفات المحل ونقلها وتصنيفها'},
  ].map(m => m.go ? m : {...m, go: ready(m.k) ? '/' + m.k : '/m/' + m.k, soon: !ready(m.k)});
  const due = checks.filter(c => c.check_status === 'pending' && daysUntil(c.due_date) <= 3);
  const over = due.some(c => daysUntil(c.due_date) <= 0);
  shell({title:'حسابات المحل', nav:'home', home:{alerts: due.length}, body:`
    <div class="dash fit">
    ${due.length ? `<button class="mini-alert ${over ? 'over' : ''}" onclick="go('/checks')">${I.bell}<span>${over ? 'شيكات ميعادها النهارده أو فات' : 'شيكات ميعادها قرّب'}</span><b>${due.length}</b></button>` : ''}
    <div class="tiles3d">${tiles.map(tile3d).join('')}</div>
    </div>`});
  fitDash();
}
// الرئيسية كلها في شاشة واحدة: ارتفاع البطاقات = المساحة بين الهيدر والشريط اللي تحت
function fitDash(){
  const d = document.querySelector('.dash.fit'); if(!d) return;
  const h = document.querySelector('header.top')?.offsetHeight || 0, n = document.querySelector('nav.bottom')?.offsetHeight || 0;
  d.style.height = Math.max(420, window.innerHeight - h - Math.max(n, parseFloat(getComputedStyle(document.body).paddingBottom) || 0) - 28) + 'px';
}
addEventListener('resize', fitDash);

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
      <button class="more-tile" onclick="go('/settings')"><span class="mt-ico" style="--c:#4a5568">${I.gear}</span>
        <span class="mt-t">الإعدادات</span><span class="mt-d">الأعضاء، الألوان، التنبيهات، التصدير والنسخة الاحتياطية</span></button>
      <button class="more-tile" onclick="go('/log')"><span class="mt-ico" style="--c:#b7791f">${I.hist}</span>
        <span class="mt-t">سجل التعديلات</span><span class="mt-d">مين عمل إيه وإمتى</span></button>
      <button class="more-tile" onclick="go('/m/other')"><span class="mt-ico" style="--c:#4a5568">${I.folder}</span>
        <span class="mt-t">حسابات أخرى</span><span class="mt-d">شريك، عميل بالأجل، أمانات</span><span class="soon">قريبًا</span></button>
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
