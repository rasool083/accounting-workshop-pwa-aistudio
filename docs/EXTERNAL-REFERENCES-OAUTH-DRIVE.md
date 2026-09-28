# منابع رسمی OAuth و Google Drive

- Google OAuth 2.0 overview: https://developers.google.com/identity/protocols/oauth2
  - Refresh token برای دریافت access token جدید پس از انقضا استفاده می‌شود و باید در storage امن سمت سرور یا keychain/native secure storage نگهداری شود؛ قرار دادن آن در localStorage یا bundle عمومی APK امن نیست.
- Google OAuth 2.0 for native apps: https://developers.google.com/identity/protocols/oauth2/native-app
  - اپ native می‌تواند پس از authorization اولیه از refresh token برای نشست‌های بعدی استفاده کند؛ این مسیر با token کوتاه‌عمر فعلی وب/PWA متفاوت است.
- Drive API authorization scopes: https://developers.google.com/workspace/drive/api/guides/api-specific-auth
  - scope محدودتر باید ترجیح داده شود. `drive.file` برای فایل‌هایی که برنامه ایجاد یا با آن‌ها تعامل دارد مناسب‌تر از دسترسی کامل Drive است.
- Android Auto Backup: https://developer.android.com/identity/data/autobackup
  - Auto Backup اندروید جایگزین backup قابل‌فهم و قابل‌بازیابی حسابداری در Google Drive نیست؛ برای بکاپ حسابداری باید export نسخه‌دار و قابل بررسی جداگانه وجود داشته باشد.

نتیجهٔ معماری: نسخهٔ فعلی وب با access token در حافظه، پس از reload یا انقضا نمی‌تواند بدون مجوز/نشست معتبر به‌صورت تضمینی خودکار در Drive بنویسد. برای APK نهایی، اتصال native یا backend امن با refresh token رمزگذاری‌شده و یک job/trigger پشتیبان‌گیری لازم است؛ refresh token نباید داخل APK قابل استخراج باشد.
