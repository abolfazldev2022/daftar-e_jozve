// backup.js — export/import for دفتر جزوه.
// Format: single JSON file, audio/attachment Blobs embedded as base64.
// This keeps backups fully self-contained and dependency-free (no ZIP library),
// at the cost of ~33% larger files for binary-heavy backups — a deliberate trade-off.

import DB from './db.js';
import { nowISO } from './utils.js';

const APP_NAME = 'daftar-jozve';
const SCHEMA_VERSION = 1;

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(base64, mimeType) {
  const byteChars = atob(base64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
  return new Blob([new Uint8Array(byteNumbers)], { type: mimeType });
}

/**
 * Builds the backup object. type: 'full' includes recordings and attachments' blobs;
 * 'notes-only' includes attachments' metadata+blobs (materials the user attached to
 * study, per spec) but excludes audio recordings only.
 */
export async function createBackup(type = 'full') {
  const [courses, sessions, attachments, settingsRows] = await Promise.all([
    DB.getAllCourses(),
    DB.getAllSessions(),
    DB.getAllAttachments(),
    DB.getAllSettingsRaw()
  ]);

  const attachmentsOut = [];
  for (const att of attachments) {
    attachmentsOut.push({
      id: att.id, sessionId: att.sessionId, type: att.type, mimeType: att.mimeType,
      filename: att.filename, sizeBytes: att.sizeBytes, createdAt: att.createdAt,
      dataBase64: await blobToBase64(att.blob)
    });
  }

  const backup = {
    appName: APP_NAME,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: nowISO(),
    type,
    courses,
    sessions,
    attachments: attachmentsOut,
    settings: settingsRows,
    recordings: []
  };

  if (type === 'full') {
    const recordings = await DB.getAllRecordings();
    for (const rec of recordings) {
      backup.recordings.push({
        id: rec.id, sessionId: rec.sessionId, mimeType: rec.mimeType,
        durationSeconds: rec.durationSeconds, sizeBytes: rec.sizeBytes,
        createdAt: rec.createdAt, dataBase64: await blobToBase64(rec.blob)
      });
    }
  }

  return backup;
}

export async function downloadBackup(type = 'full') {
  const backup = await createBackup(type);
  const json = JSON.stringify(backup);
  const approxBytes = json.length;
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const date = new Date().toISOString().slice(0, 10);
  const filename = `daftar-jozve-${type === 'full' ? 'کامل' : 'یادداشت‌ها'}-${date}.json`;
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return { approxBytes, filename };
}

/** Validates a parsed backup object's structure before anything is written to IndexedDB. */
export function validateBackup(data) {
  const errors = [];
  if (!data || typeof data !== 'object') errors.push('فایل پشتیبان معتبر نیست.');
  else {
    if (data.appName !== APP_NAME) errors.push('این فایل متعلق به برنامهٔ دفتر جزوه نیست.');
    if (typeof data.schemaVersion !== 'number') errors.push('نسخهٔ ساختار فایل پشتیبان مشخص نیست.');
    if (!Array.isArray(data.courses)) errors.push('فهرست درس‌ها در فایل پشتیبان یافت نشد.');
    if (!Array.isArray(data.sessions)) errors.push('فهرست جلسات در فایل پشتیبان یافت نشد.');
    if (data.courses && data.courses.some((c) => !c.id || !c.name)) errors.push('برخی رکوردهای درس ناقص هستند.');
    if (data.sessions && data.sessions.some((s) => !s.id || !s.courseId)) errors.push('برخی رکوردهای جلسه ناقص هستند.');
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Restores a validated backup. mode: 'replace' clears existing data first;
 * 'merge' inserts/overwrites by ID without touching unrelated existing records.
 */
export async function restoreBackup(data, mode = 'replace') {
  const { valid, errors } = validateBackup(data);
  if (!valid) throw new Error(errors.join(' '));

  if (mode === 'replace') {
    await DB.wipeAll();
  }

  for (const course of data.courses) await DB.putCourse(course);
  for (const session of data.sessions) await DB.putSession(session);

  if (Array.isArray(data.attachments)) {
    for (const att of data.attachments) {
      const blob = base64ToBlob(att.dataBase64, att.mimeType);
      await DB.putAttachment({ ...att, blob, dataBase64: undefined });
    }
  }

  if (Array.isArray(data.recordings)) {
    for (const rec of data.recordings) {
      const blob = base64ToBlob(rec.dataBase64, rec.mimeType);
      await DB.putRecording({ ...rec, blob, dataBase64: undefined });
    }
  }

  if (data.settings && Array.isArray(data.settings)) {
    for (const row of data.settings) {
      await DB.setSetting(row.key, row.value);
    }
  }

  return await DB.counts();
}

export function readFileAsJSON(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(JSON.parse(reader.result));
      } catch (err) {
        reject(new Error('فایل انتخاب‌شده یک فایل JSON معتبر نیست.'));
      }
    };
    reader.onerror = () => reject(new Error('خطا در خواندن فایل.'));
    reader.readAsText(file);
  });
}
