// editor.js — lightweight contenteditable-based rich text editor for Persian notes.
// Handles mixed RTL/LTR text (Persian + English) using `unicode-bidi: plaintext`
// on the editable surface so each paragraph's direction follows its own content,
// rather than forcing the whole block to one direction.

import { sanitizeHTML } from './utils.js';

const HIGHLIGHT_CLASSES = {
  important: 'hl-important',
  tip: 'hl-tip',
  question: 'hl-question',
  reminder: 'hl-reminder'
};

// Font size is implemented as <span style="font-size:...">, NOT the legacy
// <font size> tag execCommand('fontSize', ...) would insert — this keeps the
// output compatible with the sanitizer's SPAN+style allowance (see utils.js).
const FONT_SIZE_MAP = { '2': '0.85em', '3': '1em', '5': '1.5em', '7': '2em' };

export class NotesEditor {
  /**
   * @param {HTMLElement} rootEl - container that will hold the toolbar + editable surface
   * @param {function} onChange - called with the current sanitized HTML whenever content changes
   */
  constructor(rootEl, onChange) {
    this.root = rootEl;
    this.onChange = onChange;
    this.savedRange = null;
    // Tracks the last non-collapsed (or collapsed) selection made INSIDE the
    // editor surface, so that clicking/using a toolbar control — which moves
    // focus away from the surface and can clear window.getSelection() in some
    // browsers — can restore it before applying a command.
    this._onSelectionChange = () => {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && this.surface && this.surface.contains(sel.anchorNode)) {
        this.savedRange = sel.getRangeAt(0).cloneRange();
      }
    };
    document.addEventListener('selectionchange', this._onSelectionChange);
    this._build();
  }

  /** Restores the last selection made in the surface, if any. */
  _restoreSelection() {
    if (!this.savedRange) return;
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(this.savedRange);
  }

  _build() {
    this.root.innerHTML = '';
    this.root.className = 'editor';

    this.toolbar = document.createElement('div');
    this.toolbar.className = 'editor-toolbar';
    this.toolbar.setAttribute('role', 'toolbar');
    this.toolbar.setAttribute('aria-label', 'ابزار قالب‌بندی متن');

    const groups = [
      [
        { cmd: 'bold', label: 'ضخیم', icon: 'B' },
        { cmd: 'italic', label: 'مورب', icon: 'I' },
        { cmd: 'underline', label: 'زیرخط', icon: 'U' }
      ],
      [
        { cmd: 'formatBlock', value: 'H2', label: 'عنوان بزرگ', icon: 'H۱' },
        { cmd: 'formatBlock', value: 'H3', label: 'عنوان کوچک', icon: 'H۲' },
        { cmd: 'formatBlock', value: 'BLOCKQUOTE', label: 'نقل‌قول', icon: '❝' }
      ],
      [
        { cmd: 'insertUnorderedList', label: 'فهرست نقطه‌ای', icon: '•—' },
        { cmd: 'insertOrderedList', label: 'فهرست شماره‌دار', icon: '۱.' }
      ],
      [
        { cmd: 'justifyRight', label: 'راست‌چین', icon: '⇥' },
        { cmd: 'justifyCenter', label: 'وسط‌چین', icon: '↔' },
        { cmd: 'justifyLeft', label: 'چپ‌چین', icon: '⇤' }
      ],
      [
        { cmd: 'createLink', label: 'پیوند', icon: '🔗', prompt: true },
        { cmd: 'insertHorizontalRule', label: 'خط جداکننده', icon: '―' }
      ],
      [
        { cmd: 'undo', label: 'واگرد', icon: '↷' },
        { cmd: 'redo', label: 'ازنو', icon: '↶' }
      ]
    ];

    groups.forEach((group) => {
      const groupEl = document.createElement('div');
      groupEl.className = 'editor-toolbar-group';
      group.forEach((btnDef) => groupEl.appendChild(this._makeButton(btnDef)));
      this.toolbar.appendChild(groupEl);
    });

    // Font size select
    const sizeSelect = document.createElement('select');
    sizeSelect.className = 'editor-size-select';
    sizeSelect.setAttribute('aria-label', 'اندازه قلم');
    [['2', 'کوچک'], ['3', 'معمولی'], ['5', 'بزرگ'], ['7', 'خیلی بزرگ']].forEach(([val, label]) => {
      const opt = document.createElement('option');
      opt.value = val; opt.textContent = label;
      if (val === '3') opt.selected = true;
      sizeSelect.appendChild(opt);
    });
    sizeSelect.addEventListener('change', () => {
      this._applyFontSize(sizeSelect.value);
    });
    this.toolbar.appendChild(sizeSelect);

    // Highlight menu
    const highlightWrap = document.createElement('div');
    highlightWrap.className = 'editor-toolbar-group';
    const highlightDefs = [
      ['important', '⭐ مهم'],
      ['tip', '💡 نکته'],
      ['question', '❓ سؤال'],
      ['reminder', '📌 یادآوری']
    ];
    highlightDefs.forEach(([key, label]) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'editor-btn editor-btn--highlight';
      btn.textContent = label;
      btn.title = `علامت‌گذاری: ${label}`;
      btn.addEventListener('mousedown', (e) => e.preventDefault());
      btn.addEventListener('click', () => this._applyHighlight(key));
      highlightWrap.appendChild(btn);
    });
    this.toolbar.appendChild(highlightWrap);

    this.surface = document.createElement('div');
    this.surface.className = 'editor-surface';
    this.surface.setAttribute('contenteditable', 'true');
    this.surface.setAttribute('dir', 'rtl');
    this.surface.setAttribute('role', 'textbox');
    this.surface.setAttribute('aria-multiline', 'true');
    this.surface.setAttribute('aria-label', 'متن جزوه');
    this.surface.setAttribute('data-placeholder', 'یادداشت‌های این جلسه را اینجا بنویسید…');

    this.surface.addEventListener('input', () => this._handleChange());
    this.surface.addEventListener('paste', (e) => this._handlePaste(e));

    this.root.appendChild(this.toolbar);
    this.root.appendChild(this.surface);
  }

  _makeButton({ cmd, value, label, icon, prompt: needsPrompt }) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'editor-btn';
    btn.title = label;
    btn.setAttribute('aria-label', label);
    btn.textContent = icon;
    // Prevent the browser's default mousedown behavior of shifting focus (and,
    // in some browsers, collapsing/clearing the selection) away from the
    // contenteditable surface before the click handler runs.
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', () => {
      this.surface.focus();
      this._restoreSelection();
      if (needsPrompt) {
        const url = window.prompt('نشانی پیوند را وارد کنید:', 'https://');
        if (!url) return;
        // window.prompt() is a native modal — restore the selection again
        // afterward in case focus/selection shifted while it was open.
        this.surface.focus();
        this._restoreSelection();
        document.execCommand(cmd, false, url);
      } else {
        document.execCommand(cmd, false, value || null);
      }
      this._handleChange();
    });
    return btn;
  }

  _applyHighlight(key) {
    this.surface.focus();
    this._restoreSelection();
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      showEditorHint(this.root, 'ابتدا بخشی از متن را انتخاب کنید');
      return;
    }
    const span = document.createElement('mark');
    span.className = HIGHLIGHT_CLASSES[key];
    try {
      const range = selection.getRangeAt(0);
      range.surroundContents(span);
    } catch (e) {
      // Selection spans multiple elements — fall back to execCommand-based wrap.
      document.execCommand('insertHTML', false, `<mark class="${HIGHLIGHT_CLASSES[key]}">${selection.toString()}</mark>`);
    }
    this.savedRange = null;
    this._handleChange();
  }

  /** Wraps the current selection in a <span style="font-size:...">. */
  _applyFontSize(sizeKey) {
    const sizeValue = FONT_SIZE_MAP[sizeKey];
    if (!sizeValue) return;
    this.surface.focus();
    this._restoreSelection();
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      showEditorHint(this.root, 'ابتدا بخشی از متن را انتخاب کنید');
      return;
    }
    const span = document.createElement('span');
    span.style.fontSize = sizeValue;
    try {
      const range = selection.getRangeAt(0);
      range.surroundContents(span);
    } catch (e) {
      // Selection spans multiple elements — fall back to execCommand-based wrap.
      document.execCommand('insertHTML', false, `<span style="font-size:${sizeValue}">${selection.toString()}</span>`);
    }
    this.savedRange = null;
    this._handleChange();
  }

  _handlePaste(e) {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, text);
  }

  _handleChange() {
    const clean = sanitizeHTML(this.surface.innerHTML);
    if (this.onChange) this.onChange(clean);
  }

  setContent(html) {
    this.surface.innerHTML = sanitizeHTML(html || '');
  }

  getContent() {
    return sanitizeHTML(this.surface.innerHTML);
  }

  focus() {
    this.surface.focus();
  }

  destroy() {
    document.removeEventListener('selectionchange', this._onSelectionChange);
    this.root.innerHTML = '';
  }
}

function showEditorHint(root, text) {
  const hint = document.createElement('div');
  hint.className = 'editor-hint';
  hint.textContent = text;
  root.appendChild(hint);
  setTimeout(() => hint.remove(), 2000);
}
