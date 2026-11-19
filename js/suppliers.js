/* الموردين: الرئيسية، صفحة المورد، الفواتير والدفعات والمرتجعات، قراءة المبلغ من الصورة */
/* =================== تبويب الموردين =================== */
const waNum = p => { let d = String(p || '').replace(/[٠-٩]/g, x => '٠١٢٣٤٥٦٧٨٩'.indexOf(x)).replace(/\D/g, ''); if(d.startsWith('00')) d = d.slice(2); else if(d.startsWith('0')) d = '20' + d.slice(1); return d; };
let supSort = 'bal', supFilter = 'all', supQ = '';
// بطاقة مورد مالية (قابلة لإعادة الاستخدام): كل الإجماليات ظاهرة من غير ما تفتح الحساب
function supCard(r){
  const bal = Number(r.balance), adj = Number(r.total_adjust || 0);
  return `<div class="scard ${bal > 0 ? 'owe' : bal < 0 ? 'cred' : 'zero'}" data-n="${esc(r.name.toLowerCase())}" onclick="go('/s/${r.id}')">
    <div class="sc-top">
      <div class="sc-av"><img src="icons/3d/suppliers.webp" alt="" loading="lazy" decoding="async"><b>${esc(r.name.trim()[0] || '؟')}</b></div>
      <div class="sc-name"><div class="t">${esc(r.name)}${r.pend_ops ? `<span class="tag pend-sync" title="عمليات على الجهاز لسه متزامنتش">${I.refresh}${r.pend_ops}</span>` : ''}</div>
        <div class="s">آخر حركة ${r.last_activity ? fmtDate(r.last_activity) : '—'}</div></div>
      <div class="sc-bal"><span>${bal < 0 ? 'ليك عنده' : bal > 0 ? 'المستحق له' : 'الحساب'}</span><b>${bal === 0 ? 'خالص' : money(Math.abs(bal))}</b></div>
    </div>
    <div class="sc-grid">
      <div><span>الفواتير (${r.inv_n || 0})</span><b class="c-inv">${money(r.total_invoices)}</b></div>
      <div><span>المدفوع (${r.pay_n || 0})</span><b class="c-pay">${money(r.total_paid)}</b></div>
      ${adj ? `<div><span>مرتجعات وخصومات (${r.adj_n || 0})</span><b class="c-adj">${money(adj)}</b></div>` : ''}
      ${Number(r.pending_checks) ? `<div><span>شيكات لسه</span><b class="c-chk">${money(r.pending_checks)}</b></div>` : ''}
    </div>
    <div class="sc-acts">
      <button class="btn ghost" onclick="event.stopPropagation();go('/stmt/${r.id}')">${I.doc}كشف الحساب</button>
      <button class="btn ghost" onclick="event.stopPropagation();go('/invoice?s=${r.id}')">${I.receipt}فاتورة</button>
      <button class="btn ghost" onclick="event.stopPropagation();go('/payment?s=${r.id}')">${I.cash}دفعة</button>
    </div>
  </div>`;
}
async function viewSuppliers(){
  if(!$('#suplist')) shell({title:'الموردين', right:refreshBtn, nav:'suppliers', body:skeleton('home')});
  const [rows, cs] = await Promise.all([api.balances(), api.checkSummary()]);
  const checks = soonToChecks(cs); notifyChecks(checks);
  const N = v => Number(v || 0), cents = v => Math.round(N(v) * 100);
  const owed = rows.reduce((a, r) => a + Math.max(0, cents(r.balance)), 0) / 100;
  const credit = rows.reduce((a, r) => a + Math.min(0, cents(r.balance)), 0) / 100;
  const tInv = rows.reduce((a, r) => a + cents(r.total_invoices), 0) / 100;
  const tPaid = rows.reduce((a, r) => a + cents(r.total_paid), 0) / 100;
  const tAdj = rows.reduce((a, r) => a + cents(r.total_adjust), 0) / 100;
  const next = cs.next;
  let list = rows.filter(r => supFilter === 'all' || (supFilter === 'due' ? N(r.balance) !== 0 : N(r.balance) === 0));
  list.sort(supSort === 'recent' ? (a, b) => String(b.last_activity || '').localeCompare(String(a.last_activity || '')) || b.id - a.id
          : supSort === 'name' ? (a, b) => a.name.localeCompare(b.name, 'ar') : (a, b) => N(b.balance) - N(a.balance) || a.id - b.id);
  const chip = (v, l, cur, fn) => `<button class="chip ${cur === v ? 'on' : ''}" onclick="${fn}='${v}';viewSuppliers()">${l}</button>`;
  const body = `
    <div class="card hero sup-hero">
      <div class="lbl">إجمالي المستحق للموردين</div>
      <div class="big">${money(owed)}</div>
      ${credit ? `<div class="lbl" style="margin-top:-2px">وليك عند موردين ${money(Math.abs(credit))}</div>` : ''}
      <div class="sum6">
        <div><span>إجمالي الفواتير</span><b>${money(tInv)}</b></div>
        <div><span>إجمالي المدفوع</span><b>${money(tPaid)}</b></div>
        <div><span>عدد الموردين</span><b>${rows.length}</b></div>
        ${tAdj ? `<div><span>مرتجعات وخصومات</span><b>${money(tAdj)}</b></div>` : ''}
        <div onclick="go('/checks')" style="cursor:pointer"><span>شيكات مستحقة (${N(cs.n)})</span><b>${money(cs.sum)}</b></div>
        <div onclick="go('/checks')" style="cursor:pointer"><span>أقرب شيك</span><b>${next ? fmtDate(next.due_date) : '—'}</b><small>${next ? esc(next.name) + ' · ' + money(next.amount) : 'مفيش'}</small></div>
      </div>
    </div>
    <div class="sup-tools">
      <input class="search" id="srch" placeholder="ابحث باسم المورد..." value="${esc(supQ)}" oninput="supQ=this.value;filterSup(this.value)">
      <button class="btn ghost" onclick="go('/supplier')">${I.plus}مورد</button>
    </div>
    <div class="chip-row">
      ${chip('bal', 'أكبر رصيد', supSort, 'supSort')}${chip('recent', 'أحدث حركة', supSort, 'supSort')}${chip('name', 'الاسم', supSort, 'supSort')}
      <span class="chip-sep"></span>
      ${chip('all', 'الكل', supFilter, 'supFilter')}${chip('due', 'ليهم رصيد', supFilter, 'supFilter')}${chip('zero', 'رصيد صفر', supFilter, 'supFilter')}
    </div>
    <div id="suplist">
      ${rows.length ? (list.length ? list.map(supCard).join('') : `<div class="card empty">${I.box}<div>مفيش موردين في الفلتر ده</div></div>`) :
        `<div class="card empty">${I.box}<div>لسه مفيش موردين</div><button class="btn primary" style="margin-top:12px" onclick="go('/supplier')">${I.plus}أضف أول مورد</button></div>`}
      <div class="card empty" id="nores" style="display:none">${I.box}<div>مفيش مورد بالاسم ده</div></div>
    </div>`;
  shell({title:'الموردين', right:refreshBtn, nav:'suppliers', body, fabs: rows.length ? quickFabs() : ''});
  if(supQ) filterSup(supQ);
}
window.filterSup = v => {
  v = v.trim().toLowerCase(); let n = 0;
  document.querySelectorAll('#suplist .scard').forEach(el => { const ok = el.dataset.n.includes(v); el.style.display = ok ? '' : 'none'; n += ok; });
  const e = $('#nores'); if(e) e.style.display = n || !document.querySelector('#suplist .scard') ? 'none' : '';
};

/* =================== صفحة المورد =================== */
async function viewSupplier(id){
  if(!window._sup || window._sup.s.id !== id || !$('.bal3')) shell({title:'...', back:true, body:skeleton('sup')});
  const [s, invs, pays] = await Promise.all([api.supplier(id), api.invoices(id), api.payments(id)]);
  const t = tab[id] || 'ledger';
  const alloc = allocate(invs, pays);
  const invNo = new Map(invs.map(i => [i.id, i.inv_no || ('بتاريخ ' + String(i.inv_date).slice(0,10))]));

  // كشف حساب برصيد تراكمي
  const ev = [
    ...invs.map(x => ({k:'inv', d:x.inv_date, c:x.created_at, x})),
    ...pays.map(x => ({k:'pay', d:x.pay_date, c:x.created_at, x})),
  ].sort((a,b) => a.d===b.d ? (a.c<b.c?-1:1) : (a.d<b.d?-1:1));
  let run = 0;
  ev.forEach(e => {
    const bounced = e.k==='pay' && e.x.check_status==='bounced';
    if(e.k==='inv') run += Number(e.x.amount); else if(!bounced) run -= Number(e.x.amount);
    e.run = run;
  });
  ev.reverse();
  const runOf = new Map(ev.map(e => [e.k + e.x.id, e.run]));   // الرصيد بعد كل حركة (في كل التبويبات)
  const syncTag = x => x._pending ? `<span class="tag pend-sync">${I.refresh}على الجهاز</span>` : '';

  const invRow = (x, runbal) => { const a = alloc.get(x.id); return `
    <div class="item" onclick="showInvoice(${x.id})">
      <div class="ico inv">${I.receipt}</div>
      <div class="grow"><div class="t">فاتورة ${x.inv_no?'رقم <span class="num">'+esc(x.inv_no)+'</span>':''}<span class="tag ${a.status}">${INV_ST[a.status]}</span>${syncTag(x)}</div>
        <div class="s">${fmtDate(x.inv_date)} ${a.status==='partial'?`· <span class="inv-left">باقي ${money(a.rem)}</span>`:''} ${x.notes?'· '+esc(x.notes):''}</div></div>
      <div><div class="amt" style="color:var(--blue)">+ ${money(x.amount)}</div>${runbal!=null?`<div class="runbal">الرصيد ${money(runbal)}</div>`:''}</div>
    </div>`; };
  const payRow = (x, runbal) => {
    const b = x.check_status==='bounced', adj = IS_ADJ(x.method);
    return `
    <div class="item" onclick="showPayment(${x.id})">
      <div class="ico ${b?'bounced':adj?'adj':'pay'}">${x.method==='check'?I.check:x.method==='transfer'?I.transfer:x.method==='return'?I.ret:x.method==='discount'?I.disc:I.cash}</div>
      <div class="grow"><div class="t">${adj ? METHOD[x.method] : 'دفعة'} ${adj?'':`<span class="tag ${x.method}">${METHOD[x.method]}</span>`}${x.method==='check'?`<span class="tag ${x.check_status}">${CHK[x.check_status]}</span>`:''}${syncTag(x)}</div>
        <div class="s">${fmtDate(x.pay_date)}${x.method==='check'?' · يستحق '+fmtDate(x.due_date):''}${x.invoice_id && invNo.has(x.invoice_id)?' · عن فاتورة '+esc(invNo.get(x.invoice_id)):''}</div></div>
      <div><div class="amt pay ${b?'struck':''}">− ${money(x.amount)}</div>${runbal!=null?`<div class="runbal">الرصيد ${money(runbal)}</div>`:''}</div>
    </div>`;
  };

  // بنعرض 100 حركة الأول والباقي بزرار (عشان الصفحة تفضل سريعة حتى مع آلاف الحركات)
  const src = t==='ledger' ? ev.map(e => () => e.k==='inv' ? invRow(e.x, e.run) : payRow(e.x, e.run))
            : t==='inv' ? invs.map(x => () => invRow(x, runOf.get('inv' + x.id))) : pays.map(x => () => payRow(x, runOf.get('pay' + x.id)));
  const shown = Math.min(src.length, (ledgerShown[id+t] || 100));
  let list = src.slice(0, shown).map(f => f()).join('');
  if(shown < src.length) list += `<div style="padding:10px 0 2px"><button class="btn ghost block" onclick="ledgerShown['${id+t}']=${shown + 200};viewSupplier(${id})">عرض أقدم (باقي ${src.length - shown})</button></div>`;
  if(!list) list = `<div class="empty">${I.box}<div>مفيش حركات لسه</div></div>`;

  window._sup = {s, invs, pays};
  const bal = Number(s.balance);
  const unpaidN = [...alloc.values()].filter(v => v.status !== 'paid').length;
  shell({
    title: esc(s.name), back:true,
    right: `<button class="iconbtn" onclick="go('/supplier/${id}')" aria-label="تعديل">${I.edit}</button>${refreshBtn}`,
    body: `
      <div class="card sticky-bal">
        <div class="bal3">
          <div class="a"><span>الفواتير</span><b>${money(s.total_invoices)}</b></div>
          <div class="b"><span>المدفوع</span><b>${money(s.total_paid)}</b></div>
          <div class="c ${bal<=0?'zero':''}"><span>${bal<0?'ليك عنده':'الباقي عليك'}</span><b>${money(Math.abs(bal))}</b></div>
        </div>
        ${Number(s.total_adjust)>0 ? `<div class="note-line adj">مرتجعات وخصومات اتخصمت من الحساب: ${money(s.total_adjust)}</div>`:''}
        ${Number(s.pending_checks)>0 ? `<div class="note-line">منهم شيكات لسه ما اتصرفتش بـ ${money(s.pending_checks)}</div>`:''}
        <div class="sup-meta"><span>${s.inv_n || 0} فاتورة</span><span>${s.pay_n || 0} دفعة</span>${s.adj_n ? `<span>${s.adj_n} مرتجع/خصم</span>` : ''}<span>آخر حركة ${s.last_activity ? fmtDate(s.last_activity) : '—'}</span></div>
      </div>
      <div class="actions" style="margin-bottom:8px">
        <button class="btn primary" onclick="go('/invoice?s=${id}')">${I.receipt}فاتورة جديدة</button>
        <button class="btn green" onclick="go('/payment?s=${id}')">${I.cash}دفعة جديدة</button>
      </div>
      <div class="actions sm" style="margin-bottom:12px">
        <button class="btn ghost" onclick="go('/adjust?s=${id}')">${I.ret}مرتجع / خصم</button>
        <button class="btn ghost" onclick="go('/statement/${id}')">${I.wa}كشف سريع واتساب</button>
      </div>
      <div class="actions" style="margin-bottom:12px">
        <button class="btn primary" style="background:linear-gradient(160deg,#1f3d66,#10243D);color:#FFD780;border:1px solid rgba(217,164,65,.5)" onclick="go('/stmt/${id}')">${I.doc}إصدار كشف حساب PDF</button>
      </div>
      <div class="tabs">
        <button class="${t==='ledger'?'on':''}" onclick="setTab(${id},'ledger')">كشف حساب</button>
        <button class="${t==='inv'?'on':''}" onclick="setTab(${id},'inv')">الفواتير (${invs.length})${unpaidN?` <span class="tag unpaid" style="margin:0">${unpaidN}</span>`:''}</button>
        <button class="${t==='pay'?'on':''}" onclick="setTab(${id},'pay')">الدفعات (${pays.length})</button>
      </div>
      <div class="card list led">${list}</div>
      <div class="card sup-contact">
        <div class="section-t">بيانات التواصل</div>
        ${s.phone ? `<div class="kv"><span>التليفون</span><span class="num">${esc(s.phone)}</span></div>
          <div class="actions sm" style="margin-top:8px"><a class="btn ghost" href="tel:${esc(s.phone)}">${I.phone || ''}اتصال</a><a class="btn ghost" href="https://wa.me/${esc(waNum(s.phone))}" target="_blank" rel="noopener">${I.wa}واتساب</a></div>`
          : `<div class="hint">مفيش تليفون متسجل — <a class="link" href="#/supplier/${id}">ضيف رقم</a></div>`}
        ${s.notes ? `<div class="kv" style="border:0"><span>ملاحظات</span><span>${esc(s.notes)}</span></div>` : ''}
      </div>
    `
  });
}
window.setTab = (id, t) => { tab[id] = t; viewSupplier(id); };

/* =================== تفاصيل فاتورة / دفعة =================== */
function openModal(html){
  closeModal();
  const b = document.createElement('div'); b.className = 'backdrop'; b.id = 'mdl';
  b.innerHTML = `<div class="modal">${html}</div>`;
  b.addEventListener('click', e => { if(e.target === b) closeModal(); });
  document.body.appendChild(b);
}
function closeModal(){ $('#mdl')?.remove(); $('.viewer')?.remove(); }
// عارض الصور: لو الفاتورة أكتر من صفحة بتقلّب بينهم (أسهم أو سحب بالصباع)
window.viewImg = async (path, list) => {
  const pages = (list && list.length ? list : [path]);
  let i = Math.max(0, pages.indexOf(path));
  const v = document.createElement('div'); v.className = 'viewer';
  const draw = async () => {
    const u = await signedUrl(pages[i]);
    v.innerHTML = `${u ? `<img src="${u}" alt="">` : '<div class="hint" style="color:#fff">الصورة مش متاحة من غير نت</div>'}
      <button class="iconbtn" onclick="this.parentNode.remove()">${I.close}</button>
      ${pages.length > 1 ? `<div class="vw-nav"><button class="iconbtn" data-d="-1">${I.back}</button><b>صفحة ${i + 1} من ${pages.length}</b><button class="iconbtn" data-d="1" style="transform:scaleX(-1)">${I.back}</button></div>` : ''}`;
    v.querySelectorAll('[data-d]').forEach(b => b.onclick = e => { e.stopPropagation(); i = (i + Number(b.dataset.d) + pages.length) % pages.length; draw(); });
  };
  let x0 = null;
  v.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, {passive:true});
  v.addEventListener('touchend', e => { if(x0 == null || pages.length < 2) return; const dx = e.changedTouches[0].clientX - x0; if(Math.abs(dx) > 50){ i = (i + (dx < 0 ? 1 : -1) + pages.length) % pages.length; draw(); } x0 = null; });
  document.body.appendChild(v); await draw();
};
const invPages = x => [x.image_path, ...(x.extra_images || [])].filter(Boolean);
// قسم الصورة في التفاصيل: عرض + تغيير + مسح
const IMG_REQUIRED = () => false;   // مسح أي صورة مسموح (الصورة مطلوبة وقت التسجيل بس)
function imgSection(table, x){
  return `<div id="mimg">${x.image_path ? '<div class="spin" style="margin:16px auto"></div>' : '<div class="hint" style="margin:10px 0">مفيش صورة</div>'}</div>
    <div class="img-acts">
      <button onclick="$('#imgpick').click()">${I.camera}${x.image_path ? 'تغيير الصورة' : 'إضافة صورة'}</button>
      ${x.image_path ? `<button class="del" onclick="delImage('${table}',${x.id})">${I.close}مسح الصورة</button>` : ''}
    </div>
    <input type="file" id="imgpick" accept="image/*" hidden onchange="changeImage('${table}',${x.id})">`;
}
async function afterImage(table, id, sid){
  closeModal();
  if(location.hash.startsWith('#/checks')){ await viewChecks(); return showCheck(id); }
  await viewSupplier(sid);
  return table === 'invoices' ? showInvoice(id) : showPayment(id);
}
window.changeImage = async (table, id) => {
  const f = $('#imgpick').files[0]; if(!f) return;
  busy(true);
  try{
    const row = await q(ldb.from(table).select('id,image_path,supplier_id' + (table === 'payments' ? ',method' : '')).eq('id', id).single());
    const folder = table === 'invoices' ? 'invoices' : row.method === 'check' ? 'checks' : row.method === 'transfer' ? 'transfers' : 'returns';
    const path = await uploadImage(f, folder);
    await q(ldb.from(table).update({image_path: path}).eq('id', id));
    if(row.image_path){ removeImage(row.image_path); urlCache.delete(row.image_path); }
    busy(false); toast('اتغيّرت الصورة ✓'); buzz(12);
    await afterImage(table, id, row.supplier_id);
  }catch(e){ toast(errMsg(e), true); } finally{ busy(false); }
};
window.delImage = async (table, id) => {
  const row = await q(ldb.from(table).select('id,image_path,supplier_id' + (table === 'payments' ? ',method' : '')).eq('id', id).single());
  if(IMG_REQUIRED(table, row)) return toast(table === 'invoices' ? 'صورة الفاتورة لازم تفضل موجودة — تقدر تغيّرها بس' : 'سكرين شوت التحويل لازم يفضل موجود — تقدر تغيّره بس', true);
  if(!confirm(table === 'invoices' ? 'تمسح صورة الفاتورة؟ مش هتقدر ترجّعها.' : 'تمسح الصورة؟ مش هتقدر ترجّعها.')) return;
  busy(true);
  try{
    await q(ldb.from(table).update({image_path: null}).eq('id', id));
    if(row.image_path){ await removeImage(row.image_path); urlCache.delete(row.image_path); }
    busy(false); toast('اتمسحت الصورة');
    await afterImage(table, id, row.supplier_id);
  }catch(e){ toast(errMsg(e), true); } finally{ busy(false); }
};
async function imgBlock(path){
  if(!path) return '';
  const u = await signedUrl(path);
  return u ? `<img class="thumb" src="${u}" onclick="viewImg('${esc(path)}')" alt="صورة">` : '<div class="hint">الصورة مش متاحة</div>';
}

window.showInvoice = async id => {
  const x = window._sup.invs.find(i => i.id === id);
  openModal(`<h3>فاتورة ${x.inv_no ? 'رقم '+esc(x.inv_no) : ''}</h3>
    <div class="kv"><span>المورد</span><span>${esc(window._sup.s.name)}</span></div>
    <div class="kv"><span>المبلغ</span><span>${money(x.amount)}</span></div>
    ${(() => { const a = allocate(window._sup.invs, window._sup.pays).get(x.id); return `<div class="kv"><span>الحالة</span><span><span class="tag ${a.status}">${INV_ST[a.status]}</span>${a.status!=='paid'?` باقي ${money(a.rem)}`:''}</span></div>`; })()}
    <div class="kv"><span>التاريخ</span><span>${fmtDate(x.inv_date)}</span></div>
    ${x.notes?`<div class="kv"><span>ملاحظات</span><span>${esc(x.notes)}</span></div>`:''}
    <div class="kv"><span>سجّلها</span><span>${esc(who(x.created_by))}${x.created_at ? ' · ' + fmtDateTime(x.created_at) : ''}</span></div>
    <div class="section-t" style="margin-top:10px">صور الفاتورة (${invPages(x).length} ${invPages(x).length === 1 ? 'صفحة' : 'صفحات'})</div>
    <div class="pg-grid" id="mimg">${invPages(x).map(() => '<div class="pg"><div class="spin" style="margin:30px auto"></div></div>').join('') || '<div class="hint">مفيش صور</div>'}</div>
    <div class="img-acts">
      <button onclick="$('#imgpick').click()">${I.camera}إضافة صفحة</button>
    </div>
    <input type="file" id="imgpick" accept="image/*" multiple hidden onchange="addInvPages(${x.id})">
    <div class="actions" style="margin-top:10px">
      <button class="btn ghost" onclick="go('/invoice/${x.id}')">${I.edit}تعديل</button>
      <button class="btn danger" onclick="delInvoice(${x.id})">مسح</button>
    </div>`);
  const pages = invPages(x);
  if(pages.length){
    const urls = await Promise.all(pages.map(p => signedUrl(p)));
    $('#mimg').innerHTML = pages.map((p, i) => `<div class="pg">
      ${urls[i] ? `<img src="${urls[i]}" onclick='viewImg(${JSON.stringify(p)}, ${JSON.stringify(pages)})' alt="">` : '<div class="hint">مش متاحة</div>'}
      <span class="pg-n">${i + 1}</span>
      <button class="pg-x" onclick='delInvPage(${x.id}, ${JSON.stringify(p)})' aria-label="مسح الصفحة">${I.close}</button></div>`).join('');
  }
};
window.addInvPages = async id => {
  const files = [...$('#imgpick').files]; if(!files.length) return;
  busy(true);
  try{
    const x = await q(ldb.from('invoices').select('*').eq('id', id).single());
    const added = []; for(const f of files) added.push(await uploadImage(f, 'invoices', {max:1800, q:0.8}));
    const all = [...invPages(x), ...added];
    await q(ldb.from('invoices').update({image_path: all[0], extra_images: all.slice(1)}).eq('id', id));
    busy(false); toast(`اتضافت ${added.length} ${added.length === 1 ? 'صفحة' : 'صفحات'} ✓`);
    await afterImage('invoices', id, x.supplier_id);
  }catch(e){ toast(errMsg(e), true); } finally{ busy(false); }
};
window.delInvPage = async (id, path) => {
  if(!confirm('تمسح الصفحة دي من الفاتورة؟ مش هتقدر ترجّعها.')) return;
  busy(true);
  try{
    const x = await q(ldb.from('invoices').select('*').eq('id', id).single());
    const all = invPages(x).filter(p => p !== path);
    await q(ldb.from('invoices').update({image_path: all[0] || null, extra_images: all.slice(1)}).eq('id', id));
    await removeImage(path); urlCache.delete(path);
    busy(false); toast('اتمسحت الصفحة');
    await afterImage('invoices', id, x.supplier_id);
  }catch(e){ toast(errMsg(e), true); } finally{ busy(false); }
};
window.showPayment = async id => {
  const x = window._sup.pays.find(i => i.id === id);
  const linked = x.invoice_id ? window._sup.invs.find(i => i.id === x.invoice_id) : null;
  openModal(`<h3>${IS_ADJ(x.method) ? METHOD[x.method] : 'دفعة ' + METHOD[x.method]}</h3>
    <div class="kv"><span>المورد</span><span>${esc(window._sup.s.name)}</span></div>
    <div class="kv"><span>المبلغ</span><span>${money(x.amount)}</span></div>
    <div class="kv"><span>التاريخ</span><span>${fmtDate(x.pay_date)}</span></div>
    <div class="kv"><span>عن فاتورة</span><span>${linked ? (linked.inv_no ? 'رقم ' + esc(linked.inv_no) : 'بتاريخ ' + fmtDate(linked.inv_date)) + ' · ' + money(linked.amount) : 'على الحساب'}</span></div>
    ${x.method==='check' ? `
      <div class="kv"><span>رقم الشيك</span><span class="num">${esc(x.check_no||'—')}</span></div>
      <div class="kv"><span>البنك</span><span>${esc(x.bank||'—')}</span></div>
      <div class="kv"><span>تاريخ الاستحقاق</span><span>${fmtDate(x.due_date)}</span></div>
      <div class="kv"><span>الحالة</span><span><span class="tag ${x.check_status}">${CHK[x.check_status]}</span></span></div>`:''}
    ${x.notes?`<div class="kv"><span>ملاحظات</span><span>${esc(x.notes)}</span></div>`:''}
    <div class="kv"><span>سجّلها</span><span>${esc(who(x.created_by))}${x.created_at ? ' · ' + fmtDateTime(x.created_at) : ''}</span></div>
    ${x.method === 'cash' ? '' : imgSection('payments', x)}
    ${x.method==='check' ? checkButtons(x, `viewSupplier(${x.supplier_id})`) : ''}
    <div class="actions" style="margin-top:10px">
      <button class="btn ghost" onclick="go('/${IS_ADJ(x.method)?'adjust':'payment'}/${x.id}')">${I.edit}تعديل</button>
      <button class="btn danger" onclick="delPayment(${x.id})">مسح</button>
    </div>`);
  if(x.image_path) $('#mimg').innerHTML = await imgBlock(x.image_path);
};
function checkButtons(x, after){
  const b = (st, label, cls) => x.check_status===st ? '' : `<button class="btn ${cls}" onclick="setCheck(${x.id},'${st}',()=>${after})">${label}</button>`;
  return `<div class="actions" style="margin-top:10px">${b('cleared','اتصرف ✓','green')}${b('bounced','ارتد ✗','danger')}${b('pending','لسه','ghost')}</div>`;
}
window.setCheck = async (id, st, after) => {
  if(st==='bounced' && !confirm('الشيك ارتد؟ مبلغه هيرجع تاني على حساب المورد.')) return;
  busy(true);
  try{ await q(ldb.from('payments').update({check_status:st}).eq('id', id)); busy(false); closeModal(); if(st==='cleared') await celebrate('الشيك اتصرف', true); else toast('اتحدث ✓'); await after(); }
  catch(e){ toast(errMsg(e), true); } finally{ busy(false); }
};
window.delInvoice = async id => {
  const x = window._sup.invs.find(i => i.id === id);
  if(!confirm(`متأكد تمسح الفاتورة دي (${Number(x.amount).toLocaleString('en-US')} ج)؟`)) return;
  busy(true);
  try{ await q(ldb.from('invoices').delete().eq('id', id)); await removeImage(x.image_path); toast('اتمسحت'); closeModal(); viewSupplier(x.supplier_id); }
  catch(e){ toast(errMsg(e), true); } finally{ busy(false); }
};
window.delPayment = async id => {
  const x = window._sup.pays.find(i => i.id === id);
  if(!confirm(`متأكد تمسح ال${IS_ADJ(x.method)?METHOD[x.method]:'دفعة'} دي (${Number(x.amount).toLocaleString('en-US')} ج)؟`)) return;
  busy(true);
  try{ await q(ldb.from('payments').delete().eq('id', id)); await removeImage(x.image_path); toast('اتمسحت'); closeModal(); viewSupplier(x.supplier_id); }
  catch(e){ toast(errMsg(e), true); } finally{ busy(false); }
};

/* =================== مكوّنات الفورم =================== */
async function supplierPicker(selected){
  const sups = await api.suppliers();
  return `<div class="field" id="f-sup"><label>المورد <span class="req">*</span></label>
    <div class="picker"><select id="sup">
      <option value="">— اختار المورد —</option>
      ${sups.map(s => `<option value="${s.id}" ${String(s.id)===String(selected)?'selected':''}>${esc(s.name)}</option>`).join('')}
    </select><button type="button" class="btn ghost" onclick="quickSupplier()">${I.plus}</button></div></div>`;
}
window.quickSupplier = async () => {
  const name = prompt('اسم المورد الجديد:'); if(!name || !name.trim()) return;
  busy(true);
  try{
    const r = await q(ldb.from('suppliers').insert({name:name.trim()}).select().single());
    const sel = $('#sup'); const o = document.createElement('option'); o.value = r.id; o.textContent = r.name; o.selected = true; sel.appendChild(o);
    toast('اتضاف المورد ✓');
  }catch(e){ toast(errMsg(e), true); } finally{ busy(false); }
};
function invoiceField(){
  return `<div class="field" id="f-inv"><label>عن أنهي فاتورة؟</label>
    <select id="invsel"><option value="">— على الحساب (من غير فاتورة معينة) —</option></select>
    <div class="hint">اختياري — لو سبتها، المبلغ بيتحسب على أقدم فواتير لسه ما اتدفعتش.</div></div>`;
}
async function fillInvoices(supId, selected, exceptPayId){
  const sel = $('#invsel'); if(!sel) return;
  sel.innerHTML = '<option value="">— على الحساب (من غير فاتورة معينة) —</option>';
  if(!supId) return;
  const [invs, pays] = await Promise.all([api.invoices(supId), api.payments(supId)]);
  const alloc = allocate(invs, pays.filter(p => p.id !== exceptPayId));
  invs.forEach(i => {
    const a = alloc.get(i.id); if(a.status === 'paid' && String(i.id) !== String(selected)) return;
    const o = document.createElement('option'); o.value = i.id;
    o.textContent = `${i.inv_no ? 'رقم ' + i.inv_no : 'فاتورة'} · ${String(i.inv_date).slice(0,10)} · باقي ${a.rem.toLocaleString('en-US')} من ${Number(i.amount).toLocaleString('en-US')} ج`;
    if(String(i.id) === String(selected)) o.selected = true;
    sel.appendChild(o);
  });
}
function photoField({id, label, required, existing, hint}){
  return `<div class="field" id="f-${id}"><label>${label} ${required?'<span class="req">*</span>':''}</label>
    <label class="photo" for="${id}">
      <div id="${id}-prev">${existing ? '<div class="spin" style="margin:10px auto"></div>' : `${I.camera}<div class="ph-t">اضغط وصوّر أو اختار صورة</div>`}</div>
      ${hint?`<div class="ph-s">${hint}</div>`:''}
      <input type="file" id="${id}" accept="image/*" onchange="previewPhoto('${id}')">
    </label></div>`;
}
window._rmImg = {};
async function fillExisting(id, path, optional=false){
  window._rmImg[id] = false;
  if(!path) return;
  const u = await signedUrl(path);
  $(`#${id}-prev`).innerHTML = (u ? `<img src="${u}"><div class="ph-s" style="margin-top:6px">اضغط لتغيير الصورة</div>` : 'الصورة الحالية')
    + (optional ? `<button type="button" class="ph-del" onclick="event.preventDefault();event.stopPropagation();rmFormImg('${id}')">${I.close.replace('<svg','<svg width="14" height="14"')} مسح الصورة</button>` : '');
}
window.rmFormImg = id => {
  window._rmImg[id] = true; const inp = $('#' + id); if(inp) inp.value = '';
  $(`#${id}-prev`).innerHTML = `${I.camera}<div class="ph-t">الصورة هتتمسح لما تحفظ — أو اختار صورة تانية</div>`;
};
window.previewPhoto = id => {
  const f = $('#'+id).files[0]; if(!f) return; window._rmImg[id] = false;
  $(`#${id}-prev`).innerHTML = `<img src="${URL.createObjectURL(f)}"><div class="ph-s" style="margin-top:6px">اضغط لتغيير الصورة</div>`;
  $('#f-'+id).classList.remove('err');
};
function markErr(id, msg){ buzz(40); const f = $('#f-'+id); f?.classList.remove('err'); void f?.offsetWidth; f?.classList.add('err'); f?.scrollIntoView({behavior:'smooth', block:'center'}); toast(msg, true); return false; }
document.addEventListener('input', e => e.target.closest('.field')?.classList.remove('err'));
function readAmount(v){ v = String(v||'').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[,،\s]/g,'').replace('٫','.'); return Number(v); }

function formShell(title, body, onSave){
  const app = $('#app');
  app.innerHTML = `<div class="sheet">
    <header class="top"><button class="iconbtn" onclick="history.back()" aria-label="إلغاء">${I.close}</button><h1>${title}</h1></header>
    <main><form id="frm" autocomplete="off" novalidate>${body}
      <button class="btn primary block" type="submit" style="padding:15px;font-size:17px">حفظ</button></form></main></div>`;
  let saving = false;
  $('#frm').addEventListener('submit', async e => {
    e.preventDefault(); if(saving) return; saving = true; busy(true);
    try{ await onSave(); }catch(err){ console.error(err); toast(errMsg(err), true); }
    finally{ saving = false; busy(false); }
  });
}

/* =================== مساعدات الفورم =================== */
const supBalance = sid => { const r = supplierBalances().find(x => String(x.id) === String(sid)); return r ? Number(r.balance) : 0; };
const savedMsg = what => (sync.online && navigator.onLine) ? `اتحفظت ${what}` : `اتحفظت ${what} على الجهاز`;
// منع التكرار: لو فيه حركة بنفس المورد والمبلغ والتاريخ (وبنفس الرقم/النوع) نسأل الأول
function looksDuplicate(list, x, same){ return list.some(r => (!x || r.id !== x.id) && same(r)); }

/* =================== فورم الفاتورة =================== */
async function formInvoice(id, presetSup){
  const x = id ? await q(ldb.from('invoices').select('*').eq('id', id).single()) : null;
  formShell(x ? 'تعديل فاتورة' : 'فاتورة جديدة', `
    ${await supplierPicker(x ? x.supplier_id : presetSup)}
    <div class="balhint" id="balhint"></div>
    <div class="field" id="f-amount"><label>قيمة الفاتورة <span class="req">*</span></label>
      <input id="amount" class="amount-input" inputmode="decimal" placeholder="0" value="${x?x.amount:''}"></div>
    <div class="row2">
      <div class="field"><label>التاريخ</label><input id="date" type="date" value="${x?x.inv_date:today()}"></div>
      <div class="field"><label>رقم الفاتورة</label><input id="no" inputmode="numeric" value="${esc(x?.inv_no||'')}" placeholder="اختياري"></div>
    </div>
    <div class="field" id="f-img"><label>صور الفاتورة <span class="req">*</span> <small class="muted">(لو الفاتورة كذا ورقة صوّر كل ورقة)</small></label>
      <div class="pg-grid" id="pages"></div>
      <input type="file" id="pgpick" accept="image/*" multiple hidden onchange="addFormPages()">
    </div>
    <div class="ocr-box" id="ocrbox" style="display:none;margin:-6px 0 14px">
      <button type="button" class="btn ghost block" onclick="readAmountFromPhoto()">${I.scan}اقرأ المبلغ من آخر صفحة</button>
      <div id="ocrout"></div>
    </div>
    <div class="field"><label>ملاحظات</label><textarea id="notes" rows="2" placeholder="اختياري">${esc(x?.notes||'')}</textarea></div>
  `, async () => {
    const sid = $('#sup').value, amount = readAmount($('#amount').value);
    if(!sid) return markErr('sup', 'اختار المورد');
    if(!(amount > 0)) return markErr('amount', 'اكتب قيمة الفاتورة');
    if(!x && !formPages.length) return markErr('img', 'لازم صورة الفاتورة (صفحة واحدة على الأقل)');
    const row0 = {date:$('#date').value || today(), no:$('#no').value.trim()};
    if(looksDuplicate(await api.invoices(sid), x, r => Number(r.amount) === amount && String(r.inv_date).slice(0,10) === row0.date && (!row0.no || !r.inv_no || r.inv_no === row0.no))
       && !confirm(`فيه فاتورة متسجلة لنفس المورد بنفس المبلغ (${amount.toLocaleString('en-US')}) ونفس التاريخ.\nتسجلها تاني برضه؟`)) return;
    const paths = [];
    for(const p of formPages) paths.push(p.path || await uploadImage(p.file, 'invoices', {max:1800, q:0.8}));   // ضغط مع الحفاظ على وضوح الأرقام
    const row = {supplier_id:+sid, amount, inv_date:row0.date, inv_no:row0.no||null, notes:$('#notes').value.trim()||null, image_path:paths[0] || null, extra_images:paths.slice(1)};
    if(x){ await q(ldb.from('invoices').update(row).eq('id', x.id)); invPages(x).filter(p => !paths.includes(p)).forEach(p => removeImage(p)); }
    else await q(ldb.from('invoices').insert(row));
    busy(false); await celebrate(savedMsg('الفاتورة'));
    location.replace('#/s/' + sid);
  });
  formPages = x ? invPages(x).map(path => ({path})) : [];
  drawFormPages();
  const hint = () => { const sid = $('#sup').value; const b = sid ? supBalance(sid) : null; const a = readAmount($('#amount').value) || 0;
    $('#balhint').innerHTML = sid ? `<span>رصيد المورد دلوقتي</span><b>${money(b)}</b>${!x && a > 0 ? `<span>بعد الفاتورة</span><b class="after">${money(b + a)}</b>` : ''}` : ''; };
  $('#sup').addEventListener('change', hint); $('#amount').addEventListener('input', hint); hint();
}
// صفحات الفاتورة في الفورم (صور قديمة path أو جديدة file)
let formPages = [];
async function drawFormPages(){
  const el = $('#pages'); if(!el) return;
  const urls = await Promise.all(formPages.map(p => p.file ? (p.url ||= URL.createObjectURL(p.file)) : signedUrl(p.path)));
  el.innerHTML = formPages.map((p, i) => `<div class="pg">${urls[i] ? `<img src="${urls[i]}" alt="">` : '<div class="hint">الصورة الحالية</div>'}
      <span class="pg-n">${i + 1}</span><button type="button" class="pg-x" onclick="rmFormPage(${i})" aria-label="شيل الصفحة">${I.close}</button></div>`).join('')
    + `<button type="button" class="pg pg-add" onclick="$('#pgpick').click()">${I.camera}<span>${formPages.length ? 'صفحة كمان' : 'صوّر الفاتورة'}</span></button>`;
  $('#ocrbox').style.display = formPages.some(p => p.file) ? '' : 'none';
}
window.addFormPages = () => {
  const files = [...$('#pgpick').files]; $('#pgpick').value = '';
  files.forEach(f => formPages.push({file:f}));
  $('#f-img').classList.remove('err'); $('#ocrout').innerHTML = ''; drawFormPages();
};
window.rmFormPage = i => { formPages.splice(i, 1); drawFormPages(); };

/* =================== قراءة المبلغ من صورة الفاتورة =================== */
let ocrWorker = null;
async function getOcr(onProg){
  await loadScript('vendor/ocr/tesseract.min.js');
  if(ocrWorker) return ocrWorker;
  const base = new URL('vendor/ocr/', location.href).href;
  ocrWorker = await Tesseract.createWorker(['ara','eng'], 1, {
    workerPath: base + 'worker.min.js', corePath: base + 'core', langPath: base + 'lang',
    logger: m => onProg && onProg(m),
  });
  return ocrWorker;
}
function amountCandidates(text){
  const norm = text.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[٫]/g, '.').replace(/[٬،]/g, ',');
  const KEY = /(اجمال|إجمال|الاجمالى|الإجمالي|المجموع|الصافي|الصافى|المطلوب|total|net|sum)/i;
  const found = [];
  norm.split(/\n/).forEach((raw, li) => {
    const line = raw.replace(/\d{1,4}\s*[\/\-.]\s*\d{1,2}\s*[\/\-.]\s*\d{1,4}/g, ' ');   // شيل التواريخ
    const ref = /(رقم|No\.?|#|تليفون|ت\s*:|موبايل|هاتف)/i.test(line) && !KEY.test(line);
    const nums = line.match(/\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?/g) || [];
    nums.forEach(n => {
      const v = Number(n.replace(/,/g, ''));
      if(!(v >= 10 && v <= 10000000)) return;
      if(/^(19|20)\d{2}$/.test(String(v)) && !n.includes(',')) return;      // غالبًا سنة
      if(String(Math.round(v)).length >= 9) return;                          // غالبًا تليفون
      found.push({v, key: KEY.test(line), ref, li});
    });
  });
  const uniq = new Map();
  found.forEach(f => { const o = uniq.get(f.v); if(!o || (f.key && !o.key)) uniq.set(f.v, f); });
  return [...uniq.values()].sort((a,b) => (b.key - a.key) || (a.ref - b.ref) || (b.v - a.v)).slice(0, 5).map(f => f.v);
}
window.readAmountFromPhoto = async () => {
  const file = [...formPages].reverse().find(p => p.file)?.file; if(!file) return toast('صوّر الفاتورة الأول', true);
  const out = $('#ocrout');
  out.innerHTML = `<div class="hint" id="ocrmsg">بقرا الصورة... أول مرة بياخد شوية عشان بيحمّل ملفات القراءة</div><div class="ocr-prog"><i id="ocrbar"></i></div>`;
  try{
    const w = await getOcr(m => { if(m.status === 'recognizing text' && $('#ocrbar')) $('#ocrbar').style.width = Math.round(m.progress*100) + '%'; });
    const img = await compressImage(file, 2000, 0.9);
    const { data } = await w.recognize(img);
    const c = amountCandidates(data.text || '');
    if(!c.length){ out.innerHTML = '<div class="hint">مش لاقي أرقام واضحة في الصورة — اكتب المبلغ بإيدك.</div>'; return; }
    out.innerHTML = `<div class="hint" style="margin-top:8px">اختار المبلغ الصح (اتأكد منه قبل الحفظ):</div>
      <div class="ocr-chips">${c.map(v => `<button type="button" onclick="pickAmount(${v})">${v.toLocaleString('en-US')}</button>`).join('')}</div>`;
    buzz(10);
  }catch(e){ console.error(e); out.innerHTML = '<div class="hint" style="color:var(--red)">مقدرتش أقرا الصورة — اكتب المبلغ بإيدك.</div>'; }
};
window.pickAmount = v => { $('#amount').value = v; $('#f-amount').classList.remove('err'); $('#amount').animate([{transform:'scale(1.08)'},{transform:'scale(1)'}], {duration:250}); };

/* =================== فورم الدفعة =================== */
async function formPayment(id, presetSup){
  const x = id ? await q(ldb.from('payments').select('*').eq('id', id).single()) : null;
  let method = x?.method || null;
  formShell(x ? 'تعديل دفعة' : 'دفعة جديدة', `
    ${await supplierPicker(x ? x.supplier_id : presetSup)}
    <div class="field" id="f-amount"><label>المبلغ <span class="req">*</span></label>
      <input id="amount" class="amount-input" inputmode="decimal" placeholder="0" value="${x?x.amount:''}"></div>
    <div class="paycalc" id="paycalc"></div>
    ${invoiceField()}
    <div class="field" id="f-method"><label>نوع الدفعة <span class="req">*</span></label>
      <div class="seg">
        <button type="button" data-m="cash">${I.cash}كاش</button>
        <button type="button" data-m="check">${I.check}شيك</button>
        <button type="button" data-m="transfer">${I.transfer}تحويل</button>
      </div></div>
    <div id="m-check" class="sub" style="display:none">
      <div class="row2">
        <div class="field"><label>رقم الشيك</label><input id="chk_no" inputmode="numeric" value="${esc(x?.check_no||'')}"></div>
        <div class="field"><label>البنك</label><input id="bank" value="${esc(x?.bank||'')}"></div>
      </div>
      <div class="field" id="f-due"><label>تاريخ الاستحقاق <span class="req">*</span></label><input id="due" type="date" value="${x?.due_date||''}"></div>
      ${photoField({id:'chkimg', label:'صورة الشيك', required:false, existing:x?.method==='check'?x.image_path:null, hint:'اختياري'})}
    </div>
    <div id="m-transfer" class="sub transfer" style="display:none">
      ${photoField({id:'trimg', label:'سكرين شوت التحويل', required:true, existing:x?.method==='transfer'?x.image_path:null})}
    </div>
    <div class="field"><label>تاريخ الدفع</label><input id="date" type="date" value="${x?x.pay_date:today()}"></div>
    <div class="field"><label>ملاحظات</label><textarea id="notes" rows="2" placeholder="اختياري">${esc(x?.notes||'')}</textarea></div>
  `, async () => {
    const sid = $('#sup').value, amount = readAmount($('#amount').value);
    if(!sid) return markErr('sup', 'اختار المورد');
    if(!(amount > 0)) return markErr('amount', 'اكتب المبلغ');
    if(!method) return markErr('method', 'اختار نوع الدفعة: كاش ولا شيك ولا تحويل');
    const keepOld = x && x.method === method ? x.image_path : null;
    let file = null;
    if(method==='transfer'){ file = $('#trimg').files[0]; if(!file && !keepOld && !(x && x.method === 'transfer')) return markErr('trimg', 'لازم سكرين شوت التحويل'); }
    if(method==='check'){ file = $('#chkimg').files[0]; if(!$('#due').value) return markErr('due', 'اكتب تاريخ استحقاق الشيك'); }
    const pdate = $('#date').value || today();
    if(looksDuplicate(await api.payments(sid), x, r => Number(r.amount) === amount && String(r.pay_date).slice(0,10) === pdate && r.method === method)
       && !confirm(`فيه دفعة ${METHOD[method]} متسجلة لنفس المورد بنفس المبلغ (${amount.toLocaleString('en-US')}) ونفس التاريخ.\nتسجلها تاني برضه؟`)) return;
    let image_path = method==='cash' ? null : keepOld;
    if(window._rmImg[method === 'check' ? 'chkimg' : 'trimg'] && !file) image_path = null;
    if(file) image_path = await uploadImage(file, method==='check' ? 'checks' : 'transfers');
    const row = {
      supplier_id:+sid, amount, method, pay_date:$('#date').value || today(), notes:$('#notes').value.trim()||null, image_path,
      invoice_id: $('#invsel').value ? +$('#invsel').value : null,
      check_no: method==='check' ? ($('#chk_no').value.trim()||null) : null,
      bank: method==='check' ? ($('#bank').value.trim()||null) : null,
      due_date: method==='check' ? $('#due').value : null,
      check_status: method==='check' ? (x?.check_status || 'pending') : null,
    };
    if(x){ await q(ldb.from('payments').update(row).eq('id', x.id)); if(x.image_path && x.image_path !== image_path) removeImage(x.image_path); }
    else await q(ldb.from('payments').insert(row));
    busy(false); await celebrate(savedMsg('الدفعة'), true);
    location.replace('#/s/' + sid);
  });
  const setM = m => {
    method = m;
    document.querySelectorAll('.seg button').forEach(b => b.classList.toggle('on', b.dataset.m === m));
    $('#m-check').style.display = m==='check' ? '' : 'none';
    $('#m-transfer').style.display = m==='transfer' ? '' : 'none';
    $('#f-method').classList.remove('err');
  };
  document.querySelectorAll('.seg button').forEach(b => b.onclick = () => setM(b.dataset.m));
  if(method) setM(method);
  if(x?.image_path) fillExisting(x.method==='check' ? 'chkimg' : 'trimg', x.image_path, true);
  fillInvoices($('#sup').value, x?.invoice_id, x?.id);
  $('#sup').addEventListener('change', () => fillInvoices($('#sup').value));
  // الرصيد قبل وبعد الدفعة (بنفس قاعدة الحساب: الشيك المرتد مش بيتحسب)
  const calc = () => {
    const sid = $('#sup').value, el = $('#paycalc'); if(!sid){ el.innerHTML = ''; return; }
    let before = supBalance(sid);
    if(x && String(x.supplier_id) === String(sid) && x.check_status !== 'bounced') before += Number(x.amount);   // التعديل: نشيل الدفعة القديمة الأول
    const a = readAmount($('#amount').value) || 0, after = before - a;
    el.innerHTML = `<div><span>المستحق قبل الدفعة</span><b>${money(before)}</b></div><div class="op">−</div><div><span>الدفعة</span><b>${money(a)}</b></div><div class="op">=</div>
      <div class="${after < 0 ? 'neg-after' : 'after'}"><span>${after < 0 ? 'هيبقى ليك عنده' : 'المتوقع بعد الدفع'}</span><b>${money(Math.abs(after))}</b></div>`;
  };
  $('#sup').addEventListener('change', calc); $('#amount').addEventListener('input', calc); calc();
}

/* =================== فورم المرتجع / الخصم =================== */
async function formAdjust(id, presetSup){
  const x = id ? await q(ldb.from('payments').select('*').eq('id', id).single()) : null;
  let method = x?.method || null;
  formShell(x ? 'تعديل ' + METHOD[x.method] : 'مرتجع أو خصم', `
    ${await supplierPicker(x ? x.supplier_id : presetSup)}
    <div class="field" id="f-method"><label>النوع <span class="req">*</span></label>
      <div class="seg" style="grid-template-columns:1fr 1fr">
        <button type="button" data-m="return">${I.ret}مرتجع بضاعة</button>
        <button type="button" data-m="discount">${I.disc}خصم من المورد</button>
      </div></div>
    <div class="field" id="f-amount"><label>القيمة <span class="req">*</span></label>
      <input id="amount" class="amount-input" inputmode="decimal" placeholder="0" value="${x?x.amount:''}"></div>
    ${invoiceField()}
    <div class="field"><label>التاريخ</label><input id="date" type="date" value="${x?x.pay_date:today()}"></div>
    ${photoField({id:'adjimg', label:'صورة إذن المرتجع / الإيصال', required:false, existing:x?.image_path, hint:'اختياري'})}
    <div class="field"><label>ملاحظات</label><textarea id="notes" rows="2" placeholder="مثلاً: 5 قطع عيب">${esc(x?.notes||'')}</textarea></div>
  `, async () => {
    const sid = $('#sup').value, amount = readAmount($('#amount').value), file = $('#adjimg').files[0];
    if(!sid) return markErr('sup', 'اختار المورد');
    if(!method) return markErr('method', 'اختار: مرتجع ولا خصم');
    if(!(amount > 0)) return markErr('amount', 'اكتب القيمة');
    let image_path = x?.image_path || null;
    if(window._rmImg.adjimg) image_path = null;
    if(file) image_path = await uploadImage(file, 'returns');
    const row = {supplier_id:+sid, amount, method, pay_date:$('#date').value || today(), notes:$('#notes').value.trim()||null, image_path,
      invoice_id: $('#invsel').value ? +$('#invsel').value : null, check_no:null, bank:null, due_date:null, check_status:null};
    if(x){ await q(ldb.from('payments').update(row).eq('id', x.id)); if(x.image_path && x.image_path !== image_path) removeImage(x.image_path); }
    else await q(ldb.from('payments').insert(row));
    busy(false); await celebrate(method === 'return' ? 'اتسجل المرتجع' : 'اتسجل الخصم');
    location.replace('#/s/' + sid);
  });
  const setM = m => { method = m; document.querySelectorAll('#f-method .seg button').forEach(b => b.classList.toggle('on', b.dataset.m === m)); $('#f-method').classList.remove('err'); };
  document.querySelectorAll('#f-method .seg button').forEach(b => b.onclick = () => setM(b.dataset.m));
  if(method) setM(method);
  if(x?.image_path) fillExisting('adjimg', x.image_path, true);
  fillInvoices($('#sup').value, x?.invoice_id, x?.id);
  $('#sup').addEventListener('change', () => fillInvoices($('#sup').value));
  // الرصيد قبل وبعد الدفعة (بنفس قاعدة الحساب: الشيك المرتد مش بيتحسب)
  const calc = () => {
    const sid = $('#sup').value, el = $('#paycalc'); if(!sid){ el.innerHTML = ''; return; }
    let before = supBalance(sid);
    if(x && String(x.supplier_id) === String(sid) && x.check_status !== 'bounced') before += Number(x.amount);   // التعديل: نشيل الدفعة القديمة الأول
    const a = readAmount($('#amount').value) || 0, after = before - a;
    el.innerHTML = `<div><span>المستحق قبل الدفعة</span><b>${money(before)}</b></div><div class="op">−</div><div><span>الدفعة</span><b>${money(a)}</b></div><div class="op">=</div>
      <div class="${after < 0 ? 'neg-after' : 'after'}"><span>${after < 0 ? 'هيبقى ليك عنده' : 'المتوقع بعد الدفع'}</span><b>${money(Math.abs(after))}</b></div>`;
  };
  $('#sup').addEventListener('change', calc); $('#amount').addEventListener('input', calc); calc();
}

/* =================== فورم المورد =================== */
async function formSupplier(id){
  const x = id ? await q(ldb.from('suppliers').select('*').eq('id', id).single()) : null;
  formShell(x ? 'تعديل المورد' : 'مورد جديد', `
    <div class="field" id="f-name"><label>اسم المورد <span class="req">*</span></label><input id="name" value="${esc(x?.name||'')}"></div>
    <div class="field"><label>التليفون</label><input id="phone" type="tel" inputmode="tel" value="${esc(x?.phone||'')}"></div>
    <div class="field"><label>ملاحظات</label><textarea id="notes" rows="2">${esc(x?.notes||'')}</textarea></div>
    ${x ? `<button type="button" class="btn danger block" style="margin-bottom:14px" onclick="delSupplier(${x.id})">مسح المورد</button>` : ''}
  `, async () => {
    const name = $('#name').value.trim(); if(!name) return markErr('name', 'اكتب اسم المورد');
    const row = {name, phone:$('#phone').value.trim()||null, notes:$('#notes').value.trim()||null};
    if(x){ await q(ldb.from('suppliers').update(row).eq('id', x.id)); toast('اتحفظ ✓'); location.replace('#/s/'+x.id); }
    else { const r = await q(ldb.from('suppliers').insert(row).select().single()); toast('اتضاف المورد ✓'); location.replace('#/s/'+r.id); }
  });
}
window.delSupplier = async id => {
  if(!confirm('متأكد تمسح المورد؟')) return;
  busy(true);
  try{ await q(ldb.from('suppliers').delete().eq('id', id)); toast('اتمسح'); location.replace('#/suppliers'); }
  catch(e){ toast(errMsg(e), true); } finally{ busy(false); }
};
