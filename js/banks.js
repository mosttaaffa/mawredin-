/* =================== البنك — حساب بنك واحد ===================
   الرصيد بيتحسب من مكانه (مبيتنسخش — أي تعديل أو مسح في الأصل بيظهر هنا على طول):
     + تحويلات المبيع اليومي (daily_sales.transfer) بتاريخ اليوم
     − دفعات الموردين بالتحويل بتاريخ الدفعة
     − سداد الشيكات من البنك (تحويل / InstaPay / خصم من البنك) بتاريخه، ولو البنك صرف الشيك كله الباقي بميعاد الشيك
     − أقساط القروض + الغرامة (إلا لو اتسجلت «كاش»)
     − صرف وسلف الموظفين اللي اتسجلت «تحويل»
     ± الحركات اليدوية (bank_moves): رصيد أول المدة، إيداع من الخزينة، سحب للخزينة، مصاريف بنكية، إضافة/خصم تاني
   لو فيه «رصيد أول المدة»: الحساب بيبدأ من تاريخه (اللي قبله مبيتحسبش). الإيداع والسحب مش مصروف ولا دخل.
   كل الحسابات بالقروش. */

const BANK_KIND = {opening:'رصيد أول المدة', deposit:'إيداع من الخزينة', withdraw:'سحب للخزينة', fee:'مصاريف بنكية', in:'إضافة تانية', out:'خصم تاني'};
const BANK_SIGN = {opening:1, deposit:1, withdraw:-1, fee:-1, in:1, out:-1};
const BANK_CHK_METHODS = ['transfer', 'instapay', 'bank_debit'];
const BC = v => Math.round(Number(v || 0) * 100);
let bankOpen = null;

function bankStart(){
  let s = '';
  for(const m of (store.eff?.bank_moves?.values() || [])) if(m.kind === 'opening'){ const d = String(m.move_date).slice(0, 10); if(d > s) s = d; }
  return s;
}
function bankItems(){
  const E = store.eff || {}, out = [], d10 = v => String(v || '').slice(0, 10), sup = id => E.suppliers?.get(id)?.name || '';
  for(const m of (E.bank_moves?.values() || []))
    out.push({d:d10(m.move_date), amt:BANK_SIGN[m.kind] * BC(m.amount), src:'move', kind:m.kind, t:BANK_KIND[m.kind] || '', sub:m.notes || '', pend:m._pending, go:`/bank-move/${m.id}`, c:m.created_at});
  for(const s of (E.daily_sales?.values() || [])) if(BC(s.transfer) > 0)
    out.push({d:d10(s.sale_date), amt:BC(s.transfer), src:'sale', t:`تحويلات مبيع ${s.branch}`, sub:s.transfer_note || '', pend:s._pending, go:`/sale/${s.id}`, c:s.created_at});
  for(const p of (E.payments?.values() || [])){
    if(p.method === 'transfer') out.push({d:d10(p.pay_date), amt:-BC(p.amount), src:'sup', t:`دفعة تحويل — ${sup(p.supplier_id)}`, sub:p.notes || '', pend:p._pending, go:`/pay/${p.id}`, c:p.created_at});
    else if(p.method === 'check'){
      const i = checkInfo(p);
      for(const c of i.live) if(BANK_CHK_METHODS.includes(c.method))
        out.push({d:d10(c.pay_date), amt:-BC(c.amount), src:'chk', t:`سداد شيك ${p.check_no || ''} — ${sup(p.supplier_id)}`, sub:CP_METHOD[c.method] || '', pend:c._pending, go:`/pay/${p.id}`, c:c.created_at});
      if(p.check_status === 'cleared' && i.paidRows < i.orig)
        out.push({d:d10(p.due_date || p.pay_date), amt:-(i.orig - i.paidRows), src:'chk', t:`صرف شيك ${p.check_no || ''} — ${sup(p.supplier_id)}`, sub:'اتصرف من البنك', pend:p._pending, go:`/pay/${p.id}`, c:p.created_at});
    }
  }
  for(const lp of (E.loan_payments?.values() || [])){
    if(lp.method === 'cash') continue;
    const L = E.loans?.get(lp.loan_id), pen = BC(lp.penalty);
    out.push({d:d10(lp.pay_date), amt:-(BC(lp.amount) + pen), src:'loan', t:`قسط ${L?.bank || 'قرض'}`, sub:pen ? `منها غرامة ${(pen / 100).toLocaleString('en-US')}` : '', pend:lp._pending, go:`/loan/${lp.loan_id}`, c:lp.created_at});
  }
  for(const x of (E.emp_transactions?.values() || [])){
    if((x.kind !== 'payment' && x.kind !== 'advance') || x.method !== 'transfer') continue;
    out.push({d:d10(x.tx_date), amt:-Math.abs(BC(x.amount)), src:'emp', t:`${x.kind === 'advance' ? 'سلفة' : 'صرف'} تحويل — ${E.employees?.get(x.employee_id)?.name || ''}`, sub:x.notes || '', pend:x._pending, go:`/emp/${x.employee_id}`, c:x.created_at});
  }
  const start = bankStart();
  return out.filter(x => x.d && x.amt && (!start || x.d >= start))
    // نفس اليوم: رصيد أول المدة الأول، وبعدين بترتيب التسجيل
    .sort((a, b) => a.d === b.d ? ((b.kind === 'opening') - (a.kind === 'opening') || String(a.c || '').localeCompare(String(b.c || ''))) : (a.d < b.d ? -1 : 1));
}
function bankSummary(){
  const items = bankItems(), mk = today().slice(0, 7);
  let bal = 0, inM = 0, outM = 0;
  for(const x of items){ bal += x.amt; if(x.d.startsWith(mk) && x.kind !== 'opening'){ if(x.amt > 0) inM += x.amt; else outM -= x.amt; } }
  return {bal, inM, outM, n:items.length, start:bankStart()};
}

async function viewBanks(){
  const items = bankItems(), S = bankSummary(), t = today();
  const months = {}; let run = 0;
  for(const x of items){ run += x.amt; x.run = run; const M = months[x.d.slice(0, 7)] ||= {key:x.d.slice(0, 7), items:[], inn:0, out:0, end:0};
    M.items.push(x); if(x.kind !== 'opening'){ if(x.amt > 0) M.inn += x.amt; else M.out -= x.amt; } M.end = run; }
  const keys = Object.keys(months).sort().reverse();
  if(!bankOpen) bankOpen = new Set([keys[0] || t.slice(0, 7)]);
  const m = c => `<span class="num">${(Math.abs(c) / 100).toLocaleString('en-US', {maximumFractionDigits:0})}</span> ج`;
  const sm = c => c < 0 ? `(${m(c)})` : m(c);
  const ic = {move:'bank', sale:'store', sup:'box', chk:'check', loan:'loan', emp:'users'};
  const row = x => `<div class="item bk-it" onclick="go('${x.go}')">
      <div class="avatar bk-av ${x.amt > 0 ? 'in' : 'out'}">${I[x.src === 'move' ? (x.amt > 0 ? 'down' : 'up') : ic[x.src]]}</div>
      <div class="grow"><div class="t">${esc(x.t)}${x.pend ? ' <i class="tag pend-sync">على الجهاز</i>' : ''}</div><div class="s">${fmtDate(x.d)}${x.sub ? ' · ' + esc(x.sub) : ''}</div></div>
      <div class="bk-v"><b class="${x.kind === 'opening' ? '' : x.amt > 0 ? 'ok' : 'debt'}"><span dir="ltr">${x.kind === 'opening' ? '' : x.amt > 0 ? '+' : '−'}${(Math.abs(x.amt) / 100).toLocaleString('en-US', {maximumFractionDigits:0})}</span> ج</b><small>الرصيد ${sm(x.run)}</small></div>
    </div>`;
  const month = k => { const M = months[k], open = bankOpen.has(k);
    return `<section class="card cm ${open ? 'open' : ''}">
      <button class="cm-h" onclick="bankToggle('${k}')" aria-expanded="${open}"><span class="cm-hi">${I.cal}</span>
        <span class="cm-ht"><b>${csMonthName(k)}</b><small>(${M.items.length} حركة)</small></span>
        <span class="cm-htot"><small>الرصيد آخر الشهر</small><b>${sm(M.end)}</b></span><span class="cm-chev">${I.chevL}</span></button>
      ${open ? `<div class="list bk-list">${M.items.slice().reverse().map(row).join('')}</div>` : ''}
      <div class="cm-sum ${open ? 'dark' : ''}"><span class="cm-sl">${I.bank}${csMonthName(k)}</span><span class="cm-sv"><small>داخل</small><b>${m(M.inn)}</b></span><span class="cm-sv"><small>خارج</small><b>${m(M.out)}</b></span></div>
    </section>`; };
  shell({title:'البنك', nav:'more', page:{sub:'رصيد البنك: تحويلات المبيع داخلة، والدفعات بالتحويل خارجة', icon:'bank', help:'bankHelp()'}, body:`
    <div class="sp-sum bk-sum">
      <div class="sp-t hl"><i>${I.bank}</i><span>رصيد البنك</span><b>${sm(S.bal)}</b></div>
      <div class="sp-t"><i>${I.down}</i><span>داخل الشهر</span><b class="pay">${m(S.inM)}</b></div>
      <div class="sp-t"><i>${I.up}</i><span>خارج الشهر</span><b class="due">${m(S.outM)}</b></div>
    </div>
    ${S.start ? `<div class="sp-note">${I.cal}الحساب بادئ من رصيد أول المدة يوم ${fmtDate(S.start)}</div>`
      : `<button class="sp-note" onclick="go('/bank-move?k=opening')">${I.warn}<span>سجّل «رصيد أول المدة» (الرصيد اللي في البنك فعلًا يوم ما تبدأ) عشان الرصيد يطلع مظبوط</span></button>`}
    <div class="emp-adds">
      <button class="btn primary block add-sup" onclick="go('/bank-move')">${I.plus}حركة على البنك</button>
      <button class="btn ghost block add-sup" onclick="go('/bank-move?k=deposit')">${I.down}إيداع من الخزينة</button>
    </div>
    ${keys.length ? keys.map(month).join('') : `<div class="card empty">${I.bank}<div>لسه مفيش حركات على البنك</div></div>`}
  `});
}
window.bankToggle = k => { bankOpen.has(k) ? bankOpen.delete(k) : bankOpen.add(k); viewBanks(); };
window.bankHelp = () => openModal(`<h3>البنك بيتحسب إزاي؟</h3>
  <div class="hint" style="line-height:1.9">
    <div><b class="cred">داخل:</b> تحويلات المبيع اللي بتسجلها في الخزينة، والإيداع من الخزينة.</div>
    <div><b class="due">خارج:</b> دفعات الموردين «تحويل»، سداد الشيكات من البنك، أقساط القروض (إلا لو اخترت «كاش»)، وصرف/سلف الموظفين «تحويل»، والسحب للخزينة، والمصاريف البنكية.</div>
    <div style="margin-top:8px">كل حركة بتتعدل أو تتمسح من مكانها، والرصيد هنا بيتحدث لوحده — مفيش حاجة بتتسجل مرتين.</div>
    <div>الإيداع والسحب بين الخزينة والبنك مش مصروف ولا دخل. المصاريف البنكية بتظهر في المصروفات.</div></div>`);

/* ---------- فورم حركة البنك ---------- */
function formBankMove(id){
  const x = id ? store.eff.bank_moves?.get(id) : null;
  if(id && !x) return go('/banks');
  const qp = new URLSearchParams(location.hash.split('?')[1] || '');
  let kind = x?.kind || qp.get('k') || 'deposit';
  const H = {opening:'الرصيد اللي في البنك فعلًا في اليوم ده. الحساب بيبدأ منه (الحركات اللي قبله مبتتحسبش).', deposit:'كاش من الخزينة اتحط في البنك — مش دخل.',
    withdraw:'فلوس اتسحبت من البنك للخزينة — مش مصروف.', fee:'عمولات ومصاريف البنك — بتظهر في المصروفات كمان.', in:'أي فلوس دخلت البنك غير المبيع (فايدة، تحويل من حد…).', out:'أي خصم تاني من البنك.'};
  formShell(x ? 'تعديل حركة بنك' : 'حركة على البنك', `
    <div class="field" id="f-kind"><label>نوع الحركة</label><div class="seg" id="bkind" style="grid-template-columns:repeat(3,1fr)">
      ${Object.entries(BANK_KIND).map(([k, l]) => `<button type="button" data-v="${k}">${l}</button>`).join('')}</div><div class="hint" id="bk-h"></div></div>
    <div class="field" id="f-amount"><label>المبلغ <span class="req">*</span></label><input id="amount" class="amount-input" inputmode="numeric" placeholder="0" value="${x ? x.amount : ''}"></div>
    <div class="field"><label>اليوم</label><input id="bdate" type="date" value="${x?.move_date || qp.get('d') || today()}"></div>
    <div class="field"><label>ملاحظات</label><textarea id="notes" rows="2">${esc(x?.notes || '')}</textarea></div>
    ${x ? `<button type="button" class="btn danger block" style="margin-bottom:12px" onclick="bankMoveDelete(${x.id})">${I.trash}مسح الحركة دي</button>` : ''}
  `, async () => {
    const amount = readAmount($('#amount').value), d = $('#bdate').value;
    if(!BANK_KIND[kind]) return markErr('kind', 'اختار نوع الحركة');
    if(!(amount > 0)) return markErr('amount', 'اكتب المبلغ');
    if(!d) return toast('اكتب اليوم', true);
    const row = {move_date:d, kind, amount, notes:$('#notes').value.trim() || null};
    if(x) await q(ldb.from('bank_moves').update(row).eq('id', x.id)); else await q(ldb.from('bank_moves').insert(row));
    busy(false); toast(x ? 'اتحفظ ✓' : savedMsg(BANK_KIND[kind])); bankOpen?.add(d.slice(0, 7)); location.replace('#/banks');
  });
  const setK = k => { kind = k; document.querySelectorAll('#bkind button').forEach(b => b.classList.toggle('on', b.dataset.v === k)); $('#bk-h').textContent = H[k] || ''; $('#f-kind').classList.remove('err'); };
  document.querySelectorAll('#bkind button').forEach(b => b.onclick = () => setK(b.dataset.v));
  setK(kind);
}
window.bankMoveDelete = id => {
  const x = store.eff.bank_moves.get(id);
  openModal(`<h3>مسح الحركة؟</h3><div class="kv"><span>${BANK_KIND[x.kind]}</span><b>${smoney(BC(x.amount))}</b></div><div class="kv"><span>اليوم</span><span>${fmtDate(x.move_date)}</span></div>
    <div class="actions" style="margin-top:12px"><button class="btn danger" id="bd-ok">تأكيد المسح</button><button class="btn ghost" onclick="closeModal()">إلغاء</button></div>`);
  $('#bd-ok').onclick = async () => { busy(true); try{ await q(ldb.from('bank_moves').delete().eq('id', id)); closeModal(); toast('اتمسحت'); location.replace('#/banks'); }catch(e){ toast(errMsg(e), true); } finally{ busy(false); } };
};
