// اختبار شامل على «آيفون» (محرك Safari = WebKit، مقاس iPhone 13) قبل النشر
//   - بيشغّل السيرفر المحلي ببيانات فاضية مؤقتة (مش بيلمس Supabase الحقيقي أبدًا)
//   - حساب جديد ← مورد ← فاتورة ← دفعة ← الرصيد
//   - من غير نت: فاتورة ← قفل وفتح التطبيق من غير نت ← لسه شغال والعملية محفوظة
//   - النت يرجع ← المزامنة ← السيرفر فيه البيانات صح
//   - نفس العملية اتبعتت مرتين ← بتتسجل مرة واحدة بس
//   - تعديل نفس الفاتورة من جهازين ← تعارض بيتعرض (مفيش تعديل بيضيع في السكوت)
// الاستخدام:  npm i --no-save playwright && npx playwright install --with-deps webkit && node tools/e2e.mjs
//   BROWSER=chromium CHROME=/usr/bin/google-chrome node tools/e2e.mjs   (لو WebKit مش متاح)
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const pw = await import('playwright'); const { webkit, chromium, devices } = pw.default || pw;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 3100 + Math.floor(Math.random() * 500), URL = `http://localhost:${PORT}/`;
const DATA = mkdtempSync(join(tmpdir(), 'mawredin-e2e-'));
const SHOTS = join(ROOT, 'e2e-shots'); mkdirSync(SHOTS, {recursive:true});
let fails = 0; const ok = m => console.log('✓', m), bad = m => { console.error('✗', m); fails++; };
const expect = (c, m, extra = '') => c ? ok(m) : bad(m + (extra ? ' — ' + extra : ''));

const srv = spawn(process.execPath, ['server.js'], {cwd:join(ROOT, 'local-server'), env:{...process.env, PORT:String(PORT), MAWREDIN_DATA:DATA}, stdio:['ignore', 'pipe', 'pipe']});
let srvLog = ''; srv.stdout.on('data', d => srvLog += d); srv.stderr.on('data', d => srvLog += d);
for(let i = 0; i < 120; i++){ try{ if((await fetch(URL + 'local-info')).ok) break; }catch(e){} await new Promise(r => setTimeout(r, 500)); }

const engine = (process.env.BROWSER || 'webkit') === 'webkit' ? webkit : chromium;
const browser = await engine.launch(engine === chromium ? {executablePath:process.env.CHROME || undefined, args:['--no-sandbox']} : {});
const dev = {...devices['iPhone 13']}; if(engine === chromium) delete dev.defaultBrowserType;
const ctx = await browser.newContext({...dev, locale:'ar-EG', timezoneId:'Africa/Cairo'});
const A = await ctx.newPage(); const errs = [];
A.on('pageerror', e => errs.push(String(e)));
const cons = []; A.on('console', m => { if(m.type() === 'error' || m.type() === 'warning') cons.push(m.type() + ': ' + m.text()); });
const ev = (p, f) => p.evaluate(f);
A.on('dialog', d => d.accept());
// صورة فاتورة تجريبية (PNG صغير) — الفاتورة لازم ليها صورة
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAQklEQVR4nO3PQQ0AIBDAsAP/nuGNAvbYPgPtnZnzYK5vB4gGkg2kNNAGRRtoA6KNtAHRRtqAaCNtQLSRNiDaSBsQ7QPgDwJ4SBTk7QAAAABJRU5ErkJggg==', 'base64');
const addInvoice = async (p, sid, amt) => {
  await p.waitForTimeout(1200);
  for(let i = 0; i < 3; i++){ await ev(p, `go('/invoice?s=${sid}')`); await p.waitForSelector('#amount'); await p.waitForTimeout(600); if(await p.$('#amount')) break; }
  await p.setInputFiles('#pgin-inv', {name:'فاتورة.png', mimeType:'image/png', buffer:PNG}); await p.waitForTimeout(700);
  const nPg = await p.evaluate(() => (PG.inv || []).length);
  await p.fill('#amount', String(amt)); await p.click('#frm button[type=submit]'); await p.waitForTimeout(1500);
  if(await p.$('#frm')){   // لسه على الفورم = الحفظ ما تمّش — اطبع السبب
    const why = await p.evaluate(() => ({hash:location.hash, pages:(PG.inv || []).length, errs:[...document.querySelectorAll('.field.err, .err-msg, .field .error')].map(e => e.innerText.trim()).join(' | '), toast:[...document.querySelectorAll('.toast, #toast, [class*=toast]')].map(e => e.innerText.trim()).join(' | ')}));
    console.error('   الفاتورة ما اتحفظتش:', JSON.stringify({...why, pagesAfterPick:nPg}), '\n   console:', cons.slice(-5).join(' || '), '\n   errors:', errs.slice(-3).join(' || '));
  }
};
const waitIdle = async p => { for(let i = 0; i < 40; i++){ if(await p.evaluate(() => store.queue.filter(o => o.status !== 'done' && o.status !== 'conflict' && o.status !== 'failed').length) === 0) return true; await p.evaluate(() => syncNow(true)).catch(() => {}); await p.waitForTimeout(500); } return false; };
console.log(`المتصفح: ${engine.name()} · ${dev.viewport.width}×${dev.viewport.height} · ${URL}`);

try{
  // 1) أول حساب
  await A.goto(URL); await A.waitForSelector('#lf', {timeout:60000});
  await A.fill('#le', 'owner@test.local'); await A.fill('#lp', 'test-123456'); await A.click('#lf button[type=submit]');
  await A.waitForSelector('.db', {timeout:60000}); await A.waitForTimeout(800);
  ok('حساب جديد ودخول ← الرئيسية');
  await A.screenshot({path:join(SHOTS, '1 الرئيسية.png')});

  // 2) مورد + فاتورة + دفعة
  await ev(A, () => go('/supplier')); await A.waitForSelector('#name'); await A.fill('#name', 'مورد اختبار'); await A.click('#frm button[type=submit]'); await A.waitForTimeout(800);
  const sid = await ev(A, () => [...store.eff.suppliers.values()].find(s => s.name === 'مورد اختبار')?.id);
  expect(sid, 'مورد اتسجل');
  await addInvoice(A, sid, 10000);
  await ev(A, `go('/payment?s=${sid}')`); await A.waitForSelector('#amount'); await A.fill('#amount', '4000'); await A.click('#f-method [data-m=cash]'); await A.click('#frm button[type=submit]'); await A.waitForTimeout(800);
  expect(await waitIdle(A), 'اتزامنوا مع السيرفر');
  const bal = await ev(A, () => supplierBalances().find(r => r.name === 'مورد اختبار')?.balance);
  expect(Number(bal) === 6000, 'الرصيد = 10,000 − 4,000 = 6,000', 'طلع ' + bal);

  // 3) من غير نت + قفل وفتح التطبيق
  await ctx.setOffline(true);
  const sid2 = await ev(A, () => [...store.eff.suppliers.values()].find(s => s.name === 'مورد اختبار').id);
  await addInvoice(A, sid2, 2500);
  expect(await ev(A, () => store.queue.filter(o => o.status !== 'done').length) >= 1, 'من غير نت: الفاتورة اتحفظت على الموبايل');
  await A.reload({waitUntil:'domcontentloaded'}).catch(() => {});
  let opened = false; for(let i = 0; i < 40 && !opened; i++){ opened = await A.evaluate(() => typeof store !== 'undefined' && document.body.innerText.includes('مورد اختبار')).catch(() => false); if(!opened) await A.waitForTimeout(500); }
  if(!opened) console.error('   بعد إعادة الفتح:', await A.evaluate(() => location.hash + ' | ready=' + window.store?.ready + ' | ' + document.body.innerText.slice(0, 120)).catch(e => String(e)));
  expect(opened, 'من غير نت: التطبيق اتقفل واتفتح تاني وفتح عادي (من الملفات المحفوظة على الموبايل)');
  await A.waitForTimeout(800);
  expect(await ev(A, () => store.queue.filter(o => o.status !== 'done').length) >= 1, 'من غير نت: العملية لسه محفوظة بعد إعادة الفتح');
  const balOff = await ev(A, () => supplierBalances().find(r => r.name === 'مورد اختبار')?.balance);
  expect(Number(balOff) === 8500, 'من غير نت: الرصيد اتحسب على الموبايل 8,500', 'طلع ' + balOff);
  await A.screenshot({path:join(SHOTS, '2 من غير نت.png')});

  // 4) النت رجع ← مزامنة
  await ctx.setOffline(false); await ev(A, () => syncNow(true)).catch(() => {});
  expect(await waitIdle(A), 'النت رجع: العمليات اتبعتت');
  const server = await ev(A, async () => { const s = await sb.from('supplier_balances').select('*'); const i = await sb.from('invoices').select('id'); return {bal:s.data?.find(r => r.name === 'مورد اختبار')?.balance, inv:i.data?.length}; });
  expect(Number(server.bal) === 8500 && server.inv === 2, 'السيرفر: فاتورتين والرصيد 8,500', JSON.stringify(server));
  const imgs = await ev(A, async () => { const r = await sb.from('invoices').select('image_path'); let okN = 0, info = []; for(const x of r.data){ if(!x.image_path){ info.push('no path'); continue; } const u = await sb.storage.from('attachments').createSignedUrl(x.image_path, 60); let size = u.error?.message; if(u.data?.signedUrl){ const r2 = await fetch(u.data.signedUrl); size = r2.ok ? (await r2.blob()).size : 'HTTP ' + r2.status; } info.push(x.image_path + ':' + size); if(typeof size === 'number' && size > 0) okN++; } return okN === 2 ? 2 : info.join(' ; '); });
  expect(imgs === 2, 'صور الفواتير (منها واحدة اتصورت من غير نت) اترفعت على السيرفر', 'اترفع ' + imgs);

  // 5) نفس العملية مرتين (زي لو النت قطع بعد ما السيرفر سجّل وقبل ما الرد يوصل)
  const dup = await ev(A, async () => {
    const ssid = (await sb.from('suppliers').select('id,name')).data.find(s => s.name === 'مورد اختبار').id;
    const p = {op_id:crypto.randomUUID(), table:'payments', kind:'insert', row:{supplier_id:ssid, amount:777, method:'cash', pay_date:today()}};
    const r1 = await sb.rpc('sync_apply', {p}), r2 = await sb.rpc('sync_apply', {p});
    const n = (await sb.from('payments').select('id,amount')).data.filter(x => Number(x.amount) === 777).length;
    return {n, s1:r1.data?.status || r1.error?.message, s2:r2.data?.status || r2.error?.message};
  });
  expect(dup.n === 1, 'نفس العملية اتبعتت مرتين ← اتسجلت مرة واحدة', JSON.stringify(dup));

  // 6) تعارض: جهاز تاني (موبايل تاني) عدّل نفس الفاتورة وإحنا من غير نت
  const ctx2 = await browser.newContext({...dev, locale:'ar-EG'}); const B = await ctx2.newPage(); B.on('dialog', d => d.accept());
  await B.goto(URL); await B.waitForSelector('#lf', {timeout:60000}); await B.fill('#le', 'owner@test.local'); await B.fill('#lp', 'test-123456'); await B.click('#lf button[type=submit]');
  await B.waitForSelector('.db', {timeout:60000}); await B.waitForTimeout(800);
  const invId = await ev(A, () => [...store.eff.invoices.values()].find(i => Number(i.amount) === 2500).id);
  await ctx.setOffline(true);
  await ev(A, `go('/invoice/${invId}')`); await A.waitForSelector('#amount'); await A.fill('#amount', '3000'); await A.click('#frm button[type=submit]'); await A.waitForTimeout(800);
  await ev(B, `go('/invoice/${invId}')`); await B.waitForSelector('#amount'); await B.fill('#amount', '2600'); await B.click('#frm button[type=submit]'); await B.waitForTimeout(800);
  expect(await waitIdle(B), 'الموبايل التاني عدّل الفاتورة واتزامن');
  await ctx.setOffline(false); await ev(A, () => syncNow(true)).catch(() => {}); await A.waitForTimeout(2500);
  const conf = await ev(A, () => store.queue.filter(o => o.status === 'conflict').length);
  const srvAmt = await ev(A, async () => (await sb.from('invoices').select('id,amount')).data.map(x => Number(x.amount)).sort((a, b) => a - b).join(','));
  expect(conf === 1, 'تعديل نفس الفاتورة من موبايلين ← اتعرض كتعارض تختار فيه', `conflicts=${conf}`);
  expect(srvAmt === '2600,10000', 'السيرفر محتفظ بتعديل الموبايل التاني لحد ما تختار (مفيش حاجة اتمسحت في السكوت)', srvAmt);
  await ev(A, () => go('/sync')).catch(() => {}); await A.waitForTimeout(800); await A.screenshot({path:join(SHOTS, '4 التعارض.png')});
  await ctx2.close();

  // 6.5) كشف الحساب لازم يعرض كل الحركات (حتى القديمة جدًا) — حتى لو المستخدم كان مختار فترة قبل كده
  {
    const ss = await ev(A, async () => { const s = (await sb.from('suppliers').insert({name:'مورد كشف قديم'}).select().single()).data;
      await sb.from('invoices').insert({supplier_id:s.id, inv_date:'2024-01-05', amount:1111}); await sb.from('payments').insert({supplier_id:s.id, pay_date:'2024-02-01', amount:111, method:'cash'});
      await sb.from('invoices').insert({supplier_id:s.id, inv_date:today(), amount:500}); return s.id; });
    await ev(A, () => syncNow(true)).catch(() => {}); await waitIdle(A); await A.waitForTimeout(1500);
    await ev(A, `location.replace('#/statement/${ss}?from=${new Date().getFullYear()}-01-01&to=')`); await A.waitForTimeout(600);
    await ev(A, `go('/statement/${ss}')`); await A.waitForTimeout(800);
    const q = await ev(A, () => ({n:window._stmt?.lines.length, run:window._stmt?.run, open:window._stmt?.open}));
    expect(q.n === 3 && Math.round(q.run) === 1500 && !q.open, 'الكشف السريع بيعرض كل الحركات (من 2024) والرصيد صح', JSON.stringify(q));
    await ev(A, () => localStorage.setItem('mawredin_stmt_opts', JSON.stringify({mode:'range', kind:'detail', imgs:false, from:today(), to:today()})));
    await ev(A, `go('/stmt/${ss}')`); await A.waitForTimeout(800);
    const s2 = await ev(A, `(() => { const st = buildStatement(${ss}, stOpts()); return {mode:document.querySelector('#st-mode .on')?.dataset.v, n:st.rows.length, c:st.T.closing}; })()`);
    expect(s2.mode === 'full' && s2.n === 3 && s2.c === 150000, 'إصدار الكشف بيبدأ «كشف كامل» حتى لو اتختارت فترة قبل كده', JSON.stringify(s2));
  }

  // 7) شاشات أساسية بتفتح من غير أخطاء
  for(const r of ['/suppliers', '/cash', '/loans', '/checks', '/reports', '/backups']){ await ev(A, `go('${r}')`); await A.waitForTimeout(700); }
  ok('الشاشات الأساسية فتحت');
  await ev(A, () => go('/backups')); await A.waitForSelector('.us-r', {timeout:15000}).catch(() => {});
  expect(await A.$('.us-r'), 'عداد استهلاك الخطة المجانية ظاهر في النسخ الاحتياطية');
  await A.screenshot({path:join(SHOTS, '5 الاستهلاك.png'), fullPage:true});
  await ev(A, () => go('/')); await A.waitForSelector('.db'); await A.waitForTimeout(600);
  await A.screenshot({path:join(SHOTS, '3 بعد المزامنة.png')});
  // موبايل عليه نسخة قديمة من التطبيق (ناقصه أماكن جداول جديدة) ← لازم يفتح عادي ويكمّل الناقص لوحده
  const lost = await A.evaluate(() => new Promise(res => { const v = idb.db.version, name = idb.name; idb.db.close();
    const r = indexedDB.open(name, v + 1); r.onupgradeneeded = () => { for(const t of ['expenses', 'daily_sales']) if(r.result.objectStoreNames.contains(t)) r.result.deleteObjectStore(t); };
    r.onsuccess = () => { r.result.close(); res(true); }; }));
  await A.reload(); let up = false; for(let i = 0; i < 30 && !up; i++){ up = await A.evaluate(() => typeof idb !== 'undefined' && !!idb.db && ['expenses', 'daily_sales'].every(t => idb.db.objectStoreNames.contains(t)) && !document.body.innerText.includes('مش قادر')).catch(() => false); if(!up) await A.waitForTimeout(500); }
  expect(lost && up, 'تحديث على موبايل عليه نسخة قديمة: التطبيق فتح وكمّل الأماكن الناقصة لوحده');
  expect(errs.length === 0, 'مفيش أخطاء JavaScript', errs.slice(0, 3).join(' | '));
}catch(e){ bad('الاختبار وقف: ' + (e.stack || e)); try{ await A.screenshot({path:join(SHOTS, 'فشل.png')}); console.error('الصفحة:', await A.evaluate(() => location.hash + ' | ' + document.body.innerText.slice(0, 300))); }catch(_){} }
finally{
  await browser.close(); srv.kill(); rmSync(DATA, {recursive:true, force:true});
  if(fails){ console.error(`\n${fails} اختبار فشل`); if(process.env.E2E_LOG) console.error(srvLog.slice(-3000)); process.exit(1); }
  console.log('\nكله تمام ✓');
}
