# Knotless V2 — Complete Redesign & Architecture Implementation Plan

> **Goal:** Redesign Knotless from scratch using the V2 design philosophy (`docs/knotless-v2.html`), restructure the codebase with clean architecture, and build a reusable RTL Theme Engine that can be shared across all Rapid Thought Labs products.

---

## Current State

The app today is a **1678-line monolith** (`src/main.js`) with a 31KB stylesheet (`src/style.css`), a 395-line `index.html`, and three services (`theme-engine.js`, `database.js`, `settings.js`). All UI rendering, event handling, data logic, and theming are tangled together in a single file. The current theme engine maps ~30 individual CSS vars from a deeply nested settings JSON — it's over-engineered for what amounts to just dark/light + accent colors.

### What changes in V2

| Area | Current (V1) | New (V2) |
|---|---|---|
| **Theming** | 30+ individually configurable color pickers (bg, chrome, text, tables, accents, highlights) | **Mode** (dark/light/system) + **accent** (8 preset fluorescent colors). That's it. No more color pickers. |
| **Design** | Purple-ish flat design, no visual hierarchy | JetBrains Mono monospace, `#0a0a0a` dark base, accent-driven, minimal, no-fluff |
| **Layout** | Row A (header) + Row B (filter bar) = 2 rows | Single **topbar** (42px) with traffic lights + `RTL://noteless` branding + filter + actions |
| **Footer** | None | App footer (36px) with brand + table count + saved status |
| **Architecture** | Single monolith JS file | Modular components with separation of concerns |
| **Theme Engine** | Product-specific, deeply nested settings | Reusable **RTL Theme Engine** with a portable `rtl-theme-config.json` |

---

## User Review Required

> [!IMPORTANT]
> **Breaking change: All per-color customization removed.** The new system only exposes mode (dark/light/system) and accent color (8 presets). Users lose the ability to set individual header, cell, text, border, and background colors. This is by design — the V2 philosophy is "no fluff".

> [!IMPORTANT]
> **Settings format migration.** The existing `settings.json` format will change completely. On first launch after update, the old settings file will be replaced with the new format. Old theme customizations will be lost.

> [!WARNING]
> **RTL Theme Engine as a shared module.** The plan stores the theme engine inside `src/rtl-theme/` as a self-contained module that can later be extracted into its own npm package or git submodule for other RTL products. For now it stays in-repo. Is this the right approach, or would you prefer it as a separate repo from day one?

---

## Proposed Changes

### New Project Structure

```
NoteLess/
├── electron/
│   ├── main.js                  # Electron main process (minor updates)
│   └── preload.js               # Context bridge (minor updates)
├── src/
│   ├── app.js                   # App orchestrator (init, routing, event bus)
│   ├── components/
│   │   ├── topbar.js            # Topbar: traffic lights, brand, filter, actions
│   │   ├── table-card.js        # TableNote card rendering + cell editing
│   │   ├── table-footer.js      # Table footer: name, dial, +row, options
│   │   ├── context-menu.js      # Cell right-click context menu
│   │   ├── table-options-menu.js # Table ⋯ options dropdown
│   │   ├── toast.js             # Toast notification system
│   │   ├── settings-modal.js    # Settings overlay with sidebar nav
│   │   ├── modals.js            # New table + confirm dialogs
│   │   └── app-footer.js        # Bottom status bar
│   ├── rtl-theme/
│   │   ├── rtl-theme-engine.js  # Reusable theme engine (mode + accent)
│   │   ├── rtl-theme-config.json # Default theme config (portable across RTL products)
│   │   └── rtl-theme-vars.css   # CSS custom properties for dark/light/accent
│   ├── services/
│   │   ├── database.js          # NeDB wrapper (unchanged)
│   │   └── settings.js          # App settings (simplified, references rtl-theme-config)
│   └── style.css                # App-specific styles built on theme vars
├── index.html                   # Rewritten shell
├── package.json
└── vite.config.js
```

---

### RTL Theme Engine (`src/rtl-theme/`)

This is the crown jewel — a standalone, product-agnostic theming module reusable across all RTL products.

#### [NEW] [rtl-theme-config.json](file:///Users/ruchitnannavare/GitHub/RapidThoughtLabs/NoteLess/src/rtl-theme/rtl-theme-config.json)

Portable JSON config that any RTL product reads/writes:

```json
{
  "rtl_theme_version": 1,
  "mode": "dark",
  "accent": "lime",
  "gridMode": "lines",
  "product": "noteless"
}
```

- `mode`: `"dark"` | `"light"` | `"system"`
- `accent`: `"lime"` | `"red"` | `"pink"` | `"purple"` | `"yellow"` | `"blue"` | `"cyan"` | `"orange"`
- `gridMode`: `"lines"` | `"gaps"` (product-specific, optional)
- `product`: Product identifier for community theme store

That's the _entire_ config. No more 30+ color fields.

#### [NEW] [rtl-theme-vars.css](file:///Users/ruchitnannavare/GitHub/RapidThoughtLabs/NoteLess/src/rtl-theme/rtl-theme-vars.css)

Pure CSS file containing all design tokens, directly derived from the V2 HTML reference:

- `:root` block with the dark mode defaults (same as V2 HTML lines 12-36)
- `[data-mode="light"]` override block (same as V2 HTML lines 39-52)
- `[data-accent="*"]` selectors for all 8 accent colors (same as V2 HTML lines 55-62)
- Scrollbar styling, range input styling

This CSS file is **product-agnostic** — it only defines color tokens, not layout.

#### [NEW] [rtl-theme-engine.js](file:///Users/ruchitnannavare/GitHub/RapidThoughtLabs/NoteLess/src/rtl-theme/rtl-theme-engine.js)

Minimal JS module that:
1. Loads config from Electron settings (via IPC) or localStorage (for web products)
2. Sets `data-mode` and `data-accent` attributes on `<html>` element
3. Handles system mode by listening to `prefers-color-scheme` media query
4. Exposes `setMode(mode)`, `setAccent(name)`, `getConfig()`, `reset()`
5. Persists changes via a callback (IPC for Electron, localStorage for web)

```js
// Usage in any RTL product:
import { RTLThemeEngine } from './rtl-theme/rtl-theme-engine.js';

const theme = new RTLThemeEngine({
  persist: (config) => window.electron.settings.updateTheme(config),
  load: () => window.electron.settings.getTheme(),
});
await theme.init();

// API
theme.setMode('dark');        // or 'light' or 'system'
theme.setAccent('purple');    // applies instantly
theme.getConfig();            // { mode, accent, gridMode }
theme.reset();                // back to defaults
```

---

### Component Modules (`src/components/`)

Each module exports a class or set of functions that own one piece of the UI. Pattern: `create()` to build DOM, `mount(container)` to inject, event callbacks wired internally.

#### [NEW] [topbar.js](file:///Users/ruchitnannavare/GitHub/RapidThoughtLabs/NoteLess/src/components/topbar.js)

- Renders the 42px topbar matching V2 HTML lines 620-634
- macOS traffic light safe area (drag region)
- Windows custom controls (minimize/maximize/close)
- `RTL://noteless` brand label
- Filter dropdown (`recents ▾`) with menu
- `+ add` button, `⚙` settings button
- Emits events: `filter-changed`, `add-clicked`, `settings-clicked`

#### [NEW] [table-card.js](file:///Users/ruchitnannavare/GitHub/RapidThoughtLabs/NoteLess/src/components/table-card.js)

- Renders a single TableNote card matching V2 HTML lines 148-196
- Handles cell rendering (text, image, highlight classes)
- Cell editing (contenteditable), blur-save, paste logic
- Pinned card styling (accent top border)
- Checklist mode (checkbox column)
- Emits events: `cell-updated`, `cell-context-menu`, `row-added`

#### [NEW] [table-footer.js](file:///Users/ruchitnannavare/GitHub/RapidThoughtLabs/NoteLess/src/components/table-footer.js)

- Renders footer bar matching V2 HTML lines 222-265
- Inline table name input
- Pin badge
- Checklist completion dial (SVG circular progress)
- `+ row` button (show on card hover)
- `⋯` options button
- Emits events: `name-changed`, `add-row`, `options-clicked`

#### [NEW] [context-menu.js](file:///Users/ruchitnannavare/GitHub/RapidThoughtLabs/NoteLess/src/components/context-menu.js)

- Cell context menu matching V2 HTML lines 464-488
- Items: copy, paste, clear, highlight (5 color swatches + clear)
- Delete row
- Positioned relative to right-click location
- Highlight colors now fixed (matches V2: red, orange, yellow, green, blue at 10% opacity)

#### [NEW] [table-options-menu.js](file:///Users/ruchitnannavare/GitHub/RapidThoughtLabs/NoteLess/src/components/table-options-menu.js)

- Table options dropdown matching V2 HTML lines 828-848
- Items: pin, columns (−/+), toggle checklist, add to starred, send to archives, delete last row, delete table
- Positioned relative to options button

#### [NEW] [toast.js](file:///Users/ruchitnannavare/GitHub/RapidThoughtLabs/NoteLess/src/components/toast.js)

- Fixed position toast container matching V2 HTML lines 287-335
- Three types: `success` (accent), `error` (red), `info` (neutral)
- Auto-dismiss after 2.2s with slide animation
- Global `showToast(message, type)` function

#### [NEW] [settings-modal.js](file:///Users/ruchitnannavare/GitHub/RapidThoughtLabs/NoteLess/src/components/settings-modal.js)

- Full settings overlay matching V2 HTML lines 337-462, 865-956
- Sidebar nav: `RTL://settings` logo, general / theme / security tabs
- Theme tab: mode toggle (dark/light/system segmented control), accent dot picker (8 colors), grid mode toggle, launch on startup toggle, default columns stepper, reset button
- Backdrop blur overlay
- Persists via RTL Theme Engine + Settings service

#### [NEW] [modals.js](file:///Users/ruchitnannavare/GitHub/RapidThoughtLabs/NoteLess/src/components/modals.js)

- New table dialog matching V2 HTML lines 490-509
- Confirm dialog matching V2 HTML lines 511-517
- Styled per V2 spec: `modal-sm`, `modal-title`, `modal-input`, `btn-cancel`, `btn-confirm`

#### [NEW] [app-footer.js](file:///Users/ruchitnannavare/GitHub/RapidThoughtLabs/NoteLess/src/components/app-footer.js)

- Bottom status bar matching V2 HTML lines 519-546
- `RTL://noteless` brand, table count, current filter, save status indicator

---

### App Orchestrator

#### [NEW] [app.js](file:///Users/ruchitnannavare/GitHub/RapidThoughtLabs/NoteLess/src/app.js)

Entry point that:
1. Initializes RTL Theme Engine
2. Creates all component instances
3. Mounts them to DOM containers
4. Wires event flow between components (e.g., topbar filter change → reload tables)
5. Manages data flow: components call `window.electron.database.*` via app.js mediator
6. Replaces the current 1678-line `main.js`

---

### Updated Files

#### [MODIFY] [index.html](file:///Users/ruchitnannavare/GitHub/RapidThoughtLabs/NoteLess/index.html)

Complete rewrite. New structure:

```html
<!DOCTYPE html>
<html lang="en" data-mode="dark" data-accent="lime">
<head>
  <meta charset="UTF-8">
  <title>noteless — RTL</title>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:ital,wght@0,300;0,400;0,500;0,600;1,400&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/src/rtl-theme/rtl-theme-vars.css">
  <link rel="stylesheet" href="/src/style.css">
</head>
<body>
  <div id="topbar"></div>
  <div id="content" class="frame-content"></div>
  <div id="app-footer"></div>
  <div id="toast-container" class="toast-container"></div>
  <!-- Modals rendered dynamically -->
  <script type="module" src="/src/app.js"></script>
</body>
</html>
```

Slim shell — all components mount themselves into their containers.

#### [MODIFY] [style.css](file:///Users/ruchitnannavare/GitHub/RapidThoughtLabs/NoteLess/src/style.css)

Complete rewrite. Organized into sections matching V2 HTML:
- Reset / base (font, body)
- Topbar
- Table cards
- Cells (text, image, URL, code, path, highlight colors)
- Cell checkboxes
- Table footer + checklist dial
- Context menus
- Modals
- Settings
- App footer
- Toast system
- Scrollbars

All colors reference `var(--accent)`, `var(--bg)`, `var(--surface)`, etc. from `rtl-theme-vars.css`.

#### [MODIFY] [settings.js](file:///Users/ruchitnannavare/GitHub/RapidThoughtLabs/NoteLess/src/services/settings.js)

Simplified `DEFAULT_SETTINGS`:

```js
const DEFAULT_SETTINGS = {
  general: {
    launchOnStartup: false,
    defaultColumns: 3,
  },
  theme: {
    mode: 'dark',
    accent: 'lime',
    gridMode: 'lines',
  },
  security: {
    lockOnSleep: false,
    autoLockTimeout: 'never',
    clearDataOnExit: false,
  },
};
```

Gone: background type/color/gradient/wallpaper, chrome colors, text colors, table colors, accent colors, highlights array, fontSize, compactMode, autoSaveInterval, opacity.

#### [MODIFY] [main.js (electron)](file:///Users/ruchitnannavare/GitHub/RapidThoughtLabs/NoteLess/electron/main.js)

- Update `backgroundColor` to `#0a0a0a` (V2 dark base)
- Clean up IPC handlers if settings shape changes
- No major structural changes

#### [DELETE] [src/main.js](file:///Users/ruchitnannavare/GitHub/RapidThoughtLabs/NoteLess/src/main.js)

Replaced entirely by `src/app.js` + `src/components/*.js`.

#### [DELETE] [src/services/theme-engine.js](file:///Users/ruchitnannavare/GitHub/RapidThoughtLabs/NoteLess/src/services/theme-engine.js)

Replaced by `src/rtl-theme/rtl-theme-engine.js`.

---

## Implementation Order

The work proceeds in this sequence to minimize breakage:

1. **Create `src/rtl-theme/`** — theme vars CSS, config JSON, engine JS
2. **Create `src/components/toast.js`** — standalone, no dependencies
3. **Create `src/components/topbar.js`**
4. **Create `src/components/app-footer.js`**
5. **Create `src/components/modals.js`**
6. **Create `src/components/context-menu.js`**
7. **Create `src/components/table-options-menu.js`**
8. **Create `src/components/table-footer.js`**
9. **Create `src/components/table-card.js`** — depends on footer + context menu
10. **Create `src/components/settings-modal.js`** — depends on theme engine
11. **Rewrite `index.html`**
12. **Rewrite `src/style.css`**
13. **Create `src/app.js`** — wire everything together
14. **Update `settings.js`** — new defaults
15. **Update `electron/main.js`** — new bg color
16. **Delete old `src/main.js`** and `src/services/theme-engine.js`

---

## Verification Plan

### Visual Verification (Browser Agent)
Since this is an Electron app with Vite dev server, the app runs at `http://localhost:5173`. The browser agent can:

1. **Launch the app** via `npm run electron:dev` (or `node start-dev.js`)
2. **Navigate to `http://localhost:5173`** in the browser
3. **Screenshot the main window** and compare against the V2 HTML reference
4. **Test dark/light mode toggle** — open settings, switch modes, verify colors change
5. **Test accent colors** — click each of the 8 dots, verify accent changes throughout
6. **Test table CRUD** — create a table, add rows, edit cells, verify rendering
7. **Test context menu** — right-click a cell, verify menu appears with correct items
8. **Test toast notifications** — trigger actions, verify toasts appear and dismiss

### Functional Verification (Manual by User)
Since the app has no automated test suite, verification relies on manual testing:

1. **Start the app:** `cd /Users/ruchitnannavare/GitHub/RapidThoughtLabs/NoteLess && npm run electron:dev`
2. **Check topbar:** Verify traffic lights (macOS) or custom controls (Windows) appear correctly. Verify `RTL://noteless` brand shows with accent-colored `RTL://`.
3. **Check filter:** Click the filter dropdown, switch between recents/starred/archives.
4. **Create a table:** Click `+ add`, enter a name, verify table appears.
5. **Edit cells:** Click a cell, type text, click away — verify it saves.
6. **Paste image:** Copy an image, click/double-click a cell — verify image appears.
7. **Context menu:** Right-click a cell — verify copy/paste/clear/highlight menu.
8. **Table options:** Click `⋯` — verify pin, columns, checklist, delete options work.
9. **Checklist mode:** Enable checklist, check items, verify dial percentage updates.
10. **Settings modal:** Click ⚙, verify sidebar nav, switch between general/theme/security.
11. **Theme switching:** In settings, toggle dark ↔ light ↔ system, verify entire UI updates.
12. **Accent colors:** Click each accent dot, verify color propagates to accent elements.
13. **Persistence:** Close and reopen app — verify theme and tables survive restart.
14. **App footer:** Verify table count, filter name, and save status update correctly.

### Structural Verification
After restructuring, verify the codebase:
```bash
# Check no imports of deleted files remain
grep -r "theme-engine" src/ --include="*.js"
grep -r "from.*main" src/ --include="*.js"

# Verify all new files exist
ls -la src/components/
ls -la src/rtl-theme/

# Verify build works 
npm run build
```
