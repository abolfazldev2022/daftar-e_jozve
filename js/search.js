// search.js — simple client-side search across courses, sessions, and note text.
// Runs entirely in-memory against data already loaded from IndexedDB; no server involved.

import DB from './db.js';

function excerptAround(text, query, radius = 40) {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text.slice(0, radius * 2);
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + query.length + radius);
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
}

export async function searchAll(query) {
  const q = query.trim();
  if (!q) return [];

  const [courses, sessions] = await Promise.all([DB.getAllCourses(), DB.getAllSessions()]);
  const courseById = new Map(courses.map((c) => [c.id, c]));
  const results = [];

  const qLower = q.toLowerCase();

  for (const course of courses) {
    if (course.name.toLowerCase().includes(qLower)) {
      results.push({
        type: 'course', courseId: course.id, courseName: course.name,
        sessionId: null, sessionTitle: null, context: course.description || ''
      });
    }
  }

  for (const session of sessions) {
    const course = courseById.get(session.courseId);
    const titleMatch = (session.title || '').toLowerCase().includes(qLower);
    const notesMatch = (session.notesPlainText || '').toLowerCase().includes(qLower);
    if (titleMatch || notesMatch) {
      results.push({
        type: 'session',
        courseId: session.courseId,
        courseName: course ? course.name : 'درس حذف‌شده',
        sessionId: session.id,
        sessionTitle: session.title,
        context: notesMatch ? excerptAround(session.notesPlainText, q) : (session.description || '')
      });
    }
  }

  return results;
}
