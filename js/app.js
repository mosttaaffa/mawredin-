/* الشيكات، الإعدادات، شاشات البداية، والتشغيل (لازم يتحمّل آخر واحد) */
/* =================== الشيكات =================== */
let chkFilter = 'pending', chkMore = null, chkShow = 150;
window.moreChecks = async () => { busy(true); try{ chkMore.rows = chkMore.rows.concat(await api.checksPage(chkMore.f, chkMore.rows.length)); await viewChecks(); }finally{ busy(false); } };
async function viewChecks(){
  if(!$('.chip-row')) shell({title:'الشيكات', right:refreshBtn, nav:'checks', body:skeleton('home')});
  let rows;
  if(chkFilter === 'pending' || chkFilter === 'partial'){ rows = await api.checks(); notifyChecks(rows); chkMore = null; if(chkFilter === 'partial') rows = rows.filter(c => checkInfo(c).pay === 'partial'); }
  else if(chkFilter === 'closed'){ rows = (await fetchAll(() => ldb.from('payments').select('*, suppliers(name)').eq('method','check').order('due_date', {ascending:false}).order('id', {ascending:false}))).filter(c => CHK_DEAD(c.check_status)); chkMore = null; }
  else { if(!chkMore || chkMore.f !== chkFilter){ chkMore = {f:chkFilter, rows: await api.checksPage(chkFilter, 0)}; } rows = chkMore.rows; }
  window._checks = rows;
  const allRows = rows; if(rows.length > chkShow) rows = rows.slice(0, chkShow);
  const openF = chkFilter === 'pending' || chkFilter === 'partial';
  const sum = allRows.reduce((a,c) => a + (openF ? chkRem(c) : Number(c.amount)), 0);
  const dueTxt = c => {
    if(c.check_status!=='pending') return chkTags(c);
    const d = daysUntil(c.due_date), part = checkInfo(c).pay === 'partial' ? '<span class="tag partial">مسدد جزئيًا</span>' : '';
    if(d < 0) return part + `<span class="chk-due over">متأخر ${-d} يوم</span>`;
    if(d === 0) return part + `<span class="chk-due over">مستحق النهارده</span>`;
    if(d <= 7) return part + `<span class="chk-due soon">باقي ${d} يوم</span>`;
    return part + `<span class="chk-due later">باقي ${d} يوم</span>`;
  };
  shell({title:'الشيكات', right:refreshBtn, nav:'checks', body:`
    <div class="chip-row">
      ${[['pending','لسه ما اتسددتش'],['partial','مسددة جزئيًا'],['cleared','مسددة بالكامل'],['closed','مرتدة / ملغاة / مستبدلة'],['all','الكل']].map(([k,l]) =>
        `<button class="chip ${chkFilter===k?'on':''}" onclick="chkFilter='${k}';chkMore=null;chkShow=150;viewChecks()">${l}</button>`).join('')}
    </div>
    <div class="card hero" style="padding:12px 14px"><div class="lbl">${openF ? 'المتبقي للسداد' : 'إجمالي المعروض'} (${allRows.length} شيك)</div><div class="big" style="font-size:24px">${money(sum)}</div></div>
    <div class="card list">${rows.length ? rows.map(c => `
      <div class="item" onclick="showCheck(${c.id})">
        <div class="ico ${CHK_DEAD(c.check_status)?'bounced':'pay'}">${I.check}</div>
        <div class="grow"><div class="t">${esc(c.suppliers?.name)}</div>
          <div class="s">يستحق ${fmtDate(c.due_date)}${c.check_no?' · رقم <span class="num">'+esc(c.check_no)+'</span>':''}</div></div>
        <div style="text-align:left"><div class="amt">${money(c.check_status === 'pending' ? chkRem(c) : c.amount)}</div>${c.check_status === 'pending' && chkRem(c) < Number(c.amount) ? `<div class="runbal">من ${money(c.amount)}</div>` : ''}${dueTxt(c)}</div>
      </div>`).join('') : `<div class="empty">${I.check}<div>مفيش شيكات هنا</div></div>`}</div>
    ${(chkFilter === 'cleared' || chkFilter === 'all') && rows.length && rows.length % 100 === 0 ? `<button class="btn ghost block" onclick="moreChecks()">عرض أقدم</button>` : ''}
    ${allRows.length > rows.length ? `<button class="btn ghost block" onclick="chkShow+=200;viewChecks()">عرض المزيد (باقي ${allRows.length - rows.length})</button>` : ''}`});
}
window.showCheck = async id => {
  const c = window._checks.find(x => x.id === id) || {...chkRow(id), suppliers:{name:store.eff.suppliers.get(chkRow(id)?.supplier_id)?.name}};
  openModal(`<h3>شيك — ${esc(c.suppliers?.name)}</h3>
    <div class="kv"><span>المبلغ</span><span>${money(c.amount)}</span></div>
    <div class="kv"><span>رقم الشيك</span><span class="num">${esc(c.check_no||'—')}</span></div>
    <div class="kv"><span>البنك</span><span>${esc(c.bank||'—')}</span></div>
    <div class="kv"><span>تاريخ الاستحقاق</span><span>${fmtDate(c.due_date)}</span></div>
    <div class="kv"><span>اتكتب يوم</span><span>${fmtDate(c.pay_date)}</span></div>
    <div id="chkpanel"></div>
    ${imgSection('payments', c)}
    <button class="btn ghost block" style="margin-top:10px" onclick="go('/s/${c.supplier_id}')">افتح حساب المورد</button>`);
  fillGallery('payments', c);
  drawCheckPanel(c.id, `chkMore=null;viewChecks().then(()=>showCheck(${c.id}))`);
};

/* =================== الإعدادات =================== */
async function viewSettings(){
  const members = await api.members();
  if(IS_LOCAL){ try{ lanUrls = (await (await fetch('/local-info')).json()).urls || []; }catch(e){} }
  shell({title:'الإعدادات', back:true, nav:'more', body:`
    <div class="card"><div class="section-t">حسابك</div>
      <div class="kv"><span>اسمك في السجل</span><span><b>${esc(who(me.email))}</b> <button class="link" onclick="editName('${esc(me.email)}')">تغيير</button></span></div>
      <div class="kv" style="border:0"><span>الإيميل</span><span class="num">${esc(me.email)}</span></div>
      ${!myMember(members)?.display_name ? '<div class="note-line">اكتب اسمك عشان يظهر في سجل العمليات بدل الإيميل</div>' : ''}</div>
    <div class="card"><div class="section-t">المستخدمين (${members.length} من 2) — نفس الصلاحيات الكاملة</div>
      ${members.map(m => `<div class="mem-row">
        <div class="avatar">${esc((m.display_name || m.email).trim()[0])}</div>
        <div class="grow"><div class="t">${esc(m.display_name || shortName(m.email))}${m.email === me.email ? ' <span class="tag cleared">إنت</span>' : ''}</div><div class="s num">${esc(m.email)}</div></div>
        <button class="link" onclick="editName('${esc(m.email)}')">الاسم</button>
        ${!m.is_owner && m.email !== me.email ? `<button class="link" style="color:var(--red)" onclick="delMember('${esc(m.email)}')">إزالة</button>` : ''}
      </div>`).join('')}
      ${members.length < 2 ? `<div class="field" style="margin-top:12px"><label>إضافة المستخدم التاني (أخوك)</label>
        <input id="newm" type="email" inputmode="email" placeholder="إيميله الحقيقي" dir="ltr" style="margin-bottom:8px">
        <div class="picker"><input id="newn" placeholder="اسمه اللي يظهر في السجل (مثلًا: محمد)"><button class="btn primary" onclick="addMember()">إضافة</button></div>
        <div class="hint">بعد الإضافة: يفتح التطبيق على موبايله ويدوس «أول مرة؟ اعمل حساب جديد» بنفس الإيميل ويختار كلمة السر بتاعته بنفسه، وبعدين يأكد من الرسالة اللي هتوصله على الإيميل. إنت مش محتاج تعرف كلمة السر بتاعته.</div></div>`
        : '<div class="hint" style="margin-top:8px">التطبيق متاح لمستخدمين اتنين بس.</div>'}
    </div>
    <div class="card"><div class="section-t">رقمي الشخصي لاستقبال كشوف الحساب</div>
      <div class="picker"><input id="mywa" type="tel" inputmode="tel" dir="ltr" placeholder="01xxxxxxxxx" value="${esc(localStorage.getItem('mawredin_my_wa') || '')}"><button class="btn primary" onclick="saveMyWa()">حفظ</button></div>
      <div class="hint">بيتحفظ على الموبايل ده، وبيستخدم في «إرسال الكشف لرقمي» على واتساب.</div></div>
    <div class="card"><div class="section-t">تثبيت التطبيق على الموبايل</div>
      <button class="btn ghost block" onclick="go('/install')">${I.share}طريقة التثبيت على الآيفون والأندرويد</button></div>
    ${IS_LOCAL ? `<div class="card"><div class="section-t">افتحه من أي جهاز على نفس الشبكة</div>
      <div class="hint" style="margin-bottom:8px">الموبايل لازم يكون على نفس الواي فاي، والكمبيوتر يفضل شغال وشاشة التشغيل مفتوحة.</div>
      ${lanUrls.length ? lanUrls.map(u => `<div class="kv"><span>العنوان</span><span class="num" style="user-select:all">${esc(u)}</span></div>`).join('') : '<div class="hint">مش لاقي عنوان شبكة للكمبيوتر</div>'}
    </div>` : ''}
    <div class="card"><div class="section-t">ابعت التطبيق</div>
      <div class="hint" style="margin-bottom:10px">${IS_LOCAL ? 'ابعت عنوان الشبكة لأخوك يفتحه من موبايله وهو على نفس الواي فاي.' : 'الرابط ده بيفتح التطبيق جاهز ومتوصّل بقاعدة البيانات — ابعته لأخوك على واتساب.'}</div>
      <button class="btn ghost block" onclick="shareApp()">${I.share}مشاركة رابط التطبيق</button></div>
    <div class="card"><div class="section-t">تنبيهات الشيكات</div>
      <div class="set-row"><span class="hint" style="margin:0">${!('Notification' in window) || !window.isSecureContext ? 'الإشعارات محتاجة رابط https — هتشتغل بعد الرفع أونلاين. التنبيه جوه التطبيق شغال دايمًا.' : Notification.permission === 'granted' ? 'شغالة ✓ — هيجيلك إشعار يوم الاستحقاق واليوم اللي قبله' : 'إشعار على الموبايل قبل ميعاد الشيك بيوم ويوم الاستحقاق'}</span>
      ${('Notification' in window) && window.isSecureContext && Notification.permission !== 'granted' ? `<button class="btn primary" onclick="enableNotifs()">${I.bell}تشغيل</button>` : ''}</div>
    </div>
    <div class="card"><div class="section-t">البيانات</div>
      <button class="btn primary block" style="margin-bottom:10px" onclick="go('/backups')">${I.save}النسخ الاحتياطية وحماية البيانات</button>
      <button class="btn ghost block" style="margin-bottom:10px" onclick="exportExcel()">${I.xls}تصدير Excel</button>
      <button class="btn ghost block" onclick="go('/log')">${I.hist}سجل التعديلات (مين عمل إيه)</button>
    </div>
    <div class="card"><div class="section-t">ألوان التطبيق</div>
      <div class="themes">
        ${[['bordeaux','أبيض وعنابي (الأساسي)',['#FFFFFF','#9B1B30','#D11A2A']],['greige','جريج ووردي',['#F2EEE9','#B77991','#A68B67']],['navy','كحلي ودهبي',['#0b1530','#d4a64a','#f8efdc']],['rose','زيتي ووردي',['#6b7f5e','#d88c9a','#f6d6dc']],['mint','نعناعي',['#0f8a66','#26b386','#d5f3e5']],['olive','زيتوني ودهبي',['#6a7955','#c9a15b','#f7f2ea']]].map(([k,l,c]) =>
          `<button class="${(document.documentElement.dataset.theme||'bordeaux')===k?'on':''}" onclick="setTheme('${k}')"><span class="sw">${c.map(x=>`<i style="background:${x}"></i>`).join('')}</span>${l}</button>`).join('')}
      </div></div>
    <div class="card">
      <button class="btn danger block" onclick="logout()">${I.logout}خروج</button>
      <button class="link" style="display:block;margin:10px auto 0;color:var(--muted)" onclick="resetCfg()">تغيير إعدادات الاتصال</button>
    </div>`});
}
window.setTheme = t => {
  document.documentElement.setAttribute('data-theme', t);
  try{ localStorage.setItem('mawredin_theme', t); }catch(e){}
  const m = document.querySelector('meta[name=theme-color]'); if(m) m.content = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  buzz(10); viewSettings();
};
window.saveMyWa = () => {
  const v = $('#mywa').value.trim();
  if(v && !waNormalize(v)) return toast('الرقم مش صحيح', true);
  if(v) localStorage.setItem('mawredin_my_wa', v); else localStorage.removeItem('mawredin_my_wa');
  toast(v ? 'اتحفظ رقمك ✓' : 'اتشال الرقم');
};
const myMember = list => list.find(m => m.email === String(me.email).toLowerCase());
// إضافة/إزالة مستخدم لازم تكون أونلاين (عشان تتطبق على طول ومتعدّيش على طابور المزامنة)
window.addMember = async () => {
  const e = $('#newm').value.trim().toLowerCase(), n = $('#newn').value.trim();
  if(!/^\S+@\S+\.\S+$/.test(e)) return toast('اكتب إيميل صحيح', true);
  if(!n) return toast('اكتب اسمه اللي يظهر في السجل', true);
  if(!navigator.onLine) return toast('إضافة مستخدم محتاجة نت', true);
  busy(true);
  try{
    const { error } = await withTimeout(sb.from('members').insert({email:e, display_name:n}), 15000);
    if(error) throw error;
    await syncNow(); toast('اتضاف ✓ — قوله يعمل حساب بنفس الإيميل'); viewSettings();
  }catch(err){ toast(/row-level|policy/i.test(err.message || '') ? 'التطبيق متاح لمستخدمين اتنين بس' : errMsg(err), true); } finally{ busy(false); }
};
window.delMember = async e => {
  if(!confirm(`إزالة ${who(e)} (${e})؟ مش هيقدر يدخل التطبيق تاني، وكل اللي سجّله هيفضل موجود.`)) return;
  if(!navigator.onLine) return toast('إزالة مستخدم محتاجة نت', true);
  try{ const { error } = await withTimeout(sb.from('members').delete().eq('email', e), 15000); if(error) throw error; await syncNow(); viewSettings(); }
  catch(err){ toast(errMsg(err), true); }
};
window.editName = async e => {
  const cur = store.eff.members.get(e)?.display_name || '';
  const n = prompt('الاسم اللي يظهر في سجل العمليات:', cur); if(n == null) return;
  const v = n.trim(); if(!v) return toast('الاسم مينفعش يبقى فاضي', true);
  try{ await q(ldb.from('members').update({display_name:v}).eq('email', e)); toast('اتحفظ ✓'); viewSettings(); }catch(err){ toast(errMsg(err), true); }
};
window.shareApp = async () => {
  const link = shareLink();
  if(navigator.share){ try{ await navigator.share({title:'حسابات المحل', url:link}); return; }catch(e){ if(e.name==='AbortError') return; } }
  try{ await navigator.clipboard.writeText(link); toast('اتنسخ الرابط ✓'); }catch(e){ prompt('انسخ الرابط:', link); }
};
window.resetCfg = async () => { if(!confirm('هتمسح إعدادات الاتصال من الجهاز ده؟')) return; try{ await sb.auth.signOut(); }catch(e){} localStorage.removeItem(CFG_KEY); location.reload(); };

/* =================== تثبيت التطبيق (PWA) =================== */
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; });
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
function viewInstall(){
  const ios = isIOS(), url = location.origin + location.pathname;
  shell({title:'تثبيت التطبيق', back:true, nav:'more', body:`
    ${isStandalone() ? '<div class="card"><div class="ek hl"><span>الحالة</span><b>التطبيق متثبت وشغال من الأيقونة ✓</b></div></div>' : ''}
    <div class="card inst ${ios ? 'on' : ''}">
      <div class="section-t">الآيفون (لازم من Safari)</div>
      <ol>
        <li>افتح الرابط ده في <b>Safari</b> (مش Chrome): <span class="num" style="user-select:all">${esc(url)}</span></li>
        <li>دوس زرار المشاركة ${I.share} اللي تحت في النص.</li>
        <li>انزل واختار <b>«إضافة إلى الشاشة الرئيسية»</b> (Add to Home Screen).</li>
        <li>دوس <b>«إضافة»</b> — هتلاقي أيقونة «حسابات المحل» على الشاشة.</li>
        <li>افتحه من الأيقونة دايمًا (مش من Safari) عشان يشتغل كتطبيق ويفضل محتفظ ببياناته من غير نت.</li>
      </ol></div>
    <div class="card inst ${!ios ? 'on' : ''}">
      <div class="section-t">الأندرويد (من Chrome)</div>
      ${installEvt ? `<button class="btn primary block" style="margin-bottom:10px" onclick="doInstall()">${I.plus}ثبّت التطبيق دلوقتي</button>` : ''}
      <ol>
        <li>افتح الرابط في <b>Chrome</b>: <span class="num" style="user-select:all">${esc(url)}</span></li>
        <li>دوس على التلات نقط ⋮ فوق.</li>
        <li>اختار <b>«تثبيت التطبيق»</b> أو «إضافة إلى الشاشة الرئيسية».</li>
        <li>وافق — الأيقونة هتظهر مع باقي التطبيقات.</li>
      </ol></div>
    <div class="card"><div class="section-t">بعد التثبيت</div>
      <div class="hint">• أول مرة لازم يكون فيه نت عشان البيانات تتحمّل على الموبايل.<br>• كل واحد يدخل بحسابه هو (إيميله وكلمة السر بتاعته).<br>• أي حاجة بتتسجل من غير نت بتتبعت لوحدها لما النت يرجع وتفتح التطبيق.</div></div>`});
}
window.doInstall = async () => { if(!installEvt) return; installEvt.prompt(); await installEvt.userChoice.catch(() => {}); installEvt = null; viewInstall(); };

/* =================== شاشات البداية =================== */
function logoImg(){ return '<div class="logos"><img src="icons/ward.png" alt="ورد"><img src="icons/zahra.png" alt="زهرة"></div>'; }
const headLogos = '<div class="hlogos"><img src="icons/ward.png" alt=""><img src="icons/zahra.png" alt=""></div>';
function viewSetup(){
  $('#app').innerHTML = `${petals()}<div class="center-page">${logoImg()}
    <h2>إعداد أول مرة</h2><p class="sub2">من Supabase ‹ Project Settings ‹ API</p>
    <form id="cf">
      <div class="field"><label>Project URL</label><input id="cu" dir="ltr" placeholder="https://xxxx.supabase.co" required></div>
      <div class="field"><label>Publishable key (أو anon key)</label><textarea id="ck" dir="ltr" rows="3" required></textarea></div>
      <button class="btn primary block" type="submit">حفظ</button>
    </form></div>`;
  $('#cf').onsubmit = e => {
    e.preventDefault();
    const url = $('#cu').value.trim().replace(/\/+$/,''), key = $('#ck').value.trim();
    if(!/^https:\/\/.+/.test(url) || key.length < 20) return toast('راجع الرابط والمفتاح', true);
    localStorage.setItem(CFG_KEY, JSON.stringify({url, key})); boot();
  };
}
function viewLogin(mode='in', firstTime=false){
  $('#app').innerHTML = `${petals()}<div class="center-page">${logoImg()}
    <h2>حسابات المحل</h2><p class="sub2" style="margin:-2px 0 6px;font-weight:700;color:var(--brand)">ورد · زهرة</p><p class="sub2">${firstTime ? 'أول تشغيل: اكتب إيميلك واختار كلمة سر (6 حروف أو أكتر) — الحساب ده هيبقى صاحب التطبيق' : mode==='in'?'سجّل دخول':'حساب جديد'}</p>
    <form id="lf">
      <div class="field"><label>الإيميل</label><input id="le" type="email" inputmode="email" dir="ltr" autocomplete="username" required></div>
      <div class="field"><label>كلمة السر</label><input id="lp" type="password" dir="ltr" autocomplete="${mode==='in'?'current-password':'new-password'}" required></div>
      <button class="btn primary block" type="submit">${mode==='in'?'دخول':'إنشاء الحساب'}</button>
    </form>
    <button class="link" style="margin-top:10px" onclick="viewLogin('${mode==='in'?'up':'in'}')">${mode==='in'?'أول مرة؟ اعمل حساب جديد':'عندك حساب؟ سجّل دخول'}</button></div>`;
  $('#lf').onsubmit = async e => {
    e.preventDefault(); busy(true);
    const email = $('#le').value.trim(), password = $('#lp').value;
    try{
      if(mode==='in'){ const { error } = await sb.auth.signInWithPassword({email, password}); if(error) throw error; window._loginPw = password; }
      else{
        const { data, error } = await sb.auth.signUp({email, password, options:{emailRedirectTo: location.origin + location.pathname}}); if(error) throw error;
        if(!data.session){ busy(false); toast('اتعمل الحساب — افتح الإيميل وأكّده وبعدين ادخل'); return viewLogin('in'); }
      }
      await afterLogin();
      if(window._loginPw && me?.email){ const pw = window._loginPw; window._loginPw = null; await vaultRestore(me.email, pw); }   // عمليات كانت محفوظة مشفرة عند الخروج
    }catch(err){ toast(errMsg(err), true); } finally{ busy(false); window._loginPw = null; }
  };
}
window.viewLogin = viewLogin;
function viewNotMember(){
  $('#app').innerHTML = `${petals()}<div class="center-page">${logoImg()}
    <h2>حسابك لسه مش مضاف</h2>
    <p class="sub2">اطلب من صاحب التطبيق يضيف الإيميل ده من الإعدادات:<br><b class="num">${esc(me.email)}</b></p>
    <button class="btn primary block" onclick="afterLogin()">جرّب تاني</button>
    <button class="link" style="margin-top:10px" onclick="logout()">خروج</button></div>`;
}
const USER_KEY = 'mawredin_user';
async function afterLogin(){
  let session = null, cached = null;
  try{ cached = JSON.parse(localStorage.getItem(USER_KEY) || 'null'); }catch(e){}
  try{ ({ data:{ session } } = await withTimeout(sb.auth.getSession(), 6000)); }catch(e){}
  if(!session && !cached){
    if(IS_LOCAL){ try{ const i = await (await fetch('/local-info')).json(); if(!i.hasUsers) return viewLogin('up', true); }catch(e){} }
    return viewLogin();
  }
  // من غير نت (أو الجلسة محتاجة تجديد): بنكمل بآخر حساب دخل على الجهاز ده والبيانات المحفوظة عليه
  me = session ? session.user : {email: cached.email, id: cached.id};
  if(cached && cached.email !== me.email) cached = null;
  try{ await storeOpen(me.email); }
  catch(e1){ console.warn('أول محاولة لفتح البيانات فشلت — بنجرب تاني', e1); await new Promise(r => setTimeout(r, 600)); try{ await storeOpen(me.email); }catch(e2){} }
  if(!store.ready){ $('#app').innerHTML = `<div class="center-page">${logoImg()}<h2>مش قادر أخزن البيانات على الجهاز</h2><p class="sub2">لو المتصفح في وضع التصفح الخاص اقفله وافتح التطبيق عادي، أو فضّي مساحة على الموبايل.</p><button class="btn primary block" onclick="location.reload()">حاول تاني</button></div>`; return; }
  isOwner = !!cached?.owner;
  const checkMember = async () => {
    const r = await rpcNet('join_app', {}, 8000);
    if(!r.ok){ localStorage.removeItem(USER_KEY); viewNotMember(); return false; }
    isOwner = r.owner;
    localStorage.setItem(USER_KEY, JSON.stringify({email: me.email, id: me.id, owner: r.owner}));
    return true;
  };
  if(session){
    if(cached) checkMember().catch(() => {});                 // اتأكدنا قبل كده: نفتح على طول ونتأكد في الخلفية
    else { try{ if(!await checkMember()) return; }catch(e){ if(!isNetErr(e)) throw e; } }
  }
  if(!hasLocalData()){
    $('#app').innerHTML = `${petals()}<div class="center-page">${logoImg()}<h2>بنجهز البيانات على الجهاز</h2><p class="sub2" id="firstload">أول مرة بس — بعد كده التطبيق هيفتح على طول حتى من غير نت</p><div class="spin" style="margin:16px auto"></div></div>`;
    await syncNow(true);
    if(!hasLocalData()){
      $('#app').innerHTML = `${petals()}<div class="center-page">${logoImg()}<h2>محتاج نت أول مرة</h2><p class="sub2">التطبيق محتاج يجيب البيانات من السيرفر مرة واحدة، وبعد كده يشتغل من غير نت.</p><button class="btn primary block" onclick="afterLogin()">حاول تاني</button><button class="link" style="margin-top:10px" onclick="logout()">خروج</button></div>`;
      return;
    }
  }
  route();
  scheduleSync(400);
  setTimeout(() => healthCheck(), 1500);
  setTimeout(() => movedCheck(), 2500);
  setTimeout(() => usageCheck().then(() => { if((location.hash === '' || location.hash === '#/') && usageAlert() && !document.querySelector('.us-alert')) viewDashboard(); }), 4000);
}

/* =================== التشغيل =================== */
async function boot(){
  readCfgFromUrl();
  const cfg = getCfg();
  if(!cfg) return viewSetup();
  sb = supabase.createClient(cfg.url, cfg.key, {auth:{persistSession:true, autoRefreshToken:true}});
  try{ await afterLogin(); }catch(e){ console.error(e); toast(errMsg(e), true); viewLogin(); }
}
// لما ترجع للتطبيق: المزامنة بتشتغل لوحدها (store.js) وبتعيد رسم الصفحة لو فيه جديد
if('serviceWorker' in navigator){
  // أي نسخة جديدة تترفع: الموبايل يحدّث لوحده من غير ما تمسح حاجة
  const hadCtrl = !!navigator.serviceWorker.controller; let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if(hadCtrl && !reloaded){ reloaded = true; location.reload(); } });
  navigator.serviceWorker.register('sw.js', {updateViaCache:'none'}).then(reg => {
    const upd = () => { if(navigator.onLine) reg.update().catch(() => {}); };   // من غير نت: مفيش فحص تحديث (كان بيطلع خطأ في Safari)
    upd();
    document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'visible') upd(); });
    addEventListener('online', upd);
  }).catch(()=>{});
}
boot();
