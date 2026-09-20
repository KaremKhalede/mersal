# دليل النشر (Deployment)

هذا الدليل يشرح ثلاث طرق حقيقية لتشغيل شارجي (Chargee) في الإنتاج. الطريقتان الأولى والثانية مُختبَرتان
فعليًا (تم بناء الصورة وتشغيلها والتحقق من استجابتها أثناء إعداد هذا الدليل). الطريقة الثالثة موثّقة بأمانة
مع تحذير واضح من قيود حقيقية في المنصة نفسها.

> **لماذا لا توجد طريقة واحدة فقط؟** لأن "الرفع على كلاوفلير" له معنيان مختلفان تمامًا من الناحية
> التقنية: (أ) استخدام كلاوفلير كطبقة DNS/CDN/حماية أمام تطبيق يعمل على خادم Node.js عادي — وهذا آمن
> ومضمون 100%، و(ب) تشغيل كود التطبيق نفسه داخل Cloudflare Workers — وهذا ممكن تقنيًا لكنه يتطلب تغييرًا
> جوهريًا في طريقة اتصال Prisma بقاعدة البيانات، ولا يزال به مشاكل معروفة غير محلولة في مكتبات Prisma
> الرسمية حتى تاريخ كتابة هذا الدليل. الخيار (أ) هو الموصى به لتشغيل تجاري حقيقي اليوم.

---

## الخيار 1 (الأسرع): Vercel + كلاوفلير كطبقة DNS/حماية أمام الموقع

هذا هو الإعداد الذي بُني واختُبر عليه المشروع بالكامل (انظر `vercel.json` و 100+ سيناريو اختبار في
`tests/e2e`). كلاوفلير يتولى النطاق (Domain)، الحماية (WAF)، وتسريع المحتوى الثابت، بينما يعمل التطبيق
نفسه على بنية Vercel المُختبرة.

### الخطوات

1. **قاعدة بيانات PostgreSQL مُدارة** — أنشئ قاعدة بيانات مجانية على [Neon](https://neon.tech) أو
   [Supabase](https://supabase.com). انسخ:
   - رابط الاتصال المُجمَّع (Pooled / Transaction mode, غالبًا منفذ `6543`) → `DATABASE_URL`
   - رابط الاتصال المباشر (Direct, منفذ `5432`) → `DIRECT_URL`
2. **استورد المشروع في Vercel**: `vercel.com/new` → اختر مستودع GitHub → لا تغيّر إعدادات البناء
   (Next.js يُكتشف تلقائيًا).
3. **أضف متغيرات البيئة** في Vercel → Settings → Environment Variables، بنفس أسماء `.env.example`.
   الحد الأدنى للإنتاج:
   - `DATABASE_URL`, `DIRECT_URL`
   - `SESSION_SECRET` — قيمة عشوائية طويلة، مثلاً ناتج `openssl rand -hex 32`
   - `APP_URL` — النطاق النهائي بصيغة `https://...`
   - `STORAGE_DRIVER=s3` مع بيانات R2 (انظر قسم التخزين أدناه) — **إلزامي**، التطبيق يرفض الإقلاع في
     الإنتاج بقيمة `local` لأن قرص Vercel مؤقت ويُفقد فيه أي ملف مرفوع.
   - `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` — من Vercel Marketplace → Upstash، أو
     مباشرة من upstash.com. بدونها يعمل الحد من المحاولات (Rate limiting) في وضع "مفتوح" (غير محمي).
4. **طبّق قاعدة البيانات وابذر بيانات المدير الأول** — من جهازك، مع تصدير نفس `DATABASE_URL`/`DIRECT_URL`:
   ```bash
   npx prisma migrate deploy
   BOOTSTRAP_ADMIN_EMAIL=you@company.com BOOTSTRAP_ADMIN_PASSWORD='StrongPass!23' \
     BOOTSTRAP_ADMIN_NAME="اسمك" npx tsx prisma/bootstrap.ts
   ```
   **لا تُشغّل** `npm run db:seed` على قاعدة إنتاج — هذا السكربت مخصص للتجربة المحلية فقط وينشئ شركات
   وهمية بكلمة مرور واحدة معروفة للجميع.
5. **اربط النطاق عبر كلاوفلير**:
   - في Vercel: Settings → Domains → أضف نطاقك (مثلاً `app.yourcompany.com`).
   - في لوحة كلاوفلير: أضف سجل `CNAME` يشير إلى النطاق الذي يعطيك إياه Vercel، **مع تفعيل السحابة البرتقالية
     (Proxied)** — هذا ما يجعل كلاوفلير فعليًا أمام موقعك (CDN + WAF + حماية DDoS + شهادة SSL مجانية).
   - SSL/TLS mode في كلاوفلير: اضبطه على **Full (strict)** — Vercel يوفر شهادة صالحة، فلا حاجة لـ
     "Flexible" الذي يُضعف الاتصال بين كلاوفلير وVercel.
   - (اختياري) فعّل "Always Use HTTPS" و"Automatic HTTPS Rewrites" من تبويب SSL/TLS.

بهذا يكون موقعك فعليًا "على كلاوفلير" من منظور الزائر والنطاق والحماية، بينما التطبيق يعمل على البنية
الأكثر اختبارًا واستقرارًا لهذا المشروع تحديدًا.

---

## الخيار 2: استضافة ذاتية مجانية — Oracle Cloud Free Tier + Docker + Cloudflare Tunnel

هذا الخيار **بدون أي تكلفة شهرية**: خادم مجاني للأبد من Oracle Cloud (وليس عرضًا تجريبيًا محدودًا)،
قاعدة بيانات PostgreSQL تعمل داخل نفس الخادم (لا حاجة لحساب Neon هنا)، تخزين ملفات مجاني عبر Cloudflare
R2، وربط عبر Cloudflare Tunnel. تم بناء صورة Docker واختبارها فعليًا (`Dockerfile`, `docker-compose.yml`)
— الإقلاع، تطبيق الترحيلات، وفحص `/api/health` جميعها نجحت.

**الحسابات الوحيدة التي لازم تنشئها بنفسك** (تتطلب هويتك الشخصية، لا يمكن لأحد إنشاءها نيابة عنك):
حساب Oracle Cloud، وحساب Cloudflare. كل شيء بعد ذلك آلي بسكربت واحد.

### الخطوات

1. **أنشئ حساب [Oracle Cloud](https://www.oracle.com/cloud/free/)** (يطلب بطاقة بنكية للتحقق من الهوية
   فقط، بدون أي خصم فعلي طالما بقيت ضمن الحد المجاني) وأنشئ خادمًا (Compute Instance) بمواصفات
   "Always Free" — Ubuntu، أي حجم من ضمن القائمة المجانية.
2. **أنشئ حاوية R2** من لوحة كلاوفلير → R2 → Create bucket، ثم Manage API Tokens لإصدار مفاتيح
   بصلاحية قراءة/كتابة. احتفظ بـ: Bucket name، Endpoint، Access Key ID، Secret Access Key.
3. **اتصل بالخادم عبر SSH** وشغّل سكربت الإعداد الجاهز:
   ```bash
   curl -fsSL https://raw.githubusercontent.com/KaremKhalede/mersal/main/scripts/server-setup.sh | bash
   ```
   يثبّت Docker، ينسخ المشروع، ويولّد كلمة مرور قاعدة البيانات وسر الجلسة تلقائيًا. سيتوقف ويطلب منك
   تعديل ملف `.env` بقيم R2 من الخطوة 2 (والنطاق الذي ستربطه لاحقًا في `APP_URL`):
   ```bash
   nano ~/mersal/.env
   ```
4. **شغّل السكربت مرة ثانية** لبدء التطبيق فعليًا:
   ```bash
   curl -fsSL https://raw.githubusercontent.com/KaremKhalede/mersal/main/scripts/server-setup.sh | bash
   ```
   هذا يشغّل قاعدة البيانات + الترحيلات + التطبيق، ويتحقق من `/api/health`، ثم يثبّت `cloudflared`.
5. **أنشئ حساب مدير المنصة الأول** (`--entrypoint ""` يلغي أمر الترحيلات الافتراضي لخدمة `migrate`
   ليشتغل بدلًا عنه أمر التمهيد التالي فقط لهذه المرة الواحدة):
   ```bash
   cd ~/mersal
   sudo docker compose run --rm --entrypoint "" \
     -e BOOTSTRAP_ADMIN_EMAIL=you@company.com \
     -e BOOTSTRAP_ADMIN_PASSWORD='StrongPass!23' \
     -e BOOTSTRAP_ADMIN_NAME='اسمك' \
     migrate npx tsx prisma/bootstrap.ts
   ```
6. **اربط الخادم بكلاوفلير** — السكربت يطبع لك 4 أوامر في النهاية (نفس الخطوة تحتاج تفاعلك لأن أول
   أمر يفتح رابط تسجيل دخول في المتصفح):
   ```bash
   cloudflared tunnel login
   cloudflared tunnel create chargee
   cloudflared tunnel route dns chargee track.yourcompany.com
   sudo cloudflared service install && sudo systemctl start cloudflared
   ```
   لا حاجة لفتح أي منفذ للإنترنت ولا حتى IP ثابت — هذا الأسلوب هو الاستخدام الرسمي لكلاوفلير لاستضافة
   تطبيق فعلي عبر شبكتها دون أي بنية تحتية إضافية.

بديل مجاني آخر لو واجهت مشكلة بتوفر خوادم Oracle Free Tier في منطقتك: [Google Cloud Free Tier](https://cloud.google.com/free)
(خادم e2-micro مجاني للأبد في مناطق محددة بأمريكا) — نفس السكربت يعمل عليه بدون تغيير.

### نسخ احتياطي لقاعدة البيانات

```bash
docker compose exec db pg_dump -U chargee chargee > backup-$(date +%F).sql
```
جدوِل هذا الأمر عبر `cron` يوميًا، وارفع الملف الناتج إلى نفس حاوية R2.

---

## الخيار 3 (متقدّم/تجريبي): تشغيل الكود نفسه داخل Cloudflare Workers

**لم يُنفَّذ هذا الخيار في هذا المستودع، وهذا قرار متعمد.** إليك السبب بصراحة:

محرك Prisma القياسي (الذي يستخدمه هذا المشروع، وهو المُختبر بـ 100+ سيناريو Playwright) يعمل عبر ملف
تنفيذي (binary) مكتوب بلغة Rust. بيئة Cloudflare Workers لا تسمح بتشغيل ملفات تنفيذية أصلًا مهما كانت
إعدادات التوافق — هذا قيد في المنصة نفسها وليس مشكلة إعداد. الطريقة الوحيدة لتشغيل Prisma هناك هي عبر
"driver adapters" (طبقة اتصال بديلة تمر عبر HTTP/WebSocket بدل الاتصال المباشر)، وهذا يتطلب:

- تحويل قاعدة البيانات لاستخدام Cloudflare Hyperdrive (أو Prisma Postgres مباشرة)، و
- إعادة كتابة نمط الاتصال بقاعدة البيانات من "عميل واحد مشترك" (الحالي في `src/lib/db.ts`، ومستخدَم في
  عشرات الملفات) إلى "عميل جديد لكل طلب" — تغيير معماري حقيقي، ليس تبديل سطر واحد.
- حتى مع هذا التغيير، توجد مشاكل مفتوحة وموثّقة في مستودعات Prisma الرسمية على GitHub حول تعليق
  الاتصالات (connection hangs) عند إعادة استخدام العميل، وأخطاء في تجميع الحزمة (esbuild) عند دمج
  `pg` مع Hyperdrive عبر OpenNext.

بمعنى آخر: القيام بهذا التغيير "افتراضيًا" وبدون اختبار فعلي على حساب Cloudflare حقيقي كان سيعني المخاطرة
بتطبيق مُختبر وجاهز فعليًا للعمل، مقابل ميزة (تشغيل الكود داخل Workers حرفيًا) لا تضيف قيمة عملية غير
موجودة أصلًا في الخيارين أعلاه — كلاهما يمنحك فعليًا حماية كلاوفلير الكاملة وشبكتها.

إن أردت فريقك لاحقًا اعتماد هذا المسار فعليًا، فالخطوات المرجعية هي:
1. الانتقال لقاعدة بيانات [Prisma Postgres](https://www.prisma.io/postgres) (تعمل على Workers دون
   الحاجة لـ driver adapter منفصل)، أو تفعيل [Cloudflare Hyperdrive](https://developers.cloudflare.com/hyperdrive/)
   أمام قاعدة PostgreSQL الحالية.
2. تثبيت `@opennextjs/cloudflare` و`wrangler`، وتوليد الإعداد عبر `npx @opennextjs/cloudflare@latest init`.
3. إعادة هيكلة `src/lib/db.ts` لإنشاء عميل Prisma جديد داخل كل طلب (route handler / server action) بدل
   العميل المشترك الحالي، باستخدام `@prisma/adapter-pg` أو المكتبة الموصى بها من Prisma لبيئة Workers.
4. اختبار شامل (خصوصًا المسارات ذات القراءات/الكتابات المتعددة في نفس الطلب، مثل تسجيل شحنة أو إغلاق
   رحلة) قبل أي استخدام حقيقي، لأن هذا نمط أحدث وأقل نضجًا من نمط الاتصال المباشر عبر Node.js.

---

## ملخص متغيرات البيئة الإلزامية في الإنتاج

مرجع كامل بالتعليقات موجود في [`.env.example`](../.env.example). الحد الأدنى الذي لا يعمل التطبيق
بدونه في الإنتاج:

| المتغير | الغرض |
|---|---|
| `DATABASE_URL`, `DIRECT_URL` | اتصال PostgreSQL (مُجمَّع/مباشر) |
| `SESSION_SECRET` | توقيع جلسات JWT — يجب أن يكون سرًا عشوائيًا طويلًا وليس القيمة الافتراضية للتطوير |
| `APP_URL` | النطاق العلني الكامل، يُستخدم في روابط التتبع وواتساب |
| `STORAGE_DRIVER=s3` + `S3_*` | التطبيق يرفض الإقلاع بـ `STORAGE_DRIVER=local` في الإنتاج عمدًا |
| `UPSTASH_REDIS_REST_URL/TOKEN` | بدونها، الحد من المحاولات (login/track) يعمل بوضع غير محمي |

اختياري لكن مهم للتشغيل الحقيقي: `WHATSAPP_PROVIDER=meta` مع بيانات Meta Cloud API (بدونها يبقى النظام
على المزوّد الوهمي `mock` — يُسجّل الإشعارات دون إرسالها فعليًا).
