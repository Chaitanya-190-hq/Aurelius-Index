/* ============================================================
   service-worker.js — offline app shell for unsocial
   ------------------------------------------------------------
   Strategy:
     • precache the shell, scripts, manifest and icons on install
     • navigations  → network first, fall back to the cached shell
     • other GETs   → stale-while-revalidate (fast, self-updating)
   User content never touches the network or the cache: it lives
   in IndexedDB only.
   ============================================================ */

const CACHE_NAME = "unsocial-shell-v2";

const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./db.js",
  "./disguise.js",
  "./backup.js",
  "./manifest.webmanifest",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/icon-maskable-512.png",
  "./assets/icons/apple-touch-icon-180.png",
  "./assets/presets/gta-neon-192.png",
  "./assets/presets/gta-neon-512.png",
  "./assets/presets/vice-city-192.png",
  "./assets/presets/vice-city-512.png",
  "./assets/presets/racing-192.png",
  "./assets/presets/racing-512.png",
  "./assets/presets/calculator-192.png",
  "./assets/presets/calculator-512.png",
  "./assets/presets/notes-192.png",
  "./assets/presets/notes-512.png",
  "./assets/presets/gallery-192.png",
  "./assets/presets/gallery-512.png",
  "./assets/presets/vault-192.png",
  "./assets/presets/vault-512.png",
  "./assets/presets/mono-192.png",
  "./assets/presets/mono-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // Add entries individually so one missing file can't fail the whole install.
      await Promise.all(
        SHELL.map((url) =>
          cache.add(new Request(url, { cache: "reload" })).catch((error) => {
            console.warn("[sw] could not precache", url, error);
          })
        )
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
      await self.clients.claim();
    })()
  );
});

/* ── Dynamic manifest ────────────────────────────────────────
   The page stores the generated manifest in IndexedDB. Serving it
   from this stable URL (instead of a blob: URL) keeps the app
   installable while still letting the disguise change the name,
   icon and theme colour. */

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("unsocial", 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("posts")) db.createObjectStore("posts", { keyPath: "id" });
      if (!db.objectStoreNames.contains("collections")) db.createObjectStore("collections", { keyPath: "id" });
      if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings", { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readStoredManifest() {
  try {
    const db = await openDatabase();
    const value = await new Promise((resolve, reject) => {
      const request = db.transaction("settings", "readonly").objectStore("settings").get("dynamicManifest");
      request.onsuccess = () => resolve(request.result ? request.result.value : null);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return typeof value === "string" ? value : null;
  } catch (error) {
    console.warn("[sw] could not read the stored manifest", error);
    return null;
  }
}

async function manifestResponse() {
  const stored = await readStoredManifest();
  if (stored) {
    return new Response(stored, {
      headers: { "Content-Type": "application/manifest+json", "Cache-Control": "no-store" },
    });
  }
  // First run, before the app has generated an identity: fall back to the file.
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match("manifest.webmanifest");
  return cached || fetch("manifest.webmanifest");
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Only handle same-origin http(s); data:, blob: and extensions pass through.
  if (url.origin !== self.location.origin) return;

  if (url.pathname.endsWith("/manifest.webmanifest")) {
    event.respondWith(manifestResponse());
    return;
  }

  // App navigations: try the network, fall back to the cached shell offline.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, fresh.clone());
          return fresh;
        } catch {
          const cache = await caches.open(CACHE_NAME);
          return (
            (await cache.match(request)) ||
            (await cache.match("./index.html")) ||
            (await cache.match("./")) ||
            new Response("Offline and the app shell isn't cached yet.", {
              status: 503,
              headers: { "Content-Type": "text/plain" },
            })
          );
        }
      })()
    );
    return;
  }

  // Static assets: serve the cached copy immediately, refresh it in the background.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);

      const network = fetch(request)
        .then((response) => {
          if (response && response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => null);

      if (cached) {
        event.waitUntil(network);
        return cached;
      }

      const response = await network;
      if (response) return response;

      return new Response("", { status: 504, statusText: "Offline" });
    })()
  );
});

// Allow the page to trigger an immediate update after a new shell is deployed.
self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
  if (event.data && event.data.type === "manifest-updated") {
    // Clients already hold the new manifest in IndexedDB; nothing to cache here.
  }
});
