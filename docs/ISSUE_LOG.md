# دفتر ثبت و حل مسائل و درخواست‌ها (Issue & Request Resolution Log)

این سند در پاسخ به **قانون دائمی پروژه** تدوین شده است:  
> **قانون دائمی:** هر زمان کاربر مشکلی یا درخواستی را مطرح کرد، باید شرح کامل درخواست، ریشه‌یابی فنی، راه‌حل‌های بررسی‌شده و شیوهٔ دقیق اجرای آن در مستندات پروژه گیت‌هاب ثبت شود تا هر توسعه‌دهنده یا هوش مصنوعی در آینده با تسلط ۱۰۰٪ بتواند مسیر توسعه را ادامه دهد.

---

## فهرست مسائل و وقایع ثبت‌شده

- [ISSUE-2026-09-29-01: عدم لود برنامه در GitHub Pages و نمایش متن پیش‌فرض README + فعال‌سازی نصب PWA در Microsoft Edge](#issue-2026-09-29-01)

---

<a id="issue-2026-09-29-01"></a>
## شناسه: ISSUE-2026-09-29-01
- **تاریخ:** ۱۴۰۵/۰۷/۰۸ (۲۹ سپتامبر ۲۰۲۶)
- **وضعیت:** برطرف و مستند شد (Resolved & Verified)
- **لایهٔ درگیر:** CI/CD (GitHub Actions), Deployment (GitHub Pages), PWA (Edge & Web Manifest)

---

### ۱. شرح درخواست و گزارش کاربر (User Request & Problem Description)
کاربر پس از تلاش برای باز کردن آدرس استقرار گیت‌هاب پیجز پروژه (`https://rasool083.github.io/accounting-workshop-pwa-aistudio/`)، دو اسکرین‌شات از مرورگر تلفن همراه (کروم/اج) ارسال کرد که نشان می‌داد:
- به جای نرم‌افزار حسابداری کارگاه، صفحه‌ای با پس‌زمینهٔ سفید، بنر مشکی Google AI Studio و متن زیر لود شده بود:
  > **accounting-workshop-pwa-aistudio**  
  > Built with AI Studio</h2>  
  > The fastest path from prompt to production with Gemini.  
  > Start building </div>
- **درخواست کاربر:**  
  ۱. رفع این مشکل و باز شدن صفحهٔ اصلی حسابداری کارگاه در GitHub Pages.  
  ۲. فعال‌سازی قابلیت نصب نرم‌افزار در مرورگر Microsoft Edge به عنوان PWA.

---

### ۲. ریشه‌یابی فنی خطا (Root Cause Analysis)

بررسی دقیق مخزن، تنظیمات گیت‌هاب، تاریخچهٔ اکشن‌ها و تحلیل اسکرین‌شات سه علت ریشه‌ای را آشکار کرد:

#### علت ۱: رفتار پیش‌فرض موتور Jekyll در حالت `Deploy from a branch`
- در تنظیمات مخزن گیت‌هاب (**Settings > Pages**)، گزینهٔ **Source** روی حالت پیش‌فرض `Deploy from a branch (Branch: main, /root)` تنظیم شده بود.
- در این حالت، گیت‌هاب فایل‌های سورس پروژهٔ Vite/React را بیلد نمی‌کند، بلکه کل پوشهٔ ریشه شاخهٔ `main` را به موتور سایت‌ساز Jekyll می‌سپارد. موتور Jekyll به صورت خودکار فایل `README.md` ریشه را تبدیل به یک صفحهٔ سادهٔ HTML کرده و تحویل مرورگر می‌داد.
- چون فایل اولیهٔ `README.md` مخزن شامل بنر و معرفی اولیه بود، همان متن در مرورگر کاربر نمایش داده شده بود.

#### علت ۲: خطای `ERESOLVE` در اولین اجرای GitHub Actions
- ورک‌فلو اولیهٔ `.github/workflows/deploy-pages.yml` که برای بیلد خودکار پوشهٔ `dist/public` ساخته شده بود، در اولین اجرا در مرحلهٔ `Install dependencies` با خطای شکست مواجه شد:
  ```text
  npm error code ERESOLVE
  npm error ERESOLVE could not resolve
  npm error Conflicting peer dependency: vite@5.4.21
  npm error from @builder.io/vite-plugin-jsx-loc@0.1.1
  ```
- چون پکیج `@builder.io/vite-plugin-jsx-loc` نیازمند وایت ۵ بود و پروژه با وایت ۷ اجرا می‌شود، دستور پیش‌فرض `npm install` در سرور اوبونتو متوقف شده بود و خروجی بیلد آماده نشده بود.

#### علت ۳: شرایط نصب PWA در موتور Chromium و مرورگر Microsoft Edge
- مرورگر Microsoft Edge برای اینکه آیکون نصب (Install App) را در نوار آدرس نشان دهد، معیارهای سخت‌گیرانه‌ای دارد:
  1. دارا بودن حداقل یک آیکون با ابعاد ۱۹۲x۱۹۲ و یک آیکون با ابعاد ۵۱۲x۵۱۲ در فرمت **PNG** (فایل‌های خالص SVG برای پرامپت خودکار اج کافی نیستند).
  2. تفکیک واضح `purpose: "any"` از `purpose: "maskable"` (آیکون ماسک‌بل باید دارای ۱۰ الی ۱۵ درصد حاشیه امن safe-zone باشد).
  3. وجود دکمهٔ تعاملی گوش‌به‌زنگ برای رویداد `beforeinstallprompt` درون رابط کاربری برنامه.
  4. تطابق آدرس‌های `scope` و `start_url` با زیرمسیر مخزن در GitHub Pages.

---

### ۳. راه‌حل‌های موجود و استراتژی انتخابی (Solutions & Strategy)

| راه‌حل | مزایا | معایب / ریسک | وضعیت تصمیم |
|---|---|---|---|
| **الف) فقط تصحیح تنظیم دستی به GitHub Actions** | استانداردترین راه در گیت‌هاب نوین | اگر کاربر در پنل تنظیمات شاخه را اشتباه انتخاب کند باز هم با صفحه سفید مواجه می‌شود. | ناکافی به تنهایی |
| **ب) رفع تداخل پکیج‌ها با `--legacy-peer-deps` و `overrides`** | رفع تضمینی خطای بیلد در سرورهای ابری | هیچ | **تصویب و اجرا شد** |
| **ج) استقرار دوگانه (Dual-Deploy به Actions و شاخهٔ `gh-pages`)** | اگر در گیت‌هاب پیجز چه حالت GitHub Actions انتخاب شود و چه حالت Deploy from a branch (شاخه gh-pages)، برنامه ۱۰۰٪ کار خواهد کرد. | اضافه شدن یک گام ساده به اکشن | **تصویب و اجرا شد** |
| **د) ساخت آیکون‌های PNG با موتور تصویری و ایجاد دکمهٔ PWA** | رعایت ۱۰۰٪ استانداردهای مایکروسافت اج، دسکتاپ و موبایل | نیاز به پکیج پردازش تصویر (sharp) | **تصویب و اجرا شد** |

---

### ۴. جزئیات دقیق پیاده‌سازی و تغییرات کد (Implementation Details)

#### ۱. تصحیح ورک‌فلو گیت‌هاب (`/.github/workflows/deploy-pages.yml`)
- افزودن فلگ `--legacy-peer-deps` به مرحلهٔ نصب.
- قرار دادن انتشار دوگانه با اکشن `peaceiris/actions-gh-pages@v4` روی شاخهٔ `gh-pages`:
```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: write
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Install dependencies
        run: npm install --legacy-peer-deps
      - name: Build static site
        run: npm run build
        env:
          GITHUB_ACTIONS: "true"
      - name: Configure Pages
        uses: actions/configure-pages@v5
      - name: Upload Pages artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: dist/public
      - name: Deploy to gh-pages branch
        uses: peaceiris/actions-gh-pages@v4
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./dist/public
          force_orphan: true

  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - name: Deploy
        id: deployment
        uses: actions/deploy-pages@v4
```

#### ۲. تنظیم تداخل نسخه‌ها در `package.json`
افزودن override برای حل دائمی تداخل پکیج jsx-loc با Vite 7:
```json
"overrides": {
  "tailwindcss": {
    "nanoid": "3.3.7"
  },
  "@builder.io/vite-plugin-jsx-loc": {
    "vite": "$vite"
  }
}
```

#### ۳. تولید آیکون‌های استاندارد با وضوح بالا
اسکریپت `scripts/generate-pwa-icons.js` با استفاده از `sharp` ایجاد و فایل‌های زیر در `client/public/` تولید و ثبت شدند:
- `icon-192.png`: ابعاد ۱۹۲x۱۹۲ استاندارد PWA
- `icon-512.png`: ابعاد ۵۱۲x۵۱۲ استاندارد رزولوشن بالا
- `icon-maskable-512.png`: آیکون ۵۱۲x۵۱۲ دارای حاشیهٔ امن (Safe-Zone) با پس‌زمینهٔ برند `#142d31`
- `apple-touch-icon.png`: ابعاد ۱۸۰x۱۸۰ ویژهٔ دستگاه‌های iOS
- `favicon.png`: ابعاد ۶۴x۶۴ برای تب مرورگر دسکتاپ

#### ۴. ارتقای مانیفست وب (`client/public/manifest.webmanifest`)
- تنظیم `id: "./"`, `start_url: "./"`, `scope: "./"` جهت کارکرد مستقل از مسیر دامنه یا زیرپوشه مخزن.
- تعریف جداگانه آیکون‌های معمولی (`purpose: "any"`) از آیکون‌های ماسک‌بل (`purpose: "maskable"`).

#### ۵. کامپوننت و هوک نصب PWA
- هوک `client/src/hooks/usePWAInstall.ts`: شنود رویداد `beforeinstallprompt`، تشخیص حالت standalone (در صورت نصب بودن دکمه مخفی می‌شود) و تشخیص دستگاه‌های iOS.
- کامپوننت `client/src/components/PWAInstallButton.tsx`: دکمهٔ با تم زمردی و عنوان **«نصب برنامه (PWA)»** در نوار بالای صفحه (`topbar-actions`) اضافه شد.

#### ۶. اصلاح فایل `README.md`
محتوای پیش‌فرض حذف و راهنمای کامل معرفی نرم‌افزار حسابداری کارگاه، ویژگی‌های کلیدی، لینک مستقیم استقرار و مراحل نصب در Microsoft Edge جایگزین گردید.

---

### ۵. نتایج صحه‌گذاری و آزمون (Verification & Tests)
- تمامی ۹۵ تست پروژه در `vitest run` پاس شدند (شامل ۳ تست قرارداد تحویل PWA).
- بررسی دستور `tsc --noEmit` بدون هیچ‌گونه هشدار و خطایی پایان یافت.
- بیلد نهایی با موفقیت فایل‌های استاتیک را در `dist/public` تولید کرد.
- کامیت‌های `70246f5` و `ead27d1` بر روی شاخهٔ `main` ثبت شدند.
