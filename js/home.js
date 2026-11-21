/* الرئيسية (ملخص حسابات المحل) + قائمة «المزيد» والأقسام */

/* =================== الرئيسية: لوحة التحكم (حسب التصميم المعتمد) =================== */
function homeSkeleton(){
  return `<div class="db"><div class="skel db-hero-sk"></div><div class="db-grid">${'<div class="skel db-tile-sk"></div>'.repeat(8)}</div></div>`;
}
// آخر العمليات المالية من البيانات اللي على الجهاز (بتشتغل من غير نت)
function recentOps(n = 3){
  if(!store.ready) return [];
  const sup = id => store.eff.suppliers.get(id)?.name || '', emp = id => store.eff.employees?.get(id)?.name || '';
  const out = [];
  for(const x of store.eff.invoices.values()) out.push({d:x.inv_date, c:x.created_at, ic:'receipt', t:'فاتورة مورد', s:sup(x.supplier_id), a:+x.amount, sg:0, go:`/s/${x.supplier_id}`});
  for(const x of store.eff.payments.values()){
    const adj = x.method === 'return' || x.method === 'discount';
    out.push({d:x.pay_date, c:x.created_at, ic:adj ? 'ret' : 'box', t:adj ? (x.method === 'return' ? 'مرتجع لمورد' : 'خصم من مورد') : x.method === 'check' ? 'شيك لمورد' : 'سداد لمورد', s:sup(x.supplier_id), a:+x.amount, sg:adj ? 1 : -1, go:`/s/${x.supplier_id}`});
  }
  for(const x of (store.eff.check_payments?.values() || [])) if(!x.voided){ const p = store.eff.payments.get(x.payment_id); out.push({d:x.pay_date, c:x.created_at, ic:'check', t:'سداد شيك', s:p ? sup(p.supplier_id) + (p.check_no ? ' · ' + p.check_no : '') : '', a:+x.amount, sg:-1, go:p ? `/s/${p.supplier_id}` : '/checks'}); }
  for(const x of (store.eff.emp_transactions?.values() || [])){
    const outK = x.kind === 'payment' || x.kind === 'advance';
    out.push({d:x.tx_date, c:x.created_at, ic:'users', t:(typeof TX_KIND !== 'undefined' && TX_KIND[x.kind]) || 'حركة موظف', s:emp(x.employee_id), a:Math.abs(+x.amount), sg:outK ? -1 : 0, go:`/emp/${x.employee_id}`});
  }
  return out.sort((a, b) => String(b.d).localeCompare(String(a.d)) || String(b.c || '').localeCompare(String(a.c || ''))).slice(0, n);
}
window.quickAdd = () => openModal(`<h3>إضافة سريعة</h3><div class="menu-list">
  <button onclick="closeModal();go('/invoice')">${I.invadd}فاتورة جديدة</button>
  <button onclick="closeModal();go('/payment')">${I.cash}دفعة جديدة</button>
  <button onclick="closeModal();go('/adjust')">${I.ret}مرتجع أو خصم</button>
  <button onclick="closeModal();go('/employees')">${I.users}حركة موظف</button>
  <button onclick="closeModal();go('/supplier')">${I.box}مورد جديد</button></div>`);
window.soonModule = k => go('/m/' + k);
async function viewDashboard(){
  if(!$('.db')) shell({title:'حسابات المحل', nav:'home', home:{}, body:homeSkeleton()});
  const N = v => Number(v || 0), C2 = v => Math.round(N(v) * 100);
  let rows, cs, emps;
  try{
    [rows, cs, emps] = await Promise.all([
      api.balances(), api.checkSummary(),
      fetchAll(() => ldb.from('employee_balances').select('id,balance,base_salary,active').order('id')).catch(() => null),
    ]);
  }catch(e){
    shell({title:'حسابات المحل', nav:'home', home:{}, body:`<div class="card empty">${I.refresh}<div>مقدرناش نجيب البيانات — اتأكد من النت</div><button class="btn primary" style="margin-top:12px" onclick="route()">حاول تاني</button></div>`});
    return;
  }
  const checks = soonToChecks(cs); notifyChecks(checks);
  const E = emps || [], act = E.filter(r => r.active !== false);
  // كل الأرقام من نفس الحسابات اللي في باقي التطبيق (بالقروش)
  const supDue = rows.reduce((a, r) => a + Math.max(0, C2(r.balance)), 0), supCred = rows.reduce((a, r) => a + Math.max(0, -C2(r.balance)), 0);
  const empDue = E.reduce((a, r) => a + Math.max(0, C2(r.balance)), 0), empOwe = E.reduce((a, r) => a + Math.max(0, -C2(r.balance)), 0);
  const chkRemC = C2(cs.sum);
  const ours = supCred + empOwe, theirs = supDue + empDue + chkRemC, net = ours - theirs;
  const salaries = act.reduce((a, r) => a + C2(r.base_salary), 0) / 100;
  const due = checks.filter(c => c.check_status === 'pending' && daysUntil(c.due_date) <= 3 && chkRem(c) > 0);
  const ready = k => MODULES.find(m => m.k === k)?.ready;
  const m = (v, raw) => `<span class="m"><span class="num">${raw ? v : fmt0(v)}</span> ج.م</span>`;
  const tile = (k, t, ic, go, extra = '') => `<button class="db-tile${extra ? ' rich' : ''}" onclick="${go}" aria-label="${t}">
      <span class="db-ic">${I[ic]}</span><span class="db-tb"><b>${t}</b>${extra}</span><span class="db-go">${I.chevL}</span></button>`;
  const mod = k => ready(k) ? `go('/${k}')` : `soonModule('${k}')`;
  const ops = recentOps(3);
  const sign = o => o.sg < 0 ? 'neg' : o.sg > 0 ? 'pos' : '';
  shell({title:'حسابات المحل', nav:'home', home:{alerts:due.length, sub:'لوحة التحكم'}, body:`
    <div class="db">
    <button class="db-hero" onclick="go('/suppliers')">
      <span class="dh-t">إجمالي مستحقات الموردين</span>
      <span class="dh-v">${m(supDue / 100)}</span>
      <span class="dh-n">${I.box}${rows.length} ${rows.length === 1 ? 'مورد' : 'موردين'}</span>
      <span class="dh-sep"></span>
      <span class="dh-ic">${I.coins2}</span>
      <span class="dh-btn">عرض التفاصيل ${I.chevL}</span>
    </button>
    ${due.length ? `<button class="mini-alert ${due.some(c => daysUntil(c.due_date) <= 0) ? 'over' : ''}" onclick="go('/checks')">${I.bell}<span>شيكات ميعادها قرّب</span><b>${due.length}</b></button>` : ''}
    ${(backupAge() == null || backupAge() >= 7) ? `<button class="mini-alert" onclick="go('/backups')">${I.save}<span>${backupAge() == null ? 'اعمل أول نسخة احتياطية' : `آخر نسخة احتياطية من ${backupAge()} يوم`}</span><b>حفظ</b></button>` : ''}
    <div class="db-h"><span>${I.grid}الأقسام الرئيسية</span><i></i></div>
    <div class="db-grid">
      ${tile('suppliers', 'الموردين', 'box', "go('/suppliers')")}
      ${tile('employees', 'الموظفين', 'users', "go('/employees')", emps ? `<small>إجمالي المرتبات</small><em class="neg">${m(salaries)}</em><small class="c">${act.length} موظف</small>` : '<small>مش متاح دلوقتي</small>')}
      ${tile('reports', 'التقارير', 'chart', "go('/reports')")}
      ${tile('checks', 'الشيكات', 'check', "go('/checks')", `<small>الشيكات المستحقة</small><em>${m(cs.sum)}</em><small class="c">${N(cs.n)} شيك مستحق</small>`)}
      ${tile('banks', 'الحسابات البنكية', 'bank', mod('banks'))}
      ${tile('expenses', 'المصروفات', 'expense', mod('expenses'))}
      ${tile('cash', 'الخزينة', 'safe', mod('cash'))}
      ${tile('loans', 'القروض والسلف', 'loan', mod('loans'))}
    </div>
    <div class="db-qa">
      <button onclick="go('/payment')"><span>${I.cash}</span><b>دفعة جديدة</b></button>
      <button onclick="go('/invoice')"><span>${I.invadd}</span><b>فاتورة جديدة</b></button>
    </div>
    <div class="card db-pos">
      <div class="db-ph">${I.layers || I.stats}<b>ملخص المركز المالي</b></div>
      <div class="db-p3">
        <div><span class="u">${I.up}أرصدة لنا</span><b class="pos">${m(ours / 100)}</b></div>
        <div><span class="d">${I.down}أرصدة علينا</span><b class="neg">${m(theirs / 100)}</b></div>
        <div><span>${I.layers || I.stats}صافي المركز</span><b class="${net < 0 ? 'neg' : 'pos'}">${m((net < 0 ? '-' : '') + fmt0(Math.abs(net) / 100), true)}</b></div>
      </div>
      <details class="db-why"><summary>الأرقام دي جاية منين؟</summary>
        <div>لنا: موردين رصيدهم لصالح المحل ${fmt0(supCred / 100)} + سلف وخصومات على موظفين ${fmt0(empOwe / 100)}</div>
        <div>علينا: مستحقات الموردين ${fmt0(supDue / 100)} + المتبقي من الشيكات ${fmt0(chkRemC / 100)} + مستحق للموظفين ${fmt0(empDue / 100)}</div></details>
    </div>
    <div class="db-rh"><span>${I.doc}آخر العمليات</span><button class="link" onclick="go('/log')">عرض السجل ${I.chevL}</button></div>
    <div class="card db-ops">${ops.length ? ops.map(o => `<button class="db-op" onclick="go('${o.go}')">
        <span class="db-oi">${I[o.ic] || I.doc}</span><span class="db-ot"><b>${o.t}</b><small>${esc(o.s)}</small></span>
        <span class="db-od num">${fmtDate(o.d)}</span><span class="db-oa ${sign(o)}">${o.sg < 0 ? '- ' : o.sg > 0 ? '+ ' : ''}${m(o.a)}</span></button>`).join('')
      : '<div class="empty" style="padding:14px">لسه مفيش عمليات</div>'}</div>
    </div>
    <button class="db-fab" onclick="quickAdd()" aria-label="إضافة">${I.plus}</button>`});
}
const fmt0 = v => Number(v || 0).toLocaleString('en-US', {maximumFractionDigits:2});

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
      <button class="more-tile" onclick="go('/checks')"><span class="mt-ico" style="--c:#9B1B30">${I.check}</span>
        <span class="mt-t">الشيكات</span><span class="mt-d">الشيكات المستحقة والمسددة وسداد الدفعات</span></button>
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
      ${{loans:1,cash:1,banks:1,expenses:1}[m.k] ? `<img class="art" src="icons/3d/${m.k}.webp" alt="">` : `<span class="mt-ico big" style="--c:${m.c}">${I[m.i]}</span>`}
      <h2>${m.t}</h2><p>${m.d}</p>
      <span class="soon">القسم ده تحت التجهيز</span>
    </div>
    <div class="hint" style="text-align:center;margin:0 10px">الحسابات اللي متسجلة دلوقتي (الموردين والشيكات والتقارير) شغالة زي ما هي ومش هتتأثر.</div>`});
}
