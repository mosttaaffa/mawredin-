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

/* =================== قائمة الموظفين =================== */
let empFilter = 'all';
async function viewEmployees(){
  if(!$('#emplist')) shell({title:'الموظفين', nav:'employees', right:refreshBtn, body:skeleton('home')});
  const rows = await empApi.balances();
  const owe = rows.filter(r => n0(r.balance) < 0), due = rows.filter(r => n0(r.balance) > 0);
  const sumOwe = owe.reduce((a,r) => a + n0(r.balance), 0), sumDue = due.reduce((a,r) => a + n0(r.balance), 0);
  const list = rows.filter(r => empFilter === 'all' || (empFilter === 'due' ? n0(r.balance) > 0 : empFilter === 'owe' ? n0(r.balance) < 0 : n0(r.balance) === 0));
  shell({title:'الموظفين', nav:'employees', right:refreshBtn, body:`
    <div class="card hero">
      <div class="lbl">أرصدة الموظفين (${rows.length} موظف)</div>
      <div class="row">
        <div class="mini"><span>ليهم (على المحل)</span><b>${money(sumDue)}</b><span>${due.length} موظف</span></div>
        <div class="mini"><span>عليهم (للمحل)</span><b>${money(Math.abs(sumOwe))}</b><span>${owe.length} موظف</span></div>
      </div>
    </div>
    <div class="actions" style="margin-bottom:12px">
      <button class="btn primary" onclick="go('/emp-import')">${I.scan}استيراد كشف</button>
      <button class="btn ghost" onclick="go('/emp-edit')">${I.plus}موظف جديد</button>
    </div>
    <input class="search" id="esrch" placeholder="ابحث بالاسم أو الرقم..." oninput="filterEmp(this.value)">
    <div class="chip-row">
      ${[['all','الكل'],['owe','عليه رصيد'],['due','ليه رصيد'],['zero','خالص']].map(([k,l]) => `<button class="chip ${empFilter===k?'on':''}" onclick="empFilter='${k}';viewEmployees()">${l}</button>`).join('')}
    </div>
    <div class="card list emp-list" id="emplist">
      ${list.length ? list.map(r => `
        <div class="item" data-n="${esc((r.name + ' ' + (r.emp_no||'')).toLowerCase())}" onclick="go('/emp/${r.id}')">
          <div class="avatar emp-av">${esc(r.emp_no || r.name.trim()[0])}</div>
          <div class="grow"><div class="t">${esc(r.name)}</div>
            <div class="s">${r.base_salary ? 'أساسي ' + money(r.base_salary) : ''}${r.last_to ? ' · آخر تسوية ' + fmtDate(r.last_to) : ''}</div></div>
          <div class="amt ${n0(r.balance) < 0 ? 'debt' : n0(r.balance) > 0 ? 'ok' : ''}">${signMoney(r.balance)}</div>
        </div>`).join('') : `<div class="empty">${I.emp}<div>${rows.length ? 'مفيش موظفين في الفلتر ده' : 'لسه مفيش موظفين'}</div>
          ${rows.length ? '' : `<button class="btn primary" style="margin-top:12px" onclick="go('/emp-import')">${I.scan}استيراد كشف الموظفين</button>`}</div>`}
    </div>
    <div class="hint" style="text-align:center">الرصيد بالأحمر بين قوسين = على الموظف للمحل · بالأخضر = للموظف على المحل</div>`});
}
window.filterEmp = v => { v = v.trim().toLowerCase(); document.querySelectorAll('#emplist .item').forEach(el => el.style.display = el.dataset.n.includes(v) ? '' : 'none'); };

/* =================== ملف الموظف =================== */
let empTab = {};
async function viewEmployee(id){
  if(!$('.emp-prof')) shell({title:'...', back:true, nav:'employees', body:skeleton('sup')});
  const [e, sets, txs] = await Promise.all([empApi.one(id), empApi.settlements(id), empApi.txs(id)]);
  window._emp = {e, sets, txs};
  const last = sets[0], t = empTab[id] || 'sum';
  const kv = (k, v, cls='') => `<div class="ek ${cls}"><span>${k}</span><b>${v}</b></div>`;
  const after = txs.filter(x => !last || x.tx_date > last.period_to);
  let body;
  if(t === 'sum'){
    const plus = n0(last?.earned_salary) + n0(last?.comm_total), minus = n0(last?.adv_ded_total) + n0(last?.late_ded);
    const mx = Math.max(plus, minus, Math.abs(n0(last?.prev_balance)), 1);
    const bar = (l, v, c) => `<div class="fbar"><span>${l}</span><i style="--w:${Math.round(Math.abs(v) / mx * 100)}%;--c:${c}"></i><b>${signMoney(v)}</b></div>`;
    const sec = (title, rows, open='') => `<details class="card gsec" ${open}><summary>${title}${I.chev}</summary><div class="egrid">${rows}</div></details>`;
    body = last ? `
      <div class="card">
        <div class="sec-h"><span>آخر تسوية</span><small class="muted">${fmtDate(last.period_from)} — ${fmtDate(last.period_to)}</small></div>
        ${bar('المستحق له (مرتب + عمولات)', plus, '#10B981')}
        ${bar('عليه (سلف وخصومات)', -minus, '#EF4444')}
        ${n0(last.prev_balance) ? bar('حساب قديم', n0(last.prev_balance), '#60A5FA') : ''}
        <div class="ek hl" style="margin-top:8px"><span>الإجمالي الصافي</span><b>${signMoney(last.net_balance)}</b></div>
      </div>
      ${sec('المرتب', kv('المرتب الأساسي', money(last.base_salary)) + kv('أيام العمل', last.work_days ?? '—') + kv('المرتب المستحق', money(last.earned_salary)), 'open')}
      ${sec('العمولات', kv('عمولات زهرة', money(last.comm_zahra)) + kv('عمولات ورد', money(last.comm_ward)) + kv('إجمالي العمولات', money(last.comm_total), 'hl'))}
      ${sec('السلف والخصومات', kv('سلف زهرة', money(last.adv_zahra)) + kv('سلف ورد', money(last.adv_ward)) + kv('خصومات', money(last.ded_general)) + kv('ملابس', money(last.ded_clothes)) + kv('خصم تأخير وغياب', money(last.late_ded)) + kv('إجمالي السلف والخصومات', money(last.adv_ded_total), 'hl'))}
      ${sec('الأرصدة', kv('حساب قديم', signMoney(last.prev_balance)) + kv('الإجمالي الصافي', signMoney(last.net_balance), 'hl'))}
      <button class="btn ghost block" style="margin-bottom:12px" onclick="showSettlement(${last.id})">التسوية كاملة مع أرقام الكشف الأصلية</button>
      ${after.length ? `<div class="card"><div class="sec-h"><span>حركات بعد التسوية</span></div><div class="list">${after.map(txRow).join('')}</div></div>` : ''}`
      : `<div class="card empty">${I.emp}<div>مفيش تسويات لسه للموظف ده</div></div>`;
  } else if(t === 'sets'){
    body = `<div class="card list">${sets.length ? sets.map(s => `
      <div class="item" onclick="showSettlement(${s.id})">
        <div class="ico" style="background:#e8f0fa;color:#2b6cb0">${I.doc}</div>
        <div class="grow"><div class="t">تسوية ${fmtDate(s.period_from)} — ${fmtDate(s.period_to)}</div>
          <div class="s">مرتب ${money(s.earned_salary)} · عمولات ${money(s.comm_total)}${s.uncertain?.length ? ' · <span class="tag pending">فيها خانات للمراجعة</span>' : ''}</div></div>
        <div class="amt">${signMoney(s.net_balance)}</div></div>`).join('') : '<div class="empty">مفيش تسويات</div>'}</div>`;
  } else {
    body = `<div class="card list">${txs.length ? txs.map(txRow).join('') : '<div class="empty">مفيش حركات</div>'}</div>`;
  }
  shell({title:esc(e.name), back:true, nav:'employees', right:`<button class="iconbtn" onclick="go('/emp-edit/${id}')" aria-label="تعديل">${I.edit}</button>`, body:`
    <div class="emp-prof">
    <div class="card hero" style="padding:14px">
      <div class="lbl">${e.emp_no ? 'رقم ' + esc(e.emp_no) + ' · ' : ''}${esc(e.branch || '')}</div>
      <div class="big">${signMoney(e.balance)}</div>
      <div class="lbl">${n0(e.balance) < 0 ? 'على الموظف للمحل' : n0(e.balance) > 0 ? 'للموظف على المحل' : 'الحساب خالص'}${n0(e.tx_delta) ? ` · منها حركات بعد آخر تسوية ${signMoney(e.tx_delta)}` : ''}</div>
    </div>
    <div class="actions" style="margin-bottom:12px">
      <button class="btn primary" onclick="go('/emp-tx?e=${id}')">${I.plus}حركة جديدة</button>
      <button class="btn ghost" onclick="go('/emp-statement/${id}')">${I.doc}كشف حساب</button>
    </div>
    <div class="tabs">
      <button class="${t==='sum'?'on':''}" onclick="empTab[${id}]='sum';viewEmployee(${id})">الملخص</button>
      <button class="${t==='sets'?'on':''}" onclick="empTab[${id}]='sets';viewEmployee(${id})">التسويات (${sets.length})</button>
      <button class="${t==='tx'?'on':''}" onclick="empTab[${id}]='tx';viewEmployee(${id})">الحركات (${txs.length})</button>
    </div>
    ${body}
    </div>`});
}
function txRow(x){
  const plus = TX_PLUS(x.kind) || (x.kind === 'adjustment' && n0(x.amount) > 0);
  return `<div class="item" onclick="go('/emp-tx/${x.id}')" style="cursor:pointer">
    <div class="ico ${plus ? 'pay' : 'bounced'}">${plus ? I.plus : I.cash}</div>
    <div class="grow"><div class="t">${TX_KIND[x.kind]}${x.branch ? ` <span class="tag">${esc(x.branch)}</span>` : ''}</div><div class="s">${fmtDate(x.tx_date)}${x.notes ? ' · ' + esc(x.notes) : ''}</div></div>
    <div class="amt ${plus ? 'ok' : 'debt'}">${plus ? '+' : '−'} ${money(Math.abs(n0(x.amount)))}</div></div>`;
}
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
    <div class="row2">${EMP_FIELDS.map(([k,l]) => `<div class="field"><label>${l}</label><input id="s_${k}" inputmode="decimal" value="${s[k] ?? ''}"></div>`).join('')}</div>
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
  let kind = x?.kind || null;
  formShell(x ? 'تعديل حركة' : 'حركة موظف جديدة', `
    <div class="field" id="f-emp"><label>الموظف <span class="req">*</span></label>
      <select id="emp"><option value="">— اختار الموظف —</option>${emps.map(e => `<option value="${e.id}" ${String(e.id) === String(x?.employee_id ?? presetEmp) ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select></div>
    <div class="field" id="f-kind"><label>نوع الحركة <span class="req">*</span></label>
      <div class="seg" style="grid-template-columns:repeat(3,1fr)">
        ${Object.entries(TX_KIND).map(([k,l]) => `<button type="button" data-k="${k}">${l}</button>`).join('')}
      </div></div>
    <div class="field" id="f-amount"><label>المبلغ <span class="req">*</span></label><input id="amount" class="amount-input" inputmode="decimal" placeholder="0" value="${x ? Math.abs(n0(x.amount)) : ''}">
      <div class="hint" id="adjhint" style="display:none">التسوية: اكتب المبلغ، وفعّل «بالسالب» لو هتنقص من رصيد الموظف.</div>
      <label id="negwrap" style="display:none;margin-top:6px;font-weight:600"><input type="checkbox" id="neg" ${x && n0(x.amount) < 0 ? 'checked' : ''}> بالسالب (على الموظف)</label></div>
    <div class="row2">
      <div class="field"><label>التاريخ</label><input id="date" type="date" value="${x ? x.tx_date : today()}"></div>
      <div class="field"><label>الفرع</label><select id="branch"><option value="">—</option>${['زهرة','ورد'].map(b => `<option ${x?.branch === b ? 'selected' : ''}>${b}</option>`).join('')}</select></div>
    </div>
    <div class="field"><label>ملاحظات</label><textarea id="notes" rows="2">${esc(x?.notes || '')}</textarea></div>
    ${x ? `<button type="button" class="btn danger block" style="margin-bottom:14px" onclick="delEmpTx(${x.id}, ${x.employee_id})">مسح الحركة</button>` : ''}`,
  async () => {
    const eid = $('#emp').value, amt = readAmount($('#amount').value);
    if(!eid) return markErr('emp', 'اختار الموظف');
    if(!kind) return markErr('kind', 'اختار نوع الحركة');
    if(!(amt > 0)) return markErr('amount', 'اكتب المبلغ');
    const row = {employee_id:+eid, kind, amount: kind === 'adjustment' && $('#neg').checked ? -amt : amt, tx_date:$('#date').value || today(), branch:$('#branch').value || null, notes:$('#notes').value.trim() || null};
    if(x) await q(ldb.from('emp_transactions').update(row).eq('id', x.id)); else await q(ldb.from('emp_transactions').insert(row));
    busy(false); await celebrate('اتسجلت الحركة');
    location.replace('#/emp/' + eid);
  });
  const setK = k => { kind = k; document.querySelectorAll('#f-kind .seg button').forEach(b => b.classList.toggle('on', b.dataset.k === k));
    $('#adjhint').style.display = $('#negwrap').style.display = k === 'adjustment' ? '' : 'none'; $('#f-kind').classList.remove('err'); };
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
async function formEmployee(id){
  const x = id ? await q(ldb.from('employees').select('*').eq('id', id).single()) : null;
  formShell(x ? 'تعديل بيانات الموظف' : 'موظف جديد', `
    <div class="field" id="f-name"><label>الاسم <span class="req">*</span></label><input id="name" value="${esc(x?.name || '')}"></div>
    <div class="row2">
      <div class="field"><label>رقم الموظف</label><input id="no" inputmode="numeric" value="${esc(x?.emp_no || '')}"></div>
      <div class="field"><label>المرتب الأساسي</label><input id="base" inputmode="decimal" value="${x?.base_salary ?? ''}"></div>
    </div>
    <div class="row2">
      <div class="field"><label>الفرع</label><select id="branch"><option value="">—</option>${['زهرة','ورد','زهرة وورد'].map(b => `<option ${x?.branch === b ? 'selected' : ''}>${b}</option>`).join('')}</select></div>
      <div class="field"><label>التليفون</label><input id="phone" type="tel" value="${esc(x?.phone || '')}"></div>
    </div>
    <div class="field"><label>ملاحظات</label><textarea id="notes" rows="2">${esc(x?.notes || '')}</textarea></div>`,
  async () => {
    const name = $('#name').value.trim(); if(!name) return markErr('name', 'اكتب الاسم');
    const row = {name, emp_no:$('#no').value.trim() || null, base_salary: $('#base').value.trim() ? readAmount($('#base').value) : null, branch:$('#branch').value || null, phone:$('#phone').value.trim() || null, notes:$('#notes').value.trim() || null};
    if(x){ await q(ldb.from('employees').update(row).eq('id', x.id)); busy(false); toast('اتحفظ ✓'); location.replace('#/emp/' + x.id); }
    else { const r = await q(ldb.from('employees').insert(row).select().single()); busy(false); toast('اتضاف الموظف ✓'); location.replace('#/emp/' + r.id); }
  });
}

/* =================== كشف حساب موظف =================== */
async function viewEmpStatement(id){
  shell({title:'كشف حساب موظف', back:true, body:skeleton('sup')});
  const [e, sets, txs] = await Promise.all([empApi.one(id), empApi.settlements(id), empApi.txs(id)]);
  const ev = [
    ...sets.map(s => ({d:String(s.period_to).slice(0,10), kind:'set', s})),
    ...txs.map(x => ({d:String(x.tx_date).slice(0,10), kind:'tx', x})),
  ].sort((a,b) => a.d === b.d ? (a.kind === 'set' ? -1 : 1) : (a.d < b.d ? -1 : 1));
  let run = 0;
  const lines = ev.map(v => {
    if(v.kind === 'set'){ run = n0(v.s.net_balance); return `<div class="sl open"><div class="sl-r"><div class="sl-t">تسوية ${fmtDate(v.s.period_from)} — ${fmtDate(v.s.period_to)}</div><div class="sl-d">مرتب ${money(v.s.earned_salary)} + عمولات ${money(v.s.comm_total)} − سلف وخصومات ${money(n0(v.s.adv_ded_total) + n0(v.s.late_ded))} + قديم ${signMoney(v.s.prev_balance)}</div></div><div class="sl-l"><div class="sl-a">${signMoney(v.s.net_balance)}</div><div class="sl-b">صافي التسوية</div></div></div>`; }
    const plus = TX_PLUS(v.x.kind) || (v.x.kind === 'adjustment' && n0(v.x.amount) > 0);
    const delta = v.x.kind === 'adjustment' ? n0(v.x.amount) : plus ? n0(v.x.amount) : -n0(v.x.amount); run += delta;
    return `<div class="sl"><div class="sl-r"><div class="sl-t">${TX_KIND[v.x.kind]}${v.x.notes ? ' · ' + esc(v.x.notes) : ''}</div><div class="sl-d">${fmtDate(v.d)}</div></div><div class="sl-l"><div class="sl-a ${plus ? 'cre' : 'deb'}">${plus ? '+' : '−'} ${money(Math.abs(delta))}</div><div class="sl-b">الرصيد ${signMoney(run)}</div></div></div>`;
  }).reverse().join('');
  shell({title:'كشف حساب موظف', back:true, body:`
    <div class="no-print"><button class="btn ghost block" style="margin-bottom:12px" onclick="window.print()">${I.print}PDF / طباعة</button></div>
    <div class="stmt">
      <div class="stmt-h"><img src="icons/ward.png" alt=""><div><small>ورد · زهرة</small><h2>${esc(e.name)}</h2><small>${e.emp_no ? 'رقم ' + esc(e.emp_no) : ''}</small></div><img src="icons/zahra.png" alt=""></div>
      <div class="sum3" style="grid-template-columns:1fr"><div class="${n0(e.balance) < 0 ? 'c' : 'b'}"><span>الرصيد الحالي</span><b>${signMoney(e.balance)}</b></div></div>
      <div class="stmt-list" style="display:block">${lines || '<div class="empty">مفيش حركات</div>'}</div>
      <div class="stmt-foot"><span>اتعمل يوم ${fmtDate(today())}</span><span>ورد · زهرة</span></div>
    </div>`});
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
  saveDraft(); const y = scrollY; renderEmpReview(); scrollTo(0, y);
  const det = document.querySelectorAll('details.rev-emp')[i]; if(det) det.open = true;
};
window.setTotal = (k, v) => { empDraft.totals_original = empDraft.totals_original || {}; empDraft.totals_original[k] = v.trim() === '' ? null : readAmountSigned(v); saveDraft(); const y = scrollY; renderEmpReview(); scrollTo(0, y); };
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
