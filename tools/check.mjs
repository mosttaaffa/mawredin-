// اختبار قبل النشر — لو أي حاجة فشلت النشر مبيحصلش
//   node tools/check.mjs [dist]
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = process.argv[2] ? join(ROOT, process.argv[2]) : ROOT;
let fails = 0; const ok = m => console.log('✓', m), bad = m => { console.error('✗', m); fails++; };
const html = readFileSync(join(DIR, 'index.html'), 'utf8');

// 1) كل الملفات اللي index.html بيطلبها موجودة، وسكربتات التطبيق بتتقري من غير أخطاء (بنفس ترتيب التحميل)
const refs = [...html.matchAll(/(?:src|href)="([^"#?]+)"/g)].map(m => m[1]).filter(u => !/^(https?:|data:)/.test(u));
const missing = refs.filter(u => !existsSync(join(DIR, u)));
missing.length ? bad('ملفات ناقصة في index.html: ' + missing.join(', ')) : ok(`index.html: ${refs.length} ملف موجود`);
const appJs = refs.filter(u => /^js\/.+\.js$/.test(u));
try{ new vm.Script(appJs.map(u => readFileSync(join(DIR, u), 'utf8')).join('\n;\n'), {filename:'app-bundle.js'}); ok(`كود التطبيق سليم (${appJs.length} ملف)`); }
catch(e){ bad('خطأ في الكود: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 3).join('\n')); }

// 2) كل ملفات التطبيق محفوظة للشغل من غير نت (sw.js)، وكل اللي في sw.js موجود
const sw = readFileSync(join(DIR, 'sw.js'), 'utf8');
const shell = [...sw.matchAll(/'\.\/([^']*)'/g)].map(m => m[1]).filter(Boolean);
const shMiss = shell.filter(u => !existsSync(join(DIR, u)));
shMiss.length ? bad('sw.js بيطلب ملفات مش موجودة: ' + shMiss.join(', ')) : ok(`sw.js: ${shell.length} ملف للشغل من غير نت`);
const notCached = refs.filter(u => /\.(js|css)$/.test(u) && !shell.includes(u));
notCached.length ? bad('ملفات مش محفوظة للشغل من غير نت (ضيفها في sw.js): ' + notCached.join(', ')) : ok('كل ملفات التطبيق شغالة من غير نت');
/const CACHE = 'mawredin-v\d+'/.test(sw) ? ok('رقم إصدار الكاش: ' + sw.match(/mawredin-v\d+/)[0]) : bad('مفيش رقم إصدار للكاش في sw.js');

// 3) مفيش مفاتيح سرية في أي ملف هيترفع
const SECRET = [/service_role/i, /sb_secret_[A-Za-z0-9_-]{10,}/, /postgres(ql)?:\/\/[^'"\s]*:[^'"\s]*@/i, /SUPABASE_SERVICE_KEY\s*[:=]\s*['"][^'"]{20,}/, /BACKUP_PASSPHRASE\s*[:=]\s*['"][^'"]+/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /ghp_[A-Za-z0-9]{30,}/, /github_pat_[A-Za-z0-9_]{30,}/];
const walk = d => readdirSync(d).flatMap(f => { const p = join(d, f); if(/^(\.git|node_modules|local-server|dist|tools|\.github)$/.test(f) && d === DIR) return []; return statSync(p).isDirectory() ? walk(p) : [p]; });
const hits = [];
for(const f of walk(DIR)){
  if(statSync(f).size > 6e6 || /\.(png|webp|jpg|woff2?|ttf|traineddata|gz|wasm)$/i.test(f)) continue;
  const t = readFileSync(f, 'utf8');
  // ملفات الشرح (.md) فيها أمثلة زي 'postgres://postgres:pass@localhost' — بنفحص فيها المفاتيح الحقيقية بس
  const rules = /\.(md|sql)$/.test(f) ? SECRET.filter(r => !/service_role|postgres|BACKUP_PASSPHRASE|SUPABASE_SERVICE_KEY/.test(r.source)) : SECRET;
  for(const r of rules) if(r.test(t) && !/\/\/ آمن:/.test(t.slice(Math.max(0, t.search(r) - 200), t.search(r)))) hits.push(f.replace(DIR + '/', '') + ' ← ' + r);
}
// المفتاح اللي في config.js لازم يكون publishable أو anon (مش service_role)
const cfg = readFileSync(join(DIR, 'config.js'), 'utf8'), key = (cfg.match(/key:\s*'([^']+)'/) || [])[1] || '';
if(/^eyJ/.test(key)){ try{ const role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role; if(role !== 'anon') hits.push('config.js ← المفتاح role=' + role); }catch(e){} }
else if(key && !/^sb_publishable_/.test(key)) hits.push('config.js ← المفتاح مش publishable');
hits.length ? bad('مفاتيح سرية ممنوع ترتفع:\n  ' + hits.join('\n  ')) : ok('مفيش مفاتيح سرية');

// 4) مفيش ملف أكبر من حد Cloudflare Pages (25 ميجا)
const big = walk(DIR).filter(f => statSync(f).size > 25 * 1048576);
big.length ? bad('ملفات أكبر من 25 ميجا: ' + big.join(', ')) : ok('كل الملفات أقل من 25 ميجا');

if(fails){ console.error(`\n${fails} اختبار فشل — النشر اتلغى`); process.exit(1); }
console.log('\nكله تمام ✓');
