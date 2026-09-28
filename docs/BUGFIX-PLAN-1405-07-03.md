# برنامهٔ اصلاح باگ‌ها — ۱۴۰۵/۰۷/۰۳

## نقطهٔ بازگشت

پیش از هر تغییر کد، وضعیت سالم مبنا با tag زیر ثبت شد:

```text
checkpoint/pre-bugfix-1405-07-03
commit: 3c6fd00a67574866a4b6b9f5c7e388c5afd838ac
```

بازگشت کامل به وضعیت قبل از اصلاح:

```bash
git reset --hard checkpoint/pre-bugfix-1405-07-03
```

این tag فقط rollback کد و مستندات است. دادهٔ واقعی کاربر وارد آزمون یا commit نمی‌شود.

## وضعیت فعالیت پس‌زمینه

سرویس `job_k10VH4LE` که dev server را اجرا می‌کند در زمان شروع اصلاح فعال و سالم بود. پاسخ محلی و URL عمومی هر دو `200 OK` بودند؛ بنابراین restart انجام نشد و همان محیط برای smoke test حفظ شد. job تکمیلی `job_LdrRpUq8` خاتمه یافته بود و نیاز به راه‌اندازی مجدد نداشت.

## قرارداد عمومی هر مرحله

برای هر باگ این ترتیب اجباری است:

1. ثبت نقطه و خط/تابع معیوب؛
2. بازتولید قبل از اصلاح؛
3. ثبت علت ریشه‌ای؛
4. مقایسهٔ راه‌حل‌های ممکن؛
5. انتخاب راه‌حل با دلیل؛
6. اجرای کوچک و قابل برگشت؛
7. تست regression و سناریوی مرزی؛
8. بررسی اثر state، ردیف‌ها، eventها، projection و backup؛
9. اجرای check/test/build و smoke؛
10. ثبت نتیجه و commit مستقل.

## بسته‌های اصلاحی و انتخاب راه‌حل

### بستهٔ A — parser عدد محلی

**راه‌حل‌ها:**

- اصلاح تک‌تک regexها: سریع، اما شکننده و ناقص؛ رد شد.
- استفاده از `Intl.NumberFormat` برای parse: وابسته به locale و دشوار برای کنترل جداکننده‌ها؛ رد شد.
- تابع مرکزی `parseLocalizedNumber`: تبدیل ارقام فارسی/عربی، جداکنندهٔ اعشار و هزارگان و علامت منفی در یک قرارداد واحد؛ انتخاب شد.

**دلیل انتخاب:** همهٔ فرم‌ها یک رفتار مالی واحد می‌گیرند و regression روی یک تابع مرکزی کافی است.

### بستهٔ B — تقویم Jalali

**راه‌حل‌ها:**

- نگه‌داشتن قاعدهٔ `year % 4 === 3`: نادرست و دارای mismatch اثبات‌شده؛ رد شد.
- کپی‌کردن الگوریتم تبدیل در UI: دو منبع خطا باقی می‌ماند؛ رد شد.
- export کردن تابع معتبر هسته و مصرف همان تابع در DatePicker: یک منبع حقیقت؛ انتخاب شد.

### بستهٔ C — reconciliation و reversal

**راه‌حل‌ها:**

- حذف یا overwrite event قبلی: خلاف append-only؛ رد شد.
- مقایسهٔ طول کل آرایه: علت باگ mixed mutation؛ رد شد.
- شناسایی per-source/per-entity و append کردن reversal برای حذف/ابطال: با حفظ تاریخچه و قابلیت audit؛ انتخاب شد.

### بستهٔ D — تولید

**راه‌حل‌ها:**

- حذف eventهای تولید: تاریخچه از بین می‌رود؛ رد شد.
- محاسبهٔ اختلاف با mutation خام: با append-only سازگار نیست؛ رد شد.
- append کردن reversal event برای همهٔ input/outputهای یک execution و حفظ snapshot/record قابل audit: انتخاب شد.

### بستهٔ E — service worker

**راه‌حل‌ها:**

- fallback همهٔ requestها به HTML: علت خطای MIME؛ رد شد.
- fallback فقط navigation به HTML و برای asset خطای کنترل‌شده؛ انتخاب شد.
- precache دستی فایل‌های hash‌شده: با هر build نیازمند نگهداری دستی؛ فعلاً strategy runtime cache و تست asset انتخاب می‌شود.

### بستهٔ F — localStorage

**راه‌حل‌ها:**

- بازگشت خاموش به seed: دادهٔ خراب را پنهان می‌کند؛ رد شد.
- throw و توقف برنامه: امکان بازیابی را سخت می‌کند؛ رد شد.
- قرنطینهٔ raw payload، ثبت خطا و برگشت به seed فقط به‌عنوان حالت اضطراری قابل اعلام: انتخاب شد.

## ترتیب اجرا

ابتدا بسته‌های A تا C به‌عنوان P0 انجام می‌شوند و پس از هرکدام regression اجرا می‌شود. سپس بسته‌های D، E و F به‌صورت commitهای مستقل انجام می‌شوند. هیچ بسته‌ای بدون گزارش قبل/بعد، تست و وضعیت effectهای داده‌ای بسته تلقی نمی‌شود.


## مرحلهٔ A — اجرای P0 parser، تقویم و reconciliation

### تغییرات اجراشده

- `parseLocalizedNumber` در `client/src/lib/accounting.ts` اضافه شد.
- ارقام فارسی و عربی، `٫`، `٬`، comma، فاصله و علامت منفی در یک مسیر واحد normalize می‌شوند.
- parserهای پراکنده در فرم‌های محصول، فاکتور، پرداخت، عملیات بانکی، چک، حقوق، تولید، موجودی، حساب‌ها و `VendorDirectory` با parser مرکزی جایگزین شدند.
- `JalaliDatePicker` دیگر الگوریتم مستقل کبیسه ندارد و از `jalaliMonthDayBasis` و `jalaliWeekday` هسته استفاده می‌کند.
- `reconcileLedgerEvents` eventهای جدید را به‌صورت per-product و per-account شناسایی می‌کند؛ mutation قدیمی entity دیگر دیگر به‌علت event صریح entity اول حذف نمی‌شود.
- حذف/ابطال تراکنش‌های قدیمی، eventهای نقدی اصل و کارمزد را با `reversalOf` معکوس می‌کند و event قبلی حذف نمی‌شود.
- حذف/ویرایش تولید، برای تمام eventهای input/output اجرای موردنظر reversal موجودی append می‌کند.
- تست‌های regression برای parser، تاریخ، حذف تراکنش، حذف تولید و mixed mutation اضافه شدند.
- probeهای ممیزی از مدل قدیمی به قرارداد اصلاح‌شده منتقل شدند تا پس از اصلاح واقعاً PASS را اندازه‌گیری کنند.

### علت انتخاب و اثر داده‌ای

راه‌حل انتخابی از یک منبع حقیقت برای parser و تقویم استفاده می‌کند و تاریخچهٔ eventها را حذف نمی‌کند. اثر deletion/void اکنون به‌جای overwrite، با event جدید و `reversalOf` ثبت می‌شود. در تولید، stock جاری پس از reversal به مقدار قبل از تولید برمی‌گردد و projection ledger نیز همان مقدار را بازسازی می‌کند.

### نتیجهٔ قبل/بعد

| شاخص | قبل | بعد |
|---|---:|---:|
| mismatch تقویم در ۳۰۱ سال | ۱۱۶ | ۰ |
| parse ورودی `۱۲۳۴۵۶٫۷۸` | ۰ | ۱۲۳۴۵۶٫۷۸ |
| mixed inventory reconciliation | ۰ event برای entity دوم | ۱ event |
| mixed cash reconciliation | ۰ event برای entity دوم | ۱ event |
| حذف تراکنش ۱۰۰۰ | بدون reversal | reversal با مبلغ -۱۰۰۰ |
| حذف بچ تولید | discrepancy موجودی | discrepancy صفر |

### اعتبارسنجی مرحلهٔ A

- `pnpm check`: موفق.
- accounting test: ۵۲ تست موفق.
- `scripts/audit-risk-probes.ts`: موفق؛ mismatch=0، parser درست، mixed inventory/cash هرکدام ۱ event.
- `scripts/audit-jalali-picker.ts`: موفق؛ ۳۰۱ سال و mismatch=0.
- `git diff --check`: موفق.

### وضعیت

کد مرحلهٔ A آمادهٔ commit مستقل است. بسته‌های P1 شامل service worker و localStorage هنوز اجرا نشده‌اند.


## مرحلهٔ B — اجرای P1 سرویس‌ورکر و localStorage

### تغییرات اجراشده

- cache version سرویس‌ورکر از `v3` به `v4` ارتقا یافت تا clients قدیمی پاک‌سازی شوند.
- fallback HTML فقط برای navigation باقی ماند.
- درخواست asset غیر-navigation در صورت نبود cache دیگر HTML دریافت نمی‌کند و `Response.error()` برمی‌گرداند.
- تست PWA تعداد fallbackهای HTML را دقیقاً یک مورد (navigation) کنترل می‌کند و وجود `Response.error()` را الزام می‌کند.
- خرابی JSON حسابداری در `loadState` پیش از برگشت seed در کلید `accounting-workshop-pwa:v1:corrupt-snapshot` قرنطینه می‌شود.
- خرابی دفتر تأمین‌کنندگان نیز در کلید مستقل `vendor-directory:v1:corrupt-snapshot` قرنطینه می‌شود.
- snapshot شامل `capturedAt` و raw payload است؛ credential یا دادهٔ جدیدی به Git اضافه نشده است.
- خطای recovery با `console.error` ثبت می‌شود تا fallback seed بی‌صدا نباشد.
- دو تست regression برای accounting و vendor storage اضافه شد.

### علت انتخاب و اثر داده‌ای

HTML fallback برای navigation رفتار offline را حفظ می‌کند، اما asset خراب را به پاسخ نامرتبط تبدیل نمی‌کند. نسخهٔ cache افزایش یافت تا service worker قبلی با رفتار معیوب باقی نماند. در storage، seed همچنان مانع crash می‌شود، اما raw دادهٔ خراب از بین نمی‌رود و امکان تشخیص و بازیابی دستی وجود دارد.

### اعتبارسنجی مرحلهٔ B

- `pnpm check`: موفق.
- `pwa.test.ts`: ۳ تست موفق.
- `storage-recovery.test.ts`: ۲ تست موفق.
- `git diff --check`: موفق.

### وضعیت

مرحلهٔ B آمادهٔ commit مستقل است. پس از commit، full regression، harness، build، smoke HTTP و بررسی نهایی همهٔ تغییرات اجرا خواهد شد.


## مرحلهٔ B.۱ — تفکیک SSR از خرابی storage

در full regression مشخص شد که نبود `localStorage` در محیط Node/SSR وارد catch عمومی می‌شد و به‌اشتباه با پیام «storage corruption» گزارش می‌گردید. این رفتار مالی را خراب نمی‌کرد، اما تشخیص خرابی واقعی را آلوده می‌کرد و log غیرضروری می‌ساخت.

با guard صریح `typeof localStorage === "undefined"`، محیط SSR مستقیماً seed امن می‌گیرد و فقط خطاهای واقعی خواندن/parse storage قرنطینه و log می‌شوند. پس از این اصلاح، full Vitest بدون stderr اضافی ۸ فایل و ۷۳ تست موفق داشت؛ `pnpm check` و تست‌های PWA/storage نیز موفق ماندند.
