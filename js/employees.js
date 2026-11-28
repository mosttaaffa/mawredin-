/* حسابات الموظفين: القائمة، ملف الموظف، الحركات، كشف الحساب، واستيراد كشف (صورة / Excel) بمراجعة قبل الحفظ */

/* ---------- تعريف الخانات ---------- */
const EMP_FIELDS = [
  ['base_salary',   'المرتب الأساسي'],
  ['work_days',     'أيام العمل'],
  ['earned_salary', 'المرتب المستحق'],
  ['comm_zahra',    'عمولات زهرة'],
  ['comm_ward',     'عمولات ورد'],
  ['comm_total',    'إجمالي العمولات'],
  ['adv_zahra',     'سلف زهرة'],
  ['adv_ward',      'سلف ورد'],
  ['ded_general',   'خصومات'],
  ['ded_clothes',   'ملابس'],
  ['adv_ded_total', 'إجمالي السلف والخصومات'],
  ['late_ded',      'خصم تأخير وغياب'],
  ['prev_balance',  'حساب قديم'],
  ['net_balance',   'الإجمالي الصافي'],
];
const EMP_LABEL = Object.fromEntries(EMP_FIELDS);
const TX_KIND = {salary:'مرتب مستحق', commission:'عمولة', advance:'سلفة', deduction:'خصم', payment:'صرف للموظف', adjustment:'تسوية'};
const TX_PLUS = k => k === 'salary' || k === 'commission';
const n0 = v => Number(v || 0);
const signMoney = v => n0(v) < 0 ? `<span class="neg">(${money(Math.abs(n0(v)))})</span>` : money(v);

const empApi = {
  balances: () => fetchAll(() => ldb.from('employee_balances').select('*').order('id')),
  one: id => q(ldb.from('employee_balances').select('*').eq('id', id).single()),
  settlements: id => fetchAll(() => ldb.from('emp_settlements').select('*').eq('employee_id', id).order('period_to', {ascending:false}).order('id', {ascending:false})),
  txs: id => fetchAll(() => ldb.from('emp_transactions').select('*').eq('employee_id', id).order('tx_date', {ascending:false}).order('id', {ascending:false})),
};


/* =================== حساب الموظف بالشهر ===================
   كل شهر لوحده: المرحّل من الشهر اللي فات + المرتب (بينزل لوحده أول الشهر) + العمولات − السلف − الخصومات − اللي اتصرف له ± التسويات = آخر الشهر (بيترحّل).
   البداية: صافي آخر تسوية (كشف مستورد) — نفس قاعدة الرصيد بالظبط، فرصيد آخر شهر = الرصيد الحالي. كل الحسابات بالقروش. */
let empMonth = null;
const fmtN = c => (c / 100).toLocaleString('en-US', {maximumFractionDigits:0});                       // الشهر المختار في شاشة الموظفين (YYYY-MM)
const empYM = d => String(d || '').slice(0, 7);
const empMonthName = ym => `${AR_MONTHS[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}`;
function empMonthly(empId){
  const E = store.eff, id = Number(empId);
  const sets = [...E.emp_settlements.values()].filter(x => Number(x.employee_id) === id)
    .sort((a, b) => String(a.period_to).localeCompare(String(b.period_to)) || a.id - b.id);
  const last = sets[sets.length - 1] || null, lastTo = last ? String(last.period_to).slice(0, 10) : '';
  const txs = [...E.emp_transactions.values()].filter(x => Number(x.employee_id) === id && (!last || String(x.tx_date).slice(0, 10) > lastTo))
    .sort((a, b) => String(a.tx_date).localeCompare(String(b.tx_date)) || a.id - b.id);
  const cur = today().slice(0, 7);
  // الحركة بتتحسب على شهرها (for_month) لو متحدد — زي صرف مستحقات أكتوبر في أول نوفمبر — وإلا على شهر تاريخها
  const lastYM = last ? empYM(lastTo) : '';
  const aym = x => { const m = x.for_month ? empYM(x.for_month) : empYM(x.tx_date); return lastYM && m < lastYM ? lastYM : m; };
  let start = last ? (txs.some(x => aym(x) === lastYM) ? lastYM : empYM(addDays(lastTo, 1))) : (txs.length ? txs.map(aym).sort()[0] : cur);
  let end = cur; for(const x of txs) if(aym(x) > end) end = aym(x);
  if(start > end) end = start;
  const months = []; let open = last ? C(last.net_balance) : 0;
  for(let ym = start; ym <= end; ym = addMonthsYM(ym, 1)){
    const rows = txs.filter(x => aym(x) === ym), sum = k => rows.filter(x => x.kind === k).reduce((a, x) => a + Math.abs(C(x.amount)), 0);
    const M = {ym, open, rows, isSet:!!last && ym === lastYM, sal:sum('salary'), com:sum('commission'), adv:sum('advance'), ded:sum('deduction'), pay:sum('payment'),
      adj:rows.filter(x => x.kind === 'adjustment').reduce((a, x) => a + C(x.amount), 0)};
    M.net = M.sal + M.com - M.adv - M.ded - M.pay + M.adj; M.close = M.open + M.net;
    months.push(M); open = M.close;
  }
  return {last, sets, months, start};
}
// حالة الموظف في شهر معيّن (للقايمة)
function empMonthState(id, ym){
  const D = empMonthly(id), M = D.months.find(x => x.ym === ym);
  if(M) return {mstate:'month', mopen:M.open, mnet:M.net, mclose:M.close};
  if(D.months.length && ym > D.months[D.months.length - 1].ym){ const L = D.months[D.months.length - 1]; return {mstate:'month', mopen:L.close, mnet:0, mclose:L.close}; }
  if(D.last && ym >= empYM(D.last.period_from) && ym <= empYM(D.last.period_to)) return {mstate:'set', mopen:null, mnet:null, mclose:C(D.last.net_balance)};
  const S = D.sets.find(x => ym >= empYM(x.period_from) && ym <= empYM(x.period_to));
  return S ? {mstate:'set', mopen:null, mnet:null, mclose:C(S.net_balance)} : {mstate:'none', mopen:null, mnet:null, mclose:0};
}

/* =================== قائمة الموظفين (بنفس شكل شاشة الموردين) =================== */
let empFilter = 'all', empAct = 'on', empSort = 'high', empQ = '';
let empView = (() => { try{ return localStorage.getItem('mawredin_emp_view') || 'list'; }catch(e){ return 'list'; } })();
const EMP_F = {all:'الكل', due:'ليهم', owe:'عليهم', zero:'خالص'};
const EMP_ACT = {on:'بيشتغلوا', off:'تركوا العمل', all:'الكل'};
const EMP_SORT = {high:'الأعلى ليهم', low:'الأعلى عليهم', name:'الاسم', no:'رقم الموظف', recent:'آخر تسوية'};
const empC = v => Math.round(n0(v) * 100);
const empKind = r => { const c = empC(r.balance); return c > 0 ? 'due' : c < 0 ? 'owe' : 'zero'; };
const empOn = r => r.active !== false;
const empInAct = r => empAct === 'all' || (empAct === 'on' ? empOn(r) : !empOn(r));
window.empHelp = () => openModal(`<h3>شاشة الموظفين</h3>
  <div class="hint" style="line-height:1.9">
    <div><b class="cred">أخضر</b> = ليه فلوس على المحل.</div>
    <div><b class="due">أحمر</b> = عليه فلوس للمحل (سلف أكتر من المستحق).</div>
    <div>الرصيد = صافي آخر تسوية + الحركات اللي بعد نهاية فترتها.</div>
    <div style="margin-top:8px">البحث بيدور في الاسم ورقم الموظف ورقم التليفون.</div></div>`);
window.setEmpView = v => { empView = v; try{ localStorage.setItem('mawredin_emp_view', v); }catch(e){} viewEmployees(); };
window.empSortMenu = () => openModal(`<h3>ترتيب الموظفين</h3><div class="menu-list">${Object.entries(EMP_SORT).map(([k, l]) => `<button class="${empSort === k ? 'on' : ''}" onclick="empSort='${k}';closeModal();viewEmployees()">${I.sort}${l}${empSort === k ? ' ✓' : ''}</button>`).join('')}</div>`);
window.empFilterMenu = async () => {
  const all = await empApi.balances(), inAct = all.filter(empInAct);
  const cf = k => inAct.filter(r => k === 'all' || empKind(r) === k).length;
  const ca = k => all.filter(r => k === 'all' || (k === 'on' ? empOn(r) : !empOn(r))).length;
  const sec = (t, obj, cur, varn, cnt, ic) => `<div class="section-t"${t.m ? ' style="margin-top:12px"' : ''}>${t.l}</div><div class="menu-list">${Object.entries(obj).map(([k, l]) => `<button class="${cur === k ? 'on' : ''}" onclick="${varn}='${k}';closeModal();viewEmployees()">${I[ic]}${l}${cnt ? ` (${cnt(k)})` : ''}${cur === k ? ' ✓' : ''}</button>`).join('')}</div>`;
  openModal(`<h3>تصفية وترتيب</h3>${sec({l:'الحالة'}, EMP_ACT, empAct, 'empAct', ca, 'users')}${sec({l:'الرصيد', m:1}, EMP_F, empFilter, 'empFilter', cf, 'filter')}${sec({l:'الترتيب', m:1}, EMP_SORT, empSort, 'empSort', null, 'sort')}`);
};
function empCard(r){ return empView === 'list' ? empRow(r, empMonth) : eaCard(r, empMonth); }   // القائمة: صف واحد — الشبكة: الكارت الكامل (js/empaccount.js)
// صف الموظف (زي صف المورد): الصورة، الاسم والمرحّل، الأساسي، العمولات، السلف والخصم، والرصيد في فقاعة
function empRow(r, ym){
  const D = eaMonth(r.id, ym), bal = D.close, ph = String(r.phone || '').replace(/[^\d+]/g, '');
  const n = c => (Math.abs(c) / 100).toLocaleString('en-US', {maximumFractionDigits:0});
  const v = (l, c, cls) => `<span class="er-v"><small>${l}</small><b class="${c ? cls : 'z'}">${n(c)}</b></span>`;
  const take = D.adv + D.ded + D.clothes;
  return `<div class="ecard er" data-n="${esc((r.name + ' ' + (r.emp_no || '') + ' ' + ph.replace(/\D/g, '')).toLowerCase())}" onclick="go('/emp/${r.id}')">
    <span class="er-av">${EA_AV[eaGender(r)]}</span>
    <span class="er-nm"><b>${esc(r.name)}${empOn(r) ? '' : ' <i class="tag left">ترك</i>'}</b><small>مرحّل <bdi dir="ltr">${D.carry < 0 ? '−' : ''}${n(D.carry)}</bdi></small></span>
    ${v('الأساسي', D.base, 'p')}${v('عمولات', D.com, 'p')}${v('سلف وخصم', take, 'm')}
    <span class="er-bal ${bal < 0 ? 'owe' : bal > 0 ? 'due' : 'zero'}"><small>${bal < 0 ? 'عليه' : bal > 0 ? 'ليه' : 'الرصيد'}</small><b>${n(bal)}</b></span>
  </div>`;
}
window.empMore = id => {
  const e = store.eff.employees.get(id), ym = empMonth || today().slice(0, 7), D = eaMonth(id, ym); if(!e) return;
  openModal(`<h3>${esc(e.name)}</h3><div class="hint" style="margin-bottom:10px">${e.emp_no ? 'رقم ' + esc(e.emp_no) + ' · ' : ''}${empMonthName(ym)} · الرصيد ${eaMH(D.close)}</div>
    <div class="menu-list">
      <button onclick="closeModal();eaSel[${id}]='${D.M.virt ? '' : D.M.key}';go('/emp/${id}')">${I.doc}عرض كشف الحساب</button>
      <button onclick="closeModal();eaNewTx(${id},'${ym}')">${I.plus}إضافة حركة جديدة</button>
      <button onclick="closeModal();eaShare(${id},'${D.M.virt ? (D.G.entries.length ? D.G.entries[D.G.entries.length - 1].key : ym) : D.M.key}')">${I.wa}إرسال كشف الحساب واتساب</button>
      <button onclick="closeModal();go('/emp-edit/${id}')">${I.edit}تعديل بيانات الموظف</button>
    </div>`);
};
async function viewEmployees(){
  if(!$('#emplist')) shell({title:'الموظفين', nav:'employees', page:{sub:'حسابات الموظفين والمرتبات والسلف', icon:'users'}, body:skeleton('home')});
  empMonth = empMonth || today().slice(0, 7);
  // رصيد كل موظف في الشهر المختار = آخر الشهر (للشهر الحالي = الرصيد الحالي بالظبط)
  const all = (await empApi.balances()).map(r => { const st = empMonthState(r.id, empMonth); return {...r, ...st, gender:store.eff.employees.get(r.id)?.gender, cur_balance:r.balance, balance:eaMonth(r.id, empMonth).close / 100}; });
  if(!EMP_F[empFilter]) empFilter = 'all';
  const rows = all.filter(empInAct);
  const due = rows.filter(r => empC(r.balance) > 0), owe = rows.filter(r => empC(r.balance) < 0);
  const sumDue = due.reduce((a, r) => a + empC(r.balance), 0) / 100, sumOwe = owe.reduce((a, r) => a + empC(r.balance), 0) / 100;
  const net = sumDue + sumOwe;
  const cnt = k => rows.filter(r => k === 'all' || empKind(r) === k).length;
  const list = rows.filter(r => empFilter === 'all' || empKind(r) === empFilter);
  const N = v => n0(v), noN = r => Number(String(r.emp_no || '').replace(/\D/g, '')) || 1e9;
  list.sort({high:(a, b) => N(b.balance) - N(a.balance) || a.id - b.id, low:(a, b) => N(a.balance) - N(b.balance) || a.id - b.id,
    name:(a, b) => a.name.localeCompare(b.name, 'ar'), no:(a, b) => noN(a) - noN(b) || a.id - b.id,
    recent:(a, b) => String(b.last_to || '').localeCompare(String(a.last_to || '')) || a.id - b.id}[empSort] || (() => 0));
  const m = v => `<span class="num">${Math.abs(v).toLocaleString('en-US', {maximumFractionDigits:0})}</span> ج`;
  const nAct = k => all.filter(r => k === 'all' || (k === 'on' ? empOn(r) : !empOn(r))).length;
  const fc = (on, act, l, n) => `<button class="ef-chip ${on ? 'on' : ''}" onclick="${act};viewEmployees()"><b>${l}</b><span class="num">${n}</span></button>`;
  const allOn = empAct === 'all' && empFilter === 'all';
  const actRow = `<div class="ef-row">
    ${fc(allOn, "empAct='all';empFilter='all'", 'الكل', all.length)}
    ${fc(empAct === 'on', "empAct=empAct==='on'?'all':'on'", 'بيشتغلوا', nAct('on'))}
    ${fc(empAct === 'off', "empAct=empAct==='off'?'all':'off'", 'تركوا العمل', nAct('off'))}
    ${fc(empFilter === 'due', "empFilter=empFilter==='due'?'all':'due'", 'ليهم', cnt('due'))}
    ${fc(empFilter === 'owe', "empFilter=empFilter==='owe'?'all':'owe'", 'عليهم', cnt('owe'))}
  </div>`;
  const fNote = empFilter === 'zero' ? `<div class="sp-note">${I.filter}معروض: خالص (${cnt('zero')}) — <a onclick="empFilter='all';viewEmployees()">عرض الكل</a></div>` : '';
  const curM = today().slice(0, 7), mRows = rows.filter(r => r.mstate === 'month');
  const mSum = k => mRows.reduce((a, r) => { const M = empMonthly(r.id).months.find(x => x.ym === empMonth); return a + (M ? M[k] : 0); }, 0);
  const body = `
    <div class="sp-search">
      <label class="search-w">${I.search}<input class="search" id="esrch" placeholder="ابحث باسم الموظف أو الرقم أو التليفون..." value="${esc(empQ)}" oninput="empQ=this.value;filterEmp(this.value)"></label>
      <button class="sp-fbtn" onclick="empFilterMenu()" aria-label="تصفية">${I.filter}</button>
    </div>
    <div class="month-bar emp-mbar">
      <button class="iconbtn" onclick="empMonth=addMonthsYM(empMonth,-1);viewEmployees()" aria-label="الشهر اللي فات">${I.back}</button>
      <b>${empMonthName(empMonth)}${empMonth === curM ? ' <small>(الشهر ده)</small>' : ''}</b>
      <button class="iconbtn" style="transform:scaleX(-1)" onclick="empMonth=addMonthsYM(empMonth,1);viewEmployees()" aria-label="الشهر الجاي" ${empMonth >= curM ? 'disabled' : ''}>${I.back}</button>
    </div>
    ${mRows.length ? `<div class="emp-mstrip"><span>مرتبات<b class="num">${fmtN(mSum('sal'))}</b></span><span>عمولات<b class="num">${fmtN(mSum('com'))}</b></span><span>سلف وخصومات<b class="num">${fmtN(mSum('adv') + mSum('ded'))}</b></span><span>اتصرف<b class="num">${fmtN(mSum('pay'))}</b></span></div>` : ''}
    <div class="sp-sum">
      <div class="sp-t hl"><i>${I.coins2}</i><span>ليهم</span><b>${m(sumDue)}</b></div>
      <div class="sp-t"><i>${I.warn}</i><span>عليهم</span><b class="due">${m(sumOwe)}</b></div>
      <div class="sp-t"><i>${I.layers}</i><span>الصافي</span><b class="${net < 0 ? 'due' : net > 0 ? 'pay' : ''}">${net < 0 ? '(' + m(net) + ')' : m(net)}</b></div>
      <div class="sp-t"><i>${I.users}</i><span>الموظفين</span><b>${rows.length}</b></div>
    </div>
    ${actRow}
    ${fNote}
    <div class="sp-bar">
      <button class="sp-sort" onclick="empSortMenu()">${I.sort}ترتيب: ${EMP_SORT[empSort]}<i>${I.chevL ? `<span style="display:inline-flex;transform:rotate(-90deg)">${I.chevL}</span>` : '▾'}</i></button>
      <div class="sp-view"><button class="${empView === 'list' ? 'on' : ''}" onclick="setEmpView('list')" aria-label="قائمة">${I.list || I.doc}</button><button class="${empView === 'grid' ? 'on' : ''}" onclick="setEmpView('grid')" aria-label="شبكة">${I.grid}</button></div>
    </div>
    <div id="emplist" class="sp-list ${empView}">
      ${rows.length ? (list.length ? list.map(empCard).join('') : `<div class="card empty">${I.emp}<div>مفيش موظفين في «${EMP_F[empFilter]}»</div></div>`)
        : `<div class="card empty">${I.emp}<div>${all.length ? 'مفيش موظفين هنا' : 'لسه مفيش موظفين'}</div></div>`}
      <div class="card empty" id="enores" style="display:none">${I.emp}<div>مفيش موظف بالاسم أو الرقم ده</div></div>
    </div>
    <div class="emp-adds">
      <button class="btn primary block add-sup" onclick="go('/emp-import')">${I.scan}استيراد كشف</button>
      <button class="btn ghost block add-sup" onclick="go('/emp-edit')">${I.plus}موظف جديد</button>
    </div>`;
  shell({title:'الموظفين', nav:'employees', page:{sub:'حسابات الموظفين والمرتبات والسلف', icon:'users', help:'empHelp()'}, body});
  if(empQ) filterEmp(empQ);
}
window.filterEmp = v => {
  v = v.trim().toLowerCase(); const d = v.replace(/\D/g, ''); let n = 0;
  document.querySelectorAll('#emplist .ecard').forEach(el => { const ok = el.dataset.n.includes(v) || (d.length >= 7 && el.dataset.n.includes(d.replace(/^(00)?20|^0/, ''))); el.style.display = ok ? '' : 'none'; n += ok; });
  const e = $('#enores'); if(e) e.style.display = n || !document.querySelector('#emplist .ecard') ? 'none' : '';
};

/* =================== ملف الموظف: في js/empaccount.js (كشف حساب الموظف) =================== */
window.showSettlement = id => {
  const s = window._emp.sets.find(x => x.id === id); const orig = s.original || {}; const unc = new Set(s.uncertain || []);
  openModal(`<h3>تسوية ${fmtDate(s.period_from)} — ${fmtDate(s.period_to)}</h3>
    ${EMP_FIELDS.map(([k,l]) => {
      const changed = k in orig && orig[k] !== '-' && String(orig[k] ?? '') !== String(s[k] ?? '') && !(orig[k] == null && s[k] == null) && Number(orig[k]) !== Number(s[k]);
      return `<div class="kv ${unc.has(k) ? 'unc' : ''}"><span>${l}${unc.has(k) ? ' ⚠' : ''}</span><span>${k === 'work_days' ? (s[k] ?? '—') : signMoney(s[k])}${changed ? `<small class="muted"> (في الكشف: ${orig[k] ?? '—'})</small>` : ''}</span></div>`; }).join('')}
    <div class="hint" style="margin-top:8px">تسوية تاريخية مستوردة من كشف — مش بتتسجل كحركات جديدة على الخزينة.${s.notes ? '<br>' + esc(s.notes) : ''}</div>
    <div class="actions" style="margin-top:10px"><button class="btn ghost" onclick="go('/emp-set/${s.id}')">${I.edit}تعديل</button>
    ${s.source_image ? `<button class="btn ghost" onclick="viewImg('${esc(s.source_image)}')">${I.img}صورة الكشف</button>` : ''}</div>`);
};

/* =================== تعديل تسوية =================== */
async function formSettlement(id){
  const s = await q(ldb.from('emp_settlements').select('*, employees(name)').eq('id', id).single());
  formShell('تعديل تسوية: ' + esc(s.employees?.name || ''), `
    <div class="hint" style="margin-bottom:10px">الأرقام الأصلية من الكشف بتفضل محفوظة زي ما هي، والتعديل بيتسجل في سجل التعديلات.</div>
    <div class="row2">${EMP_FIELDS.map(([k,l]) => `<div class="field"><label>${l}</label><input id="s_${k}" inputmode="numeric" value="${s[k] ?? ''}"></div>`).join('')}</div>
    <div class="field"><label>ملاحظات</label><textarea id="s_notes" rows="2">${esc(s.notes || '')}</textarea></div>`,
  async () => {
    const row = {notes: $('#s_notes').value.trim() || null};
    EMP_FIELDS.forEach(([k]) => { const v = $('#s_' + k).value.trim(); row[k] = v === '' ? null : readAmountSigned(v); });
    await q(ldb.from('emp_settlements').update(row).eq('id', id));
    busy(false); await celebrate('اتحفظ التعديل');
    location.replace('#/emp/' + s.employee_id);
  });
}
function readAmountSigned(v){
  v = String(v).trim(); const neg = /^\(.*\)$/.test(v) || /^-/.test(v);
  const x = readAmount(v.replace(/[()\-]/g, '')); return isFinite(x) ? (neg ? -x : x) : null;
}

/* =================== حركة موظف =================== */
async function formEmpTx(id, presetEmp){
  const x = id ? await q(ldb.from('emp_transactions').select('*').eq('id', id).single()) : null;
  const emps = await fetchAll(() => ldb.from('employees').select('id,name').order('name').order('id'));
  const qp = new URLSearchParams(location.hash.split('?')[1] || '');
  let kind = x?.kind || qp.get('k') || null, sub = x?.sub || qp.get('sub') || (kind === 'deduction' ? 'other' : null);
  const preB = x?.branch ?? qp.get('b') ?? '', preM = x?.for_month ? empYM(x.for_month) : qp.get('m');
  formShell(x ? 'تعديل حركة' : (kind === 'deduction' && sub ? EA_SUB[sub] : kind === 'commission' || kind === 'advance' ? `${TX_KIND[kind]}${preB ? ' فرع ' + preB : ''}` : kind ? TX_KIND[kind] : 'حركة موظف جديدة'), `
    <div class="field" id="f-emp"><label>الموظف <span class="req">*</span></label>
      <select id="emp"><option value="">— اختار الموظف —</option>${emps.map(e => `<option value="${e.id}" ${String(e.id) === String(x?.employee_id ?? presetEmp) ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select></div>
    <div class="field" id="f-kind"><label>نوع الحركة <span class="req">*</span></label>
      <div class="seg" style="grid-template-columns:repeat(3,1fr)">
        ${Object.entries(TX_KIND).map(([k,l]) => `<button type="button" data-k="${k}">${l}</button>`).join('')}
      </div></div>
    <div class="field" id="f-sub" style="display:none"><label>نوع الخصم</label><div class="seg" id="tsub" style="grid-template-columns:repeat(4,1fr)">
      ${Object.entries(EA_SUB).map(([k, l]) => `<button type="button" data-v="${k}" class="${sub === k ? 'on' : ''}">${l.replace('خصم ', '').replace('مسحوبات ', '')}</button>`).join('')}</div></div>
    <div class="field" id="f-qty" style="display:none"><label id="qty-l">المدة</label><input id="qty" inputmode="decimal" placeholder="اختياري" value="${x?.qty ?? ''}"></div>
    <div class="field" id="f-amount"><label>المبلغ <span class="req">*</span></label><input id="amount" class="amount-input" inputmode="numeric" placeholder="0" value="${x ? Math.abs(n0(x.amount)) : ''}">
      <div class="hint" id="adjhint" style="display:none">التسوية: اكتب المبلغ، وفعّل «بالسالب» لو هتنقص من رصيد الموظف.</div>
      <label id="negwrap" style="display:none;margin-top:6px;font-weight:600"><input type="checkbox" id="neg" ${x && n0(x.amount) < 0 ? 'checked' : ''}> بالسالب (على الموظف)</label></div>
    <div class="field" id="f-meth" style="display:none"><label>اتدفع إزاي؟</label><div class="seg" id="tmeth" style="grid-template-columns:1fr 1fr">
      <button type="button" data-v="cash" class="${x?.method === 'transfer' ? '' : 'on'}">كاش</button><button type="button" data-v="transfer" class="${x?.method === 'transfer' ? 'on' : ''}">تحويل من البنك</button></div>
      <div class="hint">التحويل بيتخصم من رصيد البنك.</div></div>
    <div class="row2">
      <div class="field"><label>التاريخ</label><input id="date" type="date" value="${x ? x.tx_date : (new URLSearchParams(location.hash.split('?')[1] || '').get('d') || today())}"></div>
      <div class="field"><label>الفرع</label><select id="branch"><option value="">—</option>${['زهرة','ورد'].map(b => `<option ${preB === b ? 'selected' : ''}>${b}</option>`).join('')}</select></div>
    </div>
    <div class="field"><label>يتحسب على شهر</label><select id="fmon"></select><div class="hint">مثلًا صرف مستحقات أكتوبر في أول نوفمبر ← اختار أكتوبر.</div></div>
    <div class="field"><label>ملاحظات</label><textarea id="notes" rows="2">${esc(x?.notes || '')}</textarea></div>
    ${x?.auto ? '<div class="note-line" style="margin-bottom:10px">ده مرتب الشهر اللي نزل لوحده أول الشهر. لو فيه غياب أو تأخير سجّل «خصم» أحسن، أو عدّل المبلغ هنا. لو مسحته مش هينزل تاني للشهر ده.</div>' : ''}
    ${x ? `<button type="button" class="btn danger block" style="margin-bottom:14px" onclick="delEmpTx(${x.id}, ${x.employee_id})">مسح الحركة</button>` : ''}`,
  async () => {
    const eid = $('#emp').value, amt = readAmount($('#amount').value);
    if(!eid) return markErr('emp', 'اختار الموظف');
    if(!kind) return markErr('kind', 'اختار نوع الحركة');
    if(!(amt > 0)) return markErr('amount', 'اكتب المبلغ');
    // الحركة لازم تكون بعد آخر كشف مستورد (اللي قبله محسوب جوه الكشف نفسه ومش هيأثر على الرصيد)
    const lastSet = [...store.eff.emp_settlements.values()].filter(s => String(s.employee_id) === String(eid)).map(s => String(s.period_to).slice(0, 10)).sort().pop();
    if(lastSet && ($('#date').value || today()) <= lastSet) return markErr('amount', `التاريخ لازم يبقى بعد ${fmtDate(lastSet)} (آخر كشف مستورد). لو الحركة تخص الكشف، سجّلها بتاريخ النهارده واختار «يتحسب على شهر».`);
    if((kind === 'commission' || kind === 'advance') && !$('#branch').value && !confirm('مفيش فرع متحدد — هتتسجل «من غير فرع». تكمل؟')) return;
    const row = {employee_id:+eid, kind, amount: kind === 'adjustment' && $('#neg').checked ? -amt : amt, tx_date:$('#date').value || today(), branch:$('#branch').value || null, notes:$('#notes').value.trim() || null,
      method:(kind === 'payment' || kind === 'advance') ? ($('#tmeth .on')?.dataset.v === 'transfer' ? 'transfer' : 'cash') : null,
      for_month:$('#fmon').value && $('#fmon').value !== empYM($('#date').value || today()) ? $('#fmon').value + '-01' : null,
      sub:kind === 'deduction' ? (sub || 'other') : null, qty:kind === 'deduction' && (sub === 'late' || sub === 'absence') && $('#qty').value.trim() ? readAmount($('#qty').value) : null};
    if(x) await q(ldb.from('emp_transactions').update(row).eq('id', x.id)); else await q(ldb.from('emp_transactions').insert(row));
    busy(false); await celebrate('اتسجلت الحركة');
    location.replace('#/emp/' + eid);
  });
  const setK = k => { kind = k; document.querySelectorAll('#f-kind .seg button').forEach(b => b.classList.toggle('on', b.dataset.k === k));
    $('#adjhint').style.display = $('#negwrap').style.display = k === 'adjustment' ? '' : 'none'; $('#f-kind').classList.remove('err');
    $('#f-meth').style.display = k === 'payment' || k === 'advance' ? '' : 'none';
    $('#f-sub').style.display = k === 'deduction' ? '' : 'none'; if(k === 'deduction' && !sub) setSub('other'); else setSub(sub); };
  const setSub = v => { sub = v; document.querySelectorAll('#tsub button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
    const q = kind === 'deduction' && (v === 'late' || v === 'absence'); $('#f-qty').style.display = q ? '' : 'none';
    $('#qty-l').textContent = v === 'late' ? 'مدة التأخير (بالدقيقة)' : 'عدد أيام الغياب'; };
  document.querySelectorAll('#tsub button').forEach(b => b.onclick = () => setSub(b.dataset.v));
  document.querySelectorAll('#tmeth button').forEach(b => b.onclick = () => segPick(b));
  const fillMon = () => { const d = empYM($('#date').value || today()), cur = $('#fmon').value || preM || d;
    $('#fmon').innerHTML = [...new Set([d, addMonthsYM(d, -1), ...(preM && preM < addMonthsYM(d, -1) ? [preM] : [])])].map(m => `<option value="${m}" ${m === cur ? 'selected' : ''}>${empMonthName(m)}${m === d ? ' (شهر التاريخ)' : ''}</option>`).join(''); };
  $('#date').addEventListener('change', () => { $('#fmon').value = ''; fillMon(); }); fillMon();
  document.querySelectorAll('#f-kind .seg button').forEach(b => b.onclick = () => setK(b.dataset.k));
  if(kind) setK(kind);
}
window.delEmpTx = async (id, eid) => {
  if(!confirm('تمسح الحركة دي؟')) return;
  busy(true);
  try{ await q(ldb.from('emp_transactions').delete().eq('id', id)); toast('اتمسحت'); location.replace('#/emp/' + eid); }
  catch(e){ toast(errMsg(e), true); } finally{ busy(false); }
};

/* =================== بيانات موظف =================== */
window.segPick = b => b.parentNode.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
window.setEmpActive = async (id, on) => {
  const e = (await empApi.balances()).find(r => r.id === id);
  if(!on && n0(e?.balance) && !confirm(`الموظف ده عليه/ليه رصيد ${n0(e.balance) < 0 ? 'للمحل' : 'على المحل'} ${Math.abs(n0(e.balance)).toLocaleString('en-US')} ج.\nهيتنقل لـ«تركوا العمل» والرصيد هيفضل زي ما هو. تكمل؟`)) return;
  await q(ldb.from('employees').update({active:on}).eq('id', id));
  toast(on ? 'رجع للعمل ✓' : 'اتسجل إنه ترك العمل ✓'); viewEmployee(id);
};
async function formEmployee(id){
  const x = id ? await q(ldb.from('employees').select('*').eq('id', id).single()) : null;
  formShell(x ? 'تعديل بيانات الموظف' : 'موظف جديد', `
    <div class="field" id="f-name"><label>الاسم <span class="req">*</span></label><input id="name" value="${esc(x?.name || '')}"></div>
    <div class="row2">
      <div class="field"><label>رقم الموظف</label><input id="no" inputmode="numeric" value="${esc(x?.emp_no || '')}"></div>
      <div class="field"><label>المرتب الأساسي</label><input id="base" inputmode="numeric" value="${x?.base_salary ?? ''}"></div>
    </div>
    <div class="row2">
      <div class="field"><label>الفرع</label><select id="branch"><option value="">—</option>${['زهرة','ورد','زهرة وورد'].map(b => `<option ${x?.branch === b ? 'selected' : ''}>${b}</option>`).join('')}</select></div>
      <div class="field"><label>التليفون</label><input id="phone" type="tel" value="${esc(x?.phone || '')}"></div>
    </div>
    <div class="field"><label>النوع</label><div class="seg" id="egen" style="grid-template-columns:1fr 1fr">
      <button type="button" data-v="m" class="${(x ? eaGender(x) : 'm') === 'm' ? 'on' : ''}" onclick="segPick(this)">راجل</button>
      <button type="button" data-v="f" class="${x && eaGender(x) === 'f' ? 'on' : ''}" onclick="segPick(this)">ست</button></div></div>
    <div class="field"><label>حالة الموظف</label><div class="seg" id="eact" style="grid-template-columns:1fr 1fr">
      <button type="button" data-v="1" class="${x?.active === false ? '' : 'on'}" onclick="segPick(this)">بيشتغل</button>
      <button type="button" data-v="0" class="${x?.active === false ? 'on' : ''}" onclick="segPick(this)">ترك العمل</button></div></div>
    <div class="field"><label>ملاحظات</label><textarea id="notes" rows="2">${esc(x?.notes || '')}</textarea></div>`,
  async () => {
    const name = $('#name').value.trim(); if(!name) return markErr('name', 'اكتب الاسم');
    const row = {name, emp_no:$('#no').value.trim() || null, base_salary: $('#base').value.trim() ? readAmount($('#base').value) : null, branch:$('#branch').value || null, phone:$('#phone').value.trim() || null, notes:$('#notes').value.trim() || null, active: $('#eact .on').dataset.v === '1', gender:$('#egen .on')?.dataset.v || null};
    if(x){ await q(ldb.from('employees').update(row).eq('id', x.id)); busy(false); toast('اتحفظ ✓'); location.replace('#/emp/' + x.id); }
    else { const r = await q(ldb.from('employees').insert(row).select().single()); busy(false); toast('اتضاف الموظف ✓'); location.replace('#/emp/' + r.id); }
  });
}

/* =================== استيراد كشف الموظفين =================== */
// المسودة بتفضل على الجهاز بس لحد ما تدوس «تأكيد الاستيراد» — مفيش أي حاجة بتتكتب في قاعدة البيانات قبلها
let empDraft = null;
const DRAFT_KEY = 'mawredin_emp_draft';
function loadDraftFromHash(){
  const m = location.hash.match(/[?&]d=([^&]+)/); if(!m) return false;
  try{
    const json = decodeURIComponent(escape(atob(decodeURIComponent(m[1]).replace(/-/g,'+').replace(/_/g,'/'))));
    empDraft = JSON.parse(json); saveDraft();
    history.replaceState(null, '', location.pathname + '#/emp-import');
    return true;
  }catch(e){ toast('رابط المسودة مش سليم', true); return false; }
}
function saveDraft(){ try{ localStorage.setItem(DRAFT_KEY, JSON.stringify(empDraft)); }catch(e){} }
function getDraft(){ if(!empDraft){ try{ empDraft = JSON.parse(localStorage.getItem(DRAFT_KEY)); }catch(e){} } return empDraft; }

const TOTAL_KEYS = ['earned_salary','comm_total','adv_zahra','adv_ward','ded_general','ded_clothes','adv_ded_total','late_ded','prev_balance','net_balance'];
function rowChecks(r){
  const issues = [];
  const c = n0(r.comm_zahra) + n0(r.comm_ward); if(Math.abs(c - n0(r.comm_total)) > 0.009) issues.push(`عمولات زهرة + ورد = ${c.toLocaleString('en-US')} لكن الإجمالي ${n0(r.comm_total).toLocaleString('en-US')}`);
  const a = n0(r.adv_zahra) + n0(r.adv_ward) + n0(r.ded_general) + n0(r.ded_clothes); if(Math.abs(a - n0(r.adv_ded_total)) > 0.009) issues.push(`السلف والخصومات = ${a.toLocaleString('en-US')} لكن الإجمالي ${n0(r.adv_ded_total).toLocaleString('en-US')}`);
  const net = n0(r.earned_salary) + n0(r.comm_total) - n0(r.adv_ded_total) - n0(r.late_ded) + n0(r.prev_balance);
  if(Math.abs(net - n0(r.net_balance)) > 0.009) issues.push(`الصافي المحسوب ${net.toLocaleString('en-US')} لكن المكتوب ${n0(r.net_balance).toLocaleString('en-US')}`);
  return issues;
}
async function viewEmpImport(){
  loadDraftFromHash();
  const d = getDraft();
  if(!d){
    shell({title:'استيراد كشف موظفين', back:true, body:`
      <div class="card mod-hero"><span class="mt-ico big" style="--c:#2b6cb0">${I.scan}</span><h2>استيراد كشف الموظفين</h2>
        <p>صوّر كشف الحساب أو انسخه من Excel، وراجع كل الأرقام قبل ما يتحفظ.</p></div>
      <div class="card">
        <div class="field"><label>ملف Excel (كشف حساب الموظفين)</label>
          <label class="photo" for="impxlsx"><div>${I.list}<div class="ph-t">اختار ملف الكشف (.xlsx)</div></div><input type="file" id="impxlsx" accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" onchange="draftFromXlsx(this.files[0])"></label>
          <div class="hint">التطبيق بيقرا الشيت بنفس شكله: الأعمدة بالأسماء (الاسم، المرتب الأساسي، أيام العمل، … الإجمالي الصافي)، والفترة من سطر «الفترة من … إلى …»، وإجماليات «مراجعة الصورة» للمقارنة. الخانات اللي فيها معادلات بتتحسب بنفس معادلات الشيت. وبتراجع كل حاجة قبل الحفظ.</div></div>
        <div id="xlsxmsg"></div>
      </div>
      <div class="card">
        <div class="field"><label>1) صورة الكشف</label>
          <label class="photo" for="impimg"><div id="impimg-prev">${I.camera}<div class="ph-t">اختار صورة الكشف</div></div><input type="file" id="impimg" accept="image/*" onchange="previewPhoto('impimg')"></label>
          <div class="hint">الصورة بتتحفظ مع الكشف كمصدر. قراءة الجداول الكبيرة من الصورة على الموبايل مش دقيقة، فالأضمن: ابعت الصورة لـ Claude يطلّع الأرقام ويبعتلك رابط مراجعة، أو الصق الجدول من Excel تحت.</div></div>
        <button class="btn ghost block" style="margin-bottom:14px" onclick="ocrEmpImage()">${I.scan}حاول تقرا الأرقام من الصورة</button>
        <div id="ocrmsg"></div>
        <div class="field"><label>2) أو الصق من Excel</label><textarea id="paste" rows="5" placeholder="انسخ صفوف الموظفين من Excel (من عمود الرقم لحد الصافي) والصقها هنا"></textarea>
          <div class="hint">ترتيب الأعمدة: م، الاسم، الأساسي، أيام العمل، المرتب، عمولات زهرة، عمولات ورد، إجمالي العمولات، سلف زهرة، سلف ورد، خصومات، ملابس، إجمالي السلف والخصومات، تأخير، حساب قديم، الصافي.</div></div>
        <button class="btn primary block" onclick="draftFromPaste()">مراجعة البيانات</button>
      </div>`});
    return;
  }
  renderEmpReview();
}
/* ---------- قراءة شيت Excel «كشف حساب الموظفين» ----------
   الأعمدة بتتعرف بأسمائها (مش بمكانها)، فلو الترتيب اتغير أو اتضاف عمود الشيت لسه بيتقري.
   الخانات المحسوبة (المرتب، إجمالي العمولات، إجمالي السلف والخصومات، الصافي) لو الملف مفيهوش قيمتها المحفوظة
   بنحسبها بنفس معادلات الشيت: المرتب = ROUND(الأساسي × الأيام ÷ 30) … الصافي = المرتب + العمولات − السلف والخصومات − التأخير + القديم */
const XL_NORM = t => String(t ?? '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[ـ\s]+/g, ' ').trim();
const XL_COLS = {'م':'emp_no', 'رقم':'emp_no', 'الاسم':'name', 'الموظف':'name', 'المرتب الاساسي':'base_salary', 'الاساسي':'base_salary', 'ايام العمل':'work_days',
  'المرتب':'earned_salary', 'المرتب المستحق':'earned_salary', 'عمولات زهره':'comm_zahra', 'عمولات ورد':'comm_ward', 'اجمالي العمولات':'comm_total',
  'سلف زهره':'adv_zahra', 'سلف ورد':'adv_ward', 'خصومات':'ded_general', 'ملابس':'ded_clothes', 'اجمالي السلف والخصومات':'adv_ded_total',
  'خصم تاخير وغياب':'late_ded', 'خصم التاخير':'late_ded', 'تاخير':'late_ded', 'حساب قديم':'prev_balance', 'الحساب القديم':'prev_balance',
  'الاجمالي الصافي':'net_balance', 'الصافي':'net_balance'};
const XL_TOTALS = {'المرتبات':'earned_salary', 'العمولات':'comm_total', 'السلف زهره':'adv_zahra', 'سلف زهره':'adv_zahra', 'السلف ورد':'adv_ward', 'سلف ورد':'adv_ward',
  'الخصومات':'ded_general', 'الملابس':'ded_clothes', 'السلف والخصومات':'adv_ded_total', 'خصم التاخير':'late_ded', 'الحساب القديم':'prev_balance', 'الصافي':'net_balance'};
function xlNum(v){ if(v == null || v === '' || v === '-' || v === '—') return null; if(typeof v === 'number') return v; return readAmountSigned(String(v)); }
function xlDate(t){ const m = String(t).match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : ''; }
function parseEmpSheet(rows){
  // rows: مصفوفة صفوف، كل صف مصفوفة خانات {v:القيمة المحفوظة، f:المعادلة}
  const txt = r => (r || []).map(c => c?.v ?? '').join(' ');
  let hi = rows.findIndex(r => (r || []).some(c => XL_NORM(c?.v) === 'الاسم'));
  if(hi < 0) throw new Error('مقدرتش ألاقي صف العناوين (عمود «الاسم») في الشيت');
  const col = {}; (rows[hi] || []).forEach((c, j) => { const k = XL_COLS[XL_NORM(c?.v)]; if(k && col[k] == null) col[k] = j; });
  if(col.name == null) throw new Error('عمود «الاسم» مش موجود');
  const d = emptyDraft(); d.source = 'excel';
  const head = rows.slice(0, hi).map(txt).join(' ');
  const pm = head.match(/من\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4})\s*(?:الى|إلى|لـ|-|حتى)\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4})/);
  if(pm){ d.period_from = xlDate(pm[1]); d.period_to = xlDate(pm[2]); }
  for(const t of rows.slice(0, hi).map(txt)){ const bm = t.match(/فرع\s+([^\-|]+)/); if(bm){ d.branch = bm[1].trim(); break; } }
  const R = x => Math.round(x * 100) / 100;
  let i = hi + 1;
  for(; i < rows.length; i++){
    const r = rows[i] || [], name = String(r[col.name]?.v ?? '').trim();
    if(!name) { if(rows.slice(i, i + 2).every(x => !txt(x).trim())) break; continue; }
    if(/^(ال)?اجمالي$/.test(XL_NORM(name))) break;   // صف الإجمالي = آخر الجدول
    const row = {emp_no:String(col.emp_no != null ? (r[col.emp_no]?.v ?? '') : ''), name, original:{}, uncertain:[]};
    const val = k => col[k] == null ? null : xlNum(r[col[k]]?.v);
    for(const [k] of EMP_FIELDS){ row[k] = val(k); row.original[k] = col[k] == null ? null : (r[col[k]]?.f ? '=' + r[col[k]].f : r[col[k]]?.v ?? null); }
    // المعادلات اللي ملهاش قيمة محفوظة في الملف: نحسبها زي الشيت
    if(row.earned_salary == null && row.base_salary != null && row.work_days != null) row.earned_salary = Math.round(row.base_salary * row.work_days / 30);
    if(row.comm_total == null && (row.comm_zahra != null || row.comm_ward != null)) row.comm_total = R(n0(row.comm_zahra) + n0(row.comm_ward));
    if(row.adv_ded_total == null) row.adv_ded_total = R(n0(row.adv_zahra) + n0(row.adv_ward) + n0(row.ded_general) + n0(row.ded_clothes));
    if(row.net_balance == null) row.net_balance = R(n0(row.earned_salary) + n0(row.comm_total) - n0(row.adv_ded_total) - n0(row.late_ded) + n0(row.prev_balance));
    for(const k of ['comm_zahra', 'comm_ward', 'adv_zahra', 'adv_ward', 'ded_general', 'ded_clothes', 'late_ded', 'prev_balance']) if(row[k] == null && col[k] != null) row[k] = 0;
    d.rows.push(row);
  }
  // إجماليات «مراجعة الصورة» (لو موجودة) للمقارنة بس
  for(; i < rows.length; i++){
    const r = rows[i] || []; const lab = r.findIndex(c => XL_TOTALS[XL_NORM(c?.v)]);
    if(lab < 0) continue;
    const k = XL_TOTALS[XL_NORM(r[lab].v)], v = xlNum(r[lab + 1]?.v);
    if(v != null && d.totals_original[k] == null) d.totals_original[k] = v;
  }
  return d;
}
window.draftFromXlsx = async (file) => {
  if(!file) return;
  const msg = $('#xlsxmsg'); if(msg) msg.innerHTML = '<div class="hint">بقرا الملف...</div>';
  try{
    await loadScript('vendor/xlsx.full.min.js');
    const wb = XLSX.read(await file.arrayBuffer(), {type:'array', cellFormula:true});
    let d = null, lastErr = null;
    for(const sn of wb.SheetNames){
      const ws = wb.Sheets[sn], ref = ws['!ref']; if(!ref) continue;
      const rg = XLSX.utils.decode_range(ref), rows = [];
      for(let r = rg.s.r; r <= rg.e.r; r++){ const row = []; for(let c = 0; c <= rg.e.c; c++){ const cell = ws[XLSX.utils.encode_cell({r, c})]; row[c] = cell ? {v:cell.v, f:cell.f} : null; } rows.push(row); }
      try{ d = parseEmpSheet(rows); if(d.rows.length) break; }catch(e){ lastErr = e; }
    }
    if(!d || !d.rows.length) throw lastErr || new Error('مقدرتش ألاقي موظفين في الملف');
    d.notes = `اتقرا من ملف: ${file.name}`;
    empDraft = d; saveDraft();
    toast(`اتقرا ${d.rows.length} موظف — راجع قبل الحفظ`);
    renderEmpReview();
  }catch(e){ console.error(e); if(msg) msg.innerHTML = `<div class="hint" style="color:var(--red)">${esc(e.message || 'مقدرتش أقرا الملف')}</div>`; else toast(errMsg(e), true); }
};
function emptyDraft(){ return {branch:'زهرة وورد', period_from:'', period_to:'', rows:[], totals_original:{}, source:'manual', notes:''}; }
window.draftFromPaste = () => {
  const t = $('#paste').value.trim(); if(!t) return toast('الصق الجدول الأول', true);
  const d = emptyDraft(); d.source = 'excel';
  t.split(/\r?\n/).forEach(line => {
    const c = line.split('\t').map(x => x.trim()); if(c.length < 16 || !c[1]) return;
    const r = {emp_no:c[0], name:c[1]}, unc = [];
    EMP_FIELDS.forEach(([k], i) => { const raw = c[i + 2]; r[k] = (raw === '' || raw === '-' || raw === '—') ? null : readAmountSigned(raw); if(raw !== '' && raw !== '-' && r[k] == null) unc.push(k); });
    r.original = Object.fromEntries(EMP_FIELDS.map(([k], i) => [k, c[i + 2] || null])); r.uncertain = unc; d.rows.push(r);
  });
  if(!d.rows.length) return toast('مقدرتش أقرا صفوف — اتأكد إن الأعمدة 16', true);
  empDraft = d; saveDraft(); renderEmpReview();
};
window.ocrEmpImage = async () => {
  const f = $('#impimg').files[0]; if(!f) return toast('اختار صورة الكشف الأول', true);
  $('#ocrmsg').innerHTML = `<div class="hint">بقرا الصورة...</div><div class="ocr-prog"><i id="ocrbar"></i></div>`;
  try{
    const w = await getOcr(m => { if(m.status === 'recognizing text' && $('#ocrbar')) $('#ocrbar').style.width = Math.round(m.progress*100) + '%'; });
    const { data } = await w.recognize(await compressImage(f, 2400, 0.92));
    const d = emptyDraft(); d.source = 'ocr';
    (data.text || '').split('\n').forEach(line => {
      const norm = line.replace(/[٠-٩]/g, x => '٠١٢٣٤٥٦٧٨٩'.indexOf(x));
      const name = (norm.match(/[؀-ۿ][؀-ۿ\s]+[؀-ۿ]/) || [])[0];
      const nums = norm.match(/\(?-?\d[\d,]*\)?|—|-/g) || [];
      if(!name || nums.length < 5) return;
      const r = {emp_no:'', name:name.trim(), uncertain: EMP_FIELDS.map(([k]) => k), original:{ocr_line: line}};
      EMP_FIELDS.forEach(([k]) => r[k] = null);
      d.rows.push(r);
    });
    empDraft = d; saveDraft();
    $('#ocrmsg').innerHTML = `<div class="hint" style="color:var(--amber)">قريت ${d.rows.length} اسم بس الأرقام لازم تتكتب/تتراجع يدوي — كل الخانات متعلّمة «للمراجعة».</div>`;
    setTimeout(renderEmpReview, 900);
  }catch(e){ $('#ocrmsg').innerHTML = '<div class="hint" style="color:var(--red)">مقدرتش أقرا الصورة</div>'; }
};
function draftTotals(d){ const T = {}; TOTAL_KEYS.forEach(k => T[k] = d.rows.reduce((a,r) => a + n0(r[k]), 0)); return T; }
function renderEmpReview(){
  const d = getDraft(); const T = draftTotals(d);
  const uncN = d.rows.reduce((a,r) => a + (r.uncertain?.length || 0), 0);
  const rowIssues = d.rows.map(rowChecks);
  const issN = rowIssues.filter(x => x.length).length;
  const totRows = TOTAL_KEYS.map(k => {
    const o = d.totals_original?.[k]; const has = o !== undefined && o !== null && o !== '';
    const diff = has ? T[k] - n0(o) : null;
    return `<tr class="${has && Math.abs(diff) > 0.009 ? 'bad' : ''}"><td>${EMP_LABEL[k]}</td>
      <td class="n"><input class="tin" inputmode="decimal" value="${has ? o : ''}" placeholder="—" onchange="setTotal('${k}', this.value)"></td>
      <td class="n">${signMoney(T[k])}</td><td class="n">${has ? (Math.abs(diff) > 0.009 ? signMoney(diff) : '✓') : ''}</td></tr>`; }).join('');
  shell({title:'مراجعة الكشف', back:true, body:`
    <div class="card">
      <div class="row2">
        <div class="field"><label>الفرع</label><input value="${esc(d.branch || '')}" onchange="empDraft.branch=this.value;saveDraft()"></div>
        <div class="field"><label>عدد الموظفين</label><input value="${d.rows.length}" disabled></div>
      </div>
      <div class="row2">
        <div class="field" id="f-pf"><label>من <span class="req">*</span></label><input type="date" value="${d.period_from || ''}" onchange="empDraft.period_from=this.value;saveDraft()"></div>
        <div class="field" id="f-pt"><label>إلى <span class="req">*</span></label><input type="date" value="${d.period_to || ''}" onchange="empDraft.period_to=this.value;saveDraft()"></div>
      </div>
      <div class="field" id="f-srcimg"><label>صورة الكشف (بتتحفظ كمصدر)</label>
        <label class="photo" for="srcimg"><div id="srcimg-prev">${I.camera}<div class="ph-t">اختار صورة الكشف</div></div><input type="file" id="srcimg" accept="image/*" onchange="previewPhoto('srcimg')"></label></div>
    </div>
    <div class="rev-sum">
      <div class="${uncN ? 'w' : 'g'}"><b>${uncN}</b><span>خانة محتاجة مراجعة</span></div>
      <div class="${issN ? 'w' : 'g'}"><b>${issN}</b><span>موظف أرقامه مش متطابقة</span></div>
    </div>
    <div class="card">
      <div class="section-t">الإجماليات: المكتوبة في الكشف مقابل المحسوبة من الصفوف</div>
      <div class="stmt-scroll"><table class="tbl tot-tbl"><thead><tr><th></th><th class="n">في الكشف</th><th class="n">محسوب</th><th class="n">الفرق</th></tr></thead><tbody>${totRows}</tbody></table></div>
      <div class="hint" style="margin-top:6px">الإجماليات للمقارنة بس — الأرقام اللي بتتحفظ هي أرقام كل موظف. التطبيق مش بيعدّل أي رقم عشان الإجمالي يطابق.</div>
    </div>
    ${d.notes ? `<div class="card hint" style="color:var(--ink)">${esc(d.notes).replace(/\n/g,'<br>')}</div>` : ''}
    <div class="section-t" style="margin:10px 4px">الموظفين (${d.rows.length})</div>
    ${d.rows.map((r, i) => `
      <details class="card rev-emp ${rowIssues[i].length || r.uncertain?.length ? 'warn' : ''}">
        <summary><span class="rn">${esc(r.emp_no || i + 1)}</span><span class="rname">${esc(r.name)}</span><span class="rnet">${signMoney(r.net_balance)}</span>${rowIssues[i].length || r.uncertain?.length ? '<span class="tag pending">راجع</span>' : '<span class="tag cleared">✓</span>'}</summary>
        ${rowIssues[i].map(x => `<div class="note-line">${esc(x)}</div>`).join('')}
        <div class="row2" style="margin-top:8px">
          <div class="field"><label>الاسم</label><input value="${esc(r.name)}" onchange="setCell(${i},'name',this.value)"></div>
          <div class="field"><label>رقم</label><input value="${esc(r.emp_no || '')}" onchange="setCell(${i},'emp_no',this.value)"></div>
          ${EMP_FIELDS.map(([k,l]) => `<div class="field ${r.uncertain?.includes(k) ? 'unc' : ''}"><label>${l}${r.uncertain?.includes(k) ? ' ⚠' : ''}</label>
            <input inputmode="decimal" value="${r[k] ?? ''}" placeholder="—" onchange="setCell(${i},'${k}',this.value)"></div>`).join('')}
        </div>
      </details>`).join('')}
    <button class="btn green block" style="padding:15px;font-size:17px;margin-top:6px" onclick="confirmEmpImport()">${I.save}تأكيد الاستيراد (${d.rows.length} موظف)</button>
    <button class="btn danger block" style="margin-top:10px" onclick="if(confirm('تلغي المسودة دي؟')){localStorage.removeItem(DRAFT_KEY);empDraft=null;go('/employees')}">إلغاء المسودة</button>`});
}
window.setCell = (i, k, v) => {
  const r = empDraft.rows[i];
  if(k === 'name' || k === 'emp_no') r[k] = v.trim();
  else { r[k] = v.trim() === '' ? null : readAmountSigned(v); r.uncertain = (r.uncertain || []).filter(x => x !== k); r.edited = [...new Set([...(r.edited || []), k])]; }
  saveDraft(); const y = scrollY; renderEmpReview(); scrollTo({top:y, behavior:'instant'});
  const det = document.querySelectorAll('details.rev-emp')[i]; if(det) det.open = true;
};
window.setTotal = (k, v) => { empDraft.totals_original = empDraft.totals_original || {}; empDraft.totals_original[k] = v.trim() === '' ? null : readAmountSigned(v); saveDraft(); const y = scrollY; renderEmpReview(); scrollTo({top:y, behavior:'instant'}); };
window.confirmEmpImport = async (merge=false) => {
  const d = getDraft();
  if(!d.period_from) return markErr('pf', 'اكتب بداية الفترة');
  if(!d.period_to) return markErr('pt', 'اكتب نهاية الفترة');
  const bad = d.rows.filter(r => !r.name); if(bad.length) return toast('فيه موظف من غير اسم', true);
  const uncN = d.rows.reduce((a,r) => a + (r.uncertain?.length || 0), 0);
  if(!merge && !confirm(`هيتحفظ ${d.rows.length} موظف لفترة ${d.period_from} إلى ${d.period_to}.${uncN ? `\nلسه فيه ${uncN} خانة متعلّمة للمراجعة (هتتحفظ زي ما هي ومتعلّمة).` : ''}\nمتأكد؟`)) return;
  busy(true);
  try{
    let source_image = d.source_image || null;
    const f = $('#srcimg')?.files[0];
    if(f && !source_image){ source_image = await uploadImage(f, 'employee-statements'); d.source_image = source_image; saveDraft(); }
    const payload = {branch:d.branch, period_from:d.period_from, period_to:d.period_to, source_image, merge, notes:d.notes || null,
      totals_original:d.totals_original || {}, totals_computed:draftTotals(d),
      rows:d.rows.map(r => ({...Object.fromEntries(EMP_FIELDS.map(([k]) => [k, r[k]])), emp_no:r.emp_no, name:r.name, original:r.original || null, uncertain:r.uncertain || []}))};
    if(!navigator.onLine) throw Object.assign(new Error('استيراد الكشف محتاج نت — المسودة محفوظة على الجهاز، جرّب لما النت يرجع'), {friendly:true});
    const res = await rpcNet('import_employee_settlements', {p: payload}, 30000).catch(e => { throw isNetErr(e) ? Object.assign(new Error('النت فصل — مفيش حاجة اتسجلت والمسودة محفوظة، جرّب تاني'), {friendly:true}) : e; });
    busy(false);
    if(res.need_confirm){
      if(confirm(`الموظفين دول موجودين بالفعل:\n${res.existing.join('، ')}\n\nتضيف التسوية دي لحساباتهم الموجودة؟`)) return confirmEmpImport(true);
      return;
    }
    if(res.duplicate) return alert(`الفترة دي اتستوردت قبل كده للموظفين دول:\n${res.existing.join('، ')}\n\nمحدش اتسجل — مفيش أي حاجة اتغيرت.`);
    localStorage.removeItem(DRAFT_KEY); empDraft = null;
    syncNow();
    await celebrate(`اتسجل ${res.settlements} موظف`, true);
    location.replace('#/employees');
  }catch(e){ console.error(e); toast(errMsg(e), true); } finally{ busy(false); }
};
