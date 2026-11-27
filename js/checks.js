/* =================== الشيكات: السداد على دفعات ===================
   قيمة الشيك الأصلية ثابتة. كل دفعة سداد صف مستقل في check_payments.
   المتبقي = قيمة الشيك − مجموع دفعات السداد المعتمدة (الملغية مش محسوبة).
   الحساب كله في store.js (checkInfo / payEffect) — مفيش حساب تاني هنا. */

const chkRow = id => store.eff.payments.get(id) || store.eff.payments.get(Number(id));
let chkAfter = '';   // بيترسم إيه بعد أي تعديل (الصفحة اللي فاتح منها)
const runAfter = () => { try{ return (0, eval)(chkAfter); }catch(e){ console.error(e); } };

function drawCheckPanel(pid, after){
  chkAfter = after;
  const el = document.getElementById('chkpanel'), p = chkRow(pid); if(!el || !p) return;
  const i = checkInfo(p), m = c => money(c / 100), pct = i.orig ? Math.round(i.settled / i.orig * 100) : 0, open = p.check_status === 'pending';
  el.innerHTML = `
    <div class="kv"><span>الحالة</span><span>${chkTags(p)}</span></div>
    <div class="chk-box">
      <div class="chk-nums">
        <div><span>القيمة الأصلية</span><b>${m(i.orig)}</b></div>
        <div><span>إجمالي المسدد</span><b class="pos-v">${m(i.settled)}</b></div>
        <div><span>المتبقي</span><b class="${i.remaining ? 'neg-v' : ''}">${m(i.remaining)}</b></div>
      </div>
      <div class="chk-bar"><i style="width:${pct}%"></i></div>
      <div class="hint">${i.last ? 'آخر دفعة ' + fmtDate(i.last) + ' · ' : ''}${pct}% مسدد${CHK_PART(p) ? ` · محسوب على المورد المسدد فعليًا بس (${m(i.paidRows)})` : ''}${p.check_status === 'cleared' && i.paidRows < i.orig ? ' · اتصرف بالكامل من البنك' : ''}</div>
    </div>
    <div class="section-t" style="margin-top:12px">سجل السداد (${i.list.length})</div>
    <div class="list cp-list">${i.list.length ? i.list.map(c => `
      <div class="item ${c.voided ? 'voided' : ''}">
        <div class="grow"><div class="t">${m(C(c.amount))} · ${CP_METHOD[c.method] || c.method}${c.voided ? ' <span class="tag bounced">ملغية</span>' : ''}${c._pending ? ` <span class="tag pend-sync">${I.refresh}على الجهاز</span>` : ''}</div>
          <div class="s">${fmtDate(c.pay_date)}${c.account ? ' · من ' + esc(c.account) : ''}${c.ref_no ? ' · مرجع <span class="num">' + esc(c.ref_no) + '</span>' : ''}${c.notes ? ' · ' + esc(c.notes) : ''}${c.voided && c.void_reason ? ' · سبب الإلغاء: ' + esc(c.void_reason) : ''} · ${esc(who(c.created_by))}</div></div>
        ${c.image_path ? `<button class="iconbtn" onclick="viewImg('${esc(c.image_path)}')" aria-label="الإيصال">${I.img}</button>` : ''}
        ${!c.voided ? `<button class="iconbtn" onclick="cpForm(${p.id}, ${c.id})" aria-label="تعديل">${I.edit}</button><button class="iconbtn" onclick="cpVoid(${c.id})" aria-label="إلغاء">✕</button>` : ''}
      </div>`).join('') : '<div class="hint" style="padding:8px 0">مفيش دفعات سداد متسجلة على الشيك ده</div>'}</div>
    <div class="actions" style="margin-top:10px">
      ${open && i.remaining > 0 ? `<button class="btn primary" onclick="cpForm(${p.id})">${I.plus}تسجيل سداد</button>` : ''}
      <button class="btn ghost" onclick="checkPdf(${p.id})">${I.doc}سجل السداد PDF</button>
    </div>
    <div class="actions sm" style="margin-top:8px">
      ${open ? `<button class="btn green" onclick="cpForm(${p.id}, null, true)">اتصرف ${i.settled ? 'الباقي' : 'بالكامل'} من البنك</button>
        <button class="btn danger" onclick="setCheckSt(${p.id}, 'bounced')">مرتجع من البنك</button>
        <button class="btn ghost" onclick="setCheckSt(${p.id}, 'cancelled')">ملغي</button>
        <button class="btn ghost" onclick="replaceCheck(${p.id})">مستبدل بشيك آخر</button>`
      : (CHK_DEAD(p.check_status) || (p.check_status === 'cleared' && i.paidRows < i.orig)) ? `<button class="btn ghost" onclick="setCheckSt(${p.id}, 'pending')">رجّعه «لسه»</button>` : ''}
    </div>`;
}

// بعد أي دفعة: لو اتسدد بالكامل يبقى «مسدد بالكامل»، ولو اتلغت دفعة والشيك كان مسدد بيرجع «لسه»
async function syncCheckStatus(pid){
  const p = chkRow(pid); if(!p) return;
  const i = checkInfo(p);
  if(p.check_status === 'pending' && i.paidRows >= i.orig) await q(ldb.from('payments').update({check_status:'cleared'}).eq('id', p.id));
  else if(p.check_status === 'cleared' && i.list.length && i.paidRows < i.orig) await q(ldb.from('payments').update({check_status:'pending'}).eq('id', p.id));
}

/* ---------- فورم تسجيل / تعديل دفعة سداد ---------- */
window.cpForm = (pid, cid, bankAll) => {
  const p = chkRow(pid), i = checkInfo(p), x = cid ? store.eff.check_payments.get(cid) : null;
  const maxC = i.orig - i.paidRows + (x && !x.voided ? C(x.amount) : 0);
  const sup = store.eff.suppliers.get(p.supplier_id)?.name || '';
  const def = x ? x.amount : (bankAll ? fromC(maxC) : '');
  openModal(`<h3>${x ? 'تعديل دفعة سداد' : bankAll ? 'صرف الشيك من البنك' : 'تسجيل سداد'} — شيك ${esc(p.check_no || '')}</h3>
    <div class="hint" style="margin-bottom:10px">${esc(sup)} · قيمة الشيك ${money(p.amount)} · المتبقي ${money(fromC(maxC))}</div>
    <div class="field" id="f-cpa"><label>مبلغ السداد <span class="req">*</span></label><input id="cpa" class="amount-input" inputmode="numeric" value="${def}"></div>
    <div class="row2">
      <div class="field" id="f-cpd"><label>تاريخ السداد الفعلي</label><input id="cpd" type="date" value="${x ? x.pay_date : today()}"></div>
      <div class="field"><label>طريقة السداد</label><select id="cpm">${Object.entries(CP_METHOD).map(([k, l]) => `<option value="${k}" ${(x ? x.method : bankAll ? 'bank_debit' : 'cash') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    </div>
    <div class="field"><label>الحساب اللي خرج منه المبلغ</label><input id="cpacc" placeholder="مثلًا: خزينة المحل / بنك مصر / فودافون كاش" value="${esc(x?.account || (bankAll ? p.bank || '' : ''))}"></div>
    <div class="field"><label>رقم العملية أو المرجع</label><input id="cpref" dir="ltr" value="${esc(x?.ref_no || '')}"></div>
    <div class="field"><label>صورة إيصال الدفع ${x?.image_path ? '(فيه صورة — اختار جديدة لو عايز تغيّرها)' : '(اختياري)'}</label><input id="cpimg" type="file" accept="image/*"></div>
    <div class="field"><label>ملاحظات</label><textarea id="cpn" rows="2">${esc(x?.notes || '')}</textarea></div>
    <div class="hint" style="margin-bottom:10px">الدفعة دي بتتسجل على الشيك وبتتخصم من حساب المورد بتاريخها (الشيك محسوب على المورد باللي اتسدد منه بس لحد ما يتصرف).</div>
    <button class="btn primary block" id="cpsave">حفظ</button>`);
  $('#cpsave').onclick = async () => {
    const a = readAmount($('#cpa').value);
    if(!(a > 0)) return markErr('cpa', 'اكتب المبلغ');
    if(C(a) > maxC) return markErr('cpa', `أكبر من المتبقي (${fromC(maxC).toLocaleString('en-US')} ج) — مينفعش السداد يعدّي قيمة الشيك`);
    if(!$('#cpd').value) return markErr('cpd', 'اختار التاريخ');
    busy(true);
    try{
      let img = x?.image_path || null;
      const f = $('#cpimg').files[0];
      if(f){ img = await uploadImage(f, 'checks'); if(x?.image_path) removeImage(x.image_path); }
      const row = {amount:a, pay_date:$('#cpd').value, method:$('#cpm').value, account:$('#cpacc').value.trim() || null,
        ref_no:$('#cpref').value.trim() || null, notes:$('#cpn').value.trim() || null, image_path:img};
      if(x) await q(ldb.from('check_payments').update(row).eq('id', x.id));
      else await q(ldb.from('check_payments').insert({...row, payment_id:p.id}));
      await syncCheckStatus(p.id);
      busy(false); closeModal();
      const n = checkInfo(chkRow(p.id));
      toast(n.remaining ? `اتسجل ✓ — باقي ${money(n.remaining / 100).replace(/<[^>]+>/g, '')}` : 'اتسدد الشيك بالكامل ✓');
      await runAfter();
    }catch(e){ toast(errMsg(e), true); } finally{ busy(false); }
  };
};

// إلغاء دفعة (مفيش حذف — الدفعة الملغية بتفضل في السجل)
window.cpVoid = async cid => {
  const c = store.eff.check_payments.get(cid); if(!c) return;
  const why = prompt(`إلغاء دفعة سداد ${Number(c.amount).toLocaleString('en-US')} ج بتاريخ ${dmyD(c.pay_date)}؟\nالدفعة هتفضل ظاهرة في السجل كـ«ملغية» والمتبقي هيزيد.\n\nاكتب سبب الإلغاء:`);
  if(why === null) return;
  busy(true);
  try{
    await q(ldb.from('check_payments').update({voided:true, void_reason:why.trim() || null, voided_at:new Date().toISOString()}).eq('id', cid));
    await syncCheckStatus(c.payment_id);
    busy(false); toast('اتلغت الدفعة'); await runAfter();
  }catch(e){ toast(errMsg(e), true); } finally{ busy(false); }
};
const dmyD = d => String(d || '').slice(0,10).split('-').reverse().join('-');

// تغيير حالة الشيك (مرتد / ملغي / رجوع لـ«لسه») مع توضيح الأثر قبل التنفيذ
window.setCheckSt = async (pid, st, extra = {}) => {
  const p = chkRow(pid), i = checkInfo(p), f = c => (c / 100).toLocaleString('en-US') + ' ج';
  const back = i.orig - i.paidRows;
  const msg = {
    bounced: `الشيك ارتد من البنك؟\n\n• حساب المورد محسوب عليه اللي اتسدد من الشيك فعلًا بس (${f(i.paidRows)})${p.check_status === 'cleared' ? `\n• هيرجع عليك ${f(back)}` : ''}`,
    cancelled: `تلغي الشيك؟\n\n• حساب المورد محسوب عليه اللي اتسدد من الشيك فعلًا بس (${f(i.paidRows)})${p.check_status === 'cleared' ? `\n• هيرجع عليك ${f(back)}` : ''}`,
    replaced: `الشيك اتبدل بشيك تاني؟\n\n• الشيك ده محسوب على المورد باللي اتسدد منه فعلًا بس (${f(i.paidRows)})\n• الشيك الجديد بيتحسب لما يتدفع أو يتصرف`,
    pending: `ترجّع الشيك «لسه ما اتصرفش»؟\n\n• هيتحسب على المورد اللي اتسدد منه فعلًا بس ${f(i.paidRows)} بدل قيمته كلها ${f(i.orig)}`,
  }[st];
  if(!confirm(msg)) return;
  busy(true);
  try{
    await q(ldb.from('payments').update({check_status:st, ...extra}).eq('id', pid));
    busy(false); closeModal(); toast('اتحدث ✓'); await runAfter();
  }catch(e){ toast(errMsg(e), true); } finally{ busy(false); }
};

// مستبدل بشيك آخر: نختار الشيك الجديد (لازم يكون متسجل للمورد نفسه)
window.replaceCheck = pid => {
  const p = chkRow(pid);
  const others = [...store.eff.payments.values()].filter(x => x.method === 'check' && x.id !== p.id && x.supplier_id === p.supplier_id && x.check_status === 'pending')
    .sort((a, b) => a.due_date < b.due_date ? 1 : -1);
  openModal(`<h3>مستبدل بشيك آخر</h3>
    <div class="hint" style="margin-bottom:10px">اختار الشيك الجديد اللي اتكتب بداله. لو لسه ما سجلتهوش، سجّله الأول كدفعة شيك للمورد.</div>
    <div class="list">${others.length ? others.map(o => `
      <label class="item" style="cursor:pointer"><input type="radio" name="rep" value="${o.id}" style="width:auto">
        <div class="grow"><div class="t">شيك ${esc(o.check_no || '')} · ${money(o.amount)}</div><div class="s">يستحق ${fmtDate(o.due_date)}${o.bank ? ' · ' + esc(o.bank) : ''}</div></div></label>`).join('')
      : '<div class="empty" style="padding:14px">مفيش شيكات تانية «لسه» للمورد ده</div>'}</div>
    <div class="actions" style="margin-top:12px">
      <button class="btn primary" id="repok" ${others.length ? '' : 'disabled'}>تأكيد الاستبدال</button>
      <button class="btn ghost" onclick="closeModal();go('/payment?s=${p.supplier_id}')">${I.plus}سجّل الشيك الجديد</button>
    </div>`);
  $('#repok') && ($('#repok').onclick = () => {
    const v = document.querySelector('input[name=rep]:checked'); if(!v) return toast('اختار الشيك الجديد', true);
    setCheckSt(pid, 'replaced', {replaced_by:+v.value});
  });
};

/* ---------- سجل سداد الشيك PDF ---------- */
async function makeCheckPdf(p){
  const L = await loadPdfLibs(), i = checkInfo(p), sup = store.eff.suppliers.get(p.supplier_id);
  const NAVY = '#10243D', GRAY = '#555', LINE = '#C9CED8', SOFT = '#E8ECF3', ZEBRA = '#F3F5F9';
  const doc = new PDFDocument({size:'A4', margins:{top:36, bottom:46, left:36, right:36}, bufferPages:true, info:{Title:`سجل سداد شيك ${p.check_no || p.id}`, Author:'حسابات المحل'}});
  const chunks = []; doc.on('data', c => chunks.push(c)); const done = new Promise(r => doc.on('end', r));
  doc.registerFont('R', L.r); doc.registerFont('B', L.b);
  const W = doc.page.width, H = doc.page.height, M = 36, R = W - M, CW = W - 2 * M, BOTTOM = H - 52;
  const F = (f, s, c) => doc.font(f).fontSize(s).fillColor(c || '#111');
  const f2 = c => fmt2(c);
  doc.image(L.w, M, M - 4, {width:42}); doc.image(L.z, M + 46, M - 4, {width:42});
  F('R', 10, GRAY); rtlDraw(doc, 'حسابات المحل', R, M - 2);
  F('B', 20, NAVY); rtlDraw(doc, 'سجل سداد شيك', R, M + 12);
  let y = M + 56; doc.moveTo(M, y).lineTo(R, y).lineWidth(1.5).strokeColor(NAVY).stroke(); y += 10;
  const info = [['المورد', sup?.name || '-'], ['رقم الشيك', p.check_no || '-'], ['البنك', p.bank || '-'], ['تاريخ الإصدار', dmy(p.pay_date)],
    ['تاريخ الاستحقاق', dmy(p.due_date)], ['حالة السداد', CHK_PAY[i.pay]], ['حالة الاستحقاق', i.due ? CHK_DUE[i.due] : '-'], ['تاريخ آخر دفعة', i.last ? dmy(i.last) : '-']];
  info.forEach((kv, k) => { const cx = R - (k % 2) * (CW / 2), cy = y + Math.floor(k / 2) * 18;
    F('R', 9.5, GRAY); rtlDraw(doc, kv[0] + ':', cx, cy); const lw = doc.widthOfString(kv[0] + ':') + 6; F('B', 10); rtlDraw(doc, String(kv[1]), cx - lw, cy); });
  y += Math.ceil(info.length / 2) * 18 + 8;
  const box = [['القيمة الأصلية', i.orig], ['إجمالي المسدد', i.settled], ['المتبقي', i.remaining]], bw = CW / 3;
  doc.rect(M, y, CW, 40).fill(SOFT);
  box.forEach((kv, k) => { const xr = R - k * bw; F('R', 9, GRAY); rtlDraw(doc, kv[0], xr - 3, y + 6, {align:'center', width:bw - 6}); F('B', 13, NAVY); numDraw(doc, f2(kv[1]) + ' ج.م', xr - 3, y + 20, bw - 6); });
  y += 52;
  const cols = [{t:'م', w:24}, {t:'التاريخ', w:62}, {t:'المبلغ', w:78}, {t:'الطريقة', w:96}, {t:'الحساب', w:90}, {t:'المرجع', w:70}, {t:'ملاحظات', w:0}];
  cols[6].w = CW - cols.reduce((a, c) => a + c.w, 0);
  const xs = []; { let x = R; cols.forEach(c => { xs.push(x); x -= c.w; }); }
  const head = () => { doc.rect(M, y, CW, 20).fill(NAVY); F('B', 9, '#fff'); cols.forEach((c, k) => rtlDraw(doc, c.t, xs[k] - 2, y + 5, {align:'center', width:c.w - 4})); y += 20; };
  head();
  if(!i.list.length){ F('R', 10, GRAY); rtlDraw(doc, 'لا توجد دفعات سداد مسجلة على الشيك', R - 6, y + 6); y += 24; }
  i.list.forEach((c, k) => {
    const vals = [String(k + 1), dmy(c.pay_date), f2(C(c.amount)), CP_METHOD[c.method] || c.method, c.account || '', c.ref_no || '', [c.voided ? 'ملغية' + (c.void_reason ? ': ' + c.void_reason : '') : '', c.notes || ''].filter(Boolean).join(' - ')];
    F('R', 8.8); const wraps = cols.map((col, j) => rtlWrap(doc, vals[j], col.w - 8)); const h = Math.max(18, ...wraps.map(w => w.length * 12 + 6));
    if(y + h > BOTTOM){ doc.addPage(); y = M; head(); }
    if(k % 2) doc.rect(M, y, CW, h).fill(ZEBRA);
    cols.forEach((col, j) => { F(c.voided ? 'R' : (j === 2 ? 'B' : 'R'), 8.8, c.voided ? '#999' : '#111');
      if(j === 2 || j === 1 || j === 0 || j === 5) numDraw(doc, vals[j], xs[j] - 3, y + 4, col.w - 6); else wraps[j].forEach((ln, n) => rtlDraw(doc, ln, xs[j] - 4, y + 4 + n * 12)); });
    if(c.voided) doc.moveTo(xs[2] - 6, y + 10).lineTo(xs[2] - cols[2].w + 6, y + 10).lineWidth(.7).strokeColor('#999').stroke();
    doc.moveTo(M, y + h).lineTo(R, y + h).lineWidth(.5).strokeColor(LINE).stroke(); y += h;
  });
  y += 10; F('R', 9, GRAY);
  rtlDraw(doc, 'المتبقي = قيمة الشيك الأصلية - مجموع دفعات السداد المعتمدة (الدفعات الملغية غير محسوبة)', R, y);
  const rg = doc.bufferedPageRange();
  for(let k = rg.start; k < rg.start + rg.count; k++){ doc.switchToPage(k); const fy = H - 34;
    doc.moveTo(M, fy - 4).lineTo(R, fy - 4).lineWidth(.5).strokeColor(LINE).stroke(); F('R', 8.5, GRAY);
    rtlDraw(doc, `صفحة ${k - rg.start + 1} من ${rg.count}`, R, fy); rtlDraw(doc, `حسابات المحل - أصدره ${who(me?.email)} - ${dmy(today())}`, M + 260, fy, {align:'left', width:260}); }
  doc.end(); await done;
  return new Blob(chunks.map(c => c instanceof Uint8Array ? c : new Uint8Array(c)), {type:'application/pdf'});
}
window.checkPdf = async pid => {
  const p = chkRow(pid); busy(true);
  try{
    const blob = await makeCheckPdf(p);
    const lat = ((store.eff.suppliers.get(p.supplier_id)?.name || '').match(/[A-Za-z0-9]+/g) || []).join('_') || 'S' + p.supplier_id;
    busy(false);
    await pdfPreview(blob, `Check_${p.check_no || p.id}_${lat}.pdf`, 'سجل سداد الشيك', `حسابات المحل\nسجل سداد شيك رقم ${p.check_no || ''} - ${store.eff.suppliers.get(p.supplier_id)?.name || ''}`);
  }catch(e){ console.error(e); toast('مقدرتش أعمل الملف: ' + (e.message || e), true); } finally{ busy(false); }
};

/* ---------- معاينة أي ملف PDF (صفحة صفحة) + تحميل ومشاركة ---------- */
async function pdfPreview(blob, name, title, text){
  closeModal(); document.querySelector('.st-view')?.remove();
  const v = document.createElement('div'); v.className = 'st-view';
  v.innerHTML = `<header class="top"><button class="iconbtn" aria-label="رجوع" onclick="stClosePreview()">${I.back}</button><h1>${esc(title)}</h1></header>
    <div class="st-pages" id="st-pages"><div class="spin" style="margin:40px auto"></div></div>
    <div class="st-nav"><button class="iconbtn" onclick="stGo(-1)" aria-label="اللي فاتت">${I.back}</button><b id="st-pn"></b><button class="iconbtn" onclick="stGo(1)" style="transform:scaleX(-1)" aria-label="الجاية">${I.back}</button>
      <span class="sep"></span><button class="iconbtn" onclick="stZoom(-1)">−</button><button class="iconbtn" onclick="stZoom(1)">+</button></div>
    <div class="st-bar" style="grid-template-columns:1fr 1fr"><button class="btn ghost" id="pv-dl">${I.save}تحميل</button><button class="btn green" id="pv-sh">${I.share}مشاركة</button></div>`;
  document.body.appendChild(v);
  const save = () => stSave({blob, name});
  $('#pv-dl').onclick = () => { save(); toast('اتحمّل الملف ✓'); };
  $('#pv-sh').onclick = async () => {
    const file = new File([blob], name, {type:'application/pdf'});
    if(!(navigator.canShare && navigator.canShare({files:[file]}))){ save(); return toast('الموبايل ده مش بيدعم مشاركة الملفات — نزّلت الملف', true); }
    try{ await navigator.share({files:[file], text, title}); }catch(e){ if(e.name !== 'AbortError'){ save(); toast('مقدرتش أفتح المشاركة — نزّلت الملف', true); } }
  };
  try{
    const pdfjs = await loadPdfJs();
    stPdf = await pdfjs.getDocument({data:new Uint8Array(await blob.arrayBuffer()), disableFontFace:true, useSystemFonts:false, isEvalSupported:false}).promise;
    stPage = 1; stScale = 1; await stRender();
  }catch(e){ $('#st-pages').innerHTML = `<div class="hint" style="color:#fff;padding:20px">المعاينة مش شغالة هنا — الملف جاهز للتحميل أو المشاركة.</div>`; }
}
