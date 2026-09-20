# شارجي (Chargee)

منصة SaaS متعددة المستأجرين لإدارة الشحن البري — بالعربية بالكامل (RTL)، لشركات نقل البضائع بين المدن
والدول: شحنات وكراتين، رحلات ومحطات، فوترة تلقائية بحسب عدد الكراتين، تتبّع عام بدون تسجيل دخول، واجهة
سائق مخصصة للموبايل، وإشعارات واتساب تلقائية.

ثلاث بوابات دخول منفصلة:

| البوابة | المستخدم | الوصف |
|---|---|---|
| `/app` | موظفو شركة الشحن | الشحنات، الرحلات، العملاء، الفوترة، الموظفون، الصلاحيات |
| `/driver` | السائقون | واجهة مبسّطة لرحلة واحدة نشطة، محسّنة للموبايل |
| `/platform` | مدير المنصة (صاحب النظام) | الشركات المشتركة، الفوترة بينها وبين المنصة، الإعدادات العامة |
| `/track` | أي شخص (بدون حساب) | تتبّع شحنة برقمها + آخر 4 أرقام من جوال المستلم |

## التقنيات

Next.js 16 (App Router + Server Actions) · TypeScript · PostgreSQL + Prisma (مع تاريخ migrations
حقيقي) · JWT مخصص (`jose`) · Tailwind CSS 4 + shadcn/ui · Zustand · React Query · react-hook-form +
zod · Upstash Redis (rate limiting) · تخزين متوافق مع S3 (يعمل مباشرة مع Cloudflare R2) · WhatsApp
Business Cloud API (مع مزوّد وهمي للتطوير) · Playwright (أكثر من 100 سيناريو اختبار end-to-end).

## البدء محليًا

يتطلب Node.js ≥ 20 وPostgreSQL (محليًا أو عبر Docker).

```bash
# 1) قاعدة بيانات PostgreSQL محلية (أو استخدم تثبيتًا موجودًا لديك)
docker run -d --name chargee-pg -e POSTGRES_PASSWORD=devpassword123 \
  -e POSTGRES_DB=chargee -p 5432:5432 postgres:16

# 2) الاعتماديات + متغيرات البيئة
npm install
cp .env.example .env   # القيم الافتراضية تعمل مباشرة مع الحاوية أعلاه

# 3) تطبيق الترحيلات وبيانات تجريبية
npx prisma migrate deploy
npm run db:seed

# 4) التشغيل
npm run dev
```

افتح `http://localhost:3000`. حسابات تجريبية (كلمة المرور لجميعها `Passw0rd!`، من `prisma/seed.ts`):

| الدور | البريد |
|---|---|
| مدير المنصة | `admin@platform.dev` |
| مدير شركة (مؤسسة النور) | `owner@alnoor.example` |
| موظف فرع | `branch@alnoor.example` |
| سائق | `driver@alnoor.example` |

> `npm run db:seed` مخصص للتطوير فقط — ينشئ شركات وهمية بكلمة مرور مشتركة معروفة. **لا تُشغّله على
> قاعدة بيانات إنتاج أبدًا.** لإنشاء أول حساب مدير منصة حقيقي، استخدم `npm run db:bootstrap` (انظر
> التعليقات في `prisma/bootstrap.ts`).

## الاختبارات

```bash
npx playwright install --with-deps chromium
npx playwright test
```

مجموعة الاختبارات (`tests/e2e/`) تغطّي دورة حياة الشحنة الكاملة، عزل البيانات بين الشركات (tenant
isolation)، صلاحيات الأدوار، الفوترة، الإشعارات، ونطاق الفروع — نفس السيناريوهات تُشغَّل في كل Pull
Request عبر `.github/workflows/ci.yml`.

## النشر إلى الإنتاج

راجع **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** لثلاث طرق نشر حقيقية ومُختبَرة:

1. **Vercel + كلاوفلير كطبقة DNS/CDN/حماية أمام الموقع** — الأسرع، وهو الإعداد المُختبر فعليًا لهذا
   المشروع.
2. **استضافة ذاتية عبر Docker + Cloudflare Tunnel** — تحكم كامل بالخادم، صورة Docker جاهزة ومُختبرة في
   هذا المستودع (`Dockerfile`, `docker-compose.yml`).
3. **تشغيل الكود داخل Cloudflare Workers مباشرة** — موثّق كخيار متقدم مع شرح صريح للقيود الحقيقية
   الموجودة حاليًا في نظام Prisma البيئي لهذه البنية.

## البنية

```
src/
├── app/            # صفحات Next.js (app, driver, platform, track, register, login, ...)
├── modules/        # منطق الأعمال لكل نطاق (shipments, trips, billing, notifications, ...)
├── components/     # واجهة مستخدم مشتركة (shadcn/ui, shell, charts, landing, ...)
└── lib/            # مصادقة، صلاحيات (RBAC)، JWT، تخزين، تنسيق العملة/التاريخ، rate limiting
prisma/             # المخطط + تاريخ الترحيلات + بيانات seed/bootstrap
tests/e2e/          # اختبارات Playwright
docs/               # أدلة إضافية (النشر، ...)
```

كل ملف مصدري تقريبًا يحمل تعليقات توضّح *سبب* القرار التقني وليس فقط ماذا يفعل الكود — ابدأ من هناك عند
تعديل أي جزء غير مألوف.
