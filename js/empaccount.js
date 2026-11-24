/* =================== كشف حساب الموظف (صفحة واحدة) ===================
   كل شهر:  المرحّل + المرتب + عمولات ورد + عمولات زهرة (+ أي إضافات تانية)  =  إجمالي المستحقات
            خصم التأخير + خصم الغياب + مسحوبات ملابس + سلف ورد + سلف زهرة (+ أي خصومات تانية)  =  إجمالي الاستقطاعات
            صافي حساب الشهر = المستحقات − الاستقطاعات      ثم: − اللي اتصرف له خلال الشهر  =  المتبقي (بيترحّل للشهر اللي بعده)
   - الكشف المستورد (مثلًا سبتمبر–أكتوبر) هو أول «فترة»: أرقامه من الكشف نفسه + أي حركة اتحسبت عليه (for_month).
   - مرتب الشهر الحالي بيتعرض «متوقع» لحد ما ينزل فعلًا أول الشهر اللي بعده — ومبيدخلش في «الرصيد المستحق حتى اليوم».
   - نفس قاعدة الرصيد بالظبط (صافي آخر كشف + الحركات اللي بعده)، فآخر شهر = رصيد الموظف. كل الحسابات بالقروش. */

const EA_EARN = [['carry', 'الرصيد المرحّل', 'hist'], ['base', 'المرتب الأساسي', 'cash'], ['comW', 'عمولات فرع ورد', 'store'], ['comZ', 'عمولات فرع زهرة', 'store']];
const EA_EARN_X = [['comX', 'عمولات (من غير فرع)', 'store'], ['adjP', 'تسويات لصالحه', 'plus']];
const EA_DED = [['late', 'خصم التأخير', 'clock'], ['absent', 'خصم الغياب', 'cal'], ['clothes', 'مسحوبات ملابس', 'hanger'], ['advW', 'سلف فرع ورد', 'coins2'], ['advZ', 'سلف فرع زهرة', 'coins2']];
const EA_DED_X = [['advX', 'سلف (من غير فرع)', 'coins2'], ['dedX', 'خصومات أخرى', 'disc'], ['adjM', 'تسويات عليه', 'disc']];
const EA_SUB = {late:'خصم تأخير', absence:'خصم غياب', clothes:'مسحوبات ملابس', other:'خصم'};
const eaC = v => Math.round(Number(v || 0) * 100);
const eaN = c => (Math.abs(c) / 100).toLocaleString('en-US', {maximumFractionDigits:2});
const eaM = c => `${c < 0 ? '−' : ''}${eaN(c)} ج.م`;                                    // للنص (واتساب)
const eaMH = c => `<bdi dir="ltr">${c < 0 ? '−' : ''}${eaN(c)}</bdi> ج.م`;         // للصفحة والصورة
const eaSH = (plus, c) => `<bdi dir="ltr">${plus ? '+' : '−'}${eaN(c)}</bdi>`;
let eaSel = {};                                   // الشهر المختار لكل موظف

// تصنيف الحركة على بند
function eaKey(x){
  const b = x.branch;
  if(x.kind === 'salary') return 'base';
  if(x.kind === 'commission') return b === 'ورد' ? 'comW' : b === 'زهرة' ? 'comZ' : 'comX';
  if(x.kind === 'advance') return b === 'ورد' ? 'advW' : b === 'زهرة' ? 'advZ' : 'advX';
  if(x.kind === 'deduction') return x.sub === 'late' ? 'late' : x.sub === 'absence' ? 'absent' : x.sub === 'clothes' ? 'clothes' : 'dedX';
  if(x.kind === 'adjustment') return eaC(x.amount) >= 0 ? 'adjP' : 'adjM';
  if(x.kind === 'payment') return 'paid';
  return 'dedX';
}
const eaTxLabel = x => x.auto ? 'مرتب الشهر (تلقائي)' : x.kind === 'deduction' ? (EA_SUB[x.sub] || 'خصم') : x.kind === 'commission' ? `عمولة${x.branch ? ' فرع ' + x.branch : ''}` : x.kind === 'advance' ? `سلفة${x.branch ? ' فرع ' + x.branch : ''}` : TX_KIND[x.kind] || x.kind;
const eaQty = x => x.qty ? (x.sub === 'late' ? `${Number(x.qty).toLocaleString('en-US')} دقيقة تأخير` : x.sub === 'absence' ? `${Number(x.qty).toLocaleString('en-US')} يوم غياب` : '') : '';

function empLedger(id){
  const E = store.eff; id = Number(id);
  const e = E.employees.get(id) || [...E.employees.values()].find(x => Number(x.id) === id);
  const sets = [...E.emp_settlements.values()].filter(x => Number(x.employee_id) === id).sort((a, b) => String(a.period_to).localeCompare(String(b.period_to)) || a.id - b.id);
  const last = sets[sets.length - 1] || null, lastTo = last ? String(last.period_to).slice(0, 10) : '', lastYM = last ? lastTo.slice(0, 7) : '';
  const txs = [...E.emp_transactions.values()].filter(x => Number(x.employee_id) === id && (!last || String(x.tx_date).slice(0, 10) > lastTo))
    .sort((a, b) => String(a.tx_date).localeCompare(String(b.tx_date)) || a.id - b.id);
  const cur = today().slice(0, 7);
  const aym = x => { const m = (x.for_month ? String(x.for_month) : String(x.tx_date)).slice(0, 7); return lastYM && m < lastYM ? lastYM : m; };
  let start = last ? empYM(addDays(lastTo, 1)) : (txs.length ? txs.map(aym).sort()[0] : (e?.created_at ? String(e.created_at).slice(0, 7) : cur));
  if(start > cur && !txs.some(x => aym(x) >= start)) start = cur;
  let end = cur; for(const x of txs) if(aym(x) > end) end = aym(x);
  const mk = (key, label, open, rows, isSet) => {
    const L = {carry:open, base:0, comW:0, comZ:0, comX:0, adjP:0, late:0, absent:0, clothes:0, advW:0, advZ:0, advX:0, dedX:0, adjM:0, paid:0};
    const src = {}; Object.keys(L).forEach(k => src[k] = []);
    for(const x of rows){ const k = eaKey(x); L[k] += Math.abs(eaC(x.amount)); src[k].push(x); }
    return {key, label, isSet, L, src, rows, proj:0};
  };
  const entries = [];
  if(last){
    const span = empYM(last.period_from) === lastYM ? empMonthName(lastYM) : `${AR_MONTHS[+String(last.period_from).slice(5, 7) - 1]} – ${empMonthName(lastYM)}`;
    const P = mk(lastYM, span, eaC(last.prev_balance), txs.filter(x => aym(x) === lastYM), true);
    const K = {base:eaC(last.earned_salary), comW:eaC(last.comm_ward), comZ:eaC(last.comm_zahra), late:eaC(last.late_ded), clothes:eaC(last.ded_clothes), advW:eaC(last.adv_ward), advZ:eaC(last.adv_zahra), dedX:eaC(last.ded_general)};
    for(const k in K) P.L[k] += K[k];
    P.kashf = {set:last, K}; entries.push(P);
  }
  for(let ym = start; ym <= end; ym = addMonthsYM(ym, 1)){
    const prev = entries[entries.length - 1];
    entries.push(mk(ym, empMonthName(ym), prev ? prev.close : 0, txs.filter(x => aym(x) === ym), false));
    const M = entries[entries.length - 1];
    // مرتب الشهر الحالي (لسه منزلش): متوقع
    if(ym >= cur && !M.src.base.some(x => x.auto) && e && e.active !== false && eaC(e.base_salary) > 0 && ym === cur){ M.proj = eaC(e.base_salary); M.L.base += M.proj; }
    calc(M);
  }
  if(last) calc(entries[0]);
  function calc(M){
    const L = M.L;
    M.earn = L.carry + L.base + L.comW + L.comZ + L.comX + L.adjP;
    M.ded = L.late + L.absent + L.clothes + L.advW + L.advZ + L.advX + L.dedX + L.adjM;
    M.net = M.earn - M.ded; M.close = M.net - L.paid; M.closeActual = M.close - M.proj;
  }
  // الترتيب اتحسب قبل كده للكشف عشان الشهر اللي بعده ياخد المرحّل الصح
  for(let i = 0; i < entries.length; i++){ if(i > 0){ entries[i].L.carry = entries[i - 1].closeActual; calc(entries[i]); } }
  return {e, sets, last, entries, txs, balance:entries.length ? entries[entries.length - 1].closeActual : 0};
}

// حساب موظف في شهر معيّن (لكروت القايمة) — من نفس دفتر الحساب، فالأرقام برّه = جوه
function eaMonth(id, ym){
  const G = empLedger(id), E = G.entries, zero = {carry:0, base:0, comW:0, comZ:0, comX:0, adjP:0, late:0, absent:0, clothes:0, advW:0, advZ:0, advX:0, dedX:0, adjM:0, paid:0};
  let M = E.find(x => x.key === ym);
  if(!M && G.last && ym >= empYM(G.last.period_from) && ym <= empYM(G.last.period_to)) M = E[0];
  if(!M && E.length && ym > E[E.length - 1].key){ const P = E[E.length - 1]; M = {key:ym, virt:true, L:{...zero, carry:P.closeActual}, src:{}, rows:[], proj:0, net:P.closeActual, close:P.closeActual, closeActual:P.closeActual}; }
  if(!M) M = {key:ym, virt:true, L:{...zero}, src:{}, rows:[], proj:0, net:0, close:0, closeActual:0};
  const L = M.L;
  return {G, M, carry:L.carry, close:M.closeActual, mov:M.closeActual - L.carry, base:L.base, proj:M.proj,
    com:L.comW + L.comZ + L.comX, adv:L.advW + L.advZ + L.advX, ded:L.late + L.absent + L.dedX + L.adjM, clothes:L.clothes};
}
// أيقونة الموظف: راجل / ست (من بيانات الموظف — ولو مش متحددة بنخمّن من الاسم)
const EA_F_NAMES = ['رحاب', 'نور', 'دنيا', 'شهد', 'سارة', 'ساره', 'هايدي', 'حبيبة', 'فرح', 'سلمى', 'رودي', 'جنى', 'جنات', 'صابرين', 'بسمة', 'منى', 'مي', 'هند', 'ياسمين', 'إيمان', 'ايمان', 'مريم', 'آية', 'اية', 'أسماء', 'اسماء', 'رنا', 'دينا', 'نهى', 'هدى', 'سماح', 'أمل', 'امل', 'ندى', 'شيماء', 'ريم', 'ملك', 'روان', 'هالة', 'نادية', 'سلوى', 'عبير', 'نسمة', 'زينب', 'فاطمة', 'منة', 'جيهان', 'نيرة', 'ميار', 'رحمة', 'مروة', 'سمر', 'غادة', 'هبة'];
function eaGender(e){
  if(e.gender === 'f' || e.gender === 'm') return e.gender;
  const first = String(e.name || '').trim().split(/\s+/)[0] || '';
  if(EA_F_NAMES.includes(first) || /[ةى]$/.test(first)) return 'f';
  return 'm';
}
const EA_AV = {
  m:`<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="32" fill="#F6E8EB"/><path d="M12 60c2-11 10-17 20-17s18 6 20 17a32 32 0 0 1-40 0z" fill="#2F2A3A"/><path d="M27 43h10l-5 13z" fill="#fff"/><path d="M31 45h2l1.6 7-2.6 3-2.6-3z" fill="#C0283F"/><circle cx="32" cy="27" r="11" fill="#F2C9A8"/><path d="M21 26c0-8 5-13 11-13s11 5 11 13c-2-4-6-6-11-6s-9 2-11 6z" fill="#3A2A22"/></svg>`,
  f:`<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="32" fill="#F6E8EB"/><path d="M11 60c2-12 10-19 21-19s19 7 21 19a32 32 0 0 1-42 0z" fill="#2F2A3A"/><path d="M18 34c0-11 6-20 14-20s14 9 14 20c0 7-3 12-6 14H24c-3-2-6-7-6-14z" fill="#2F2A3A"/><ellipse cx="32" cy="30" rx="8.5" ry="10" fill="#F2C9A8"/><path d="M23.5 27c1-6 4.5-9 8.5-9s7.5 3 8.5 9c-2-3-5-4.5-8.5-4.5S25.5 24 23.5 27z" fill="#2F2A3A"/></svg>`,
};
function eaCard(r, ym){
  const D = eaMonth(r.id, ym), bal = D.close, ph = String(r.phone || '').replace(/[^\d+]/g, '');
  const n = c => (Math.abs(c) / 100).toLocaleString('en-US', {maximumFractionDigits:2});
  const st = bal > 0 ? ['due', I.coins2, 'مستحق للموظف'] : bal < 0 ? ['owe', I.store, 'مستحق للمحل'] : ['zero', I.layers, 'الحساب متوازن'];
  const it = (k, l, c, cls) => `<button class="ec-v" onclick="event.stopPropagation();eaItem(${r.id},'${ym}','${k}')"><small>${l}</small><b class="${c ? cls : 'z'}"><bdi dir="ltr">${n(c)}</bdi> ج</b></button>`;
  const lastTo = r.last_to ? (([y, m, d]) => `${d}/${m}/${y.slice(2)}`)(String(r.last_to).slice(0, 10).split('-')) : '—';
  return `<div class="ecard" data-n="${esc((r.name + ' ' + (r.emp_no || '') + ' ' + ph.replace(/\D/g, '')).toLowerCase())}" onclick="go('/emp/${r.id}')">
    <div class="ec-r1">
      <span class="ec-av">${EA_AV[eaGender(r)]}</span>
      <span class="ec-nm"><b>${esc(r.name)}</b><small>${r.emp_no ? 'موظف رقم ' + esc(r.emp_no) : (r.branch ? esc(r.branch) : '')}<span class="ec-lt">تسوية ${lastTo}</span>${empOn(r) ? '' : ' <i class="tag left">ترك العمل</i>'}</small>
        <small class="ec-cr">مرحّل <bdi dir="ltr" class="${D.carry > 0 ? 'p' : D.carry < 0 ? 'm' : ''}">${D.carry < 0 ? '−' : ''}${n(D.carry)}</bdi> ج</small></span>
      <span class="ec-m"><i>${I.stats || I.chart}</i><small>حركات الشهر</small><b class="${D.mov > 0 ? 'p' : D.mov < 0 ? 'm' : ''}"><bdi dir="ltr">${D.mov > 0 ? '+' : D.mov < 0 ? '−' : ''}${n(D.mov)}</bdi> ج</b></span>
      <span class="ec-m ec-mlt"><i>${I.cal}</i><small>آخر تسوية</small><b class="num">${lastTo}</b></span>
      <span class="ec-bal ${st[0]}"><i>${st[1]}</i><b><bdi dir="ltr">${bal < 0 ? '−' : ''}${n(bal)}</bdi> ج</b><small>${st[2]}</small></span>
      <button class="ec-more" onclick="event.stopPropagation();empMore(${r.id})" aria-label="المزيد">${I.dots}</button>
    </div>
    <div class="ec-r2">
      ${it('base', '<i class="lf">المرتب الأساسي</i><i class="ls">الأساسي</i>', D.base, 'p')}${it('com', 'عمولات', D.com, 'p')}${it('adv', 'السلف', D.adv, 'm')}${it('ded', 'الخصومات', D.ded, 'm')}${it('clothes', '<i class="lf">مسحوبات ملابس</i><i class="ls">ملابس</i>', D.clothes, 'm')}
    </div>
  </div>`;
}
// تفاصيل بند من برّه (نفس حركات صفحة الموظف للشهر ده)
window.eaItem = (id, ym, k) => {
  const D = eaMonth(id, ym), M = D.M, e = D.G.e;
  const keys = {base:['base'], com:['comW', 'comZ', 'comX'], adv:['advW', 'advZ', 'advX'], ded:['late', 'absent', 'dedX', 'adjM'], clothes:['clothes']}[k];
  const title = {base:'المرتب الأساسي', com:'العمولات', adv:'السلف', ded:'الخصومات', clothes:'مسحوبات ملابس'}[k];
  const rows = keys.flatMap(x => (M.src[x] || [])).sort((a, b) => String(a.tx_date).localeCompare(String(b.tx_date)));
  const kashf = M.kashf ? keys.filter(x => M.kashf.K[x]).map(x => `<div class="ea-tx kashf"><span class="ea-txd">${fmtDate(M.kashf.set.period_to)}</span><span class="ea-txt"><b>من كشف ${M.label}</b><small>${{base:'المرتب', comW:'عمولات ورد', comZ:'عمولات زهرة', advW:'سلف ورد', advZ:'سلف زهرة', late:'تأخير وغياب', dedX:'خصومات', clothes:'ملابس'}[x] || ''}</small></span><b class="ea-txa">${eaN(M.kashf.K[x])}</b></div>`).join('') : '';
  const proj = k === 'base' && M.proj ? `<div class="ea-tx proj"><span class="ea-txd"></span><span class="ea-txt"><b>مرتب ${M.label} (متوقع)</b><small>هينزل لوحده أول الشهر الجاي — مش محسوب في الرصيد لحد دلوقتي</small></span><b class="ea-txa">${eaN(M.proj)}</b></div>` : '';
  const list = rows.map(x => `<div class="ea-tx"><span class="ea-txd">${fmtDate(x.tx_date)}</span><span class="ea-txt"><b>${eaTxLabel(x)}${x.branch ? ` <i class="tag">${esc(x.branch)}</i>` : ''}</b><small>${[eaQty(x), x.notes && !x.auto ? esc(x.notes) : ''].filter(Boolean).join(' · ') || '—'}</small></span><b class="ea-txa">${eaN(Math.abs(eaC(x.amount)))}</b></div>`).join('');
  const tot = {base:D.base, com:D.com, adv:D.adv, ded:D.ded, clothes:D.clothes}[k];
  openModal(`<h3>${title} — ${esc(e.name)}</h3><div class="hint" style="margin-bottom:8px">${M.label || empMonthName(ym)} · الإجمالي ${eaMH(tot)}</div>
    <div class="ea-det">${kashf + proj + list || '<div class="ea-none">مفيش حركات على البند ده في الشهر ده</div>'}</div>
    <div class="actions" style="margin-top:10px"><button class="btn ghost" onclick="closeModal();eaSel[${id}]='${M.virt ? '' : M.key}';go('/emp/${id}')">${I.doc}كشف الحساب</button><button class="btn primary" onclick="closeModal();eaNewTx(${id},'${ym}')">${I.plus}حركة جديدة</button></div>`);
};

/* ---------- الصفحة ---------- */
async function viewEmployee(id){
  id = Number(id);
  const e0 = store.eff.employees.get(id); if(!e0){ shell({title:'الموظف', back:true, body:`<div class="card empty">${I.emp}<div>الموظف ده مش موجود</div></div>`}); return; }
  const G = empLedger(id), e = G.e, ents = G.entries;
  window._emp = {e, sets:G.sets, txs:G.txs};
  if(!ents.length){ shell({title:esc(e.name), back:true, nav:'employees', body:`<div class="card empty">${I.emp}<div>مفيش حساب للموظف ده لسه</div></div>`}); return; }
  let idx = ents.findIndex(x => x.key === eaSel[id]); if(idx < 0) idx = ents.length - 1;
  const M = ents[idx], L = M.L, cur = today().slice(0, 7);
  const amtCls = (k, v) => k === 'carry' ? (v < 0 ? 'm' : v > 0 ? 'p' : '') : 'p';
  const srcRows = (k) => {
    const list = M.src[k] || [];
    const kashf = M.kashf && M.kashf.K[k] ? `<div class="ea-tx kashf" onclick="showSettlement(${M.kashf.set.id})"><span class="ea-txd">${fmtDate(M.kashf.set.period_to)}</span><span class="ea-txt"><b>من كشف ${M.label}</b><small>${k === 'base' && M.kashf.set.work_days ? `${M.kashf.set.work_days} يوم عمل · ` : ''}${k === 'late' ? 'تأخير وغياب مع بعض في الكشف · ' : ''}دوس عشان تشوف الكشف</small></span><b class="ea-txa">${eaN(M.kashf.K[k])}</b></div>` : '';
    const proj = k === 'base' && M.proj ? `<div class="ea-tx proj"><span class="ea-txd">${fmtDate(addDays(addMonthsYM(M.key, 1) + '-01', -1))}</span><span class="ea-txt"><b>مرتب ${M.label} (متوقع)</b><small>هينزل لوحده يوم 1/${+addMonthsYM(M.key, 1).slice(5)} — مش محسوب في الرصيد لحد دلوقتي</small></span><b class="ea-txa">${eaN(M.proj)}</b></div>` : '';
    const carry = k === 'carry' ? `<div class="ea-tx kashf"><span class="ea-txd"></span><span class="ea-txt"><b>${idx > 0 ? 'المتبقي من ' + ents[idx - 1].label : M.kashf ? 'حساب قديم في الكشف' : 'بداية الحساب'}</b></span><b class="ea-txa">${eaMH(L.carry)}</b></div>` : '';
    const rows = list.map(x => `<div class="ea-tx"><span class="ea-txd">${fmtDate(x.tx_date)}</span><span class="ea-txt"><b>${eaTxLabel(x)}${x.branch ? ` <i class="tag">${esc(x.branch)}</i>` : ''}</b><small>${[eaQty(x), x.for_month && empYM(x.for_month) !== empYM(x.tx_date) ? 'على ' + empMonthName(empYM(x.for_month)) : '', x.method === 'transfer' ? 'تحويل' : '', x.notes && !x.auto ? esc(x.notes) : ''].filter(Boolean).join(' · ') || '—'}</small></span><b class="ea-txa">${eaN(Math.abs(eaC(x.amount)))}</b><button class="ea-ed" onclick="event.stopPropagation();go('/emp-tx/${x.id}')" aria-label="تعديل">${I.edit}</button></div>`).join('');
    return carry + kashf + proj + rows || '<div class="ea-none">مفيش حركات على البند ده</div>';
  };
  const line = (k, l, ic, cls) => { const v = L[k]; return `<details class="ea-it ${cls}"><summary><i class="ea-ic">${I[ic] || I.doc}</i><span class="ea-l">${l}${k === 'base' && M.proj ? ' <small>(متوقع)</small>' : ''}</span><b class="ea-a ${cls === 'm' ? (v ? 'm' : '') : amtCls(k, v)}">${k === 'carry' ? eaMH(v) : eaN(v) + ' ج.م'}</b>${I.chev}</summary><div class="ea-det">${srcRows(k)}</div></details>`; };
  const extra = (arr, cls) => arr.filter(([k]) => L[k]).map(([k, l, ic]) => line(k, l, ic, cls)).join('');
  const isCur = M.key === cur;
  const months = ents.slice().reverse();
  shell({title:'كشف حساب الموظف', back:true, nav:'employees', body:`
    <div class="ea">
    <div class="card ea-head">
      <div class="ea-av">${esc((e.name || '؟').trim()[0])}</div>
      <div class="ea-hi"><b>${esc(e.name)}</b><small>${[e.emp_no ? 'رقم ' + esc(e.emp_no) : '', e.branch ? 'فرع ' + esc(e.branch) : ''].filter(Boolean).join(' · ') || '—'}</small>
        <small>${e.phone ? `<a href="tel:${esc(String(e.phone).replace(/[^\d+]/g, ''))}" class="num" dir="ltr">${esc(e.phone)}</a>` : 'من غير تليفون'} <i class="tag ${e.active === false ? 'left' : 'cleared'}">${e.active === false ? 'ترك العمل' : 'بيشتغل'}</i></small></div>
      <button class="iconbtn" onclick="go('/emp-edit/${id}')" aria-label="تعديل بيانات الموظف">${I.edit}</button>
    </div>
    <div class="ea-sum">
      <div class="ea-nav"><button onclick="eaGo(${id},${idx - 1})" ${idx ? '' : 'disabled'} aria-label="الشهر اللي فات">${I.back}</button>
        <b>${M.label}${M.isSet ? ' <small>(كشف)</small>' : isCur ? ' <small>(الشهر ده)</small>' : ''}</b>
        <button onclick="eaGo(${id},${idx + 1})" ${idx < ents.length - 1 ? '' : 'disabled'} aria-label="الشهر الجاي" style="transform:scaleX(-1)">${I.back}</button></div>
      <div class="ea-s2">
        <div><span>صافي حساب الشهر${M.proj ? ' المتوقع' : ''}</span><b>${eaMH(M.net)}</b></div>
        <div><span>الرصيد المستحق حتى اليوم</span><b>${eaMH(G.balance)}</b><small>${G.balance < 0 ? 'على الموظف للمحل' : G.balance > 0 ? 'للموظف على المحل' : 'خالص'}</small></div>
      </div>
    </div>
    <div class="ea-acts">
      <button class="btn primary" onclick="eaNewTx(${id},'${M.key}')">${I.plus}حركة جديدة</button>
      <button class="btn ghost" onclick="eaShare(${id},'${M.key}','preview')">${I.doc}كشف حساب</button>
      <button class="btn green" onclick="eaShare(${id},'${M.key}')">${I.wa}واتساب</button>
    </div>
    <div class="card ea-card"><div class="ea-ct p">${I.up || I.plus}المستحقات والإضافات</div>
      ${EA_EARN.map(([k, l, ic]) => line(k, l, ic, 'p')).join('')}${extra(EA_EARN_X, 'p')}
      <div class="ea-tot p"><span>إجمالي المستحقات والإضافات</span><b>${eaMH(M.earn)}</b></div></div>
    <div class="card ea-card"><div class="ea-ct m">${I.down || I.disc}الخصومات والاستقطاعات</div>
      ${EA_DED.map(([k, l, ic]) => line(k, l, ic, 'm')).join('')}${extra(EA_DED_X, 'm')}
      <div class="ea-tot m"><span>إجمالي الخصومات والاستقطاعات</span><b>${eaN(M.ded)} ج.م</b></div></div>
    <div class="card ea-net">
      <div class="ea-nl big"><span>صافي حساب الشهر${M.proj ? ' (متوقع)' : ''}</span><b>${eaMH(M.net)}</b></div>
      <details class="ea-it m"><summary><i class="ea-ic">${I.cash}</i><span class="ea-l">اتصرف للموظف خلال الشهر</span><b class="ea-a ${L.paid ? 'm' : ''}">${eaN(L.paid)} ج.م</b>${I.chev}</summary><div class="ea-det">${srcRows('paid')}</div></details>
      <div class="ea-nl"><span>${isCur ? 'المتبقي لحد دلوقتي' : 'المتبقي (اترحّل للشهر اللي بعده)'}</span><b class="${M.close < 0 ? 'm' : 'p'}">${eaMH(M.close)}</b></div>
      ${M.proj ? `<div class="hint">منها مرتب ${M.label} المتوقع ${eaMH(M.proj)} — هينزل يوم 1/${+addMonthsYM(M.key, 1).slice(5)}، والرصيد الفعلي حتى اليوم ${eaMH(M.closeActual)}.</div>` : ''}
    </div>
    <details class="card ea-sec"><summary>${I.hist || I.doc}حركات ${M.label} (${M.rows.length})${I.chev}</summary>
      ${M.rows.length ? `<div class="ea-det">${M.rows.slice().sort((a, b) => String(a.tx_date).localeCompare(String(b.tx_date)) || a.id - b.id).map(x => { const k = eaKey(x), plus = ['base', 'comW', 'comZ', 'comX', 'adjP'].includes(k);
        return `<div class="ea-tx"><span class="ea-txd">${fmtDate(x.tx_date)}</span><span class="ea-txt"><b>${eaTxLabel(x)}</b><small>${[x.branch ? 'فرع ' + esc(x.branch) : '', eaQty(x), x.notes && !x.auto ? esc(x.notes) : ''].filter(Boolean).join(' · ') || '—'}</small></span><b class="ea-txa ${plus ? 'p' : 'm'}">${eaSH(plus, Math.abs(eaC(x.amount)))}</b><button class="ea-ed" onclick="go('/emp-tx/${x.id}')" aria-label="تعديل">${I.edit}</button></div>`; }).join('')}</div>` : '<div class="ea-none">مفيش حركات متسجلة في الشهر ده</div>'}
    </details>
    <div class="card ea-sec ea-hist"><div class="ea-ct">${I.cal}حسابات الشهور</div>
      ${months.map(x => { const j = ents.indexOf(x); return `<div class="ea-mh ${j === idx ? 'on' : ''}" onclick="eaGo(${id},${j})">
        <b>${x.label}${x.proj ? ' <small>(متوقع)</small>' : ''}</b>
        <span><small>مستحقات</small>${eaN(x.earn)}</span><span><small>استقطاعات</small>${eaN(x.ded)}</span><span><small>اتصرف</small>${eaN(x.L.paid)}</span>
        <span class="${x.close < 0 ? 'm' : 'p'}"><small>${x === ents[ents.length - 1] ? 'الختامي' : 'اترحّل'}</small>${eaMH(x.close)}</span>
        <button class="ea-sh" onclick="event.stopPropagation();eaShare(${id},'${x.key}')" aria-label="مشاركة">${I.wa}</button></div>`; }).join('')}
    </div>
    </div>`});
}
window.eaGo = (id, i) => { const ents = empLedger(id).entries; if(i < 0 || i >= ents.length) return; eaSel[id] = ents[i].key; viewEmployee(id); scrollTo(0, 0); };

/* ---------- حركة جديدة: اختار البند ---------- */
window.eaNewTx = (id, key) => {
  const cur = today().slice(0, 7), G = empLedger(id), M = G.entries.find(x => x.key === key);
  // الحركة بتاريخ النهارده، ولو الشهر المختار قبل كده بتتحسب عليه (من غير ما تدخل جوه الكشف المستورد)
  const base = `/emp-tx?e=${id}${key < cur ? `&m=${key}` : ''}`;
  const it = (q, ic, l) => `<button onclick="closeModal();go('${base}&${q}')">${I[ic] || I.plus}${l}</button>`;
  openModal(`<h3>حركة جديدة${M && key !== cur ? ' — على ' + M.label : ''}</h3><div class="menu-list">
    ${it('k=commission&b=' + encodeURIComponent('ورد'), 'store', 'عمولة فرع ورد')}${it('k=commission&b=' + encodeURIComponent('زهرة'), 'store', 'عمولة فرع زهرة')}
    ${it('k=deduction&sub=late', 'clock', 'خصم تأخير')}${it('k=deduction&sub=absence', 'cal', 'خصم غياب')}${it('k=deduction&sub=clothes', 'hanger', 'مسحوبات ملابس')}
    ${it('k=advance&b=' + encodeURIComponent('ورد'), 'coins2', 'سلفة فرع ورد')}${it('k=advance&b=' + encodeURIComponent('زهرة'), 'coins2', 'سلفة فرع زهرة')}
    ${it('k=payment', 'cash', 'صرف للموظف (من مستحقاته)')}
    ${it('k=deduction&sub=other', 'disc', 'خصم آخر')}${it('k=salary', 'cash', 'مرتب / مستحقات')}${it('k=adjustment', 'edit', 'تسوية')}
  </div>`);
};

/* ---------- كشف الحساب للموظف: رسالة / صورة / PDF ---------- */
function eaData(id, key){ const G = empLedger(id); const M = G.entries.find(x => x.key === key) || G.entries[G.entries.length - 1]; return {G, M, e:G.e}; }
function eaText(id, key, detail){
  const {M, e} = eaData(id, key), L = M.L;
  const earn = [...EA_EARN.map(([k, l]) => `${l}: ${k === 'carry' ? eaM(L[k]) : eaN(L[k]) + ' ج.م'}${k === 'base' && M.proj ? ' (متوقع)' : ''}`), ...EA_EARN_X.filter(([k]) => L[k]).map(([k, l]) => `${l}: ${eaN(L[k])} ج.م`)];
  const ded = [...EA_DED.map(([k, l]) => `${l}: ${eaN(L[k])} ج.م`), ...EA_DED_X.filter(([k]) => L[k]).map(([k, l]) => `${l}: ${eaN(L[k])} ج.م`)];
  const sep = 'ــــــــــــــــــــــــــــ';
  const out = ['زهرة وورد', 'كشف حساب الموظف', '', `اسم الموظف: ${e.name}`, `الشهر: ${M.label}`, '', 'المستحقات والإضافات', sep, ...earn, '', `إجمالي المستحقات: ${eaM(M.earn)}`, '',
    'الخصومات والاستقطاعات', sep, ...ded, '', `إجمالي الاستقطاعات: ${eaN(M.ded)} ج.م`, '', sep, `صافي حساب الشهر: ${eaM(M.net)}`];
  if(L.paid) out.push(`اتصرف خلال الشهر: ${eaN(L.paid)} ج.م`, `المتبقي: ${eaM(M.close)}`);
  if(detail && M.rows.length){
    out.push('', 'الحركات', sep, ...M.rows.slice().sort((a, b) => String(a.tx_date).localeCompare(String(b.tx_date))).map(x => `${String(x.tx_date).slice(0, 10).split('-').reverse().join('/')} — ${eaTxLabel(x)}${eaQty(x) ? ' (' + eaQty(x) + ')' : ''}: ${eaN(Math.abs(eaC(x.amount)))} ج.م`));
  }
  out.push('', 'إدارة زهرة وورد');
  return out.join('\n');
}
function eaImageHTML(id, key, detail){
  const {M, e} = eaData(id, key), L = M.L;
  const brand = '#9B1B30', soft = '#FBEFF1', red = '#C0392B', green = '#178A3C';
  const f = c => `<span style="direction:ltr;unicode-bidi:isolate;font-variant-numeric:tabular-nums">${c < 0 ? '−' : ''}${eaN(c)}</span>`;
  const row = (l, v, col, k) => `<tr><td style="padding:10px 14px;border-bottom:1px solid #f1e6e8">${l}</td><td style="padding:10px 14px;text-align:left;font-weight:800;color:${col};border-bottom:1px solid #f1e6e8;white-space:nowrap">${f(v)} ج.م</td></tr>`;
  const tot = (l, v, col) => `<tr><td style="padding:12px 14px;background:${soft};font-weight:800">${l}</td><td style="padding:12px 14px;background:${soft};text-align:left;font-weight:900;color:${col};white-space:nowrap">${f(v)} ج.م</td></tr>`;
  const head = (l, col) => `<tr><th colspan="2" style="background:${col};color:#fff;padding:11px 14px;text-align:right;font-size:24px">${l}</th></tr>`;
  const earn = [...EA_EARN.map(([k, l]) => row(l + (k === 'base' && M.proj ? ' (متوقع)' : ''), L[k], k === 'carry' ? (L[k] < 0 ? red : green) : green)), ...EA_EARN_X.filter(([k]) => L[k]).map(([k, l]) => row(l, L[k], green))].join('');
  const ded = [...EA_DED.map(([k, l]) => row(l, L[k], L[k] ? red : '#555')), ...EA_DED_X.filter(([k]) => L[k]).map(([k, l]) => row(l, L[k], red))].join('');
  const mv = detail && M.rows.length ? `<table style="width:100%;border-collapse:collapse;margin-top:22px;font-size:21px">
      <tr><th style="background:${brand};color:#fff;padding:10px;text-align:right">التاريخ</th><th style="background:${brand};color:#fff;padding:10px;text-align:right">البيان</th><th style="background:${brand};color:#fff;padding:10px;text-align:right">الفرع</th><th style="background:${brand};color:#fff;padding:10px;text-align:left">المبلغ</th></tr>
      ${M.rows.slice().sort((a, b) => String(a.tx_date).localeCompare(String(b.tx_date))).map((x, i) => { const plus = ['base', 'comW', 'comZ', 'comX', 'adjP'].includes(eaKey(x));
        return `<tr style="background:${i % 2 ? '#faf8f5' : '#fff'}"><td style="padding:8px 10px;white-space:nowrap;color:#555"><span style="direction:ltr;unicode-bidi:isolate">${String(x.tx_date).slice(0, 10).split('-').reverse().join('/')}</span></td><td style="padding:8px 10px">${eaTxLabel(x)}${eaQty(x) ? `<div style="font-size:17px;color:#777">${eaQty(x)}</div>` : ''}</td><td style="padding:8px 10px;color:#555">${esc(x.branch || '—')}</td><td style="padding:8px 10px;text-align:left;font-weight:800;color:${plus ? green : red};white-space:nowrap"><span style="direction:ltr;unicode-bidi:isolate">${plus ? '+' : '−'}${eaN(Math.abs(eaC(x.amount)))}</span></td></tr>`; }).join('')}
    </table>` : '';
  return `<div style="width:1080px;background:#fff;font-family:Cairo,Tahoma,Arial,sans-serif;color:#262626;direction:rtl;padding:44px 52px 36px;box-sizing:border-box">
    <div style="display:flex;align-items:center;gap:22px;padding-bottom:18px;border-bottom:4px solid ${soft}">
      <img src="icons/ward.png" style="width:92px;height:92px;border-radius:50%">
      <div style="flex:1;text-align:center"><div style="font-size:23px;color:#888;font-weight:700">زهرة وورد</div>
        <div style="font-size:42px;font-weight:800;color:${brand};line-height:1.25">كشف حساب الموظف</div>
        <div style="font-size:32px;font-weight:800">${esc(e.name)}</div>
        <div style="font-size:21px;color:#777;margin-top:4px">${M.label}${e.emp_no ? ' · رقم ' + esc(e.emp_no) : ''}${e.branch ? ' · فرع ' + esc(e.branch) : ''}</div></div>
      <img src="icons/zahra.png" style="width:92px;height:92px;border-radius:50%">
    </div>
    <table style="width:100%;border-collapse:collapse;margin-top:22px;font-size:23px">${head('المستحقات والإضافات', green)}${earn}${tot('إجمالي المستحقات والإضافات', M.earn, M.earn < 0 ? red : green)}</table>
    <table style="width:100%;border-collapse:collapse;margin-top:18px;font-size:23px">${head('الخصومات والاستقطاعات', red)}${ded}${tot('إجمالي الخصومات والاستقطاعات', M.ded, red)}</table>
    <div style="margin-top:20px;border-radius:20px;background:${brand};color:#fff;padding:18px 22px;display:flex;justify-content:space-between;align-items:center">
      <span style="font-size:27px;font-weight:800">صافي حساب الشهر${M.proj ? ' (متوقع)' : ''}</span><span style="font-size:40px;font-weight:900">${f(M.net)} ج.م</span></div>
    ${L.paid ? `<div style="display:flex;gap:14px;margin-top:12px"><div style="flex:1;border-radius:16px;background:#faf7f2;padding:12px;text-align:center"><div style="font-size:20px;color:#666">اتصرف خلال الشهر</div><div style="font-size:30px;font-weight:800;color:${red}">${f(L.paid)} ج.م</div></div>
      <div style="flex:1;border-radius:16px;background:${soft};padding:12px;text-align:center"><div style="font-size:20px;color:#666">المتبقي</div><div style="font-size:30px;font-weight:800;color:${M.close < 0 ? red : green}">${f(M.close)} ج.م</div></div></div>` : ''}
    ${mv}
    <div style="display:flex;justify-content:space-between;margin-top:20px;font-size:19px;color:#888"><span>اتعمل يوم <span style="direction:ltr;unicode-bidi:isolate">${today().split('-').reverse().join('/')}</span></span><span style="color:${brand};font-weight:700">إدارة زهرة وورد</span></div>
  </div>`;
}
async function eaImage(id, key, detail){
  await loadScript('vendor/html2canvas.min.js');
  const box = document.createElement('div'); box.style.cssText = 'position:fixed;left:-20000px;top:0;z-index:-1'; document.body.appendChild(box);
  try{
    box.innerHTML = eaImageHTML(id, key, detail);
    await Promise.all([...box.querySelectorAll('img')].map(im => im.complete ? 0 : new Promise(r => { im.onload = im.onerror = r; })));
    if(document.fonts) await document.fonts.ready;
    const canvas = await html2canvas(box.firstElementChild, {scale:1, backgroundColor:'#ffffff', useCORS:true});
    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.92));
    const {M, e} = eaData(id, key);
    return {blob, w:canvas.width, h:canvas.height, name:`كشف حساب ${e.name} - ${M.label}`.replace(/[\\/:*?"<>|]/g, ' ')};
  } finally { box.remove(); }
}
// الـ PDF نفس الصورة بالظبط (نفس الأرقام) على صفحة واحدة
async function eaPdf(id, key, detail){
  const img = await eaImage(id, key, detail);
  await loadScript('vendor/pdf/pdfkit.standalone.js');
  if(typeof PDFDocument === 'undefined') throw new Error('مكتبة الـ PDF ما اتحمّلتش');
  const W = 595.28, H = Math.max(420, W * img.h / img.w);
  const doc = new PDFDocument({size:[W, H], margin:0, info:{Title:img.name, Author:'إدارة زهرة وورد'}});
  const chunks = []; doc.on('data', c => chunks.push(c)); const done = new Promise(r => doc.on('end', r));
  doc.image(await img.blob.arrayBuffer(), 0, 0, {width:W, height:H}); doc.end(); await done;
  return {blob:new Blob(chunks.map(c => c instanceof Uint8Array ? c : new Uint8Array(c)), {type:'application/pdf'}), name:img.name};
}
const eaPhone = e => { let p = String(e?.phone || '').replace(/\D/g, ''); if(p.startsWith('0')) p = '2' + p; return p; };
let eaOpt = {detail:false};
window.eaShare = (id, key, mode) => {
  const {M, e} = eaData(id, key), ph = eaPhone(e);
  openModal(`<h3>${mode === 'preview' ? 'كشف حساب' : 'إرسال كشف الحساب'} — ${esc(e.name)}</h3>
    <div class="hint" style="margin-bottom:8px">${M.label} · صافي الشهر ${eaM(M.net)}</div>
    <div class="seg" id="ea-kind" style="grid-template-columns:1fr 1fr;margin-bottom:10px"><button type="button" data-v="0" class="${eaOpt.detail ? '' : 'on'}">مختصر</button><button type="button" data-v="1" class="${eaOpt.detail ? 'on' : ''}">تفصيلي (بالحركات)</button></div>
    <div id="ea-prev" class="ea-prev"><div class="hint" style="text-align:center;padding:20px">بنجهّز المعاينة…</div></div>
    <div class="menu-list" style="margin-top:10px">
      <button onclick="eaSendText(${id},'${key}')">${I.wa}رسالة نصية${ph ? '' : ' <small>(مفيش رقم — هتختار الشات)</small>'}</button>
      <button onclick="eaSendFile(${id},'${key}','img')">${I.img}مشاركة كصورة</button>
      <button onclick="eaSendFile(${id},'${key}','pdf')">${I.doc}مشاركة كملف PDF</button>
    </div>
    <div class="hint" style="margin-top:8px">مفيش حاجة بتتبعت لوحدها — واتساب بيفتح والرسالة جاهزة وإنت اللي بتدوس إرسال.</div>`);
  const prev = async () => { const el = $('#ea-prev'); if(!el) return; el.innerHTML = '<div class="hint" style="text-align:center;padding:20px">بنجهّز المعاينة…</div>';
    try{ const im = await eaImage(id, key, eaOpt.detail); if(!$('#ea-prev')) return; const u = URL.createObjectURL(im.blob); $('#ea-prev').innerHTML = `<img src="${u}" alt="معاينة كشف الحساب">`; }
    catch(err){ console.error(err); if($('#ea-prev')) $('#ea-prev').innerHTML = '<div class="hint">مقدرتش أعمل المعاينة</div>'; } };
  document.querySelectorAll('#ea-kind button').forEach(b => b.onclick = () => { segPick(b); eaOpt.detail = b.dataset.v === '1'; prev(); });
  prev();
};
window.eaSendText = (id, key) => { const {e} = eaData(id, key), ph = eaPhone(e); window.open(`https://wa.me/${ph}?text=${encodeURIComponent(eaText(id, key, eaOpt.detail))}`, '_blank'); };
window.eaSendFile = async (id, key, kind) => {
  busy(true); let r;
  try{ r = kind === 'pdf' ? await eaPdf(id, key, eaOpt.detail) : await eaImage(id, key, eaOpt.detail); }
  catch(err){ console.error(err); busy(false); return toast('مقدرتش أعمل الملف', true); }
  busy(false);
  const file = new File([r.blob], r.name + (kind === 'pdf' ? '.pdf' : '.jpg'), {type:kind === 'pdf' ? 'application/pdf' : 'image/jpeg'});
  if(navigator.canShare && navigator.canShare({files:[file]})){
    try{ await navigator.share({files:[file], title:r.name}); buzz(15); return; } catch(err){ if(err.name === 'AbortError') return; }
  }
  download(file, file.name); toast('اتحفظ الملف — ارفقه في واتساب');
};
// الرابط القديم لكشف الحساب: نفتح صفحة الموظف والمعاينة
async function viewEmpStatement(id){ location.replace('#/emp/' + id); setTimeout(() => { const G = empLedger(id); if(G.entries.length) eaShare(id, G.entries[G.entries.length - 1].key, 'preview'); }, 400); }
