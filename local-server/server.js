/*
 * سيرفر محلي (localhost) بيقلّد Supabase للتطبيق ده بالظبط:
 *   /auth/v1     تسجيل دخول وحسابات
 *   /rest/v1     الجداول (نفس setup.sql ونفس صلاحيات RLS)
 *   /storage/v1  رفع الصور وعرضها
 * وكمان بيعرض التطبيق نفسه على  http://localhost:3000
 *
 * التشغيل:  npm install   ثم   npm start
 * البيانات بتتحفظ في فولدر local-server/data
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PGlite } = require('@electric-sql/pglite');

const PORT = +process.env.PORT || 3000;
const APP_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(__dirname, 'data');
const FILES_DIR = path.join(DATA_DIR, 'files');
const SECRET_FILE = path.join(DATA_DIR, 'jwt-secret');
fs.mkdirSync(FILES_DIR, { recursive: true });
if (!fs.existsSync(SECRET_FILE)) fs.writeFileSync(SECRET_FILE, crypto.randomBytes(32).toString('hex'));
const SECRET = fs.readFileSync(SECRET_FILE, 'utf8').trim();
const TOKEN_TTL = 3600;
const MAX_ROWS = 1000;   // نفس حد Supabase الافتراضي

/* ---------------- قاعدة البيانات ---------------- */
let db;
let queue = Promise.resolve();
// PGlite بيشتغل اتصال واحد، فبننفذ الطلبات ورا بعض
const serial = fn => (queue = queue.then(fn, fn));

const BOOTSTRAP = `
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
end $$;
create schema if not exists auth;
create schema if not exists storage;
create table if not exists auth.users(
  id uuid primary key, email text unique not null, pass text not null, created_at timestamptz default now());
create table if not exists auth.refresh_tokens(token text primary key, user_id uuid not null, created_at timestamptz default now());
create or replace function auth.jwt() returns jsonb language sql stable as
  $f$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $f$;
create or replace function auth.uid() returns uuid language sql stable as
  $f$ select nullif(auth.jwt() ->> 'sub', '')::uuid $f$;
create table if not exists storage.buckets(id text primary key, name text, public boolean default false);
create table if not exists storage.objects(
  id bigint generated always as identity primary key, bucket_id text references storage.buckets(id),
  name text not null, owner text default (auth.jwt() ->> 'email'), created_at timestamptz default now(),
  unique(bucket_id, name));
alter table storage.objects enable row level security;
grant usage on schema public, auth, storage to anon, authenticated;
grant select, insert, delete on storage.objects to authenticated;
grant select on storage.buckets to authenticated;
alter default privileges in schema public grant all on tables to authenticated;
alter default privileges in schema public grant all on sequences to authenticated;
alter default privileges in schema public grant execute on functions to authenticated;
`;

async function initDb() {
  // التواريخ ترجع نص زي Supabase (من غير فرق توقيت)، والأرقام ترجع أرقام
  const raw = v => v;
  db = new PGlite(path.join(DATA_DIR, 'db'), { parsers: { 1082: raw, 1114: raw, 1184: raw, 1700: v => Number(v) } });
  await db.exec(BOOTSTRAP);
  // setup.sql آمن يتشغل كل مرة: أول مرة بيعمل كل حاجة، وبعد كده بيضيف أي تحديث جديد من غير ما يمسح بيانات
  const first = !(await db.query(`select to_regclass('public.payments') as t`)).rows[0].t;
  console.log(first ? '• أول تشغيل: بنجهّز قاعدة البيانات ...' : '• بنراجع قاعدة البيانات ...');
  await db.exec(fs.readFileSync(path.join(APP_DIR, 'setup.sql'), 'utf8'));
  await db.exec(`grant all on all tables in schema public to authenticated;
                 grant all on all sequences in schema public to authenticated;
                 grant execute on all functions in schema public to authenticated;
                 revoke insert, update, delete, truncate on public.activity_log from authenticated, anon;`);
}

/* تنفيذ كاستخدم عادي عشان صلاحيات RLS تشتغل زي Supabase بالظبط */
function asUser(claims, fn) {
  return serial(async () => {
    await db.exec('begin');
    try {
      await db.query(`select set_config('role', $1, true), set_config('request.jwt.claims', $2, true)`,
        [claims ? 'authenticated' : 'anon', claims ? JSON.stringify(claims) : '']);
      const r = await fn(db);
      await db.exec('commit');
      return r;
    } catch (e) { await db.exec('rollback').catch(() => {}); throw e; }
  });
}

/* ---------------- JWT ---------------- */
const b64u = b => Buffer.from(b).toString('base64url');
function signJwt(payload) {
  const h = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' })), p = b64u(JSON.stringify(payload));
  return `${h}.${p}.${crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url')}`;
}
function verifyJwt(t) {
  try {
    const [h, p, s] = String(t).split('.');
    const exp = crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url');
    if (!s || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(exp))) return null;
    const c = JSON.parse(Buffer.from(p, 'base64url'));
    return c.exp > Date.now() / 1000 ? c : null;
  } catch { return null; }
}
const claimsOf = req => verifyJwt((req.headers.authorization || '').replace(/^Bearer\s+/i, ''));

/* ---------------- أدوات HTTP ---------------- */
function send(res, status, body, headers = {}) {
  const isBuf = Buffer.isBuffer(body);
  res.writeHead(status, {
    'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS', 'Access-Control-Expose-Headers': '*',
    ...(body === undefined || isBuf ? {} : { 'Content-Type': 'application/json; charset=utf-8' }), ...headers,
  });
  res.end(body === undefined ? undefined : isBuf ? body : JSON.stringify(body));
}
const readBody = req => new Promise((ok, bad) => {
  const ch = []; req.on('data', c => ch.push(c)); req.on('end', () => ok(Buffer.concat(ch))); req.on('error', bad);
});
const readJson = async req => { const b = await readBody(req); return b.length ? JSON.parse(b) : {}; };
function pgError(res, e) {
  const status = ['23505','23503','23001'].includes(e.code) ? 409 : e.code === '42501' ? 403 : 400;
  send(res, status, { code: e.code || 'PGRST000', message: e.message, details: e.detail || null, hint: e.hint || null });
}

/* ---------------- Auth ---------------- */
const hashPass = (pw, salt = crypto.randomBytes(16).toString('hex')) =>
  `${salt}:${crypto.scryptSync(pw, salt, 32).toString('hex')}`;
const checkPass = (pw, stored) => { const [salt] = stored.split(':'); return crypto.timingSafeEqual(Buffer.from(hashPass(pw, salt)), Buffer.from(stored)); };
const userJson = u => ({
  id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email,
  email_confirmed_at: u.created_at, confirmed_at: u.created_at, created_at: u.created_at, updated_at: u.created_at,
  app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, identities: [],
});
async function session(u) {
  const now = Math.floor(Date.now() / 1000);
  const refresh = crypto.randomBytes(24).toString('hex');
  await serial(() => db.query('insert into auth.refresh_tokens(token, user_id) values ($1,$2)', [refresh, u.id]));
  return {
    access_token: signJwt({ sub: u.id, email: u.email, role: 'authenticated', aud: 'authenticated', iat: now, exp: now + TOKEN_TTL }),
    token_type: 'bearer', expires_in: TOKEN_TTL, expires_at: now + TOKEN_TTL, refresh_token: refresh, user: userJson(u),
  };
}
const authErr = (res, status, code, msg) => send(res, status, { code: status, error_code: code, msg, error: code, error_description: msg });

async function handleAuth(req, res, url) {
  const p = url.pathname.replace('/auth/v1', '');
  const q1 = (sql, args) => serial(() => db.query(sql, args)).then(r => r.rows[0]);
  if (p === '/signup' && req.method === 'POST') {
    const { email, password } = await readJson(req);
    const e = String(email || '').trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(e)) return authErr(res, 400, 'validation_failed', 'Unable to validate email address: invalid format');
    if (!password || password.length < 6) return authErr(res, 422, 'weak_password', 'Password should be at least 6 characters.');
    if (await q1('select 1 from auth.users where email=$1', [e])) return authErr(res, 422, 'user_already_exists', 'User already registered');
    const u = await q1('insert into auth.users(id,email,pass) values ($1,$2,$3) returning *', [crypto.randomUUID(), e, hashPass(password)]);
    return send(res, 200, await session(u));
  }
  if (p === '/token' && req.method === 'POST') {
    const grant = url.searchParams.get('grant_type'); const b = await readJson(req);
    if (grant === 'password') {
      const u = await q1('select * from auth.users where email=$1', [String(b.email || '').trim().toLowerCase()]);
      if (!u || !checkPass(String(b.password || ''), u.pass)) return authErr(res, 400, 'invalid_credentials', 'Invalid login credentials');
      return send(res, 200, await session(u));
    }
    if (grant === 'refresh_token') {
      const t = await q1('delete from auth.refresh_tokens where token=$1 returning user_id', [b.refresh_token]);
      if (!t) return authErr(res, 400, 'refresh_token_not_found', 'Invalid Refresh Token: Refresh Token Not Found');
      const u = await q1('select * from auth.users where id=$1', [t.user_id]);
      return send(res, 200, await session(u));
    }
    return authErr(res, 400, 'unsupported_grant_type', 'unsupported grant type');
  }
  if (p === '/user' && req.method === 'GET') {
    const c = claimsOf(req); if (!c) return authErr(res, 401, 'bad_jwt', 'invalid JWT');
    const u = await q1('select * from auth.users where id=$1', [c.sub]);
    return u ? send(res, 200, userJson(u)) : authErr(res, 404, 'user_not_found', 'User not found');
  }
  if (p === '/logout' && req.method === 'POST') {
    const c = claimsOf(req); if (c) await serial(() => db.query('delete from auth.refresh_tokens where user_id=$1', [c.sub]));
    return send(res, 204);
  }
  if (p === '/settings') return send(res, 200, { external: { email: true }, disable_signup: false, mailer_autoconfirm: true });
  return authErr(res, 404, 'not_found', 'Not found');
}

/* ---------------- REST (نفس طريقة PostgREST) ---------------- */
const ident = s => { if (!/^[a-z_][a-z0-9_]*$/i.test(s)) throw Object.assign(new Error(`bad identifier: ${s}`), { code: 'PGRST100' }); return `"${s}"`; };
function splitTop(s) { const out = []; let d = 0, cur = ''; for (const ch of s) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && !d) { out.push(cur); cur = ''; } else cur += ch; } if (cur) out.push(cur); return out; }

async function fkTo(client, table, rel) {
  const r = await client.query(`
    select a.attname col, fa.attname fcol from pg_constraint c
      join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
      join pg_attribute fa on fa.attrelid=c.confrelid and fa.attnum=c.confkey[1]
     where c.contype='f' and c.conrelid=('public.'||$1)::regclass and c.confrelid=('public.'||$2)::regclass`, [table, rel]);
  if (!r.rows[0]) throw Object.assign(new Error(`no relationship ${table} -> ${rel}`), { code: 'PGRST200' });
  return r.rows[0];
}
async function selectList(client, table, sel) {
  const parts = splitTop((sel || '*').replace(/\s+/g, ''));
  const cols = [];
  for (const p of parts) {
    const m = p.match(/^([a-z_][a-z0-9_]*)\((.*)\)$/i);
    if (m) {
      const [, rel, inner] = m; const fk = await fkTo(client, table, rel);
      const fields = inner === '*' ? `to_jsonb(r)` : `jsonb_build_object(${inner.split(',').map(c => `'${c.replace(/'/g, '')}', r.${ident(c)}`).join(',')})`;
      cols.push(`(select ${fields} from public.${ident(rel)} r where r.${ident(fk.fcol)} = t.${ident(fk.col)}) as ${ident(rel)}`);
    } else cols.push(p === '*' ? 't.*' : `t.${ident(p)}`);
  }
  return cols.join(', ');
}
const OPS = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=', like: 'like', ilike: 'ilike' };
function whereClause(params, args) {
  const w = [];
  for (const [k, v] of params) {
    if (['select', 'order', 'limit', 'offset', 'columns', 'on_conflict'].includes(k)) continue;
    const m = v.match(/^(not\.)?([a-z]+)\.(.*)$/s); if (!m) continue;
    const [, not, op, val] = m; let cond;
    if (op === 'is') cond = `t.${ident(k)} is ${val === 'null' ? 'null' : val === 'true' ? 'true' : 'false'}`;
    else if (op === 'in') { const items = val.replace(/^\(|\)$/g, '').split(',').map(x => x.replace(/^"|"$/g, '')); args.push(items); cond = `t.${ident(k)}::text = any($${args.length})`; }
    else if (OPS[op]) { args.push(val); cond = `t.${ident(k)}::text ${OPS[op]} $${args.length}::text`; if (['gt','gte','lt','lte'].includes(op)) cond = `t.${ident(k)} ${OPS[op]} $${args.length}`; }
    else throw Object.assign(new Error(`unsupported operator ${op}`), { code: 'PGRST100' });
    w.push(not ? `not (${cond})` : cond);
  }
  return w.length ? ' where ' + w.join(' and ') : '';
}
function orderClause(o) {
  if (!o) return '';
  return ' order by ' + o.split(',').map(x => { const [c, dir, nulls] = x.split('.'); return `${ident(c)} ${dir === 'desc' ? 'desc' : 'asc'}${nulls === 'nullsfirst' ? ' nulls first' : nulls === 'nullslast' ? ' nulls last' : ''}`; }).join(', ');
}

async function handleRest(req, res, url) {
  const claims = claimsOf(req);
  const p = url.pathname.replace('/rest/v1/', '');
  const single = /vnd\.pgrst\.object/.test(req.headers.accept || '');
  const wantRep = /return=representation/.test(req.headers.prefer || '');
  const params = [...url.searchParams];
  try {
    if (p.startsWith('rpc/')) {
      const fn = p.slice(4); const body = await readJson(req);
      const keys = Object.keys(body); const args = keys.map(k => typeof body[k] === 'object' ? JSON.stringify(body[k]) : body[k]);
      const r = await asUser(claims, c => c.query(`select public.${ident(fn)}(${keys.map((k, i) => `${ident(k)} => $${i + 1}`).join(',')}) as v`, args));
      return send(res, 200, r.rows[0].v);
    }
    const table = ident(p) && p;
    const result = await asUser(claims, async c => {
      const args = [];
      if (req.method === 'GET' || req.method === 'HEAD') {
        let sql = `select ${await selectList(c, table, url.searchParams.get('select'))} from public.${ident(table)} t${whereClause(params, args)}${orderClause(url.searchParams.get('order'))}`;
        // زي Supabase بالظبط: أقصى حاجة 1000 صف في الطلب الواحد
        const lim = Math.min(MAX_ROWS, parseInt(url.searchParams.get('limit')) || MAX_ROWS);
        sql += ` limit ${lim}`;
        if (url.searchParams.get('offset')) sql += ` offset ${parseInt(url.searchParams.get('offset'))}`;
        return (await c.query(sql, args)).rows;
      }
      const sel = wantRep ? await selectList(c, table, url.searchParams.get('select')) : null;
      const wrap = sql => sel ? `with t as (${sql} returning *) select ${sel} from t` : sql;
      if (req.method === 'POST') {
        let body = await readJson(req); if (!Array.isArray(body)) body = [body];
        const out = [];
        for (const row of body) {
          const keys = Object.keys(row);
          const sql = keys.length
            ? `insert into public.${ident(table)} (${keys.map(ident).join(',')}) values (${keys.map((_, i) => `$${i + 1}`).join(',')})`
            : `insert into public.${ident(table)} default values`;
          const r = await c.query(wrap(sql), keys.map(k => row[k]));
          out.push(...r.rows);
        }
        return out;
      }
      if (req.method === 'PATCH') {
        const row = await readJson(req); const keys = Object.keys(row);
        keys.forEach(k => args.push(row[k]));
        const sets = keys.map((k, i) => `${ident(k)} = $${i + 1}`).join(', ');
        const where = whereClause(params, args).replace(/\bt\./g, `public.${ident(table)}.`);
        return (await c.query(wrap(`update public.${ident(table)} set ${sets}${where}`), args)).rows;
      }
      if (req.method === 'DELETE') {
        const where = whereClause(params, args).replace(/\bt\./g, `public.${ident(table)}.`);
        return (await c.query(wrap(`delete from public.${ident(table)}${where}`), args)).rows;
      }
      throw Object.assign(new Error('method not allowed'), { code: 'PGRST105' });
    });
    if (req.method !== 'GET' && !wantRep) return send(res, req.method === 'POST' ? 201 : 204);
    if (single) {
      if (result.length !== 1) return send(res, 406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `The result contains ${result.length} rows`, hint: null });
      return send(res, 200, result[0]);
    }
    return send(res, req.method === 'POST' ? 201 : 200, result);
  } catch (e) { return pgError(res, e); }
}

/* ---------------- Storage ---------------- */
const safePath = (bucket, name) => {
  const full = path.resolve(FILES_DIR, bucket, name);
  if (!full.startsWith(path.resolve(FILES_DIR, bucket) + path.sep)) throw Object.assign(new Error('bad path'), { code: '22023' });
  return full;
};
const signTok = (bucket, name, exp) => crypto.createHmac('sha256', SECRET).update(`${bucket}/${name}:${exp}`).digest('base64url');

async function handleStorage(req, res, url) {
  const claims = claimsOf(req);
  const p = decodeURIComponent(url.pathname.replace('/storage/v1/', ''));
  try {
    let m;
    // عرض صورة برابط موقّع
    if (req.method === 'GET' && (m = p.match(/^object\/sign\/([^/]+)\/(.+)$/))) {
      const [, bucket, name] = m; const [exp, sig] = String(url.searchParams.get('token') || '').split('.');
      if (!sig || +exp < Date.now() / 1000 || sig !== signTok(bucket, name, exp)) return send(res, 400, { statusCode: '400', error: 'InvalidSignature', message: 'Invalid or expired token' });
      const f = safePath(bucket, name); if (!fs.existsSync(f)) return send(res, 404, { statusCode: '404', error: 'not_found', message: 'Object not found' });
      return send(res, 200, fs.readFileSync(f), { 'Content-Type': fs.readFileSync(f + '.type', 'utf8'), 'Cache-Control': 'private, max-age=3600' });
    }
    // إنشاء رابط موقّع
    if (req.method === 'POST' && (m = p.match(/^object\/sign\/([^/]+)\/(.+)$/))) {
      const [, bucket, name] = m; const { expiresIn = 60 } = await readJson(req);
      const r = await asUser(claims, c => c.query('select 1 from storage.objects where bucket_id=$1 and name=$2', [bucket, name]));
      if (!r.rows.length) return send(res, 400, { statusCode: '404', error: 'not_found', message: 'Object not found' });
      const exp = Math.floor(Date.now() / 1000) + +expiresIn;
      return send(res, 200, { signedURL: `/object/sign/${bucket}/${name}?token=${exp}.${signTok(bucket, name, exp)}` });
    }
    // رفع صورة
    if ((req.method === 'POST' || req.method === 'PUT') && (m = p.match(/^object\/([^/]+)\/(.+)$/))) {
      const [, bucket, name] = m; const raw = await readBody(req);
      let data = raw, type = req.headers['content-type'] || 'application/octet-stream';
      if (/multipart\/form-data/.test(type)) {
        const fd = await new Request('http://x', { method: 'POST', headers: { 'content-type': type }, body: raw }).formData();
        const file = [...fd.values()].find(v => typeof v !== 'string');
        data = Buffer.from(await file.arrayBuffer()); type = file.type || 'application/octet-stream';
      }
      await asUser(claims, c => c.query('insert into storage.objects(bucket_id, name) values ($1,$2)', [bucket, name]));
      const f = safePath(bucket, name); fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, data); fs.writeFileSync(f + '.type', type);
      return send(res, 200, { Key: `${bucket}/${name}`, Id: crypto.randomUUID() });
    }
    // مسح صور
    if (req.method === 'DELETE' && (m = p.match(/^object\/([^/]+)$/))) {
      const [, bucket] = m; const { prefixes = [] } = await readJson(req);
      const r = await asUser(claims, c => c.query('delete from storage.objects where bucket_id=$1 and name = any($2) returning name', [bucket, prefixes]));
      for (const { name } of r.rows) { const f = safePath(bucket, name); fs.rmSync(f, { force: true }); fs.rmSync(f + '.type', { force: true }); }
      return send(res, 200, r.rows.map(x => ({ name: x.name, bucket_id: bucket })));
    }
    return send(res, 404, { statusCode: '404', error: 'not_found', message: 'Not found' });
  } catch (e) {
    const status = e.code === '42501' ? 403 : e.code === '23505' ? 409 : 400;
    return send(res, status, { statusCode: String(status), error: e.code === '42501' ? 'Unauthorized' : 'Error', message: e.message });
  }
}

/* ---------------- ملفات التطبيق ---------------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.sql': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.css': 'text/css' };
function lanUrls() {
  const out = [];
  for (const [name, list] of Object.entries(require('os').networkInterfaces()))
    for (const a of list || [])
      if (a.family === 'IPv4' && !a.internal && /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address) && !/vEthernet|VirtualBox|VMware|WSL|Hyper-V|docker/i.test(name))
        out.push(`http://${a.address}:${PORT}`);
  return out;
}
function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname); if (rel.endsWith('/')) rel += 'index.html';
  const f = path.resolve(APP_DIR, '.' + rel);
  if (!f.startsWith(APP_DIR + path.sep) || f.startsWith(__dirname) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return send(res, 404, { message: 'not found' });
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(f).pipe(res);
}

/* ---------------- التشغيل ---------------- */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === 'OPTIONS') return send(res, 204);
  try {
    if (url.pathname.startsWith('/auth/v1/')) return await handleAuth(req, res, url);
    if (url.pathname.startsWith('/rest/v1/')) return await handleRest(req, res, url);
    if (url.pathname.startsWith('/storage/v1/')) return await handleStorage(req, res, url);
    if (url.pathname.startsWith('/realtime/')) return send(res, 404, {});
    if (url.pathname === '/local-info') { const n = await serial(() => db.query('select count(*)::int n from auth.users')); return send(res, 200, { urls: lanUrls(), hasUsers: n.rows[0].n > 0 }); }
    return serveStatic(req, res, url);
  } catch (e) { console.error(e); send(res, 500, { message: e.message }); }
});

initDb().then(() => server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✓ التطبيق شغال على الكمبيوتر ده:  http://localhost:${PORT}`);
  const lan = lanUrls();
  if (lan.length) console.log(`✓ ومن أي موبايل/جهاز على نفس الواي فاي:  ${lan.join('   أو   ')}`);
  console.log('  (لو ويندوز سألك عن الـ Firewall اختار Allow / السماح)');
  console.log(`  البيانات محفوظة في: ${DATA_DIR}\n`);
})).catch(e => { console.error('فشل التشغيل:', e); process.exit(1); });
server.on('error', e => {
  if (e.code === 'EADDRINUSE') console.error(`\n✗ البورت ${PORT} مستخدم — غالبًا التطبيق شغال بالفعل في شاشة تانية. اقفلها وجرب تاني.`);
  else console.error(e);
  process.exit(1);
});
