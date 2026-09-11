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

export class NotesEditor {
  /**
   * @param {HTMLElement} rootEl - container that will hold the toolbar + editable surface
   * @param {function} onChange - called with the current sanitized HTML whenever content changes
   */
  constructor(rootEl, onChange) {
    this.root = rootEl;
    this.onChange = onChange;
    this._build();
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
      this.surface.focus();
      document.execCommand('fontSize', false, sizeSelect.value);
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
    btn.addEventListener('click', () => {
      this.surface.focus();
      if (needsPrompt) {
        const url = window.prompt('نشانی پیوند را وارد کنید:', 'https://');
        if (!url) return;
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
