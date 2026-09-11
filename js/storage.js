// storage.js — storage usage reporting and cleanup helpers

import DB from './db.js';
import { formatBytes } from './utils.js';

export async function requestPersistence() {
  if (navigator.storage && navigator.storage.persist) {
    try {
      return await navigator.storage.persist();
    } catch (e) {
      return false;
    }
  }
  return false;
}

export async function estimateStorage() {
  if (navigator.storage && navigator.storage.estimate) {
    try {
      const { usage, quota } = await navigator.storage.estimate();
      return { supported: true, usage, quota };
    } catch (e) {
      return { supported: false };
    }
  }
  return { supported: false };
}

/**
 * Builds a breakdown of what's consuming space: recordings vs attachments vs
 * everything else (notes/metadata, which is negligible but included for completeness).
 */
export async function storageBreakdown() {
  const [recordings, attachments, sessions, courses] = await Promise.all([
    DB.getAllRecordings(), DB.getAllAttachments(), DB.getAllSessions(), DB.getAllCourses()
  ]);

  const recordingsBytes = recordings.reduce((sum, r) => sum + (r.sizeBytes || 0), 0);
  const attachmentsBytes = attachments.reduce((sum, a) => sum + (a.sizeBytes || 0), 0);
  // Rough estimate of text/metadata footprint (notes HTML + course/session fields)
  const notesBytes = sessions.reduce((sum, s) => sum + new Blob([s.notesHTML || '']).size, 0)
    + new Blob([JSON.stringify(courses)]).size;

  const courseById = new Map(courses.map((c) => [c.id, c]));
  const sessionById = new Map(sessions.map((s) => [s.id, s]));

  const recordingRows = recordings.map((r) => {
    const session = sessionById.get(r.sessionId);
    const course = session ? courseById.get(session.courseId) : null;
    return {
      id: r.id, sessionId: r.sessionId,
      label: session ? `${course ? course.name + ' — ' : ''}${session.title}` : 'جلسهٔ حذف‌شده',
      sizeBytes: r.sizeBytes || 0, createdAt: r.createdAt, kind: 'recording'
    };
  });

  const attachmentRows = attachments.map((a) => {
    const session = sessionById.get(a.sessionId);
    const course = session ? courseById.get(session.courseId) : null;
    return {
      id: a.id, sessionId: a.sessionId,
      label: `${session ? (course ? course.name + ' — ' : '') + session.title + ' — ' : ''}${a.filename}`,
      sizeBytes: a.sizeBytes || 0, createdAt: a.createdAt, kind: 'attachment'
    };
  });

  return {
    recordingsBytes, attachmentsBytes, notesBytes,
    totalBytes: recordingsBytes + attachmentsBytes + notesBytes,
    items: [...recordingRows, ...attachmentRows]
  };
}

export function sortItems(items, by = 'size') {
  const copy = [...items];
  if (by === 'size') copy.sort((a, b) => b.sizeBytes - a.sizeBytes);
  else if (by === 'date') copy.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return copy;
}

export { formatBytes };
