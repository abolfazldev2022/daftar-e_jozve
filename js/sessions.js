// sessions.js — session CRUD + associated UI (forms, list rendering)

import DB from './db.js';
import { uuid, nowISO, todayJalaliString, isValidJalaliString, escapeHTML, toPersianDigits } from './utils.js';
import { el, openModal, confirmDialog, showToast } from './ui.js';

export async function getSessionsForCourse(courseId) {
  const sessions = await DB.getSessionsByCourse(courseId);
  return sessions.sort((a, b) => (b.sessionNumber || 0) - (a.sessionNumber || 0));
}

export async function nextSessionNumber(courseId) {
  const sessions = await DB.getSessionsByCourse(courseId);
  return sessions.reduce((max, s) => Math.max(max, s.sessionNumber || 0), 0) + 1;
}

export function openSessionForm(courseId, existingSession = null, suggestedNumber = 1) {
  return new Promise(async (resolve) => {
    const body = el('form', { class: 'form' });
    const numberInput = el('input', { type: 'number', min: '1', required: 'true', value: existingSession ? existingSession.sessionNumber : suggestedNumber });
    const titleInput = el('input', { type: 'text', required: 'true', maxlength: '120', value: existingSession ? existingSession.title : '' });
    const dateInput = el('input', { type: 'text', required: 'true', placeholder: '۱۴۰۵/۰۷/۱۰', value: existingSession ? existingSession.date : todayJalaliString() });
    const descInput = el('textarea', { rows: '2', maxlength: '300' }, existingSession ? (existingSession.description || '') : '');

    body.append(
      el('label', {}, ['شمارهٔ جلسه *', numberInput]),
      el('label', {}, ['عنوان جلسه *', titleInput]),
      el('label', {}, ['تاریخ (شمسی) *', dateInput]),
      el('label', {}, ['توضیح کوتاه', descInput]),
      el('div', { class: 'form-actions' }, [
        el('button', { type: 'submit', class: 'btn btn--primary' }, existingSession ? 'ذخیرهٔ تغییرات' : 'افزودن جلسه')
      ])
    );

    const modal = openModal({ title: existingSession ? 'ویرایش جلسه' : 'جلسهٔ جدید', bodyEl: body });

    body.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = titleInput.value.trim();
      const date = dateInput.value.trim();
      if (!title) { showToast('عنوان جلسه الزامی است', 'error'); return; }
      if (!isValidJalaliString(date)) { showToast('تاریخ را به فرمت ۱۴۰۵/۰۷/۱۰ وارد کنید', 'error'); return; }

      const session = existingSession
        ? { ...existingSession, sessionNumber: Number(numberInput.value), title, date, description: descInput.value.trim(), updatedAt: nowISO() }
        : {
            id: uuid(), courseId, sessionNumber: Number(numberInput.value), title, date,
            description: descInput.value.trim(), notesHTML: '', notesPlainText: '', hasAudio: false,
            createdAt: nowISO(), updatedAt: nowISO()
          };
      await DB.putSession(session);
      modal.close();
      resolve(session);
    });

    modal.overlay.addEventListener('click', (e) => {
      if (e.target === modal.overlay) resolve(null);
    });
  });
}

export async function deleteSessionWithConfirm(session) {
  const confirmed = await confirmDialog({
    title: 'حذف جلسه',
    message: `جلسهٔ «${escapeHTML(session.title)}» به‌همراه یادداشت‌ها، ضبط صوتی و پیوست‌های آن برای همیشه حذف خواهد شد.`,
    confirmText: 'حذف جلسه',
    danger: true
  });
  if (!confirmed) return false;
  await DB.deleteSessionCascade(session.id);
  showToast('جلسه حذف شد', 'success');
  return true;
}

export function renderSessionRow(session) {
  return el('div', { class: 'session-row', 'data-session-id': session.id }, [
    el('div', { class: 'session-row-main' }, [
      el('span', { class: 'session-number' }, `جلسهٔ ${toPersianDigits(session.sessionNumber)}`),
      el('h4', {}, session.title),
      el('span', { class: 'session-date' }, session.date)
    ]),
    el('div', { class: 'session-row-badges' }, [
      session.hasAudio ? el('span', { class: 'badge badge--audio', title: 'دارای ضبط صدا' }, '🎙️') : null,
      el('span', { class: 'badge badge--updated' }, formatUpdated(session.updatedAt))
    ])
  ]);
}

function formatUpdated(iso) {
  try {
    const d = new Date(iso);
    return toPersianDigits(`${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`);
  } catch (e) {
    return '';
  }
}
