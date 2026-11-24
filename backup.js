/* ============================================================
   backup.js — JSON export / import with validation
   ------------------------------------------------------------
   Shape of a backup:
   {
     app: "unsocial",
     backupVersion: 1,
     exportedAt: "2026-01-01T00:00:00.000Z",
     counts: { posts, collections },
     posts: [ { id, text, createdAt, updatedAt, bookmarked, collectionId } ],
     collections: [ { id, name, createdAt } ],
     settings: { theme, identity }
   }

   Import never trusts the file: every field is type-checked,
   text is clipped to the limit, unknown keys are dropped, and the
   caller must choose merge or replace.
   ============================================================ */

import {
  DB_NAME,
  MAX_LENGTH,
  cleanText,
  clearAll,
  collectionsStore,
  postsStore,
  settings,
} from "./db.js";

export const BACKUP_VERSION = 1;
export const BACKUP_APP_ID = "unsocial";

const MAX_POSTS = 20000;
const MAX_COLLECTIONS = 500;
const MAX_ICON_LENGTH = 4_000_000; // ~4MB of data URL
const THEMES = new Set(["light", "dark", "system"]);

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeTimestamp(value, fallback) {
  return Number.isFinite(value) && value > 0 && value < 4102444800000 ? Math.floor(value) : fallback;
}

/* ── Export ──────────────────────────────────────────────── */

export async function buildBackup() {
  const [posts, collections, allSettings] = await Promise.all([
    postsStore.all(),
    collectionsStore.all(),
    settings.all(),
  ]);

  const identity = allSettings.identity ?? null;
  const theme = THEMES.has(allSettings.theme) ? allSettings.theme : "system";

  return {
    app: BACKUP_APP_ID,
    backupVersion: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    counts: { posts: posts.length, collections: collections.length },
    posts: posts
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((post) => ({
        id: post.id,
        text: post.text,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
        bookmarked: Boolean(post.bookmarked),
        collectionId: post.collectionId ?? null,
      })),
    collections: collections.map((collection) => ({
      id: collection.id,
      name: collection.name,
      createdAt: collection.createdAt,
    })),
    settings: { theme, identity },
  };
}

/** Build the JSON file and hand it to the browser as a download. */
export async function exportBackup() {
  const data = await buildBackup();
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 10);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${DB_NAME}-backup-${stamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoke after the click has been handled so the download isn't cancelled.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return { data, filename: link.download };
}

/* ── Validation ──────────────────────────────────────────── */

/**
 * Validate and normalise a parsed backup object.
 * Returns { ok, errors, warnings, data } — data is always sanitised.
 */
export function validateBackup(raw) {
  const errors = [];
  const warnings = [];

  if (!isPlainObject(raw)) {
    return { ok: false, errors: ["The file doesn't contain a JSON object."], warnings, data: null };
  }
  if (raw.app !== BACKUP_APP_ID) {
    errors.push(`This file wasn't exported by unsocial (app marker: ${JSON.stringify(raw.app ?? null)}).`);
  }
  if (!Number.isInteger(raw.backupVersion) || raw.backupVersion < 1) {
    errors.push("Missing or invalid backup version.");
  } else if (raw.backupVersion > BACKUP_VERSION) {
    errors.push(`This backup was made by a newer version (v${raw.backupVersion}). Update the app first.`);
  }
  if (!Array.isArray(raw.posts)) errors.push("The posts list is missing or not an array.");
  if (raw.collections !== undefined && !Array.isArray(raw.collections)) {
    errors.push("The collections list is not an array.");
  }
  if (errors.length) return { ok: false, errors, warnings, data: null };

  /* Collections first, so posts can point at them. */
  const collectionIds = new Set();
  const collections = [];
  (raw.collections ?? []).slice(0, MAX_COLLECTIONS).forEach((entry, index) => {
    if (!isPlainObject(entry)) {
      warnings.push(`Collection #${index + 1} was skipped: not an object.`);
      return;
    }
    const id = typeof entry.id === "string" && entry.id.trim() ? entry.id.trim() : null;
    const name = typeof entry.name === "string" ? entry.name.trim().slice(0, 40) : "";
    if (!id || !name) {
      warnings.push(`Collection #${index + 1} was skipped: missing id or name.`);
      return;
    }
    if (collectionIds.has(id)) {
      warnings.push(`Duplicate collection "${name}" was skipped.`);
      return;
    }
    collectionIds.add(id);
    collections.push({ id, name, createdAt: safeTimestamp(entry.createdAt, Date.now()) });
  });

  const postIds = new Set();
  const posts = [];
  raw.posts.slice(0, MAX_POSTS).forEach((entry, index) => {
    if (!isPlainObject(entry)) {
      warnings.push(`Thought #${index + 1} was skipped: not an object.`);
      return;
    }
    const text = cleanText(entry.text);
    if (!text) {
      warnings.push(`Thought #${index + 1} was skipped: empty or invalid text.`);
      return;
    }
    if (typeof entry.text === "string" && entry.text.length > MAX_LENGTH) {
      warnings.push(`Thought #${index + 1} was trimmed to ${MAX_LENGTH} characters.`);
    }
    let id = typeof entry.id === "string" && entry.id.trim() ? entry.id.trim() : `post_imported_${index}`;
    if (postIds.has(id)) id = `${id}_${index}`;

    const createdAt = safeTimestamp(entry.createdAt, Date.now());
    const bookmarked = entry.bookmarked === true;
    const collectionId =
      bookmarked && typeof entry.collectionId === "string" && collectionIds.has(entry.collectionId)
        ? entry.collectionId
        : null;

    postIds.add(id);
    posts.push({
      id,
      text,
      createdAt,
      updatedAt: safeTimestamp(entry.updatedAt, createdAt),
      bookmarked,
      collectionId,
    });
  });

  if (raw.posts.length > MAX_POSTS) warnings.push(`Only the first ${MAX_POSTS} thoughts were imported.`);
  if (!posts.length && !collections.length) warnings.push("The backup contains no thoughts or collections.");

  /* Settings are optional and whitelisted. */
  const incomingSettings = isPlainObject(raw.settings) ? raw.settings : {};
  const cleanSettings = {};
  if (typeof incomingSettings.theme === "string") {
    cleanSettings.theme = THEMES.has(incomingSettings.theme) ? incomingSettings.theme : "system";
  }
  if (isPlainObject(incomingSettings.identity)) {
    const identity = sanitizeIdentity(incomingSettings.identity);
    if (identity) cleanSettings.identity = identity;
    else warnings.push("The saved app identity in this backup was ignored: unexpected values.");
  }

  return {
    ok: true,
    errors,
    warnings,
    data: {
      posts,
      collections,
      settings: cleanSettings,
      exportedAt: typeof raw.exportedAt === "string" ? raw.exportedAt : null,
      backupVersion: raw.backupVersion,
    },
  };
}

/** Accept only the identity fields we know how to apply. */
function sanitizeIdentity(value) {
  const displayName = typeof value.displayName === "string" ? value.displayName.trim().slice(0, 40) : "";
  const shortName = typeof value.shortName === "string" ? value.shortName.trim().slice(0, 12) : "";
  if (!displayName) return null;

  const icon = isPlainObject(value.icon) ? value.icon : null;
  let cleanIcon = { type: "preset", id: "unsocial" };
  if (icon && icon.type === "custom" && typeof icon.src192 === "string" && typeof icon.src512 === "string") {
    const valid =
      icon.src192.startsWith("data:image/") &&
      icon.src512.startsWith("data:image/") &&
      icon.src192.length < MAX_ICON_LENGTH &&
      icon.src512.length < MAX_ICON_LENGTH;
    if (valid) {
      cleanIcon = {
        type: "custom",
        src192: icon.src192,
        src512: icon.src512,
        source: typeof icon.source === "string" && icon.source.startsWith("data:image/") ? icon.source : null,
      };
    }
  } else if (icon && icon.type === "preset" && typeof icon.id === "string") {
    cleanIcon = { type: "preset", id: icon.id.slice(0, 40) };
  }

  const crop = isPlainObject(value.crop) ? value.crop : {};
  const themeColor =
    typeof value.themeColor === "string" && /^#[0-9a-f]{6}$/i.test(value.themeColor) ? value.themeColor : null;

  return {
    displayName,
    shortName: shortName || displayName.slice(0, 12),
    icon: cleanIcon,
    crop: {
      fit: crop.fit === "contain" ? "contain" : "cover",
      zoom: Number.isFinite(crop.zoom) ? Math.min(3, Math.max(1, crop.zoom)) : 1,
      x: Number.isFinite(crop.x) ? Math.min(50, Math.max(-50, crop.x)) : 0,
      y: Number.isFinite(crop.y) ? Math.min(50, Math.max(-50, crop.y)) : 0,
    },
    themeColor,
  };
}

/* ── Import ──────────────────────────────────────────────── */

/**
 * Apply validated backup data.
 * mode "merge"   → additive, existing thoughts are kept (same ids skipped)
 * mode "replace" → wipes local data first
 */
export async function importBackup(data, mode = "merge") {
  if (!data || !Array.isArray(data.posts) || !Array.isArray(data.collections)) {
    throw new Error("Nothing valid to import.");
  }

  if (mode === "replace") await clearAll();

  const existingCollections = await collectionsStore.all();
  const existingCollectionIds = new Set(existingCollections.map((c) => c.id));
  const existingNames = new Map(existingCollections.map((c) => [c.name.toLowerCase(), c.id]));

  let collectionsAdded = 0;
  for (const collection of data.collections) {
    if (existingCollectionIds.has(collection.id)) continue;
    const nameTaken = existingNames.get(collection.name.toLowerCase());
    if (nameTaken) {
      // Keep the local collection and re-point imported thoughts at it.
      existingCollectionIds.add(collection.id);
      continue;
    }
    await collectionsStore.put(collection);
    existingCollectionIds.add(collection.id);
    existingNames.set(collection.name.toLowerCase(), collection.id);
    collectionsAdded += 1;
  }

  // Map imported collection ids that collided by name onto the local id.
  const nameById = new Map(data.collections.map((c) => [c.id, c.name.toLowerCase()]));
  const resolveCollectionId = (id) => {
    if (!id) return null;
    if (existingCollectionIds.has(id)) return id;
    const name = nameById.get(id);
    return name ? existingNames.get(name) ?? null : null;
  };

  const existingPosts = await postsStore.all();
  const existingPostIds = new Set(existingPosts.map((post) => post.id));

  let postsAdded = 0;
  for (const post of data.posts) {
    if (existingPostIds.has(post.id)) continue;
    const collectionId = post.bookmarked ? resolveCollectionId(post.collectionId) : null;
    await postsStore.put({ ...post, collectionId });
    existingPostIds.add(post.id);
    postsAdded += 1;
  }

  if (data.settings) {
    if (typeof data.settings.theme === "string") await settings.set("theme", data.settings.theme);
    if (data.settings.identity) await settings.set("identity", data.settings.identity);
  }

  return {
    postsAdded,
    postsSkipped: data.posts.length - postsAdded,
    collectionsAdded,
  };
}

/** Read a File as text and parse it, with friendly errors. */
export async function readBackupFile(file) {
  if (!file) throw new Error("No file selected.");
  if (file.size > 25 * 1024 * 1024) throw new Error("That file is larger than 25MB — it's probably not a backup.");
  let text;
  try {
    text = await file.text();
  } catch {
    throw new Error("That file couldn't be read.");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
}
