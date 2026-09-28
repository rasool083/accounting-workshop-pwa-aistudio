# ممیزی دوم عمیق پروژه `accounting-workshop-pwa`

**تاریخ:** ۱۴۰۵/۰۷/۰۳ برابر با ۲۰۲۶/۰۹/۲۵  
**Commit بررسی‌شده:** `fcdcdba1eab137d849a1acd88d9fdd8ec89f3d0b`  
**شاخه:** `main`؛ یک commit جلوتر از `origin/main`  
**هدف:** بررسی دوبارهٔ کامل ساختار، مدل داده، مسیرهای mutation، دفترهای رویداد، backup، PWA، تست‌ها و کشف باگ‌های قابل‌تکرار بدون تغییر رفتار محصول.

## دامنه و روش بررسی

ممیزی با بازخوانی مستندات تداوم، auditهای قبلی، roadmap، تاریخچهٔ ۲۵ commit اخیر، manifest و service worker، مدل مرکزی `client/src/lib/accounting.ts`، مسیرهای mutation در `client/src/pages/Home.tsx`، backup/security/vendor modules و تمام تست‌های موجود انجام شد. سپس `pnpm check`، مجموعهٔ Vitest، harness موجود، سناریوی FIFO، build تولیدی، بررسی runtime با curl و دو probe اختصاصی اجرا شد.

## وضعیت اعتبارسنجی

| بررسی | نتیجه |
|---|---|
| `pnpm check` | موفق؛ فقط هشدار تنظیمات قدیمی `pnpm` نمایش داده شد |
| `pnpm exec vitest run --reporter=verbose` | ۷ فایل تست، ۶۶ تست موفق |
| `pnpm exec tsx scripts/audit-harness.ts` | ۶۰۶ حالت موفق |
| `pnpm exec tsx scripts/test-fifo.ts` | موفق؛ تخصیص FIFO تولید شد |
| `pnpm build` | موفق؛ bundle اصلی حدود ۶۸۸KB minified است و هشدار code splitting دارد |
| `prettier --check` | شکست در ۲۴ فایل؛ بدهی قالب‌بندی، نه خطای runtime اثبات‌شده |
| `git diff --check` | موفق |
| HTTP محلی و عمومی sandbox | هر دو `200 OK` |
| probe تقویم | شکست عمدی با mismatch واقعی |
| probe ریسک ledger و اعداد فارسی | شکست عمدی با شواهد قابل‌تکرار |

## یافته‌های قطعی و قابل‌تکرار

### ۱. ناهماهنگی تقویم کبیسه در UI و هسته — شدت زیاد

**محل:** `client/src/pages/Home.tsx:267-274` در `JalaliDatePicker` و `client/src/lib/accounting.ts:1880-1913` در هستهٔ تاریخ.

UI تعداد روز اسفند را با قاعدهٔ سادهٔ زیر تعیین می‌کند:

```ts
view.year % 4 === 3 ? 30 : 29
```

اما هسته از شروع سال Persian در `Intl` و فاصلهٔ واقعی ۳۶۶ روز استفاده می‌کند. اجرای probe روی سال‌های ۱۲۰۰ تا ۱۵۰۰ نشان داد:

- ۳۰۱ سال بررسی شد؛
- ۱۱۶ سال با UI و هسته اختلاف داشتند؛
- در برخی سال‌ها UI روز ۳۰ را نمایش می‌دهد، ولی هسته تاریخ را نامعتبر می‌داند؛
- در برخی سال‌ها هسته روز ۳۰ را معتبر می‌داند، ولی UI آن را پنهان می‌کند.

نمونه‌ها:

```text
سال 1201: هسته کبیسه، UI غیرکبیسه
سال 1203: هسته غیرکبیسه، UI کبیسه
سال 1407: نمونهٔ نزدیک به دورهٔ جاری از نوع نمایش نادرست UI
```

هسته برای `۱۴۰۴/۱۲/۳۰` مقدار نامعتبر می‌دهد که درست است؛ اما UI با رسیدن به سال‌هایی مانند ۱۴۰۷ می‌تواند روز نامعتبر ۳۰ اسفند را به کاربر ارائه کند. این موضوع روی ثبت سند، دیرکرد، sort و گزارش اثر دارد.

**بازتولید:**

```bash
pnpm exec tsx scripts/audit-jalali-picker.ts
```

خروجی: `mismatchCount: 116` و exit code برابر ۱ برای علامت‌گذاری شکست probe.

**راه‌حل پیشنهادی:** منطق UI نباید الگوریتم مستقل داشته باشد. یا `isJalaliLeapYear(view.year)` از هسته export شود و UI همان را مصرف کند، یا تابع واحدی برای `jalaliMonthDayBasis` در تقویم استفاده شود. سپس تست UI برای سال‌های مرزی و سال‌های اختلاف‌دار اضافه شود.

### ۲. ازبین‌رفتن اعداد فارسی در چند فرم — شدت زیاد

بعضی مسیرها، مانند اصلاح موجودی در `Home.tsx:4712-4716`، اعداد فارسی و جداکنندهٔ اعشاری فارسی را تبدیل می‌کنند؛ اما مسیرهای متعدد دیگر فقط کاراکترهای ASCII را نگه می‌دارند. نمونه‌ها:

- محصول: `Home.tsx:4890`, `4918-4919`
- فاکتور/قیمت: `Home.tsx:5585`
- چک: `Home.tsx:6382`, `6397`
- فرم‌های عملیات بانکی و پرداخت
- دفتر تأمین‌کنندگان: `VendorDirectory.tsx:109`

الگوی آسیب‌پذیر:

```ts
Number(value.replace(/[^0-9.-]/g, "")) || 0
```

برای ورودی فارسی زیر:

```text
۱۲۳۴۵۶٫۷۸
```

نتیجهٔ parser فعلی صفر است، چون ارقام فارسی و `٫` پیش از تبدیل حذف می‌شوند. probe اختصاصی این موضوع را تأیید کرد.

**اثر:** کاربر ممکن است مبلغ، قیمت، موجودی، چک یا quotation را وارد کند اما برنامه آن را صفر ببیند یا فرم را بی‌صدا رد کند. این یک خطای localization و بالقوه خطای مالی است.

**بازتولید:**

```bash
pnpm exec tsx scripts/audit-risk-probes.ts
```

خروجی شامل `asciiOnlyParserResult: 0` برای ورودی فارسی است.

**راه‌حل پیشنهادی:** یک تابع مرکزی مانند `parseLocalizedNumber` ایجاد شود که:

1. ارقام فارسی و عربی را به ASCII تبدیل کند؛
2. `٫` و `٬` را مدیریت کند؛
3. علامت منفی را حفظ کند؛
4. اعشار را طبق قرارداد واحد پول کنترل کند؛
5. در همهٔ فرم‌ها جایگزین regexهای پراکنده شود.

### ۳. fallback نادرست service worker برای assetهای غیر HTML — شدت زیاد در PWA/offline

**محل:** `client/public/sw.js:42-53`.

در مسیر requestهای غیر navigation، اگر دریافت JS، CSS، فونت یا asset شکست بخورد، service worker این را برمی‌گرداند:

```js
.catch(() => caches.match(BASE))
```

`BASE` صفحهٔ HTML است. بنابراین ممکن است مرورگر به‌جای asset موردنیاز، HTML دریافت کند و با خطای MIME یا parse مواجه شود. همچنین در `APP_SHELL` فقط صفحهٔ پایه، manifest و آیکون‌ها pre-cache شده‌اند؛ bundleهای JS/CSS در install به‌طور صریح pre-cache نمی‌شوند.

این ریسک در roadmap قبلی نیز صریحاً ثبت شده بود: fallback asset باید به‌جای HTML نامرتبط، fallback کنترل‌شده داشته باشد.

**راه‌حل پیشنهادی:**

- fallback HTML فقط برای navigation بماند؛
- برای asset غیر HTML، در صورت نبود cache، `Response.error()` یا خطای شبکه برگردد؛
- assetهای build‌شده با manifest تولیدی یا strategy مناسب precache شوند؛
- تست PWA بررسی کند که fallback request جاوااسکریپت هرگز `text/html` نیست.

### ۴. از دست رفتن reconciliation در mutation مختلط — شدت زیاد در دورهٔ migration ledger

**محل:** `client/src/lib/accounting.ts:1540-1541`.

تشخیص وجود event صریح در سطح کل state انجام می‌شود:

```ts
const hasExplicitInventoryEvents = inventoryEvents.length > previous.inventoryEvents.length;
const hasExplicitCashEvents = cashEvents.length > previous.cashEvents.length;
```

اگر در یک update، یک عملیات explicit event اضافه کند و هم‌زمان mutation قدیمی دیگری مستقیماً `stock` یا `balance` را تغییر دهد، مسیر legacy bridge برای کل آن دفتر خاموش می‌شود. probe نشان داد:

```text
mixedInventoryDeltaEvents: 0
mixedCashDeltaEvents: 0
```

یعنی delta قدیمی در state باقی می‌ماند، اما event reconciliation متناظر تولید نمی‌شود. نتیجه، discrepancy پنهان بین projection جاری و ledger است.

**راه‌حل پیشنهادی:** تشخیص باید per-source/per-entity باشد، نه فقط مقایسهٔ طول آرایه. هر mutation باید شناسهٔ منبع خود را ثبت کند و برای هر محصول/حساب بررسی شود که آیا event متناظر دارد یا خیر. تا پایان migration نیز `auditDataIntegrity` باید چنین deltaهایی را به‌عنوان خطای صریح نمایش دهد.

## بدهی‌های فنی و ریسک‌های مهم، ولی باگ قطعی اثبات‌نشده

### قالب‌بندی

`prettier --check` در ۲۴ فایل شکست خورد، از جمله `accounting.ts`، `Home.tsx`، تست‌ها، backup و vendor modules. این مورد رفتار مالی را مستقیماً ثابت نمی‌کند، اما review و تشخیص diff را دشوار و احتمال خطای انسانی را بیشتر می‌کند.

### تنظیمات pnpm

pnpm اعلام کرد `patchedDependencies` و `overrides` از محل فعلی `package.json` خوانده نمی‌شوند. نصب فعلی و type-check موفق بودند، اما باید در clone پاک اثبات شود که patch مربوط به wouter و override مربوط به nanoid واقعاً اعمال می‌شوند. تنظیمات بهتر است به محل رسمی جدید pnpm منتقل شوند و CI clean install به‌عنوان تست اجباری ثبت شود.

### پوشش تست

۶۶ تست موفق است، اما چند export مرکزی تست مستقیم ندارند؛ از جمله `saveState`، `importPayload` در accounting payload، `buildCollectionProfitReport`، `calculateMetrics`، `allocateCheckFIFO`، `applyCheckFIFO` و `calculateLateProfit`. بخشی از این رفتارها به‌صورت غیرمستقیم پوشش دارند، اما regression مستقل برای آن‌ها مطلوب است.

### bundle و معماری UI

build موفق است، ولی bundle اصلی حدود ۶۸۸KB minified باقی مانده و `Home.tsx` حدود ده هزار خط دارد. این‌ها باگ فوری نیستند، اما ریسک regression، زمان بارگذاری و دشواری audit را بالا می‌برند.

### امنیت

قفل password/PIN محلی، احراز هویت کاربر یا مجوز سروری نیست. multi-user، tenant isolation و RLS همچنان وجود ندارند. این موضوع در اسناد پروژه درست به‌عنوان محدودیت ثبت شده و نباید با امنیت حسابداری چندکاربره اشتباه گرفته شود.

## چیزهایی که در این ممیزی با موفقیت تأیید شدند

- schema normalization و مهاجرت backupهای قدیمی در تست‌های موجود؛
- unified backup و حذف credentialهای محلی از خروجی؛
- checksum و manifest restore؛
- production، sale settlement و restore در fixture یکپارچه؛
- FIFO سناریوی موجود؛
- bank fee برای انتقال، پرداخت خرید و وصول چک؛
- payroll مستقل و لینک غیرمالی person؛
- checksum و integrity check؛
- build تولیدی و پاسخ HTTP محلی/عمومی sandbox؛
- وجود iconها و قرارداد manifest/service worker پایه.

موفقیت این موارد به معنی بسته‌شدن چهار یافتهٔ قطعی بالا نیست؛ تست‌های فعلی عمدتاً مدل هسته را پوشش می‌دهند و دو مورد تقویم UI و parserهای فرم در پوشش کافی نیستند.

## برنامهٔ اصلاح اولویت‌بندی‌شده

### P0 — پیش از تغییرات مالی بعدی

1. ساخت `parseLocalizedNumber` و جایگزینی همهٔ parserهای پراکنده.
2. یکسان‌سازی date picker با الگوریتم هستهٔ Jalali.
3. اصلاح mixed-event reconciliation و افزودن regression برای eventهای هم‌زمان.

### P1 — پیش از اعلام PWA پایدار یا APK

1. اصلاح fallback service worker.
2. precache یا strategy معتبر برای assetهای build.
3. تست offline در install، reload، update و asset failure.
4. تست clone پاک و بررسی اعمال واقعی pnpm patch/override.

### P2 — پیش از refactor بزرگ

1. اضافه‌کردن تست مستقیم exportهای کم‌پوشش.
2. format baseline و enforce تدریجی Prettier.
3. شکستن `Home.tsx` به page/domain components.
4. code splitting برای reports، production و backup.

## وضعیت و گام بعدی

**وضعیت:** ممیزی دوم انجام شد؛ چهار یافتهٔ قابل‌تکرار ثبت شد؛ اصلاح کد عمداً در این ممیزی انجام نشد تا تصمیم اصلاحی و تست پذیرش هر مورد جداگانه ثبت شود.

**گام بعدی پیشنهادی:** ابتدا اصلاح P0 با یک commit مستقل و ثبت تصمیم در `DECISION-LOG.md`؛ سپس اجرای full regression، build و سناریوهای قبل/بعد. پس از بسته‌شدن P0، اصلاح service worker و تست offline انجام شود.

## Artifacts ممیزی

- `scripts/audit-jalali-picker.ts`: مقایسهٔ ۳۰۱ سال UI و هسته.
- `scripts/audit-risk-probes.ts`: probe اعداد فارسی و mutation مختلط ledger.
- `scripts/audit-harness.ts`: harness موجود با ۶۰۶ حالت موفق.
