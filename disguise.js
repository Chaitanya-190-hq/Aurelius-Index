/* ============================================================
   disguise.js — app identity, icons and dynamic PWA manifest
   ------------------------------------------------------------
   The disguise is stored in IndexedDB under the "identity"
   setting. On every load it is re-applied: the manifest is
   regenerated as a Blob URL, the <link rel="manifest"> is
   re-pointed, the tab title and theme colour are updated.

   Browsers cache installed metadata (launcher label, icon) at
   install time. Changing it here affects the tab, the manifest
   and any *new* install; an already-installed copy keeps its old
   appearance until it is removed and installed again. The UI
   says this plainly — no false promises.
   ============================================================ */

import { settings } from "./db.js";

/* ── Name presets (parody / functional labels, no affiliation) ── */
export const NAME_PRESETS = [
  { id: "gta6", label: "GTA VI", displayName: "GTA VI", shortName: "GTA VI" },
  { id: "vice", label: "Vice City", displayName: "Vice City", shortName: "Vice City" },
  { id: "calculator", label: "Calculator", displayName: "Calculator", shortName: "Calc" },
  { id: "notes", label: "Notes", displayName: "Notes", shortName: "Notes" },
  { id: "gallery", label: "Gallery", displayName: "Gallery", shortName: "Gallery" },
  { id: "music", label: "Music Player", displayName: "Music Player", shortName: "Music" },
  { id: "vault", label: "Private Vault", displayName: "Private Vault", shortName: "Vault" },
  { id: "racing", label: "Racing", displayName: "Racing", shortName: "Racing" },
  { id: "documents", label: "Documents", displayName: "Documents", shortName: "Docs" },
];

/* ── Icon presets (original artwork, drawn as flat assets) ───── */
export const ICON_PRESETS = [
  {
    id: "unsocial",
    label: "Original",
    src192: "assets/icons/icon-192.png",
    src512: "assets/icons/icon-512.png",
    maskable: "assets/icons/icon-maskable-512.png",
  },
  {
    id: "gta-neon",
    label: "Neon Sunset",
    src192: "assets/presets/gta-neon-192.png",
    src512: "assets/presets/gta-neon-512.png",
  },
  {
    id: "vice-city",
    label: "Vice City",
    src192: "assets/presets/vice-city-192.png",
    src512: "assets/presets/vice-city-512.png",
  },
  {
    id: "racing",
    label: "Racing",
    src192: "assets/presets/racing-192.png",
    src512: "assets/presets/racing-512.png",
  },
  {
    id: "calculator",
    label: "Calculator",
    src192: "assets/presets/calculator-192.png",
    src512: "assets/presets/calculator-512.png",
  },
  {
    id: "notes",
    label: "Notes",
    src192: "assets/presets/notes-192.png",
    src512: "assets/presets/notes-512.png",
  },
  {
    id: "gallery",
    label: "Gallery",
    src192: "assets/presets/gallery-192.png",
    src512: "assets/presets/gallery-512.png",
  },
  {
    id: "vault",
    label: "Vault",
    src192: "assets/presets/vault-192.png",
    src512: "assets/presets/vault-512.png",
  },
  {
    id: "mono",
    label: "Minimal",
    src192: "assets/presets/mono-192.png",
    src512: "assets/presets/mono-512.png",
  },
];

export const DEFAULT_CROP = { fit: "cover", zoom: 1, x: 0, y: 0 };

export const DEFAULT_IDENTITY = {
  displayName: "unsocial",
  shortName: "unsocial",
  icon: { type: "preset", id: "unsocial" },
  crop: { ...DEFAULT_CROP },
  themeColor: null, // null = follow the active theme
};

const IDENTITY_KEY = "identity";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/* ── Identity persistence ────────────────────────────────── */

export async function loadIdentity() {
  const stored = await settings.get(IDENTITY_KEY, null);
  return normalizeIdentity(stored);
}

export async function saveIdentity(identity) {
  const clean = normalizeIdentity(identity);
  await settings.set(IDENTITY_KEY, clean);
  return clean;
}

export async function resetIdentity() {
  await settings.set(IDENTITY_KEY, DEFAULT_IDENTITY);
  return { ...DEFAULT_IDENTITY };
}

export function normalizeIdentity(value) {
  const source = value && typeof value === "object" ? value : {};
  const displayName = String(source.displayName ?? "").trim().slice(0, 40) || DEFAULT_IDENTITY.displayName;
  const shortName = String(source.shortName ?? "").trim().slice(0, 12) || displayName.slice(0, 12);

  let icon = { type: "preset", id: "unsocial" };
  if (source.icon && source.icon.type === "custom" && source.icon.src512 && source.icon.src192) {
    icon = {
      type: "custom",
      src192: source.icon.src192,
      src512: source.icon.src512,
      source: source.icon.source ?? null,
    };
  } else if (source.icon && source.icon.type === "preset" && getIconPreset(source.icon.id)) {
    icon = { type: "preset", id: source.icon.id };
  }

  const crop = source.crop && typeof source.crop === "object" ? source.crop : {};
  return {
    displayName,
    shortName,
    icon,
    crop: {
      fit: crop.fit === "contain" ? "contain" : "cover",
      zoom: clampNumber(crop.zoom, 1, 3, 1),
      x: clampNumber(crop.x, -50, 50, 0),
      y: clampNumber(crop.y, -50, 50, 0),
    },
    themeColor:
      typeof source.themeColor === "string" && /^#[0-9a-f]{6}$/i.test(source.themeColor)
        ? source.themeColor
        : null,
  };
}

function clampNumber(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

/** Find an icon preset by id, falling back to the original. */
export function getIconPreset(id) {
  return ICON_PRESETS.find((preset) => preset.id === id) || ICON_PRESETS[0];
}

/** The 192 and 512 sources to use for previews and the manifest. */
export function resolveIcon(identity) {
  if (identity.icon.type === "custom") {
    return {
      src192: identity.icon.src192,
      src512: identity.icon.src512,
      label: "Custom image",
      maskable: null,
    };
  }
  const preset = getIconPreset(identity.icon.id);
  return { src192: preset.src192, src512: preset.src512, label: preset.label, maskable: preset.maskable ?? null };
}

/* ── Theme colour handling ───────────────────────────────── */

export const THEME_COLORS = { light: "#f7f4ec", dark: "#151517" };

export function effectiveThemeColor(identity, theme) {
  return identity.themeColor || THEME_COLORS[theme] || THEME_COLORS.light;
}

export function applyThemeColor(identity, theme) {
  const color = effectiveThemeColor(identity, theme);
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", color);
  return color;
}

/* ── Manifest generation ─────────────────────────────────── */

const MANIFEST_KEY = "dynamicManifest";
let currentManifestBlobUrl = null;
let currentManifestServedUrl = null;

/** Absolute start URL so the manifest still resolves from a Blob URL. */
function appBaseUrl() {
  return new URL("./", window.location.href).href;
}

export function buildManifestObject(identity, theme) {
  const icon = resolveIcon(identity);
  const base = appBaseUrl();
  const icons = [];

  const pushIcon = (src, sizes, purpose) => {
    if (!src) return;
    // Relative asset paths become absolute; data URLs are already self-contained.
    const resolved = src.startsWith("data:") ? src : new URL(src, base).href;
    icons.push({ src: resolved, sizes, type: "image/png", purpose });
  };

  pushIcon(icon.src192, "192x192", "any");
  pushIcon(icon.src512, "512x512", "any");
  if (icon.maskable) pushIcon(icon.maskable, "512x512", "maskable");

  return {
    name: identity.displayName,
    short_name: identity.shortName,
    description: "A private, local-first journal that stays on your device.",
    id: base,
    start_url: base,
    scope: base,
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "any",
    background_color: theme === "dark" ? "#151517" : "#f7f4ec",
    theme_color: effectiveThemeColor(identity, theme),
    lang: "en",
    dir: "ltr",
    categories: ["lifestyle", "productivity"],
    icons,
  };
}

/**
 * Generate the manifest for the current identity and publish it.
 *
 * Browsers refuse to install from a `blob:` manifest (relative URLs cannot
 * resolve against a blob origin), so the generated JSON is:
 *   1. written to IndexedDB under "dynamicManifest",
 *   2. served by the service worker at the stable `manifest.webmanifest` URL,
 *   3. re-pointed at by <link rel="manifest"> with a cache-busting version,
 *   4. also exposed as a Blob URL for inspection in the UI.
 */
export function applyManifest(identity, theme) {
  const manifest = buildManifestObject(identity, theme);
  const json = JSON.stringify(manifest, null, 2);

  // The service worker answers manifest.webmanifest from this stored copy.
  settings.set(MANIFEST_KEY, json).catch(() => {});
  if (navigator.serviceWorker && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({ type: "manifest-updated" });
  }

  const blob = new Blob([json], { type: "application/manifest+json" });
  const blobUrl = URL.createObjectURL(blob);
  const previousBlob = currentManifestBlobUrl;
  currentManifestBlobUrl = blobUrl;
  if (previousBlob) setTimeout(() => URL.revokeObjectURL(previousBlob), 5000);

  const link = document.getElementById("manifest-link");
  if (!link) throw new Error("The manifest link is missing from the page.");

  // Re-point the link so the browser re-reads the generated manifest.
  const servedUrl = `${new URL("manifest.webmanifest", appBaseUrl()).href}?v=${Date.now()}`;
  link.setAttribute("href", servedUrl);
  currentManifestServedUrl = servedUrl;

  return { manifest, url: servedUrl, blobUrl };
}

/** Apply name, title, theme colour, manifest and the in-app brand. */
export function applyIdentity(identity, theme) {
  const { manifest, url, blobUrl } = applyManifest(identity, theme);
  const color = applyThemeColor(identity, theme);

  document.title = identity.displayName;
  const appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
  if (appleTitle) appleTitle.setAttribute("content", identity.shortName);

  const icon = resolveIcon(identity);
  setMeta("apple-mobile-web-app-status-bar-style", theme === "dark" ? "black-translucent" : "default");

  return { manifest, url, blobUrl, color, icon };
}

function setMeta(name, content) {
  const meta = document.querySelector(`meta[name="${name}"]`);
  if (meta) meta.setAttribute("content", content);
}

export function getManifestUrl() {
  return currentManifestServedUrl || getDefaultManifestUrl();
}

/** Blob URL of the generated JSON, for the “View manifest” link. */
export function getManifestBlobUrl() {
  return currentManifestBlobUrl || getDefaultManifestUrl();
}

export function getDefaultManifestUrl() {
  return new URL("manifest.webmanifest", appBaseUrl()).href;
}

/* ── Image handling & icon rendering ─────────────────────── */

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("That image could not be decoded."));
    image.src = src;
  });
}

/** Validate and read a user-picked image file into a data URL. */
export async function readImageFile(file) {
  if (!file) throw new Error("No image selected.");
  if (!/^image\/(png|jpeg|jpg|webp)$/i.test(file.type)) {
    throw new Error("Use a PNG, JPG or WEBP image.");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("That image is larger than 8MB. Try a smaller one.");
  }

  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("That file couldn't be read."));
    reader.readAsDataURL(file);
  });

  const image = await loadImage(dataUrl);
  if (!image.width || !image.height) throw new Error("That image has no drawable pixels.");
  return { dataUrl, width: image.width, height: image.height };
}

/**
 * Draw the source image into a square canvas at `size`, applying fit, zoom
 * and pan. Returns a PNG data URL.
 */
async function renderIcon(source, crop, size) {
  const image = await loadImage(source);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't generate icons (no canvas support).");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const cover = crop.fit !== "contain";
  const baseScale = cover
    ? Math.max(size / image.width, size / image.height)
    : Math.min(size / image.width, size / image.height);
  const scale = baseScale * crop.zoom;
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;

  let dx = (size - drawWidth) / 2 + (crop.x / 100) * size;
  let dy = (size - drawHeight) / 2 + (crop.y / 100) * size;

  // Keep the artwork from sliding completely out of the frame.
  dx = drawWidth >= size ? Math.min(0, Math.max(size - drawWidth, dx)) : Math.min(size - drawWidth, Math.max(0, dx));
  dy = drawHeight >= size ? Math.min(0, Math.max(size - drawHeight, dy)) : Math.min(size - drawHeight, Math.max(0, dy));

  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(image, dx, dy, drawWidth, drawHeight);
  return canvas.toDataURL("image/png");
}

/** Generate the 192 and 512 PNG icons for a custom image. */
export async function generateIcons(sourceDataUrl, crop) {
  const [src192, src512] = await Promise.all([
    renderIcon(sourceDataUrl, crop, 192),
    renderIcon(sourceDataUrl, crop, 512),
  ]);
  return { src192, src512 };
}

/* ── Install prompt handling ─────────────────────────────── */

let deferredPrompt = null;
let promptListener = null;

/**
 * Capture `beforeinstallprompt` once, early, so the Install button works.
 * Note: this event only fires in browsers that support installability
 * (Chromium). Safari and Firefox simply never fire it.
 */
export function setupInstallPrompt(onChange) {
  promptListener = onChange;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    promptListener?.(true);
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    promptListener?.(false);
  });
}

export function canInstall() {
  return Boolean(deferredPrompt);
}

export async function promptInstall() {
  if (!deferredPrompt) {
    return { outcome: "unavailable" };
  }
  deferredPrompt.prompt();
  const choice = await deferredPrompt.userChoice;
  deferredPrompt = null;
  promptListener?.(false);
  return choice;
}

export function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: minimal-ui)").matches ||
    window.navigator.standalone === true
  );
}
