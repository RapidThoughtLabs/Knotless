/**
 * Table Card — RTL Knotless V2
 *
 * Renders a complete TableNote card:
 *   [optional top accent bar for pinned]
 *   [grid of rows × columns, each cell is contenteditable or image]
 *   [table footer]
 *
 * Ref: V2 HTML lines 147-265
 */

import { TableFooter } from './table-footer.js';
import { HIGHLIGHT_COLORS } from './context-menu.js';
import { showToast } from './toast.js';

// — Image cell detection helpers —
const IMG_PREFIX = 'IMG:';
function isImageCell(val) { return typeof val === 'string' && val.startsWith(IMG_PREFIX); }
function getImagePath(val) { return val.slice(IMG_PREFIX.length); }

// — Cell content-type class detection —
const URL_PATTERN = /^https?:\/\//i;
const CODE_PATTERN = /^[`'"!@#\$]{1}|sk-|ghp_|sk-ant/;
const PATH_PATTERN = /^[~\/\\]|^[A-Z]:\\/;

function cellTypeClass(val) {
    if (!val || !val.trim()) return 'empty';
    if (URL_PATTERN.test(val)) return 'has-url';
    if (CODE_PATTERN.test(val)) return 'has-code';
    if (PATH_PATTERN.test(val)) return 'has-path';
    return '';
}

// — Build highlight CSS class from key —
function hlClass(key) {
    const found = HIGHLIGHT_COLORS.find(h => h.key === key);
    return found ? key : '';
}

export class TableCard {
    /**
     * @param {Object} table - Full table document from DB
     * @param {Object} callbacks
     * @param {Function} callbacks.onCellUpdate   - (tableId, row, col, value) => void
     * @param {Function} callbacks.onCheckedUpdate - (tableId, rowIndex, checked) => void
     * @param {Function} callbacks.onHighlight    - (tableId, row, col, highlightKey) => void
     * @param {Function} callbacks.onContextMenu  - (e, cellEl) => void
     * @param {Function} callbacks.onNameChange   - (tableId, name) => void
     * @param {Function} callbacks.onAddRow       - (tableId) => void
     * @param {Function} callbacks.onOptions      - (btnEl, tableId, tableData) => void
     */
    constructor(table, callbacks = {}) {
        this._table = table;
        this._cb = callbacks;
        this._el = null;
        this._footer = null;
        // Long-press state
        this._lpTimer = null;
        // Multi-cell selection state
        this._sel = { active: false, startRow: -1, startCol: -1, endRow: -1, endCol: -1 };
        // Resize drag state
        this._resizeDrag = { active: false, startY: 0, startH: 0 };
    }

    /** Build and return the card element */
    create() {
        const { _id, columns, data = [], pinned, checklist, checked = [], highlights = {} } = this._table;

        const el = document.createElement('div');
        el.className = `table-card${pinned ? ' pinned' : ''}`;
        el.dataset.tableId = _id;

        // ── Grid ─────────────────────────────────────────────────────────────
        const grid = document.createElement('div');
        grid.className = 'table-grid';

        data.forEach((row, rIdx) => {
            const rowEl = document.createElement('div');
            rowEl.className = 'table-row';
            rowEl.style.gridTemplateColumns = checklist
                ? `36px repeat(${columns}, 1fr)`
                : `repeat(${columns}, 1fr)`;

            // Checklist checkbox cell
            if (checklist) {
                const checkCell = document.createElement('div');
                checkCell.className = 'cell-check';
                checkCell.dataset.row = rIdx;
                checkCell.dataset.tableId = _id;

                const box = document.createElement('div');
                box.className = `checkbox${checked[rIdx] ? ' checked' : ''}`;
                box.textContent = checked[rIdx] ? '✓' : '';
                checkCell.appendChild(box);

                checkCell.addEventListener('click', () => this._toggleCheck(rIdx));
                rowEl.appendChild(checkCell);
            }

            // Data cells
            for (let cIdx = 0; cIdx < columns; cIdx++) {
                const val = row[cIdx] ?? '';
                const hlKey = highlights[`${rIdx}-${cIdx}`];

                const cellEl = this._buildCell(val, rIdx, cIdx, hlKey);
                rowEl.appendChild(cellEl);
            }

            grid.appendChild(rowEl);
        });

        el.appendChild(grid);

        // ── Footer ────────────────────────────────────────────────────────────
        this._footer = new TableFooter(this._table, {
            onNameChange: this._cb.onNameChange,
            onAddRow: this._cb.onAddRow,
            onOptions: this._cb.onOptions,
            onMoveUp: this._cb.onMoveUp,
        });
        el.appendChild(this._footer.create());

        // ── Apply saved card height ────────────────────────────────────────────
        if (this._table.cardHeight) {
            el.style.height = `${this._table.cardHeight}px`;
            el.classList.add('resizable');
        }

        this._el = el;

        // After el is assigned, wire up interactive handlers
        this._installSelectionHandlers();
        this._installResizeHandle();

        return el;
    }

    /** Re-render the entire card (e.g. after columns change) */
    rerender(newTable) {
        this._table = newTable;
        const oldEl = this._el;
        const newEl = this.create();
        oldEl?.parentNode?.replaceChild(newEl, oldEl);
        return newEl;
    }

    /** Update cell value in-place (fast path for single cell edits) */
    updateCell(row, col, value) {
        const cellEl = this._el?.querySelector(`[data-row="${row}"][data-col="${col}"]`);
        if (!cellEl) return;
        this._renderCellContent(cellEl, value);
    }

    /** Update highlight on a specific cell */
    updateHighlight(row, col, hlKey) {
        const cellEl = this._el?.querySelector(`[data-row="${row}"][data-col="${col}"]`);
        if (!cellEl) return;
        // Remove old highlight classes
        HIGHLIGHT_COLORS.forEach(h => cellEl.classList.remove(h.key));
        if (hlKey) cellEl.classList.add(hlKey);
    }

    // ── Private helpers ──────────────────────────────────────────────────────

    _buildCell(val, rIdx, cIdx, hlKey) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.row = rIdx;
        cell.dataset.col = cIdx;
        cell.dataset.tableId = this._table._id;

        if (hlKey) cell.classList.add(hlKey);

        this._renderCellContent(cell, val);
        this._bindCellEvents(cell);
        return cell;
    }

    _renderCellContent(cell, val) {
        // Clear existing content-type classes
        HIGHLIGHT_COLORS.forEach(h => { }); // highlights are stored separately
        ['empty', 'has-url', 'has-code', 'has-path', 'has-image'].forEach(c => cell.classList.remove(c));
        cell.contentEditable = 'false';

        if (isImageCell(val)) {
            cell.classList.add('has-image');
            cell.contentEditable = 'false';
            const imgPath = getImagePath(val);
            cell.innerHTML = `<img class="cell-image" src="" alt="cell image" />`;
            // Resolve file:// URL for cross-platform display
            this._resolveImageUrl(imgPath).then(url => {
                const img = cell.querySelector('img');
                if (img) img.src = url;
            });
        } else {
            const cls = cellTypeClass(val);
            if (cls) cell.classList.add(cls);
            cell.contentEditable = 'true';
            cell.textContent = val;
        }
    }

    async _resolveImageUrl(filePath) {
        try {
            if (window.electron?.pathUtils?.toFileUrl) {
                return await window.electron.pathUtils.toFileUrl(filePath);
            }
            return filePath;
        } catch {
            return filePath;
        }
    }

    _bindCellEvents(cell) {
        const { _id } = this._table;

        // Focus / editable
        cell.addEventListener('focus', () => {
            cell.classList.add('focused');
        });

        // Blur → save
        cell.addEventListener('blur', async () => {
            cell.classList.remove('focused');
            if (cell.classList.contains('has-image')) return;
            const row = parseInt(cell.dataset.row);
            const col = parseInt(cell.dataset.col);
            const val = cell.textContent ?? '';
            this._cb.onCellUpdate?.(_id, row, col, val);
        });

        // Enter key blurs (no newlines in cells)
        cell.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); cell.blur(); }
        });

        // Paste: text or image
        cell.addEventListener('paste', async (e) => {
            e.preventDefault();
            await this._handlePaste(e, cell);
        });

        // Double-click: image cells → copy, text cells → paste from clipboard
        cell.addEventListener('dblclick', async (e) => {
            e.preventDefault();
            if (cell.classList.contains('has-image')) {
                await this._copyCell(cell);
            } else {
                await this._handlePasteFromClipboard(cell);
            }
        });

        // Long-press (500ms): copy content
        cell.addEventListener('pointerdown', () => {
            this._lpTimer = setTimeout(() => this._copyCell(cell), 500);
        });
        cell.addEventListener('pointerup', () => clearTimeout(this._lpTimer));
        cell.addEventListener('pointerleave', () => clearTimeout(this._lpTimer));

        // Right-click → context menu
        cell.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this._cb.onContextMenu?.(e, cell);
        });
    }

    async _handlePaste(e, cell) {
        const row = parseInt(cell.dataset.row);
        const col = parseInt(cell.dataset.col);
        const isImg = cell.classList.contains('has-image');

        // Try clipboard items API (images)
        const items = e.clipboardData?.items ?? [];
        for (const item of items) {
            if (item.type.startsWith('image/')) {
                if (!isImg) {
                    // Can only paste image into cell that's empty or already an image
                    const text = cell.textContent.trim();
                    if (text) { showToast('clear cell before pasting image', 'error'); return; }
                }
                const file = item.getAsFile();
                if (!file) return;
                const buf = await file.arrayBuffer();
                try {
                    const path = await window.electron.images.save(Array.from(new Uint8Array(buf)));
                    const imgVal = `${IMG_PREFIX}${path}`;
                    this._cb.onCellUpdate?.(_id, row, col, imgVal);
                    showToast('image pasted', 'success');
                } catch (err) {
                    showToast('failed to save image', 'error');
                }
                return;
            }
        }

        // Plain text
        if (isImg) { showToast('clear cell before pasting text', 'error'); return; }
        const text = e.clipboardData?.getData('text/plain') ?? '';
        if (text) {
            cell.textContent = text;
            // collapseToEnd so cursor is at end
            const sel = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(cell);
            range.collapse(false);
            sel?.removeAllRanges();
            sel?.addRange(range);
            this._cb.onCellUpdate?.(this._table._id, row, col, text);
        }
    }

    async _handlePasteFromClipboard(cell) {
        try {
            const items = await navigator.clipboard.read();
            for (const item of items) {
                const imgType = item.types.find(t => t.startsWith('image/'));
                if (imgType) {
                    const blob = await item.getType(imgType);
                    const buf = await blob.arrayBuffer();
                    const path = await window.electron.images.save(Array.from(new Uint8Array(buf)));
                    const row = parseInt(cell.dataset.row);
                    const col = parseInt(cell.dataset.col);
                    const imgVal = `${IMG_PREFIX}${path}`;
                    this._cb.onCellUpdate?.(this._table._id, row, col, imgVal);
                    // Update the local data model so rerender picks it up
                    if (this._table.data[row]) this._table.data[row][col] = imgVal;
                    // Render the image in the cell immediately
                    this._renderCellContent(cell, imgVal);
                    showToast('image pasted', 'success');
                    return;
                }
            }
            const text = await navigator.clipboard.readText();
            if (text) {
                const row = parseInt(cell.dataset.row);
                const col = parseInt(cell.dataset.col);
                // Update local data model
                if (this._table.data[row]) this._table.data[row][col] = text;
                // Update DOM immediately
                cell.textContent = text;
                this._renderCellContent(cell, text);
                this._cb.onCellUpdate?.(this._table._id, row, col, text);
                showToast('pasted', 'success');
            }
        } catch (err) {
            showToast('clipboard read failed', 'error');
        }
    }

    async _copyCell(cell) {
        const row = parseInt(cell.dataset.row);
        const col = parseInt(cell.dataset.col);
        const val = this._table.data?.[row]?.[col] ?? '';
        if (isImageCell(val)) {
            // Copy image file to clipboard if possible
            try {
                const path = getImagePath(val);
                const fileName = path.split('/').pop().split('\\').pop() || 'image';
                const url = await this._resolveImageUrl(path);
                const res = await fetch(url);
                const blob = await res.blob();
                await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
                showToast(`copied "${fileName}"`, 'success');
            } catch { showToast('copy failed', 'error'); }
        } else {
            if (!val.trim()) return; // nothing to copy
            await navigator.clipboard.writeText(val);
            const preview = val.length > 24 ? val.substring(0, 24) + '…' : val;
            showToast(`copied "${preview}"`, 'success');
        }
    }

    _toggleCheck(rowIndex) {
        const { _id, checked = [] } = this._table;
        const newChecked = [...checked];
        newChecked[rowIndex] = !newChecked[rowIndex];
        this._table = { ...this._table, checked: newChecked };

        // Update checkbox UI
        const box = this._el?.querySelector(`[data-row="${rowIndex}"].cell-check .checkbox`);
        if (box) {
            box.classList.toggle('checked', newChecked[rowIndex]);
            box.textContent = newChecked[rowIndex] ? '\u2713' : '';
        }

        // Update dial
        const total = this._table.data?.length ?? 0;
        this._footer?.updateDial(newChecked, total);

        this._cb.onCheckedUpdate?.(_id, rowIndex, newChecked[rowIndex]);
    }

    // ── Multi-cell drag selection ──────────────────────────────────────────

    _installSelectionHandlers() {
        const el = this._el;
        if (!el) return;

        const getCell = (target) => target.closest('.cell[data-row][data-col]');

        const updateSelection = () => {
            const { startRow, endRow, startCol, endCol } = this._sel;
            const minR = Math.min(startRow, endRow);
            const maxR = Math.max(startRow, endRow);
            const minC = Math.min(startCol, endCol);
            const maxC = Math.max(startCol, endCol);

            el.querySelectorAll('.cell').forEach(c => {
                const r = parseInt(c.dataset.row);
                const col = parseInt(c.dataset.col);
                const inRange = r >= minR && r <= maxR && col >= minC && col <= maxC;
                c.classList.toggle('cell-selected', inRange);
            });
        };

        const clearSelection = () => {
            this._sel.active = false;
            this._sel.startRow = this._sel.endRow = this._sel.startCol = this._sel.endCol = -1;
            el.querySelectorAll('.cell-selected').forEach(c => c.classList.remove('cell-selected'));
            // Restore contenteditable
            el.querySelectorAll('.cell:not(.has-image)').forEach(c => (c.contentEditable = 'true'));
        };

        el.addEventListener('mousedown', (e) => {
            const cell = getCell(e.target);
            if (!cell) return;
            // Start selection only with primary button
            if (e.button !== 0) return;

            this._sel.active = true;
            this._sel.startRow = this._sel.endRow = parseInt(cell.dataset.row);
            this._sel.startCol = this._sel.endCol = parseInt(cell.dataset.col);

            // Disable contenteditable on all cells to prevent text-selection fighting
            el.querySelectorAll('.cell').forEach(c => (c.contentEditable = 'false'));
        }, { capture: false });

        el.addEventListener('mousemove', (e) => {
            if (!this._sel.active) return;
            const cell = getCell(e.target);
            if (!cell) return;
            const r = parseInt(cell.dataset.row);
            const c = parseInt(cell.dataset.col);
            if (r !== this._sel.endRow || c !== this._sel.endCol) {
                this._sel.endRow = r;
                this._sel.endCol = c;
                updateSelection();
            }
        });

        const finishSelection = (e) => {
            if (!this._sel.active) return;
            const cell = getCell(e.target);

            // If start === end (single cell click), clear and restore edit mode
            const singleCell = this._sel.startRow === this._sel.endRow
                && this._sel.startCol === this._sel.endCol;

            if (singleCell) {
                clearSelection();
                // Re-focus the clicked cell for editing
                if (cell && !cell.classList.contains('has-image')) {
                    cell.contentEditable = 'true';
                    cell.focus();
                }
            } else {
                this._sel.active = false;
                // Keep selection highlighted but restore edit mode to individual cells
                el.querySelectorAll('.cell:not(.has-image)').forEach(c => (c.contentEditable = 'true'));
            }
        };

        el.addEventListener('mouseup', finishSelection);

        // Ctrl/Cmd+C copies selected cells as TSV
        document.addEventListener('keydown', async (e) => {
            const selected = el.querySelectorAll('.cell-selected');
            if (!selected.length) return;

            if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
                e.preventDefault();
                // Gather into a 2D map
                const rowMap = new Map();
                selected.forEach(c => {
                    const r = parseInt(c.dataset.row);
                    const col = parseInt(c.dataset.col);
                    if (!rowMap.has(r)) rowMap.set(r, new Map());
                    const val = this._table.data?.[r]?.[col] ?? '';
                    rowMap.get(r).set(col, isImageCell(val) ? '[image]' : val);
                });
                const rows = [...rowMap.entries()].sort((a, b) => a[0] - b[0]);
                const tsv = rows.map(([, colMap]) => {
                    const cols = [...colMap.entries()].sort((a, b) => a[0] - b[0]);
                    return cols.map(([, v]) => v).join('\t');
                }).join('\n');
                await navigator.clipboard.writeText(tsv);
                showToast(`copied ${selected.length} cell${selected.length > 1 ? 's' : ''}`, 'success');
            }

            if (e.key === 'Escape') {
                clearSelection();
            }
        });

        // Click outside clears selection
        document.addEventListener('mousedown', (e) => {
            if (!el.contains(e.target)) clearSelection();
        }, { capture: true });
    }

    // ── Bottom-edge resize handle ───────────────────────────────────────────

    _installResizeHandle() {
        const el = this._el;
        if (!el) return;

        const HANDLE_ZONE = 5; // px from bottom edge that acts as drag handle
        const MIN_HEIGHT = 68; // ~1 row + footer

        el.addEventListener('mousemove', (e) => {
            if (this._resizeDrag.active) return;
            const rect = el.getBoundingClientRect();
            const nearBottom = e.clientY >= rect.bottom - HANDLE_ZONE;
            el.style.cursor = nearBottom ? 'ns-resize' : '';
        });

        el.addEventListener('mouseleave', () => {
            if (!this._resizeDrag.active) el.style.cursor = '';
        });

        el.addEventListener('mousedown', (e) => {
            const rect = el.getBoundingClientRect();
            const nearBottom = e.clientY >= rect.bottom - HANDLE_ZONE;
            if (!nearBottom) return;

            e.preventDefault();
            e.stopPropagation();

            // Snapshot the natural (unconstrained) content height BEFORE locking
            const savedH = el.style.height;
            el.style.height = '';
            el.classList.remove('resizable');
            this._resizeDrag.naturalH = el.scrollHeight;
            el.style.height = savedH;
            el.classList.add('resizable');

            this._resizeDrag.active = true;
            this._resizeDrag.startY = e.clientY;
            this._resizeDrag.startH = rect.height;
            el.style.userSelect = 'none';
        }, { capture: false });

        const onMouseMove = (e) => {
            if (!this._resizeDrag.active) return;
            const delta = e.clientY - this._resizeDrag.startY;
            const maxH = this._resizeDrag.naturalH;
            const newH = Math.max(MIN_HEIGHT, Math.min(maxH, this._resizeDrag.startH + delta));
            this._el.style.height = `${newH}px`;
            this._el.style.cursor = 'ns-resize';
        };

        const onMouseUp = (e) => {
            if (!this._resizeDrag.active) return;
            this._resizeDrag.active = false;
            this._el.style.userSelect = '';
            this._el.style.cursor = '';
            const finalH = parseFloat(this._el.style.height) || null;
            if (finalH && finalH !== this._resizeDrag.startH) {
                this._cb.onResize?.(this._table._id, finalH);
            }
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }
}
