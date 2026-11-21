/* =================== حماية البيانات ===================
   1) تشفير (AES-GCM 256 بمفتاح من كلمة السر PBKDF2-SHA256)
   2) الخزنة: العمليات اللي لسه ما اتزامنتش بتتحفظ مشفرة عند الخروج وترجع عند دخول نفس الحساب
   3) مراقبة الاتصال بالسيرفر (والتفرقة بين «مفيش نت عندك» و«السيرفر واقف»)
   4) النسخ الاحتياطي اليدوي + فحص سلامة النسخة + شاشة «النسخ الاحتياطية وحماية البيانات» */

/* ---------- 1) التشفير ---------- */
const PBKDF2_ITER = 310000;
const b64 = buf => { const u = new Uint8Array(buf); let s = ''; for(let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768)); return btoa(s); };
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const sha256hex = async buf => [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map(x => x.toString(16).padStart(2, '0')).join('');
async function pwKey(pw, salt, iter = PBKDF2_ITER){
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2', salt, iterations:iter, hash:'SHA-256'}, k, {name:'AES-GCM', length:256}, false, ['encrypt', 'decrypt']);
}
async function encryptBytes(bytes, pw){
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({name:'AES-GCM', iv}, await pwKey(pw, salt), bytes);
  return {kdf:{alg:'PBKDF2-SHA256', iter:PBKDF2_ITER, salt:b64(salt)}, cipher:{alg:'AES-256-GCM', iv:b64(iv)}, ct};
}
async function decryptBytes(env, ct, pw){
  try{ return await crypto.subtle.decrypt({name:'AES-GCM', iv:unb64(env.cipher.iv)}, await pwKey(pw, unb64(env.kdf.salt), env.kdf.iter), ct); }
  catch(e){ throw new Error('كلمة السر غلط أو الملف متعدّل'); }
}
const blobToB64 = async b => b64(await b.arrayBuffer());

/* ---------- 2) الخزنة: العمليات المعلقة عند الخروج ----------
   قاعدة منفصلة (mawredin-vault) عن بيانات الحساب. كل خزنة باسم إيميل صاحبها ومشفرة بكلمة سره:
   - محدش يقدر يقرا عمليات حساب تاني (حتى لو فتح التطبيق على نفس الموبايل) من غير كلمة السر بتاعته
   - بتترجع بس بعد ما السيرفر يأكد كلمة السر وقت الدخول بنفس الإيميل */
const vdb = {
  open(){ return new Promise((res, rej) => { const r = indexedDB.open('mawredin-vault', 1); r.onupgradeneeded = () => r.result.createObjectStore('vaults', {keyPath:'email'}); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
  async get(email){ const d = await vdb.open(); return new Promise((res, rej) => { const r = d.transaction('vaults').objectStore('vaults').get(email); r.onsuccess = () => { d.close(); res(r.result); }; r.onerror = () => rej(r.error); }); },
  async put(v){ const d = await vdb.open(); return new Promise((res, rej) => { const t = d.transaction('vaults', 'readwrite'); t.objectStore('vaults').put(v); t.oncomplete = () => { d.close(); res(); }; t.onerror = () => rej(t.error); }); },
  async del(email){ const d = await vdb.open(); return new Promise((res, rej) => { const t = d.transaction('vaults', 'readwrite'); t.objectStore('vaults').delete(email); t.oncomplete = () => { d.close(); res(); }; t.onerror = () => rej(t.error); }); },
};
const OP_TBL = {loans:'قرض', loan_payments:'قسط قرض', daily_sales:'مبيع يوم', suppliers:'مورد', invoices:'فاتورة', payments:'دفعة', check_payments:'سداد شيك', employees:'موظف', emp_settlements:'تسوية موظف', emp_transactions:'حركة موظف', members:'مستخدم', _files:'صورة'};
const opAmount = o => Number(o.row?.amount ?? o.changes?.amount ?? 0) || 0;
function pendingOps(){ return store.queue.filter(o => o.status !== 'done'); }
function pendingSummary(ops){
  const money_ = ops.filter(o => o.table !== '_files' && opAmount(o));
  return {n:ops.length, total:money_.reduce((a, o) => a + opAmount(o), 0), files:ops.filter(o => o.table === '_files').length,
    lines:ops.slice(0, 12).map(o => `${({insert:'إضافة', update:'تعديل', delete:'مسح', upload:'رفع', rmfile:'مسح'})[o.kind]} ${OP_TBL[o.table] || o.table}${opAmount(o) ? ' · ' + opAmount(o).toLocaleString('en-US') + ' ج' : ''} · ${new Date(o.at).toLocaleDateString('en-GB')} · ${who(o.by)}${o.status === 'conflict' ? ' · تعارض' : o.status === 'failed' ? ' · فشل' : ''}`)};
}

// زرار «خروج»
window.logout = async () => {
  const ops = pendingOps();
  if(!ops.length) return doLogout();
  const s = pendingSummary(ops);
  openModal(`<h3>فيه عمليات لسه ما وصلتش السيرفر</h3>
    <div class="kv"><span>عدد العمليات</span><b>${s.n}${s.files ? ` (منها ${s.files} صورة)` : ''}</b></div>
    <div class="kv"><span>إجمالي المبالغ</span><b>${money(s.total)}</b></div>
    <div class="vault-list">${s.lines.map(l => `<div>• ${esc(l)}</div>`).join('')}${ops.length > 12 ? `<div>… و${ops.length - 12} كمان</div>` : ''}</div>
    <div class="hint" style="margin:10px 0">الخروج العادي بيمسح بيانات الجهاز — فاختار:</div>
    <button class="btn primary block" id="lo-sync">${I.refresh}مزامنة العمليات ثم الخروج</button>
    <button class="btn ghost block" style="margin-top:8px" onclick="closeModal()">إلغاء الخروج والرجوع للتطبيق</button>
    <button class="btn ghost block" style="margin-top:8px" id="lo-keep">${I.lock || ''}احتفظ بيها مشفرة على الجهاز واخرج</button>`);
  $('#lo-sync').onclick = async () => {
    if(!navigator.onLine) return toast('مفيش نت — اتصل وجرب تاني، أو اختار «احتفظ بيها مشفرة»', true);
    busy(true); try{ await syncNow(true); }finally{ busy(false); }
    const left = pendingOps();
    if(!left.length){ closeModal(); toast('كل العمليات وصلت السيرفر ✓'); return doLogout(); }
    toast(`لسه ${left.length} عملية${left.some(o => o.status === 'conflict' || o.status === 'failed') ? ' محتاجة مراجعة من «المزامنة»' : ' — السيرفر ما أكدش استلامها'}`, true);
    closeModal(); openSync();
  };
  $('#lo-keep').onclick = () => vaultForm(ops);
};
function vaultForm(ops){
  openModal(`<h3>حفظ العمليات مشفرة</h3>
    <div class="hint" style="margin-bottom:10px">هتتشفر بكلمة سر حسابك (${esc(me.email)}). مش هتترجع غير لما تدخل تاني بنفس الإيميل وكلمة السر — وبعدها بتتزامن لوحدها. أي حساب تاني على الموبايل ده مش هيقدر يشوفها.</div>
    <div class="field" id="f-vp1"><label>كلمة سر حسابك</label><input id="vp1" type="password" dir="ltr" autocomplete="current-password"></div>
    <div class="field" id="f-vp2"><label>اكتبها تاني</label><input id="vp2" type="password" dir="ltr" autocomplete="current-password"></div>
    <button class="btn primary block" id="vsave">تشفير وخروج</button>
    <button class="btn ghost block" style="margin-top:8px" onclick="closeModal()">رجوع</button>`);
  $('#vsave').onclick = async () => {
    const p1 = $('#vp1').value, p2 = $('#vp2').value;
    if(!p1) return markErr('vp1', 'اكتب كلمة السر');
    if(p1 !== p2) return markErr('vp2', 'الكلمتين مش زي بعض');
    busy(true);
    try{
      // لو فيه نت: السيرفر يأكد إن دي كلمة السر الصح (عشان الخزنة تتفتح بعدين)
      if(navigator.onLine){
        const { error } = await withTimeout(sb.auth.signInWithPassword({email:me.email, password:p1}), 15000).catch(e => ({error:isNetErr(e) ? null : e}));
        if(error) throw new Error('كلمة السر مش صح لحساب ' + me.email);
      }
      await vaultSave(ops, p1);
      busy(false); closeModal(); toast('العمليات اتحفظت مشفرة ✓');
      await doLogout(true);
    }catch(e){ toast(errMsg(e), true); } finally{ busy(false); }
  };
}
async function vaultSave(ops, pw){
  const blobs = [];
  for(const o of ops.filter(o => o.kind === 'upload')){ const b = await idb.get('blobs', o.key); if(b) blobs.push({path:b.path, type:b.blob.type, at:b.at, data:await blobToB64(b.blob)}); }
  const payload = {v:1, email:me.email, saved_at:new Date().toISOString(), ops, blobs, idmap:store.meta.idmap || {}, summary:pendingSummary(ops)};
  const plain = new TextEncoder().encode(JSON.stringify(payload));
  const env = await encryptBytes(plain, pw), sha = await sha256hex(plain);
  const old = await vdb.get(me.email).catch(() => null);
  if(old) throw new Error('فيه عمليات محفوظة قبل كده لنفس الحساب ولسه ما اترجعتش — ادخل وخليها تتزامن الأول');
  await vdb.put({email:me.email, at:payload.saved_at, n:ops.length, kdf:env.kdf, cipher:env.cipher, ct:env.ct, sha});
  // نتأكد إن الخزنة بتتفتح فعلًا قبل ما نمسح أي حاجة
  const back = await vdb.get(me.email), dec = await decryptBytes(back, back.ct, pw);
  if(await sha256hex(dec) !== sha) throw new Error('فشل التحقق من الحفظ المشفر — مفيش حاجة اتمسحت');
}
async function doLogout(vaulted = false){
  if(!vaulted && pendingOps().length) return toast('فيه عمليات لسه — مش هخرج', true);
  try{ await withTimeout(sb.auth.signOut(), 5000); }catch(e){}
  try{ await sb.auth.signOut({scope:'local'}); }catch(e){}            // من غير نت: نمسح الجلسة من الموبايل برضه
  try{ Object.keys(localStorage).filter(k => /^sb-.*-auth-token$/.test(k)).forEach(k => localStorage.removeItem(k)); }catch(e){}
  // بيانات الجلسة ونسخة الجهاز بتتمسح — الخزنة المشفرة (لو فيه) في قاعدة منفصلة ومبتتلمسش
  try{ if(idb.db) idb.db.close(); await idb.drop(dbName(store.email || me?.email)); }catch(e){}
  localStorage.removeItem(USER_KEY);
  location.hash = '#/'; location.reload();
}
// بعد الدخول بكلمة السر: لو فيه خزنة لنفس الإيميل نرجّعها ونكمل مزامنتها
async function vaultRestore(email, pw){
  let v; try{ v = await vdb.get(email); }catch(e){ return; }
  if(!v) return;
  try{
    const dec = await decryptBytes(v, v.ct, pw);
    if(await sha256hex(dec) !== v.sha) throw new Error('الملف متعدّل');
    const p = JSON.parse(new TextDecoder().decode(dec));
    if(p.email !== email) throw new Error('الخزنة دي مش لحسابك');
    await storeOpen(email);
    for(const b of p.blobs) await idb.put('blobs', {path:b.path, at:b.at, blob:new Blob([unb64(b.data)], {type:b.type})});
    const have = new Set(store.queue.map(o => o.op_id));
    const add = p.ops.filter(o => !have.has(o.op_id)).map(o => ({...o, status:o.status === 'sending' ? 'pending' : o.status}));
    if(add.length) await idb.put('queue', add);
    store.queue = store.queue.concat(add).sort((a, b) => a.seq - b.seq);
    if(p.idmap) await setMeta('idmap', Object.assign({}, p.idmap, store.meta.idmap || {})), store.idmap = store.meta.idmap;
    rebuild();
    await vdb.del(email);
    toast(`رجعت ${add.length} عملية كانت محفوظة مشفرة — بتتزامن دلوقتي`);
    scheduleSync(500);
  }catch(e){
    console.warn(e);
    openModal(`<h3>فيه عمليات محفوظة مشفرة لحسابك</h3><div class="hint" style="margin-bottom:10px">${v.n} عملية من ${new Date(v.at).toLocaleString('ar-EG')} مقدرتش أفتحها بكلمة السر الحالية (ممكن تكون غيرتها). اكتب كلمة السر اللي كانت وقت الخروج:</div>
      <div class="field" id="f-vold"><input id="vold" type="password" dir="ltr"></div><button class="btn primary block" id="vopen">افتح</button>
      <button class="btn ghost block" style="margin-top:8px" onclick="closeModal()">بعدين (هتفضل محفوظة)</button>`);
    $('#vopen').onclick = async () => { closeModal(); await vaultRestore(email, $('#vold')?.value || ''); };
  }
}

/* ---------- 3) مراقبة الاتصال بالسيرفر ---------- */
const health = {state:'unknown', since:Date.now(), last:0, fails:0, code:null, busy:false};
async function healthCheck(){
  if(health.busy || !sb) return health.state; health.busy = true;
  const set = (st, code = null) => { if(health.state !== st){ health.state = st; health.since = Date.now(); } health.code = code; health.last = Date.now(); };
  try{
    if(!navigator.onLine){ set('offline'); return health.state; }
    const cfg = getCfg();
    let r = null;
    try{ r = await withTimeout(fetch(cfg.url + '/rest/v1/members?select=email&limit=1', {headers:{apikey:cfg.key, Authorization:'Bearer ' + ((await sb.auth.getSession()).data.session?.access_token || cfg.key)}, cache:'no-store'}), 10000); }catch(e){ r = null; }
    if(r && r.ok){ set('ok'); health.fails = 0; sync.online = true; return health.state; }
    if(r && (r.status === 401 || r.status === 403)){ set('auth', r.status); return health.state; }
    // السيرفر مردش: هل النت نفسه شغال؟ (طلب لموقع التطبيق نفسه من غير كاش)
    let net = false;
    try{ const p = await withTimeout(fetch('icons/icon-192.png?ping=' + Date.now(), {cache:'no-store', method:'HEAD'}), 6000); net = p.ok || p.status > 0; }catch(e){ net = false; }
    if(!net){ set('offline'); sync.online = false; return health.state; }
    health.fails++;
    set(r && r.status === 540 ? 'paused' : 'server', r ? r.status : 'no-response');
    return health.state;
  }finally{ health.busy = false; syncUI(); healthBanner(); }
}
const HEALTH_AR = {unknown:'بنتأكد من الاتصال…', ok:'متصل بالسيرفر', offline:'مفيش نت على الموبايل', server:'السيرفر مش بيرد', paused:'مشروع Supabase متوقف', auth:'محتاج تسجل دخول تاني'};
function healthBanner(){
  const bad = (health.state === 'server' || health.state === 'paused') && (health.fails >= 3 || health.state === 'paused');
  let el = document.getElementById('health-banner');
  if(!bad){ el?.remove(); return; }
  if(!el){ el = document.createElement('button'); el.id = 'health-banner'; el.className = 'health-banner'; el.onclick = () => healthHelp(); document.body.appendChild(el); }
  el.innerHTML = `${I.bell}<span>${HEALTH_AR[health.state]} من ${Math.max(1, Math.round((Date.now() - health.since) / 60000))} دقيقة — شغلك محفوظ على الموبايل</span>`;
}
window.healthHelp = () => openModal(`<h3>${HEALTH_AR[health.state]}</h3>
  <div class="hint">النت عندك شغال، لكن قاعدة البيانات مش بترد${health.code ? ` (كود ${esc(String(health.code))})` : ''}. أي حاجة بتسجلها محفوظة على الموبايل وهتتبعت لوحدها لما السيرفر يرجع — متخرجش من التطبيق.</div>
  <div class="section-t" style="margin-top:12px">لو المشروع متوقف (Paused)</div>
  <ol class="hint" style="padding-inline-start:18px;line-height:1.9">
    <li>ادخل <b>supabase.com/dashboard</b> بالحساب اللي عملت بيه المشروع.</li>
    <li>افتح مشروع «WARD &amp; ZAHRA» — هتلاقي عليه «Paused».</li>
    <li>دوس <b>Restore project</b> واستنى دقيقتين لحد ما يبقى «Healthy».</li>
    <li>ارجع للتطبيق ودوس «مزامنة الآن».</li></ol>
  <div class="hint">المشروع المجاني بيتوقف لو مفيش استخدام أسبوع، وبيفضل قابل للاسترجاع 90 يوم. البيانات مبتتمسحش بالتوقف.</div>
  <button class="btn primary block" style="margin-top:12px" onclick="closeModal();healthCheck().then(()=>syncNow(true))">${I.refresh}افحص الاتصال تاني</button>`);
// فحص كل دقيقتين والتطبيق مفتوح وظاهر (من غير ما نعتبره وسيلة لمنع توقف المشروع)
setInterval(() => { if(document.visibilityState === 'visible' && store.ready) healthCheck(); }, 120000);
document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'visible' && store.ready) healthCheck(); });
window.addEventListener('online', () => setTimeout(healthCheck, 800));
window.addEventListener('offline', () => { health.state = 'offline'; health.since = Date.now(); syncUI(); healthBanner(); });

/* ---------- 4) النسخ الاحتياطي اليدوي ---------- */
const BK_FORMAT = 'mawredin-backup', BK_VERSION = 1, BK_KEY = 'mawredin_last_backup';
const BK_TABLES = ['suppliers','invoices','payments','check_payments','employees','emp_settlements','emp_transactions','emp_import_batches','loans','loan_payments','daily_sales','members','activity_log'];
const BK_REL = {invoices:{supplier_id:'suppliers.id'}, payments:{supplier_id:'suppliers.id', invoice_id:'invoices.id', replaced_by:'payments.id'}, check_payments:{payment_id:'payments.id'},
  emp_settlements:{employee_id:'employees.id', batch_id:'emp_import_batches.id'}, emp_transactions:{employee_id:'employees.id'}, loan_payments:{loan_id:'loans.id'}};
const BK_AR = {suppliers:'الموردين', invoices:'الفواتير', payments:'المدفوعات والمرتجعات والخصومات والشيكات', check_payments:'دفعات سداد الشيكات', employees:'الموظفين',
  emp_settlements:'تسويات المرتبات', emp_transactions:'حركات الموظفين (سلف وخصومات وعمولات)', emp_import_batches:'كشوف الموظفين المستوردة', loans:'القروض', loan_payments:'أقساط القروض', daily_sales:'المبيع اليومي', members:'المستخدمين', activity_log:'سجل التعديلات'};
const backupAge = () => { const d = localStorage.getItem(BK_KEY); return d ? Math.floor((new Date(today()) - new Date(d)) / 864e5) : null; };
function computeTotals(T){
  const C2 = v => Math.round(Number(v || 0) * 100);
  const live = (T.check_payments || []).filter(c => !c.voided);
  return {invoices:(T.invoices || []).reduce((a, x) => a + C2(x.amount), 0) / 100, payments:(T.payments || []).reduce((a, x) => a + C2(x.amount), 0) / 100,
    check_payments:live.reduce((a, x) => a + C2(x.amount), 0) / 100};
}
async function buildBackup(withFiles, prog){
  if(!navigator.onLine) throw new Error('النسخة الاحتياطية محتاجة نت عشان تتسحب من السيرفر نفسه (مش من الموبايل بس)');
  const tables = {}, counts = {};
  for(const t of BK_TABLES){
    prog(`بسحب ${BK_AR[t]}…`);
    tables[t] = await fetchAllNet(() => sb.from(t).select('*').order(t === 'members' ? 'email' : 'id'));   // أي خطأ = النسخة بتفشل (مفيش نسخة ناقصة)
    counts[t] = tables[t].length;
  }
  const paths = [...new Set(BK_TABLES.flatMap(t => tables[t]).flatMap(r => r ? [r.image_path, ...(Array.isArray(r.extra_images) ? r.extra_images : []), r.source_image] : []).filter(p => typeof p === 'string' && p))];
  const files = [];
  for(let i = 0; i < paths.length; i++){
    const f = {path:paths[i]};
    if(withFiles){
      prog(`بنزّل المرفقات ${i + 1} من ${paths.length}…`);
      try{
        const u = await signedUrl(paths[i]); if(!u) throw new Error('مش موجود على السيرفر');
        const r = await withTimeout(fetch(u), 60000); if(!r.ok) throw new Error(r.status === 404 || r.status === 400 ? 'مش موجود على السيرفر' : 'HTTP ' + r.status);
        const buf = await r.arrayBuffer(); f.size = buf.byteLength; f.sha256 = await sha256hex(buf); f.type = r.headers.get('content-type') || ''; f.data = b64(buf);
      }catch(e){
        if(!navigator.onLine || isNetErr(e)) throw new Error('النت فصل أثناء تنزيل المرفقات');   // انقطاع = النسخة بتفشل كلها
        f.missing = e.message || 'غير متاح';                                                      // ملف مش موجود أصلًا على السيرفر = بيتسجل
      }
    }
    files.push(f);
  }
  const balances = supplierBalances(), emps = employeeBalances();
  const payload = {format:BK_FORMAT, format_version:BK_VERSION, app_version:(document.querySelector('meta[name=app-version]')?.content || ''), created_at:new Date().toISOString(),
    created_by:me.email, kind:withFiles ? 'full' : 'data', counts, totals:{...computeTotals(tables), supplier_balance:balances.reduce((a, s) => a + Number(s.balance), 0), employee_balance:emps.reduce((a, e) => a + Number(e.balance), 0)},
    relations:BK_REL, tables, files, unsynced_ops:pendingOps().map(o => ({op_id:o.op_id, table:o.table, kind:o.kind, status:o.status, at:o.at, by:o.by, row:o.row, changes:o.changes, key:o.key}))};
  return payload;
}
async function packBackup(payload, pw){
  const plain = new TextEncoder().encode(JSON.stringify(payload)), sha = await sha256hex(plain);
  const head = {format:BK_FORMAT, format_version:BK_VERSION, created_at:payload.created_at, kind:payload.kind, counts:payload.counts, files:payload.files.length, payload_sha256:sha, encrypted:!!pw};
  if(!pw) return new Blob([JSON.stringify({...head, payload})], {type:'application/json'});
  const env = await encryptBytes(plain, pw);
  return new Blob([JSON.stringify({...head, kdf:env.kdf, cipher:env.cipher, data:b64(env.ct)})], {type:'application/octet-stream'});
}
// فحص سلامة ملف نسخة (بيتعمل على الموبايل بس — مفيش أي استعادة من المتصفح)
async function checkBackupFile(file, pw){
  const out = {ok:false, problems:[]}, head = JSON.parse(await file.text());
  if(head.format !== BK_FORMAT) throw new Error('الملف ده مش نسخة احتياطية من «حسابات المحل»');
  if(head.format_version > BK_VERSION) out.problems.push(`إصدار النسخة (${head.format_version}) أحدث من التطبيق — حدّث التطبيق`);
  let plain;
  if(head.encrypted){ if(!pw) throw Object.assign(new Error('الملف مشفر — اكتب كلمة سر النسخة'), {needPw:true}); plain = new Uint8Array(await decryptBytes(head, unb64(head.data), pw)); }
  else plain = new TextEncoder().encode(JSON.stringify(head.payload));
  const sha = await sha256hex(plain);
  if(sha !== head.payload_sha256) out.problems.push('بصمة الملف (SHA-256) مش مطابقة — الملف اتعدّل أو اتلف');
  const p = head.encrypted ? JSON.parse(new TextDecoder().decode(plain)) : head.payload;
  for(const [t, n] of Object.entries(p.counts || {})) if((p.tables[t] || []).length !== n) out.problems.push(`عدد ${BK_AR[t] || t} مش مطابق (${(p.tables[t] || []).length} ≠ ${n})`);
  const tt = computeTotals(p.tables); for(const k of Object.keys(tt)) if(Math.round(tt[k] * 100) !== Math.round(p.totals[k] * 100)) out.problems.push(`إجمالي ${k} مش مطابق`);
  // العلاقات: كل رقم مربوط لازم يكون موجود
  for(const [t, rel] of Object.entries(p.relations || {})) for(const [col, ref] of Object.entries(rel)){
    const [rt] = ref.split('.'), ids = new Set((p.tables[rt] || []).map(r => r.id));
    const miss = (p.tables[t] || []).filter(r => r[col] != null && !ids.has(r[col])).length;
    if(miss) out.problems.push(`${miss} سجل في ${BK_AR[t] || t} مربوط بـ ${BK_AR[rt] || rt} مش موجود في النسخة`);
  }
  // تكرار الأرقام
  for(const t of BK_TABLES){ const ids = (p.tables[t] || []).map(r => r.id ?? r.email); if(new Set(ids).size !== ids.length) out.problems.push(`أرقام مكررة في ${BK_AR[t] || t}`); }
  let fOk = 0, fBad = 0;
  for(const f of p.files || []){ if(!f.data) continue; const h = await sha256hex(unb64(f.data)); if(h === f.sha256) fOk++; else fBad++; }
  if(fBad) out.problems.push(`${fBad} مرفق تالف`);
  const missing = (p.files || []).filter(f => f.missing).length;
  Object.assign(out, {missing, ok:!out.problems.length, created_at:p.created_at, by:p.created_by, kind:p.kind, counts:p.counts, totals:p.totals, files:(p.files || []).length, filesWithData:fOk + fBad, filesOk:fOk, unsynced:(p.unsynced_ops || []).length, version:p.format_version});
  return out;
}

window.backupNow = () => {
  openModal(`<h3>نسخة احتياطية جديدة</h3>
    <div class="seg" id="bk-kind" style="grid-template-columns:1fr 1fr;margin-bottom:10px">
      <button type="button" data-v="data" class="on" onclick="segPick(this)">${I.doc}بيانات بس</button>
      <button type="button" data-v="full" onclick="segPick(this)">${I.img}بيانات + المرفقات</button></div>
    <div class="hint" style="margin-bottom:10px">النسخة بتتسحب من السيرفر نفسه. «بيانات + المرفقات» فيها صور الفواتير والإيصالات (حجمها أكبر).</div>
    <div class="field" id="f-bp1"><label>كلمة سر للنسخة (لتشفيرها) — 8 حروف أو أكتر</label><input id="bp1" type="password" dir="ltr" autocomplete="new-password"></div>
    <div class="field" id="f-bp2"><label>اكتبها تاني</label><input id="bp2" type="password" dir="ltr" autocomplete="new-password"></div>
    <div class="hint" style="margin-bottom:10px">احفظ كلمة السر دي في مكان آمن — من غيرها الملف مبيتفتحش. مفيش في الملف أي كلمة سر لحسابك ولا مفاتيح للسيرفر.</div>
    <button class="btn primary block" id="bk-go">${I.save}إنشاء وتنزيل النسخة</button>`);
  $('#bk-go').onclick = async () => {
    const p1 = $('#bp1').value, p2 = $('#bp2').value, kind = $('#bk-kind .on').dataset.v;
    if(p1.length < 8) return markErr('bp1', 'كلمة السر لازم 8 حروف أو أكتر');
    if(p1 !== p2) return markErr('bp2', 'الكلمتين مش زي بعض');
    closeModal();
    const ov = document.createElement('div'); ov.className = 'st-ov'; ov.innerHTML = `<div class="st-ovb"><div class="spin"></div><b id="bk-prog">بنجهز…</b></div>`; document.body.appendChild(ov);
    const prog = t => { const e = document.getElementById('bk-prog'); if(e) e.textContent = t; };
    try{
      const payload = await buildBackup(kind === 'full', prog);
      prog('بشفّر الملف…'); const blob = await packBackup(payload, p1);
      prog('بتأكد إن الملف سليم ويتفتح…');
      const chk = await checkBackupFile(new File([blob], 'x'), p1);
      if(!chk.ok) throw new Error('النسخة اتعملت لكن الفحص لقى مشكلة: ' + chk.problems.join('، '));
      const name = `نسخة احتياطية حسابات المحل ${today()} ${kind === 'full' ? 'كاملة' : 'بيانات'}.mawbak`;
      download(blob, name);
      localStorage.setItem(BK_KEY, today());
      const rows = Object.values(payload.counts).reduce((a, n) => a + n, 0);
      try{ await sb.from('backup_runs').insert({kind:'manual', ok:true, verified:true, size_bytes:blob.size, rows_total:rows, details:{counts:payload.counts, kind, files:payload.files.length, missing_files:payload.files.filter(f => f.missing).length}}); }catch(e){}
      ov.remove();
      const miss = payload.files.filter(f => f.missing);
      openModal(`<h3>${miss.length ? `النسخة اتعملت — مع ${miss.length} مرفق مش موجود على السيرفر` : 'النسخة اتعملت واتفحصت ✓'}</h3>
        ${miss.length ? `<div class="note-line" style="margin-bottom:8px">المرفقات دي مسجلة في البيانات لكن ملفاتها مش موجودة على السيرفر أصلًا (مش مشكلة في النسخة): ${miss.slice(0, 5).map(f => esc(f.path)).join('، ')}${miss.length > 5 ? '…' : ''}</div>` : ''}
        <div class="hint" style="margin-bottom:8px">${esc(name)} · ${(blob.size / 1048576).toFixed(2)} ميجا · ${rows} سجل${payload.files.length ? ` · ${payload.files.length} مرفق${kind === 'full' ? '' : ' (أسماء بس)'}` : ''}</div>
        ${Object.entries(payload.counts).map(([t, n]) => `<div class="kv"><span>${BK_AR[t]}</span><b>${n}</b></div>`).join('')}
        ${payload.unsynced_ops.length ? `<div class="note-line" style="margin-top:8px">فيه ${payload.unsynced_ops.length} عملية على الموبايل لسه ما وصلتش السيرفر — محفوظة في الملف كمعلومة، لكنها مش جزء من بيانات السيرفر.</div>` : ''}
        <div class="hint" style="margin-top:10px">ابعت الملف لنفسك على واتساب أو احفظه على Google Drive.</div>
        <button class="btn primary block" style="margin-top:10px" onclick="closeModal();viewBackups()">تمام</button>`);
    }catch(e){ ov.remove(); console.error(e); openModal(`<h3>النسخة ما اكتملتش</h3><div class="hint" style="margin-bottom:12px">${esc(errMsg(e))}<br><br>مفيش أي ملف ناقص اتنزّل.</div><button class="btn primary block" onclick="closeModal();backupNow()">حاول تاني</button>`); }
  };
};
window.backupJson = () => backupNow();
window.checkBackup = () => {
  openModal(`<h3>فحص سلامة نسخة</h3><div class="hint" style="margin-bottom:10px">اختار ملف نسخة (.mawbak). الفحص بيحصل على الموبايل بس ومش بيغير أي بيانات.</div>
    <div class="field"><input id="ckf" type="file" accept=".mawbak,.json,application/json,application/octet-stream"></div>
    <div class="field" id="f-ckp"><label>كلمة سر النسخة</label><input id="ckp" type="password" dir="ltr"></div>
    <button class="btn primary block" id="ckgo">افحص</button><div id="ckres" style="margin-top:12px"></div>`);
  $('#ckgo').onclick = async () => {
    const f = $('#ckf').files[0]; if(!f) return toast('اختار الملف', true);
    busy(true);
    try{
      const r = await checkBackupFile(f, $('#ckp').value);
      $('#ckres').innerHTML = `<div class="note-line" style="${r.ok ? 'background:var(--green-soft);color:var(--green)' : ''}">${r.ok ? '✓ النسخة سليمة ومكتملة' : '✗ فيها مشاكل: ' + r.problems.map(esc).join('، ')}</div>
        <div class="kv"><span>اتعملت</span><b>${new Date(r.created_at).toLocaleString('ar-EG')} · ${esc(who(r.by))}</b></div>
        <div class="kv"><span>النوع</span><b>${r.kind === 'full' ? 'بيانات + مرفقات' : 'بيانات بس'} · إصدار ${r.version}</b></div>
        ${Object.entries(r.counts).map(([t, n]) => `<div class="kv"><span>${BK_AR[t] || t}</span><b>${n}</b></div>`).join('')}
        <div class="kv"><span>المرفقات</span><b>${r.files}${r.filesWithData ? ` (سليم ${r.filesOk})` : ' (أسماء بس)'}${r.missing ? ` · ${r.missing} مش موجود على السيرفر وقت النسخ` : ''}</b></div>`;
    }catch(e){ if(e.needPw) markErr('ckp', e.message); else toast(errMsg(e), true); } finally{ busy(false); }
  };
};

/* ---------- 5) شاشة «النسخ الاحتياطية وحماية البيانات» ---------- */
async function viewBackups(){
  shell({title:'النسخ الاحتياطية', back:true, nav:'more', body:skeleton('home')});
  if(navigator.onLine) await healthCheck();
  const usage = await usageCheck(true);
  let runs = [], runsErr = null;
  try{ const { data, error } = await withTimeout(sb.from('backup_runs').select('*').order('created_at', {ascending:false}).limit(30), 10000); if(error) throw error; runs = data; }catch(e){ runsErr = e; }
  const lastAuto = runs.find(r => r.kind === 'auto'), lastAutoOk = runs.find(r => r.kind === 'auto' && r.ok && r.verified), lastMan = runs.find(r => r.kind === 'manual' && r.ok);
  const ops = pendingOps(), rows = Object.values(store.base).reduce((a, m) => a + m.size, 0);
  const dt = d => d ? new Date(d).toLocaleString('ar-EG', {day:'numeric', month:'numeric', year:'numeric', hour:'numeric', minute:'2-digit'}) : '—';
  const ageH = d => d ? Math.round((Date.now() - new Date(d)) / 36e5) : null;
  const autoState = !lastAuto ? {c:'warn', t:'لسه مفيش نسخ تلقائية — محتاج إعداد GitHub (شوف تحت)'}
    : !lastAuto.ok ? {c:'bad', t:'آخر نسخة تلقائية فشلت ' + dt(lastAuto.created_at)}
    : !lastAuto.verified ? {c:'warn', t:'آخر نسخة اتحفظت لكن اختبار استعادتها ما نجحش'}
    : ageH(lastAuto.created_at) > 36 ? {c:'warn', t:`آخر نسخة ناجحة من ${Math.round(ageH(lastAuto.created_at) / 24)} يوم — النسخ اليومي واقف؟`}
    : {c:'ok', t:'شغالة ✓ — آخر نسخة اتعملت واتجربت استعادتها'};
  shell({title:'النسخ الاحتياطية', back:true, nav:'more', body:`
    <div class="card"><div class="section-t">حالة الاتصال</div>
      <div class="kv"><span>السيرفر</span><b class="h-${health.state}">${HEALTH_AR[health.state]}</b></div>
      <div class="kv"><span>آخر فحص</span><span>${dt(health.last)}</span></div>
      <div class="kv"><span>آخر مزامنة ناجحة</span><span>${dt(sync.lastOk)}</span></div>
      <div class="kv" style="border:0"><span>عمليات على الموبايل لسه ما وصلتش</span><b>${ops.length}${ops.length ? ` · ${money(pendingSummary(ops).total)}` : ''}</b></div>
      ${health.state === 'server' || health.state === 'paused' ? `<button class="btn ghost block" style="margin-top:8px" onclick="healthHelp()">إزاي أرجّع السيرفر؟</button>` : ''}</div>
    ${usageCard(usage)}
    <div class="card"><div class="section-t">النسخ التلقائي اليومي (خارج Supabase، مشفر)</div>
      <div class="note-line bk-${autoState.c}">${autoState.t}</div>
      ${runsErr ? `<div class="hint">مقدرتش أقرا سجل النسخ (${navigator.onLine ? 'السيرفر' : 'مفيش نت'}).</div>` : ''}
      ${lastAutoOk ? `<div class="kv"><span>آخر نسخة ناجحة</span><span>${dt(lastAutoOk.created_at)}</span></div>
        <div class="kv"><span>الحجم</span><span>${(lastAutoOk.size_bytes / 1048576).toFixed(2)} ميجا</span></div>
        <div class="kv"><span>السجلات</span><span>${lastAutoOk.rows_total}</span></div>
        <div class="kv"><span>الصور المحفوظة</span><span>${lastAutoOk.details?.storage_files ?? '—'}</span></div>
        <div class="kv" style="border:0"><span>اختبار الاستعادة</span><b style="color:var(--green)">نجح — الأعداد والأرصدة مطابقة</b></div>` : ''}
      <div class="hint" style="margin-top:6px">بتتعمل كل يوم 3 الفجر على مستودع GitHub خاص: قاعدة البيانات كاملة + الصور، مشفرة، وبيتجرب استرجاعها على قاعدة منفصلة كل مرة. آخر 30 يوم + آخر 12 شهر. لو فشلت بيوصلك إيميل.</div></div>
    <div class="card"><div class="section-t">نسخة يدوية</div>
      <div class="kv"><span>آخر نسخة يدوية</span><span>${lastMan ? dt(lastMan.created_at) + ' · ' + esc(who(lastMan.created_by)) : backupAge() != null ? 'من ' + backupAge() + ' يوم (الموبايل ده)' : '—'}</span></div>
      <div class="kv" style="border:0"><span>السجلات على الموبايل</span><span>${rows}</span></div>
      <div class="actions" style="margin-top:10px"><button class="btn primary" onclick="backupNow()">${I.save}إنشاء وتنزيل نسخة</button><button class="btn ghost" onclick="checkBackup()">فحص سلامة نسخة</button></div>
      <div class="hint" style="margin-top:8px">ملف مشفر بكلمة سر تختارها (بيانات بس، أو بيانات + صور). بيتفحص تلقائيًا بعد ما يتعمل.</div></div>
    <div class="card"><div class="section-t">الاستعادة</div>
      <div class="hint" style="line-height:1.9">الاستعادة مش بتتعمل من التطبيق — عشان محدش يستبدل البيانات بالغلط من الموبايل.
        بتتعمل من الكمبيوتر بأداة الاستعادة اللي في مستودع النسخ الخاص: بتتجرب الأول على قاعدة اختبار منفصلة وتتطابق الأعداد والأرصدة، وقبل أي استعادة على البيانات الحقيقية بتاخد نسخة من الوضع الحالي وبتطلب تأكيد صريح.
        نسخة التطبيق اليدوية بتتضاف بالأداة دي برضه من غير تكرار ومن غير ما تغيّر أي سجل موجود.</div></div>
    ${runs.length ? `<div class="card"><div class="section-t">آخر النسخ</div><div class="list">${runs.slice(0, 10).map(r => `<div class="item"><div class="grow"><div class="t">${r.kind === 'auto' ? 'تلقائية' : 'يدوية'} · ${r.ok ? (r.verified ? '✓ سليمة' : '⚠ مش متجربة') : '✗ فشلت'}</div><div class="s">${dt(r.created_at)}${r.size_bytes ? ' · ' + (r.size_bytes / 1048576).toFixed(2) + ' ميجا' : ''}${r.error ? ' · ' + esc(r.error) : ''}</div></div></div>`).join('')}</div></div>` : ''}`});
}
window.viewBackups = viewBackups;

/* =================== مراقبة حدود الخطة المجانية ===================
   الحدود دي حسب صفحة أسعار Supabase (اتراجعت نوفمبر 2026) — ممكن تتغير، فبنعرضها كأرقام مش كضمان.
   السحب الشهري (Egress) مش متاح من جوه قاعدة البيانات — بيتشاف من لوحة Supabase ← Usage. */
const USAGE_LIMITS = {db_bytes:{t:'حجم قاعدة البيانات', max:500 * 1048576}, storage_bytes:{t:'الصور والمرفقات', max:1024 * 1048576}, users:{t:'المستخدمين', max:50000}};
const USAGE_KEY = 'mawredin_usage';
const usageCached = () => { try{ return JSON.parse(localStorage.getItem(USAGE_KEY) || 'null'); }catch(e){ return null; } };
async function usageCheck(force){
  const c = usageCached();
  if(!force && c && Date.now() - c.checked < 6 * 36e5) return c;
  if(!navigator.onLine) return c;
  try{
    const { data, error } = await withTimeout(sb.rpc('usage_stats'), 10000); if(error) throw error;
    let lastAuto = null;
    try{ const r = await withTimeout(sb.from('backup_runs').select('created_at,ok,verified').eq('kind', 'auto').order('created_at', {ascending:false}).limit(1), 8000); lastAuto = r.data?.[0] || null; }catch(e){}
    const v = {...(data || {}), lastAuto, checked:Date.now()};
    localStorage.setItem(USAGE_KEY, JSON.stringify(v));
    return v;
  }catch(e){ return c; }
}
function usageLevels(u){
  if(!u) return [];
  return Object.entries(USAGE_LIMITS).filter(([k]) => u[k] != null).map(([k, L]) => ({k, t:L.t, v:+u[k], max:L.max, pct:Math.min(100, Math.round(+u[k] / L.max * 1000) / 10)}));
}
const fmtBytes = b => b >= 1073741824 ? (b / 1073741824).toFixed(2) + ' جيجا' : (b >= 104857600 ? Math.round(b / 1048576) : (b / 1048576).toFixed(1)) + ' ميجا';
// تنبيه الرئيسية: حد قرب يخلص، أو النسخ التلقائي وقف بعد ما كان شغال
function usageAlert(){
  const u = usageCached(); if(!u) return '';
  const hot = usageLevels(u).filter(x => x.pct >= 70).sort((a, b) => b.pct - a.pct)[0];
  if(hot) return `<button class="mini-alert us-alert ${hot.pct >= 90 ? 'bad' : ''}" onclick="go('/backups')">${I.warn}<span>${hot.t} وصل ${hot.pct}% من الحد المجاني</span><b>التفاصيل</b></button>`;
  const a = u.lastAuto;
  if(a && (Date.now() - new Date(a.created_at)) > 48 * 36e5) return `<button class="mini-alert us-alert" onclick="go('/backups')">${I.warn}<span>النسخ التلقائي اليومي واقف من ${Math.floor((Date.now() - new Date(a.created_at)) / 864e5)} يوم</span><b>افحص</b></button>`;
  if(a && !a.ok) return `<button class="mini-alert us-alert bad" onclick="go('/backups')">${I.warn}<span>آخر نسخة تلقائية فشلت</span><b>افحص</b></button>`;
  return '';
}
function usageCard(u){
  const lv = usageLevels(u);
  if(!lv.length) return `<div class="card"><div class="section-t">استهلاك الخطة المجانية</div><div class="hint">${navigator.onLine ? 'مقدرتش أقرا الاستهلاك من السيرفر دلوقتي.' : 'محتاج نت عشان أقرا الاستهلاك.'}</div></div>`;
  return `<div class="card"><div class="section-t">استهلاك الخطة المجانية (Supabase)</div>
    ${lv.map(x => `<div class="us-r"><div class="us-h"><span>${x.t}</span><b>${x.k === 'users' ? x.v + ' من ' + x.max.toLocaleString('en-US') : fmtBytes(x.v) + ' من ' + fmtBytes(x.max)}</b></div>
      <div class="us-bar ${x.pct >= 90 ? 'bad' : x.pct >= 70 ? 'warn' : ''}"><i style="width:${Math.max(1, x.pct)}%"></i></div><small>${x.pct}%</small></div>`).join('')}
    ${u.files != null ? `<div class="kv"><span>عدد الصور</span><span>${u.files}</span></div>` : ''}
    <div class="kv" style="border:0"><span>آخر قراءة</span><span>${new Date(u.checked).toLocaleString('ar-EG', {day:'numeric', month:'numeric', hour:'numeric', minute:'2-digit'})}</span></div>
    <div class="hint">التنبيه بيظهر في الرئيسية لما أي حد يوصل 70%. السحب الشهري (5 جيجا) بيتشاف من لوحة Supabase ← Usage. المشروع المجاني بيتوقف لو مفيش استخدام أسبوع — النسخ اليومي بيلمسه كل يوم.</div></div>`;
}

/* =================== نقل التطبيق لرابط جديد ===================
   لما التطبيق يتنقل لاستضافة تانية: في config.js على الرابط القديم بنحط  movedTo: 'https://الرابط-الجديد/'
   التخزين على الموبايل مربوط بالرابط، فالرابط القديم بيخلص مزامنة كل العمليات اللي على الجهاز الأول،
   وبعدين بس يوجّه للرابط الجديد (اللي بيحمل كل البيانات من السيرفر). مفيش عملية بتضيع. */
async function movedCheck(){
  const to = window.MAWREDIN_CONFIG?.movedTo;
  if(!to || location.href.startsWith(to)) return;
  if(navigator.onLine && pendingOps().length) { try{ await syncNow(true); }catch(e){} }
  const left = pendingOps().length;
  openModal(`<h3>التطبيق اتنقل لرابط جديد</h3>
    ${left ? `<div class="note-line bk-warn">فيه ${left} عملية على الموبايل ده لسه ما اتبعتتش للسيرفر. خليك هنا ووصّل النت لحد ما تتبعت — بعدها افتح الرابط الجديد.</div>
      <div class="actions" style="margin-top:12px"><button class="btn primary" onclick="closeModal();syncNow(true).then(movedCheck)">ابعتها دلوقتي</button></div>`
    : `<div class="note-line bk-ok">كل البيانات اتبعتت للسيرفر ✓ ومفيش حاجة هتضيع.</div>
      <div class="hint" style="margin:8px 0 12px">افتح الرابط الجديد وسجّل دخول بنفس الإيميل. على الآيفون: من Safari ← مشاركة ← «إضافة إلى الشاشة الرئيسية»، وامسح الأيقونة القديمة.</div>
      <div class="kv" style="border:0"><span dir="ltr" class="num" style="word-break:break-all">${esc(to)}</span></div>
      <div class="actions" style="margin-top:12px"><button class="btn primary" onclick="location.href=${esc(JSON.stringify(to))}">افتح الرابط الجديد</button>
      <button class="btn ghost" onclick="navigator.clipboard?.writeText(${esc(JSON.stringify(to))});toast('اتنسخ')">انسخ الرابط</button></div>`}`);
}
