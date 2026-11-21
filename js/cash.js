/* =================== الخزينة — المبيع اليومي ===================
   كل سجل = يوم + فرع (ورد / زهرة) + كاش + تحويلات. الإجمالي = الكاش + التحويلات.
   سجل واحد لكل فرع في اليوم (لو موجود بنفتحه للتعديل بدل ما نكرره). */

const BRANCHES = ['ورد', 'زهرة'];
const SC = v => Math.round(Number(v || 0) * 100);
const smoney = c => `<span class="m"><span class="num">${(c / 100).toLocaleString('en-US', {maximumFractionDigits:2})}</span> ج</span>`;
const CS_MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const CS_DAYS = ['الأحد','الاتنين','التلات','الأربع','الخميس','الجمعة','السبت'];
let cashBranch = localStorage.getItem('mawredin_cash_branch') || 'all';
let cashMonth = null; // 'YYYY-MM'

function salesAll(){ return [...(store.eff?.daily_sales?.values() || [])]; }
const saleTotal = s => SC(s.cash) + SC(s.transfer);
function salesSum(list){
  const r = {cash:0, transfer:0, total:0, days:new Set(), by:{}};
  BRANCHES.forEach(b => r.by[b] = 0);
  list.forEach(s => { r.cash += SC(s.cash); r.transfer += SC(s.transfer); r.total += saleTotal(s); r.days.add(String(s.sale_date).slice(0, 10)); r.by[s.branch] = (r.by[s.branch] || 0) + saleTotal(s); });
  return r;
}
// ملخص للرئيسية: مبيع النهارده والشهر
function cashSummary(){
  const all = salesAll(), t = today(), mo = t.slice(0, 7);
  return {today:salesSum(all.filter(s => String(s.sale_date).slice(0, 10) === t)), month:salesSum(all.filter(s => String(s.sale_date).startsWith(mo))), n:all.length};
}

async function viewCash(){
  const t = today();
  cashMonth = cashMonth || t.slice(0, 7);
  const [Y, M] = cashMonth.split('-').map(Number);
  const all = salesAll();
  const inBr = s => cashBranch === 'all' || s.branch === cashBranch;
  const month = all.filter(s => String(s.sale_date).startsWith(cashMonth) && inBr(s));
  const sum = salesSum(month), avg = sum.days.size ? Math.round(sum.total / sum.days.size) : 0;
  const todayRows = all.filter(s => String(s.sale_date).slice(0, 10) === t);
  const days = {};
  month.forEach(s => (days[String(s.sale_date).slice(0, 10)] ||= []).push(s));
  const dayKeys = Object.keys(days).sort().reverse();
  const chip = (k, label) => `<button class="sp-chip ${cashBranch === k ? 'on' : ''}" onclick="cashBranch='${k}';localStorage.setItem('mawredin_cash_branch','${k}');viewCash()">${label}</button>`;
  const isNow = cashMonth === t.slice(0, 7);
  const dname = d => { const x = new Date(d + 'T12:00:00'); return `${CS_DAYS[x.getDay()]} ${fmtDate(d)}`; };
  shell({title:'الخزينة', nav:'more', page:{sub:'المبيع اليومي — كاش وتحويلات لكل فرع', icon:'safe'}, body:`
    <div class="cs-today card">
      <div class="cs-th"><b>النهارده</b><small>${dname(t)}</small></div>
      <div class="cs-tb">${BRANCHES.map(b => { const r = todayRows.find(s => s.branch === b);
        return r ? `<button class="cs-tbr done" onclick="go('/sale/${r.id}')"><span class="cs-br">${b}</span><b>${smoney(saleTotal(r))}</b><small>كاش ${smoney(SC(r.cash))} · تحويل ${smoney(SC(r.transfer))}</small></button>`
          : `<button class="cs-tbr" onclick="go('/sale?b=${encodeURIComponent(b)}')"><span class="cs-br">${b}</span><b class="cs-miss">لسه متسجلش</b><small>${I.plus}سجّل مبيع ${b}</small></button>`; }).join('')}</div>
    </div>
    <div class="sp-chips">${chip('all', 'الفرعين')}${BRANCHES.map(b => chip(b, b)).join('')}</div>
    <div class="cs-mon"><button class="iconbtn" onclick="cashMonth='${addMonths(cashMonth + '-01', -1).slice(0, 7)}';viewCash()" aria-label="الشهر اللي فات"><span class="flipx">${I.chevL}</span></button>
      <b>${CS_MONTHS[M - 1]} ${Y}</b>
      <button class="iconbtn" ${isNow ? 'disabled' : ''} onclick="cashMonth='${addMonths(cashMonth + '-01', 1).slice(0, 7)}';viewCash()" aria-label="الشهر الجاي">${I.chevL}</button></div>
    <div class="sp-sum">
      <div class="sp-t hl"><i>${I.coins2}</i><span>إجمالي المبيع</span><b>${smoney(sum.total)}</b></div>
      <div class="sp-t"><i>${I.cash}</i><span>كاش</span><b>${smoney(sum.cash)}</b></div>
      <div class="sp-t"><i>${I.card}</i><span>تحويلات</span><b>${smoney(sum.transfer)}</b></div>
      <div class="sp-t"><i>${I.cal}</i><span>متوسط اليوم (${sum.days.size} يوم)</span><b>${smoney(avg)}</b></div>
    </div>
    ${cashBranch === 'all' && sum.total ? `<div class="cs-split">${BRANCHES.map(b => `<div><span>${b}</span><b>${smoney(sum.by[b] || 0)}</b><i style="width:${sum.total ? Math.round((sum.by[b] || 0) / sum.total * 100) : 0}%"></i></div>`).join('')}</div>` : ''}
    <button class="btn primary block" style="margin:4px 0 12px" onclick="go('/sale${cashBranch !== 'all' ? '?b=' + encodeURIComponent(cashBranch) : ''}')">${I.plus}تسجيل مبيع يوم</button>
    <div class="cs-days">${dayKeys.length ? dayKeys.map(d => { const rows = days[d].sort((a, b) => BRANCHES.indexOf(a.branch) - BRANCHES.indexOf(b.branch)), tot = rows.reduce((a, s) => a + saleTotal(s), 0);
      return `<div class="card cs-day"><div class="cs-dh"><b>${dname(d)}</b>${rows.length > 1 ? `<span>${smoney(tot)}</span>` : ''}</div>
        ${rows.map(s => `<button class="cs-row" onclick="go('/sale/${s.id}')"><span class="cs-br">${esc(s.branch)}</span>
          <span class="cs-v"><small>كاش</small>${smoney(SC(s.cash))}</span><span class="cs-v"><small>تحويل</small>${smoney(SC(s.transfer))}</span>
          <span class="cs-v t"><small>الإجمالي</small>${smoney(saleTotal(s))}</span>${s._pending ? '<span class="tag pend-sync">على الجهاز</span>' : ''}</button>
          ${s.transfer_note || s.notes ? `<div class="cs-note">${esc([s.transfer_note, s.notes].filter(Boolean).join(' · '))}</div>` : ''}`).join('')}</div>`; }).join('')
      : `<div class="hint" style="text-align:center;padding:24px 0">مفيش مبيع متسجل في ${CS_MONTHS[M - 1]}${cashBranch !== 'all' ? ' لفرع ' + cashBranch : ''}</div>`}</div>
  `});
}

/* ---------- فورم المبيع ---------- */
async function formSale(id){
  const x = id ? store.eff.daily_sales.get(id) : null;
  if(id && !x) return go('/cash');
  const qp = new URLSearchParams(location.hash.split('?')[1] || '');
  const br = x?.branch || qp.get('b') || localStorage.getItem('mawredin_last_branch') || BRANCHES[0];
  formShell(x ? 'تعديل مبيع يوم' : 'تسجيل مبيع يوم', `
    <div class="field"><label>الفرع</label><div class="seg" id="sbr" style="grid-template-columns:1fr 1fr">
      ${BRANCHES.map(b => `<button type="button" data-v="${b}" class="${br === b ? 'on' : ''}" onclick="segPick(this);saleDup()">${b}</button>`).join('')}</div></div>
    <div class="field"><label>اليوم</label><input id="sdate" type="date" value="${x?.sale_date || qp.get('d') || today()}" onchange="saleDup()"></div>
    <div id="sdup"></div>
    <div class="field" id="f-cash"><label>مبيع كاش</label><input id="cash" class="amount-input" inputmode="decimal" placeholder="0" value="${x && Number(x.cash) ? x.cash : ''}"></div>
    <div class="field" id="f-transfer"><label>مبيع تحويلات</label><input id="transfer" class="amount-input" inputmode="decimal" placeholder="0" value="${x && Number(x.transfer) ? x.transfer : ''}">
      <div class="hint">انستاباي، محفظة، فيزا، تحويل بنكي…</div></div>
    <div class="field"><label>تفاصيل التحويلات <small class="hint">(اختياري)</small></label><input id="tnote" value="${esc(x?.transfer_note || '')}" placeholder="مثلًا: انستاباي 2000 + فودافون كاش 500"></div>
    <div class="cs-live"><span>إجمالي مبيع اليوم</span><b id="stot">—</b></div>
    <div class="field"><label>ملاحظات</label><textarea id="notes" rows="2">${esc(x?.notes || '')}</textarea></div>
    ${x ? `<button type="button" class="btn danger block" style="margin-bottom:12px" onclick="saleDelete(${x.id})">${I.trash}مسح المبيع ده</button>` : ''}
  `, async () => {
    const branch = $('#sbr .on')?.dataset.v, d = $('#sdate').value;
    const cash = $('#cash').value.trim() ? readAmount($('#cash').value) : 0, tr = $('#transfer').value.trim() ? readAmount($('#transfer').value) : 0;
    if(!branch) return toast('اختار الفرع', true);
    if(!d) return toast('اختار اليوم', true);
    if(!(cash >= 0)) return markErr('cash', 'المبلغ غلط');
    if(!(tr >= 0)) return markErr('transfer', 'المبلغ غلط');
    if(!(cash > 0) && !(tr > 0)) return markErr('cash', 'اكتب مبيع الكاش أو التحويلات');
    const dup = saleFind(d, branch, x?.id);
    if(dup){ busy(false); return saleDupAsk(dup); }
    const row = {sale_date:d, branch, cash, transfer:tr, transfer_note:$('#tnote').value.trim() || null, notes:$('#notes').value.trim() || null};
    localStorage.setItem('mawredin_last_branch', branch);
    if(x){ await q(ldb.from('daily_sales').update(row).eq('id', x.id)); busy(false); toast('اتحفظ ✓'); history.back(); }
    else { await q(ldb.from('daily_sales').insert(row)); busy(false); toast(savedMsg('مبيع ' + branch)); cashMonth = d.slice(0, 7); location.replace('#/cash'); }
  });
  const calc = () => { const c = readAmount($('#cash').value) || 0, t2 = readAmount($('#transfer').value) || 0; $('#stot').innerHTML = c || t2 ? smoney(SC(c) + SC(t2)) : '—'; };
  ['cash', 'transfer'].forEach(k => $('#' + k).addEventListener('input', calc));
  calc();
  window._saleId = x?.id || null; saleDup();
}
function saleFind(d, b, exceptId){ return salesAll().find(s => String(s.sale_date).slice(0, 10) === d && s.branch === b && s.id !== exceptId); }
// تنبيه وإنت بتسجل لو اليوم والفرع ليهم مبيع متسجل
window.saleDup = () => {
  const box = $('#sdup'); if(!box) return;
  const b = $('#sbr .on')?.dataset.v, d = $('#sdate').value, dup = b && d && saleFind(d, b, window._saleId);
  box.innerHTML = dup ? `<div class="sp-note" style="background:#FFF6E5;color:#8a5a00;margin-bottom:10px">${I.warn}<span>مبيع ${esc(b)} يوم ${fmtDate(d)} متسجل قبل كده (${smoney(saleTotal(dup))}). <a href="#/sale/${dup.id}" onclick="location.replace(this.href);return false">افتحه وعدّله</a></span></div>` : '';
};
function saleDupAsk(dup){
  openModal(`<h3>اليوم ده متسجل</h3><div class="kv"><span>الفرع</span><b>${esc(dup.branch)}</b></div><div class="kv"><span>اليوم</span><span>${fmtDate(dup.sale_date)}</span></div>
    <div class="kv"><span>المتسجل</span><b>${smoney(saleTotal(dup))}</b></div><div class="hint" style="margin:8px 0 12px">كل فرع ليه سجل واحد في اليوم. افتح المتسجل وعدّل الأرقام.</div>
    <div class="actions"><button class="btn primary" onclick="closeModal();location.replace('#/sale/${dup.id}')">افتح المتسجل</button><button class="btn ghost" onclick="closeModal()">رجوع</button></div>`);
}
window.saleDelete = id => {
  const s = store.eff.daily_sales.get(id);
  openModal(`<h3>مسح المبيع؟</h3><div class="kv"><span>الفرع</span><b>${esc(s.branch)}</b></div><div class="kv"><span>اليوم</span><span>${fmtDate(s.sale_date)}</span></div>
    <div class="kv"><span>الإجمالي</span><b>${smoney(saleTotal(s))}</b></div>
    <div class="actions" style="margin-top:12px"><button class="btn danger" id="sd-ok">تأكيد المسح</button><button class="btn ghost" onclick="closeModal()">إلغاء</button></div>`);
  $('#sd-ok').onclick = async () => { busy(true); try{ await q(ldb.from('daily_sales').delete().eq('id', id)); closeModal(); toast('اتمسح'); location.replace('#/cash'); }catch(e){ toast(errMsg(e), true); } finally{ busy(false); } };
};
