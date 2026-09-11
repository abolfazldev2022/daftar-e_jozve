// courses.js — course CRUD + associated UI (forms, list rendering)

import DB from './db.js';
import { uuid, nowISO, escapeHTML } from './utils.js';
import { el, openModal, confirmDialog, showToast } from './ui.js';

export const COURSE_COLORS = ['#2F6F5E', '#3A5A8C', '#B4553B', '#8A6D3B', '#5E4B8B', '#3E7C7C'];
export const COURSE_ICONS = ['📘', '📗', '📙', '📕', '📓', '📔', '📒', '🧪', '🧮', '⚖️', '🕌', '🏃'];

export async function getAllCoursesWithStats() {
  const courses = await DB.getAllCourses();
  const sessions = await DB.getAllSessions();
  return courses
    .map((course) => ({
      ...course,
      sessionCount: sessions.filter((s) => s.courseId === course.id).length
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fa'));
}

/** Opens the create/edit course modal. Returns a Promise<course|null>. */
export function openCourseForm(existingCourse = null) {
  return new Promise((resolve) => {
    const body = el('form', { class: 'form' });
    const nameInput = el('input', { type: 'text', required: 'true', maxlength: '80', value: existingCourse ? existingCourse.name : '' });
    const profInput = el('input', { type: 'text', maxlength: '80', value: existingCourse ? (existingCourse.professor || '') : '' });
    const descInput = el('textarea', { rows: '3', maxlength: '300' }, existingCourse ? (existingCourse.description || '') : '');

    let selectedColor = existingCourse ? existingCourse.color : COURSE_COLORS[Math.floor(Math.random() * COURSE_COLORS.length)];
    let selectedIcon = existingCourse ? existingCourse.icon : COURSE_ICONS[Math.floor(Math.random() * COURSE_ICONS.length)];

    const colorRow = el('div', { class: 'swatch-row' });
    COURSE_COLORS.forEach((color) => {
      const swatch = el('button', {
        type: 'button', class: 'swatch' + (color === selectedColor ? ' swatch--selected' : ''),
        style: `background:${color}`,
        onclick: () => {
          selectedColor = color;
          colorRow.querySelectorAll('.swatch').forEach((s) => s.classList.remove('swatch--selected'));
          swatch.classList.add('swatch--selected');
        }
      });
      colorRow.appendChild(swatch);
    });

    const iconRow = el('div', { class: 'icon-row' });
    COURSE_ICONS.forEach((icon) => {
      const btn = el('button', {
        type: 'button', class: 'icon-choice' + (icon === selectedIcon ? ' icon-choice--selected' : ''),
        onclick: () => {
          selectedIcon = icon;
          iconRow.querySelectorAll('.icon-choice').forEach((b) => b.classList.remove('icon-choice--selected'));
          btn.classList.add('icon-choice--selected');
        }
      }, icon);
      iconRow.appendChild(btn);
    });

    body.append(
      el('label', {}, ['نام درس *', nameInput]),
      el('label', {}, ['نام استاد', profInput]),
      el('label', {}, ['توضیحات', descInput]),
      el('label', {}, 'رنگ نشان درس'),
      colorRow,
      el('label', {}, 'آیکون درس'),
      iconRow,
      el('div', { class: 'form-actions' }, [
        el('button', { type: 'submit', class: 'btn btn--primary' }, existingCourse ? 'ذخیرهٔ تغییرات' : 'افزودن درس')
      ])
    );

    const modal = openModal({ title: existingCourse ? 'ویرایش درس' : 'درس جدید', bodyEl: body });

    body.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = nameInput.value.trim();
      if (!name) { showToast('نام درس الزامی است', 'error'); return; }
      const course = existingCourse
        ? { ...existingCourse, name, professor: profInput.value.trim(), description: descInput.value.trim(), color: selectedColor, icon: selectedIcon, updatedAt: nowISO() }
        : { id: uuid(), name, professor: profInput.value.trim(), description: descInput.value.trim(), color: selectedColor, icon: selectedIcon, createdAt: nowISO(), updatedAt: nowISO() };
      await DB.putCourse(course);
      modal.close();
      resolve(course);
    });

    modal.overlay.addEventListener('click', (e) => {
      if (e.target === modal.overlay) resolve(null);
    });
  });
}

export async function deleteCourseWithConfirm(course) {
  const confirmed = await confirmDialog({
    title: 'حذف درس',
    message: `با حذف «${escapeHTML(course.name)}»، تمام جلسات، یادداشت‌ها، ضبط‌های صوتی و پیوست‌های آن نیز برای همیشه حذف خواهند شد. این عملیات قابل بازگشت نیست.`,
    confirmText: 'حذف درس و همهٔ محتوای آن',
    danger: true
  });
  if (!confirmed) return false;
  await DB.deleteCourseCascade(course.id);
  showToast('درس حذف شد', 'success');
  return true;
}

export function renderCourseCard(course) {
  return el('div', { class: 'course-card', style: `--course-color:${course.color}`, 'data-course-id': course.id }, [
    el('div', { class: 'course-card-icon' }, course.icon),
    el('div', { class: 'course-card-body' }, [
      el('h3', {}, course.name),
      el('p', { class: 'course-card-meta' }, course.professor ? `استاد: ${course.professor}` : 'بدون استاد ثبت‌شده'),
      el('p', { class: 'course-card-count' }, `${toFa(course.sessionCount)} جلسه`)
    ]),
    el('div', { class: 'course-card-actions' }, [
      el('button', { type: 'button', class: 'icon-btn', title: 'ویرایش', 'data-action': 'edit-course' }, '✏️'),
      el('button', { type: 'button', class: 'icon-btn', title: 'حذف', 'data-action': 'delete-course' }, '🗑️')
    ])
  ]);
}

function toFa(n) {
  const map = { '0': '۰', '1': '۱', '2': '۲', '3': '۳', '4': '۴', '5': '۵', '6': '۶', '7': '۷', '8': '۸', '9': '۹' };
  return String(n).replace(/[0-9]/g, (d) => map[d]);
}
