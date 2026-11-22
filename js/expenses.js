/* =================== المصروفات — يومي لكل فرع ===================
   مصدرين:
   1) مصروفات يدوية (جدول expenses): إيجار، كهربا، ... لفرع ورد أو زهرة أو مشترك.
   2) تلقائي (مبيتنسخش — بيتقري من مكانه، فمفيش تكرار وأي تعديل أو مسح في الأصل بيظهر على طول):
      - دفعات الموردين (كاش/تحويل) بتاريخ الدفعة ← «مشترك»
      - الشيكات لما تتصرف: كل سداد فعلي بتاريخه، ولو البنك صرف الشيك كله الباقي بميعاد الشيك ← «مشترك»
        (الشيك اللي لسه ما اتصرفش، أو المرتجع/الملغي، مبيتحسبش غير المسدد منه فعلًا)
      - أقساط القروض + الغرامات بتاريخ الدفع ← «مشترك»
      - صرف وسلف الموظفين بتاريخ الحركة ← فرع الحركة لو متحدد، وإلا «مشترك»
   كل الحسابات بالقروش. */

const EXP_BR = ['ورد', 'زهرة', 'مشترك'];
const EXP_CATS = ['إيجار', 'كهربا', 'مياه', 'غاز', 'نت وتليفون', 'مواصلات ونقل', 'أكياس وتغليف', 'نظافة', 'صيانة', 'ضيافة وأكل', 'إعلانات', 'ضرايب ورسوم', 'أخرى'];
const EXP_AUTO = {sup:'دفعات موردين', chk:'شيكات اتصرفت', loan:'أقساط قروض', emp:'مرتبات وسلف', bank:'مصاريف بنكية'};
let expMonth = null, expOpen = null;

function expItems(){
  const E = store.eff || {}, out = [], sup = id => E.suppliers?.get(id)?.name || '';
  const d10 = v => String(v || '').slice(0, 10);
  for(const x of (E.expenses?.values() || []))
    out.push({d:d10(x.exp_date), br:EXP_BR.includes(x.branch) ? x.branch : 'مشترك', cat:x.category || 'أخرى', amt:C(x.amount), src:'manual', id:x.id, t:x.notes || '', pend:x._pending, go:`/expense/${x.id}`});
  for(const p of (E.payments?.values() || [])){
    if(p.method === 'return' || p.method === 'discount') continue;   // مرتجع/خصم مش فلوس طالعة
    if(p.method === 'check'){
      const i = checkInfo(p);
      for(const c of i.live) out.push({d:d10(c.pay_date), br:'مشترك', cat:EXP_AUTO.chk, amt:C(c.amount), src:'chk', t:`شيك ${p.check_no || ''} — ${sup(p.supplier_id)}`, pend:c._pending, go:`/pay/${p.id}`});
      if(p.check_status === 'cleared' && i.paidRows < i.orig)
        out.push({d:d10(p.due_date || p.pay_date), br:'مشترك', cat:EXP_AUTO.chk, amt:i.orig - i.paidRows, src:'chk', t:`صرف شيك ${p.check_no || ''} — ${sup(p.supplier_id)}`, pend:p._pending, go:`/pay/${p.id}`});
      continue;
    }
    out.push({d:d10(p.pay_date), br:'مشترك', cat:EXP_AUTO.sup, amt:C(p.amount), src:'sup', t:`${p.method === 'transfer' ? 'تحويل' : 'كاش'} — ${sup(p.supplier_id)}`, pend:p._pending, go:`/pay/${p.id}`});
  }
  for(const lp of (E.loan_payments?.values() || [])){
    const L = E.loans?.get(lp.loan_id);
    out.push({d:d10(lp.pay_date), br:'مشترك', cat:EXP_AUTO.loan, amt:C(lp.amount) + C(lp.penalty), src:'loan', t:`${L?.bank || 'قرض'}${C(lp.penalty) ? ' (منها غرامة ' + (C(lp.penalty) / 100).toLocaleString('en-US') + ')' : ''}`, pend:lp._pending, go:`/loan/${lp.loan_id}`});
  }
  for(const x of (E.emp_transactions?.values() || [])){
    if(x.kind !== 'payment' && x.kind !== 'advance') continue;
    out.push({d:d10(x.tx_date), br:x.branch === 'ورد' || x.branch === 'زهرة' ? x.branch : 'مشترك', cat:EXP_AUTO.emp, amt:Math.abs(C(x.amount)), src:'emp',
      t:`${x.kind === 'advance' ? 'سلفة' : 'صرف'} — ${E.employees?.get(x.employee_id)?.name || ''}`, pend:x._pending, go:`/emp/${x.employee_id}`});
  }
  for(const m of (E.bank_moves?.values() || [])) if(m.kind === 'fee')
    out.push({d:d10(m.move_date), br:'مشترك', cat:EXP_AUTO.bank, amt:C(m.amount), src:'bank', t:m.notes || 'مصاريف بنكية', pend:m._pending, go:`/bank-move/${m.id}`});
  return out.filter(x => x.d && x.amt > 0);
}
function expByMonth(){
  const months = {};
  for(const x of expItems()){
    const mk = x.d.slice(0, 7);
    const M = months[mk] ||= {key:mk, days:{}, by:Object.fromEntries(EXP_BR.map(b => [b, 0])), cats:{}, total:0};
    const D = M.days[x.d] ||= {date:x.d, items:[], by:Object.fromEntries(EXP_BR.map(b => [b, 0])), total:0};
    D.items.push(x); D.by[x.br] += x.amt; D.total += x.amt; M.by[x.br] += x.amt; M.total += x.amt;
    const ck = x.cat; M.cats[ck] = M.cats[ck] || {amt:0, auto:x.src !== 'manual'}; M.cats[ck].amt += x.amt;
  }
  return months;
}
function expSummary(){ const mk = today().slice(0, 7), M = expByMonth()[mk]; return {month:M ? M.total : 0, n:(store.eff?.expenses?.size || 0)}; }

async function viewExpenses(){
  const t = today(), months = expByMonth(), keys = Object.keys(months).sort().reverse();
  expMonth = expMonth || t.slice(0, 7);
  if(!expOpen) expOpen = new Set([expMonth]);
  const opts = [...new Set([t.slice(0, 7), expMonth, ...keys])].sort().reverse();
  const sel = months[expMonth] || {by:Object.fromEntries(EXP_BR.map(b => [b, 0])), cats:{}, total:0, days:{}};
  const cats = Object.entries(sel.cats).sort((a, b) => b[1].amt - a[1].amt);
  const v = c => c ? `<b>${csNum(c)}</b>` : '<b class="cm-none">—</b>';
  const month = mk => { const M = months[mk], open = expOpen.has(mk), days = Object.keys(M.days).sort();
    return `<section class="card cm ex ${open ? 'open' : ''}">
      <button class="cm-h" onclick="expToggle('${mk}')" aria-expanded="${open}"><span class="cm-hi">${I.cal}</span>
        <span class="cm-ht"><b>${csMonthName(mk)}</b><small>(${csDaysWord(days.length)})</small></span>
        <span class="cm-htot"><small>إجمالي الشهر</small><b>${csNum(M.total)}</b></span><span class="cm-chev">${I.chevL}</span></button>
      ${open ? `<div class="cm-days">${days.map(d => { const D = M.days[d], auto = D.items.some(x => x.src !== 'manual'), pend = D.items.some(x => x.pend);
        return `<button class="cm-r ex-r" onclick="expDay('${d}')"><div class="cm-d">${I.cal}<span><b>${CS_DAYS[new Date(d + 'T12:00:00').getDay()]}</b><small>${fmtDate(d)}</small></span></div>
          ${EXP_BR.map(b => `<div class="cm-c"><small>${b}</small>${v(D.by[b])}</div>`).join('')}
          <div class="cm-t"><small>إجمالي اليوم</small><b>${csNum(D.total)}</b>${auto ? '<i class="ex-auto" title="فيه تلقائي">تلقائي</i>' : ''}${pend ? '<i class="cm-p"></i>' : ''}</div></button>`; }).join('')}</div>` : ''}
      <div class="cm-sum ex-sum ${open ? 'dark' : ''}"><span class="cm-sl">${I.coins}إجمالي ${csMonthName(mk)}</span>${EXP_BR.map(b => `<span class="cm-sv"><small>${b === 'مشترك' ? 'مشترك' : 'فرع ' + b}</small><b>${csNum(M.by[b])}</b></span>`).join('')}</div></section>`; };
  shell({title:'المصروفات', nav:'more', page:{sub:'مصروفات ورد وزهرة كل يوم — والدفعات بتتسجل لوحدها', icon:'expense'}, body:`
    <div class="card cs-top">
      <div class="cs-th2"><b>${I.chart}ملخص المصروفات</b>
        <label class="cs-pick">${I.cal}<select onchange="expMonth=this.value;viewExpenses()">${opts.map(k => `<option value="${k}" ${k === expMonth ? 'selected' : ''}>${csMonthName(k)}</option>`).join('')}</select><span class="cs-pk-chev">${I.chevL}</span></label></div>
      <div class="ex-4">${EXP_BR.map(b => `<div class="cs-k"><i>${b === 'مشترك' ? I.layers : I.store}</i><span>${b === 'مشترك' ? 'مشترك' : 'فرع ' + b}</span><b>${csNum(sel.by[b])}</b></div>`).join('')}
        <div class="cs-k hl"><i>${I.coins}</i><span>الإجمالي</span><b>${csNum(sel.total)}</b></div></div>
      ${cats.length ? `<div class="ex-cats">${cats.map(([k, c]) => `<div class="ex-cat"><span>${esc(k)}${c.auto ? ' <i>تلقائي</i>' : ''}</span><b>${csNum(c.amt)}</b></div>`).join('')}</div>` : ''}
    </div>
    <button class="btn primary block cs-add" onclick="go('/expense')">${I.plus}تسجيل مصروف</button>
    ${keys.length ? keys.map(month).join('') : '<div class="hint" style="text-align:center;padding:24px 0">لسه مفيش مصروفات — دوس «تسجيل مصروف». دفعات الموردين وأقساط القروض وصرف الموظفين هيظهروا هنا لوحدهم.</div>'}
  `});
}
window.expToggle = mk => { expOpen.has(mk) ? expOpen.delete(mk) : expOpen.add(mk); viewExpenses(); };
// تفاصيل يوم: كل مصروف بفرعه — اليدوي بيتعدل، والتلقائي بيفتح مكانه الأصلي
window.expDay = d => {
  const D = expByMonth()[d.slice(0, 7)]?.days[d]; if(!D) return;
  const SRC = {sup:'من دفعات الموردين', chk:'من الشيكات', loan:'من القروض', emp:'من الموظفين'};
  openModal(`<h3>مصروفات ${CS_DAYS[new Date(d + 'T12:00:00').getDay()]} ${fmtDate(d)}</h3>
    ${EXP_BR.filter(b => D.items.some(x => x.br === b)).map(b => `<div class="ex-g"><div class="ex-gh"><b>${b === 'مشترك' ? 'مشترك' : 'فرع ' + b}</b><span>${smoney(D.by[b])}</span></div>
      ${D.items.filter(x => x.br === b).map(x => `<button class="ex-it" onclick="closeModal();go('${x.go}')"><span><b>${esc(x.cat)}</b><small>${esc(x.t)}${x.src !== 'manual' ? ` · <i class="ex-src">تلقائي ${SRC[x.src]}</i>` : ''}${x.pend ? ' · على الجهاز' : ''}</small></span><em>${smoney(x.amt)}</em>${x.src === 'manual' ? I.edit : I.chevL}</button>`).join('')}</div>`).join('')}
    <div class="kv" style="margin-top:6px"><span>إجمالي اليوم</span><b>${smoney(D.total)}</b></div>
    <div class="hint" style="margin:6px 0 10px">التلقائي بيتعدل أو يتمسح من مكانه (الدفعة، القرض، الموظف) — وبيتحدث هنا لوحده.</div>
    <div class="actions"><button class="btn primary" onclick="closeModal();go('/expense?d=${d}')">${I.plus}مصروف لليوم ده</button><button class="btn ghost" onclick="closeModal()">إغلاق</button></div>`);
};

/* ---------- فورم المصروف ---------- */
async function formExpense(id){
  const x = id ? store.eff.expenses?.get(id) : null;
  if(id && !x) return go('/expenses');
  const qp = new URLSearchParams(location.hash.split('?')[1] || '');
  const br = x?.branch || qp.get('b') || localStorage.getItem('mawredin_exp_branch') || 'ورد';
  const used = [...new Set([...EXP_CATS, ...[...(store.eff.expenses?.values() || [])].map(e => e.category).filter(Boolean)])];
  const emps = x ? [] : await fetchAll(() => ldb.from('employee_balances').select('id,name,balance,active').order('name')).catch(() => []);
  const presetEmp = qp.get('e');
  formShell(x ? 'تعديل مصروف' : 'تسجيل مصروف', `
    ${x ? '' : `<div class="field"><label>المصروف ده لمين؟</label><div class="seg ex-for" id="efor" style="grid-template-columns:repeat(4,1fr)">
      <button type="button" data-v="exp" class="${presetEmp ? '' : 'on'}">مصروف</button><button type="button" data-v="emp" class="${presetEmp ? 'on' : ''}">موظف</button>
      <button type="button" data-v="sup">مورد</button><button type="button" data-v="loan">قرض</button></div>
      <div class="hint" id="efor-h"></div></div>
    <div id="emp-box" style="display:none">
      <div class="field" id="f-emp"><label>الموظف <span class="req">*</span></label><select id="emp"><option value="">— اختار الموظف —</option>
        ${emps.filter(e => e.active !== false || String(e.id) === presetEmp).map(e => `<option value="${e.id}" data-bal="${n0(e.balance)}" ${String(e.id) === presetEmp ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select>
        <div class="hint" id="emp-bal"></div></div>
      <div class="field" id="f-ekind"><label>نوع الصرف <span class="req">*</span></label><div class="seg" id="ekind" style="grid-template-columns:1fr 1fr">
        <button type="button" data-v="payment" class="on">صرف مستحقات / مرتب</button><button type="button" data-v="advance">سلفة</button></div></div>
      <div class="field"><label>اتدفع إزاي؟</label><div class="seg" id="emeth" style="grid-template-columns:1fr 1fr">
        <button type="button" data-v="cash" class="on">كاش</button><button type="button" data-v="transfer">تحويل من البنك</button></div></div>
    </div>`}
    <div class="field"><label>الفرع</label><div class="seg" id="ebr">
      ${EXP_BR.map(b => `<button type="button" data-v="${b}" class="${br === b ? 'on' : ''}" onclick="segPick(this)">${b}</button>`).join('')}</div></div>
    <div class="field"><label>اليوم</label><input id="edate" type="date" value="${x?.exp_date || qp.get('d') || today()}"></div>
    <div id="cat-box"><div class="field" id="f-cat"><label>نوع المصروف <span class="req">*</span></label><input id="cat" list="exp-cats" value="${esc(x?.category || '')}" placeholder="مثلًا: كهربا، إيجار، نقل…">
      <datalist id="exp-cats">${used.map(c => `<option value="${esc(c)}">`).join('')}</datalist>
      <div class="ex-chips">${EXP_CATS.slice(0, 8).map(c => `<button type="button" onclick="$('#cat').value='${c}';$('#f-cat').classList.remove('err')">${c}</button>`).join('')}</div></div></div>
    <div class="field" id="f-amount"><label>المبلغ <span class="req">*</span></label><input id="amount" class="amount-input" inputmode="decimal" placeholder="0" value="${x ? x.amount : ''}"></div>
    <div class="field"><label>ملاحظات</label><textarea id="notes" rows="2">${esc(x?.notes || '')}</textarea></div>
    ${pagesField('exp', 'صورة الإيصال', false, '(اختياري)')}
    <div class="hint" style="margin:-4px 0 12px">دفعات الموردين وأقساط القروض وصرف الموظفين بيتسجلوا هنا لوحدهم — متسجلهمش تاني.</div>
    ${x ? `<button type="button" class="btn danger block" style="margin-bottom:12px" onclick="expDelete(${x.id})">${I.trash}مسح المصروف ده</button>` : ''}
  `, async () => {
    const branch = $('#ebr .on')?.dataset.v, d = $('#edate').value, cat = $('#cat').value.trim(), amount = readAmount($('#amount').value);
    if(!branch) return toast('اختار الفرع', true);
    if(!d) return toast('اكتب اليوم', true);
    if(!x && $('#efor .on')?.dataset.v === 'emp'){
      // مصروف لموظف = حركة في حساب الموظف — بتظهر في المصروفات لوحدها (مش بتتسجل مرتين)
      const eid = $('#emp').value, kind = $('#ekind .on')?.dataset.v || 'payment';
      if(!eid) return markErr('emp', 'اختار الموظف');
      if(!(amount > 0)) return markErr('amount', 'اكتب المبلغ');
      await q(ldb.from('emp_transactions').insert({employee_id:+eid, kind, amount, method:$('#emeth .on')?.dataset.v === 'transfer' ? 'transfer' : 'cash', tx_date:d, branch:branch === 'مشترك' ? null : branch, notes:$('#notes').value.trim() || null}));
      localStorage.setItem('mawredin_exp_branch', branch); expMonth = d.slice(0, 7); expOpen?.add(expMonth);
      busy(false); toast(`اتسجل في حساب ${$('#emp').selectedOptions[0].textContent} وفي المصروفات ✓`); location.replace('#/expenses'); return;
    }
    if(!cat) return markErr('cat', 'اكتب نوع المصروف');
    if(!(amount > 0)) return markErr('amount', 'اكتب المبلغ');
    if(Object.values(EXP_AUTO).includes(cat)) return markErr('cat', 'ده بيتسجل تلقائي — اختار نوع تاني');
    const paths = await pgSave('exp', 'expenses');
    const row = {exp_date:d, branch, category:cat, amount, notes:$('#notes').value.trim() || null, image_path:paths[0] || null, extra_images:paths.slice(1)};
    localStorage.setItem('mawredin_exp_branch', branch);
    expMonth = d.slice(0, 7); expOpen?.add(expMonth);
    if(x){ await q(ldb.from('expenses').update(row).eq('id', x.id)); busy(false); toast('اتحفظ ✓'); history.back(); }
    else { await q(ldb.from('expenses').insert(row)); busy(false); toast(savedMsg('المصروف')); location.replace('#/expenses'); }
  });
  pgInit('exp', x ? rowPages(x) : []);
  if(x) return;
  const H = {exp:'إيجار، كهربا، نقل، … أي مصروف للمحل.', emp:'بيتسجل في حساب الموظف (بيقلل رصيده) وبيظهر في المصروفات لوحده.',
    sup:'دفعة المورد بتتسجل من فورم الدفعة (عشان تنزل من حسابه) — وبتظهر في المصروفات لوحدها.', loan:'القسط بيتسجل من صفحة القرض — وبيظهر في المصروفات لوحده.'};
  const setFor = v => {
    document.querySelectorAll('#efor button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
    $('#efor-h').textContent = H[v];
    $('#emp-box').style.display = v === 'emp' ? '' : 'none';
    $('#cat-box').style.display = v === 'emp' ? 'none' : '';
    $('#f-exp') && ($('#f-exp').style.display = v === 'emp' ? 'none' : '');
    if(v === 'sup') return go('/payment');
    if(v === 'loan') return go('/loans');
  };
  document.querySelectorAll('#efor button').forEach(b => b.onclick = () => setFor(b.dataset.v));
  document.querySelectorAll('#ekind button, #emeth button').forEach(b => b.onclick = () => b.parentNode.querySelectorAll('button').forEach(y => y.classList.toggle('on', y === b)));
  const showBal = () => { const o = $('#emp')?.selectedOptions[0], bal = o ? +o.dataset.bal : NaN;
    $('#emp-bal').innerHTML = o?.value ? (bal > 0 ? `ليه عند المحل ${smoney(C(bal))} <button type="button" class="link" onclick="$('#amount').value='${bal}'">ادفعهم كلهم</button>` : bal < 0 ? `عليه للمحل ${smoney(C(-bal))}` : 'رصيده صفر') : ''; };
  $('#emp').onchange = () => { showBal(); $('#f-emp').classList.remove('err'); };
  setFor(presetEmp ? 'emp' : 'exp'); showBal();
}
window.expDelete = id => {
  const x = store.eff.expenses.get(id);
  openModal(`<h3>مسح المصروف؟</h3><div class="kv"><span>${esc(x.category)} · ${esc(x.branch)}</span><b>${smoney(C(x.amount))}</b></div><div class="kv"><span>اليوم</span><span>${fmtDate(x.exp_date)}</span></div>
    <div class="actions" style="margin-top:12px"><button class="btn danger" id="xd-ok">تأكيد المسح</button><button class="btn ghost" onclick="closeModal()">إلغاء</button></div>`);
  $('#xd-ok').onclick = async () => { busy(true); try{ await q(ldb.from('expenses').delete().eq('id', id)); closeModal(); toast('اتمسح'); location.replace('#/expenses'); }catch(e){ toast(errMsg(e), true); } finally{ busy(false); } };
};
