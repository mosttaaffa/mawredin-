// بيجهز فولدر dist فيه ملفات التطبيق بس (من غير setup.sql والسيرفر المحلي والتعليمات)
// الاستخدام: node tools/build-dist.mjs   →   ارفع فولدر dist على أي استضافة ملفات ثابتة
import { cpSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'), OUT = join(ROOT, 'dist');
const KEEP = ['index.html', 'config.js', 'manifest.json', 'sw.js', '_headers', '.nojekyll', 'css', 'js', 'icons', 'vendor'];
rmSync(OUT, {recursive:true, force:true}); mkdirSync(OUT);
for(const f of KEEP) if(existsSync(join(ROOT, f))) cpSync(join(ROOT, f), join(OUT, f), {recursive:true});
console.log('✓ dist جاهز:', KEEP.filter(f => existsSync(join(ROOT, f))).join(' '));
