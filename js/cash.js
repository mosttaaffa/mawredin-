/* =================== الخزينة — المبيع اليومي ===================
   كل سجل = يوم + فرع (ورد / زهرة) + كاش + تحويلات. الإجمالي = الكاش + التحويلات.
   سجل واحد لكل فرع في اليوم (لو موجود بنفتحه للتعديل بدل ما نكرره). */

const BRANCHES = ['ورد', 'زهرة'];
const SC = v => Math.round(Number(v || 0) * 100);
const smoney = c => `<span class="m"><span class="num">${(c / 100).toLocaleString('en-US', {maximumFractionDigits:0})}</span> ج</span>`;
const CS_MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const CS_DAYS = ['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
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

// تجميع المبيعات حسب الشهر (السنة-الشهر من نص التاريخ نفسه — مفيش تحويل توقيت فمفيش يوم بيتنقل لشهر تاني)
// كل الحسابات بالقروش (أعداد صحيحة) عشان مفيش كسور غلط
function salesByMonth(){
  const months = {};
  for(const s of salesAll()){
    const d = String(s.sale_date).slice(0, 10), mk = d.slice(0, 7);
    const M = months[mk] ||= {key:mk, days:{}, by:Object.fromEntries(BRANCHES.map(b => [b, 0])), total:0};
    const D = M.days[d] ||= {date:d, rows:{}, total:0};
    const v = saleTotal(s);
    // لو اتسجل نفس الفرع مرتين في نفس اليوم (من موبايلين من غير نت) بنجمعهم ومبنخفيش حاجة
    (D.rows[s.branch] ||= []).push(s); D.total += v; M.by[s.branch] = (M.by[s.branch] || 0) + v; M.total += v;
  }
  return months;
}
const csMonthName = mk => { const [y, m] = mk.split('-').map(Number); return `${CS_MONTHS[m - 1]} ${y}`; };
const csDaysWord = n => n === 1 ? 'يوم واحد' : n === 2 ? 'يومين' : n <= 10 ? `${n} أيام` : `${n} يوم`;
const csNum = c => `<span class="m"><span class="num">${(c / 100).toLocaleString('en-US', {maximumFractionDigits:0})}</span> ج</span>`;
let cashOpen = null;   // الشهور المفتوحة

async function viewCash(){
  const t = today(), months = salesByMonth();
  const keys = Object.keys(months).sort().reverse();
  cashMonth = cashMonth || t.slice(0, 7);
  if(!cashOpen) cashOpen = new Set([cashMonth]);
  const opts = [...new Set([t.slice(0, 7), cashMonth, ...keys])].sort().reverse();
  const sel = months[cashMonth] || {by:Object.fromEntries(BRANCHES.map(b => [b, 0])), total:0, days:{}};
  const dname = d => CS_DAYS[new Date(d + 'T12:00:00').getDay()];
  const cell = (D, b) => { const rs = D.rows[b] || [], sum = rs.reduce((a, r) => a + saleTotal(r), 0);
    const act = rs.length > 1 ? `cashPick('${D.date}','${b}')` : rs.length ? `go('/sale/${rs[0].id}')` : `go('/sale?b=${encodeURIComponent(b)}&d=${D.date}')`;
    return `<button class="cm-c ${rs.length > 1 ? 'dup' : ''}" onclick="${act}"><small>${I.store}مبيعات ${b}</small>${rs.length ? `<b>${csNum(sum)}</b>` : '<b class="cm-none">—</b>'}${rs.length > 1 ? `<i class="cm-n">${rs.length}×</i>` : ''}${rs.some(r => r._pending) ? '<i class="cm-p" title="على الجهاز"></i>' : ''}</button>`; };
  const month = mk => { const M = months[mk], open = cashOpen.has(mk), days = Object.keys(M.days).sort();
    const foot = `<div class="cm-sum ${open ? 'dark' : ''}"><span class="cm-sl">${I.coins}إجمالي ${csMonthName(mk)}</span>${BRANCHES.map(b => `<span class="cm-sv"><small>فرع ${b}</small><b>${csNum(M.by[b] || 0)}</b></span>`).join('')}</div>`;
    return `<section class="card cm ${open ? 'open' : ''}">
      <button class="cm-h" onclick="cashToggle('${mk}')" aria-expanded="${open}"><span class="cm-hi">${I.cal}</span>
        <span class="cm-ht"><b>${csMonthName(mk)}</b><small>(${csDaysWord(days.length)})</small></span>
        <span class="cm-htot"><small>إجمالي الشهر</small><b>${csNum(M.total)}</b></span><span class="cm-chev">${I.chevL}</span></button>
      ${open ? `<div class="cm-days">${days.map(d => { const D = M.days[d];
        return `<div class="cm-r"><div class="cm-d">${I.cal}<span><b>${dname(d)}</b><small>${fmtDate(d)}</small></span></div>
          ${BRANCHES.map(b => cell(D, b)).join('')}
          <div class="cm-t"><small>إجمالي اليوم</small><b>${csNum(D.total)}</b></div>
          <button class="cm-x" onclick="cashDelDay('${d}')" aria-label="مسح مبيعات اليوم">${I.trash}</button></div>`; }).join('')}</div>` : ''}
      ${foot}</section>`; };
  shell({title:'المبيعات', nav:'more', page:{sub:'مبيعات ورد وزهرة كل يوم — كاش وتحويلات', icon:'store'}, body:`
    <div class="card cs-top">
      <div class="cs-th2"><b>${I.chart}ملخص المبيعات</b>
        <label class="cs-pick">${I.cal}<select onchange="cashMonth=this.value;viewCash()">${opts.map(k => `<option value="${k}" ${k === cashMonth ? 'selected' : ''}>${csMonthName(k)}</option>`).join('')}</select><span class="cs-pk-chev">${I.chevL}</span></label></div>
      <div class="cs-3">${BRANCHES.map(b => `<div class="cs-k"><i>${I.store}</i><span>فرع ${b}</span><b>${csNum(sel.by[b] || 0)}</b></div>`).join('')}
        <div class="cs-k hl"><i>${I.coins}</i><span>إجمالي المبيعات</span><b>${csNum(sel.total)}</b></div></div>
    </div>
    <button class="btn primary block cs-add" onclick="go('/sale')">${I.plus}تسجيل المبيعات</button>
    ${keys.length ? keys.map(month).join('') : '<div class="hint" style="text-align:center;padding:24px 0">لسه مفيش مبيعات متسجلة — دوس «تسجيل المبيعات»</div>'}
  `});
}
// نفس الفرع متسجل أكتر من مرة في نفس اليوم: اختار تعدّل أنهي واحد
window.cashPick = (d, b) => {
  const rs = salesAll().filter(s => String(s.sale_date).slice(0, 10) === d && s.branch === b);
  openModal(`<h3>مبيعات ${b} يوم ${fmtDate(d)} متسجلة ${rs.length} مرات</h3>
    <div class="hint" style="margin-bottom:8px">غالبًا اتسجلت من موبايلين. الإجمالي بيجمعهم كلهم — لو واحدة مكررة افتحها وامسحها.</div>
    <div class="menu-list">${rs.map(r => `<button onclick="closeModal();go('/sale/${r.id}')">${I.edit}كاش ${smoney(SC(r.cash))} + تحويل ${smoney(SC(r.transfer))} = <b>${smoney(saleTotal(r))}</b> <small>${esc(who(r.created_by))}</small></button>`).join('')}</div>`);
};
window.cashToggle = mk => { cashOpen.has(mk) ? cashOpen.delete(mk) : cashOpen.add(mk); viewCash(); };
// مسح مبيعات يوم كامل (الفرعين) بعد التأكيد
window.cashDelDay = d => {
  const rows = salesAll().filter(s => String(s.sale_date).slice(0, 10) === d);
  if(!rows.length) return;
  openModal(`<h3>مسح مبيعات ${CS_DAYS[new Date(d + 'T12:00:00').getDay()]} ${fmtDate(d)}؟</h3>
    ${rows.map(s => `<div class="kv"><span>فرع ${esc(s.branch)}</span><b>${smoney(saleTotal(s))}</b></div>`).join('')}
    <div class="kv"><span>الإجمالي</span><b>${smoney(rows.reduce((a, s) => a + saleTotal(s), 0))}</b></div>
    <div class="hint" style="margin:8px 0 12px">لو عايز تمسح فرع واحد بس: دوس على مبيعاته وامسحه من جوه.</div>
    <div class="actions"><button class="btn danger" id="cd-ok">تأكيد المسح</button><button class="btn ghost" onclick="closeModal()">إلغاء</button></div>`);
  $('#cd-ok').onclick = async () => { busy(true); try{ for(const s of rows) await q(ldb.from('daily_sales').delete().eq('id', s.id)); closeModal(); toast('اتمسح'); viewCash(); }catch(e){ toast(errMsg(e), true); } finally{ busy(false); } };
};

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
    <div class="field" id="f-cash"><label>مبيع كاش</label><input id="cash" class="amount-input" inputmode="numeric" placeholder="0" value="${x && Number(x.cash) ? x.cash : ''}"></div>
    <div class="field" id="f-transfer"><label>مبيع تحويلات</label><input id="transfer" class="amount-input" inputmode="numeric" placeholder="0" value="${x && Number(x.transfer) ? x.transfer : ''}">
      <div class="hint">انستاباي، محفظة، فيزا، تحويل بنكي… — بيدخل رصيد البنك</div></div>
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
    if(x){ await q(ldb.from('daily_sales').update(row).eq('id', x.id)); busy(false); toast('اتحفظ ✓'); cashOpen?.add(d.slice(0, 7)); history.back(); }
    else { await q(ldb.from('daily_sales').insert(row)); busy(false); toast(savedMsg('مبيع ' + branch)); cashMonth = d.slice(0, 7); cashOpen?.add(cashMonth); location.replace('#/cash'); }
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
