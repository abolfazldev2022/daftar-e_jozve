// utils.js — small dependency-free helpers shared across modules

export function uuid() {
  if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
  // Fallback for very old browsers without crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function debounce(fn, wait) {
  let timer = null;
  return function debounced(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), wait);
  };
}

export function formatBytes(bytes) {
  if (bytes === 0 || bytes == null) return '۰ بایت';
  const units = ['بایت', 'کیلوبایت', 'مگابایت', 'گیگابایت'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${toPersianDigits(value.toFixed(i === 0 ? 0 : 1))} ${units[i]}`;
}

export function toPersianDigits(input) {
  const map = { '0': '۰', '1': '۱', '2': '۲', '3': '۳', '4': '۴', '5': '۵', '6': '۶', '7': '۷', '8': '۸', '9': '۹' };
  return String(input).replace(/[0-9]/g, (d) => map[d]);
}

export function formatDuration(totalSeconds) {
  const s = Math.floor(totalSeconds % 60);
  const m = Math.floor((totalSeconds / 60) % 60);
  const h = Math.floor(totalSeconds / 3600);
  const pad = (n) => String(n).padStart(2, '0');
  const text = h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  return toPersianDigits(text);
}

/**
 * Sanitizes a string for safe use as a filename across Windows/macOS/Android.
 * Keeps Persian characters (they're valid in filenames on all modern platforms)
 * but strips characters that are invalid on at least one common filesystem.
 */
export function sanitizeFilename(name, fallback = 'file') {
  if (!name || typeof name !== 'string') return fallback;
  const cleaned = name
    .replace(/[/\\:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .trim();
  return cleaned.length ? cleaned.slice(0, 120) : fallback;
}

export function extensionForMime(mimeType) {
  if (!mimeType) return 'webm';
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'm4a';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3';
  if (mimeType.includes('wav')) return 'wav';
  return 'audio';
}

export function extensionForFile(mimeType, originalName) {
  if (originalName && originalName.includes('.')) {
    return originalName.split('.').pop();
  }
  if (!mimeType) return 'bin';
  const map = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
    'image/gif': 'gif', 'application/pdf': 'pdf'
  };
  return map[mimeType] || 'bin';
}

export function nowISO() {
  return new Date().toISOString();
}

// ---------- Jalali (Persian) calendar conversion ----------
// Dependency-free Gregorian <-> Jalali conversion (well-known algorithm, public domain approach).

function div(a, b) { return ~~(a / b); }

export function gregorianToJalali(gy, gm, gd) {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let jy = gy <= 1600 ? 0 : 979;
  gy -= gy <= 1600 ? 621 : 1600;
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days = 365 * gy + div(gy2 + 3, 4) - div(gy2 + 99, 100) + div(gy2 + 399, 400) - 80 + gd + g_d_m[gm - 1];
  jy += 33 * div(days, 12053);
  days %= 12053;
  jy += 4 * div(days, 1461);
  days %= 1461;
  if (days > 365) {
    jy += div(days - 1, 365);
    days = (days - 1) % 365;
  }
  const jm = days < 186 ? 1 + div(days, 31) : 7 + div(days - 186, 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return { jy, jm, jd };
}

export function jalaliToGregorian(jy, jm, jd) {
  let gy = jy <= 979 ? 621 : 1600;
  jy -= jy <= 979 ? 0 : 979;
  let days = 365 * jy + div(jy, 33) * 8 + div((jy % 33) + 3, 4) + 78 + jd + (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  gy += 400 * div(days, 146097);
  days %= 146097;
  if (days > 36524) {
    gy += 100 * div(--days, 36524);
    days %= 36524;
    if (days >= 365) days++;
  }
  gy += 4 * div(days, 1461);
  days %= 1461;
  if (days > 365) {
    gy += div(days - 1, 365);
    days = (days - 1) % 365;
  }
  const sal_a = [0, 31, gregorianLeap(gy) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gd = days + 1;
  let gm = 0;
  while (gm < 13 && gd > sal_a[gm]) {
    gd -= sal_a[gm];
    gm++;
  }
  return { gy, gm, gd };
}

function gregorianLeap(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function todayJalaliString() {
  const now = new Date();
  const { jy, jm, jd } = gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
  return `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`;
}

export function isValidJalaliString(str) {
  return /^\d{3,4}\/\d{1,2}\/\d{1,2}$/.test(str);
}

// ---------- HTML sanitization for notes ----------
// Strips scripts/handlers before storing or rendering — cheap insurance since a restored
// backup file (edited outside the app) is untrusted input.
const ALLOWED_TAGS = new Set([
  'B', 'STRONG', 'I', 'EM', 'U', 'S', 'BR', 'P', 'DIV', 'SPAN',
  'H1', 'H2', 'H3', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'A', 'HR', 'MARK'
]);
// P is allowed 'style' too (not just DIV/SPAN) because execCommand's
// justify commands wrap lines in <p> in some browsers (Firefox) and in
// <div> in others (Chrome) — both need to survive sanitization equally.
const ALLOWED_ATTRS = { A: ['href', 'target', 'rel'], SPAN: ['style', 'class'], DIV: ['style'], P: ['style'], MARK: ['class'] };

// Inline `style` values are NOT passed through as-is — only these specific
// CSS properties, with values matching this shape, survive sanitization.
// This is intentionally a strict allow-list (not a blocklist of "dangerous"
// patterns) so arbitrary CSS/HTML can never be smuggled in via style="...",
// including from a restored backup file edited outside the app.
const ALLOWED_STYLE_PROPS = {
  'font-size': /^\d+(\.\d+)?(em|rem|px|%)$/,
  'text-align': /^(right|left|center|justify)$/
};

function sanitizeStyleValue(value) {
  if (!value) return '';
  const kept = [];
  value.split(';').forEach((decl) => {
    const idx = decl.indexOf(':');
    if (idx === -1) return;
    const prop = decl.slice(0, idx).trim().toLowerCase();
    const val = decl.slice(idx + 1).trim().toLowerCase();
    const pattern = ALLOWED_STYLE_PROPS[prop];
    if (pattern && pattern.test(val)) kept.push(`${prop}: ${val}`);
  });
  return kept.join('; ');
}

export function sanitizeHTML(html) {
  const template = document.createElement('template');
  template.innerHTML = html || '';
  const walk = (node) => {
    const children = Array.from(node.childNodes);
    for (const child of children) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        if (!ALLOWED_TAGS.has(child.tagName)) {
          // Unwrap disallowed elements (keep their text/children) instead of dropping content.
          while (child.firstChild) node.insertBefore(child.firstChild, child);
          node.removeChild(child);
          continue;
        }
        const allowedAttrs = ALLOWED_ATTRS[child.tagName] || [];
        for (const attr of Array.from(child.attributes)) {
          const name = attr.name;
          if (!allowedAttrs.includes(name) || /^on/i.test(name)) {
            child.removeAttribute(name);
            continue;
          }
          if (name === 'style') {
            const safeStyle = sanitizeStyleValue(attr.value);
            if (safeStyle) child.setAttribute('style', safeStyle);
            else child.removeAttribute('style');
            continue;
          }
          if (attr.value.trim().toLowerCase().startsWith('javascript:')) {
            child.removeAttribute(name);
          }
        }
        if (child.tagName === 'A') {
          child.setAttribute('target', '_blank');
          child.setAttribute('rel', 'noopener noreferrer');
        }
        walk(child);
      } else if (child.nodeType !== Node.TEXT_NODE) {
        node.removeChild(child);
      }
    }
  };
  walk(template.content);
  return template.innerHTML;
}

// Block-level elements whose boundaries must become whitespace when flattened
// to plain text — otherwise e.g. "<div>درس</div><div>اینترنت</div>" (two
// separate lines in the editor) collapses into "درساینترنت" via a plain
// .textContent read, since textContent inserts no whitespace at element
// boundaries on its own.
const BLOCK_TAGS_FOR_PLAIN_TEXT = new Set(['P', 'DIV', 'LI', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'UL', 'OL', 'HR']);

export function htmlToPlainText(html) {
  const container = document.createElement('div');
  container.innerHTML = html || '';
  const parts = [];
  const walk = (node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        parts.push(child.textContent);
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        if (child.tagName === 'BR') { parts.push(' '); continue; }
        // A separator is needed on BOTH sides of a block element's content —
        // not just after it. A line typed before the user's first Enter press
        // is often a bare text node with no wrapping element at all (e.g.
        // "درس" + "<div>اینترنت...</div>"), so adding the space only after
        // the block (the previous attempt) left it glued to whatever came
        // right before the block.
        const isBlock = BLOCK_TAGS_FOR_PLAIN_TEXT.has(child.tagName);
        if (isBlock) parts.push(' ');
        walk(child);
        if (isBlock) parts.push(' ');
      }
    }
  };
  walk(container);
  return parts.join('').replace(/\s+/g, ' ').trim();
}

export function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}
