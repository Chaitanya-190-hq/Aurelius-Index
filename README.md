# unsocial

A private, local-first thought journal that installs like an app and can wear a convincing disguise on your home screen.

No account. No server. No likes, followers or audience. Every thought lives in IndexedDB on your device and never leaves it. Point the app at a fictional identity — *GTA VI*, *Vice City*, *Calculator*, *Notes* — and it can sit on a home screen next to the real thing.

> The name presets and icon artwork are original, parody-style designs. This project is not affiliated with, endorsed by, or connected to Rockstar Games, Take-Two, or any other brand. It is a personal journal, not a game.

---

## Features

**Journal**
- Compose, edit and delete thoughts (700 character limit, live counter, `Ctrl`/`Cmd` + `Enter` to publish).
- Timestamps with relative labels and a full date on hover.
- Bookmark any thought into Saved, with custom collections.
- Search saved thoughts; rename, delete and move between collections. Removing a bookmark never deletes the thought.
- Discover: an offline generator with curated philosophical, funny, weird and thought-provoking lines. Send one straight into your feed.
- Backup: export everything to a versioned JSON file, and import with validation plus merge/replace choice.
- Light and dark themes, following the system by default.

**Disguise Studio**
- Display name, short name and a home-screen preview.
- Nine icons: the original unsocial mark, neon sunset, Vice City-style, racing, calculator, notes, gallery, vault, minimal monochrome.
- Upload PNG/JPG/WEBP, then crop with zoom, fit and horizontal/vertical position controls.
- Icons generated at 192×192 and 512×512 on-device with the Canvas API.
- Rounded and square previews.
- Dynamic manifest: the identity is stored in IndexedDB, a new manifest JSON is generated, and the `<link rel="manifest">`, tab title and theme colour are all updated. The generated manifest is served by the service worker at the stable `manifest.webmanifest` URL (and also exposed as a Blob URL you can open from the studio).
- Reset name, icon and colour at any time.

## Tech stack

Plain HTML, CSS and ES modules. IndexedDB for storage, a service worker for offline use, a web app manifest for installation, and the Canvas API for icon generation. No frameworks, no build step, no external requests, no analytics.

## Project structure

```
.
├── index.html               ← app shell and all five views
├── styles.css               ← editorial design system, light + dark
├── app.js                   ← routing, feed, collections, generator, UI wiring
├── db.js                    ← IndexedDB layer (posts, collections, settings)
├── disguise.js              ← identity, icon rendering, dynamic manifest, install prompt
├── backup.js                ← export, validation, merge/replace import
├── manifest.webmanifest     ← default PWA manifest
├── service-worker.js        ← offline app shell
├── assets/
│   ├── icons/               ← app icons (192, 512, maskable, Apple touch)
│   └── presets/             ← disguise icon artwork (192 + 512 PNGs)
├── scripts/
│   └── generate-icons.mjs   ← dependency-free icon generator (re-runnable)
└── README.md
```

`scripts/` is only needed if you want to regenerate the artwork: `node scripts/generate-icons.mjs`. The PNGs are committed, so the app itself needs nothing but a static file server.

## Run it locally

Service workers and ES modules need `http://`, not `file://`.

```bash
# any static server works
python3 -m http.server 3000
# then open http://localhost:3000
```

Or with Node: `npx serve .` (then open the printed URL).

## Deploy to GitHub Pages

1. Push this folder to a repository.
2. Open **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, branch `main`, folder `/ (root)`.
4. Save. Your app appears at `https://<user>.github.io/<repo>/`.

All paths in the project are relative, so it works from a subfolder without changes. HTTPS (which Pages provides) is required for service workers and installation.

## Install on Android (Chrome)

1. Open the deployed URL in Chrome.
2. Tap the **⋮** menu → **Add to Home screen** (or the app's own *Install app* button once Chrome offers it).
3. Accept the name — this is the moment the disguise matters.
4. Launch from the home screen: it opens standalone, without browser chrome.

Offline: after the first successful load, the service worker caches the shell, scripts, manifest and icons, so the app opens and works with no connection.

## How the dynamic manifest works

A manifest behind a `blob:` URL cannot be installed by Chrome: relative URLs can't resolve against a blob origin, and installation requires a stable, same-origin URL. So the app does this instead:

1. The identity lives in IndexedDB (`settings` → `identity`).
2. On every load and every identity change, `buildManifestObject()` produces a complete manifest with absolute `start_url`, `scope` and icon URLs.
3. That JSON is stored under `settings` → `dynamicManifest` and the `<link rel="manifest">` is re-pointed with a cache-busting version query.
4. `service-worker.js` answers requests for `manifest.webmanifest` from that stored JSON (`Content-Type: application/manifest+json`), whenever the browser routes that request through the service worker — so an install started after the app has loaded sees the disguise while staying installable.
5. The same JSON is also turned into a Blob URL, which the studio's **View generated JSON** button opens.

Before the service worker takes control (the very first visit), the static `manifest.webmanifest` is used. Reload once and the generated manifest is live.

## The honest bit about disguises

- Changing the name and icon updates the manifest, the tab title, the theme colour and any **newly installed** copy of the app.
- Icon and label choices are copied by the operating system **at install time**. An app already on your home screen usually keeps its old label and icon until you remove it and install it again. Some launchers shorten labels on their own, and some Android skins always show the browser's branding.
- A dynamic manifest is best-effort by design: browsers read it at load and install time, and none of them promise to re-read it for an existing install. The static `manifest.webmanifest` remains the fallback before the service worker is active.
- The in-app title changes immediately everywhere in the app. Nothing here can rename an already-installed app remotely, and this project doesn't pretend otherwise.

## Privacy and storage

- Everything is stored in IndexedDB (`unsocial` database: `posts`, `collections`, `settings`).
- No network requests except loading the app's own files.
- No analytics, no third-party fonts, images or scripts.
- Data is per-browser and per-device: it does not sync. Clearing site data, using a private window, or switching browsers means starting empty.
- **Settings → Delete everything** erases all local data. Export a backup first.
- Installed PWAs can still be evicted by the browser under storage pressure; the app requests persistent storage where supported, but no browser guarantees it.

## Backup format

```json
{
  "app": "unsocial",
  "backupVersion": 1,
  "exportedAt": "2026-05-01T12:00:00.000Z",
  "counts": { "posts": 12, "collections": 2 },
  "posts": [{ "id": "post_…", "text": "…", "createdAt": 1777000000000, "updatedAt": 1777000000000, "bookmarked": true, "collectionId": "col_…" }],
  "collections": [{ "id": "col_…", "name": "Night thoughts", "createdAt": 1777000000000 }],
  "settings": { "theme": "dark", "identity": { "displayName": "Calculator", "shortName": "Calc", "icon": { "type": "preset", "id": "calculator" }, "crop": { "fit": "cover", "zoom": 1, "x": 0, "y": 0 }, "themeColor": null } }
}
```

Imports are validated before anything changes: wrong app marker, newer backup version, malformed posts or oversized icon data are rejected or clipped, and the review dialog shows counts and warnings first. Merge keeps local thoughts and skips duplicate ids; replace wipes first.

## Browser support

Chromium browsers (Chrome, Edge, Brave) on Android and desktop get installation and the full offline experience. Safari and Firefox run the app and store data fine, but don't offer the same install flow (`beforeinstallprompt` never fires) — use their own *Add to Home Screen* / *Install* menu. iOS home-screen icons come from `apple-touch-icon`, which the dynamic manifest cannot change after installation.

## Manual test checklist

- [x] Create, edit and delete a thought
- [x] Bookmark a thought, create a collection, move and search within Saved
- [x] Export a backup, then import it (merge and replace)
- [x] Change app name and verify tab title + manifest
- [x] Switch preset icons, upload an image, adjust crop, reset icon
- [x] Toggle light/dark/system theme
- [x] Install / reinstall prompt handling
- [x] Reload while offline
