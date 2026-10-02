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

// NOTE on tone: these notes are shown directly to ordinary users (see the
// Settings view), so they're written in plain, everyday Persian — no
// technical terms (no "Service Worker", "Sanitizer", "Promise", "IndexedDB",
// "stale snapshot", etc.). Keep this in mind when adding future entries.
export const CHANGELOG = [
  {
    version: '1.0.0',
    date: '2026-09-29',
    notes: [
      'مشکل حذف جلسه برطرف شد؛ حالا جلسه‌ای که حذف می‌کنید دیگر دوباره برنمی‌گردد.',
      'ابزارهای صفحهٔ یادداشت (اندازهٔ قلم، پررنگ، زیرخط، لیست، تراز متن و...) حالا درست و پایدار کار می‌کنند.',
      'یادداشت‌های شما امن‌تر ذخیره می‌شوند.',
      'بستن پنجرهٔ افزودن یا ویرایش درس/جلسه با دکمهٔ × حالا در همهٔ حالت‌ها درست کار می‌کند.',
      'برنامه در حالت بدون اینترنت بهتر و مطمئن‌تر کار می‌کند.',
      'وقتی نسخهٔ جدید برنامه آماده باشد، فقط با تأیید خود شما نصب می‌شود و چیزی را که در حال نوشتن بودید از بین نمی‌برد.',
      'نمایش سادهٔ تغییرات هر نسخه به برنامه اضافه شد.'
    ]
  }
];
