// recorder.js — one continuous recording per session, via MediaRecorder.
// NOTE: this module performs audio capture ONLY. No speech-to-text, no transcription,
// no network calls. Pause/Resume operate on the SAME MediaRecorder instance so the
// result is always a single Blob per session, never multiple files.

import DB from './db.js';
import { uuid, nowISO } from './utils.js';

const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/ogg'
];

export function isRecordingSupported() {
  return typeof window.MediaRecorder !== 'undefined' &&
    !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

export function pickSupportedMimeType() {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
  for (const type of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return ''; // let the browser choose its own default
}

/**
 * Manages the lifecycle of a single session's recording:
 * idle -> requesting -> recording <-> paused -> stopped
 */
export class SessionRecorder {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.state = 'idle';
    this.mediaRecorder = null;
    this.stream = null;
    this.chunks = [];
    this.mimeType = '';
    this.startedAt = 0;
    this.elapsedBeforePause = 0;
    this.onStateChange = null; // callback(state)
    this.onTick = null; // callback(seconds)
    this._tickInterval = null;
  }

  _setState(state) {
    this.state = state;
    if (this.onStateChange) this.onStateChange(state);
  }

  async start() {
    if (!isRecordingSupported()) {
      throw new RecorderError('unsupported', 'ضبط صدا در این مرورگر پشتیبانی نمی‌شود.');
    }
    this._setState('requesting');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      this._setState('idle');
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        throw new RecorderError('permission-denied', 'اجازهٔ دسترسی به میکروفون داده نشد. لطفاً از تنظیمات مرورگر دسترسی را فعال کنید.');
      }
      if (err.name === 'NotFoundError') {
        throw new RecorderError('no-microphone', 'میکروفونی روی این دستگاه یافت نشد.');
      }
      throw new RecorderError('unknown', 'خطا در دسترسی به میکروفون.');
    }

    this.mimeType = pickSupportedMimeType();
    const options = this.mimeType ? { mimeType: this.mimeType } : undefined;

    try {
      this.mediaRecorder = new MediaRecorder(this.stream, options);
    } catch (err) {
      this._stopStreamTracks();
      throw new RecorderError('unsupported', 'قالب صوتی پشتیبانی‌شده‌ای برای ضبط پیدا نشد.');
    }

    this.chunks = [];
    this.elapsedBeforePause = 0;
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    };
    this.mediaRecorder.onerror = () => {
      this._setState('error');
    };

    this.mediaRecorder.start(1000); // gather chunks every second
    this.mimeType = this.mediaRecorder.mimeType || this.mimeType;
    this.startedAt = Date.now();
    this._setState('recording');
    this._startTicking();
  }

  pause() {
    if (this.state !== 'recording' || !this.mediaRecorder) return;
    if (typeof this.mediaRecorder.pause !== 'function') return; // pause unsupported — caller should hide button
    this.mediaRecorder.pause();
    this.elapsedBeforePause += (Date.now() - this.startedAt) / 1000;
    this._stopTicking();
    this._setState('paused');
  }

  resume() {
    if (this.state !== 'paused' || !this.mediaRecorder) return;
    this.mediaRecorder.resume();
    this.startedAt = Date.now();
    this._setState('recording');
    this._startTicking();
  }

  /**
   * Stops recording, assembles the single Blob, saves it to IndexedDB
   * (replacing any prior recording for this session, since exactly one
   * continuous recording per session is the model), and returns the saved record.
   */
  stop() {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder || this.state === 'idle') {
        reject(new RecorderError('not-recording', 'ضبطی در حال انجام نیست.'));
        return;
      }
      this._stopTicking();
      const finalMimeType = this.mimeType;
      this.mediaRecorder.onstop = async () => {
        try {
          const durationSeconds = this.elapsedBeforePause +
            (this.state === 'paused' ? 0 : (Date.now() - this.startedAt) / 1000);
          const blob = new Blob(this.chunks, { type: finalMimeType || 'audio/webm' });
          this._stopStreamTracks();

          const existing = await DB.getRecordingBySession(this.sessionId);
          const record = {
            id: existing ? existing.id : uuid(),
            sessionId: this.sessionId,
            blob,
            mimeType: finalMimeType || blob.type,
            durationSeconds: Math.round(durationSeconds),
            sizeBytes: blob.size,
            createdAt: nowISO()
          };
          await DB.putRecording(record);

          const session = await DB.getSession(this.sessionId);
          if (session) {
            session.hasAudio = true;
            session.updatedAt = nowISO();
            await DB.putSession(session);
          }

          this._setState('stopped');
          resolve(record);
        } catch (err) {
          reject(err);
        }
      };
      try {
        this.mediaRecorder.stop();
      } catch (err) {
        reject(err);
      }
    });
  }

  cancel() {
    this._stopTicking();
    if (this.mediaRecorder && this.state !== 'idle' && this.state !== 'stopped') {
      try { this.mediaRecorder.stop(); } catch (e) { /* ignore */ }
    }
    this._stopStreamTracks();
    this.chunks = [];
    this._setState('idle');
  }

  _stopStreamTracks() {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
  }

  _startTicking() {
    this._stopTicking();
    this._tickInterval = setInterval(() => {
      const seconds = this.elapsedBeforePause + (Date.now() - this.startedAt) / 1000;
      if (this.onTick) this.onTick(seconds);
    }, 250);
  }

  _stopTicking() {
    if (this._tickInterval) {
      clearInterval(this._tickInterval);
      this._tickInterval = null;
    }
  }
}

export class RecorderError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/** Deletes only the audio recording for a session — notes and metadata are untouched. */
export async function deleteSessionRecording(sessionId) {
  const recording = await DB.getRecordingBySession(sessionId);
  if (!recording) return;
  await DB.deleteRecording(recording.id);
  const session = await DB.getSession(sessionId);
  if (session) {
    session.hasAudio = false;
    session.updatedAt = nowISO();
    await DB.putSession(session);
  }
}
