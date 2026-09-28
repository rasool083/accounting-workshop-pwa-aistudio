# معماری APK کارگاه و اپلیکیشن مشتری

## نتیجهٔ تصمیم

برای برنامهٔ کارگاه، زیرساخت بسته‌بندی با Capacitor آماده شد. این مسیر، build فعلی React/Vite را در یک پوستهٔ Android قرار می‌دهد و قابلیت‌های local-first، PWA و نصب مستقیم روی گوشی مالک کارگاه را حفظ می‌کند. این مرحله هنوز APK نهایی امضاشده یا پروژهٔ Android قابل انتشار تولید نمی‌کند، زیرا محیط فعلی Android SDK و `adb` ندارد.

اپلیکیشن مشتری نباید از همین APK یا از فایل localStorage آن استفاده کند. نسخهٔ کارگاه کل داده‌های حسابداری را در دستگاه مالک نگه می‌دارد و `partyId` مجوز امنیتی نیست. اپ مشتری باید یک برنامهٔ جداگانهٔ read-only باشد که فقط از API احراز هویت‌شده داده دریافت کند.

## زیرساخت APK کارگاه

تنظیمات `capacitor.config.ts` با شناسهٔ برنامهٔ `ir.workshop.accounting`، نام فارسی برنامه و مسیر `dist/public` ایجاد شده است. وابستگی‌های `@capacitor/core`، `@capacitor/android` و `@capacitor/cli` در پروژه ثبت شده‌اند.

فرمان‌های رسمی پروژه چنین هستند:

```bash
pnpm build
pnpm android:init   # فقط یک بار؛ پروژهٔ android را ایجاد می‌کند
pnpm android:sync   # build وب و انتقال فایل‌ها به Android
pnpm android:open   # باز کردن پروژه در Android Studio
```

پیش از اجرای `android:init` باید Android Studio، Android SDK، Platform Tools، Build Tools و یک JDK سازگار روی محیط توسعه نصب شوند. بعد از ایجاد پوشهٔ `android`، این پوشه باید مانند کد منبع بررسی شود و فایل‌های secrets یا keystore در Git قرار نگیرند.

نسخهٔ فعلی PWA دارای `manifest.webmanifest`، آیکن‌های نصب و service worker است. service worker فقط پوستهٔ برنامه و فایل‌های same-origin را cache می‌کند و API یا اطلاعات حساس را در cache عمومی قرار نمی‌دهد. دادهٔ حسابداری همچنان باید از مسیر backup رمزگذاری‌شده یا export نسخه‌دار مدیریت شود؛ Android Auto Backup جایگزین backup قابل فهم حسابداری نیست.

## مرز امنیتی اپ مشتری

اپ مشتری فقط باید این داده‌ها را نمایش دهد:

- فاکتورهای فروش متعلق به همان مشتری؛
- مبلغ فاکتور، اقلام، پرداخت‌ها و مانده؛
- چک‌های دریافت‌شده از همان مشتری و وضعیت آن‌ها؛
- تخصیص چک به فاکتورها؛
- صورت‌حساب خواندنی و وضعیت بستن ماه مرتبط با همان مشتری.

اپ مشتری نباید فهرست مشتریان، تأمین‌کنندگان، حساب‌های بانک و صندوق، موجودی انبار، قیمت خرید، فرمول تولید، بهای تمام‌شده، چک‌های دیگران، backup کامل یا تنظیمات کارگاه را دریافت کند. پنهان‌کردن این بخش‌ها در React کافی نیست؛ API و database نیز باید آن‌ها را برنگردانند.

## معماری پیشنهادی backend

مدل چندمستاجری باید یک کارگاه را به‌عنوان `organization` و مشتری را به‌عنوان `customer_user` ثبت کند. عضویت کاربر در کارگاه و نقش او باید جداگانه نگهداری شود.

```text
organizations
organization_members(user_id, organization_id, role)
customer_profiles(user_id, organization_id, party_id)
invoices(organization_id, party_id, ...)
checks(organization_id, party_id, ...)
check_allocations(organization_id, invoice_id, check_id, ...)
customer_statement_snapshots(organization_id, party_id, close_id, ...)
```

در هر درخواست، سرور باید هویت کاربر، عضویت او در سازمان و ارتباط `party_id` با همان کاربر را بررسی کند. policy دیتابیس باید هم `organization_id` و هم `party_id` را کنترل کند. شناسهٔ فاکتور یا شمارهٔ مشتری نباید به‌تنهایی مجوز دسترسی باشد.

برای MVP، پیشنهاد می‌شود مشتری فقط گزارش‌های read-only را ببیند و اطلاعات از ledger اصلی به view یا endpoint محدود تبدیل شود. محاسبات مانده، status چک و تخصیص FIFO باید در سرور یا یک snapshot تأییدشده انجام شوند؛ مشتری نباید JSON کامل ledger را دانلود کند.

## احراز هویت و نشست

ورود مشتری می‌تواند با magic link، OTP یا رمز عبور انجام شود. نشست باید کوتاه‌عمر و قابل لغو باشد. refresh token در storage ناامن وب یا URL قرار نگیرد. logout باید نشست محلی را پاک کند. برای هر endpoint آزمون منفی لازم است: تغییر `party_id`، تغییر `invoice_id`، حذف `organization_id` از درخواست و استفاده از توکن مشتری دیگر نباید داده‌ای برگرداند.

## مسیر انتشار مرحله‌ای

ابتدا APK مالک کارگاه با Capacitor ساخته و روی دو دستگاه واقعی آزمایش می‌شود. سپس backup و restore، به‌روزرسانی نسخه، حالت آفلاین، rotation صفحه و Android back button آزمون می‌شوند.

در مرحلهٔ بعد backend مشتری با Auth و Row-Level Security ساخته می‌شود. ابتدا یک مشتری آزمایشی و چند فاکتور مصنوعی استفاده می‌شود. پس از تأیید اینکه مشتری A هیچ رکوردی از مشتری B نمی‌بیند، رابط موبایل read-only ساخته می‌شود. در پایان، APK مشتری با `applicationId` مستقل، signing key مستقل و بدون دسترسی به دادهٔ local-first مالک منتشر خواهد شد.

## موارد ممنوع

قرار دادن کلید سرویس، service-role key یا token دائمی در APK ممنوع است. ارسال فایل JSON کامل کارگاه به اپ مشتری ممنوع است. ساختن لینک مخفی با `partyId` یا token بدون انقضا راهکار امنیتی محسوب نمی‌شود. استفاده از Google Sheet عمومی یا لینک ناشناس برای اطلاعات مالی نیز فقط در محیط آزمایشی قابل قبول است.

## References

[1]: https://capacitorjs.com/docs/android "Capacitor Android Documentation"

[2]: https://capacitorjs.com/docs/config "Capacitor Configuration Documentation"

[3]: https://supabase.com/docs/guides/database/postgres/row-level-security "Supabase Row Level Security Documentation"

[4]: https://developer.android.com/identity/data/autobackup "Android Auto Backup Documentation"

[5]: https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/ "OWASP API1 Broken Object Level Authorization"


## تصمیم اجرایی دربارهٔ زمان انتشار و مخزن‌ها

تا زمانی که نسخهٔ مرورگری و PWA با داده‌های واقعی کارگاه در یک دورهٔ کاری آزمایش نشده و ایرادهای محاسباتی، رابط کاربری و گزارش‌ها اصلاح نشده‌اند، APK release ساخته و منتشر نمی‌شود. پوشهٔ `android` فقط زیرساخت بسته‌بندی است و مانع ادامهٔ توسعهٔ نسخهٔ اصلی نیست.

نسخهٔ اصلی کارگاه و APK مالک کارگاه در همین مخزن `accounting-workshop-pwa` نگهداری می‌شوند. این انتخاب باعث می‌شود موتور حسابداری، تست‌ها، migration، manifest، service worker و پوستهٔ Android از یک منبع نسخه‌گذاری شوند و اختلاف بین نسخهٔ وب و APK ایجاد نشود.

اپ مشتری در آینده باید مخزن جدا داشته باشد. آن برنامه محصولی مستقل با Auth، API، مدل مجوز، applicationId و signing key جداست. جداکردن آن از APK مالک، احتمال افشای bundle و داده‌های local-first کارگاه را کم می‌کند و چرخهٔ انتشار آن را مستقل نگه می‌دارد.

## سیاست به‌روزرسانی APK

برای انتشار رسمی، روش اصلی Google Play یا یک کانال توزیع سازمانی با APK امضاشده خواهد بود. هر نسخه با `versionCode` افزایشی و `versionName` معنادار منتشر می‌شود. به‌روزرسانی عادی باید ابتدا backup قابل بازیابی بگیرد، سپس migration schema را اجرا کند و در پایان projectionهای inventory و cash را بازسازی و کنترل کند.

به‌روزرسانی مستقیم با فایل APK فقط برای نصب آزمایشی یا توزیع کنترل‌شده مناسب است و باید با همان signing key انجام شود. تغییر applicationId یا signing key باعث می‌شود Android آن را برنامهٔ جدید تلقی کند و مسیر به‌روزرسانی عادی از بین برود.

تا پیش از انتخاب کانال رسمی انتشار، از remote code loading یا قراردادن `server.url` در Capacitor استفاده نمی‌شود. برای برنامهٔ حسابداری، تغییرات قابل حسابرسی باید در release امضاشده و همراه با migration و یادداشت تغییرات ارائه شوند. به‌روزرسانی PWA از service worker جداست و جایگزین update APK محسوب نمی‌شود.


## بکاپ خودکار Google Drive در APK

نسخهٔ فعلی PWA فقط یک access token کوتاه‌عمر را در حافظهٔ نشست نگه می‌دارد و برای اتصال اولیه از Google Identity Services استفاده می‌کند. بنابراین بعد از reload، انقضای token یا توقف برنامه، بکاپ خودکار تضمین‌شده نیست و نباید به کاربر وعدهٔ «بدون مجوز مکرر» داده شود. همچنین اجرای JavaScript پس از بسته‌شدن برنامه یا در پس‌زمینهٔ Android از داخل PWA به‌تنهایی قابل اتکا نیست.

برای APK نهایی سه لایه باید جدا طراحی شوند: نخست، بکاپ محلی نسخه‌دار و قابل بازیابی؛ دوم، یک صف pending برای آخرین تغییرات که پس از بازشدن برنامه و برقراری شبکه ارسال شود؛ و سوم، اتصال پایدار Google Drive. اتصال پایدار باید یا با OAuth native و نگهداری refresh token در Android Keystore انجام شود، یا از طریق backend امنی که refresh token را خارج از APK و رمزگذاری‌شده نگه می‌دارد. قرار دادن refresh token یا service account key داخل APK ممنوع است.

سیاست پیشنهادی این است که کاربر فقط یک بار حساب Drive و پوشهٔ مخصوص پروژه را انتخاب و تأیید کند. برنامه سپس بعد از هر تغییر مهم و نیز هنگام بازشدن/اتصال شبکه، آخرین snapshot فشرده و نسخه‌دار را با نام یکتا در همان پوشه ذخیره کند؛ تکرار ارسال با `backupId` یا hash محتوا idempotent باشد. قبل از migration یا به‌روزرسانی APK، یک backup اجباری و قابل تأیید ایجاد شود. این قابلیت پس از دورهٔ استفادهٔ واقعی و پیش از release APK پیاده‌سازی و روی حداقل دو دستگاه واقعی آزموده خواهد شد.

نسخهٔ وب فعلی فقط می‌تواند با نشست معتبر و token زنده به Drive بنویسد. پس از اصلاح فهرست نام‌ها، فایل‌های قدیمی با پیشوند بلند و فایل‌های جدید با پیشوند کوتاه هر دو قابل مشاهده‌اند. منابع فنی این تصمیم در `docs/EXTERNAL-REFERENCES-OAUTH-DRIVE.md` ثبت شده‌اند.
