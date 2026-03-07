# Knotless v1.0.0 — Launch Day Implementation Plan

> 12 changes to finalize the app for public release.
> All file paths are relative to project root.

---

## 1. Recents Filter Button — Add Glow on Hover

**Goal:** The `recents` (filter) label button in the topbar should glow on hover like `* add` and `⚙ settings`.

**Files:**
- `src/style.css` — lines 94–114 (`.filter-btn` styles)

**Changes:**
- Add `transition: box-shadow 0.22s ease, filter 0.18s ease;` to `.filter-btn` (replacing existing `transition: opacity 0.15s`)
- Change `.filter-btn:hover` from `opacity: 0.75` to:
  ```css
  .filter-btn:hover {
    filter: brightness(1.25);
    box-shadow: var(--glow);
  }
  ```
- The filter button is transparent-background with accent text, so glow will halo around the text area — same treatment as the accent buttons.

---

## 2. Footer Brand — Rename to `rtl://knotless`

**Goal:** Change "RTL://noteless" → "rtl://knotless" in the main app footer.

**Files:**
- `src/components/app-footer.js` — line 17

**Changes:**
- Replace: `<div class="footer-brand"><span>RTL://</span>noteless</div>`
- With: `<div class="footer-brand"><span class="footer-brand-link" id="footer-rtl-link">rtl://</span>knotless</div>`

> Note: The `<span>` gets a class+id so we can attach click behavior (see #5) and style the glow.

---

## 3. Rename App to "Knotless"

**Goal:** The app name everywhere should be "Knotless" since "NoteLess" was taken.

**Files & Changes:**

| File | What to change |
|------|----------------|
| `package.json` line 2 | `"name": "noteless"` → `"name": "knotless"` |
| `package.json` line 3 | `"description"` → update to mention Knotless |
| `package.json` line 24 | `"appId": "com.noteless.app"` → `"appId": "com.rapidthoughtlabs.knotless"` |
| `package.json` line 25 | `"productName": "NoteLess"` → `"productName": "Knotless"` |
| `index.html` line 7 | `<title>noteless — RTL</title>` → `<title>knotless — RTL</title>` |
| `src/rtl-theme/rtl-theme-engine.js` line 25 | `product: 'noteless'` → `product: 'knotless'` |
| `src/rtl-theme/rtl-theme-vars.css` line 4 | Comment: `Used by: noteless` → `Used by: knotless` |
| `src/components/app-footer.js` line 4 | Comment update |
| `src/components/settings-modal.js` line 115 | `"open noteless when you log in"` → `"open knotless when you log in"` |

---

## 4. Settings Footer — Rename Brand

**Goal:** Settings modal footer also shows "RTL://noteless" — rename to match.

**Files:**
- `src/components/settings-modal.js` — line 239

**Changes:**
- Replace: `<div class="footer-brand"><span>RTL://</span>noteless</div>`
- With: `<div class="footer-brand"><span class="footer-brand-link" id="settings-rtl-link">rtl://</span>knotless</div>`

Also update settings sidebar logo (line 94):
- Replace: `<div class="settings-logo"><span>RTL://</span>settings</div>`
- With: `<div class="settings-logo"><span>rtl://</span>settings</div>`

---

## 5. `rtl://` as Glowing Clickable Button → rapidthoughtlabs.com

**Goal:** The `rtl://` prefix in both footers should:
- Have the same reusable accent glow effect on hover (using `--glow` variable)
- Be clickable — opens `https://www.rapidthoughtlabs.com` in the default browser

**Files:**
- `src/style.css` — add new `.footer-brand-link` styles
- `src/components/app-footer.js` — add click handler
- `src/components/settings-modal.js` — add click handler
- `electron/preload.js` — expose `shell.openExternal`
- `electron/main.js` — add IPC handler for opening external URLs

**CSS Changes (style.css):**
```css
.footer-brand-link {
  color: var(--accent);
  cursor: pointer;
  border-radius: 3px;
  padding: 2px 4px;
  margin: -2px -4px;
  transition: box-shadow 0.22s ease, filter 0.18s ease;
}

.footer-brand-link:hover {
  filter: brightness(1.25);
  box-shadow: var(--glow);
}
```

**JS Changes (app-footer.js):**
- After creating the element, attach a click listener on `#footer-rtl-link`:
  ```js
  el.querySelector('#footer-rtl-link')?.addEventListener('click', () => {
      window.electron?.openExternal?.('https://www.rapidthoughtlabs.com');
  });
  ```

**JS Changes (settings-modal.js):**
- Same click handler on `#settings-rtl-link` in `_bind()`.

**Electron Changes:**
- `electron/main.js`: Add IPC handler:
  ```js
  ipcMain.handle('open-external', (_, url) => {
      const { shell } = pkg; // electron
      shell.openExternal(url);
  });
  ```
- `electron/preload.js`: Expose:
  ```js
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  ```

---

## 6. Status Dot — Slow Breathing Glow Animation

**Goal:** The green status dot next to "saved" should have a slow, smooth breathing glow instead of being static. The glow should slowly dim and brighten at a very slow interval.

**Files:**
- `src/style.css` — lines 1281–1304 (`.status-dot` and `.saving` animation)

**Changes:**
Add a new `@keyframes breathe` animation and apply to `.status-dot`:

```css
.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
  animation: breathe 4s ease-in-out infinite;
}

@keyframes breathe {
  0%, 100% {
    opacity: 0.9;
    box-shadow: 0 0 3px 1px hsla(var(--accent-h), var(--accent-s), var(--accent-l), 0.5);
  }
  50% {
    opacity: 0.35;
    box-shadow: 0 0 1px 0px hsla(var(--accent-h), var(--accent-s), var(--accent-l), 0.15);
  }
}
```

- The `saving` state keeps its yellow pulse override (faster, different color).
- `4s` cycle = very slow, smooth breathing.
- Remove the existing static `opacity: 0.8` from `.status-dot`.

---

## 7. Saved Label — Hover Slide to Reveal File Path + Copy

**Goal:** When cursor hovers over the status dot + "saved" label, both slide left to reveal the database file path. Clicking copies the path and shows a toast.

**Files:**
- `src/components/app-footer.js` — restructure `.footer-status` HTML + JS logic
- `src/style.css` — add slide animation styles
- `electron/preload.js` — expose `app.getPath('userData')`
- `electron/main.js` — add IPC handler for getting the DB path

**HTML Changes (app-footer.js):**
Replace the footer-status section with:
```html
<div class="footer-status" id="footer-status-area">
    <div class="status-inner">
        <div class="status-dot" id="footer-status-dot"></div>
        <span id="footer-status-text">saved</span>
    </div>
    <span class="status-path" id="footer-status-path"></span>
</div>
```

**CSS Changes (style.css):**
```css
.footer-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  color: var(--text-dim);
  letter-spacing: 0.08em;
  cursor: pointer;
  overflow: hidden;
  position: relative;
}

.status-inner {
  display: flex;
  align-items: center;
  gap: 6px;
  transition: transform 0.3s ease;
  flex-shrink: 0;
}

.status-path {
  font-size: 9px;
  color: var(--text-dim);
  white-space: nowrap;
  opacity: 0;
  position: absolute;
  right: 0;
  transform: translateX(10px);
  transition: opacity 0.3s ease, transform 0.3s ease;
  pointer-events: none;
}

.footer-status:hover .status-inner {
  transform: translateX(-100%);  /* slide out to left */
}

.footer-status:hover .status-path {
  opacity: 1;
  transform: translateX(0);
  pointer-events: auto;
}
```

> We'll need to calculate the translateX value dynamically or use a simpler approach where the inner slides left by its own width to reveal the path text behind it. The exact offset will need testing — might use JS to set a CSS variable based on the inner width.

**JS Changes (app-footer.js):**
- On `create()`, after building the DOM, fetch the DB path:
  ```js
  const dbPath = await window.electron?.getDbPath?.();
  if (dbPath) {
      el.querySelector('#footer-status-path').textContent = dbPath;
  }
  ```
- Add click handler on `#footer-status-area`:
  ```js
  el.querySelector('#footer-status-area')?.addEventListener('click', async () => {
      const path = el.querySelector('#footer-status-path')?.textContent;
      if (path) {
          await navigator.clipboard.writeText(path);
          showToast('path copied', 'success');
      }
  });
  ```

**Electron Changes:**
- `electron/main.js`:
  ```js
  ipcMain.handle('app:dbPath', () => {
      return path.join(app.getPath('userData'), 'tables.db');
  });
  ```
- `electron/preload.js`:
  ```js
  getDbPath: () => ipcRenderer.invoke('app:dbPath'),
  ```

---

## 8. Stash Security Page

**Goal:** Remove the security section from settings — it will ship in a future version.

**Files:**
- `src/components/settings-modal.js` — lines 101–103 (nav item), lines 205–234 (security panel), lines 357–362 (security toggle bindings)

**Changes:**
1. **Remove** the security nav item (lines 101–103):
   ```html
   <div class="settings-nav-item" data-section="security">
       <span class="nav-icon">⬡</span> security
   </div>
   ```
2. **Remove** the entire `settings-security` panel (lines 205–234).
3. **Remove** the security toggle event listeners in `_bind()` (lines 357–362).

---

## 9. Fix Text Contrast — Different Grays for Dark/Light Mode

**Goal:** Text is too light in both modes. The same gray values are shared where they shouldn't be. Table borders in dark mode are also too light. Focused cell text needs to be more readable.

**Files:**
- `src/rtl-theme/rtl-theme-vars.css` — dark mode vars (lines 29–32), light mode vars (lines 62–65)

**Dark Mode Changes:**
```css
/* Current → Fixed */
--text-mid: #888880;    → --text-mid: #999990;     /* bumped up for readability */
--text-dim: #4e4e48;    → --text-dim: #5e5e56;     /* bumped up slightly */
--text-edit: #c0c0b8;   → --text-edit: #d4d4cc;    /* brighter for editing */
--border: #2e2e2e;      → --border: #252525;        /* darkened — less visible lines */
```

**Light Mode Changes:**
```css
/* Current → Fixed — light mode needs DARKER grays for readability */
--text-mid: #6a6a60;    → --text-mid: #4a4a42;     /* much darker for light bg */
--text-dim: #aaa89e;    → --text-dim: #7a7a70;     /* significantly darker */
--text-edit: #6a6a60;   → --text-edit: #3a3a32;    /* darker for editing */
--border: #c8c4bc;      → --border: #b0aca4;        /* darker lines for visibility */
```

> These values ensure sufficient contrast on both white and black backgrounds. The saved label, footer text, table borders, and focused cell text will all benefit.

---

## 10. Gap Mode — Proper Implementation

**Goal:** Gap mode currently just adds 2px gap with border color background. Redefine:
- **Gap mode cells** get a light gray accent background
- **Gap borders** (the visible space between cells) match the app background color (black in dark, white in light)
- **Border width** slightly thicker (3px) to feel like actual gaps

**Files:**
- `src/style.css` — lines 408–420 (`.gap-mode` styles)

**Changes — replace existing gap-mode rules:**
```css
/* Gap mode: cells with subtle accent tint, gaps = app background color */
.gap-mode .table-grid {
  background: var(--bg);  /* gap color = app background */
  border-bottom-color: var(--bg);
}

.gap-mode .table-row {
  gap: 3px;                /* slightly thicker gaps */
  background: var(--bg);   /* gap color = app background */
  border-bottom: none;     /* remove line borders in gap mode */
}

.gap-mode .table-row:last-child {
  border-bottom: none;
}

.gap-mode .cell {
  border-right: none;
  background: var(--cell-bg);
}

.gap-mode .cell-check {
  border-right: none;
}

/* Give gap-mode table cards a matching feel */
.gap-mode .table-card .table-grid {
  gap: 3px;
}
```

Also add to `rtl-theme-vars.css`:
- Add `--gap-cell-bg` variable:
  - Dark: `#161616` (slightly lighter than `--bg`)
  - Light: `#e6e2dc` (slightly darker than `--bg`)

---

## 11. Accent Labels — Glow on Hover + Light Mode Fix

**Goal:** All accent-colored clickable labels should:
- **Dark mode:** stay accent-colored, glow on hover
- **Light mode:** render as **black bold** text instead of accent color, but still glow with accent on hover

**Affected labels:** `.filter-btn`, `.footer-brand-link`, `.pin-badge`, `#footer-filter`, accent labels in footer info, settings nav items with accent color.

**Files:**
- `src/style.css` — add light-mode overrides

**CSS Changes:**

For the filter button (already has glow from #1):
```css
[data-mode="light"] .filter-btn {
  color: var(--text);
  font-weight: 700;
}

[data-mode="light"] .filter-btn:hover {
  color: var(--accent);
  filter: brightness(1.1);
  box-shadow: var(--glow);
}
```

For the footer brand link:
```css
[data-mode="light"] .footer-brand-link {
  color: var(--text);
  font-weight: 700;
}

[data-mode="light"] .footer-brand-link:hover {
  color: var(--accent);
}
```

For pin badges and other accent labels:
```css
[data-mode="light"] .pin-badge {
  color: var(--text);
  font-weight: 700;
}

[data-mode="light"] .pin-badge:hover {
  color: var(--accent);
}
```

For the footer filter label text:
```css
[data-mode="light"] #footer-filter {
  color: var(--text);
  font-weight: 600;
}
```

---

## 12. Settings Footer — Proper OS Info

**Goal:** Show clean, human-readable OS info:
- **macOS:** `macOS Tahoe` (or relevant version name) — not the full Darwin kernel string
- **Windows:** `Windows 11 Build 22621` (actual Windows version + build number, not "Windows 10" on a Win11 machine)
- **Linux:** `Ubuntu 22.04` or `Fedora 39` etc. (distro name + version)

**Files:**
- `electron/main.js` — line 186–189 (`app:info` handler)
- `electron/preload.js` — no changes needed (already exposes `getAppInfo`)
- `src/components/settings-modal.js` — lines 46–67 (`_populateFooter`)

**Changes to `electron/main.js`:**

Replace `os.version()` with a proper OS detection function:

```js
function getOsLabel() {
    const platform = process.platform;

    if (platform === 'darwin') {
        // Map macOS major versions to marketing names
        const release = os.release(); // e.g. "24.6.0"
        const major = parseInt(release.split('.')[0], 10);
        const macNames = {
            24: 'Tahoe',
            23: 'Sonoma',
            22: 'Ventura',
            21: 'Monterey',
            20: 'Big Sur',
            19: 'Catalina',
        };
        const name = macNames[major] || `(Darwin ${major})`;
        return `macOS ${name}`;
    }

    if (platform === 'win32') {
        // os.release() returns kernel version e.g. "10.0.22621"
        const release = os.release(); // "10.0.22621"
        const parts = release.split('.');
        const buildNum = parseInt(parts[2] || '0', 10);
        // Windows 11 has build >= 22000
        const winVersion = buildNum >= 22000 ? '11' : '10';
        return `Windows ${winVersion} Build ${buildNum}`;
    }

    if (platform === 'linux') {
        // Try to read /etc/os-release for distro info
        try {
            const osRelease = fs.readFileSync('/etc/os-release', 'utf-8');
            const prettyName = osRelease.match(/PRETTY_NAME="?([^"\n]+)"?/);
            if (prettyName) return prettyName[1];
        } catch { }
        return `Linux ${os.release()}`;
    }

    return os.version();
}
```

Update the `app:info` handler:
```js
ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    osVersion: getOsLabel(),
}));
```

**Changes to `settings-modal.js` `_populateFooter()`:**
Simplify — just use the label directly since the main process now returns clean strings:
```js
async _populateFooter() {
    try {
        const info = await window.electron?.getAppInfo?.();
        const osLabel = info?.osVersion ?? '';
        const versionLabel = info?.version ? `v${info.version}` : 'v—';

        const osEl = this._el?.querySelector('#settings-os-info');
        const verEl = this._el?.querySelector('#settings-app-version');
        if (osEl) osEl.textContent = osLabel ? `${osLabel} ` : '';
        if (verEl) verEl.textContent = versionLabel;
    } catch { }
}
```

---

## File Change Summary

| File | Changes |
|------|---------|
| `package.json` | Rename to knotless, update appId, productName |
| `index.html` | Update `<title>` |
| `electron/main.js` | Add `open-external` IPC, `app:dbPath` IPC, rewrite `getOsLabel()` |
| `electron/preload.js` | Expose `openExternal`, `getDbPath` |
| `src/app.js` | No changes needed (uses component APIs) |
| `src/components/app-footer.js` | Rename brand, add path reveal, add RTL link click |
| `src/components/settings-modal.js` | Rename brand, remove security section, simplify OS label, add RTL link click |
| `src/components/topbar.js` | No changes needed (CSS handles glow) |
| `src/style.css` | Filter glow, footer-brand-link glow, breathing dot, path slide, gap mode, light-mode label overrides, contrast fixes |
| `src/rtl-theme/rtl-theme-vars.css` | Adjust grays for both modes, add gap-cell-bg var |
| `src/rtl-theme/rtl-theme-engine.js` | Update product name |

---

## Implementation Order

1. **#3 — Rename to Knotless** (foundation — touches many files)
2. **#2 + #4 — Footer brand rename** (both footers at once)
3. **#8 — Stash security page** (quick removal)
4. **#12 — OS info fix** (main process change)
5. **#5 — RTL:// clickable with glow** (needs IPC + CSS)
6. **#9 — Text contrast fixes** (CSS variable changes)
7. **#10 — Gap mode** (CSS rework)
8. **#1 — Recents button glow** (simple CSS)
9. **#11 — Light mode label fixes** (CSS overrides)
10. **#6 — Breathing status dot** (CSS animation)
11. **#7 — Saved path reveal + copy** (most complex — needs IPC, HTML, CSS, JS)

---

*Plan created for Knotless v1.0.0 launch.*
