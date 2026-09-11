// app.js — bootstraps the application, handles view routing and wires all modules together.

import DB from './db.js';
import { el, showToast, confirmDialog, openModal, setOnlineStatus } from './ui.js';
import { initTheme, toggleTheme } from './theme.js';
import * as Courses from './courses.js';
import * as Sessions from './sessions.js';
import { SessionNotesController } from './notes.js';
import { SessionRecorder, isRecordingSupported, deleteSessionRecording, RecorderError } from './recorder.js';
import * as Attachments from './attachments.js';
import * as Backup from './backup.js';
import { searchAll } from './search.js';
import { requestPersistence, estimateStorage, storageBreakdown, sortItems, formatBytes } from './storage.js';
import { formatDuration, toPersianDigits, sanitizeFilename, extensionForMime, nowISO } from './utils.js';

const viewRoot = document.getElementById('view-root');
let currentSessionController = null; // SessionNotesController, so we can flush on navigation
let currentRecorder = null;

// ---------- Routing ----------

const routes = {
  dashboard: renderDashboard,
  course: renderCourseView,
  session: renderSessionView,
  backup: renderBackupView,
  storage: renderStorageView,
  settings: renderSettingsView
};

let suppressNextHashChange = false;

async function navigate(routeName, params = {}) {
  if (currentSessionController) {
    await currentSessionController.flush();
    currentSessionController = null;
  }
  if (currentRecorder && currentRecorder.state !== 'idle' && currentRecorder.state !== 'stopped') {
    showToast('ابتدا ضبط جاری را متوقف کنید', 'error');
    return;
  }
  currentRecorder = null;

  const targetHash = `#${routeName}${params.id ? '/' + params.id : ''}${params.sub ? '/' + params.sub : ''}`;
  if (window.location.hash !== targetHash) {
    suppressNextHashChange = true;
    window.location.hash = targetHash;
  }

  await renderView(routeName, params);
}

async function renderView(routeName, params) {
  viewRoot.innerHTML = '';
  viewRoot.classList.add('view-loading');
  try {
    await (routes[routeName] || routes.dashboard)(viewRoot, params);
  } finally {
    viewRoot.classList.remove('view-loading');
  }
  updateActiveNav(routeName);
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function updateActiveNav(routeName) {
  document.querySelectorAll('.bottom-nav-btn').forEach((btn) => {
    btn.classList.toggle('bottom-nav-btn--active', btn.dataset.nav === routeName);
  });
}

function parseHash() {
  const hash = window.location.hash.replace(/^#/, '');
  const [routeName, id, sub] = hash.split('/');
  return { routeName: routeName || 'dashboard', id, sub };
}

// ---------- Dashboard ----------

async function renderDashboard(root) {
  const [counts, courses] = await Promise.all([DB.counts(), Courses.getAllCoursesWithStats()]);
  const estimate = await estimateStorage();

  root.appendChild(el('section', { class: 'dashboard-hero' }, [
    el('div', { class: 'stat-grid' }, [
      statCard(toPersianDigits(counts.courses), 'درس'),
      statCard(toPersianDigits(counts.sessions), 'جلسه'),
      statCard(toPersianDigits(counts.recordings), 'ضبط صوتی'),
      statCard(estimate.supported ? formatBytes(estimate.usage) : '—', 'فضای مصرفی')
    ])
  ]));

  const courseListHeader = el('div', { class: 'section-header' }, [
    el('h2', {}, 'درس‌های من'),
    el('button', { type: 'button', class: 'btn btn--primary', id: 'add-course-btn' }, '+ افزودن درس')
  ]);
  root.appendChild(courseListHeader);

  const listEl = el('div', { class: 'course-list' });
  if (courses.length === 0) {
    listEl.appendChild(el('div', { class: 'empty-state' }, [
      el('p', {}, 'هنوز درسی اضافه نکرده‌اید.'),
      el('p', { class: 'empty-state-sub' }, 'برای شروع، نام اولین درس دانشگاهی خود را وارد کنید.')
    ]));
  } else {
    courses.forEach((course) => listEl.appendChild(Courses.renderCourseCard(course)));
  }
  root.appendChild(listEl);

  document.getElementById('add-course-btn').addEventListener('click', async () => {
    const course = await Courses.openCourseForm();
    if (course) navigate('dashboard');
  });

  listEl.addEventListener('click', async (e) => {
    const card = e.target.closest('.course-card');
    if (!card) return;
    const courseId = card.dataset.courseId;
    if (e.target.closest('[data-action="edit-course"]')) {
      const course = await DB.getCourse(courseId);
      const updated = await Courses.openCourseForm(course);
      if (updated) navigate('dashboard');
      return;
    }
    if (e.target.closest('[data-action="delete-course"]')) {
      const course = await DB.getCourse(courseId);
      const deleted = await Courses.deleteCourseWithConfirm(course);
      if (deleted) navigate('dashboard');
      return;
    }
    navigate('course', { id: courseId });
  });
}

function statCard(value, label) {
  return el('div', { class: 'stat-card' }, [
    el('div', { class: 'stat-value' }, value),
    el('div', { class: 'stat-label' }, label)
  ]);
}

// ---------- Course view (session list) ----------

async function renderCourseView(root, { id }) {
  const course = await DB.getCourse(id);
  if (!course) { showToast('درس یافت نشد', 'error'); navigate('dashboard'); return; }

  root.appendChild(el('button', { type: 'button', class: 'back-btn', onclick: () => navigate('dashboard') }, '→ بازگشت به داشبورد'));

  root.appendChild(el('section', { class: 'course-header', style: `--course-color:${course.color}` }, [
    el('span', { class: 'course-header-icon' }, course.icon),
    el('div', {}, [
      el('h2', {}, course.name),
      course.professor ? el('p', {}, `استاد: ${course.professor}`) : null,
      course.description ? el('p', { class: 'course-header-desc' }, course.description) : null
    ])
  ]));

  const header = el('div', { class: 'section-header' }, [
    el('h3', {}, 'جلسات'),
    el('button', { type: 'button', class: 'btn btn--primary', id: 'add-session-btn' }, '+ جلسهٔ جدید')
  ]);
  root.appendChild(header);

  const sessions = await Sessions.getSessionsForCourse(id);
  const listEl = el('div', { class: 'session-list' });
  if (sessions.length === 0) {
    listEl.appendChild(el('div', { class: 'empty-state' }, [
      el('p', {}, 'هنوز جلسه‌ای برای این درس ثبت نشده.'),
      el('p', { class: 'empty-state-sub' }, 'با شروع کلاس، یک جلسهٔ جدید بسازید و یادداشت‌برداری را آغاز کنید.')
    ]));
  } else {
    sessions.forEach((session) => listEl.appendChild(Sessions.renderSessionRow(session)));
  }
  root.appendChild(listEl);

  document.getElementById('add-session-btn').addEventListener('click', async () => {
    const suggested = await Sessions.nextSessionNumber(id);
    const session = await Sessions.openSessionForm(id, null, suggested);
    if (session) navigate('session', { id: session.id });
  });

  listEl.addEventListener('click', async (e) => {
    const row = e.target.closest('.session-row');
    if (!row) return;
    navigate('session', { id: row.dataset.sessionId });
  });
}

// ---------- Session view (notes + recorder + attachments) ----------

async function renderSessionView(root, { id }) {
  const session = await DB.getSession(id);
  if (!session) { showToast('جلسه یافت نشد', 'error'); navigate('dashboard'); return; }
  const course = await DB.getCourse(session.courseId);

  root.appendChild(el('button', { type: 'button', class: 'back-btn', onclick: () => navigate('course', { id: session.courseId }) },
    `→ بازگشت به ${course ? course.name : 'درس'}`));

  const titleRow = el('div', { class: 'session-title-row' }, [
    el('div', {}, [
      el('h2', {}, `جلسهٔ ${toPersianDigits(session.sessionNumber)} — ${session.title}`),
      el('p', { class: 'session-title-date' }, session.date)
    ]),
    el('div', { class: 'session-title-actions' }, [
      el('button', { type: 'button', class: 'icon-btn', id: 'edit-session-btn', title: 'ویرایش اطلاعات جلسه' }, '✏️'),
      el('button', { type: 'button', class: 'icon-btn', id: 'delete-session-btn', title: 'حذف جلسه' }, '🗑️')
    ])
  ]);
  root.appendChild(titleRow);
  if (session.description) root.appendChild(el('p', { class: 'session-description' }, session.description));

  titleRow.querySelector('#edit-session-btn').addEventListener('click', async () => {
    const updated = await Sessions.openSessionForm(session.courseId, session);
    if (updated) navigate('session', { id: session.id });
  });
  titleRow.querySelector('#delete-session-btn').addEventListener('click', async () => {
    const deleted = await Sessions.deleteSessionWithConfirm(session);
    if (deleted) navigate('course', { id: session.courseId });
  });

  // --- Notes editor ---
  root.appendChild(el('h3', { class: 'subsection-title' }, '📝 یادداشت‌ها'));
  const editorWrap = el('div', {});
  const saveStatus = el('span', { class: 'save-status' }, '✓ ذخیره شد');
  root.appendChild(el('div', { class: 'notes-panel' }, [editorWrap, saveStatus]));
  currentSessionController = new SessionNotesController(editorWrap, saveStatus, session);

  // --- Recorder ---
  root.appendChild(el('h3', { class: 'subsection-title' }, '🎙️ ضبط صدای کلاس'));
  const recorderPanel = el('div', { class: 'recorder-panel' });
  root.appendChild(recorderPanel);
  await renderRecorderPanel(recorderPanel, session.id);

  // --- Attachments ---
  root.appendChild(el('h3', { class: 'subsection-title' }, '📎 پیوست‌ها'));
  const attachmentsPanel = el('div', { class: 'attachments-panel' });
  root.appendChild(attachmentsPanel);
  await renderAttachmentsPanel(attachmentsPanel, session.id);
}

async function renderRecorderPanel(panel, sessionId) {
  panel.innerHTML = '';
  const existingRecording = await DB.getRecordingBySession(sessionId);

  if (!isRecordingSupported()) {
    panel.appendChild(el('div', { class: 'notice notice--warning' }, 'ضبط صدا در این مرورگر پشتیبانی نمی‌شود. سایر بخش‌های برنامه (یادداشت‌ها، پیوست‌ها) بدون مشکل کار می‌کنند.'));
    return;
  }

  if (existingRecording && (!currentRecorder || currentRecorder.state === 'idle')) {
    panel.appendChild(renderExistingRecording(existingRecording, sessionId, panel));
    return;
  }

  currentRecorder = currentRecorder && currentRecorder.sessionId === sessionId ? currentRecorder : new SessionRecorder(sessionId);
  const recorder = currentRecorder;

  const statusText = el('span', { class: 'recorder-status' }, 'برای شروع ضبط، دکمه را بزنید');
  const timerText = el('span', { class: 'recorder-timer' }, '۰۰:۰۰');
  const startBtn = el('button', { type: 'button', class: 'record-btn', title: 'شروع ضبط' }, '🎙️');
  const pauseBtn = el('button', { type: 'button', class: 'btn btn--ghost', hidden: 'true' }, '⏸️ توقف موقت');
  const resumeBtn = el('button', { type: 'button', class: 'btn btn--ghost', hidden: 'true' }, '▶️ ادامه');
  const stopBtn = el('button', { type: 'button', class: 'btn btn--danger', hidden: 'true' }, '⏹️ پایان و ذخیره');

  panel.append(
    el('div', { class: 'recorder-display' }, [timerText, statusText]),
    el('div', { class: 'recorder-controls' }, [startBtn, pauseBtn, resumeBtn, stopBtn])
  );

  recorder.onTick = (seconds) => { timerText.textContent = formatDuration(seconds); };
  recorder.onStateChange = (state) => {
    if (state === 'requesting') {
      statusText.textContent = 'در حال درخواست اجازهٔ میکروفون…';
    } else if (state === 'recording') {
      statusText.textContent = 'در حال ضبط…';
      startBtn.hidden = true; pauseBtn.hidden = false; stopBtn.hidden = false; resumeBtn.hidden = true;
      startBtn.classList.remove('record-btn--paused');
      panel.classList.add('recorder-panel--active');
    } else if (state === 'paused') {
      statusText.textContent = 'ضبط موقتاً متوقف شد';
      pauseBtn.hidden = true; resumeBtn.hidden = false;
    } else if (state === 'idle' || state === 'stopped') {
      panel.classList.remove('recorder-panel--active');
    }
  };

  startBtn.addEventListener('click', async () => {
    try {
      await recorder.start();
    } catch (err) {
      const message = err instanceof RecorderError ? err.message : 'خطای غیرمنتظره در شروع ضبط.';
      showToast(message, 'error', 5000);
    }
  });

  pauseBtn.addEventListener('click', () => recorder.pause());
  resumeBtn.addEventListener('click', () => recorder.resume());

  stopBtn.addEventListener('click', async () => {
    try {
      await recorder.stop();
      showToast('ضبط با موفقیت ذخیره شد', 'success');
      currentRecorder = null;
      await renderRecorderPanel(panel, sessionId);
    } catch (err) {
      showToast('ذخیرهٔ ضبط با خطا مواجه شد. فضای ذخیره‌سازی دستگاه را بررسی کنید.', 'error', 5000);
    }
  });
}

function renderExistingRecording(recording, sessionId, panel) {
  const audioURL = URL.createObjectURL(recording.blob);
  const audioEl = el('audio', { controls: 'true', src: audioURL, style: 'width:100%' });

  const downloadBtn = el('button', { type: 'button', class: 'btn btn--ghost' }, '⬇️ دانلود');
  const deleteBtn = el('button', { type: 'button', class: 'btn btn--danger' }, '🗑️ حذف ضبط');
  const rerecordBtn = el('button', { type: 'button', class: 'btn btn--ghost' }, '🎙️ ضبط مجدد');

  downloadBtn.addEventListener('click', async () => {
    const session = await DB.getSession(sessionId);
    const course = session ? await DB.getCourse(session.courseId) : null;
    const parts = [course ? sanitizeFilename(course.name) : 'درس', session ? `جلسه-${toPersianDigits(session.sessionNumber)}` : '', session ? session.date.replace(/\//g, '-') : ''];
    const filename = `${sanitizeFilename(parts.filter(Boolean).join('-'))}.${extensionForMime(recording.mimeType)}`;
    const a = document.createElement('a');
    a.href = audioURL; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
  });

  deleteBtn.addEventListener('click', async () => {
    const confirmed = await confirmDialog({
      title: 'حذف ضبط صدا',
      message: 'فقط فایل صوتی این جلسه حذف می‌شود. یادداشت‌های متنی و اطلاعات جلسه دست‌نخورده باقی می‌مانند.',
      confirmText: 'حذف ضبط', danger: true
    });
    if (!confirmed) return;
    await deleteSessionRecording(sessionId);
    showToast('ضبط صدا حذف شد', 'success');
    URL.revokeObjectURL(audioURL);
    await renderRecorderPanel(panel, sessionId);
  });

  rerecordBtn.addEventListener('click', async () => {
    const confirmed = await confirmDialog({
      title: 'ضبط مجدد',
      message: 'ضبط فعلی جایگزین خواهد شد. آیا مطمئن هستید؟',
      confirmText: 'بله، ضبط جدید', danger: true
    });
    if (!confirmed) return;
    await deleteSessionRecording(sessionId);
    URL.revokeObjectURL(audioURL);
    currentRecorder = new SessionRecorder(sessionId);
    await renderRecorderPanel(panel, sessionId);
  });

  return el('div', { class: 'recording-player' }, [
    audioEl,
    el('div', { class: 'recording-meta' }, [
      el('span', {}, `⏱️ ${formatDuration(recording.durationSeconds)}`),
      el('span', {}, `💾 ${formatBytes(recording.sizeBytes)}`)
    ]),
    el('div', { class: 'recording-actions' }, [downloadBtn, deleteBtn, rerecordBtn])
  ]);
}

async function renderAttachmentsPanel(panel, sessionId) {
  panel.innerHTML = '';
  const attachments = await Attachments.listAttachments(sessionId);

  const addRow = el('div', { class: 'attachment-add-row' }, [
    el('button', { type: 'button', class: 'btn btn--ghost', id: 'take-photo-btn' }, '📷 گرفتن عکس'),
    el('button', { type: 'button', class: 'btn btn--ghost', id: 'choose-gallery-btn' }, '🖼️ انتخاب از گالری'),
    el('button', { type: 'button', class: 'btn btn--ghost', id: 'choose-doc-btn' }, '📄 افزودن فایل / PDF')
  ]);
  panel.appendChild(addRow);

  const listEl = el('div', { class: 'attachment-list' });
  if (attachments.length === 0) {
    listEl.appendChild(el('p', { class: 'empty-state-sub' }, 'هنوز پیوستی برای این جلسه اضافه نشده.'));
  } else {
    attachments.forEach((att) => listEl.appendChild(renderAttachmentRow(att, sessionId, panel)));
  }
  panel.appendChild(listEl);

  document.getElementById('take-photo-btn').addEventListener('click', async () => {
    const files = await Attachments.takePhoto();
    await handleNewAttachments(files, sessionId, panel);
  });
  document.getElementById('choose-gallery-btn').addEventListener('click', async () => {
    const files = await Attachments.chooseFromGallery();
    await handleNewAttachments(files, sessionId, panel);
  });
  document.getElementById('choose-doc-btn').addEventListener('click', async () => {
    const files = await Attachments.chooseDocument();
    await handleNewAttachments(files, sessionId, panel);
  });
}

async function handleNewAttachments(files, sessionId, panel) {
  if (!files || files.length === 0) return;
  const { saved, errors } = await Attachments.saveAttachments(sessionId, files);
  if (saved.length) showToast(`${toPersianDigits(saved.length)} پیوست اضافه شد`, 'success');
  errors.forEach((e) => showToast(e.message, 'error', 5000));
  await renderAttachmentsPanel(panel, sessionId);
}

function renderAttachmentRow(att, sessionId, panel) {
  const url = Attachments.attachmentObjectURL(att);
  const row = el('div', { class: 'attachment-row' }, [
    el('span', { class: 'attachment-icon' }, Attachments.iconForAttachmentType(att.type)),
    el('div', { class: 'attachment-info' }, [
      el('span', { class: 'attachment-name' }, att.filename),
      el('span', { class: 'attachment-meta' }, formatBytes(att.sizeBytes))
    ]),
    el('div', { class: 'attachment-actions' }, [
      el('a', { href: url, download: att.filename, class: 'icon-btn', title: 'دانلود/باز کردن' }, '⬇️'),
      el('button', { type: 'button', class: 'icon-btn', title: 'حذف' }, '🗑️')
    ])
  ]);
  row.querySelector('.attachment-actions button').addEventListener('click', async () => {
    const confirmed = await confirmDialog({ title: 'حذف پیوست', message: `فایل «${att.filename}» حذف شود؟`, confirmText: 'حذف', danger: true });
    if (!confirmed) return;
    await Attachments.deleteAttachment(att.id);
    URL.revokeObjectURL(url);
    showToast('پیوست حذف شد', 'success');
    await renderAttachmentsPanel(panel, sessionId);
  });
  return row;
}

// ---------- Backup / Restore view ----------

async function renderBackupView(root) {
  root.appendChild(el('h2', {}, '💾 پشتیبان‌گیری و بازیابی'));
  root.appendChild(el('p', { class: 'section-desc' }, 'چون این برنامه هیچ سروری ندارد، تنها راه انتقال اطلاعات بین دستگاه‌ها یا محافظت در برابر از دست رفتن داده، تهیهٔ فایل پشتیبان است.'));

  const fullBtn = el('button', { type: 'button', class: 'btn btn--primary btn--block' }, '📦 تهیهٔ پشتیبان کامل (شامل صداها)');
  const notesBtn = el('button', { type: 'button', class: 'btn btn--ghost btn--block' }, '📝 تهیهٔ پشتیبان فقط یادداشت‌ها (بدون صدا)');
  root.appendChild(el('div', { class: 'backup-actions' }, [fullBtn, notesBtn]));

  fullBtn.addEventListener('click', () => performBackup('full'));
  notesBtn.addEventListener('click', () => performBackup('notes-only'));

  root.appendChild(el('h3', { class: 'subsection-title' }, '📂 بازیابی از فایل پشتیبان'));
  root.appendChild(el('p', { class: 'notice notice--warning' }, 'هشدار: بازیابی با حالت «جایگزینی» تمام اطلاعات فعلی برنامه را پاک کرده و با محتوای فایل پشتیبان جایگزین می‌کند. این عملیات قابل بازگشت نیست.'));

  const fileInput = el('input', { type: 'file', accept: '.json,application/json', id: 'restore-file-input' });
  const modeSelect = el('select', { id: 'restore-mode-select' }, [
    el('option', { value: 'replace' }, 'جایگزینی کامل (پیشنهادی)'),
    el('option', { value: 'merge' }, 'ادغام با اطلاعات فعلی')
  ]);
  const restoreBtn = el('button', { type: 'button', class: 'btn btn--danger' }, 'بازیابی از فایل');

  root.appendChild(el('div', { class: 'restore-form' }, [
    el('label', {}, ['انتخاب فایل پشتیبان (JSON)', fileInput]),
    el('label', {}, ['روش بازیابی', modeSelect]),
    restoreBtn
  ]));

  restoreBtn.addEventListener('click', async () => {
    const file = fileInput.files[0];
    if (!file) { showToast('ابتدا یک فایل پشتیبان انتخاب کنید', 'error'); return; }
    try {
      const data = await Backup.readFileAsJSON(file);
      const { valid, errors } = Backup.validateBackup(data);
      if (!valid) { showToast(errors.join(' '), 'error', 6000); return; }
      const mode = modeSelect.value;
      const confirmed = await confirmDialog({
        title: 'تأیید بازیابی',
        message: mode === 'replace'
          ? 'تمام اطلاعات فعلی برنامه پاک شده و با فایل پشتیبان جایگزین می‌شود. ادامه می‌دهید؟'
          : 'اطلاعات فایل پشتیبان با اطلاعات فعلی ادغام می‌شود. ادامه می‌دهید؟',
        confirmText: 'بله، بازیابی کن', danger: true
      });
      if (!confirmed) return;
      const counts = await Backup.restoreBackup(data, mode);
      showToast(`بازیابی موفق: ${toPersianDigits(counts.courses)} درس، ${toPersianDigits(counts.sessions)} جلسه`, 'success', 5000);
      navigate('dashboard');
    } catch (err) {
      showToast(err.message || 'بازیابی ناموفق بود.', 'error', 6000);
    }
  });
}

async function performBackup(type) {
  showToast('در حال آماده‌سازی فایل پشتیبان…', 'info', 2000);
  try {
    const { approxBytes } = await Backup.downloadBackup(type);
    if (approxBytes > 25 * 1024 * 1024) {
      showToast(`فایل پشتیبان حجیم است (حدود ${formatBytes(approxBytes)}) زیرا صداها به‌صورت Base64 ذخیره می‌شوند. نگهداری آن ممکن است زمان‌بر باشد.`, 'info', 7000);
    } else {
      showToast('فایل پشتیبان آماده و دانلود شد', 'success');
    }
  } catch (err) {
    showToast('تهیهٔ فایل پشتیبان با خطا مواجه شد.', 'error', 5000);
  }
}

// ---------- Storage management view ----------

async function renderStorageView(root) {
  root.appendChild(el('h2', {}, '📊 فضای ذخیره‌سازی'));
  const estimate = await estimateStorage();
  const breakdown = await storageBreakdown();

  if (estimate.supported) {
    const pct = estimate.quota ? Math.min(100, Math.round((estimate.usage / estimate.quota) * 100)) : 0;
    root.appendChild(el('div', { class: 'storage-summary' }, [
      el('p', {}, `فضای مصرفی: ${formatBytes(estimate.usage)} از ${formatBytes(estimate.quota)} (${toPersianDigits(pct)}٪)`),
      el('div', { class: 'storage-bar' }, [el('div', { class: 'storage-bar-fill', style: `width:${pct}%` })])
    ]));
  } else {
    root.appendChild(el('p', { class: 'notice' }, 'محاسبهٔ دقیق فضای مصرفی در این مرورگر پشتیبانی نمی‌شود.'));
  }

  root.appendChild(el('p', { class: 'section-desc' }, 'حجم مرورگرها برای ذخیره‌سازی محدود است و ممکن است بین دستگاه‌ها متفاوت باشد. برای جلوگیری از پر شدن فضا، به‌طور دوره‌ای پشتیبان بگیرید و ضبط‌های قدیمی را که دیگر نیاز ندارید حذف کنید.'));

  root.appendChild(el('div', { class: 'storage-breakdown' }, [
    breakdownRow('🎙️ ضبط‌های صوتی', breakdown.recordingsBytes),
    breakdownRow('📎 پیوست‌ها', breakdown.attachmentsBytes),
    breakdownRow('📝 یادداشت‌ها و اطلاعات', breakdown.notesBytes)
  ]));

  const sortRow = el('div', { class: 'section-header' }, [
    el('h3', {}, 'بزرگ‌ترین فایل‌ها'),
    el('select', { id: 'storage-sort-select' }, [
      el('option', { value: 'size' }, 'مرتب‌سازی بر اساس حجم'),
      el('option', { value: 'date' }, 'مرتب‌سازی بر اساس تاریخ')
    ])
  ]);
  root.appendChild(sortRow);

  const listEl = el('div', { class: 'storage-item-list' });
  root.appendChild(listEl);

  function renderList(by) {
    listEl.innerHTML = '';
    const items = sortItems(breakdown.items, by).slice(0, 30);
    if (items.length === 0) {
      listEl.appendChild(el('p', { class: 'empty-state-sub' }, 'هنوز فایلی ذخیره نشده.'));
      return;
    }
    items.forEach((item) => {
      listEl.appendChild(el('div', { class: 'storage-item-row' }, [
        el('span', { class: 'storage-item-icon' }, item.kind === 'recording' ? '🎙️' : '📎'),
        el('span', { class: 'storage-item-label' }, item.label),
        el('span', { class: 'storage-item-size' }, formatBytes(item.sizeBytes)),
        el('button', {
          type: 'button', class: 'icon-btn', title: 'حذف', onclick: async () => {
            const confirmed = await confirmDialog({ title: 'حذف فایل', message: `«${item.label}» حذف شود؟`, confirmText: 'حذف', danger: true });
            if (!confirmed) return;
            if (item.kind === 'recording') await deleteSessionRecording(item.sessionId);
            else await Attachments.deleteAttachment(item.id);
            showToast('حذف شد', 'success');
            navigate('storage');
          }
        }, '🗑️')
      ]));
    });
  }
  renderList('size');
  document.getElementById('storage-sort-select').addEventListener('change', (e) => renderList(e.target.value));
}

function breakdownRow(label, bytes) {
  return el('div', { class: 'breakdown-row' }, [
    el('span', {}, label),
    el('strong', {}, formatBytes(bytes))
  ]);
}

// ---------- Settings view ----------

async function renderSettingsView(root) {
  root.appendChild(el('h2', {}, '⚙️ تنظیمات'));

  const themeRow = el('div', { class: 'settings-row' }, [
    el('span', {}, 'پوستهٔ برنامه'),
    el('button', { type: 'button', class: 'btn btn--ghost', id: 'settings-theme-btn' }, 'تغییر روشن/تاریک')
  ]);
  root.appendChild(themeRow);
  document.getElementById('settings-theme-btn').addEventListener('click', () => toggleTheme());

  const persistRow = el('div', { class: 'settings-row' }, [
    el('span', {}, 'ذخیره‌سازی پایدار'),
    el('button', { type: 'button', class: 'btn btn--ghost', id: 'persist-btn' }, 'درخواست ذخیره‌سازی پایدار')
  ]);
  root.appendChild(persistRow);
  document.getElementById('persist-btn').addEventListener('click', async () => {
    const granted = await requestPersistence();
    showToast(granted ? 'ذخیره‌سازی پایدار فعال شد' : 'این مرورگر این قابلیت را پشتیبانی نمی‌کند یا رد شد', granted ? 'success' : 'info');
  });

  root.appendChild(el('div', { class: 'settings-row' }, [
    el('span', {}, 'دربارهٔ برنامه'),
    el('p', { class: 'empty-state-sub' }, 'دفتر جزوه یک دفترچهٔ دیجیتال کاملاً محلی است. هیچ داده‌ای از دستگاه شما خارج نمی‌شود.')
  ]));
}

// ---------- Search ----------

function initSearch() {
  const toggleBtn = document.getElementById('search-toggle');
  const closeBtn = document.getElementById('search-close');
  const bar = document.getElementById('search-bar');
  const input = document.getElementById('search-input');
  const resultsEl = document.getElementById('search-results');

  const openSearch = () => {
    bar.classList.remove('search-bar--hidden');
    input.focus();
  };
  const closeSearch = () => {
    bar.classList.add('search-bar--hidden');
    resultsEl.classList.add('search-results--hidden');
    resultsEl.innerHTML = '';
    input.value = '';
  };

  toggleBtn.addEventListener('click', openSearch);
  closeBtn.addEventListener('click', closeSearch);

  let debounceTimer;
  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      const q = input.value.trim();
      if (!q) { resultsEl.classList.add('search-results--hidden'); resultsEl.innerHTML = ''; return; }
      const results = await searchAll(q);
      renderSearchResults(resultsEl, results);
    }, 250);
  });
}

function renderSearchResults(container, results) {
  container.innerHTML = '';
  container.classList.remove('search-results--hidden');
  if (results.length === 0) {
    container.appendChild(el('p', { class: 'empty-state-sub' }, 'نتیجه‌ای یافت نشد.'));
    return;
  }
  results.slice(0, 30).forEach((r) => {
    const row = el('div', { class: 'search-result-row' }, [
      el('span', { class: 'search-result-type' }, r.type === 'course' ? '📘 درس' : '📝 جلسه'),
      el('strong', {}, r.type === 'course' ? r.courseName : `${r.courseName} — ${r.sessionTitle}`),
      r.context ? el('p', { class: 'search-result-context' }, r.context) : null
    ]);
    row.addEventListener('click', () => {
      document.getElementById('search-close').click();
      if (r.type === 'course') navigate('course', { id: r.courseId });
      else navigate('session', { id: r.sessionId });
    });
    container.appendChild(row);
  });
}

// ---------- Online/offline status ----------

function initConnectionStatus() {
  setOnlineStatus(navigator.onLine);
  window.addEventListener('online', () => setOnlineStatus(true));
  window.addEventListener('offline', () => setOnlineStatus(false));
}

// ---------- Bottom nav ----------

function initBottomNav() {
  document.querySelectorAll('.bottom-nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => navigate(btn.dataset.nav));
  });
}

// ---------- Theme toggle button ----------

function initThemeToggle() {
  document.getElementById('theme-toggle').addEventListener('click', () => toggleTheme());
}

// ---------- Service worker registration + update flow ----------

function initServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('sw.js');
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateBanner(newWorker);
          }
        });
      });
    } catch (err) {
      console.warn('ثبت Service Worker ناموفق بود:', err);
    }
  });

  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
}

function showUpdateBanner(worker) {
  const banner = document.getElementById('update-banner');
  banner.classList.remove('update-banner--hidden');
  document.getElementById('update-reload-btn').addEventListener('click', () => {
    worker.postMessage({ type: 'SKIP_WAITING' });
  }, { once: true });
}

// ---------- Boot ----------

async function boot() {
  await initTheme();
  await requestPersistence();
  initConnectionStatus();
  initBottomNav();
  initThemeToggle();
  initSearch();
  initServiceWorker();

  window.addEventListener('hashchange', async () => {
    if (suppressNextHashChange) { suppressNextHashChange = false; return; }
    // Reached via back/forward navigation or a manually edited URL.
    if (currentSessionController) { await currentSessionController.flush(); currentSessionController = null; }
    currentRecorder = null;
    const { routeName, id, sub } = parseHash();
    await renderView(routeName, { id, sub });
  });

  const { routeName, id, sub } = parseHash();
  await renderView(routeName, { id, sub });
}

// beforeunload safety net: flush pending note changes and warn if a recording is active
window.addEventListener('beforeunload', (e) => {
  if (currentSessionController) currentSessionController.flush();
  if (currentRecorder && currentRecorder.state === 'recording') {
    e.preventDefault();
    e.returnValue = '';
  }
});

boot();
