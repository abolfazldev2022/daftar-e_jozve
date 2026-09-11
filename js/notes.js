// notes.js — ties the NotesEditor to IndexedDB with debounced autosave + status display

import DB from './db.js';
import { NotesEditor } from './editor.js';
import { debounce, htmlToPlainText, nowISO } from './utils.js';

export class SessionNotesController {
  /**
   * @param {HTMLElement} editorContainer
   * @param {HTMLElement} statusEl - shows "در حال ذخیره..." / "✓ ذخیره شد"
   * @param {object} session - the session record being edited
   */
  constructor(editorContainer, statusEl, session) {
    this.statusEl = statusEl;
    this.session = session;
    this.saveDebounced = debounce(() => this._save(), 600);
    this.editor = new NotesEditor(editorContainer, (html) => this._onChange(html));
    this.editor.setContent(session.notesHTML || '');
    this._pendingHTML = session.notesHTML || '';
  }

  _onChange(html) {
    this._pendingHTML = html;
    this._setStatus('saving');
    this.saveDebounced();
  }

  async _save() {
    try {
      this.session.notesHTML = this._pendingHTML;
      this.session.notesPlainText = htmlToPlainText(this._pendingHTML);
      this.session.updatedAt = nowISO();
      await DB.putSession(this.session);
      this._setStatus('saved');
    } catch (err) {
      console.error('خطا در ذخیره یادداشت:', err);
      this._setStatus('error');
    }
  }

  /** Forces an immediate save (e.g. before navigating away). */
  async flush() {
    await this._save();
  }

  _setStatus(state) {
    if (!this.statusEl) return;
    if (state === 'saving') {
      this.statusEl.textContent = 'در حال ذخیره…';
      this.statusEl.className = 'save-status save-status--saving';
    } else if (state === 'saved') {
      this.statusEl.textContent = '✓ ذخیره شد';
      this.statusEl.className = 'save-status save-status--saved';
    } else {
      this.statusEl.textContent = '⚠️ ذخیره ناموفق بود — دوباره تلاش می‌شود';
      this.statusEl.className = 'save-status save-status--error';
    }
  }

  destroy() {
    this.editor.destroy();
  }
}
