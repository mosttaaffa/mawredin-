/* الشيكات، الإعدادات، شاشات البداية، والتشغيل (لازم يتحمّل آخر واحد) */
/* =================== الشيكات =================== */
let chkFilter = 'pending', chkMore = null, chkShow = 150;
window.moreChecks = async () => { busy(true); try{ chkMore.rows = chkMore.rows.concat(await api.checksPage(chkMore.f, chkMore.rows.length)); await viewChecks(); }finally{ busy(false); } };
async function viewChecks(){
  if(!$('.chip-row')) shell({title:'الشيكات', right:refreshBtn, nav:'checks', body:skeleton('home')});
  let rows;
  if(chkFilter === 'pending'){ rows = await api.checks(); notifyChecks(rows); chkMore = null; }
  else { if(!chkMore || chkMore.f !== chkFilter){ chkMore = {f:chkFilter, rows: await api.checksPage(chkFilter, 0)}; } rows = chkMore.rows; }
  window._checks = rows;
  const allRows = rows; if(chkFilter === 'pending' && rows.length > chkShow) rows = rows.slice(0, chkShow);
  const sum = allRows.reduce((a,c)=>a+Number(c.amount),0);
  const dueTxt = c => {
    if(c.check_status!=='pending') return `<span class="tag ${c.check_status}">${CHK[c.check_status]}</span>`;
    const d = daysUntil(c.due_date);
    if(d < 0) return `<span class="chk-due over">فات ميعاده من ${-d} يوم</span>`;
    if(d === 0) return `<span class="chk-due over">النهارده</span>`;
    if(d <= 7) return `<span class="chk-due soon">باقي ${d} يوم</span>`;
    return `<span class="chk-due later">باقي ${d} يوم</span>`;
  };
  shell({title:'الشيكات', right:refreshBtn, nav:'checks', body:`
    <div class="chip-row">
      ${[['pending','لسه ما اتصرفتش'],['cleared','اتصرفت'],['bounced','ارتدت'],['all','الكل']].map(([k,l]) =>
        `<button class="chip ${chkFilter===k?'on':''}" onclick="chkFilter='${k}';chkMore=null;chkShow=150;viewChecks()">${l}</button>`).join('')}
    </div>
    <div class="card hero" style="padding:12px 14px"><div class="lbl">${chkFilter === 'pending' ? 'الإجمالي' : 'إجمالي المعروض'} (${allRows.length} شيك)</div><div class="big" style="font-size:24px">${money(sum)}</div></div>
    <div class="card list">${rows.length ? rows.map(c => `
      <div class="item" onclick="showCheck(${c.id})">
        <div class="ico ${c.check_status==='bounced'?'bounced':'pay'}">${I.check}</div>
        <div class="grow"><div class="t">${esc(c.suppliers?.name)}</div>
          <div class="s">يستحق ${fmtDate(c.due_date)}${c.check_no?' · رقم <span class="num">'+esc(c.check_no)+'</span>':''}</div></div>
        <div style="text-align:left"><div class="amt">${money(c.amount)}</div>${dueTxt(c)}</div>
      </div>`).join('') : `<div class="empty">${I.check}<div>مفيش شيكات هنا</div></div>`}</div>
    ${chkFilter !== 'pending' && rows.length && rows.length % 100 === 0 ? `<button class="btn ghost block" onclick="moreChecks()">عرض أقدم</button>` : ''}
    ${chkFilter === 'pending' && allRows.length > rows.length ? `<button class="btn ghost block" onclick="chkShow+=200;viewChecks()">عرض المزيد (باقي ${allRows.length - rows.length})</button>` : ''}`});
}
window.showCheck = async id => {
  const c = window._checks.find(x => x.id === id);
  openModal(`<h3>شيك — ${esc(c.suppliers?.name)}</h3>
    <div class="kv"><span>المبلغ</span><span>${money(c.amount)}</span></div>
    <div class="kv"><span>رقم الشيك</span><span class="num">${esc(c.check_no||'—')}</span></div>
    <div class="kv"><span>البنك</span><span>${esc(c.bank||'—')}</span></div>
    <div class="kv"><span>تاريخ الاستحقاق</span><span>${fmtDate(c.due_date)}</span></div>
    <div class="kv"><span>اتكتب يوم</span><span>${fmtDate(c.pay_date)}</span></div>
    <div class="kv"><span>الحالة</span><span><span class="tag ${c.check_status}">${CHK[c.check_status]}</span></span></div>
    ${imgSection('payments', c)}
    ${checkButtons(c, 'viewChecks()')}
    <button class="btn ghost block" style="margin-top:10px" onclick="go('/s/${c.supplier_id}')">افتح حساب المورد</button>`);
  if(c.image_path) $('#mimg').innerHTML = await imgBlock(c.image_path);
};

/* =================== الإعدادات =================== */
async function viewSettings(){
  const members = await api.members();
  if(IS_LOCAL){ try{ lanUrls = (await (await fetch('/local-info')).json()).urls || []; }catch(e){} }
  shell({title:'الإعدادات', back:true, nav:'more', body:`
    <div class="card"><div class="section-t">حسابك</div>
      <div class="kv" style="border:0"><span>داخل باسم</span><span class="num">${esc(me.email)}</span></div></div>
    <div class="card"><div class="section-t">مين يقدر يستخدم التطبيق</div>
      ${members.map(m => `<div class="kv"><span class="num">${esc(m.email)}</span><span>${m.is_owner?'صاحب التطبيق':`<button class="link" style="color:var(--red)" onclick="delMember('${esc(m.email)}')">إزالة</button>`}</span></div>`).join('')}
      <div class="field" style="margin-top:12px"><label>أضف إيميل (أخوك مثلاً)</label>
        <div class="picker"><input id="newm" type="email" inputmode="email" placeholder="email@example.com" dir="ltr"><button class="btn primary" onclick="addMember()">إضافة</button></div>
        <div class="hint">بعد الإضافة يفتح رابط التطبيق ويعمل "حساب جديد" بنفس الإيميل.</div></div>
    </div>
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
      <div class="actions" style="margin-bottom:10px"><button class="btn ghost" onclick="exportExcel()">${I.xls}تصدير Excel</button><button class="btn ghost" onclick="backupJson()">${I.save}نسخة احتياطية</button></div>
      <button class="btn ghost block" onclick="go('/log')">${I.hist}سجل التعديلات (مين عمل إيه)</button>
    </div>
    <div class="card"><div class="section-t">ألوان التطبيق</div>
      <div class="themes">
        ${[['navy','كحلي ودهبي',['#0b1530','#d4a64a','#f8efdc']],['rose','زيتي ووردي',['#6b7f5e','#d88c9a','#f6d6dc']],['mint','نعناعي',['#0f8a66','#26b386','#d5f3e5']],['olive','زيتوني ودهبي',['#6a7955','#c9a15b','#f7f2ea']]].map(([k,l,c]) =>
          `<button class="${(document.documentElement.dataset.theme||'navy')===k?'on':''}" onclick="setTheme('${k}')"><span class="sw">${c.map(x=>`<i style="background:${x}"></i>`).join('')}</span>${l}</button>`).join('')}
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
window.addMember = async () => {
  const e = $('#newm').value.trim().toLowerCase();
  if(!/^\S+@\S+\.\S+$/.test(e)) return toast('اكتب إيميل صحيح', true);
  busy(true);
  try{ await q(sb.from('members').insert({email:e})); toast('اتضاف ✓'); viewSettings(); }
  catch(err){ toast(errMsg(err), true); } finally{ busy(false); }
};
window.delMember = async e => {
  if(!confirm(`إزالة ${e}؟ مش هيقدر يدخل التطبيق تاني.`)) return;
  try{ await q(sb.from('members').delete().eq('email', e)); viewSettings(); }catch(err){ toast(errMsg(err), true); }
};
window.shareApp = async () => {
  const link = shareLink();
  if(navigator.share){ try{ await navigator.share({title:'حسابات الموردين', url:link}); return; }catch(e){ if(e.name==='AbortError') return; } }
  try{ await navigator.clipboard.writeText(link); toast('اتنسخ الرابط ✓'); }catch(e){ prompt('انسخ الرابط:', link); }
};
window.logout = async () => { await sb.auth.signOut(); location.hash = '#/'; boot(); };
window.resetCfg = async () => { if(!confirm('هتمسح إعدادات الاتصال من الجهاز ده؟')) return; try{ await sb.auth.signOut(); }catch(e){} localStorage.removeItem(CFG_KEY); location.reload(); };

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
      if(mode==='in'){ const { error } = await sb.auth.signInWithPassword({email, password}); if(error) throw error; }
      else{
        const { data, error } = await sb.auth.signUp({email, password, options:{emailRedirectTo: location.origin + location.pathname}}); if(error) throw error;
        if(!data.session){ busy(false); toast('اتعمل الحساب — افتح الإيميل وأكّده وبعدين ادخل'); return viewLogin('in'); }
      }
      await afterLogin();
    }catch(err){ toast(errMsg(err), true); } finally{ busy(false); }
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
async function afterLogin(){
  const { data:{ session } } = await sb.auth.getSession();
  if(!session){
    if(IS_LOCAL){ try{ const i = await (await fetch('/local-info')).json(); if(!i.hasUsers) return viewLogin('up', true); }catch(e){} }
    return viewLogin();
  }
  me = session.user;
  const r = await q(sb.rpc('join_app'));
  if(!r.ok) return viewNotMember();
  isOwner = r.owner;
  route();
}

/* =================== التشغيل =================== */
async function boot(){
  readCfgFromUrl();
  const cfg = getCfg();
  if(!cfg) return viewSetup();
  sb = supabase.createClient(cfg.url, cfg.key, {auth:{persistSession:true, autoRefreshToken:true}});
  try{ await afterLogin(); }catch(e){ console.error(e); toast(errMsg(e), true); viewLogin(); }
}
// تحديث تلقائي لما ترجع للتطبيق (عشان تشوف اللي أخوك سجّله)
let lastHidden = 0;
document.addEventListener('visibilitychange', () => {
  if(document.hidden){ lastHidden = Date.now(); return; }
  if(me && Date.now() - lastHidden > 30e3 && !$('.sheet') && !$('#mdl')) route();
});
if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
boot();
