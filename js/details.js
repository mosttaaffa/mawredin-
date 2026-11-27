/* =================== شاشة تفاصيل العملية (دفعة / شيك / مرتجع / خصم / فاتورة) ===================
   وضع العرض بس (Read Only): مفيش أي حقل بيتعدل ولا صورة بتتمسح من هنا.
   «تعديل» بيفتح فورم العملية الأصلي على نفس الرقم (مفيش عملية جديدة)، و«إلغاء» بيرجع هنا من غير حفظ،
   و«حفظ التعديلات» بيحدّث نفس السجل ويرجع للتفاصيل. سجل التعديلات بيتسجل تلقائيًا (مين وإمتى وقبل/بعد). */

const DT_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const DT_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const longDate = d => { if(!d) return '—'; const [y, m, dd] = String(d).slice(0, 10).split('-').map(Number); const dt = new Date(y, m - 1, dd); return `${DT_DAYS[dt.getDay()]}، ${dd} ${DT_MONTHS[m - 1]} ${y}`; };
const stampAt = t => { if(!t) return '—'; const d = new Date(t); const h = d.getHours(), mm = String(d.getMinutes()).padStart(2, '0'); return `${dmyS(d)} - ${((h + 11) % 12) + 1}:${mm} ${h < 12 ? 'ص' : 'م'}`; };
const dmyS = d => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
const DT_PTYPE = {cash:'نقدي (كاش)', transfer:'تحويل بنكي', check:'شيك', return:'مرتجع بضاعة', discount:'خصم'};
const DT_FIELD = {amount:'المبلغ', pay_date:'التاريخ', inv_date:'التاريخ', method:'النوع', notes:'الملاحظات', invoice_id:'الفاتورة', check_no:'رقم الشيك', bank:'البنك',
  due_date:'تاريخ الاستحقاق', check_status:'حالة الشيك', supplier_id:'المورد', inv_no:'رقم الفاتورة', image_path:'الصور', extra_images:'الصور'};

// حالة العملية زي ما بتظهر في البطاقة
function payStatus(x){
  if(x.method === 'check'){ const i = checkInfo(x); return {t:CHK_PAY[i.pay] + (i.due && i.pay !== 'paid' ? ' · ' + CHK_DUE[i.due] : ''), k:i.pay === 'paid' ? 'ok' : (i.pay === 'bounced' || i.pay === 'cancelled' || i.pay === 'replaced') ? 'bad' : 'warn'}; }
  return {cash:{t:'تم الدفع', k:'ok'}, transfer:{t:'تم التحويل', k:'ok'}, return:{t:'تم الخصم من الحساب', k:'ok'}, discount:{t:'تم الخصم من الحساب', k:'ok'}}[x.method] || {t:'مسجلة', k:'ok'};
}
const heroIcon = m => m === 'transfer' ? `<span class="dt-art"><i class="a1">${I.bank}</i><i class="a2">${I.card || I.check}</i></span>`
  : `<span class="dt-art single"><i class="a1">${I[{cash:'cash', check:'check', return:'ret', discount:'ret', inv:'receipt'}[m] || 'cash']}</i></span>`;

// سجل التعديلات للعملية دي (من سجل النشاط اللي السيرفر بيكتبه لوحده)
function historyOf(entity, id){
  const rows = (store.log || []).filter(r => r.entity === entity && String(r.entity_id) === String(id)).sort((a, b) => a.id - b.id);
  return rows.map(r => {
    const o = r.old_row || {}, n = r.new_row || {};
    const ch = r.action === 'update' ? Object.keys(DT_FIELD).filter(k => JSON.stringify(o[k] ?? null) !== JSON.stringify(n[k] ?? null))
      .filter((k, i, a) => !(k === 'extra_images' && a.includes('image_path'))).map(k => {
        if(k === 'image_path' || k === 'extra_images'){ const a = rowPages(o).length, b = rowPages(n).length; return `الصور: ${a} ← ${b}`; }
        const f = v => v == null || v === '' ? '—' : k === 'amount' ? Number(v).toLocaleString('en-US') : k === 'method' ? (DT_PTYPE[v] || v) : k.endsWith('date') ? fmtDate(v) : k === 'check_status' ? (CHK[v] || v) : String(v);
        return `${DT_FIELD[k]}: ${f(o[k])} ← ${f(n[k])}`;
      }) : [];
    return {at:r.at, by:r.actor, a:r.action, ch};
  });
}

function detailRows(rows){
  return rows.filter(Boolean).map(([ic, k, v, cls]) => `<div class="dt-row"><span class="dt-ri">${I[ic] || I.doc}</span><span class="dt-k">${k}</span><span class="dt-v ${cls || ''}">${v}</span></div>`).join('');
}
// المرفقات: مصغرات بتتحمّل وقت ما تظهر، والضغط بيفتح الأصل بحجم الشاشة مع تكبير وتنقل
function attachCard(title, pages){
  return `<div class="card dt-att"><div class="dt-ah"><span>${I.clip || I.img}${title}</span><em>${I.img}${pages.length} ${pages.length === 1 ? 'صورة' : pages.length === 2 ? 'صورتين' : 'صور'}</em></div>
    ${pages.length ? `<div class="dt-grid">${pages.map((p, i) => `<button class="dt-th" data-p="${esc(p)}" onclick='viewImgZ(${JSON.stringify(p)}, ${JSON.stringify(pages)})' aria-label="صورة ${i + 1}"><span class="spin"></span><b>${i + 1}</b></button>`).join('')}</div>`
      : '<div class="hint" style="padding:6px 2px">مفيش مرفقات — تقدر تضيف من «تعديل»</div>'}</div>`;
}
async function fillThumbs(){
  const els = [...document.querySelectorAll('.dt-th[data-p]')];
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => { if(e.isIntersecting){ io.unobserve(e.target); load(e.target); } }), {rootMargin:'200px'}) : null;
  async function load(el){
    try{
      const u = await signedUrl(el.dataset.p);
      if(!u){ el.innerHTML = `<small>مش متاحة من غير نت</small><b>${el.querySelector('b')?.textContent || ''}</b>`; return; }
      const img = new Image(); img.decoding = 'async'; img.loading = 'lazy'; img.alt = '';
      img.onload = () => el.querySelector('.spin')?.remove(); img.src = u; el.prepend(img);
    }catch(e){ el.querySelector('.spin')?.remove(); }
  }
  els.forEach(el => io ? io.observe(el) : load(el));
}
// عارض بحجم الشاشة: تكبير وتصغير (بالصباعين أو الدبل كليك أو الأزرار) وتنقل بين الصور
window.viewImgZ = async (path, list) => {
  const pages = list && list.length ? list : [path]; let i = Math.max(0, pages.indexOf(path)), z = 1, tx = 0, ty = 0;
  const v = document.createElement('div'); v.className = 'viewer zv';
  const apply = () => { const im = v.querySelector('img'); if(im) im.style.transform = `translate(${tx}px,${ty}px) scale(${z})`; v.querySelector('.zv-z').textContent = Math.round(z * 100) + '%'; };
  const draw = async () => {
    z = 1; tx = ty = 0;
    v.innerHTML = `<div class="zv-stage"><div class="spin" style="margin:auto"></div></div>
      <div class="zv-top"><button class="iconbtn" data-x aria-label="قفل">${I.close}</button><b>${i + 1} / ${pages.length}</b></div>
      <div class="zv-bar">${pages.length > 1 ? `<button class="iconbtn" data-d="-1" aria-label="السابقة">${I.back}</button>` : ''}
        <button class="iconbtn" data-z="-1" aria-label="تصغير">−</button><span class="zv-z">100%</span><button class="iconbtn" data-z="1" aria-label="تكبير">+</button>
        ${pages.length > 1 ? `<button class="iconbtn" data-d="1" style="transform:scaleX(-1)" aria-label="التالية">${I.back}</button>` : ''}</div>`;
    v.querySelector('[data-x]').onclick = () => v.remove();
    v.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { i = (i + Number(b.dataset.d) + pages.length) % pages.length; draw(); });
    v.querySelectorAll('[data-z]').forEach(b => b.onclick = () => { z = Math.max(1, Math.min(5, z + Number(b.dataset.z) * .5)); if(z === 1) tx = ty = 0; apply(); });
    const u = await signedUrl(pages[i]); const st = v.querySelector('.zv-stage');
    st.innerHTML = u ? `<img src="${u}" alt="" draggable="false">` : '<div class="hint" style="color:#fff;margin:auto">الصورة مش متاحة من غير نت</div>';
    const im = st.querySelector('img'); if(im) im.ondblclick = () => { z = z > 1 ? 1 : 2.5; tx = ty = 0; apply(); };
    apply();
  };
  // لمس: صباعين = تكبير، صباع واحد = تحريك (لو مكبّر) أو سحب للصورة اللي بعدها
  let p0 = null, d0 = 0, z0 = 1, t0 = null;
  v.addEventListener('touchstart', e => { if(e.touches.length === 2){ d0 = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); z0 = z; } else { p0 = {x:e.touches[0].clientX, y:e.touches[0].clientY}; t0 = {tx, ty}; } }, {passive:true});
  v.addEventListener('touchmove', e => {
    if(e.touches.length === 2 && d0){ const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); z = Math.max(1, Math.min(5, z0 * d / d0)); apply(); e.preventDefault(); }
    else if(p0 && z > 1){ tx = t0.tx + e.touches[0].clientX - p0.x; ty = t0.ty + e.touches[0].clientY - p0.y; apply(); e.preventDefault(); }
  }, {passive:false});
  v.addEventListener('touchend', e => {
    if(p0 && z === 1 && pages.length > 1 && e.changedTouches.length){ const dx = e.changedTouches[0].clientX - p0.x; if(Math.abs(dx) > 60){ i = (i + (dx < 0 ? 1 : -1) + pages.length) % pages.length; draw(); } }
    if(e.touches.length === 0){ p0 = null; d0 = 0; if(z === 1){ tx = ty = 0; apply(); } }
  });
  document.body.appendChild(v); await draw();
};
function historyCard(h){
  if(!h.length) return '';
  return `<details class="card dt-hist"><summary>${I.hist}سجل التعديلات (${h.length})</summary>
    ${h.slice().reverse().map(r => `<div class="dt-h"><b>${r.a === 'insert' ? 'اتسجلت' : r.a === 'update' ? 'اتعدلت' : 'اتمسحت'} · ${esc(who(r.by))}</b><small>${stampAt(r.at)}</small>
      ${r.ch.map(c => `<div class="dt-hc">${esc(c)}</div>`).join('')}</div>`).join('')}</details>`;
}
function dtShell(title, body, actions, menu){
  shell({title, back:true, right:`<button class="iconbtn" onclick="${menu}" aria-label="خيارات">${I.dots}</button>`, body:`<div class="dt">${body}</div>`});
  $('#app').insertAdjacentHTML('beforeend', `<div class="dt-acts">${actions}</div>`);   // برة main عشان يفضل ثابت تحت
  fillThumbs();
}

/* ---------- تفاصيل الدفعة / الشيك / المرتجع / الخصم ---------- */
async function viewPayDetails(id){
  const x = store.eff.payments.get(id) || store.eff.payments.get(Number(id));
  if(!x){ shell({title:'تفاصيل الدفعة', back:true, body:`<div class="card empty">${I.doc}<div>الدفعة دي مش موجودة (ممكن تكون اتمسحت)</div></div>`}); return; }
  const s = store.eff.suppliers.get(x.supplier_id), inv = x.invoice_id ? store.eff.invoices.get(x.invoice_id) : null;
  const adj = IS_ADJ(x.method), st = payStatus(x), pages = rowPages(x);
  const title = adj ? `تفاصيل ${x.method === 'return' ? 'المرتجع' : 'الخصم'}` : x.method === 'check' ? 'تفاصيل الشيك' : 'تفاصيل الدفعة';
  const body = `
    <div class="dt-hero">
      <span class="dt-st ${st.k}">${st.k === 'ok' ? I.okc : st.k === 'bad' ? I.warn : I.clock}${esc(st.t)}</span>
      <span class="dt-l">${adj ? 'قيمة ' + (x.method === 'return' ? 'المرتجع' : 'الخصم') : x.method === 'check' ? 'قيمة الشيك' : 'قيمة الدفعة'}</span>
      <span class="dt-amt"><span class="num">${Number(x.amount).toLocaleString('en-US', {maximumFractionDigits:0})}</span> ج.م</span>
      <span class="dt-d">${I.cal}${longDate(x.pay_date)}</span>
      ${heroIcon(x.method)}
      ${x._pending ? `<span class="dt-sync">${I.refresh}محفوظة على الجهاز — هتتزامن لما النت يرجع</span>` : ''}
    </div>
    <div class="card dt-info">${detailRows([
      ['store', 'المورد', `<a onclick="go('/s/${x.supplier_id}')">${esc(s?.name || '—')}</a>`],
      ['transfer', adj ? 'النوع' : 'نوع الدفعة', DT_PTYPE[x.method] || x.method],
      ['doc', 'عن فاتورة', inv ? `${inv.inv_no ? 'رقم ' + esc(inv.inv_no) : 'بتاريخ ' + fmtDate(inv.inv_date)} · <span class="num">${Number(inv.amount).toLocaleString('en-US')}</span>` : 'على الحساب'],
      x.method === 'check' && ['check', 'رقم الشيك', `<span class="num">${esc(x.check_no || '—')}</span>`],
      x.method === 'check' && ['bank', 'البنك', esc(x.bank || '—')],
      x.method === 'check' && ['cal', 'تاريخ الاستحقاق', fmtDate(x.due_date)],
      x.notes && ['edit', 'ملاحظات', esc(x.notes)],
      ['user', 'سجّلها', esc(who(x.created_by))],
      ['clock', 'تاريخ ووقت التسجيل', `<span class="num">${stampAt(x.created_at)}</span>`, 'sm'],
    ])}</div>
    ${x.method === 'check' ? '<div class="card"><div id="chkpanel"></div></div>' : ''}
    ${x.method === 'cash' && !pages.length ? '' : attachCard(x.method === 'transfer' ? 'مرفقات التحويل' : x.method === 'check' ? 'صور الشيك' : adj ? 'صور الإذن / الإيصال' : 'المرفقات', pages)}
    ${historyCard(historyOf('payments', x.id))}`;
  const label = adj ? (x.method === 'return' ? 'المرتجع' : 'الخصم') : x.method === 'check' ? 'الشيك' : 'الدفعة';
  dtShell(title, body, `<button class="btn primary" onclick="go('/${adj ? 'adjust' : 'payment'}/${x.id}?from=d')">${I.edit}تعديل ${label}</button>
    <button class="btn danger dt-del" onclick="delPayDetails(${x.id})">${I.trash || I.close}حذف ${label}</button>`, `payMenu(${x.id})`);
  if(x.method === 'check') drawCheckPanel(x.id, `viewPayDetails(${x.id})`);
}
window.payMenu = id => { const x = store.eff.payments.get(id); openModal(`<h3>خيارات</h3><div class="menu-list">
  <button onclick="closeModal();go('/s/${x.supplier_id}')">${I.box}فتح حساب المورد</button>
  <button onclick="closeModal();go('/stmt/${x.supplier_id}')">${I.doc}كشف حساب المورد</button>
  ${x.method === 'check' ? `<button onclick="closeModal();checkPdf(${x.id})">${I.doc}سجل سداد الشيك PDF</button>` : ''}</div>`); };
window.delPayDetails = id => {
  const x = store.eff.payments.get(id), s = store.eff.suppliers.get(x.supplier_id);
  if(x.method === 'check' && checkPays(x.id).length) return toast('الشيك ده ليه سجل سداد — مينفعش يتمسح. لو اتلغى علّمه «ملغي» من تفاصيل الشيك', true);
  const label = IS_ADJ(x.method) ? (x.method === 'return' ? 'المرتجع' : 'الخصم') : 'الدفعة';
  const after = supBalance(x.supplier_id) + payEffect(x) / 100;
  openModal(`<h3>حذف ${label}؟</h3>
    <div class="kv"><span>المورد</span><b>${esc(s?.name || '')}</b></div>
    <div class="kv"><span>المبلغ</span><b>${money(x.amount)}</b></div>
    <div class="kv"><span>التاريخ</span><span>${fmtDate(x.pay_date)}</span></div>
    <div class="kv"><span>رصيد المورد بعد الحذف</span><b class="${after > 0 ? 'neg-v' : 'pos-v'}">${money(Math.abs(after))}${after < 0 ? ' لصالح المحل' : ''}</b></div>
    <div class="hint" style="margin:8px 0 12px">الحذف بيتسجل في سجل التعديلات بالبيانات القديمة.</div>
    <div class="actions"><button class="btn danger" id="dt-del-ok">${I.trash || ''}تأكيد الحذف</button><button class="btn ghost" onclick="closeModal()">إلغاء</button></div>`);
  $('#dt-del-ok').onclick = async () => {
    busy(true);
    try{ await q(ldb.from('payments').delete().eq('id', id)); for(const p of rowPages(x)) await removeImage(p);
      busy(false); closeModal(); toast(`اتحذفت ${label}`); location.replace('#/s/' + x.supplier_id); }
    catch(e){ toast(errMsg(e), true); } finally{ busy(false); }
  };
};

/* ---------- تفاصيل الفاتورة (نفس المكونات) ---------- */
async function viewInvDetails(id){
  const x = store.eff.invoices.get(id) || store.eff.invoices.get(Number(id));
  if(!x){ shell({title:'تفاصيل الفاتورة', back:true, body:`<div class="card empty">${I.doc}<div>الفاتورة دي مش موجودة (ممكن تكون اتمسحت)</div></div>`}); return; }
  const s = store.eff.suppliers.get(x.supplier_id), pages = rowPages(x);
  const invs = [...store.eff.invoices.values()].filter(r => r.supplier_id === x.supplier_id), pays = [...store.eff.payments.values()].filter(r => r.supplier_id === x.supplier_id);
  const a = allocate(invs, pays).get(x.id) || {status:'open', rem:Number(x.amount)};
  const st = {paid:{t:'مسددة بالكامل', k:'ok'}, partial:{t:`مسددة جزئيًا · باقي ${Number(a.rem).toLocaleString('en-US')}`, k:'warn'}, open:{t:'غير مسددة', k:'bad'}}[a.status] || {t:INV_ST[a.status] || '', k:'warn'};
  const body = `
    <div class="dt-hero">
      <span class="dt-st ${st.k}">${st.k === 'ok' ? I.okc : st.k === 'bad' ? I.warn : I.clock}${esc(st.t)}</span>
      <span class="dt-l">قيمة الفاتورة</span>
      <span class="dt-amt"><span class="num">${Number(x.amount).toLocaleString('en-US', {maximumFractionDigits:0})}</span> ج.م</span>
      <span class="dt-d">${I.cal}${longDate(x.inv_date)}</span>
      ${heroIcon('inv')}
      ${x._pending ? `<span class="dt-sync">${I.refresh}محفوظة على الجهاز — هتتزامن لما النت يرجع</span>` : ''}
    </div>
    <div class="card dt-info">${detailRows([
      ['store', 'المورد', `<a onclick="go('/s/${x.supplier_id}')">${esc(s?.name || '—')}</a>`],
      ['doc', 'رقم الفاتورة', `<span class="num">${esc(x.inv_no || '—')}</span>`],
      ['coins', 'المسدد منها', `<span class="num">${(Number(x.amount) - Number(a.rem || 0)).toLocaleString('en-US')}</span>`],
      ['warn', 'الباقي', `<span class="num">${Number(a.rem || 0).toLocaleString('en-US')}</span>`, a.rem > 0 ? 'neg' : 'pos'],
      x.notes && ['edit', 'ملاحظات', esc(x.notes)],
      ['user', 'سجّلها', esc(who(x.created_by))],
      ['clock', 'تاريخ ووقت التسجيل', `<span class="num">${stampAt(x.created_at)}</span>`, 'sm'],
    ])}</div>
    ${attachCard('صور الفاتورة', pages)}
    ${historyCard(historyOf('invoices', x.id))}`;
  dtShell('تفاصيل الفاتورة', body, `<button class="btn primary" onclick="go('/invoice/${x.id}?from=d')">${I.edit}تعديل الفاتورة</button>
    <button class="btn danger dt-del" onclick="delInvDetails(${x.id})">${I.trash || I.close}حذف الفاتورة</button>`, `go('/s/${x.supplier_id}')`);
}
window.delInvDetails = id => {
  const x = store.eff.invoices.get(id), s = store.eff.suppliers.get(x.supplier_id);
  const after = supBalance(x.supplier_id) - Number(x.amount);
  openModal(`<h3>حذف الفاتورة؟</h3>
    <div class="kv"><span>المورد</span><b>${esc(s?.name || '')}</b></div>
    <div class="kv"><span>المبلغ</span><b>${money(x.amount)}</b></div>
    <div class="kv"><span>رصيد المورد بعد الحذف</span><b>${money(Math.abs(after))}${after < 0 ? ' لصالح المحل' : ''}</b></div>
    <div class="hint" style="margin:8px 0 12px">الدفعات المربوطة بالفاتورة هتفضل محسوبة على الحساب.</div>
    <div class="actions"><button class="btn danger" id="dt-del-ok">تأكيد الحذف</button><button class="btn ghost" onclick="closeModal()">إلغاء</button></div>`);
  $('#dt-del-ok').onclick = async () => {
    busy(true);
    try{ await q(ldb.from('invoices').delete().eq('id', id)); for(const p of rowPages(x)) await removeImage(p);
      busy(false); closeModal(); toast('اتحذفت الفاتورة'); location.replace('#/s/' + x.supplier_id); }
    catch(e){ toast(errMsg(e), true); } finally{ busy(false); }
  };
};
// الأسماء القديمة بتفتح الشاشة الجديدة
window.showPayment = id => go('/pay/' + id);
window.showInvoice = id => go('/inv/' + id);
window.showCheck = id => go('/pay/' + id);
