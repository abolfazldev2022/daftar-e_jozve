// attachments.js — session attachments (images, PDFs, other files) stored as Blobs.
// No in-app editing/annotation — attachments are stored, listed, downloaded, or deleted only.
// Camera/Gallery access happens ONLY in response to explicit user interaction (a click),
// via standard <input type="file"> capture attributes — never automatically.

import DB from './db.js';
import { uuid, nowISO, formatBytes, extensionForFile } from './utils.js';

const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024; // 50MB soft guard per file to avoid accidental huge uploads

function classifyType(mimeType) {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType === 'application/pdf') return 'pdf';
  return 'other';
}

/**
 * Creates a hidden <input type="file"> configured for the requested source,
 * triggers it (must be called from within a user gesture handler), and
 * resolves with the FileList once the user picks something (or resolves
 * with null if they cancel — browsers don't fire a reliable cancel event,
 * so callers should treat "no files" as a no-op, not an error).
 */
function pickFiles({ accept, capture, multiple }) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    if (capture) input.setAttribute('capture', capture);
    if (multiple) input.multiple = true;
    input.style.display = 'none';
    document.body.appendChild(input);

    const cleanup = () => input.remove();
    input.addEventListener('change', () => {
      resolve(input.files && input.files.length ? Array.from(input.files) : []);
      cleanup();
    }, { once: true });

    // If the user cancels the OS picker, no 'change' fires on most platforms.
    // A window focus event fires when the picker closes either way, so use it
    // as a fallback to avoid leaving a caller's promise pending forever.
    const onFocus = () => {
      window.removeEventListener('focus', onFocus);
      setTimeout(() => {
        if (document.body.contains(input)) {
          resolve([]);
          cleanup();
        }
      }, 300);
    };
    window.addEventListener('focus', onFocus);

    input.click();
  });
}

/** Opens the device camera (mobile browsers) to take a single photo. */
export async function takePhoto() {
  return pickFiles({ accept: 'image/*', capture: 'environment', multiple: false });
}

/** Opens the gallery/file picker for one or more images. */
export async function chooseFromGallery() {
  return pickFiles({ accept: 'image/*', capture: null, multiple: true });
}

/** Opens a generic file picker for documents (PDF and other files). */
export async function chooseDocument() {
  return pickFiles({ accept: '.pdf,.doc,.docx,.txt,.ppt,.pptx,.xls,.xlsx,application/pdf', capture: null, multiple: true });
}

/** Saves one File as an attachment on the given session. */
export async function saveAttachment(sessionId, file) {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error(`فایل «${file.name}» بیش‌ازحد بزرگ است (بیشتر از ${formatBytes(MAX_ATTACHMENT_BYTES)}).`);
  }
  const mimeType = file.type || 'application/octet-stream';
  const record = {
    id: uuid(),
    sessionId,
    type: classifyType(mimeType),
    mimeType,
    blob: file,
    filename: file.name || `پیوست.${extensionForFile(mimeType)}`,
    sizeBytes: file.size,
    createdAt: nowISO()
  };
  await DB.putAttachment(record);
  return record;
}

/** Saves multiple files sequentially, returning { saved: [...], errors: [...] }. */
export async function saveAttachments(sessionId, files) {
  const saved = [];
  const errors = [];
  for (const file of files) {
    try {
      saved.push(await saveAttachment(sessionId, file));
    } catch (err) {
      errors.push({ file, message: err.message });
    }
  }
  return { saved, errors };
}

export async function listAttachments(sessionId) {
  const attachments = await DB.getAttachmentsBySession(sessionId);
  return attachments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function deleteAttachment(attachmentId) {
  await DB.deleteAttachment(attachmentId);
}

export function attachmentObjectURL(attachment) {
  return URL.createObjectURL(attachment.blob);
}

export function iconForAttachmentType(type) {
  if (type === 'image') return '🖼️';
  if (type === 'pdf') return '📄';
  return '📎';
}
