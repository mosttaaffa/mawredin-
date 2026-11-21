/* =================== القروض ===================
   قرض البنك: إجمالي المبلغ (اللي هيتسدد) + المبلغ اللي اتسلم فعلًا بعد خصم الفايدة + نسبة الفايدة + جدول الأقساط.
   كل سداد: قسط (amount) + غرامة تأخير (penalty) منفصلة.
   في الآخر: إجمالي اللي اتدفع = الأقساط + الغرامات، وتكلفة القرض الفعلية = إجمالي المدفوع − المبلغ المستلم. */

const LC = v => Math.round(Number(v || 0) * 100);             // بالقروش عشان مفيش كسور غلط
const lmoney = c => `<span class="m"><span class="num">${(c / 100).toLocaleString('en-US', {maximumFractionDigits:2})}</span> ج</span>`;
const addMonths = (d, n) => { const [y, m, dd] = String(d).slice(0, 10).split('-').map(Number); const t = new Date(y, m - 1 + n, 1); const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate(); t.setDate(Math.min(dd, last)); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };
const lDays = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);

function loanPays(id){ return [...(store.eff.loan_payments?.values() || [])].filter(p => p.loan_id === id).sort((a, b) => String(a.pay_date).localeCompare(String(b.pay_date)) || a.id - b.id); }
// كل أرقام القرض من مكان واحد
function loanInfo(L){
  const pays = loanPays(L.id), t = today();
  const total = LC(L.total_amount), net = LC(L.net_received);
  const paid = pays.reduce((a, p) => a + LC(p.amount), 0), pen = pays.reduce((a, p) => a + LC(p.penalty), 0);
  const remaining = Math.max(0, total - paid), outlay = paid + pen;
  const interest = Math.max(0, total - net);
  // جدول الأقساط: بنوزّع المسدد على الأقساط بالترتيب
  const n = Number(L.installments_count || 0), inst = L.installment_amount ? LC(L.installment_amount) : (n ? Math.round(total / n) : 0);
  const sched = [];
  if(n && L.first_due_date){
    let left = paid;
    for(let i = 0; i < n; i++){
      const due = addMonths(L.first_due_date, i), amt = i === n - 1 ? Math.max(0, total - inst * (n - 1)) : inst;
      const cover = Math.min(amt, left); left -= cover;
      const st = cover >= amt ? 'paid' : cover > 0 ? 'partial' : due < t ? 'late' : due === t ? 'due' : 'next';
      // تاريخ السداد الفعلي للقسط ده (آخر دفعة غطته)
      sched.push({i:i + 1, due, amt, cover, st, late:st === 'late' || st === 'partial' && due < t ? lDays(due, t) : 0});
    }
  }
  const lateInst = sched.filter(s => s.late > 0), next = sched.find(s => s.st !== 'paid');
  const closed = L.status === 'closed' || (total > 0 && remaining === 0);
  return {pays, total, net, paid, pen, remaining, outlay, interest, rate:L.interest_rate, inst, n, sched, lateInst, next, closed,
    cost:outlay + remaining - net, pct:total ? Math.min(100, Math.round(paid / total * 100)) : 0};
}
const LST = {paid:'مسدد', partial:'مسدد جزئيًا', late:'متأخر', due:'مستحق النهارده', next:'لسه'};

/* ---------- القائمة ---------- */
async function viewLoans(){
  const loans = [...(store.eff.loans?.values() || [])].sort((a, b) => (a.status === 'closed') - (b.status === 'closed') || String(b.start_date).localeCompare(String(a.start_date)));
  const infos = loans.map(L => ({L, i:loanInfo(L)}));
  const act = infos.filter(x => !x.i.closed);
  const sum = k => infos.reduce((a, x) => a + x.i[k], 0);
  const lateN = act.reduce((a, x) => a + x.i.lateInst.length, 0);
  shell({title:'القروض', nav:'more', page:{sub:'قروض البنوك والأقساط والغرامات', icon:'loan'}, body:`
    <div class="sp-sum">
      <div class="sp-t hl"><i>${I.coins2}</i><span>المتبقي عليك</span><b>${lmoney(act.reduce((a, x) => a + x.i.remaining, 0))}</b></div>
      <div class="sp-t"><i>${I.doc}</i><span>إجمالي القروض</span><b>${lmoney(sum('total'))}</b></div>
      <div class="sp-t"><i>${I.layers}</i><span>إجمالي المدفوع</span><b class="pay">${lmoney(sum('outlay'))}</b></div>
      <div class="sp-t"><i>${I.warn}</i><span>الغرامات</span><b style="color:var(--red)">${lmoney(sum('pen'))}</b></div>
    </div>
    ${lateN ? `<div class="sp-note" style="background:var(--red-soft);color:var(--red)">${I.warn}فيه ${lateN} قسط متأخر — سددها بسرعة عشان الغرامات</div>` : ''}
    <div class="ln-list">${infos.length ? infos.map(({L, i}) => `
      <button class="ln-card ${i.closed ? 'closed' : ''}" onclick="go('/loan/${L.id}')">
        <span class="ln-top"><span class="sr-ic">${I.bank}</span><span class="ln-name"><b>${esc(L.bank)}</b><small>من ${fmtDate(L.start_date)}${i.n ? ` · ${i.n} قسط` : ''}${L._pending ? ' · على الجهاز' : ''}</small></span>
          <span class="ln-st ${i.closed ? 'ok' : i.lateInst.length ? 'bad' : ''}">${i.closed ? 'اتسدد' : i.lateInst.length ? `${i.lateInst.length} متأخر` : i.next ? 'القسط الجاي ' + fmtDate(i.next.due) : 'جاري'}</span></span>
        <span class="ln-bar"><i style="width:${i.pct}%"></i></span>
        <span class="ln-nums"><span><small>القرض</small><b>${lmoney(i.total)}</b></span><span><small>المدفوع</small><b class="pay">${lmoney(i.outlay)}</b></span><span><small>المتبقي</small><b class="due">${lmoney(i.remaining)}</b></span></span>
      </button>`).join('') : `<div class="card empty">${I.loan}<div>لسه مفيش قروض متسجلة</div></div>`}</div>
    <button class="btn primary block add-sup" onclick="go('/loan-form')">${I.plus}إضافة قرض</button>`});
}

/* ---------- تفاصيل القرض ---------- */
async function viewLoan(id){
  const L = store.eff.loans?.get(id);
  if(!L){ shell({title:'القرض', back:true, body:`<div class="card empty">${I.loan}<div>القرض ده مش موجود</div></div>`}); return; }
  const i = loanInfo(L), rate = Number(L.interest_rate || 0);
  shell({title:'تفاصيل القرض', back:true, right:`<button class="iconbtn" onclick="go('/loan-form/${L.id}')" aria-label="تعديل">${I.edit}</button>`, body:`
    <div class="dt">
    <div class="dt-hero">
      <span class="dt-st ${i.closed ? 'ok' : i.lateInst.length ? 'bad' : 'warn'}">${i.closed ? I.okc + 'القرض اتسدد' : i.lateInst.length ? I.warn + i.lateInst.length + ' قسط متأخر' : I.clock + 'جاري السداد'}</span>
      <span class="dt-l">${esc(L.bank)} — ${i.closed ? 'إجمالي اللي دفعته' : 'المتبقي عليك'}</span>
      <span class="dt-amt"><span class="num">${((i.closed ? i.outlay : i.remaining) / 100).toLocaleString('en-US', {maximumFractionDigits:2})}</span> ج.م</span>
      <span class="dt-d">${I.cal}من ${fmtDate(L.start_date)} · اتسدد ${i.pct}%</span>
      <span class="dt-art single"><i class="a1">${I.bank}</i></span>
    </div>
    <div class="card ln-sum">
      <div class="ln-g"><span>إجمالي مبلغ القرض</span><b>${lmoney(i.total)}</b></div>
      <div class="ln-g"><span>اللي استلمته بعد الفايدة</span><b>${lmoney(i.net)}</b></div>
      <div class="ln-g"><span>الفايدة${rate ? ` (${rate}%)` : ''}</span><b class="due">${lmoney(i.interest)}</b></div>
      <div class="ln-g"><span>القسط${i.n ? ` (${i.n} قسط)` : ''}</span><b>${i.inst ? lmoney(i.inst) : '—'}</b></div>
      <div class="ln-g"><span>المسدد من الأقساط</span><b class="pay">${lmoney(i.paid)}</b></div>
      <div class="ln-g"><span>غرامات التأخير</span><b class="due">${lmoney(i.pen)}</b></div>
    </div>
    <div class="card ln-final">
      <div class="lf-r big"><span>إجمالي اللي دفعته لحد دلوقتي</span><b>${lmoney(i.outlay)}</b></div>
      <div class="lf-r"><span>أقساط + غرامات</span><span>${lmoney(i.paid)} + ${lmoney(i.pen)}</span></div>
      ${!i.closed ? `<div class="lf-r"><span>لو سددت الباقي (${lmoney(i.remaining)}) هتكون دفعت</span><b>${lmoney(i.outlay + i.remaining)}</b></div>` : ''}
      <div class="lf-r"><span>تكلفة القرض عليك (الفايدة + الغرامات)</span><b class="due">${lmoney(i.cost)}</b></div>
      <div class="hint">التكلفة = كل اللي هتدفعه − المبلغ اللي استلمته (${lmoney(i.net)})</div>
    </div>
    ${i.sched.length ? `<div class="card"><div class="section-t">جدول الأقساط</div><div class="ln-sched">${i.sched.map(s => `
      <div class="ls-r ${s.st}"><span class="ls-n">${s.i}</span><span class="ls-d"><b>${fmtDate(s.due)}</b><small>${LST[s.st]}${s.late ? ` · ${s.late} يوم تأخير` : ''}${s.st === 'partial' ? ` · اتسدد ${lmoney(s.cover)}` : ''}</small></span><span class="ls-a">${lmoney(s.amt)}</span></div>`).join('')}</div></div>` : ''}
    <div class="card"><div class="section-t">المدفوعات (${i.pays.length})</div>
      ${i.pays.length ? `<div class="list">${i.pays.slice().reverse().map(p => `<div class="item" onclick="go('/loan-pay/${L.id}/${p.id}')">
        <div class="ico pay">${I.coins2}</div>
        <div class="grow"><div class="t">${fmtDate(p.pay_date)}${p.due_date ? ` · قسط ${fmtDate(p.due_date)}` : ''}${p._pending ? ' <span class="tag pend-sync">على الجهاز</span>' : ''}</div>
          <div class="s">${LC(p.penalty) ? `غرامة ${lmoney(LC(p.penalty))} · ` : ''}${p.due_date && p.pay_date > p.due_date ? `متأخر ${lDays(p.due_date, p.pay_date)} يوم · ` : ''}${esc(p.notes || '')} ${esc(who(p.created_by))}</div></div>
        <div class="amt ok">${lmoney(LC(p.amount) + LC(p.penalty))}</div></div>`).join('')}</div>` : '<div class="hint">لسه مفيش مدفوعات</div>'}</div>
    ${L.notes || L.account_no ? `<div class="card">${L.account_no ? `<div class="kv"><span>رقم الحساب / العقد</span><span class="num">${esc(L.account_no)}</span></div>` : ''}${L.notes ? `<div class="kv"><span>ملاحظات</span><span>${esc(L.notes)}</span></div>` : ''}</div>` : ''}
    </div>`});
  $('#app').insertAdjacentHTML('beforeend', `<div class="dt-acts">${i.closed ? `<button class="btn ghost" onclick="loanReopen(${L.id})">رجّعه «جاري»</button>` : `<button class="btn primary" onclick="go('/loan-pay/${L.id}')">${I.plus}تسجيل قسط</button>`}
    <button class="btn danger dt-del" onclick="loanDelete(${L.id})">${I.trash}حذف القرض</button></div>`);
}
window.loanReopen = async id => { await q(ldb.from('loans').update({status:'active'}).eq('id', id)); viewLoan(id); };
window.loanDelete = id => {
  const L = store.eff.loans.get(id), n = loanPays(id).length;
  if(n) return openModal(`<h3>مينفعش حذف القرض</h3><div class="hint">عليه ${n} دفعة متسجلة. امسح الدفعات الأول لو القرض اتسجل بالغلط.</div><button class="btn ghost block" style="margin-top:12px" onclick="closeModal()">تمام</button>`);
  openModal(`<h3>حذف القرض؟</h3><div class="kv"><span>البنك</span><b>${esc(L.bank)}</b></div><div class="kv"><span>المبلغ</span><b>${money(L.total_amount)}</b></div>
    <div class="actions" style="margin-top:12px"><button class="btn danger" id="ld-ok">تأكيد الحذف</button><button class="btn ghost" onclick="closeModal()">إلغاء</button></div>`);
  $('#ld-ok').onclick = async () => { busy(true); try{ await q(ldb.from('loans').delete().eq('id', id)); closeModal(); toast('اتحذف القرض'); location.replace('#/loans'); }catch(e){ toast(errMsg(e), true); } finally{ busy(false); } };
};

/* ---------- فورم القرض ---------- */
async function formLoan(id){
  const x = id ? store.eff.loans.get(id) : null;
  formShell(x ? 'تعديل القرض' : 'قرض جديد', `
    <div class="field" id="f-bank"><label>اسم البنك <span class="req">*</span></label><input id="bank" value="${esc(x?.bank || '')}" placeholder="مثلًا: بنك مصر"></div>
    <div class="field" id="f-total"><label>إجمالي مبلغ القرض <span class="req">*</span></label>
      <input id="total" class="amount-input" inputmode="decimal" placeholder="0" value="${x ? x.total_amount : ''}"><div class="hint">المبلغ اللي هتسدده للبنك على الأقساط</div></div>
    <div class="field" id="f-net"><label>المبلغ اللي استلمته بعد خصم الفايدة <span class="req">*</span></label>
      <input id="net" class="amount-input" inputmode="decimal" placeholder="0" value="${x ? x.net_received : ''}"></div>
    <div class="row2">
      <div class="field" id="f-rate"><label>نسبة الفايدة %</label><input id="rate" inputmode="decimal" placeholder="مثلًا 18" value="${x?.interest_rate ?? ''}"></div>
      <div class="field"><label>قيمة الفايدة</label><div class="ln-calc" id="intv">—</div></div>
    </div>
    <div class="row2">
      <div class="field"><label>تاريخ القرض</label><input id="start" type="date" value="${x?.start_date || today()}"></div>
      <div class="field" id="f-first"><label>ميعاد أول قسط</label><input id="first" type="date" value="${x?.first_due_date || ''}"></div>
    </div>
    <div class="row2">
      <div class="field" id="f-count"><label>عدد الأقساط (شهري)</label><input id="count" inputmode="numeric" placeholder="مثلًا 12" value="${x?.installments_count ?? ''}"></div>
      <div class="field" id="f-inst"><label>قيمة القسط</label><input id="inst" inputmode="decimal" placeholder="بيتحسب لوحده" value="${x?.installment_amount ?? ''}"></div>
    </div>
    <div class="field"><label>رقم الحساب / العقد</label><input id="acc" dir="ltr" value="${esc(x?.account_no || '')}"></div>
    <div class="field"><label>ملاحظات</label><textarea id="notes" rows="2">${esc(x?.notes || '')}</textarea></div>
  `, async () => {
    const bank = $('#bank').value.trim(), total = readAmount($('#total').value), net = readAmount($('#net').value);
    if(!bank) return markErr('bank', 'اكتب اسم البنك');
    if(!(total > 0)) return markErr('total', 'اكتب إجمالي مبلغ القرض');
    if(!(net >= 0) || $('#net').value.trim() === '') return markErr('net', 'اكتب المبلغ اللي استلمته');
    if(net > total) return markErr('net', 'المستلم أكبر من إجمالي القرض؟ راجع الأرقام');
    const count = $('#count').value.trim() ? parseInt($('#count').value) : null, inst = $('#inst').value.trim() ? readAmount($('#inst').value) : null;
    if(count != null && !(count > 0)) return markErr('count', 'عدد الأقساط غلط');
    if(count && !$('#first').value) return markErr('first', 'اختار ميعاد أول قسط');
    const row = {bank, total_amount:total, net_received:net, interest_rate:$('#rate').value.trim() ? readAmount($('#rate').value) : null,
      start_date:$('#start').value || today(), first_due_date:$('#first').value || null, installments_count:count,
      installment_amount:inst || (count ? Math.round(total / count * 100) / 100 : null), account_no:$('#acc').value.trim() || null, notes:$('#notes').value.trim() || null};
    if(x){ await q(ldb.from('loans').update(row).eq('id', x.id)); busy(false); toast('اتحفظ ✓'); history.back(); }
    else { await q(ldb.from('loans').insert(row)); busy(false); toast('اتسجل القرض ✓'); location.replace('#/loans'); }
  });
  const calc = () => {
    const t = readAmount($('#total').value) || 0, n = readAmount($('#net').value) || 0, c = parseInt($('#count').value) || 0;
    $('#intv').innerHTML = t && n ? lmoney(LC(t - n)) + (n ? ` <small>(${((t - n) / n * 100).toFixed(1)}% من المستلم)</small>` : '') : '—';
    if(c && t && !$('#inst').dataset.touched) $('#inst').placeholder = (Math.round(t / c * 100) / 100).toLocaleString('en-US');
  };
  ['total', 'net', 'count'].forEach(k => $('#' + k).addEventListener('input', calc));
  $('#inst').addEventListener('input', () => $('#inst').dataset.touched = 1);
  calc();
}

/* ---------- فورم القسط ---------- */
async function formLoanPay(lid, pid){
  const L = store.eff.loans.get(lid); if(!L) return go('/loans');
  const x = pid ? store.eff.loan_payments.get(pid) : null, i = loanInfo(L);
  const nx = i.next;
  formShell(x ? 'تعديل قسط' : 'تسجيل قسط — ' + L.bank, `
    <div class="note-line" style="margin-bottom:10px">المتبقي من القرض ${lmoney(i.remaining + (x ? LC(x.amount) : 0))}${nx && !x ? ` · القسط الجاي ${fmtDate(nx.due)} (${lmoney(nx.amt - nx.cover)})` : ''}</div>
    <div class="field" id="f-amount"><label>المبلغ المدفوع من القسط</label><input id="amount" class="amount-input" inputmode="decimal" placeholder="0" value="${x ? x.amount : nx ? (nx.amt - nx.cover) / 100 : ''}"></div>
    <div class="row2">
      <div class="field"><label>تاريخ الدفع</label><input id="pdate" type="date" value="${x?.pay_date || today()}"></div>
      <div class="field"><label>عن قسط ميعاده</label><input id="ddate" type="date" value="${x?.due_date || nx?.due || ''}"></div>
    </div>
    <div id="latebox"></div>
    <div class="field" id="f-penalty"><label>غرامة التأخير</label><input id="penalty" class="amount-input" inputmode="decimal" placeholder="0" value="${x ? (Number(x.penalty) || '') : ''}"><div class="hint">لو البنك حسب عليك غرامة لأنك دفعت متأخر</div></div>
    <div class="field"><label>ملاحظات</label><textarea id="notes" rows="2">${esc(x?.notes || '')}</textarea></div>
    ${x ? `<button type="button" class="btn danger block" style="margin-bottom:12px" onclick="loanPayDelete(${lid},${x.id})">${I.trash}مسح الدفعة دي</button>` : ''}
  `, async () => {
    const a = $('#amount').value.trim() ? readAmount($('#amount').value) : 0, pen = $('#penalty').value.trim() ? readAmount($('#penalty').value) : 0;
    if(!(a >= 0) || !(pen >= 0)) return markErr('amount', 'المبلغ غلط');
    if(!(a > 0) && !(pen > 0)) return markErr('amount', 'اكتب المبلغ أو الغرامة');
    const maxC = i.remaining + (x ? LC(x.amount) : 0);
    if(LC(a) > maxC) return markErr('amount', `أكبر من المتبقي من القرض (${(maxC / 100).toLocaleString('en-US')} ج)`);
    const row = {loan_id:lid, amount:a, penalty:pen, pay_date:$('#pdate').value || today(), due_date:$('#ddate').value || null, notes:$('#notes').value.trim() || null};
    if(x) await q(ldb.from('loan_payments').update(row).eq('id', x.id)); else await q(ldb.from('loan_payments').insert(row));
    // آخر قسط: القرض يتقفل لوحده
    const after = loanInfo(store.eff.loans.get(lid));
    if(after.remaining === 0 && L.status !== 'closed') await q(ldb.from('loans').update({status:'closed'}).eq('id', lid));
    if(after.remaining > 0 && L.status === 'closed') await q(ldb.from('loans').update({status:'active'}).eq('id', lid));
    busy(false); toast(after.remaining === 0 ? `القرض اتسدد بالكامل ✓ — دفعت إجمالي ${(after.outlay / 100).toLocaleString('en-US')} ج` : 'اتسجل ✓');
    location.replace('#/loan/' + lid);
  });
  const late = () => { const p = $('#pdate').value, d = $('#ddate').value, el = $('#latebox'); if(!el) return;
    const n = p && d ? lDays(d, p) : 0;
    el.innerHTML = n > 0 ? `<div class="note-line" style="background:var(--red-soft);color:var(--red);margin-bottom:10px">${I.warn} الدفع متأخر ${n} يوم عن ميعاد القسط — سجّل الغرامة لو البنك حسبها</div>` : ''; };
  ['pdate', 'ddate'].forEach(k => $('#' + k).addEventListener('change', late)); late();
}
window.loanPayDelete = (lid, pid) => {
  const p = store.eff.loan_payments.get(pid);
  openModal(`<h3>مسح الدفعة؟</h3><div class="kv"><span>التاريخ</span><span>${fmtDate(p.pay_date)}</span></div><div class="kv"><span>القسط + الغرامة</span><b>${lmoney(LC(p.amount) + LC(p.penalty))}</b></div>
    <div class="actions" style="margin-top:12px"><button class="btn danger" id="lp-ok">تأكيد المسح</button><button class="btn ghost" onclick="closeModal()">إلغاء</button></div>`);
  $('#lp-ok').onclick = async () => { busy(true); try{ await q(ldb.from('loan_payments').delete().eq('id', pid));
    const L = store.eff.loans.get(lid); if(L.status === 'closed' && loanInfo(L).remaining > 0) await q(ldb.from('loans').update({status:'active'}).eq('id', lid));
    closeModal(); toast('اتمسحت'); location.replace('#/loan/' + lid); }catch(e){ toast(errMsg(e), true); } finally{ busy(false); } };
};
// ملخص للرئيسية
function loansSummary(){
  const ls = [...(store.eff?.loans?.values() || [])].map(L => loanInfo(L)).filter(i => !i.closed);
  return {n:ls.length, remaining:ls.reduce((a, i) => a + i.remaining, 0), late:ls.reduce((a, i) => a + i.lateInst.length, 0)};
}
