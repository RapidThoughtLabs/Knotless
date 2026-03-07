# Knotless — App Summary

> **Purpose of this doc:** A full breakdown of what Knotless is and how it works, written so a UI designer/AI can rebuild the frontend from scratch with a better UI.

---

## What Is Knotless?

Knotless (codename: NoteLess) is a **desktop note-taking app** built on **Electron + Vite + vanilla JS** (no React, no framework). It is a minimal, distraction-free clipboard/notes tool where everything is organized as **spreadsheet-like tables** (called "TableNotes"). Think of it as a ultra-lightweight personal database / sticky-note hybrid that lives on your desktop.

Data is stored **fully offline** using **NeDB** (an embedded file-based database, like SQLite but for JSON). Nothing goes to the cloud.

---

## Tech Stack

| Layer | Tech |
|---|---|
| Shell | Electron (macOS, Windows, Linux) |
| Renderer | Vanilla HTML + CSS + JS (no React, no Tailwind) |
| Bundler | Vite |
| Database | NeDB (embedded, file-based) |
| Settings | JSON file written to user data directory |
| Images | PNG files saved to user data directory (`/images/`) |
| IPC | Electron `ipcMain` / `ipcRenderer` via `contextBridge` |

---

## Core Concept: TableNotes

The entire app revolves around the concept of a **TableNote** — a named, grid-based note that looks like a small spreadsheet. Each TableNote has:

- A **name** (editable inline in the footer bar)
- A **configurable number of columns** (1–100, default: 3)
- **Rows** that can be added dynamically (no hard limit)
- **Cells** that hold either **plain text** or a single **image** (never both)
- An optional **checklist mode** where each row gets a checkbox

### TableNote Data Model

```json
{
  "_id": "auto-generated",
  "name": "my table",
  "type": "recent",       // "recent" | "starred" | "archives"
  "columns": 3,
  "data": [               // 2D array: data[row][col] = string | "IMG:/path/to/img.png"
    ["hello", "", ""],
    ["world", "IMG:/Users/.../images/img_12345_ab.png", ""]
  ],
  "pinned": false,
  "checklist": false,
  "checked": [false, false],   // one bool per row, used in checklist mode
  "highlights": {              // keyed by "row-col"
    "0-1": "#ffe4cc"
  },
  "createdAt": "ISO date",
  "updatedAt": "ISO date"
}
```

---

## App Layout

```
┌──────────────────────────────────────────────────┐
│  [traffic lights / win controls]  [filter ▾] [+ add] [⚙]  ← Top Bar (Row A)
├──────────────────────────────────────────────────┤
│                                                  │  ← Filter Bar (Row B, part of top bar)
├──────────────────────────────────────────────────┤
│                                                  │
│   TableNote 1                                    │
│   ┌─────────┬─────────┬─────────┐               │
│   │  cell   │  cell   │  cell   │               │
│   ├─────────┼─────────┼─────────┤               │
│   │  cell   │ [image] │  cell   │               │
│   └─────────┴─────────┴─────────┘               │
│   [ table name ]     [+ add row]  [⋮ options]   │
│                                                  │
│   TableNote 2 ...                                │
│                                                  │
└──────────────────────────────────────────────────┘
```

- The **top bar** is draggable (window drag region).
- On **macOS**: native traffic lights shown, custom window buttons hidden.
- On **Windows/Linux**: custom minimize/maximize/close buttons rendered in-app.
- The **content area** scrolls vertically; tables stack one below another.

---

## Tabs / Filters

There's a **dropdown** in the top bar that filters which tables are shown:

| Filter | DB type | Description |
|---|---|---|
| **Recents** | `recent` | Default view; newly created tables land here |
| **Starred** | `starred` | User-favorited tables |
| **Archives** | `archives` | Soft-deleted / archived tables |

Tables inside each view are sorted: **pinned tables first**, then by **creation date** (newest first).

---

## Cell Interactions

Each cell in a TableNote supports:

| Interaction | Behavior |
|---|---|
| **Click / focus** | Makes cell editable (text cells only) |
| **Blur (unfocus)** | Auto-saves text content to DB immediately |
| **Enter key** | Blurs cell (no newlines allowed in cells) |
| **Paste (Ctrl/Cmd+V)** | Pastes text or image from clipboard |
| **Double-click** | Pastes clipboard content (text or image) into cell |
| **Long press (500ms)** | Copies cell content (text or image) to clipboard |
| **Right-click** | Opens context menu |

### Image Cell Rules
- A cell can hold **either text or one image**, never both
- Image stored on disk as PNG; cell value stored as `IMG:/absolute/path/to/file.png`
- Can't paste image into a text cell (and vice versa)
- Can't paste a second image into a cell that already has one

### Cell Context Menu
Right-clicking a cell opens a context menu with:
- **Copy** — copies text or image to clipboard
- **Paste** — pastes text or image from clipboard
- **Clear** — clears cell content and any highlight
- **Highlight** → submenu with 5 color swatches (soft red, orange, yellow, green, blue) + "No Highlight"

Highlight colors are customizable in Settings and stored per-cell in the `highlights` map.

---

## TableNote Options Menu (⋮)

Each TableNote has a three-dot options button in the footer. Menu items:

| Action | Description |
|---|---|
| **Pin / Unpin** | Pinned tables float to the top of the list |
| **Column control** | `−` / `+` buttons to remove or add columns (min 1, max 100). Removing a column with data triggers a confirmation dialog. |
| **Checklist toggle** | Switches table to/from checklist mode. Adds a checkbox column on the left. Shows a completion % badge in footer. |
| **Add to Favs** (if in Recents) | Moves table to Starred |
| **Move to Recents** (if in Starred or Archives) | Moves table back to Recents |
| **Send to Archives** (if in Recents or Starred) | Moves table to Archives |
| **Add to Favs** (if in Archives) | Moves table to Starred |
| **Delete Last Row** | Removes the last row. Warns if row has data. Blocked if only 1 row remains. |
| **Delete Table** | Permanently deletes the table and all its data. Shows a confirmation dialog. |

---

## Creating Tables

- Click `+ add` button in the top bar
- A modal dialog appears asking for a table name (default: "Untitled Table")
- Press Enter or click "Add" → creates the table with 3 columns and 1 empty row, drops into Recents
- Adding rows: each table footer has an `+ add row` button (visible on hover)

---

## Checklist Mode

When enabled for a table:
- A **checkbox column** is prepended to the grid (36px wide)
- Each row has a checkbox that can be toggled on/off
- A **completion badge** `XX%` appears in the table footer showing what percentage of rows are checked
- Checked state is persisted per-row in the `checked[]` array

---

## Settings Panel

Opened via the gear icon (⚙) in the top bar. A modal/popup with 3 sections:

### 1. General
- Launch on startup (toggle)
- Default column count
- Auto-save interval

### 2. Theme
The most powerful section. Controls the full visual appearance of the app via CSS custom properties.

**Background:**
- Mode: `solid` | `gradient` | `wallpaper`
- In solid mode: pick a color
- In gradient mode: color from, color to, angle (degrees)
- In wallpaper mode: URL input + opacity slider + a gallery of 6 preset wallpaper thumbnails (from wallhaven.cc)

**App Chrome (header / filter bar / borders):**
- Header background color
- Filter bar background color
- Border color

**Text:**
- Primary, secondary, muted text colors

**Tables:**
- Cell background, cell text color
- Grid line color, grid line mode (`lines` or `gaps`)
- Table opacity slider
- Footer background color

**Highlights:**
- 5 editable color swatches for the cell highlight palette

**Reset button:** Resets all theme settings to defaults.

### 3. Security
- Lock on sleep (toggle)
- Auto-lock timeout (`never` / time intervals)
- Clear data on exit (toggle)

> **Note:** Security settings UI exists but the lock/encryption feature is not yet implemented.

---

## Theme Engine

The theme system (`theme-engine.js`) works by:
1. Reading the `settings.json` from disk via IPC on startup
2. Mapping each theme setting to a **CSS custom property** (e.g. `theme.tables.cellBg` → `--cell-bg`)
3. Applying all CSS vars to `:root` immediately
4. Any change in Settings calls `themeEngine.update(dotPath, value)` which persists the change and re-applies all CSS vars in one pass

All UI components rely entirely on these CSS variables — there are no hardcoded colors in the stylesheet.

---

## Data Persistence

| Data | Location | Mechanism |
|---|---|---|
| Tables + cell data | `<userData>/tables.db` | NeDB (append-only flat file) |
| Settings / theme | `<userData>/settings.json` | Plain JSON file |
| Images | `<userData>/images/img_<timestamp>_<hex>.png` | PNG files written by Electron main process |

`<userData>` is the OS user data directory (e.g. `~/Library/Application Support/noteless` on macOS).

Images are referenced in cells as absolute paths. On load, the main process converts paths to `file://` URLs so the renderer can display them cross-platform.

---

## IPC Channels (Electron ↔ Renderer)

All communication goes through `contextBridge` (secure, context-isolated):

| Channel | Purpose |
|---|---|
| `db:create` | Create a new TableNote |
| `db:getAll` | Get all tables |
| `db:getByType` | Get tables filtered by type |
| `db:update` | Update fields of a table by ID |
| `db:delete` | Delete a table by ID |
| `settings:get` | Load settings from disk |
| `settings:update` | Update one setting by dot-path (e.g. `theme.background.color`) |
| `settings:reset` | Reset all settings to defaults |
| `image:save` | Save image buffer to disk, returns absolute path |
| `image:delete` | Delete image file by path |
| `path-to-file-url` | Convert OS path to `file://` URL |
| `window-minimize` | Minimize window |
| `window-maximize` | Toggle maximize/restore |
| `window-close` | Close window |
| `window-is-maximized` | Check if window is currently maximized |

---

## Current UI Issues / What Needs to Be Rebuilt

Based on the screenshots provided:

1. **Tables stack vertically with no visual hierarchy** — the current layout is a plain vertical list of tables, all the same width. No card-style UI, no breathing room.
2. **The purple color scheme feels flat and dated** — no depth, no shadows, no glassmorphism.
3. **The filter is a small dropdown** — could be a more prominent tab bar or sidebar.
4. **Settings popup is functional but bare** — no polish, no transitions.
5. **The table footer is minimal** — table name is a small inline input; the options button is just three dots.
6. **No empty state design** — when there are no tables, just plain text.
7. **Cells are borderless boxes** — hard to tell where one table ends and another begins.

---

## What Should Stay the Same (Business Logic)

- 3-category filter system: Recents / Starred / Archives
- TableNote concept: named grid with variable columns and rows
- Cell types: text or image (mutually exclusive)
- Checklist mode with completion %
- Cell highlights (5 configurable colors)
- Right-click context menu on cells
- Options menu per table (pin, columns, checklist, move, delete)
- Inline name editing on each table
- Add row button per table
- Theme system (can be redesigned but same settings structure)
- Settings panel with General / Theme / Security sections
- Image paste via clipboard (Ctrl+V or double-click)
- Long-press copy gesture
- NeDB + JSON settings for all persistence (no cloud)
- Cross-platform: macOS (traffic lights) + Windows (custom controls) + Linux
