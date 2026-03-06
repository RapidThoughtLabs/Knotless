# Plan: Multi-Cell Group Selection — Ctrl+C / Ctrl+X with HTML Table Clipboard

## Overview

Upgrade the grouped-cell copy (Ctrl+C) and add grouped-cell cut (Ctrl+X) for multi-cell drag selections. Instead of copying as plain TSV text, write **both** an HTML `<table>` and a plain-text TSV fallback to the clipboard. This lets pasted content render as a real table in apps that support rich paste (Google Docs, Word, Notion, Slack, Excel) while still working in plain-text editors.

### Platform Keys
| Platform | Modifier |
|----------|----------|
| Windows  | `Ctrl`   |
| macOS    | `Cmd` (`metaKey`) |
| Linux    | `Ctrl`   |

The existing code already checks `(e.ctrlKey || e.metaKey)` — this covers all three platforms. No changes needed for key detection.

---

## Current State

**File:** `src/components/table-card.js` — `_installSelectionHandlers()`

### What exists (lines 530–558):
```js
document.addEventListener('keydown', async (e) => {
    const selected = el.querySelectorAll('.cell-selected');
    if (!selected.length) return;

    if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        e.preventDefault();
        // Gather into 2D map → join as TSV → clipboard.writeText(tsv)
        // Toast: "copied X cells"
    }

    if (e.key === 'Escape') { clearSelection(); }
});
```

### Problems:
1. **TSV only** — pastes as flat tab-separated text. No table structure in Word/Docs/Notion/Slack/Excel.
2. **No Ctrl+X** — can't cut a multi-cell selection at all.
3. **Image cells** — currently replaced with `[image]` placeholder in TSV. Same behavior kept for HTML (an `[image]` text node).

---

## Implementation

### Step 1 — Helper: Build HTML table + TSV from selection

Extract the 2D-map-building logic into a shared helper so both Ctrl+C and Ctrl+X can reuse it.

**New private method on TableCard:**

```js
/**
 * Gather selected cells into a 2D sorted structure.
 * Returns { rowMap, tsv, html, count }
 *   rowMap — Map<row, Map<col, cellValue>>  (raw values from this._table.data)
 *   tsv    — tab-separated plain text
 *   html   — <table> HTML string
 *   count  — total number of selected cells
 */
_buildSelectionPayload(selectedCells) {
    const rowMap = new Map();
    selectedCells.forEach(c => {
        const r = parseInt(c.dataset.row);
        const col = parseInt(c.dataset.col);
        if (!rowMap.has(r)) rowMap.set(r, new Map());
        const val = this._table.data?.[r]?.[col] ?? '';
        rowMap.get(r).set(col, val);
    });

    const sortedRows = [...rowMap.entries()].sort((a, b) => a[0] - b[0]);

    // TSV (plain text fallback)
    const tsv = sortedRows.map(([, colMap]) => {
        const cols = [...colMap.entries()].sort((a, b) => a[0] - b[0]);
        return cols.map(([, v]) => isImageCell(v) ? '[image]' : v).join('\t');
    }).join('\n');

    // HTML table
    const htmlRows = sortedRows.map(([, colMap]) => {
        const cols = [...colMap.entries()].sort((a, b) => a[0] - b[0]);
        const tds = cols.map(([, v]) => {
            const display = isImageCell(v) ? '[image]' : escapeHtml(v);
            return `<td>${display}</td>`;
        }).join('');
        return `<tr>${tds}</tr>`;
    }).join('');
    const html = `<table>${htmlRows}</table>`;

    return { rowMap, tsv, html, count: selectedCells.length };
}
```

**Also add a tiny `escapeHtml` utility** (either inline or at module top):

```js
function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;');
}
```

---

### Step 2 — Ctrl+C: Write HTML + TSV to clipboard

Replace the existing TSV-only copy with a dual-format write using `navigator.clipboard.write()` and `ClipboardItem`.

```js
if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
    e.preventDefault();
    const selected = el.querySelectorAll('.cell-selected');
    if (!selected.length) return;

    const { tsv, html, count } = this._buildSelectionPayload(selected);

    const htmlBlob = new Blob([html], { type: 'text/html' });
    const textBlob = new Blob([tsv],  { type: 'text/plain' });
    await navigator.clipboard.write([
        new ClipboardItem({
            'text/html':  htmlBlob,
            'text/plain': textBlob,
        })
    ]);
    showToast(`copied ${count} cell${count > 1 ? 's' : ''}`, 'success');
}
```

**Why this works across apps:**
- **Excel / Google Sheets** — reads `text/html`, sees `<table>`, pastes as cells
- **Word / Google Docs / Notion** — reads `text/html`, renders a formatted table
- **Slack** — reads `text/html` for rich paste
- **VS Code / Notepad / Terminal** — falls back to `text/plain` (TSV)
- **Pasting back into Knotless** — handled by existing paste logic (text cells)

---

### Step 3 — Ctrl+X: Copy as HTML+TSV then clear all selected cells

Add a new `else if` branch right after the Ctrl+C block:

```js
if ((e.ctrlKey || e.metaKey) && e.key === 'x') {
    e.preventDefault();
    const selected = el.querySelectorAll('.cell-selected');
    if (!selected.length) return;

    const { rowMap, tsv, html, count } = this._buildSelectionPayload(selected);

    // 1. Write to clipboard (same dual-format as copy)
    const htmlBlob = new Blob([html], { type: 'text/html' });
    const textBlob = new Blob([tsv],  { type: 'text/plain' });
    try {
        await navigator.clipboard.write([
            new ClipboardItem({
                'text/html':  htmlBlob,
                'text/plain': textBlob,
            })
        ]);
    } catch {
        showToast('cut failed', 'error');
        return;
    }

    // 2. Clear each selected cell
    for (const [r, colMap] of rowMap) {
        for (const [col, val] of colMap) {
            // Delete image file if it's an image cell
            if (isImageCell(val)) {
                const imgPath = getImagePath(val);
                await window.electron.images.delete(imgPath).catch(() => {});
            }
            // Clear local data model
            if (this._table.data[r]) this._table.data[r][col] = '';
            // Clear DOM
            const cellEl = el.querySelector(`.cell[data-row="${r}"][data-col="${col}"]`);
            if (cellEl) {
                if (cellEl.classList.contains('has-image')) {
                    this._renderCellContent(cellEl, '');
                } else {
                    cellEl.textContent = '';
                }
            }
            // Persist to DB
            this._cb.onCellUpdate?.(this._table._id, r, col, '');
        }
    }

    // 3. Clear visual selection
    clearSelection();

    showToast(`cut ${count} cell${count > 1 ? 's' : ''}`, 'success');
}
```

---

### Step 4 — Escape key (no change needed)

The existing `if (e.key === 'Escape') { clearSelection(); }` stays as-is.

---

## File Changes Summary

| File | Action | What changes |
|------|--------|-------------|
| `src/components/table-card.js` | Modify | Add `_buildSelectionPayload()` method; add `escapeHtml()` util; rewrite Ctrl+C block to use HTML+TSV dual clipboard; add Ctrl+X block that copies then clears |

**Only one file changes.** Everything is self-contained in the TableCard component.

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Single cell selected via drag | Works — 1×1 HTML table + plain text. Same as single-cell copy but via selection path |
| Selection includes image cells | Image cells export as `[image]` in both HTML and TSV. Cut deletes the image files |
| Selection includes empty cells | Empty `<td></td>` in HTML, empty string in TSV. Cut is a no-op for those cells |
| Cut then Ctrl+Z | No undo support (consistent with single-cell cut). The cells are cleared permanently |
| Multiple tables on screen | Selection is scoped to `el.querySelectorAll('.cell-selected')` — only the table card that installed the handler. Each TableCard instance has its own listener scoped to its own `el` |
| ClipboardItem not supported | Electron uses Chromium which supports `ClipboardItem` since Chrome 76. Safe |

---

## Verification Checklist

- [ ] **Ctrl+C on multi-cell selection** → paste into Google Docs → renders as a table
- [ ] **Ctrl+C on multi-cell selection** → paste into Notepad/VS Code → renders as TSV
- [ ] **Ctrl+C on multi-cell selection** → paste into Excel/Sheets → populates cells correctly
- [ ] **Ctrl+X on multi-cell selection** → clipboard has HTML table + TSV, all selected cells cleared, toast "cut N cells"
- [ ] **Ctrl+X with image cells in selection** → image files deleted from disk, cells cleared
- [ ] **Cmd+C / Cmd+X on macOS** → same behavior (metaKey check already present)
- [ ] **Escape** → clears selection highlight (unchanged)
- [ ] **Single cell drag-select + Ctrl+C** → works (1×1 table)
- [ ] **No selection + Ctrl+C** → per-cell handler fires (not the group handler), unchanged behavior

---

## Implementation Order

1. Add `escapeHtml()` utility near top of file (or inline)
2. Add `_buildSelectionPayload()` method on TableCard
3. Rewrite the Ctrl+C block in `_installSelectionHandlers()` to use dual-format clipboard
4. Add the Ctrl+X block right after Ctrl+C
5. Test with multi-cell selection → paste into Google Docs, Sheets, Word, Notepad
