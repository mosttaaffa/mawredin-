/* =====================================================================
   قاعدة البيانات المحلية + المزامنة (Offline-First)
   - كل البيانات بتتخزن على الجهاز في IndexedDB (مش localStorage)
   - الشاشات بتقرا من الجهاز على طول (من غير ما تستنى النت)
   - أي إضافة/تعديل/مسح بيتحفظ على الجهاز الأول ويدخل «طابور مزامنة» محفوظ
   - المزامنة: بتبعت الطابور عملية عملية (كل عملية ليها رقم مميز op_id، فالسيرفر مش بيكررها)
     وبعدين بتجيب اللي اتغير على السيرفر من «سجل التعديلات» من آخر رقم الجهاز شافه
   - الحسابات (الأرصدة والتقارير) بتتحسب على الجهاز بنفس قواعد قاعدة البيانات بالقرش (من غير كسور عشرية)
   ===================================================================== */

const LDB_VERSION = 2;
const TABLES = {suppliers:'id', invoices:'id', payments:'id', members:'email', employees:'id', emp_settlements:'id', emp_transactions:'id', emp_import_batches:'id', check_payments:'id'};
const SYNC_TABLES = ['suppliers','invoices','payments','members','employees','emp_settlements','emp_transactions','check_payments'];
const FK = ['supplier_id','invoice_id','employee_id','payment_id','replaced_by'];      // أعمدة بتشاور على صفوف تانية (عشان الأرقام المؤقتة)
const LOG_KEEP = 3000;
const OVERLAP = 200;                                         // بنعيد آخر 200 حركة من السجل كل مرة احتياطي

/* ---------- حساب بالقرش (decimal-safe) ---------- */
const C = v => Math.round(Number(v || 0) * 100);
const fromC = c => c / 100;

/* ---------- IndexedDB ---------- */
const idb = {
  db: null, name: null,
  open(name){
    return new Promise((res, rej) => {
      const r = indexedDB.open(name, LDB_VERSION);
      r.onupgradeneeded = () => {
        const d = r.result;
        for(const [t, k] of Object.entries(TABLES)) if(!d.objectStoreNames.contains(t)) d.createObjectStore(t, {keyPath:k});
        if(!d.objectStoreNames.contains('log'))   d.createObjectStore('log',   {keyPath:'id'});
        if(!d.objectStoreNames.contains('queue')) d.createObjectStore('queue', {keyPath:'op_id'});
        if(!d.objectStoreNames.contains('blobs')) d.createObjectStore('blobs', {keyPath:'path'});
        if(!d.objectStoreNames.contains('meta'))  d.createObjectStore('meta',  {keyPath:'k'});
      };
      r.onsuccess = () => { idb.db = r.result; idb.name = name; idb.db.onversionchange = () => idb.db.close(); res(r.result); };
      r.onerror = () => rej(r.error);
      r.onblocked = () => rej(new Error('قاعدة البيانات مفتوحة في تبويب تاني'));
    });
  },
  tx(stores, mode, fn){
    return new Promise((res, rej) => {
      const t = idb.db.transaction(stores, mode); let out;
      t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('abort'));
      out = fn(t);
    });
  },
  all(store){ return new Promise((res, rej) => { const r = idb.db.transaction(store).objectStore(store).getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
  get(store, key){ return new Promise((res, rej) => { const r = idb.db.transaction(store).objectStore(store).get(key); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
  put(store, rows){ rows = [].concat(rows); return idb.tx([store], 'readwrite', t => { const s = t.objectStore(store); rows.forEach(r => s.put(r)); }); },
  del(store, keys){ keys = [].concat(keys); return idb.tx([store], 'readwrite', t => { const s = t.objectStore(store); keys.forEach(k => s.delete(k)); }); },
  clear(store){ return idb.tx([store], 'readwrite', t => t.objectStore(store).clear()); },
  drop(name){ return new Promise(res => { const r = indexedDB.deleteDatabase(name); r.onsuccess = r.onerror = r.onblocked = () => res(); }); },
};

/* ---------- الحالة في الذاكرة ---------- */
const store = {
  ready: false, email: null,
  base: {},          // نسخة السيرفر زي ما هي
  eff: {},           // اللي بيظهر = السيرفر + العمليات اللي لسه متزامنتش
  queue: [],         // طابور المزامنة (مرتب)
  log: [],           // آخر حركات السجل (للعرض)
  meta: {},
  ver: 0,            // بيزيد مع أي تغيير (للحسابات المخزنة)
  memo: new Map(),
  idmap: {},         // رقم مؤقت → رقم السيرفر
};
for(const t of Object.keys(TABLES)){ store.base[t] = new Map(); store.eff[t] = new Map(); }

const dbName = email => 'mawredin-' + String(email || '').toLowerCase();
async function storeOpen(email){
  if(store.ready && store.email === email) return;
  if(idb.db){ try{ idb.db.close(); }catch(e){} store.ready = false; }
  await idb.open(dbName(email));
  store.email = email;
  const [metaRows, q, logRows] = await Promise.all([idb.all('meta'), idb.all('queue'), idb.all('log')]);
  store.meta = Object.fromEntries(metaRows.map(m => [m.k, m.v]));
  store.idmap = store.meta.idmap || {};
  store.queue = q.sort((a, b) => a.seq - b.seq);
  store.log = logRows.sort((a, b) => b.id - a.id);
  for(const [t, k] of Object.entries(TABLES)){
    const rows = await idb.all(t);
    store.base[t] = new Map(rows.map(r => [r[k], r]));
  }
  rebuild();
  store.ready = true;
  try{ if(navigator.storage?.persist) navigator.storage.persist(); }catch(e){}
}
const setMeta = (k, v) => { store.meta[k] = v; return idb.put('meta', {k, v}); };
const hasLocalData = () => !!store.meta.fullAt;

/* البيانات اللي بتظهر = نسخة السيرفر + العمليات اللي لسه في الطابور */
function rebuild(){
  for(const t of Object.keys(TABLES)) store.eff[t] = new Map(store.base[t]);
  for(const op of store.queue){
    if(op.status === 'conflict' || op.status === 'failed' || !TABLES[op.table]) continue;
    const m = store.eff[op.table], k = TABLES[op.table];
    if(op.kind === 'insert') m.set(op.row[k], {...op.row, _pending:true});
    else if(op.kind === 'update'){ const r = m.get(op.key); if(r) m.set(op.key, {...r, ...op.changes, _pending:true}); }
    else if(op.kind === 'delete') m.delete(op.key);
  }
  store.ver++; store.memo.clear();
}
function memo(key, fn){ if(!store.memo.has(key)) store.memo.set(key, fn()); return store.memo.get(key); }
const keyOf = (t, v) => TABLES[t] === 'id' ? (typeof v === 'string' && /^-?\d+$/.test(v) ? Number(v) : v) : v;

/* ---------- الشيكات: السداد على دفعات (قاعدة واحدة لكل التطبيق) ----------
   قيمة الشيك الأصلية مبتتغيرش. دفعات السداد في check_payments (الملغية مش محسوبة).
   أثر الشيك على حساب المورد: لسه/جزئي/مسدد → قيمته الأصلية (سياسة التطبيق: بيتحسب من يوم كتابته)
                               مرتد/ملغي/مستبدل → اللي اتسدد منه فعلًا بس */
const CHK_DEAD = st => st === 'bounced' || st === 'cancelled' || st === 'replaced';
function checkPaysMap(){
  return memo('cpm', () => {
    const m = new Map();
    for(const c of store.eff.check_payments.values()){ let a = m.get(c.payment_id); if(!a){ a = []; m.set(c.payment_id, a); } a.push(c); }
    m.forEach(a => a.sort((x, y) => x.pay_date < y.pay_date ? -1 : x.pay_date > y.pay_date ? 1 : (String(x.created_at || '') < String(y.created_at || '') ? -1 : 1)));
    return m;
  });
}
function checkPays(pid){ return checkPaysMap().get(pid) || []; }
function checkInfo(p){
  const orig = C(p.amount), list = checkPays(p.id), live = list.filter(c => !c.voided);
  const paidRows = live.reduce((a, c) => a + C(c.amount), 0);
  const st = p.check_status || 'pending';
  const settled = st === 'cleared' ? orig : Math.min(orig, paidRows);
  const remaining = st === 'pending' ? orig - settled : 0;
  const pay = st === 'pending' ? (settled > 0 ? 'partial' : 'unpaid') : st === 'cleared' ? 'paid' : st;
  let due = null;
  if(st === 'pending' && p.due_date){ const t = todayStr(), d = String(p.due_date).slice(0,10); due = d > t ? 'notdue' : d === t ? 'due' : 'overdue'; }
  return {orig, paidRows, settled, remaining, pay, due, list, live, last: live.length ? live[live.length - 1].pay_date : null};
}
// أثر أي دفعة على حساب المورد بالقروش
function payEffect(p){
  if(p.method === 'check') return CHK_DEAD(p.check_status) ? checkInfo(p).paidRows : C(p.amount);
  return C(p.amount);
}

/* ---------- العروض المحسوبة (بنفس قواعد قاعدة البيانات) ---------- */
// supplier_balances: المدفوع = كاش + شيكات غير مرتدة + تحويلات ، المرتجعات والخصومات لوحدها
function supplierBalances(){
  return memo('sb', () => {
    const agg = new Map();
    const g = id => { let a = agg.get(id); if(!a){ a = {inv:0, paid:0, adj:0, pend:0, li:null, lp:null, ni:0, np:0, na:0, npend:0}; agg.set(id, a); } return a; };
    for(const i of store.eff.invoices.values()){ const a = g(i.supplier_id); a.inv += C(i.amount); a.ni++; if(i._pending) a.npend++; if(!a.li || i.inv_date > a.li) a.li = i.inv_date; }
    for(const p of store.eff.payments.values()){
      const a = g(p.supplier_id);
      if(['cash','check','transfer'].includes(p.method)) a.paid += payEffect(p);
      if(['return','discount'].includes(p.method)){ a.adj += C(p.amount); a.na++; } else a.np++;
      if(p._pending) a.npend++;
      if(p.method === 'check' && p.check_status === 'pending') a.pend += checkInfo(p).remaining;
      if(!a.lp || p.pay_date > a.lp) a.lp = p.pay_date;
    }
    return [...store.eff.suppliers.values()].map(s => {
      const a = agg.get(s.id) || {inv:0, paid:0, adj:0, pend:0, ni:0, np:0, na:0, npend:0};
      const last = [a.li, a.lp].filter(Boolean).sort().pop() || null;
      return {id:s.id, name:s.name, phone:s.phone, notes:s.notes, total_invoices:fromC(a.inv), total_paid:fromC(a.paid), total_adjust:fromC(a.adj),
              balance:fromC(a.inv - a.paid - a.adj), pending_checks:fromC(a.pend), last_activity:last, _pending:s._pending,
              inv_n:a.ni, pay_n:a.np, adj_n:a.na, pend_ops:a.npend};
    });
  });
}
// employee_balances: صافي آخر تسوية + الحركات اللي بعدها
function employeeBalances(){
  return memo('eb', () => {
    const last = new Map(), delta = new Map();
    for(const s of store.eff.emp_settlements.values()){
      const l = last.get(s.employee_id);
      if(!l || s.period_to > l.period_to || (s.period_to === l.period_to && s.id > l.id)) last.set(s.employee_id, s);
    }
    for(const x of store.eff.emp_transactions.values()){
      const l = last.get(x.employee_id);
      if(l && !(x.tx_date > l.period_to)) continue;
      const v = (x.kind === 'salary' || x.kind === 'commission' || x.kind === 'adjustment') ? C(x.amount) : -C(x.amount);
      delta.set(x.employee_id, (delta.get(x.employee_id) || 0) + v);
    }
    return [...store.eff.employees.values()].map(e => {
      const l = last.get(e.id), d = delta.get(e.id) || 0;
      return {id:e.id, emp_no:e.emp_no, name:e.name, branch:e.branch, base_salary:e.base_salary, phone:e.phone, notes:e.notes, active:e.active,
              last_from:l?.period_from ?? null, last_to:l?.period_to ?? null, last_net:l?.net_balance ?? null,
              tx_delta:fromC(d), balance:fromC(C(l?.net_balance) + d), _pending:e._pending};
    });
  });
}
const VIEWS = {supplier_balances: supplierBalances, employee_balances: employeeBalances};

/* ---------- الدوال (RPC) محسوبة على الجهاز ---------- */
const todayStr = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset()*6e4).toISOString().slice(0,10); };
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0,10); };
const addMonthsYM = (ym, n) => { let [y, m] = ym.split('-').map(Number); m += n; while(m > 12){ m -= 12; y++; } while(m < 1){ m += 12; y--; } return `${y}-${String(m).padStart(2,'0')}`; };
const LOCAL_RPC = {
  checks_summary({p_days = 3} = {}){
    const sup = store.eff.suppliers, t = todayStr(), lim = addDays(t, p_days);
    const pend = [...store.eff.payments.values()].filter(p => p.method === 'check' && p.check_status === 'pending')
      .sort((a, b) => (a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : a.id - b.id));
    const nx = pend.find(p => p.due_date >= t);
    const rem = p => checkInfo(p).remaining;
    return {n:pend.length, sum:fromC(pend.reduce((a, p) => a + rem(p), 0)),
      next: nx ? {due_date:nx.due_date, amount:fromC(rem(nx)), name:sup.get(nx.supplier_id)?.name} : null,
      soon: pend.filter(p => p.due_date <= lim).map(p => ({id:p.id, amount:p.amount, remaining:fromC(rem(p)), paid:fromC(checkInfo(p).settled), due_date:p.due_date, check_no:p.check_no, supplier_id:p.supplier_id, name:sup.get(p.supplier_id)?.name}))};
  },
  report_month({p_month}){
    const d0 = p_month + '-01', d1 = addMonthsYM(p_month, 1) + '-01', inR = d => d >= d0 && d < d1;
    const inv = [...store.eff.invoices.values()].filter(i => inR(i.inv_date));
    const pay = [...store.eff.payments.values()].filter(p => inR(p.pay_date) && payEffect(p) > 0).map(p => ({...p, amount:fromC(payEffect(p))}));
    const chk = [...store.eff.payments.values()].filter(p => p.method === 'check' && p.check_status === 'pending' && inR(p.due_date || '')).map(p => ({...p, amount:fromC(checkInfo(p).remaining)}));
    const sumM = m => fromC(pay.filter(p => p.method === m).reduce((a, p) => a + C(p.amount), 0));
    const per = new Map();
    inv.forEach(i => { const x = per.get(i.supplier_id) || {buy:0, pay:0}; x.buy += C(i.amount); per.set(i.supplier_id, x); });
    pay.forEach(p => { const x = per.get(p.supplier_id) || {buy:0, pay:0}; x.pay += C(p.amount); per.set(p.supplier_id, x); });
    return {buy:fromC(inv.reduce((a, i) => a + C(i.amount), 0)), cash:sumM('cash'), check:sumM('check'), transfer:sumM('transfer'), return:sumM('return'), discount:sumM('discount'),
      due_n:chk.length, due_sum:fromC(chk.reduce((a, p) => a + C(p.amount), 0)),
      per:[...per.entries()].filter(([id]) => store.eff.suppliers.has(id)).map(([id, x]) => ({id, name:store.eff.suppliers.get(id).name, buy:fromC(x.buy), pay:fromC(x.pay)}))
        .sort((a, b) => b.buy - a.buy || b.pay - a.pay)};
  },
  report_series({p_end, p_n = 6}){
    const n = Math.max(1, Math.min(p_n, 36)), months = [];
    for(let k = n - 1; k >= 0; k--) months.push(addMonthsYM(p_end, -k));
    const buy = new Map(), pay = new Map();
    for(const i of store.eff.invoices.values()){ const m = String(i.inv_date).slice(0,7); buy.set(m, (buy.get(m) || 0) + C(i.amount)); }
    for(const p of store.eff.payments.values()) if(['cash','check','transfer'].includes(p.method)){ const m = String(p.pay_date).slice(0,7); pay.set(m, (pay.get(m) || 0) + payEffect(p)); }
    return months.map(m => ({m, buy:fromC(buy.get(m) || 0), pay:fromC(pay.get(m) || 0)}));
  },
};

/* ---------- استعلام محلي بنفس شكل supabase-js ---------- */
class LQ {
  constructor(t){ this.t = t; this.f = []; this.o = []; this.rng = null; this.one = false; this.embed = []; this.mode = 'select'; this.ret = false; }
  select(cols = '*'){
    if(this.mode !== 'select'){ this.ret = true; return this; }
    for(const m of String(cols).matchAll(/(\w+)\(([^)]*)\)/g)) this.embed.push({t:m[1], cols:m[2].split(',').map(s => s.trim())});
    return this;
  }
  eq(c, v){ this.f.push([c, v]); return this; }
  order(c, o = {}){ this.o.push([c, o.ascending !== false, o.nullsFirst]); return this; }
  range(a, b){ this.rng = [a, b]; return this; }
  limit(n){ this.rng = [0, n - 1]; return this; }
  single(){ this.one = true; return this; }
  insert(row){ this.mode = 'insert'; this.row = row; return this; }
  update(row){ this.mode = 'update'; this.row = row; return this; }
  delete(){ this.mode = 'delete'; return this; }
  rows(){
    const src = VIEWS[this.t] ? VIEWS[this.t]() : [...(store.eff[this.t] || new Map()).values()];
    let r = this.f.length ? src.filter(x => this.f.every(([c, v]) => String(x[c]) === String(v))) : src.slice();
    if(this.o.length) r.sort((a, b) => {
      for(const [c, asc, nf] of this.o){
        const x = a[c], y = b[c];
        if(x == null && y == null) continue;
        if(x == null) return (nf ?? !asc) ? -1 : 1;
        if(y == null) return (nf ?? !asc) ? 1 : -1;
        const d = typeof x === 'number' && typeof y === 'number' ? x - y : c === 'name' ? String(x).localeCompare(String(y), 'ar') : (x < y ? -1 : x > y ? 1 : 0);
        if(d) return asc ? d : -d;
      }
      return 0;
    });
    if(this.rng) r = r.slice(this.rng[0], this.rng[1] + 1);
    if(this.embed.length) r = r.map(x => {
      const y = {...x};
      for(const e of this.embed){
        const fk = e.t === 'suppliers' ? 'supplier_id' : e.t === 'employees' ? 'employee_id' : e.t.replace(/s$/, '') + '_id';
        const p = store.eff[e.t]?.get(x[fk]); y[e.t] = p ? Object.fromEntries(e.cols.map(c => [c, p[c]])) : null;
      }
      return y;
    });
    return r;
  }
  async exec(){
    if(this.mode === 'select'){
      const r = this.rows();
      if(this.one){ if(r.length !== 1) return {data:null, error:{message:'السجل ده مش موجود (ممكن يكون اتمسح)', code:'PGRST116'}}; return {data:r[0], error:null}; }
      return {data:r, error:null};
    }
    if(!SYNC_TABLES.includes(this.t)) return {data:null, error:{message:'مش مسموح'}};
    try{
      if(this.mode === 'insert'){
        const rows = [].concat(this.row).map(r => ({...r}));
        const out = [];
        for(const r of rows) out.push(await enqueue({kind:'insert', table:this.t, row:r}));
        return {data: this.one ? out[0] : out, error:null};
      }
      const targets = this.rows();
      const out = [];
      for(const x of targets){
        const key = x[TABLES[this.t]];
        if(this.mode === 'update'){
          const changes = {}, base = {};
          for(const [c, v] of Object.entries(this.row)){ if(JSON.stringify(x[c] ?? null) !== JSON.stringify(v ?? null)){ changes[c] = v ?? null; base[c] = x[c] ?? null; } }
          if(!Object.keys(changes).length){ out.push(x); continue; }
          out.push(await enqueue({kind:'update', table:this.t, key, changes, base}));
        } else {
          const base = {...x}; delete base._pending;
          await enqueue({kind:'delete', table:this.t, key, base});
        }
      }
      return {data: this.one ? out[0] ?? null : out, error:null};
    }catch(e){ return {data:null, error:e}; }
  }
  then(res, rej){ return this.exec().then(res, rej); }
}
const ldb = { from: t => new LQ(t), rpc: (fn, args) => ({ then:(res, rej) => Promise.resolve().then(() => {
  if(!LOCAL_RPC[fn]) throw new Error('rpc ' + fn);
  return {data:LOCAL_RPC[fn](args || {}), error:null};
}).then(res, rej) }) };

/* ---------- طابور المزامنة ---------- */
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random()*16|0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
let tmpSeq = 0;
const tmpId = () => -(Date.now() * 100 + (tmpSeq++ % 100));
async function enqueue(op){
  op.op_id = uuid(); op.seq = Date.now() + (tmpSeq++ % 1000) / 1000; op.at = new Date().toISOString(); op.status = 'pending'; op.tries = 0; op.by = store.email;
  if(op.kind === 'insert' && TABLES[op.table] === 'id') op.row.id = tmpId();
  if(op.kind === 'insert'){ op.row.created_by = op.row.created_by || store.email; op.row.created_at = op.row.created_at || op.at; }
  await idb.put('queue', op);                              // محفوظ على الجهاز قبل أي حاجة
  store.queue.push(op); rebuild(); syncUI();
  scheduleSync(300);
  return op.kind === 'insert' ? store.eff[op.table].get(op.row[TABLES[op.table]]) : op.kind === 'update' ? store.eff[op.table].get(op.key) : null;
}
// الصور: بتتحفظ على الجهاز وتترفع لما النت يرجع
async function enqueueUpload(path, blob){
  await idb.put('blobs', {path, blob, at:Date.now()});
  await enqueue({kind:'upload', table:'_files', key:path});
}
async function enqueueRemove(path){
  const pend = store.queue.find(o => o.kind === 'upload' && o.key === path && o.status !== 'done');
  if(pend){ await dropOp(pend); await idb.del('blobs', path); return; }   // لسه مترفعتش: نلغيها وخلاص
  await enqueue({kind:'rmfile', table:'_files', key:path});
}
async function localBlobUrl(path){
  try{ const b = await idb.get('blobs', path); return b ? URL.createObjectURL(b.blob) : null; }catch(e){ return null; }
}
async function dropOp(op){ store.queue = store.queue.filter(o => o.op_id !== op.op_id); await idb.del('queue', op.op_id); rebuild(); syncUI(); }
async function saveOp(op){ await idb.put('queue', op); }

/* ---------- المزامنة ---------- */
const sync = {running:false, online:navigator.onLine, lastOk:+(localStorage.getItem('mawredin_last_sync') || 0), err:null, backoff:0, timer:null, phase:'', authErr:false, progress:''};
function scheduleSync(ms){ clearTimeout(sync.timer); sync.timer = setTimeout(() => syncNow(), ms); }
const withTimeout = (p, ms, msg='انتهى الوقت') => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error(msg), {net:true})), ms))]);
const isNetErr = e => !!(e && (e.net || /fetch|network|Failed to fetch|Load failed|NetworkError|timeout|انتهى الوقت/i.test(e.message || '') || e.status === 0));

async function syncNow(manual = false){
  if(!store.ready || !sb) return;
  if(sync.running){ if(manual) toast('المزامنة شغالة بالفعل'); return; }
  sync.running = true; sync.err = null; syncUI();
  let changed = false;
  try{
    const { data:{ session } } = await withTimeout(sb.auth.getSession(), 8000);
    if(!session){ sync.authErr = true; throw new Error('محتاج تسجل دخول تاني عشان المزامنة'); }
    sync.authErr = false;
    sync.phase = 'push'; syncUI();
    changed = (await pushQueue()) || changed;
    sync.phase = 'pull'; syncUI();
    changed = (await pull()) || changed;
    sync.online = true; sync.lastOk = Date.now(); localStorage.setItem('mawredin_last_sync', String(sync.lastOk));
    if(typeof health !== 'undefined'){ if(health.state !== 'ok') health.since = Date.now(); health.state = 'ok'; health.fails = 0; health.last = Date.now(); healthBanner(); }
    sync.backoff = 0;
    if(store.queue.some(o => o.status === 'pending')) scheduleSync(1000);
  }catch(e){
    console.warn('sync', e);
    if(isNetErr(e)){ sync.online = false; if(typeof healthCheck === 'function') setTimeout(healthCheck, 0); }
    sync.err = isNetErr(e) ? null : (e.message || String(e));
    sync.backoff = Math.min(sync.backoff ? sync.backoff * 2 : 5000, 5 * 60e3);   // 5ث، 10ث، 20ث ... لحد 5 دقايق
    scheduleSync(sync.backoff);
  }finally{
    sync.running = false; sync.phase = ''; sync.progress = ''; syncUI();
    if(changed) onDataChanged();
  }
}
async function rpcNet(fn, args, ms = 20000){
  const { data, error } = await withTimeout(sb.rpc(fn, args), ms);
  if(error){ if(isNetErr(error) || /JWT|token/i.test(error.message || '')) throw Object.assign(new Error(error.message), {net:isNetErr(error)}); throw new Error(error.message); }
  return data;
}
function remap(op){
  const m = store.idmap, fix = v => (typeof v === 'number' && v < 0 && m[v] != null) ? m[v] : v;
  if(op.key != null) op.key = fix(op.key);
  if(op.row){ FK.forEach(c => { if(c in op.row) op.row[c] = fix(op.row[c]); }); }
  if(op.changes) FK.forEach(c => { if(c in op.changes) op.changes[c] = fix(op.changes[c]); });
  if(op.base) FK.concat('id').forEach(c => { if(c in op.base) op.base[c] = fix(op.base[c]); });
}
async function pushQueue(){
  let changed = false;
  for(const op of [...store.queue]){
    if(op.status === 'conflict' || op.status === 'failed') continue;
    remap(op);
    if(op.kind === 'update' || op.kind === 'delete'){ if(typeof op.key === 'number' && op.key < 0) continue; }   // لسه الإضافة بتاعته متزامنتش
    op.status = 'sending'; op.tries++; op.lastTry = Date.now(); await saveOp(op); syncUI();
    try{
      if(op.kind === 'upload'){
        const b = await idb.get('blobs', op.key);
        if(b){
          const { error } = await withTimeout(sb.storage.from('attachments').upload(op.key, b.blob, {contentType:'image/jpeg', upsert:false}), 60000);
          if(error && !/exists|Duplicate|409/i.test(error.message + ' ' + (error.statusCode || ''))){ if(isNetErr(error)) throw Object.assign(new Error(error.message), {net:true}); throw new Error(error.message); }
          await idb.del('blobs', op.key);
        }
        await dropOp(op); continue;
      }
      if(op.kind === 'rmfile'){
        const { error } = await withTimeout(sb.storage.from('attachments').remove([op.key]), 30000);
        if(error && isNetErr(error)) throw Object.assign(new Error(error.message), {net:true});
        await dropOp(op); continue;
      }
      const payload = {op_id:op.op_id, table:op.table, kind:op.kind};
      if(op.kind === 'insert'){ const r = {...op.row}; delete r._pending; if(TABLES[op.table] === 'id') delete r.id; delete r.created_at; delete r.created_by; payload.row = r; }
      else { payload.key = String(op.key); payload.base = op.base; if(op.kind === 'update') payload.changes = op.changes; }
      const res = await rpcNet('sync_apply', {p: payload});
      if(res.status === 'ok'){
        const k = TABLES[op.table];
        if(op.kind === 'insert' && res.row){
          if(k === 'id'){ store.idmap[op.row.id] = res.row.id; await setMeta('idmap', store.idmap); fixHash(op.row.id, res.row.id); }
          store.base[op.table].set(res.row[k], res.row); await idb.put(op.table, res.row);
        } else if(op.kind === 'update' && res.row){ store.base[op.table].set(res.row[k], res.row); await idb.put(op.table, res.row); }
        else if(op.kind === 'delete'){ store.base[op.table].delete(op.key); await idb.del(op.table, op.key); }
        await dropOp(op); changed = true;
      } else if(res.status === 'conflict'){
        op.status = 'conflict'; op.server = res.server; op.reason = res.reason; await saveOp(op); rebuild(); changed = true;
      } else {
        op.status = 'failed'; op.error = res.message || 'خطأ'; await saveOp(op); rebuild(); changed = true;
      }
    }catch(e){
      op.status = 'pending'; op.error = e.message; await saveOp(op);   // العملية بتفضل في الطابور لحد ما السيرفر يأكد
      throw e;
    }
  }
  return changed;
}
// لو كنت فاتح صفحة سجل اتعمل وهو مؤقت، نحول الرابط للرقم الحقيقي
function fixHash(tmp, real){
  const h = location.hash; const re = new RegExp('([/=])' + String(tmp).replace('-', '\\-') + '(?!\\d)');
  if(re.test(h)) history.replaceState(null, '', location.pathname + h.replace(re, '$1' + real));
}
async function fetchAllNet(build){
  let out = [], from = 0;
  for(;;){
    const { data, error } = await withTimeout(build().range(from, from + 999), 30000);
    if(error) throw Object.assign(new Error(error.message), {net:isNetErr(error)});
    out = out.concat(data); if(data.length < 1000) return out; from += 1000;
    sync.progress = `${out.length}`; syncUI();
  }
}
async function pull(){
  if(!store.meta.fullAt) return fullLoad();
  let from = Math.max(0, (store.meta.logId || 0) - OVERLAP), got = [], changed = false;
  for(;;){
    const { data, error } = await withTimeout(sb.from('activity_log').select('*').gt('id', from).order('id').limit(1000), 30000);
    if(error) throw Object.assign(new Error(error.message), {net:isNetErr(error)});
    got = got.concat(data); if(data.length < 1000) break; from = data[data.length - 1].id;
  }
  const fresh = got.filter(r => r.id > (store.meta.logId || 0));
  if(!fresh.length && !got.length) return false;
  const touched = {};
  for(const r of got){
    const t = r.entity; if(!TABLES[t]) continue;
    const k = TABLES[t], m = store.base[t]; (touched[t] = touched[t] || new Set());
    if(r.action === 'delete'){ const key = keyOf(t, r.old_row?.[k] ?? r.entity_id); if(m.has(key)){ m.delete(key); touched[t].add(key); } }
    else if(r.new_row){ const key = r.new_row[k]; const old = m.get(key); if(!old || JSON.stringify(old) !== JSON.stringify(r.new_row)){ m.set(key, r.new_row); touched[t].add(key); } }
  }
  for(const [t, keys] of Object.entries(touched)){
    if(!keys.size) continue; changed = true;
    const put = [], del = [];
    keys.forEach(key => store.base[t].has(key) ? put.push(store.base[t].get(key)) : del.push(key));
    if(put.length) await idb.put(t, put); if(del.length) await idb.del(t, del);
  }
  if(fresh.length){
    const maxId = fresh[fresh.length - 1].id;
    await setMeta('logId', Math.max(maxId, store.meta.logId || 0));
    store.log = fresh.slice().reverse().concat(store.log).filter((r, i, a) => i === 0 || r.id !== a[i - 1].id).slice(0, LOG_KEEP);
    await idb.put('log', fresh);
    const old = store.log.length >= LOG_KEEP ? store.log[LOG_KEEP - 1].id : 0;
    if(old) idb.tx(['log'], 'readwrite', t => t.objectStore('log').delete(IDBKeyRange.upperBound(old, true))).catch(() => {});
    changed = true;
  }
  if(changed) rebuild();
  return changed;
}
// أول مرة (أو إعادة تحميل كاملة): نجيب كل الجداول مرة واحدة
async function fullLoad(){
  sync.phase = 'full'; syncUI();
  const { data:lastLog, error } = await withTimeout(sb.from('activity_log').select('id').order('id', {ascending:false}).limit(1), 20000);
  if(error) throw Object.assign(new Error(error.message), {net:isNetErr(error)});
  const logId = lastLog?.[0]?.id || 0;   // بناخد رقم السجل قبل الجداول عشان مايفوتناش حاجة
  const fresh = {};
  for(const t of Object.keys(TABLES)){
    const k = TABLES[t];
    try{ fresh[t] = await fetchAllNet(() => sb.from(t).select('*').order(k)); }
    catch(e){ if(!e.net && /does not exist|schema cache|PGRST205|42P01/i.test(e.message || '')) fresh[t] = []; else throw e; }   // جدول جديد لسه ما اتعملش على السيرفر
  }
  const { data:logs } = await withTimeout(sb.from('activity_log').select('*').order('id', {ascending:false}).limit(500), 20000);
  await idb.tx([...Object.keys(TABLES), 'log'], 'readwrite', tx => {
    for(const t of Object.keys(TABLES)){ const s = tx.objectStore(t); s.clear(); fresh[t].forEach(r => s.put(r)); }
    const ls = tx.objectStore('log'); ls.clear(); (logs || []).forEach(r => ls.put(r));
  });
  for(const t of Object.keys(TABLES)) store.base[t] = new Map(fresh[t].map(r => [r[TABLES[t]], r]));
  store.log = logs || [];
  await setMeta('logId', logId); await setMeta('fullAt', Date.now());
  rebuild();
  return true;
}
async function fullResync(){
  if(store.queue.some(o => o.status !== 'conflict' && o.status !== 'failed')) return toast('استنى لحد ما العمليات اللي على الجهاز تتزامن الأول', true);
  await setMeta('fullAt', 0); syncNow(true);
}

/* لما البيانات تتغير من المزامنة: نعيد رسم الصفحة لو مش فورم */
let redrawT = null;
function onDataChanged(){
  clearTimeout(redrawT);
  redrawT = setTimeout(() => {
    const p = (location.hash.slice(1) || '/').split('?')[0].split('/').filter(Boolean)[0] || '';
    const forms = ['invoice','payment','adjust','supplier','emp-tx','emp-edit','emp-set','emp-import','settings'];
    if(forms.includes(p) || $('.sheet') || $('#mdl') || document.querySelector('input:focus,textarea:focus,select:focus')) return;
    route();
  }, 250);
}

/* ---------- مؤشر المزامنة ---------- */
function syncState(){
  const pend = store.queue.filter(o => o.status === 'pending' || o.status === 'sending').length;
  const conf = store.queue.filter(o => o.status === 'conflict').length;
  const fail = store.queue.filter(o => o.status === 'failed').length;
  if(conf) return {k:'conf', t:`${conf} تعارض محتاج قرار`, n:conf};
  if(fail) return {k:'fail', t:`فشلت ${fail} عملية`, n:fail};
  if(sync.authErr) return {k:'fail', t:'سجّل دخول للمزامنة', n:pend};
  if(sync.running && (pend || sync.phase === 'full')) return {k:'run', t: sync.phase === 'full' ? `بنجهز البيانات${sync.progress ? ' ' + sync.progress : ''}…` : 'جاري المزامنة…', n:pend};
  const hs = typeof health !== 'undefined' ? health.state : 'ok';
  if(hs === 'server' || hs === 'paused') return {k:'fail', t:(hs === 'paused' ? 'السيرفر متوقف' : 'السيرفر مش بيرد') + (pend ? ` · ${pend} محفوظة` : ''), n:pend};
  if(!sync.online || hs === 'offline') return pend ? {k:'off', t:`بدون نت · ${pend} في الانتظار`, n:pend} : {k:'off', t:'يعمل بدون إنترنت', n:0};
  if(pend) return {k:'pend', t:`${pend} ${pend === 1 ? 'عملية' : pend < 11 ? 'عمليات' : 'عملية'} في انتظار المزامنة`, n:pend};
  if(sync.err) return {k:'fail', t:'فشلت المزامنة', n:0};
  if(hs !== 'ok') return {k:'run', t:'بنتأكد من الاتصال…', n:0};      // «متصل» بس بعد ما السيرفر يرد فعلًا
  return {k:'ok', t:'متصل ومتزامن', n:0};
}
function syncPill(){
  const s = syncState();
  return `<button class="sync-pill s-${s.k}" onclick="openSync()" aria-label="المزامنة"><i></i><span>${s.t}</span></button>`;
}
function syncUI(){
  const el = document.querySelector('.sync-pill'); if(!el) return;
  const s = syncState(); el.className = 'sync-pill s-' + s.k; el.querySelector('span').textContent = s.t;
  if(document.querySelector('#mdl .sync-panel')) renderSyncPanel();
}
const OPNAME = {suppliers:'مورد', invoices:'فاتورة', payments:'دفعة', members:'عضو', employees:'موظف', emp_settlements:'تسوية موظف', emp_transactions:'حركة موظف', check_payments:'سداد شيك', _files:'صورة'};
const KIND = {insert:'إضافة', update:'تعديل', delete:'مسح', upload:'رفع', rmfile:'مسح'};
const ST = {pending:'محفوظ على الجهاز', sending:'جاري الإرسال', conflict:'تعارض', failed:'فشل'};
const opLabel = o => `${KIND[o.kind]} ${OPNAME[o.table] || ''}${o.row?.amount ? ' بـ ' + Number(o.row.amount).toLocaleString('en-US') + ' ج' : o.changes?.amount ? ' (المبلغ ' + Number(o.changes.amount).toLocaleString('en-US') + ')' : o.row?.name ? ' ' + o.row.name : ''}`;
window.openSync = () => { openModal('<div class="sync-panel"></div>'); renderSyncPanel(); };
function renderSyncPanel(){
  const el = document.querySelector('#mdl .sync-panel'); if(!el) return;
  const s = syncState(), q = store.queue;
  const fmtT = t => t ? new Date(t).toLocaleString('ar-EG', {day:'numeric', month:'numeric', hour:'numeric', minute:'2-digit'}) : '—';
  el.innerHTML = `
    <h3>المزامنة</h3>
    <div class="sync-head s-${s.k}"><i></i><b>${s.t}</b></div>
    <div class="kv"><span>آخر مزامنة ناجحة</span><span>${fmtT(sync.lastOk)}</span></div>
    <div class="kv"><span>عمليات على الجهاز لسه متزامنتش</span><span>${q.filter(o => o.status === 'pending' || o.status === 'sending').length}</span></div>
    <button class="btn primary block" style="margin:12px 0" onclick="syncNow(true)" ${sync.running ? 'disabled' : ''}>${I.refresh}${sync.running ? 'جاري المزامنة…' : 'مزامنة الآن'}</button>
    ${q.length ? `<div class="section-t">العمليات</div>${q.map(o => `
      <div class="sq-item st-${o.status}">
        <div><b>${esc(opLabel(o))}</b><small>${fmtT(o.at)} · ${ST[o.status] || o.status}${o.error && o.status !== 'conflict' ? ' — ' + esc(o.error) : ''}</small></div>
        ${o.status === 'conflict' ? `<button class="btn ghost" onclick="showConflict('${o.op_id}')">راجع</button>` : o.status === 'failed' ? `<button class="btn ghost" onclick="retryOp('${o.op_id}')">حاول تاني</button><button class="btn danger" onclick="discardOp('${o.op_id}')">إلغاء</button>` : ''}
      </div>`).join('')}` : '<div class="hint" style="text-align:center">كل حاجة متزامنة ✓</div>'}
    <div class="hint" style="margin-top:12px">البيانات متخزنة على الجهاز، وأي حاجة بتسجلها من غير نت بتتبعت لوحدها أول ما النت يرجع (لما تفتح التطبيق أو ترجعله). على الآيفون التطبيق مش بيقدر يزامن وهو مقفول خالص.</div>
    <button class="link" style="display:block;margin:10px auto 0" onclick="fullResync()">إعادة تحميل كل البيانات من السيرفر</button>
    <div class="hint" style="text-align:center" id="quota"></div>`;
  navigator.storage?.estimate?.().then(e => { const q2 = document.getElementById('quota'); if(q2 && e.quota) q2.textContent = `المساحة المستخدمة على الجهاز: ${(e.usage/1048576).toFixed(1)} ميجا`; }).catch(() => {});
}
window.retryOp = async id => { const o = store.queue.find(x => x.op_id === id); if(!o) return; o.status = 'pending'; o.error = null; await saveOp(o); rebuild(); syncUI(); syncNow(true); };
window.discardOp = async id => {
  const o = store.queue.find(x => x.op_id === id); if(!o) return;
  if(!confirm('تلغي العملية دي؟ مش هتتسجل على السيرفر.')) return;
  await dropOp(o); onDataChanged();
};
const FIELD_AR = {amount:'المبلغ', inv_date:'التاريخ', pay_date:'التاريخ', tx_date:'التاريخ', inv_no:'رقم الفاتورة', due_date:'الاستحقاق', method:'النوع', name:'الاسم', phone:'التليفون',
  notes:'الملاحظات', check_no:'رقم الشيك', bank:'البنك', check_status:'حالة الشيك', image_path:'الصورة', invoice_id:'الفاتورة', kind:'النوع', base_salary:'المرتب الأساسي', net_balance:'الصافي'};
window.showConflict = id => {
  const o = store.queue.find(x => x.op_id === id); if(!o) return;
  const keys = Object.keys(o.changes || o.base || {}).filter(k => !['created_at','created_by','id'].includes(k));
  const v = x => x == null ? '—' : typeof x === 'number' ? x.toLocaleString('en-US') : esc(String(x));
  openModal(`<h3>تعارض: ${esc(opLabel(o))}</h3>
    <div class="hint" style="margin-bottom:8px">${o.reason === 'deleted' ? 'السجل ده اتمسح من جهاز تاني وإنت بتعدّله.' : 'نفس السجل اتعدّل من جهاز تاني قبل ما تعديلك يوصل. محدش اتكتب فوق التاني — اختار تعتمد أنهي نسخة.'}</div>
    <div class="stmt-scroll"><table class="tbl cf-tbl"><thead><tr><th>الخانة</th><th>قبل</th><th>تعديلك</th><th>على السيرفر</th></tr></thead><tbody>
    ${keys.map(k => `<tr><td>${FIELD_AR[k] || k}</td><td>${v(o.base?.[k])}</td><td><b>${o.kind === 'delete' ? 'مسح' : v(o.changes?.[k])}</b></td><td>${o.server ? v(o.server[k]) : 'اتمسح'}</td></tr>`).join('')}
    </tbody></table></div>
    <div class="actions" style="margin-top:12px">
      <button class="btn primary" onclick="resolveConflict('${o.op_id}','mine')" ${o.reason === 'deleted' && o.kind === 'update' ? 'disabled' : ''}>اعتمد تعديلي</button>
      <button class="btn ghost" onclick="resolveConflict('${o.op_id}','server')">اعتمد اللي على السيرفر</button>
    </div>`);
};
window.resolveConflict = async (id, choice) => {
  const o = store.queue.find(x => x.op_id === id); if(!o) return;
  try{ await rpcNet('resolve_conflict', {p_op:o.op_id, p_resolution:choice}, 15000); }catch(e){ return toast('محتاج نت عشان تسجّل القرار', true); }
  await dropOp(o);
  if(choice === 'mine' && o.server){
    // عملية جديدة على أساس اللي على السيرفر دلوقتي (القرار متسجل في سجل التعارضات)
    const base = {}; Object.keys(o.changes || o.base || {}).forEach(k => base[k] = o.server[k] ?? null);
    if(o.kind === 'update') await enqueue({kind:'update', table:o.table, key:o.key, changes:o.changes, base});
    else if(o.kind === 'delete'){ const b = {...o.server}; await enqueue({kind:'delete', table:o.table, key:o.key, base:b}); }
  }
  closeModal(); toast('اتسجل القرار'); onDataChanged();
};

/* ---------- تشغيل المزامنة تلقائي ---------- */
window.addEventListener('online', () => { sync.online = true; syncUI(); scheduleSync(500); });
window.addEventListener('offline', () => { sync.online = false; syncUI(); });
document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'visible' && store.ready) scheduleSync(300); });
setInterval(() => { if(store.ready && document.visibilityState === 'visible' && !sync.running) syncNow(); }, 60e3);
window.syncNow = syncNow; window.fullResync = fullResync;
