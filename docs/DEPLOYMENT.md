# راهنمای استقرار و انتشار (Deployment & Distribution)

این سند فرآیندها، پیکربندی‌ها و بسترهای استقرار سامانه را مستند می‌کند.

---

## ۱. استقرار روی گیت‌هاب پیجز (GitHub Pages Deployment)

سامانه به عنوان یک برنامهٔ فرانت‌اند وب استاتیک برای انتشار دائمی از طریق GitHub Pages تنظیم شده است.

### مراحل فعال‌سازی در مخزن گیت‌هاب:
1. در ریپوزیتوری گیت‌هاب به مسیر **Settings > Pages** بروید.
2. در بخش **Build and deployment**، گزینهٔ **Source** را روی **GitHub Actions** تنظیم کنید.
3. با هر بار Push روی شاخهٔ `main`، ورک‌فلو خودکار اجرا شده و سایت را روی آدرس زیر منتشر می‌کند:  
   `https://rasool083.github.io/accounting-workshop-pwa-aistudio/`

### پیکربندی گردش‌کار گیت‌هاب (`.github/workflows/deploy-pages.yml`)
- **رویداد تحریک (Trigger):** ارسال تغییرات به شاخهٔ `main` یا اجرای دستی (`workflow_dispatch`).
- **دستور نصب:** `npm install --legacy-peer-deps` (جهت سازگاری قطعی پکیج‌ها در سرورهای ابری).
- **مسیر خروجی ساخت:** پوشهٔ `dist/public` حاصل از `npm run build`.
- **انتشار دوگانه (Dual-Deploy):** ورک‌فلو همزمان خروجی را مستقیماً از طریق `actions/deploy-pages` منتشر کرده و یک نسخه نیز روی شاخهٔ `gh-pages` قرار می‌دهد.
- **مدیریت آدرس پایه (Base Path):**  
  در فایل `vite.config.ts`، متغیر آدرس پایه به صورت خودکار تنظیم می‌شود:
  ```typescript
  base: process.env.GITHUB_ACTIONS ? "/accounting-workshop-pwa-aistudio/" : "/"
  ```
  این پیکربندی تضمین می‌کند که در گیت‌هاب پیجز اسکریپت‌ها و دارایی‌ها از زیرپوشهٔ مخزن (`/accounting-workshop-pwa-aistudio/`) و در محیط‌های لوکال یا سرور اختصاصی از ریشه (`/`) لود شوند.

---

## ۲. مشخصات و استقرار پیشرو وب (PWA Deployment & Edge Installation)

برای تضمین عملکرد صحیح PWA چه در مسیر ریشه و چه در زیرپوشه و قابلیت نصب مستقیم در مرورگر Microsoft Edge، Chrome و موبایل:
- **آدرس‌های نسبی:** در فایل `manifest.webmanifest`، مقادیر `id`، `start_url` و `scope` برابر `"./"` تنظیم شده‌اند تا به صورت خودکار با هاست و پوشهٔ جاری تطبیق یابند.
- **آیکون‌های چندگانه و باکیفیت PNG:**  
  فایل‌های `icon-192.png`، `icon-512.png`، `icon-maskable-512.png` (با حاشیهٔ امن ۱۵٪) و `apple-touch-icon.png` تولید شده و در مانیفست و هدر HTML رجیستر شده‌اند.
- **دکمه اختصاصی نصب درون‌برنامه‌ای (`PWAInstallButton`):**  
  در نوار بالای صفحه تعبیه شده است و رویداد `beforeinstallprompt` را مهار کرده و نصب آسان با یک کلیک را فراهم می‌آورد.
- **سرویس‌ورکر (`sw.js`):**  
  دامنهٔ کش را از طریق `self.registration.scope` می‌خواند و تمام دارایی‌های شل برنامه (`index.html`, `manifest.webmanifest`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`, `favicon.png`) را کش می‌کند.
- **رفتار آفلاین:** پس از اولین بازگشایی و دریافت دارایی‌ها، برنامه در غیاب کامل اینترنت باز شده و داده‌های محلی را در دسترس کاربر قرار می‌دهد.

---

## ۳. بستر توسعه و پیش‌نمایش در AI Studio

- **پورت اختصاصی:** ۳۰۰۰ (تنها پورت مجاز محیط AI Studio).
- **تنظیمات شبکه در Vite:**
  ```typescript
  server: {
    port: 3000,
    strictPort: false,
    host: "0.0.0.0",
    allowedHosts: true,
  }
  ```
- **هندلینگ ایمن Git Commit:** خواندن شناسهٔ کامیت در بیلد با بلوک `try-catch` و `stdio: "ignore"` محافظت شده تا در کانتینرهای فاقد فولدر `.git` فرآیند ساخت متوقف نگردد.

---

## ۴. زیرساخت پوستهٔ بومی اندروید (Capacitor Android Shell)

- پوشهٔ `/android` شامل ساختار استاندارد Android Studio با پیکربندی Gradle نسخهٔ ۸٫۱۳ و جاوا ۲۱ است.
- **فایل پیکربندی:** `capacitor.config.ts`:
  - `appId`: `"ir.workshop.accounting"`
  - `appName`: `"حسابداری کارگاه"`
  - `webDir`: `"dist/public"`
- **فرمان‌های هماهنگ‌سازی محلی:**
  ```bash
  # ساخت وب و انتقال به اندروید:
  npm run android:sync
  
  # باز کردن در محیط اندروید استودیو (در سیستم شخصی دارای SDK):
  npm run android:open
  ```
- *یادآوری معماری:* انتشار فایل نهایی APK طبق مصوبه تا پایان دورهٔ آزمون واقعی نسخهٔ وب متوقف است.
