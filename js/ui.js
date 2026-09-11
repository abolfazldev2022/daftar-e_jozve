// ui.js — generic, reusable UI primitives (toasts, dialogs, view routing helpers)

let toastContainer;
function getToastContainer() {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    toastContainer.setAttribute('aria-live', 'polite');
    document.body.appendChild(toastContainer);
  }
  return toastContainer;
}

export function showToast(message, type = 'info', duration = 3000) {
  const container = getToastContainer();
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('toast--visible'));
  setTimeout(() => {
    toast.classList.remove('toast--visible');
    setTimeout(() => toast.remove(), 250);
  }, duration);
}

/**
 * Shows a confirmation dialog. Returns a Promise<boolean>.
 */
export function confirmDialog({ title, message, confirmText = 'تأیید', cancelText = 'انصراف', danger = false }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    overlay.innerHTML = `
      <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-title">
        <h3 id="dlg-title">${title}</h3>
        <p>${message}</p>
        <div class="dialog-actions">
          <button type="button" class="btn btn--ghost" data-action="cancel">${cancelText}</button>
          <button type="button" class="btn ${danger ? 'btn--danger' : 'btn--primary'}" data-action="confirm">${confirmText}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const cleanup = (result) => {
      overlay.classList.remove('dialog-overlay--visible');
      setTimeout(() => overlay.remove(), 200);
      resolve(result);
    };
    overlay.querySelector('[data-action="confirm"]').addEventListener('click', () => cleanup(true));
    overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => cleanup(false));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(false); });
    document.addEventListener('keydown', function escHandler(e) {
      if (e.key === 'Escape') { cleanup(false); document.removeEventListener('keydown', escHandler); }
    });
    requestAnimationFrame(() => overlay.classList.add('dialog-overlay--visible'));
  });
}

/**
 * Shows a generic modal with custom body content (an HTMLElement) and returns
 * an object with a close() method and the overlay element for wiring buttons.
 */
export function openModal({ title, bodyEl, className = '' }) {
  const overlay = document.createElement('div');
  overlay.className = 'dialog-overlay';
  const dialog = document.createElement('div');
  dialog.className = `dialog dialog--modal ${className}`;
  const heading = document.createElement('h3');
  heading.textContent = title;
  const closeBtn = document.createElement('button');
  closeBtn.className = 'dialog-close';
  closeBtn.setAttribute('aria-label', 'بستن');
  closeBtn.innerHTML = '&times;';
  const header = document.createElement('div');
  header.className = 'dialog-header';
  header.append(heading, closeBtn);
  dialog.append(header, bodyEl);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  function close() {
    overlay.classList.remove('dialog-overlay--visible');
    setTimeout(() => overlay.remove(), 200);
  }
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  requestAnimationFrame(() => overlay.classList.add('dialog-overlay--visible'));
  return { overlay, dialog, close };
}

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) {
    if (child == null) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

export function setOnlineStatus(isOnline) {
  const indicator = document.getElementById('connection-status');
  if (!indicator) return;
  indicator.classList.toggle('status--online', isOnline);
  indicator.classList.toggle('status--offline', !isOnline);
  indicator.querySelector('.status-dot').textContent = isOnline ? '🟢' : '🔴';
  indicator.querySelector('.status-label').textContent = isOnline ? 'آنلاین' : 'آفلاین';
}
