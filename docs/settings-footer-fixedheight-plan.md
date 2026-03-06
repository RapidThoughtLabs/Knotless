# Settings Modal: Fixed Height + Footer Bar Plan (v2)

**Date:** 2026-03-04
**Branch:** `windows-action-button`

---

## Gap Analysis — Screenshot vs V2 Design

Comparing the live screenshot against `docs/knotless-v2.html` lines 866–956:

| Issue | Current (screenshot) | V2 Design |
|---|---|---|
| Modal height | Elastic `max-height: 78vh` — shrinks/grows with content | Fixed height inside frame — always same size |
| Flex direction | `flex` (row) — sidebar + content as direct children | `flex-direction: column` — body row + footer stacked |
| Body wrapper | None — sidebar & content sit directly in `.settings-modal` | `.settings-body` wraps sidebar + content as a flex row |
| Footer bar | **Missing entirely** | `app-footer` bar at bottom with brand + version + status dot |
| Footer brand | N/A | `RTL://noteless` (reuses `.footer-brand` class) |
| Footer version | N/A | `v0.1.0-beta` with `.status-dot` (reuses `.footer-status`) |
| Footer OS info | N/A | User-requested addition (not in v2 but desired) |
| IPC: app version | Not exposed to renderer | Needs `ipcMain.handle('app:info')` |
| IPC: OS version | Not exposed | Needs `os.version()` piped through |

---

## Key Insight: Reuse Existing Footer Classes

The v2 design puts an `app-footer` **inside** the settings frame using the exact same classes as the main app footer (`app-footer`, `footer-brand`, `footer-end`, `footer-status`, `status-dot`). These classes already exist in `src/style.css` (lines 1227–1285). **No new footer CSS classes needed** — just reuse them.

---

## DOM Structure

### Current
```
.settings-overlay
  .settings-modal          ← display:flex (ROW), max-height:78vh
    .settings-sidebar
    .settings-content
```

### Target
```
.settings-overlay
  .settings-modal          ← display:flex, flex-direction:column, height:520px
    .settings-body         ← display:flex (ROW), flex:1, overflow:hidden
      .settings-sidebar
      .settings-content    ← flex:1, overflow-y:auto (unchanged)
    .app-footer            ← REUSED existing class, 36px bar
      .footer-brand        ← RTL://noteless
      .footer-end
        .footer-status     ← status-dot + version + OS info
```

---

## Step-by-Step Plan

### Step 1 — Expose App Info via IPC (2 files)

**File: `electron/main.js`** — Add after existing `ipcMain.handle` blocks:
```js
const os = require('os');
// ...
ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    osVersion: os.version(),
}));
```

**File: `electron/preload.js`** — Add to `contextBridge.exposeInMainWorld`:
```js
getAppInfo: () => ipcRenderer.invoke('app:info'),
```

---

### Step 2 — CSS Changes (`src/style.css`)

**2a. Change `.settings-modal` to flex-column with fixed height:**
```css
.settings-modal {
  width: 580px;
  height: 520px;              /* CHANGED: fixed height instead of max-height:78vh */
  display: flex;
  flex-direction: column;     /* NEW: column so footer sits at bottom */
  overflow: hidden;
  background: var(--surface);
  border: 1px solid var(--border2);
  border-radius: 8px;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.7);
}
```

**2b. Add `.settings-body` wrapper (new class):**
```css
.settings-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}
```

That's it for CSS — the footer uses existing `.app-footer` styles.

---

### Step 3 — HTML Changes (`settings-modal.js` → `_buildHTML()`)

Wrap sidebar + content in `.settings-body`, add `.app-footer` after it:

```html
<div class="settings-modal" id="settings-panel">
  <div class="settings-body">
    <div class="settings-sidebar">...</div>
    <div class="settings-content">...</div>
  </div>
  <div class="app-footer">
    <div class="footer-brand"><span>RTL://</span>noteless</div>
    <div class="footer-end">
      <div class="footer-status">
        <span id="settings-os-info"></span>
        <div class="status-dot"></div>
        <span id="settings-app-version">v—</span>
      </div>
    </div>
  </div>
</div>
```

---

### Step 4 — Populate Footer in JS (`settings-modal.js`)

Add `_populateFooter()` call in `mount()` and implement the method:

```js
async mount() {
    // ... existing code ...
    this._bind();
    this._populateFooter();  // <-- NEW
}

async _populateFooter() {
    try {
        const info = await window.electron?.getAppInfo?.();
        const platform = window.electron?.platform;

        // Friendly OS label
        let osLabel = info?.osVersion ?? '';
        if (osLabel.startsWith('Windows ')) {
            // "Windows 11 Home Single Language" → "Windows 11"
            osLabel = osLabel.split(' ').slice(0, 2).join(' ');
        } else if (!osLabel) {
            osLabel = { win32: 'Windows', darwin: 'macOS', linux: 'Linux' }[platform] ?? '';
        }

        const versionLabel = info?.version ? `v${info.version}` : 'v—';

        const osEl = this._el?.querySelector('#settings-os-info');
        const verEl = this._el?.querySelector('#settings-app-version');
        if (osEl) osEl.textContent = osLabel;
        if (verEl) verEl.textContent = versionLabel;
    } catch {
        // non-critical
    }
}
```

---

## Files Changed

| File | Change |
|---|---|
| `electron/main.js` | Add `ipcMain.handle('app:info', ...)` |
| `electron/preload.js` | Expose `getAppInfo` in contextBridge |
| `src/style.css` | Change `.settings-modal` to column+fixed height, add `.settings-body` |
| `src/components/settings-modal.js` | Wrap in `.settings-body`, add `.app-footer` HTML, add `_populateFooter()` |

---

## Visual Target

```
┌──────────────────────────────────────────────────────────────┐
│ RTL://settings  │  GENERAL                                    │
│                 │                                             │
│ ⚙ general      │  launch on startup            [toggle]      │
│ ◈ theme        │  default columns              - 3 +         │
│ ⬡ security     │  notification position   [seg ctrl]         │
│                 │  animations              [seg ctrl]         │
│                 │                                             │
│─────────────────┼─────────────────────────────────────────────│
│ RTL://noteless                  Windows 11 · ● v1.0.0        │
└──────────────────────────────────────────────────────────────┘
  ↑ .app-footer reuses existing footer classes from style.css
```
