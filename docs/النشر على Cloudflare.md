# نشر التطبيق على Cloudflare Pages (مجانًا، من مستودع خاص)

## الفكرة
- الكود في مستودع GitHub **خاص**.
- أي تعديل يترفع على `main` بيتعمله **اختبار** تلقائي (`tools/check.mjs`): الكود سليم، كل الملفات موجودة، كل ملفات التطبيق شغالة من غير نت، ومفيش أي مفتاح سري. لو الاختبار فشل **النشر مبيحصلش**.
- لو نجح، بيتنشر على Cloudflare Pages (`.github/workflows/deploy.yml`).
- أي فرع غير `main` (مثلًا `test`) بيتنشر على **رابط تجريبي منفصل** — تجرب عليه الأول، وبعدين تدمجه في `main`.

> الخطة المجانية لـ Cloudflare Pages (وقت كتابة الملف): 500 نشر في الشهر، 20,000 ملف، أقصى حجم للملف 25 ميجا، ومفيش حد على الزيارات. التطبيق فيه ~70 ملف وأكبر ملف أقل من 5 ميجا.

## الإعداد (مرة واحدة)

### 1) المستودع الخاص
1. GitHub ← **New repository** ← الاسم مثلًا `mawredin-app` ← **Private** ← Create.
2. ارفع فيه محتوى المشروع ده كله (ماعدا `dist/` و`local-server/data/` — موجودين في `.gitignore`).

### 2) Cloudflare
1. اعمل حساب مجاني على cloudflare.com (من غير كارت).
2. **Account ID**: من الصفحة الرئيسية للحساب ← Workers & Pages ← هتلاقيه على اليمين ← انسخه.
3. **API Token**: الصورة الشخصية ← My Profile ← API Tokens ← Create Token ← **Create Custom Token**:
   - Permissions: `Account` ← `Cloudflare Pages` ← `Edit` (بس كده — مفيش صلاحيات تانية)
   - Account Resources: حسابك
   - Create ← انسخ التوكن (بيظهر مرة واحدة).

### 3) ربطهم
في المستودع الخاص ← Settings ← Secrets and variables ← Actions:
| النوع | الاسم | القيمة |
|---|---|---|
| Secret | `CLOUDFLARE_API_TOKEN` | التوكن |
| Secret | `CLOUDFLARE_ACCOUNT_ID` | الـ Account ID |
| Variable (اختياري) | `CF_PROJECT` | اسم المشروع (الافتراضي `mawredin`) |

بعدها: Actions ← deploy ← **Run workflow**. أول مرة بيعمل مشروع Pages لوحده. الرابط بيبقى `https://mawredin.pages.dev` (لو الاسم متاخد اختار اسم تاني في `CF_PROJECT`).

### 4) Supabase يقبل الرابط الجديد
Supabase ← Authentication ← URL Configuration:
- **Site URL**: الرابط الجديد
- **Redirect URLs**: ضيف `https://mawredin.pages.dev/**` (وسيب القديم لحد ما النقل يخلص)

### 5) نقل الموبايلات من الرابط القديم (GitHub Pages) بأمان
البيانات اللي على الموبايل مربوطة بالرابط، فالعمليات اللي لسه ما اتبعتتش لازم تخلص على الرابط القديم الأول:
1. في `config.js` **على الرابط القديم بس** ضيف: `movedTo: 'https://mawredin.pages.dev/',`
2. أي حد يفتح الرابط القديم: التطبيق بيبعت كل العمليات اللي على الجهاز للسيرفر، ولما يخلصوا بيقوله «افتح الرابط الجديد» — ومبيخليهوش يمشي وفيه حاجة لسه ما اتبعتتش.
3. على الآيفون: افتح الرابط الجديد في Safari ← مشاركة ← «إضافة إلى الشاشة الرئيسية»، وامسح الأيقونة القديمة.
4. بعد ما الكل ينقل (أسبوع مثلًا) تقدر تقفل GitHub Pages أو تخلي المستودع القديم خاص.

## التحديثات بعد كده
```bash
git checkout -b test        # جرّب التعديل
git push origin test        # ← اختبار + رابط تجريبي: https://test.mawredin.pages.dev
git checkout main && git merge test && git push   # ← اختبار + نشر على الرابط الأساسي
```
**مهم مع كل تحديث:** زوّد رقم `CACHE` في `sw.js` (مثلًا `mawredin-v63` ← `mawredin-v64`) عشان الموبايلات تنزّل النسخة الجديدة.

## اختبار يدوي قبل الرفع
```bash
node tools/check.mjs                                   # فحص المشروع
node tools/build-dist.mjs && node tools/check.mjs dist # فحص اللي هيترفع فعلًا
```

## ممنوع يترفع
- مفتاح `service_role` / `sb_secret_...` بتاع Supabase، رابط قاعدة البيانات بكلمة السر، كلمة سر النسخ الاحتياطي، أي توكن.
- المسموح في `config.js`: الـ Project URL والـ **Publishable key** بس — ده معمول عشان يبقى ظاهر، والحماية من صلاحيات قاعدة البيانات (RLS في `setup.sql`).
- الاختبار بيرفض النشر لو لقى أي حاجة من دول.
