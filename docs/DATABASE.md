# ساختار مدل داده و دیتابیس محلی (Database & Data Models)

## ۱. پایگاه داده و وضعیت ذخیره‌سازی محلی (Persistence Engine)

برنامه به صورت کاملاً محلی (Local-First) داده‌ها را در فضای ذخیره‌سازی شیءگرای مرورگر (`localStorage`) نگهداری می‌کند. داده‌ها در قالب ساختارهای نوع‌دار و نسخه‌گذاری‌شدهٔ JSON ذخیره و بازیابی می‌شوند.

نسخهٔ جاری اسکیمای حسابداری: **`CURRENT_SCHEMA_VERSION = 5`**  
نسخهٔ پشتیبان واحد: **`BACKUP_FORMAT_VERSION = 5`** / **`UNIFIED_BACKUP_FORMAT = "accounting-workshop-unified-backup-v1"`**

---

## ۲. مدل‌های اصلی موجودیت‌ها (Core Entities)

### ۲.۱. تنظیمات و پروفایل کارگاه (`AppState.settings`)
```typescript
{
  businessName: string;
  currency: string;             // "تومان"
  currencyCode?: "IRT" | "IRR"; // پیش‌فرض: "IRT"
  dayBasis: number | "شمسی";    // معمولاً ۳۶۰ یا ۳۶۵
  units: string[];              // واحدهای تعریف‌شده
  bankFeeRules?: BankFeeRule[]; // تعرفه‌های خودکار کارمزد
  security?: {                  // فقط در localStorage محلی نگهداری می‌شود
    password?: { salt: string; hash: string; iterations: number };
    pin?: { salt: string; hash: string; iterations: number };
  };
}
```

### ۲.۲. اشخاص و طرف‌حساب‌ها (`Person`)
- `id`: شناسهٔ یکتا (UUID)
- `code`: کد تفصیلی شخص
- `name`: نام و نام خانوادگی / نام شرکت
- `type`: نقش اصلی پیش‌فرض (`"مشتری" | "تأمین‌کننده" | "شریک" | "کارگر" | "کارمند" | "سایر"`)
- `roles`: آرایه‌ای از تمام نقش‌های فعال هم‌زمان شخص
- `defaultPaymentRuleId`: شناسهٔ شرط پرداخت پیش‌فرض مشتری
- `phone`: شماره تماس
- `balance`: ماندهٔ محاسباتی (طلب/بدهی)

### ۲.۳. کالاها و انبارداری (`Product`, `Warehouse`)
- **کالا (`Product`):**
  - `id`: شناسه یکتا
  - `code`: کد کالا
  - `name`: عنوان کالا / ماده اولیه
  - `unit`: واحد اصلی (واحد اول یا پایه)
  - `unit2`: واحد فرعی اختیاری (مثلاً کارتن، پالت، بسته)
  - `conversionRate`: ضریب تبدیل (تعداد واحد اصلی در یک واحد فرعی؛ مثلاً ۳۶)
  - `warehouseId`: انبار پیش‌فرض نگهداری
  - `stock`: موجودی فیزیکی جاری (Projection بازسازی‌پذیر از دفتر رویداد)
  - `minStock`: حداقل نقطهٔ سفارش
  - `price`: قیمت فروش پایه به ازای هر واحد اصلی
  - `category`: `"مواد اولیه" | "محصول تولیدی" | "بسته تولید"`
- **انبار (`Warehouse`):**
  - `id`, `name`, `note`

### ۲.۴. فاکتورهای فروش و خرید (`Invoice`, `InvoiceItem`)
- **فاکتور (`Invoice`):**
  - `id`: شناسه یکتا
  - `number`: شماره فاکتور (یکتا در فاکتورهای فعال)
  - `type`: `"فروش" | "خرید"`
  - `date`: تاریخ شمسی فاکتور (`YYYY/MM/DD`)
  - `partyId`: شناسهٔ مشتری یا تأمین‌کننده
  - `paymentRuleId`: شناسه شرط پرداخت انتخاب‌شده
  - `items`: ردیف‌های اقلام فاکتور
  - `allocations`: تخصیص‌های چک‌های مشتری به این فاکتور (در فاکتور فروش)
  - `discountAmount`: مبلغ تخفیف کل
  - `amount`: مبلغ خالص نهایی فاکتور (پس از کسر تخفیف)
  - `paidAmount`: مبلغ تسویه‌شده از طریق چک یا پرداخت
  - `status`: `"باز" | "تسویه جزئی" | "تسویه شده" | "باطل"`
  - `note`: توضیحات فاکتور
- **ردیف قلم فاکتور (`InvoiceItem`):**
  - `id`, `productId` (اختیاری؛ برای خدمات یا بدهی‌های بدون کالا خالی می‌ماند)
  - `description`: شرح قلم
  - `quantity`: مقدار واردشده به واحد انتخابی
  - `unit`: واحد انتخاب‌شده در فرم (اصلی یا فرعی)
  - `unitPrice`: قیمت هر واحد پایه در لحظهٔ صدور
  - `total`: مبلغ کل ردیف
  - `quantityBase`: مقدار تبدیل‌شده به واحد پایه (`quantity * conversionRate`)
  - `conversionRate`: ضریب تبدیل ثبت‌شده در لحظهٔ فاکتور
  - `baseUnit`: واحد پایهٔ کالا
  - `priceBasis`: `"baseUnit"` (تأییدیهٔ اینکه قیمت بر مبنای واحد پایه است)
  - `unitCostAtSale`: بهای تمام‌شدهٔ هر واحد پایه در زمان ثبت فاکتور (برای محاسبهٔ سود ظاهری)

### ۲.۵. چک‌های دریافتی و تخصیص‌ها (`Check`, `CheckAllocation`)
- **چک (`Check`):**
  - `id`, `number`, `partyId`: مشخصات و طرف حساب چک
  - `dueDate`: تاریخ سررسید چک
  - `receivedDate`: تاریخ تحویل‌گرفتن چک
  - `collectedDate`: تاریخ واقعی وصول در بانک (کلید محاسبهٔ سود مؤثر و دیرکرد واقعی)
  - `amount`: مبلغ اسمی چک
  - `feeAmount`: کارمزد وصول
  - `status`: `"نزد ما" | "وصول شده" | "تودیع شده" | "برگشتی" | "عودت داده شده" | "جایگزین شده" | "باطل" | "خرج شده"`
  - `bank`: نام بانک صادرکننده
  - `bankAccountId`: شناسه حساب بانکی مقصد وصول
  - `replacementOf`, `replacementIds`: پیوندهای چک اصلی و چک‌های جایگزین
  - `spentForPaymentId`, `spentToPartyId`: مشخصات خرج‌شدن چک برای تأمین‌کننده
- **تخصیص چک (`CheckAllocation`):**
  - `checkId`: چک مرتبط
  - `amount`: مبلغ کل تخصیص (شامل اصل و دیرکرد)
  - `principalAmount`: مبلغ اصل بدهی فاکتور که توسط این تخصیص پوشش داده شده است
  - `profit`: مبلغ دیرکرد تخصیص‌یافته
  - `days`: تعداد روز مشمول محاسبه (از سررسید تا وصول)
  - `allocatedAt`: تاریخ تخصیص

### ۲.۶. عملیات خرید و پرداخت به تأمین‌کنندگان (`PurchasePayment`, `PurchasePayableAllocation`)
- **پرداخت خرید (`PurchasePayment`):**
  - `id`, `supplierId`, `amount`, `date`
  - `feeAmount`: کارمزد پرداخت بانکی
  - `method`: `"نقدی" | "چک مشتری" | "چک شریک" | "حساب داخلی"`
  - `accountId`, `customerCheckId`, `issuedCheckId`, `note`
- **تخصیص پرداخت خرید (`PurchasePayableAllocation`):**
  - `paymentId`, `invoiceId`, `amount`, `allocatedAt` (تخصیص FIFO پرداختی‌ها به فاکتورهای باز تأمین‌کننده)

### ۲.۷. چک‌های صادرشده و تعهدات شرکا (`IssuedCheck`, `PartnerObligationEvent`)
- **چک صادرشده (`IssuedCheck`):**
  - `id`, `number`, `issuerPartyId`, `beneficiaryPartyId`, `purchaseInvoiceId`, `dateIssued`, `dueDate`, `amount`, `status`, `purpose`, `bankName`, `note`
- **دفتر رویداد تعهدات شریک (`PartnerObligationEvent`):**
  - `id`, `issuedCheckId`, `partnerId`, `date`, `kind: "due" | "paid" | "returned" | "reversal"`, `amount`, `reversalOf`, `note`

### ۲.۸. تولید و فرمول‌های صنعتی (`ProductionFormula`, `ProductionRecord`)
- **فرمول تولید (`ProductionFormula`):**
  - `id`, `name`, `formulaType: "قطعه" | "بسته تولید"`
  - `outputProductId`, `outputName`, `outputQuantity`, `outputUnit`
  - `standardPieceWeight`, `standardPieceWeightUnit`: وزن استاندارد هر قطعه برای فرمول‌های وزن‌محور
  - `materials`: مواد اولیهٔ مصرفی (`productId`, `quantity`, `unit`)
  - `costs`: هزینه‌های سربار فرمول (`title`, `amount`)
- **بچ تولید ثبت‌شده (`ProductionRecord`):**
  - `id`, `formulaId`, `date`, `outputQuantity`, `outputQuantityBase`
  - `materialCost`, `overheadCost`, `totalCost`, `unitCost`
  - `batchNumber`, `actualOutputQuantity`, `actualOutputUnit`, `pieceWeight`, `wastePercent`
  - `formulaSnapshot`: کپی مستقل از فرمول در لحظهٔ اجرا برای پایداری تاریخی سوابق
  - `priceRevisions`: سطرهای تجدید بهای تمام‌شده برای بخش‌های فروش‌رفته یا باقیماندهٔ همان بچ فیزیکی بدون تکثیر موجودی کالا

### ۲.۹. حقوق و دستمزد (`PayrollRecord`)
- `id`, `date`, `period` (دوره مثلاً فروردین ۱۴۰۵), `employeeName`, `personId` (اتصال اختیاری به پرسنل بدون تأثیر بر بدهی تجاری طرف حساب)
- `amount`, `feeAmount`, `status: "پرداخت‌شده" | "پرداختنی" | "باطل"`
- `accountId`, `transactionId`, `paidAt`, `note`

### ۲.۱۰. حساب‌های مالی و دفاتر رویداد نقدینگی و موجودی (`Account`, `CashEvent`, `InventoryEvent`)
- **دفتر رویداد موجودی (`InventoryEvent`):**
  - `id`, `at`, `date`, `kind: "opening_balance" | "purchase" | "sale" | "production_input" | "production_output" | "adjustment" | "transfer" | "reversal"`
  - `productId`, `warehouseId`, `quantityEntered`, `unitEntered`, `quantityBase`, `baseUnit`, `sourceType`, `sourceId`, `reversalOf`, `note`
- **دفتر رویداد نقدینگی (`CashEvent`):**
  - `id`, `at`, `date`, `kind: "opening_balance" | "adjustment" | "receipt" | "payment" | "expense" | "transfer" | "check_receipt" | "check_return" | "reversal"`
  - `accountId`, `counterAccountId`, `amount`, `currency`, `sourceType`, `sourceId`, `reversalOf`, `note`

---

## ۳. دفتر استعلام تأمین‌کنندگان (`VendorDirectoryState`)

این دفتر به صورت کاملاً مستقل از حسابداری اصلی در کلید `accounting-workshop-vendor-directory-v1` نگهداری می‌شود:
- **`Vendor`:** شناسه، نام تأمین‌کننده، تلفن، آدرس، رستهٔ فعالیت (`"تولیدکننده" | "واردکننده" | "بازرگانی" | "نماینده" | "سایر"`), برچسب مواد اولیه، یادداشت.
- **`VendorQuote`:** شناسه، شناسه تأمین‌کننده، نام ماده، قیمت واحد، ارز، واحد اندازه‌گیری، تاریخ استعلام، حداقل سفارش (MOQ)، زمان تحویل، اعتبار استعلام، شرایط پرداخت و یادداشت.

---

## ۴. تاریخچهٔ ارتقای اسکیما (Schema Migrations)

| نسخه | رخدادهای کلیدی افزوده یا اصلاح‌شده |
|---|---|
| **v1** | ساختار اولیهٔ فاکتور، کالا، چک، عملیات مالی و اشخاص |
| **v2** | واحد دوم و نسبت تبدیل، کاردکس انبار و وضعیت‌های چک‌های جایگزین |
| **v3** | آغاز دفاتر رویداد انبارداری و نقدینگی (`inventoryEvents` و `cashEvents`) و سازوکار Reconcile |
| **v4** | بازطراحی کامل جریان رویدادی فاکتورهای خرید، چک‌های شریک و تخصیص‌های FIFO خرید |
| **v5 (فعلی)** | اصلاح جهت منفی خروج نقدی پرداخت‌های خرید، پشتیبانی از کارمزد انتقال/خرید/وصول، فرمول‌های بسته تولید و اصلاح ماندهٔ بانک (`account_balance_adjustment`) |
