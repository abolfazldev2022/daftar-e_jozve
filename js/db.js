// db.js — IndexedDB wrapper for دفتر جزوه
// Responsible ONLY for user data: courses, sessions, notes, recordings, attachments, settings.
// The Service Worker (sw.js) handles caching the app shell separately — never mix the two.

const DB_NAME = 'daftarJozveDB';
const DB_VERSION = 1;

const STORES = {
  COURSES: 'courses',
  SESSIONS: 'sessions',
  RECORDINGS: 'recordings',
  ATTACHMENTS: 'attachments',
  SETTINGS: 'settings'
};

let dbInstance = null;

/**
 * Opens (and if needed, creates/upgrades) the database.
 * Returns a promise resolving to the open IDBDatabase instance.
 */
function openDB() {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains(STORES.COURSES)) {
        const courseStore = db.createObjectStore(STORES.COURSES, { keyPath: 'id' });
        courseStore.createIndex('name', 'name', { unique: false });
        courseStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.SESSIONS)) {
        const sessionStore = db.createObjectStore(STORES.SESSIONS, { keyPath: 'id' });
        sessionStore.createIndex('courseId', 'courseId', { unique: false });
        sessionStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.RECORDINGS)) {
        const recStore = db.createObjectStore(STORES.RECORDINGS, { keyPath: 'id' });
        recStore.createIndex('sessionId', 'sessionId', { unique: true });
      }

      if (!db.objectStoreNames.contains(STORES.ATTACHMENTS)) {
        const attStore = db.createObjectStore(STORES.ATTACHMENTS, { keyPath: 'id' });
        attStore.createIndex('sessionId', 'sessionId', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
        db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      dbInstance.onversionchange = () => {
        // Another tab is upgrading the DB — close so it can proceed safely.
        dbInstance.close();
        dbInstance = null;
      };
      resolve(dbInstance);
    };

    request.onerror = () => reject(request.error);
  });
}

/** Generic promise wrapper around an IDBRequest. */
function reqToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Runs a callback inside a transaction on one or more stores. */
async function withStore(storeNames, mode, callback) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode);
    const stores = Array.isArray(storeNames)
      ? storeNames.map((n) => tx.objectStore(n))
      : tx.objectStore(storeNames);

    let result;
    Promise.resolve(callback(stores, tx))
      .then((r) => { result = r; })
      .catch((err) => {
        try { tx.abort(); } catch (e) { /* already aborted */ }
        reject(err);
      });

    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('تراکنش پایگاه‌داده لغو شد'));
  });
}

// ---------- Generic CRUD helpers ----------

async function dbPut(storeName, value) {
  return withStore(storeName, 'readwrite', (store) => reqToPromise(store.put(value)));
}

async function dbGet(storeName, key) {
  return withStore(storeName, 'readonly', (store) => reqToPromise(store.get(key)));
}

async function dbDelete(storeName, key) {
  return withStore(storeName, 'readwrite', (store) => reqToPromise(store.delete(key)));
}

async function dbGetAll(storeName) {
  return withStore(storeName, 'readonly', (store) => reqToPromise(store.getAll()));
}

async function dbGetAllByIndex(storeName, indexName, value) {
  return withStore(storeName, 'readonly', (store) =>
    reqToPromise(store.index(indexName).getAll(value))
  );
}

async function dbGetByIndex(storeName, indexName, value) {
  return withStore(storeName, 'readonly', (store) =>
    reqToPromise(store.index(indexName).get(value))
  );
}

async function dbClear(storeName) {
  return withStore(storeName, 'readwrite', (store) => reqToPromise(store.clear()));
}

async function dbCount(storeName) {
  return withStore(storeName, 'readonly', (store) => reqToPromise(store.count()));
}

// ---------- Domain-specific API ----------

const DB = {
  STORES,

  // Courses
  async putCourse(course) { return dbPut(STORES.COURSES, course); },
  async getCourse(id) { return dbGet(STORES.COURSES, id); },
  async getAllCourses() { return dbGetAll(STORES.COURSES); },
  async deleteCourse(id) { return dbDelete(STORES.COURSES, id); },

  // Sessions
  async putSession(session) { return dbPut(STORES.SESSIONS, session); },
  async getSession(id) { return dbGet(STORES.SESSIONS, id); },
  async getSessionsByCourse(courseId) { return dbGetAllByIndex(STORES.SESSIONS, 'courseId', courseId); },
  async getAllSessions() { return dbGetAll(STORES.SESSIONS); },
  async deleteSession(id) { return dbDelete(STORES.SESSIONS, id); },

  // Recordings (one per session)
  async putRecording(recording) { return dbPut(STORES.RECORDINGS, recording); },
  async getRecordingBySession(sessionId) { return dbGetByIndex(STORES.RECORDINGS, 'sessionId', sessionId); },
  async getAllRecordings() { return dbGetAll(STORES.RECORDINGS); },
  async deleteRecording(id) { return dbDelete(STORES.RECORDINGS, id); },

  // Attachments (many per session)
  async putAttachment(attachment) { return dbPut(STORES.ATTACHMENTS, attachment); },
  async getAttachmentsBySession(sessionId) { return dbGetAllByIndex(STORES.ATTACHMENTS, 'sessionId', sessionId); },
  async getAllAttachments() { return dbGetAll(STORES.ATTACHMENTS); },
  async deleteAttachment(id) { return dbDelete(STORES.ATTACHMENTS, id); },

  // Settings
  async getSetting(key, fallback = null) {
    const row = await dbGet(STORES.SETTINGS, key);
    return row ? row.value : fallback;
  },
  async setSetting(key, value) {
    return dbPut(STORES.SETTINGS, { key, value });
  },
  async getAllSettingsRaw() {
    return dbGetAll(STORES.SETTINGS);
  },

  // Cascading deletes
  async deleteCourseCascade(courseId) {
    const sessions = await DB.getSessionsByCourse(courseId);
    for (const session of sessions) {
      await DB.deleteSessionCascade(session.id);
    }
    await DB.deleteCourse(courseId);
  },

  async deleteSessionCascade(sessionId) {
    const recording = await DB.getRecordingBySession(sessionId);
    if (recording) await DB.deleteRecording(recording.id);
    const attachments = await DB.getAttachmentsBySession(sessionId);
    for (const att of attachments) await DB.deleteAttachment(att.id);
    await DB.deleteSession(sessionId);
  },

  // Wipes ALL user data (used only by restore-with-replace, after explicit confirmation)
  async wipeAll() {
    await dbClear(STORES.COURSES);
    await dbClear(STORES.SESSIONS);
    await dbClear(STORES.RECORDINGS);
    await dbClear(STORES.ATTACHMENTS);
    // settings are intentionally preserved (theme etc.) unless caller clears explicitly
  },

  async counts() {
    return {
      courses: await dbCount(STORES.COURSES),
      sessions: await dbCount(STORES.SESSIONS),
      recordings: await dbCount(STORES.RECORDINGS),
      attachments: await dbCount(STORES.ATTACHMENTS)
    };
  }
};

export default DB;
