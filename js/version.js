// version.js — single source of truth for "دفتر جزوه"'s product version + changelog.
//
// This is UNRELATED to, and must stay independent of, the other version-like
// constants already in the codebase (each serves a different purpose and has
// its own bump rules):
//   - sw.js            CACHE_VERSION   — Service Worker cache-busting string.
//                                        Bump only when cached app-shell files change.
//   - js/db.js         DB_VERSION      — IndexedDB schema version (integer).
//                                        Bump only on an actual schema migration.
//   - js/backup.js     SCHEMA_VERSION  — backup/restore JSON file format version.
//                                        Bump only when the backup file shape changes.
//
// VERSION below is the human-facing product/app version (semver: MAJOR.MINOR.PATCH).
// Any part of the app that needs to show or reference the app's version MUST
// import it from here — never hardcode a version string elsewhere.
//
// Bump rules (semver): PATCH for bug fixes, MINOR for new backward-compatible
// features, MAJOR for breaking changes. Every bump MUST add a new entry at the
// TOP of CHANGELOG (newest first) in the same commit/change as the bump.

export const VERSION = '1.0.0';

export const CHANGELOG = [
  {
    version: '1.0.0',
    date: '2026-09-29',
    notes: [
      'رفع باگ بازگشت دوبارهٔ جلسهٔ حذف‌شده و overwrite شدن اطلاعات جلسه به دلیل snapshot قدیمی در حافظه',
      'رفع مشکلات Editor: اندازهٔ فونت، از‌بین‌رفتن انتخاب متن هنگام کلیک روی Toolbar، و ماندگاری فرمت‌بندی بعد از ذخیره/رفرش',
      'سخت‌گیرانه‌تر شدن Sanitizer محتوای Editor (برای style، فقط font-size و text-align مجاز) بدون از دست رفتن فرمت‌های مجاز',
      'رفع Promise معلق هنگام بستن Modal با دکمهٔ ×',
      'رفع ثبت نشدن واقعی Service Worker (به‌خاطر تایمینگ رویداد load) و در نتیجه فعال نشدن واقعی حالت Offline',
      'رفع فعال‌شدن خودکار نسخهٔ جدید Service Worker بدون تأیید کاربر؛ اکنون فقط بعد از کلیک روی «بروزرسانی» و با حفظ تغییرات ذخیره‌نشده',
      'افزودن سیستم Version + Changelog مرکزی'
    ]
  }
];
