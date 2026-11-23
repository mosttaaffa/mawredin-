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
  for(const x of (store.eff.expenses?.values() || [])) out.push({d:x.exp_date, c:x.created_at, ic:'expense', t:'مصروف ' + x.category, s:x.branch, a:+x.amount, sg:-1, go:`/expense/${x.id}`});
  for(const s of (store.eff.daily_sales?.values() || [])) out.push({d:s.sale_date, c:s.created_at, ic:'safe', t:'مبيع ' + s.branch, s:`كاش ${(+s.cash).toLocaleString('en-US')} · تحويل ${(+s.transfer).toLocaleString('en-US')}`, a:(+s.cash) + (+s.transfer), sg:1, go:`/sale/${s.id}`});
  return out.sort((a, b) => String(b.d).localeCompare(String(a.d)) || String(b.c || '').localeCompare(String(a.c || ''))).slice(0, n);
}
window.quickAdd = () => openModal(`<h3>إضافة سريعة</h3><div class="menu-list">
  <button onclick="closeModal();go('/invoice')">${I.invadd}فاتورة جديدة</button>
  <button onclick="closeModal();go('/payment')">${I.cash}دفعة جديدة</button>
  <button onclick="closeModal();go('/sale')">${I.safe}مبيع اليوم</button>
  <button onclick="closeModal();go('/expense')">${I.expense}مصروف</button>
  <button onclick="closeModal();go('/adjust')">${I.ret}مرتجع أو خصم</button>
  <button onclick="closeModal();go('/employees')">${I.users}حركة موظف</button>
  <button onclick="closeModal();go('/supplier')">${I.box}مورد جديد</button></div>`);
window.soonModule = k => go('/m/' + k);
/* أيقونات الأقسام في الرئيسية — SVG مرسومة (أبيض + لمسات دهبي) جوه مربع عنابي. خفيفة ومن غير ملفات خارجية */
const DB_GOLD = '#F2C86B', DB_INK = '#8E1630', DB_SOFT = '#F6E1E6', DB_MID = '#E8BFC8';
const DB_ICONS = {
  suppliers:`<path d="M24 5 41 14 24 23 7 14z" fill="#fff"/><path d="M7 14 24 23v20L7 34z" fill="${DB_SOFT}"/><path d="M41 14 24 23v20l17-9z" fill="${DB_MID}"/>
    <path d="M30.6 8.5 34.4 10.5 17.4 19.5V39.5L13.6 37.5V17.5z" fill="${DB_GOLD}"/><path d="M24 23v20" stroke="${DB_INK}" stroke-width=".8" opacity=".35"/>`,
  employees:`<circle cx="12.5" cy="16.5" r="5" fill="${DB_SOFT}"/><path d="M2.5 36c0-6 4.5-10 10-10s10 4 10 10v2h-20z" fill="${DB_SOFT}"/>
    <circle cx="35.5" cy="16.5" r="5" fill="${DB_SOFT}"/><path d="M25.5 36c0-6 4.5-10 10-10s10 4 10 10v2h-20z" fill="${DB_SOFT}"/>
    <circle cx="24" cy="14.5" r="6.8" fill="#fff" stroke="${DB_INK}" stroke-width="1.4"/><path d="M10.5 41c0-7.8 6-13.6 13.5-13.6S37.5 33.2 37.5 41v2.2h-27z" fill="#fff" stroke="${DB_INK}" stroke-width="1.4"/>
    <path d="M20 28.2l4 5 4-5" stroke="${DB_GOLD}" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  reports:`<path d="M11 4h19l9 9v29a2 2 0 0 1-2 2H11a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" fill="#fff"/><path d="M30 4v7a2 2 0 0 0 2 2h7z" fill="${DB_MID}"/>
    <rect x="13.5" y="10" width="12" height="2.4" rx="1.2" fill="${DB_MID}"/><rect x="13.5" y="15" width="8" height="2.4" rx="1.2" fill="${DB_MID}"/>
    <rect x="13.5" y="28" width="5" height="10.5" rx="1.2" fill="#9B1B30"/><rect x="21.5" y="23" width="5" height="15.5" rx="1.2" fill="#9B1B30"/><rect x="29.5" y="19" width="5" height="19.5" rx="1.2" fill="${DB_GOLD}"/>`,
  checks:`<rect x="2.5" y="13" width="37" height="24" rx="3" fill="#fff"/><rect x="2.5" y="13" width="37" height="4.5" rx="2" fill="${DB_SOFT}"/>
    <rect x="7" y="21.5" width="12" height="2.4" rx="1.2" fill="${DB_MID}"/><rect x="26" y="20.5" width="9" height="5" rx="1.5" fill="${DB_SOFT}"/>
    <path d="M7.5 31c1.8-2.2 3.4 1.6 5.4 0s3-2.2 4.6 0" stroke="#9B1B30" stroke-width="1.7" fill="none" stroke-linecap="round"/><rect x="21" y="31" width="14" height="2" rx="1" fill="${DB_MID}"/>
    <path d="M44 7.5 46.8 10.3 30.6 26.5l-4.4 1.6 1.6-4.4z" fill="${DB_GOLD}" stroke="${DB_INK}" stroke-width="1.2" stroke-linejoin="round"/><path d="M41.2 10.3l2.8 2.8" stroke="${DB_INK}" stroke-width="1.2"/>`,
  banks:`<path d="M24 3.5 44.5 13.5V17h-41v-3.5z" fill="#fff"/><circle cx="24" cy="11.5" r="2.5" fill="${DB_GOLD}"/><rect x="5.5" y="18.5" width="37" height="3" rx="1" fill="${DB_SOFT}"/>
    <rect x="8.5" y="23" width="5" height="13" rx="1" fill="#fff"/><rect x="17" y="23" width="5" height="13" rx="1" fill="#fff"/><rect x="26" y="23" width="5" height="13" rx="1" fill="#fff"/><rect x="34.5" y="23" width="5" height="13" rx="1" fill="#fff"/>
    <rect x="5" y="37.5" width="38" height="3.5" rx="1" fill="#fff"/><rect x="2.5" y="42" width="43" height="3" rx="1.5" fill="${DB_GOLD}"/>`,
  expenses:`<path d="M10 3.5h20a2 2 0 0 1 2 2V43l-3.7-2.6-3.6 2.6-3.7-2.6-3.6 2.6-3.7-2.6L8 43V5.5a2 2 0 0 1 2-2z" fill="#fff"/>
    <rect x="12" y="9" width="16" height="2.4" rx="1.2" fill="${DB_MID}"/><rect x="12" y="15" width="11" height="2.4" rx="1.2" fill="${DB_MID}"/><rect x="12" y="21" width="14" height="2.4" rx="1.2" fill="${DB_MID}"/><rect x="12" y="27" width="8" height="2.4" rx="1.2" fill="#9B1B30"/>
    <g fill="${DB_GOLD}" stroke="${DB_INK}" stroke-width="1.2"><path d="M27.5 37v3.5c0 1.6 3.4 2.9 7.5 2.9s7.5-1.3 7.5-2.9V37"/><path d="M27.5 32.5V37c0 1.6 3.4 2.9 7.5 2.9s7.5-1.3 7.5-2.9v-4.5"/><ellipse cx="35" cy="32.5" rx="7.5" ry="2.9"/></g>`,
  cash:`<rect x="5" y="4.5" width="38" height="34" rx="5" fill="#fff"/><rect x="9" y="8.5" width="30" height="26" rx="3" fill="${DB_SOFT}"/>
    <circle cx="21.5" cy="21.5" r="7.5" fill="#fff" stroke="#9B1B30" stroke-width="2"/><circle cx="21.5" cy="21.5" r="2.6" fill="${DB_GOLD}"/>
    <path d="M21.5 14.8v2.2M21.5 26v2.2M14.8 21.5H17M26 21.5h2.2" stroke="#9B1B30" stroke-width="1.6" stroke-linecap="round"/>
    <rect x="32.5" y="15.5" width="3" height="12" rx="1.5" fill="#9B1B30"/><rect x="2.5" y="11" width="4.5" height="5.5" rx="1.2" fill="${DB_GOLD}"/><rect x="2.5" y="26.5" width="4.5" height="5.5" rx="1.2" fill="${DB_GOLD}"/>
    <rect x="9" y="38.5" width="6" height="4.5" rx="1.2" fill="#fff"/><rect x="33" y="38.5" width="6" height="4.5" rx="1.2" fill="#fff"/>`,
  loans:`<path d="M19.5 4.5h9L26 10h-4z" fill="${DB_GOLD}"/><path d="M21.6 10h4.8c6.3 3.1 9.4 8.6 9.4 13.6 0 5.2-4.7 7.9-11.8 7.9s-11.8-2.7-11.8-7.9c0-5 3.1-10.5 9.4-13.6z" fill="${DB_GOLD}"/>
    <path d="M27.2 16.8c-.8-1-2-1.5-3.3-1.4-1.8.1-3.1 1.1-3.1 2.4 0 3.4 6.6 1.6 6.6 5.1 0 1.4-1.4 2.5-3.4 2.5-1.4 0-2.7-.6-3.5-1.6M24 13.8v1.6m0 10.3v1.7" stroke="${DB_INK}" stroke-width="1.9" fill="none" stroke-linecap="round"/>
    <rect x="1.5" y="33" width="6.5" height="13" rx="1.5" fill="${DB_SOFT}"/><path d="M8 35.2c4-1.6 8-1.6 11 0l7 .4c1.8 0 2.8 1 2.8 2.3s-1 2.3-2.8 2.3h-7.2M8 35.2V46h21l13.5-8.3c1.2-.8 1.6-2.2.9-3.2-.6-1-2-1.4-3.3-.7l-9.6 5.4" fill="#fff"/>
    <path d="M18.8 40.2h7.2c1.8 0 2.8-1 2.8-2.3" stroke="${DB_MID}" stroke-width="1.3" fill="none" stroke-linecap="round"/>`,
};
const dbIcon = k => `<svg viewBox="0 0 48 48" aria-hidden="true">${DB_ICONS[k] || ''}</svg>`;

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
  const LS = loansSummary(), CS = cashSummary(), XS = expSummary(), BS = bankSummary();
  const ours = supCred + empOwe, theirs = supDue + empDue + chkRemC + LS.remaining, net = ours - theirs;
  const salaries = act.reduce((a, r) => a + C2(r.base_salary), 0) / 100;
  const due = checks.filter(c => c.check_status === 'pending' && daysUntil(c.due_date) <= 3 && chkRem(c) > 0);
  const ready = k => MODULES.find(m => m.k === k)?.ready;
  const m = (v, raw) => `<span class="m"><span class="num">${raw ? v : fmt0(v)}</span> ج.م</span>`;
  const tile = (k, t, ic, go, extra = '') => `<button class="db-tile${extra ? ' rich' : ''}" onclick="${go}" aria-label="${t}">
      <span class="db-ic">${DB_ICONS[k] ? dbIcon(k) : I[ic]}</span><span class="db-tb"><b>${t}</b>${extra}</span><span class="db-go">${I.chevL}</span></button>`;
  const mod = k => ready(k) ? `go('/${k}')` : `soonModule('${k}')`;
  const ops = recentOps(3);
  const sign = o => o.sg < 0 ? 'neg' : o.sg > 0 ? 'pos' : '';
  shell({title:'حسابات المحل', nav:'home', home:{alerts:due.length, sub:'لوحة التحكم'}, body:`
    <div class="db one">
    <button class="db-hero" onclick="go('/suppliers')">
      <span class="dh-t">إجمالي مستحقات الموردين</span>
      <span class="dh-v"><i class="dh-vi">${I.coins2}</i>${m(supDue / 100)}</span>
      <span class="dh-n">${I.box}${rows.length} ${rows.length === 1 ? 'مورد' : 'موردين'}</span>
      <span class="dh-sep"></span>
      <span class="dh-ic">${I.coins2}</span>
      <span class="dh-btn">عرض التفاصيل ${I.chevL}</span>
    </button>
    ${due.length ? `<button class="mini-alert ${due.some(c => daysUntil(c.due_date) <= 0) ? 'over' : ''}" onclick="go('/checks')">${I.bell}<span>شيكات ميعادها قرّب</span><b>${due.length}</b><i class="ma-go">${I.chevL}</i></button>` : ''}
    ${usageAlert()}
    ${(backupAge() == null || backupAge() >= 7) ? `<button class="mini-alert" onclick="go('/backups')">${I.save}<span>${backupAge() == null ? 'اعمل أول نسخة احتياطية' : `آخر نسخة احتياطية من ${backupAge()} يوم`}</span><b class="ma-save">${I.save}حفظ</b><i class="ma-go">${I.chevL}</i></button>` : ''}
    <div class="db-h"><span>${I.grid}الأقسام الرئيسية</span><i></i></div>
    <div class="db-grid">
      ${tile('suppliers', 'الموردين', 'box', "go('/suppliers')")}
      ${tile('employees', 'الموظفين', 'users', "go('/employees')", emps ? `<em class="neg">${m(salaries)}</em><small class="c">المرتبات · ${act.length} موظف</small>` : '<small>مش متاح دلوقتي</small>')}
      ${tile('reports', 'التقارير', 'chart', "go('/reports')")}
      ${tile('checks', 'الشيكات', 'check', "go('/checks')", `<em>${m(cs.sum)}</em><small class="c">مستحقة · ${N(cs.n)} شيك</small>`)}
      ${tile('banks', 'البنك', 'bank', "go('/banks')", BS.n ? `<em class="${BS.bal < 0 ? 'neg' : ''}">${m(BS.bal / 100)}</em><small class="c">رصيد البنك</small>` : '<small>سجّل رصيد البنك</small>')}
      ${tile('expenses', 'المصروفات', 'expense', "go('/expenses')", XS.month ? `<em class="neg">${m(XS.month / 100)}</em><small class="c">مصروفات الشهر</small>` : '')}
      ${tile('cash', 'الخزينة', 'safe', "go('/cash')", CS.today.total ? `<em>${m(CS.today.total / 100)}</em><small class="c">مبيع النهارده</small>` : CS.n ? `<em>${m(CS.month.total / 100)}</em><small class="c">مبيع الشهر</small>` : '')}
      ${tile('loans', 'القروض والسلف', 'loan', "go('/loans')", LS.n ? `<em class="neg">${m(LS.remaining / 100)}</em><small class="c">${LS.late ? `${LS.late} قسط متأخر` : `${LS.n} قرض جاري`}</small>` : '')}
    </div>
    <div class="db-qa">
      <button onclick="go('/payment')"><span>${I.cash}</span><b>دفعة جديدة</b></button>
      <button onclick="go('/invoice')"><span>${I.invadd}</span><b>فاتورة جديدة</b></button>
    </div>
    <div class="card db-pos" onclick="this.querySelector('.db-why').open=!this.querySelector('.db-why').open;fitDash()">
      <div class="db-ph">${I.layers || I.stats}<b>ملخص المركز المالي</b></div>
      <div class="db-p3">
        <div><span class="u">${I.up}أرصدة لنا</span><b class="pos">${m(ours / 100)}</b></div>
        <div><span class="d">${I.down}أرصدة علينا</span><b class="neg">${m(theirs / 100)}</b></div>
        <div><span>${I.layers || I.stats}صافي المركز</span><b class="${net < 0 ? 'neg' : 'pos'}">${m((net < 0 ? '-' : '') + fmt0(Math.abs(net) / 100), true)}</b></div>
      </div>
      <details class="db-why"><summary>الأرقام دي جاية منين؟</summary>
        <div>لنا: موردين رصيدهم لصالح المحل ${fmt0(supCred / 100)} + سلف وخصومات على موظفين ${fmt0(empOwe / 100)}</div>
        <div>علينا: مستحقات الموردين ${fmt0(supDue / 100)} + المتبقي من الشيكات ${fmt0(chkRemC / 100)} + مستحق للموظفين ${fmt0(empDue / 100)}${LS.remaining ? ` + المتبقي من القروض ${fmt0(LS.remaining / 100)}` : ''}</div></details>
    </div>
    <div class="db-rh"><span>${I.doc}آخر العمليات</span><button class="link" onclick="go('/log')">عرض السجل ${I.chevL}</button></div>
    <div class="card db-ops">${ops.length ? ops.map(o => `<button class="db-op" onclick="go('${o.go}')">
        <span class="db-oi">${I[o.ic] || I.doc}</span><span class="db-ot"><b>${o.t}</b><small>${esc(o.s)}</small></span>
        <span class="db-od num">${fmtDate(o.d)}</span><span class="db-oa ${sign(o)}">${o.sg < 0 ? '- ' : o.sg > 0 ? '+ ' : ''}${m(o.a)}</span></button>`).join('')
      : '<div class="empty" style="padding:14px">لسه مفيش عمليات</div>'}</div>
    </div>`, fabs:`<button class="db-fab" onclick="quickAdd()" aria-label="إضافة">${I.plus}</button>`});
  fitDash();
}
// الرئيسية كلها في شاشة واحدة: نفس الشكل، بس بتتصغّر على قد المساحة اللي فوق شريط التنقل (من غير ما تقل عن حجم مقروء)
function fitDash(){
  const d = document.querySelector('.db'); if(!d) return;
  const LV = ['', 'l1', 'l2', 'l3'];                // كل مستوى بيشيل حاجة صغيرة (آخر العمليات) لو المساحة مش كفاية
  const nav = document.querySelector('nav.bottom');
  const measure = lv => {
    d.classList.remove('l1', 'l2', 'l3'); if(lv) d.classList.add(lv);
    d.style.zoom = 1;
    const top = d.getBoundingClientRect().top + scrollY, navTop = nav ? nav.getBoundingClientRect().top : innerHeight;
    const avail = navTop - top - 34, need = d.scrollHeight, z = Math.min(1, avail / need);
    return {lv, z, ok:z >= .8};
  };
  const res = LV.map(measure);
  // الأفضل: أقل حاجة تتشال وفي نفس الوقت الحجم مقروء (85% أو أكتر)، وإلا أي مستوى بيكفي، وإلا آخر مستوى
  const pick = res.find(r => r.z >= .85) || res.find(r => r.ok) || res[res.length - 1];
  d.classList.remove('l1', 'l2', 'l3'); if(pick.lv) d.classList.add(pick.lv);
  d.style.zoom = Math.max(.8, pick.z);
  document.body.classList.toggle('dash-fits', pick.ok);
}
addEventListener('resize', () => fitDash());
const fmt0 = v => Number(v || 0).toLocaleString('en-US', {maximumFractionDigits:2});

/* =================== المزيد =================== */
const MODULES = [
  {k:'employees', t:'الموظفين',          i:'emp',     c:'#2b6cb0', ready:true, d:'المرتبات والسلف والخصومات ورصيد كل موظف'},
  {k:'loans',     t:'القروض',            i:'loan',    c:'#b7791f', ready:true, d:'القروض اللي عليك أو ليك، والأقساط والمتبقي'},
  {k:'cash',      t:'الخزينة',           i:'safe',    c:'#2f855a', ready:true, d:'المبيع اليومي لكل فرع: كاش وتحويلات'},
  {k:'banks',     t:'البنك',             i:'bank',    c:'#6b46c1', ready:true, d:'رصيد البنك: تحويلات المبيع داخلة، والدفعات والأقساط بالتحويل خارجة'},
  {k:'expenses',  t:'المصروفات',         i:'expense', c:'#c05621', ready:true, d:'مصروفات كل فرع يوميًا — والدفعات والأقساط والمرتبات بتتسجل لوحدها'},
  {k:'other',     t:'حسابات أخرى',       i:'folder',  c:'#4a5568', d:'أي حساب تاني: شريك، عميل بالأجل، أمانات'},
];
function viewMore(){
  shell({title:'المزيد', nav:'more', body:`
    <div class="more-grid">
      <button class="more-tile" onclick="go('/settings')"><span class="mt-ico" style="--c:#4a5568">${I.gear}</span>
        <span class="mt-t">الإعدادات</span><span class="mt-d">الأعضاء، الألوان، التنبيهات، التصدير والنسخة الاحتياطية</span></button>
      <button class="more-tile" onclick="go('/checks')"><span class="mt-ico" style="--c:#9B1B30">${I.check}</span>
        <span class="mt-t">الشيكات</span><span class="mt-d">الشيكات المستحقة والمسددة وسداد الدفعات</span></button>
      <button class="more-tile" onclick="go('/perms')"><span class="mt-ico" style="--c:#2f855a">${I.users}</span>
        <span class="mt-t">الصلاحيات</span><span class="mt-d">${isOwner ? 'افتح واقفل اللي المستخدم التاني يقدر يعمله' : 'صلاحيات حسابك'}</span></button>
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
