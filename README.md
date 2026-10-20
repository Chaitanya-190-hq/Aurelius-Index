
---

## 🚀 Quick Deploy

1. **Create a GitHub repo** (public or private — Pages needs public)
2. **Upload these files:**
   - `index.html`
   - `db.json`
   - `README.md`
3. **Enable GitHub Pages:**
   - Go to Settings → Pages
   - Source: `Deploy from a branch`
   - Branch: `main`, folder: `/ (root)`
   - Click Save
4. **Visit** `https://yourname.github.io/your-repo`

---

## 🔑 Default Codes

| Code | Type | Access |
|------|------|--------|
| `AURA-UNDEFINED-8*12` | Master | 🔓 Full admin |
| `REF-7X9Q-K2M4` | Link | Sample link |
| `ARC-3M8P-W5L2` | Note | Sample note |

> **⚠️ Change the master code in `db.json` before pushing live!**

---

## 🛠️ Usage

### Viewing a Resource
1. Go to your site
2. Enter a resource code (e.g., `REF-7X9Q-K2M4`)
3. The resource opens with all its content
4. Share `yoursite.com/#CODE` with anyone

### Managing Resources (Admin)
1. Enter your **master code**
2. The admin dashboard opens with stats and controls
3. Add, edit, or delete resources
4. Download the updated `db.json` and replace in your repo

### Editing the Database
You can also edit `db.json` directly in your GitHub repo:
1. Go to your repo on GitHub.com
2. Open `db.json`
3. Click ✏️ Edit
4. Make changes and Commit

---

## 🔒 Privacy Notes

- All data is stored in `db.json` — a static file on GitHub Pages
- Anyone who knows the exact URL to `db.json` can download it
- Resource codes provide **security through obscurity** — ideal for personal / shared reference content
- Change your master code immediately after first deploy

---

## 🧩 Optional Future Features

- Encrypted database
- Markdown support in notes
- Resource expiration dates
- Favorites / pinned resources
- Offline mode (service worker)

---

## QR Codes

Each resource now has a scannable QR code that encodes its direct share URL (`yoursite/#CODE`). Anyone who scans it is taken straight to that resource's viewer page.

### View a single resource's QR
1. Open the resource normally (enter its code on the landing page).
2. Below the resource card, switch to the **QR Code** tab.
3. Scan with your phone, or right-click the QR and save it as an image to paste into your notes.

### Generate QRs for all resources at once
1. Enter the master code to open the admin dashboard.
2. Click **⊞ QR Codes** in the admin actions bar.
3. A grid of QR codes appears — one per resource.
4. Under each QR you can type a custom base URL if your site is deployed to a specific domain (e.g. `https://yourname.github.io/your-repo`). The QR updates automatically.
5. Right-click any QR to save it, then drop the image into your digital notes.

> **Note:** QR codes encode a URL like `https://yourdomain.com/#REF-7X9Q-K2M4`. If you open `index.html` from a local file (`file://...`), the QR view will show a hint instead of generating codes — deploy the site or enter your deployed URL in the admin QR view.

---

## 📜 License

MIT — Free to use, modify, and share.
