# تحقیق و راه آیندهٔ APK، PWA، پشتیبان و اپ مشتری

## وضعیت و نتیجهٔ اجرایی

پروژهٔ فعلی هنوز در مرحلهٔ استفاده و اصلاح نسخهٔ مرورگری است. بنابراین **APK نهایی نباید هنوز منتشر شود**. زیرساخت Capacitor در مخزن اصلی آماده است، اما انتشار واقعی باید پس از یک دورهٔ استفاده با دادهٔ واقعی، تکمیل قرارداد پشتیبان و آزمون restore انجام شود.

تصمیم معماری این است که نسخهٔ کارگاه، چه در مرورگر و چه در APK مالک، **local-first** باقی بماند. منبع حقیقت حسابداری روی دستگاه مالک است. Google Drive فقط محل پشتیبان و بازیابی اختیاری است و نباید به منبع حقیقت، sync چنددستگاهی یا محل اجرای محاسبات حسابداری تبدیل شود.

اپ مشتری در آینده محصولی جداگانه خواهد بود. این اپ نباید به localStorage یا فایل backup مالک متصل شود. فقط یک projection حداقل‌گرا و read-only از اطلاعات مجاز مشتری را از backend احراز هویت‌شده دریافت می‌کند.

## نکتهٔ مهم دربارهٔ مستقل‌بودن پشتیبان تأمین‌کنندگان

مستقل‌کردن Supplier Directory از backup حسابداری تصمیمی عمدی بود، چون این دفتر یک فضای sourcing عملیاتی است و الزاماً نشان‌دهندهٔ خرید یا بدهی ثبت‌شده نیست. این جداسازی از سه خطا جلوگیری می‌کند:

1. بازیابی دفتر تأمین‌کنندگان باعث جایگزینی ناخواستهٔ دفترکل مالی نشود.
2. migration یا تغییر schema حسابداری، دادهٔ quotationها را بدون قرارداد مشخص تغییر ندهد.
3. کاربر بتواند دفتر sourcing را به‌صورت مستقل جابه‌جا یا آرشیو کند.

اما استقلال به معنی حذف آن از حفاظت کلی نیست. **قرارداد نهایی باید «یکپارچه اما مستقل» باشد**: یک backup کلی کارگاه باید شامل دو بخش نام‌دار `accounting` و `vendorDirectory` باشد، درحالی‌که export مستقل Supplier Directory نیز حفظ شود. به این ترتیب، backup یکپارچه برای بازیابی کامل کارگاه وجود دارد و backup مستقل برای استفادهٔ روزمرهٔ sourcing نیز باقی می‌ماند.

در وضعیت فعلی، این هدف هنوز کامل نشده است. `exportPayload(state)` عمدتاً دادهٔ حسابداری را صادر می‌کند و upload فعلی Google Drive نیز همان payload را ارسال می‌کند. Supplier Directory در localStorage و export مستقل خود قرار دارد، اما هنوز به‌صورت خودکار داخل همان فایل Drive قرار نمی‌گیرد. همچنین اتصال فعلی Drive در وب با access token کوتاه‌عمر و scope فعلی `drive.file` کار می‌کند و به معنی backup خودکار پس از بسته‌شدن برنامه نیست.

بنابراین **گام پیش‌نیاز بعدی پیش از APK** باید تکمیل قرارداد unified backup باشد:

- envelope نسخه‌دار با format مستقل؛
- بخش `accounting`؛
- بخش `vendorDirectory`؛
- manifest شامل schema version، app version، زمان، installation id، تعداد رکوردها و checksum؛
- نگهداری export مستقل Supplier Directory؛
- upload هر دو شکل به Google Drive؛
- restore مرحله‌ای با اعتبارسنجی قبل از جایگزینی؛
- ایجاد snapshot محلی پیش از restore.

## معماری پیشنهادی backup

هر snapshot باید read-only و immutable باشد. نام فایل و metadata باید یکتا و قابل مرتب‌سازی باشد، اما تشخیص backup نباید فقط به نام فایل وابسته بماند. فرمت پیشنهادی چنین است:

```json
{
  "format": "accounting-workshop-unified-backup-v1",
  "backupId": "...",
  "createdAt": "...",
  "schemaVersion": 5,
  "applicationVersion": "...",
  "installationId": "...",
  "sections": {
    "accounting": { "format": "accounting-workshop-backup", "data": {} },
    "vendorDirectory": { "format": "vendor-directory-backup-v1", "data": {} }
  },
  "counts": {},
  "checksums": {}
}
```

در نسخهٔ اول، Drive باید برای backup یک‌طرفه استفاده شود. merge خودکار دو دستگاه یا حل تعارض بین دو دفترکل تا زمانی که مدل نسخه‌گذاری و آزمون حسابداری مستقل طراحی نشده، مجاز نیست.

برای حفاظت بیشتر، payload پیش از upload باید در دستگاه رمزنگاری و checksumدار شود. `appDataFolder` با کمترین scope مناسب است، ولی مخفی‌بودن آن به‌تنهایی رمزنگاری end-to-end نیست. در APK کلید کوچک و refresh token باید در Android Keystore نگهداری شود. در PWA نباید refresh token یا کلید بازیابی در localStorage، sessionStorage یا bundle ذخیره شود؛ export رمزنگاری‌شدهٔ دستی باید همیشه جایگزین داشته باشد.

Restore نباید مستقیماً روی DB زنده اجرا شود. برنامه باید فایل را دانلود کند، format و checksum را بررسی کند، بخش‌ها را در فضای موقت parse کند، migration را انجام دهد، کنترل‌های حسابداری را اجرا کند، از وضعیت فعلی snapshot بسازد و سپس با تأیید صریح کاربر swap اتمیک انجام دهد.

## مقایسهٔ روش‌های توزیع و update

| روش | کاربرد | مزیت | محدودیت و تصمیم |
|---|---|---|---|
| PWA با service worker | نسخهٔ مرورگری و نصب روی home screen | انتشار سریع و بدون نصب APK | جایگزین update native نیست؛ update باید prompt و کنترل‌شده باشد |
| APK امضاشده | QA، نصب مستقیم و MDM | مناسب تست دستگاه واقعی و توزیع محدود | باید با همان signing key به‌روزرسانی شود؛ کانال توزیع باید قابل اعتماد باشد |
| AAB در Google Play | انتشار رسمی Android | Play App Signing، rollout مرحله‌ای و update استاندارد | نیازمند آماده‌سازی حساب توسعه‌دهنده، کلید و سیاست انتشار |
| In-app update نوع Flexible | update عادی نسخهٔ Play | دانلود در پس‌زمینه و کمترین اختلال | فقط برای native releaseهای Play؛ migration همچنان باید کنترل شود |
| In-app update نوع Immediate | آسیب‌پذیری یا خرابی بحرانی | جلوگیری از ادامهٔ کار با نسخهٔ خطرناک | برای update عادی حسابداری مناسب نیست |
| OTA برای JS/CSS/HTML | hotfix وبِ سازگار با native shell | سرعت بالا | ریسک policy، supply chain و ناسازگاری؛ در v1 غیرفعال می‌ماند |

برای این پروژه، کانال اصلی آینده **AAB امضاشده با Play App Signing و انتشار مرحله‌ای** است. APK هم‌امضا برای QA و توزیع کنترل‌شده باقی می‌ماند. تغییر plugin، permission، SDK، bridge، security configuration یا migration ناسازگار باید native release باشد. OTA در نسخهٔ اول راهبرد اصلی نیست.

## چرخهٔ release پیشنهادی

۱. نسخهٔ release candidate با `pnpm install --frozen-lockfile` ساخته می‌شود.

۲. تست کامل، type-check، build، `git diff --check` و آزمون backup/restore اجرا می‌شود.

۳. build وب با `pnpm build` تولید می‌شود و سپس `pnpm android:sync` اجرا می‌شود. از اجرای دوبارهٔ `android:init` برای scaffold موجود خودداری می‌شود.

۴. روی دستگاه واقعی Android، cold start، RTL، اعداد فارسی، چرخش صفحه، دکمهٔ back، قطع اینترنت، migration، restore و upgrade از نسخهٔ قبلی آزمایش می‌شود.

۵. `versionCode` افزایش می‌یابد و AAB با Play App Signing ساخته می‌شود. rollout ابتدا محدود و مرحله‌ای است.

۶. گزارش خطا، شکست migration، شکست backup و نتیجهٔ restore ثبت می‌شود. در صورت مشکل، rollout متوقف و runbook rollback اجرا می‌شود.

## PWA و service worker

برای PWA، `vite-plugin-pwa` با حالت prompt مناسب‌تر از auto-update است. shell، JavaScript، CSS، font و iconهای versioned می‌توانند precache شوند، اما ledger، سند مالی، توکن، اطلاعات شخصی و responseهای حساس API نباید در Cache Storage عمومی ذخیره شوند.

به‌روزرسانی باید پس از پایدارشدن draft، صف عملیات و فرم‌های باز به کاربر پیشنهاد شود. migration cache و migration داده دو موضوع جدا هستند. migration داده باید افزایشی، idempotent، تراکنشی و از چند نسخهٔ قبلی قابل اجرا باشد. پیش از تغییر مخرب، backup محلی ساخته می‌شود.

## اپلیکیشن مشتری

اپ مشتری باید در مخزن جدا، با `applicationId` و signing key جدا ساخته شود. این جداسازی، سطح حمله و چرخهٔ انتشار را از APK مالک جدا می‌کند.

مالک با اقدام صریح «انتشار برای مشتری» یک projection حداقل‌گرا منتشر می‌کند. مشتری فقط اطلاعات مربوط به خودش را می‌بیند، مانند فاکتور فروش، پرداخت‌ها، مانده، چک‌های خودش و صورت‌حساب مجاز. اطلاعات تأمین‌کنندگان، خرید، موجودی، قیمت خرید، فرمول تولید، بهای تمام‌شده، حساب‌های بانکی و backup کامل هرگز نباید به client مشتری ارسال شود.

مرز واقعی امنیت باید در backend و database باشد، نه در React. مدل پیشنهادی شامل `organizations`، `tenant_members` و ارتباط مشتری با `party_id` است. همهٔ جدول‌ها، viewها، RPCها، فایل‌ها و exportها باید با `tenant_id` و عضویت زندهٔ کاربر محافظت شوند. برای نقش مشتری فقط SELECT لازم مجاز است و هیچ write policy ایجاد نمی‌شود.

در نسخهٔ اول، اتصال مستقیم به API دارای RLS می‌تواند مسیر کم‌هزینه‌تری باشد. برای export، گزارش‌های مرکب و عملیات حساس، BFF جداگانه با نقش database غیرمالک و بدون `BYPASSRLS` امن‌تر است. `service_role` و کلیدهای ممتاز هرگز داخل APK یا bundle قرار نمی‌گیرند.

## OAuth و Google Drive

در APK، OAuth باید با Authorization Code + PKCE در مرورگر سیستم انجام شود. client secret نباید در APK یا Vite قرار گیرد. access token کوتاه‌عمر و حافظه‌ای است و refresh token فقط در Keystore نگهداری می‌شود. برای callback، App/Universal Link مبتنی بر HTTPS ترجیح دارد.

در PWA فعلی، access token در حافظهٔ نشست نگهداری می‌شود. بنابراین پس از reload یا انقضای token، backup خودکار تضمین‌شده نیست. برای backup خودکار بدون مجوزهای مکرر در APK، باید OAuth native و secure storage یا backend امن اضافه شود. این قابلیت نباید با قرار دادن refresh token در localStorage شبیه‌سازی شود.

## فازهای اجرایی آینده

### فاز صفر — تکمیل قرارداد backup

Unified backup را پیاده‌سازی کنید و بخش حسابداری و Supplier Directory را در یک envelope versioned قرار دهید. export مستقل Supplier Directory حفظ شود. upload و list و restore هر دو نوع را پشتیبانی کنند. تست باید شامل فایل قدیمی، فایل کوتاه‌شده، فایل یکپارچه، فایل مستقل، checksum غلط، schema قدیمی و restore لغوشده باشد.

### فاز یک — سخت‌سازی local-first

schema version، migrationهای قابل تکرار، draft checkpoint، snapshot پیش از migration، کنترل تعادل ledger، export رمزنگاری‌شده و restore اتمیک را تکمیل کنید. این فاز قبل از هر APK release الزامی است.

### فاز دو — PWA مقاوم

service worker را با prompt update، cache نام‌دار، cleanup محدود و مسیر امن migration تثبیت کنید. قطع اینترنت و حذف storage مرورگر باید با پیام روشن و مسیر بازیابی آزموده شود.

### فاز سه — APK مالک

Capacitor native storage، secure storage، OAuth PKCE، backup queue، retry و upload پس از بازشدن برنامه یا برقراری شبکه را اضافه کنید. ابتدا APK debug و internal test ساخته می‌شود و هنوز انتشار عمومی انجام نمی‌شود.

### فاز چهار — انتشار رسمی

AAB، Play App Signing، rollout مرحله‌ای، Flexible update، crash monitoring و runbook rollback تکمیل می‌شوند. APK مستقیم فقط برای QA/MDM باقی می‌ماند.

### فاز پنج — اپ مشتری

backend، احراز هویت، projection، tenant membership، RLS، آزمون منفی دسترسی و سپس رابط موبایل read-only ساخته می‌شود. اپ مشتری در repository و چرخهٔ release مستقل قرار می‌گیرد.

### فاز شش — بررسی OTA و hardening

OTA فقط در صورت نیاز واقعی، پس از بررسی سیاست Google Play، امضای bundle، compatibility range، rollback و kill switch بررسی می‌شود. در غیر این صورت خاموش باقی می‌ماند.

## مراجع

[1]: https://capacitorjs.com/docs/android "Capacitor Android Documentation"
[2]: https://capacitorjs.com/docs/cli/commands/build "Capacitor CLI Build Documentation"
[3]: https://developer.android.com/studio/publish/app-signing "Android App Signing"
[4]: https://developer.android.com/guide/playcore/in-app-updates "Android In-app Updates"
[5]: https://developer.android.com/guide/app-bundle "Android App Bundles"
[6]: https://developer.android.com/privacy-and-security/risks/dynamic-code-loading "Android Dynamic Code Loading Risks"
[7]: https://support.google.com/googleplay/android-developer/answer/9888379?hl=en "Google Play Device and Network Abuse Policy"
[8]: https://vite-pwa-org.netlify.app/guide/prompt-for-update "Vite PWA Prompt for Update"
[9]: https://developer.chrome.com/docs/workbox/service-worker-lifecycle "Workbox Service Worker Lifecycle"
[10]: https://capacitorjs.com/docs/web/progressive-web-apps "Capacitor Progressive Web Apps"
[11]: https://developers.google.com/identity/protocols/oauth2/native-app "Google OAuth Native Apps"
[12]: https://www.rfc-editor.org/rfc/rfc8252.html "RFC 8252 OAuth 2.0 for Native Apps"
[13]: https://developers.google.com/workspace/drive/api/guides/appdata "Google Drive appDataFolder"
[14]: https://developers.google.com/workspace/drive/api/guides/manage-downloads "Google Drive Manage Downloads"
[15]: https://capacitorjs.com/docs/guides/storage "Capacitor Storage Documentation"
[16]: https://www.postgresql.org/docs/current/ddl-rowsecurity.html "PostgreSQL Row Security Policies"
[17]: https://supabase.com/docs/guides/database/postgres/row-level-security "Supabase Row Level Security"
[18]: https://supabase.com/docs/guides/api/custom-claims-and-role-based-access-control-rbac "Supabase Custom Claims and RBAC"
[19]: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html "OWASP Session Management Cheat Sheet"
[20]: https://mas.owasp.org/MASVS/controls/MASVS-STORAGE-1/ "OWASP MASVS Storage"
[21]: https://aws.amazon.com/blogs/database/multi-tenant-data-isolation-with-postgresql-row-level-security/ "AWS Multi-tenant Isolation with PostgreSQL RLS"

> این سند بر اساس وضعیت واقعی مخزن و تحقیق منابع رسمی تنظیم شده است. هیچ بخش آن به معنی آماده‌بودن APK release یا فعال‌بودن backup خودکار پس از بسته‌شدن برنامه نیست.

**نویسنده:** Manus AI
**تاریخ:** ۱۴۰۵/۰۷/۰۱
