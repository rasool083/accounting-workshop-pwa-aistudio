# ممیزی دوم عمیق پروژه `accounting-workshop-pwa`

**تاریخ ممیزی:** ۱۴۰۵/۰۷/۰۳

**commit مبنای بررسی:** `fcdcdba1eab137d849a1acd88d9fdd8ec89f3d0b`

**هدف:** بازبینی دوبارهٔ ساختار، مدل داده، ledger، backup، فرمول‌ها، صفحات و مسیرهای mutation برای کشف باگ‌های احتمالی، خطاهای داده‌ای، ریسک‌های انتشار و نقاط کم‌پوشش تست.

## ۱. دامنهٔ بررسی

در این ممیزی ساختار `client/src`, `server`, `shared`, `scripts`, `docs` و workflow انتشار بررسی شد. هستهٔ `client/src/lib/accounting.ts` از نظر schema، normalize/migration، تولید، موجودی، نقدینگی، reconciliation، فاکتور، FIFO، سود دیرکرد، حقوق، کارمزد و backup خوانده شد. `Home.tsx` برای مسیرهای قابل دسترس کاربر، حذف و ویرایش تراکنش، تولید و بازیابی بررسی شد. فایل‌های `backup.ts`, `security.ts`, `sw.js`, `manifest.webmanifest` و workflow GitHub Pages نیز بررسی شدند.

## ۲. نتیجهٔ آزمون‌های اجراشده

| آزمون | نتیجه |
|---|---|
| `pnpm check` | موفق؛ بدون خطای TypeScript |
| `pnpm exec vitest run --reporter=verbose` | ۷ فایل تست، ۶۶ تست موفق |
| `pnpm exec tsx scripts/audit-harness.ts` | ۶۰۶ حالت موفق |
| `scripts/test-fifo.ts` | موفق؛ سه تخصیص FIFO تولید شد |
| تست‌های متمرکز accounting/backup/security | ۳ فایل، ۵۶ تست موفق |
| `pnpm build` | موفق؛ bundle JavaScript حدود ۶۸۸KB minified |
| `pnpm install --frozen-lockfile --ignore-scripts` | موفق؛ lockfile معتبر است |
| `git diff --check` | موفق |
| Prettier check | ناموفق؛ ۲۴ فایل از نظر قالب‌بندی اختلاف دارند |

هشدار ثابت pnpm نیز باقی است: تنظیمات `pnpm.patchedDependencies` و `pnpm.overrides` داخل فیلد `pnpm` در `package.json` توسط pnpm 10 نادیده گرفته می‌شوند، هرچند lockfile فعلی نصب را تکمیل می‌کند.

## ۳. باگ‌های تأییدشده

### ۳.۱. ابطال یا حذف تراکنش، event نقدی قبلی را معکوس نمی‌کند — شدت بالا

**مسیر:** `client/src/lib/accounting.ts:1537-1619`، مسیر حذف عملیات در `client/src/pages/Home.tsx` و تابع `reconcileLedgerEvents`.

**بازپخش:** یک تراکنش دریافت `t1` با مبلغ ۱۰۰۰ و event نقدی `transaction/t1` ساخته شد. سپس تراکنش یک‌بار با وضعیت `باطل` و یک‌بار با حذف کامل به `reconcileLedgerEvents` داده شد.

**نتیجهٔ واقعی:** در هر دو حالت event دریافت ۱۰۰۰ باقی ماند و هیچ event با نوع `reversal` ساخته نشد؛ ماندهٔ حساب نیز ۱۰۰۰ باقی ماند.

**علت ریشه‌ای:** `newTransactions` فقط تراکنش‌هایی را انتخاب می‌کند که `item.status !== "باطل"` باشد. بنابراین تغییر به `باطل` اصلاً وارد مسیر reversal نمی‌شود. حذف کامل نیز تراکنش را در `next.transactions` باقی نمی‌گذارد و تابع فقط از روی تراکنش‌های جدید/تغییرکرده عمل می‌کند. در نتیجه event قبلی بدون reversal باقی می‌ماند.

**اثر:** ledger نقدی با عملیات واقعی اختلاف پیدا می‌کند و ماندهٔ حساب پس از حذف یا ابطال نادرست می‌ماند. این خلاف قرارداد append-only و اصل اصلاح با reversal است.

**راه‌حل پیشنهادی:** برای هر `before` که در `next` حذف شده یا به `باطل` تغییر کرده، source eventهای معتبر قبلی پیدا و برای هرکدام reversal ثبت شود؛ سپس فقط عملیات غیرابطال جدید append شود. این اصلاح باید برای اصل تراکنش، کارمزد و انتقال دوطرفه تست شود.

**وضعیت:** باگ تأییدشده؛ هنوز اصلاح کد نشده است.

### ۳.۲. حذف یا ویرایش بچ تولید، eventهای موجودی را حذف یا معکوس نمی‌کند — شدت بالا

**مسیر:** `client/src/lib/accounting.ts:766-805` و `client/src/pages/Home.tsx:9029-9035`.

**بازپخش:** یک فرمول تولید با یک ماده و یک محصول اجرا شد. پس از تولید، eventهای `production_output` و `production_input` ایجاد شدند. سپس `removeProductionRun` اجرا شد.

**قبل از حذف:** محصول ۱، ماده ۹، eventهای تولید خروجی `+1` و مصرف ماده `-1`.

**بعد از حذف:** محصول ۰، ماده ۱۰، اما همان eventهای تولید همچنان باقی ماندند.

**نتیجهٔ ممیزی ledger:**

- محصول: recorded = 0، projected = 1، اختلاف = -1
- ماده: recorded = 10، projected = 9، اختلاف = +1

**علت ریشه‌ای:** `reverseProductionRun` فقط `products` را تغییر می‌دهد و `removeProductionRun` فقط `productionRecords` را حذف می‌کند. هیچ reversal event یا حذف منطقی eventهای تولید اضافه نمی‌شود.

**اثر:** صفحهٔ ممیزی مغایرت، اختلاف موجودی نشان می‌دهد و بازسازی projection وضعیت قبل از حذف را برمی‌گرداند. این با رفتار مورد انتظار «حذف و اصلاح موجودی» ناسازگار است.

**راه‌حل پیشنهادی:** حذف تولید باید append-only باشد: برای تمام eventهای تولید با `sourceId`های بچ، eventهای معکوس با `reversalOf` ساخته شود و record یا باطل شود، نه اینکه فقط از آرایه حذف شود. اگر سیاست محصول حذف فیزیکی record را حفظ می‌کند، حداقل eventهای reversal باید باقی بمانند و تست بازسازی باید برابر ماندهٔ پس از حذف شود.

**وضعیت:** باگ تأییدشده و مستقیماً از UI قابل دسترسی؛ هنوز اصلاح کد نشده است.

## ۴. ایرادها و ریسک‌های مهم احتمالی

### ۴.۱. fallback سرویس‌ورکر برای asset نامرتبط — شدت متوسط تا بالا

در `client/public/sw.js:42-54`، اگر دریافت هر asset غیر-navigation شکست بخورد، `caches.match(BASE)` برگردانده می‌شود. `BASE` سند HTML است، نه JavaScript، CSS یا تصویر.

**اثر احتمالی:** در حالت offline یا cache ناقص، درخواست chunk یا CSS می‌تواند به‌جای پاسخ مناسب HTML دریافت کند و با خطای MIME یا صفحهٔ سفید شکست بخورد. این مورد در roadmap نیز به‌عنوان کار باز ثبت شده است.

**راه‌حل:** برای assetهای غیر-navigation در صورت نبود cache، پاسخ مناسب خطا یا `Response.error()` برگردد؛ فقط navigation باید fallback به HTML داشته باشد. همچنین app shell باید assetهای اصلی build را precache یا با استراتژی مشخص cache کند.

### ۴.۲. بازگشت خاموش به seed state هنگام خرابی localStorage — شدت بالا از نظر بازیابی

در `loadState` اگر parse یا خواندن localStorage هر خطایی بدهد، بدون نگهداری نسخهٔ خراب، `seedState` برگردانده می‌شود.

**اثر احتمالی:** خرابی JSON، quota، یا خطای transient می‌تواند از نگاه کاربر مانند خالی‌شدن کامل اطلاعات ظاهر شود. backup مستقل وجود دارد، اما مسیر خودکار حفظ raw payload خراب یا اعلان روشن به کاربر وجود ندارد.

**راه‌حل:** raw مقدار خراب در کلید قرنطینه ذخیره شود، خطای قابل مشاهده نمایش داده شود و برنامه قبل از استفاده از seed امکان export/restore را ارائه کند. این مورد باید با localStorage خراب تست شود.

### ۴.۳. پرچم global برای eventهای صریح، تغییرات هم‌زمان را پنهان می‌کند — شدت متوسط

در `reconcileLedgerEvents`، مقدار `hasExplicitCashEvents` و `hasExplicitInventoryEvents` فقط بر اساس افزایش کلی طول آرایه تعیین می‌شود. اگر یک mutation در همان transition event صریح برای یک حساب اضافه کند ولی حساب دیگری با مسیر قدیمی مستقیم تغییر کند، مسیر fallback برای همه خاموش می‌شود و تغییر حساب دوم ممکن است ثبت نشود.

**راه‌حل:** تشخیص باید per-source/per-entity باشد، نه global؛ یا همهٔ mutationها در هر transaction به eventهای صریح منتقل شوند.

### ۴.۴. حذف فیزیکی تولید برخلاف اصل تاریخی audit است — شدت متوسط

حتی پس از افزودن reversal، حذف فیزیکی `productionRecords` تاریخچهٔ قابل مشاهدهٔ بچ را کاهش می‌دهد. قراردادهای پروژه برای اسناد قطعی عموماً ابطال و reversal را بر حذف فیزیکی ترجیح می‌دهند.

**راه‌حل:** افزودن وضعیت `باطل` یا رکورد void/reversal و نگهداری snapshot و eventهای اصلی.

## ۵. کمبودهای تستی

توابع exported زیر یا تست مستقیم کمی دارند یا در suite فعلی تست مستقیمی برایشان پیدا نشدند:

- `reverseProductionRun`
- `createEmptyState`
- `importPayload`
- `appendInventoryEvent`
- `appendCashEvent`
- `todayJalali`
- `buildCollectionProfitReport`
- `allocateCheckFIFO`
- `applyCheckFIFO`
- `purchaseSupplierBalance`
- `calculateLateProfit`
- `calculateMetrics`

وجود نداشتن تست مستقیم الزاماً به‌معنای باگ نیست، اما دو باگ تأییدشدهٔ این ممیزی دقیقاً در مسیرهایی رخ دادند که قرارداد تست regression مستقل نداشتند: حذف تراکنش و حذف تولید.

## ۶. وضعیت کیفی و انتشار

- TypeScript، تست‌ها و build موفق‌اند.
- bundle اصلی حدود ۶۸۸KB است و هشدار code splitting دارد.
- ۲۴ فایل با Prettier هماهنگ نیستند؛ این مانع build نیست اما baseline کیفیت را ضعیف می‌کند.
- تنظیمات قدیمی pnpm در `package.json` هشدار تولید می‌کنند و باید به محل پشتیبانی‌شده منتقل شوند.
- شاخهٔ local یک commit از `origin/main` جلوتر است؛ انتشار عمومی آخرین HEAD هنوز باید جداگانه تأیید شود.

## ۷. اولویت اصلاح پیشنهادی

### اولویت ۱ — پیش از ادامهٔ قابلیت مالی جدید

1. اصلاح reversal حذف/ابطال تراکنش و کارمزد.
2. اصلاح reversal حذف/ویرایش تولید و همسان‌سازی projection.
3. افزودن regression test برای هر دو بازتولید.
4. اجرای دوبارهٔ audit harness و integrity audit.

### اولویت ۲ — پیش از اتکا به offline/APK

1. اصلاح fallback سرویس‌ورکر برای assetها.
2. precache یا cache strategy برای assetهای build.
3. قرنطینه و هشدار برای localStorage خراب.
4. تست install، update، offline و asset failure.

### اولویت ۳ — تثبیت مهندسی

1. اصلاح تنظیمات pnpm.
2. تعریف script رسمی test و coverage.
3. کاهش هشدار Prettier یا ثبت baseline تدریجی.
4. افزودن تست مستقیم برای APIهای فاقد پوشش.
5. code splitting برای `Home.tsx` و صفحات گزارش، تولید و backup.

## ۸. جمع‌بندی آمادگی

معماری، جریان داده، قرارداد backup، ledger نقدی و موجودی، فرمول‌های واحد و FIFO، مسیرهای حقوق، چک، تولید، کارمزد، restore و انتشار دوباره بررسی شدند. وضعیت پروژه از نظر تست و build سالم است، اما دو باگ مالی تأییدشده باید قبل از توسعهٔ قابلیت‌های جدید اصلاح شوند. بنابراین آمادگی برای ادامهٔ توسعه وجود دارد، با این شرط که کار بعدی از اصلاح reversal تراکنش و تولید آغاز شود و این گزارش و regressionهای آن مبنای کار قرار گیرند.
