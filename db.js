/* ============================================================
   db.js — IndexedDB access for unsocial
   ------------------------------------------------------------
   Three object stores:
     posts        keyPath "id"  { id, text, createdAt, updatedAt,
                                  bookmarked, collectionId }
     collections  keyPath "id"  { id, name, createdAt }
     settings     keyPath "key" { key, value }

   Everything lives on this device. Nothing is sent anywhere.
   All functions reject with a normal Error on failure, so the UI
   can show a message instead of dying silently.
   ============================================================ */

export const DB_NAME = "unsocial";
export const DB_VERSION = 1;

export const STORES = {
  posts: "posts",
  collections: "collections",
  settings: "settings",
};

const SCHEMA = {
  posts: { keyPath: "id", indexes: [{ name: "createdAt", keyPath: "createdAt" }] },
  collections: { keyPath: "id", indexes: [] },
  settings: { keyPath: "key", indexes: [] },
};

let dbPromise = null;

/** True when the browser exposes IndexedDB (private modes can block it). */
export function isAvailable() {
  try {
    return typeof indexedDB !== "undefined" && indexedDB !== null;
  } catch {
    return false;
  }
}

/** Open (and lazily create/upgrade) the database. Cached after first call. */
export function openDatabase() {
  if (!isAvailable()) {
    return Promise.reject(new Error("This browser has IndexedDB disabled, so thoughts can't be stored."));
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      for (const [name, config] of Object.entries(SCHEMA)) {
        if (!db.objectStoreNames.contains(name)) {
          const store = db.createObjectStore(name, { keyPath: config.keyPath });
          for (const index of config.indexes) {
            store.createIndex(index.name, index.keyPath, { unique: false });
          }
        }
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      // If another tab opens a newer version, close this connection so it
      // can upgrade instead of blocking forever.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };

    request.onerror = () => reject(request.error || new Error("Could not open the local database."));
    request.onblocked = () => reject(new Error("Close other tabs of this app to finish upgrading storage."));
  }).catch((error) => {
    dbPromise = null;
    throw error;
  });

  return dbPromise;
}

/** Run one request inside a transaction and resolve with its result. */
async function run(storeName, mode, action) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    let transaction;
    try {
      transaction = db.transaction(storeName, mode);
    } catch (error) {
      reject(error);
      return;
    }
    const store = transaction.objectStore(storeName);
    let request;
    try {
      request = action(store);
    } catch (error) {
      reject(error);
      return;
    }
    transaction.onabort = () => reject(transaction.error || new Error("The storage transaction was aborted."));
    if (request) {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("A storage request failed."));
    } else {
      transaction.oncomplete = () => resolve(undefined);
    }
  });
}

/** Small typed helpers over a store. */
function storeApi(storeName) {
  return {
    all: () => run(storeName, "readonly", (store) => store.getAll()),
    get: (key) => run(storeName, "readonly", (store) => store.get(key)),
    put: (value) => run(storeName, "readwrite", (store) => store.put(value)),
    delete: (key) => run(storeName, "readwrite", (store) => store.delete(key)),
    clear: () => run(storeName, "readwrite", (store) => store.clear()),
  };
}

export const postsStore = storeApi(STORES.posts);
export const collectionsStore = storeApi(STORES.collections);
export const settingsStore = storeApi(STORES.settings);

/* ── Identifiers ─────────────────────────────────────────── */
export function newId(prefix = "id") {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  // Fallback for browsers without randomUUID.
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}${random}`;
}

/* ── Settings (key/value) ────────────────────────────────── */
export const settings = {
  async get(key, fallback = null) {
    const row = await settingsStore.get(key);
    return row === undefined ? fallback : row.value;
  },
  async set(key, value) {
    return settingsStore.put({ key, value });
  },
  async all() {
    const rows = await settingsStore.all();
    return Object.fromEntries(rows.map((row) => [row.key, row.value]));
  },
  async clear() {
    return settingsStore.clear();
  },
};

/* ── Domain helpers ──────────────────────────────────────── */

export const MAX_LENGTH = 700;

/** Clamp incoming text to the character limit and trim the edges. */
export function cleanText(text) {
  return String(text ?? "").replace(/\r\n/g, "\n").trim().slice(0, MAX_LENGTH);
}

export const posts = {
  async list() {
    const rows = await postsStore.all();
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  },

  async create(text, extra = {}) {
    const value = cleanText(text);
    if (!value) throw new Error("A thought can't be empty.");
    const now = Date.now();
    const post = {
      id: newId("post"),
      text: value,
      createdAt: now,
      updatedAt: now,
      bookmarked: Boolean(extra.bookmarked),
      collectionId: extra.collectionId || null,
    };
    await postsStore.put(post);
    return post;
  },

  async update(id, patch) {
    const existing = await postsStore.get(id);
    if (!existing) throw new Error("That thought no longer exists.");
    const next = { ...existing, ...patch, id: existing.id, updatedAt: Date.now() };
    if (typeof patch.text === "string") {
      const value = cleanText(patch.text);
      if (!value) throw new Error("A thought can't be empty.");
      next.text = value;
    }
    await postsStore.put(next);
    return next;
  },

  async remove(id) {
    return postsStore.delete(id);
  },

  async toggleBookmark(id, collectionId = null) {
    const existing = await postsStore.get(id);
    if (!existing) throw new Error("That thought no longer exists.");
    const next = {
      ...existing,
      bookmarked: !existing.bookmarked,
      collectionId: !existing.bookmarked ? collectionId || existing.collectionId || null : null,
      updatedAt: Date.now(),
    };
    await postsStore.put(next);
    return next;
  },

  async unbookmarkByCollection(collectionId) {
    const rows = await postsStore.all();
    const affected = rows.filter((post) => post.collectionId === collectionId);
    await Promise.all(
      affected.map((post) => postsStore.put({ ...post, bookmarked: true, collectionId: null }))
    );
    return affected.length;
  },

  async clear() {
    return postsStore.clear();
  },
};

export const collections = {
  async list() {
    const rows = await collectionsStore.all();
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  },

  async create(name) {
    const value = String(name ?? "").trim().slice(0, 40);
    if (!value) throw new Error("Give the collection a name.");
    const existing = await collectionsStore.all();
    if (existing.some((collection) => collection.name.toLowerCase() === value.toLowerCase())) {
      throw new Error("You already have a collection with that name.");
    }
    const collection = { id: newId("col"), name: value, createdAt: Date.now() };
    await collectionsStore.put(collection);
    return collection;
  },

  async rename(id, name) {
    const value = String(name ?? "").trim().slice(0, 40);
    if (!value) throw new Error("Give the collection a name.");
    const existing = await collectionsStore.get(id);
    if (!existing) throw new Error("That collection no longer exists.");
    const all = await collectionsStore.all();
    if (all.some((c) => c.id !== id && c.name.toLowerCase() === value.toLowerCase())) {
      throw new Error("You already have a collection with that name.");
    }
    await collectionsStore.put({ ...existing, name: value });
    return { ...existing, name: value };
  },

  /** Remove a collection; its thoughts stay bookmarked but become uncollected. */
  async remove(id) {
    await posts.unbookmarkByCollection(id);
    return collectionsStore.delete(id);
  },

  async clear() {
    return collectionsStore.clear();
  },
};

/** Wipe every store — used by “delete all data” and replace-import. */
export async function clearAll() {
  await Promise.all([postsStore.clear(), collectionsStore.clear(), settingsStore.clear()]);
}

/** Ask the browser not to evict our data when storage gets tight. */
export async function requestPersistence() {
  try {
    if (navigator.storage && typeof navigator.storage.persist === "function") {
      const already = await navigator.storage.persisted();
      if (!already) await navigator.storage.persist();
    }
  } catch {
    /* Persistence is best-effort; ignore refusals. */
  }
}
