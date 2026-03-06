# Plan: Cut (Ctrl+X), Clear Table Data, Import/Export CSV & XLSX

## Overview

Three features:
1. **Ctrl+X cut** — copy cell content to clipboard, clear the cell, single toast
2. **Clear table data** — wipe all cell values in a table while keeping structure (columns, name, type)
3. **Import / Export CSV & XLSX** — per-table export from the options menu; import creates a new table

---

## Feature 1 — Ctrl+X Cut (single cell)

### Problem
No keyboard shortcut to cut. Users must manually copy then clear.

### Files Changed
| File | What changes |
|------|-------------|
| `src/components/table-card.js` | Add Ctrl+X keydown handler + `_cutCell()` method |
| `src/components/context-menu.js` | Add "cut" item to right-click menu |
| `src/app.js` | Handle `'cut'` action in `handleCellAction()` |

### `table-card.js` — keydown handler (around line 237)

The existing `keydown` listener is not async. Make it async, then add Ctrl+X after the Ctrl+C block:

```js
// Before:
cell.addEventListener('keydown', (e) => {

// After:
cell.addEventListener('keydown', async (e) => {
```

Add after the Ctrl+C block (~line 251):

```js
if ((e.ctrlKey || e.metaKey) && e.key === 'x') {
    e.preventDefault();
    await this._cutCell(cell);
}
```

### `table-card.js` — new `_cutCell(cell)` method

Add after `_copyCell()` (~line 360). Inlines copy + clear logic with a single "cut" toast:

```js
async _cutCell(cell) {
    const row = parseInt(cell.dataset.row);
    const col = parseInt(cell.dataset.col);
    const val = this._table.data?.[row]?.[col] ?? '';

    if (!val.trim()) return; // nothing to cut

    if (isImageCell(val)) {
        try {
            const imgPath = getImagePath(val);
            const fileName = imgPath.split('/').pop().split('\\').pop() || 'image';
            const url = await this._resolveImageUrl(imgPath);
            const res = await fetch(url);
            const blob = await res.blob();
            await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
            // Delete the image file after copying
            await window.electron.images.delete(imgPath);
        } catch {
            showToast('cut failed', 'error');
            return;
        }
    } else {
        try {
            await navigator.clipboard.writeText(val);
        } catch {
            showToast('cut failed', 'error');
            return;
        }
    }

    // Clear cell in DOM and DB
    cell.textContent = '';
    this._cb.onCellUpdate?.(this._table._id, row, col, '');

    // Toast
    if (isImageCell(val)) {
        const fileName = getImagePath(val).split('/').pop().split('\\').pop() || 'image';
        showToast(`cut "${fileName}"`, 'success');
    } else {
        const preview = val.length > 24 ? val.substring(0, 24) + '…' : val;
        showToast(`cut "${preview}"`, 'success');
    }
}
```

### `context-menu.js` — add "cut" item (line 41, between copy and paste)

```html
<div class="ctx-item" data-action="copy">copy</div>
<div class="ctx-item" data-action="cut">cut</div>   <!-- NEW -->
<div class="ctx-item" data-action="paste">paste</div>
```

### `app.js` — handle `'cut'` in `handleCellAction()` (~line 311)

```js
case 'cut': {
    const card = tableCards.get(tableId);
    await card._cutCell(cellEl);
    break;
}
```

> **Note:** `_cutCell` is on the TableCard instance. Expose it either as a public method or route through the existing `_cb` callback pattern to keep encapsulation consistent with how `'copy'` and `'clear'` are handled.

---

## Feature 2 — Clear Table Data (keep structure)

### Problem
No way to wipe all cell content in a table without deleting the table itself.

### What "structure" means
Keep: `name`, `type`, `columns`, `pinned`, `checklist`, `sortOrder`, `cardHeight`
Clear: `data` (all values → `''`), `checked` (all → `false`), `highlights` (`{}`)

Row count is preserved (same number of empty rows).

### Files Changed
| File | What changes |
|------|-------------|
| `src/components/table-options-menu.js` | Add "clear data" item (danger-styled) |
| `src/app.js` | Handle `'clear-data'` in `handleTableAction()` |

### `table-options-menu.js` — HTML template (line 80, before delete-table)

```html
<div class="ctx-item ctx-danger" data-action="clear-data">clear data</div>   <!-- NEW -->
<div class="ctx-item ctx-danger" data-action="delete-table">delete table</div>
```

### `app.js` — handler in `handleTableAction()` (~line 427)

```js
case 'clear-data': {
    const table = tables.find(t => t._id === tableId);
    if (!table) break;

    const confirmed = await showConfirmModal(
        'Clear all cell content?',
        'Table structure (columns, name, type) is preserved. This cannot be undone.'
    );
    if (!confirmed) break;

    const clearedData = table.data.map(row => row.map(() => ''));
    const clearedChecked = (table.checked || []).map(() => false);

    await db().update(tableId, {
        data: clearedData,
        checked: clearedChecked,
        highlights: {}
    });

    await loadTables();
    break;
}
```

> **Note:** Check how `showConfirmModal` (or equivalent) is called in the existing delete-table handler and reuse the same pattern.

---

## Feature 3 — Import / Export CSV & XLSX

### Dependencies

```
npm install papaparse xlsx
```

- `papaparse` — CSV parse/unparse (browser + Node, zero deps, ~45 kB)
- `xlsx` (SheetJS community) — Excel .xlsx parse/write

### Architecture Overview

```
User clicks "export csv"
  → app.js handleTableAction('export-csv', id)
  → table-io.js exportAsCsv(table)  →  string
  → window.electron.files.showSave({ ext: 'csv' })  →  filePath
  → window.electron.files.write(filePath, csvString)
  → toast "exported table-name.csv"

User clicks "import from file"
  → app.js handleTableAction('import-file', id)
  → window.electron.files.showOpen({ exts: ['csv','xlsx'] })  →  filePath
  → window.electron.files.read(filePath)  →  buffer
  → table-io.js importFrom(buffer, fileName)  →  { name, columns, data }
  → db.create({ name, columns, data, type:'recent', ... })
  → loadTables()
  → toast "imported as 'table-name'"
```

---

### 3a — New IPC handlers (`electron/main.js`)

Add after the existing image handlers (~line 195):

```js
import { dialog } from 'electron'; // add to existing import

ipcMain.handle('dialog:showSave', async (_, opts) => {
    const { filePath } = await dialog.showSaveDialog(mainWindow, opts);
    return filePath || null; // null = cancelled
});

ipcMain.handle('dialog:showOpen', async (_, opts) => {
    const { filePaths } = await dialog.showOpenDialog(mainWindow, {
        ...opts,
        properties: ['openFile']
    });
    return filePaths?.[0] || null; // null = cancelled
});

ipcMain.handle('fs:writeFile', async (_, filePath, data) => {
    fs.writeFileSync(filePath, Buffer.from(data));
    return true;
});

ipcMain.handle('fs:readFile', async (_, filePath) => {
    return fs.readFileSync(filePath); // returns Buffer → arrives as Uint8Array
});
```

> **Note:** `dialog` is already imported in `electron` pkg — just add it to the destructure on line 2:
> `const { app, BrowserWindow, ipcMain, dialog } = pkg;`

---

### 3b — New preload bridge entries (`electron/preload.js`)

Add a `files` object to the `contextBridge.exposeInMainWorld` call:

```js
files: {
    showSave: (opts) => ipcRenderer.invoke('dialog:showSave', opts),
    showOpen: (opts) => ipcRenderer.invoke('dialog:showOpen', opts),
    write:    (filePath, data) => ipcRenderer.invoke('fs:writeFile', filePath, data),
    read:     (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
},
```

---

### 3c — New service: `src/services/table-io.js`

New file. Contains pure import/export logic, no side effects.

```js
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

const IMG_PLACEHOLDER = '[image]';
const MAX_COLS = 10;

/**
 * Export a table document to a CSV string.
 * Image cells are exported as [image].
 */
export function exportAsCsv(table) {
    const rows = (table.data || []).map(row =>
        row.map(cell => cell.startsWith('IMG:') ? IMG_PLACEHOLDER : cell)
    );
    return Papa.unparse(rows);
}

/**
 * Export a table document to an XLSX Uint8Array.
 * Image cells are exported as [image].
 */
export function exportAsXlsx(table) {
    const rows = (table.data || []).map(row =>
        row.map(cell => cell.startsWith('IMG:') ? IMG_PLACEHOLDER : cell)
    );
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, table.name || 'Sheet1');
    return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
}

/**
 * Parse a file buffer into table init data.
 * Returns { name, columns, data } — ready for db.create().
 * fileName is used to determine format (.csv vs .xlsx) and as the default table name.
 */
export function importFrom(buffer, fileName) {
    const ext = fileName.split('.').pop().toLowerCase();
    let rows;

    if (ext === 'csv') {
        const text = new TextDecoder().decode(buffer);
        const result = Papa.parse(text, { skipEmptyLines: true });
        rows = result.data;
    } else if (ext === 'xlsx' || ext === 'xls') {
        const wb = XLSX.read(buffer, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    } else {
        throw new Error(`Unsupported file type: .${ext}`);
    }

    if (!rows.length) throw new Error('File is empty');

    // Normalize: ensure all rows have the same length, cap at MAX_COLS
    const colCount = Math.min(Math.max(...rows.map(r => r.length)), MAX_COLS);
    const data = rows.map(row => {
        const padded = [...row].slice(0, colCount).map(v => String(v ?? ''));
        while (padded.length < colCount) padded.push('');
        return padded;
    });

    const baseName = fileName.replace(/\.[^.]+$/, ''); // strip extension
    return { name: baseName, columns: colCount, data };
}
```

---

### 3d — `table-options-menu.js` additions

Add below the existing divider before delete items (~line 79):

```html
<div class="ctx-divider"></div>
<div class="ctx-item" data-action="import-file">import from file</div>
<div class="ctx-item" data-action="export-csv">export as csv</div>
<div class="ctx-item" data-action="export-xlsx">export as xlsx</div>
```

---

### 3e — `app.js` handlers in `handleTableAction()`

```js
case 'export-csv': {
    const table = tables.find(t => t._id === tableId);
    if (!table) break;
    const csv = exportAsCsv(table);
    const safeName = (table.name || 'table').replace(/[^a-z0-9_\-]/gi, '_');
    const filePath = await window.electron.files.showSave({
        defaultPath: `${safeName}.csv`,
        filters: [{ name: 'CSV', extensions: ['csv'] }]
    });
    if (!filePath) break; // user cancelled
    await window.electron.files.write(filePath, csv);
    showToast(`exported "${table.name || 'table'}.csv"`, 'success');
    break;
}

case 'export-xlsx': {
    const table = tables.find(t => t._id === tableId);
    if (!table) break;
    const xlsxBuffer = exportAsXlsx(table);
    const safeName = (table.name || 'table').replace(/[^a-z0-9_\-]/gi, '_');
    const filePath = await window.electron.files.showSave({
        defaultPath: `${safeName}.xlsx`,
        filters: [{ name: 'Excel', extensions: ['xlsx'] }]
    });
    if (!filePath) break;
    await window.electron.files.write(filePath, xlsxBuffer);
    showToast(`exported "${table.name || 'table'}.xlsx"`, 'success');
    break;
}

case 'import-file': {
    const filePath = await window.electron.files.showOpen({
        filters: [
            { name: 'Spreadsheets', extensions: ['csv', 'xlsx', 'xls'] }
        ]
    });
    if (!filePath) break; // user cancelled
    try {
        const buffer = await window.electron.files.read(filePath);
        const fileName = filePath.split(/[\\/]/).pop();
        const { name, columns, data } = importFrom(buffer, fileName);
        await db().create({
            name,
            columns,
            data,
            type: 'recent',
            pinned: false,
            checklist: false,
            checked: data.map(() => false),
            highlights: {},
            sortOrder: Date.now()
        });
        await loadTables();
        showToast(`imported "${name}"`, 'success');
    } catch (err) {
        showToast(`import failed: ${err.message}`, 'error');
    }
    break;
}
```

> **Import top-of-file in app.js:**
> ```js
> import { exportAsCsv, exportAsXlsx, importFrom } from './services/table-io.js';
> ```

---

## Files to Modify / Create

| File | Action | What changes |
|------|--------|-------------|
| `src/components/table-card.js` | Modify | Make keydown async; add Ctrl+X handler; add `_cutCell()` method |
| `src/components/context-menu.js` | Modify | Add "cut" item between copy and paste |
| `src/components/table-options-menu.js` | Modify | Add "clear data" (danger), "import from file", "export as csv", "export as xlsx" items |
| `src/app.js` | Modify | Handle `'cut'`, `'clear-data'`, `'import-file'`, `'export-csv'`, `'export-xlsx'` in action handlers |
| `src/services/table-io.js` | **Create** | Pure CSV/XLSX import/export logic |
| `electron/main.js` | Modify | Add `dialog` to import; add 4 IPC handlers for file dialogs + fs read/write |
| `electron/preload.js` | Modify | Expose `window.electron.files` bridge |
| `package.json` | Modify | Add `papaparse` and `xlsx` to dependencies |

---

## Verification Checklist

### Ctrl+X
- [ ] Ctrl+X on a text cell → cell is cleared, text is in clipboard, toast "cut 'preview...'"
- [ ] Ctrl+X on an image cell → cell is cleared, image in clipboard, image file deleted, toast "cut 'filename'"
- [ ] Ctrl+X on an empty cell → no-op (no toast, no error)
- [ ] Right-click → "cut" works identically to Ctrl+X
- [ ] Multi-cell selection Ctrl+X → only Ctrl+C behavior? (scope: out of scope for now — multi-select stays as TSV copy only)

### Clear Data
- [ ] Table options menu → "clear data" → confirmation modal appears
- [ ] Confirm → all cells empty, checkboxes unchecked, highlights gone
- [ ] Table name, column count, type, pin status preserved
- [ ] Cancel → no change

### Export
- [ ] Export as CSV → native save dialog → file saved → opens correctly in Excel/Sheets
- [ ] Export as XLSX → native save dialog → file saved → opens correctly in Excel, pastable
- [ ] Image cells export as `[image]` placeholder
- [ ] Cancel save dialog → no error, no toast

### Import
- [ ] Import .csv → new table created in recents with correct data
- [ ] Import .xlsx → new table created with correct data
- [ ] Column count capped at 10
- [ ] Table name derived from filename
- [ ] Cancel open dialog → no error
- [ ] Corrupt/empty file → error toast with message

---

## Implementation Order

1. **Feature 1 (Ctrl+X)** — self-contained, no deps. Start here.
2. **Feature 2 (Clear data)** — one menu item + one app.js case. Fast.
3. **Feature 3 (Import/Export)** — install deps first, then build `table-io.js`, wire IPC, wire UI.
