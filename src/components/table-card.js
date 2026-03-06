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

// — HTML escape util for clipboard HTML table —
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

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
            cell.tabIndex = 0;
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

        // Enter key blurs (no newlines in cells).
        // Ctrl/Cmd+C with no text selection → copy all cell text.
        // Ctrl/Cmd+X → cut cell content (copy + clear).
        cell.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter') { e.preventDefault(); cell.blur(); }

            if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
                const sel = window.getSelection();
                if (sel && sel.isCollapsed) {
                    // Nothing selected — copy the entire cell value
                    e.preventDefault();
                    const val = cell.textContent.trim();
                    if (val) {
                        navigator.clipboard.writeText(val)
                            .then(() => showToast('copied', 'success'))
                            .catch(() => showToast('copy failed', 'error'));
                    }
                }
                // If text is already selected, let the browser copy the selection.
            }

            if ((e.ctrlKey || e.metaKey) && e.key === 'x') {
                // Image cells: Ctrl+X cuts via _cutCell (browser default would do nothing useful)
                // Text cells with a selection: let browser handle the selection cut natively,
                //   unless nothing is selected — then cut the whole cell.
                if (cell.classList.contains('has-image')) {
                    e.preventDefault();
                    await this._cutCell(cell);
                } else {
                    const sel = window.getSelection();
                    if (sel && sel.isCollapsed) {
                        e.preventDefault();
                        await this._cutCell(cell);
                    }
                    // If text is selected, browser cuts the selection — leave it alone.
                }
            }
        });

        // Paste: text only into text cells, images only into empty cells.
        cell.addEventListener('paste', async (e) => {
            e.preventDefault();
            await this._handlePaste(e, cell);
        });

        // Double-click on text cells → select all text (like a normal editor).
        // Image cells: no action on double-click.
        cell.addEventListener('dblclick', (e) => {
            if (cell.classList.contains('has-image')) return;
            const range = document.createRange();
            range.selectNodeContents(cell);
            const sel = window.getSelection();
            sel?.removeAllRanges();
            sel?.addRange(range);
        });

        // Long-press (500ms): copy cell content (text or image).
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
        const { _id } = this._table;
        const row = parseInt(cell.dataset.row);
        const col = parseInt(cell.dataset.col);
        const isImg = cell.classList.contains('has-image');

        // ── RULE: image cells are read-only ──────────────────────────────────
        if (isImg) {
            showToast('image cells are read-only — long press to copy', 'error');
            return;
        }

        const items = e.clipboardData?.items ?? [];
        for (const item of items) {
            if (item.type.startsWith('image/')) {
                // ── RULE: can't add an image to a cell that already has text ─
                const existingText = cell.textContent.trim();
                if (existingText) {
                    showToast("can't add an image to a text cell — clear it first", 'error');
                    return;
                }
                // Empty cell — allow image paste
                const file = item.getAsFile();
                if (!file) return;
                const buf = await file.arrayBuffer();
                try {
                    const path = await window.electron.images.save(Array.from(new Uint8Array(buf)));
                    const imgVal = `${IMG_PREFIX}${path}`;
                    // Update local model and re-render immediately
                    if (this._table.data[row]) this._table.data[row][col] = imgVal;
                    this._renderCellContent(cell, imgVal);
                    this._cb.onCellUpdate?.(_id, row, col, imgVal);
                    showToast('image pasted', 'success');
                } catch {
                    showToast('failed to save image', 'error');
                }
                return;
            }
        }

        // Plain text paste into text / empty cell
        const text = e.clipboardData?.getData('text/plain') ?? '';
        if (text) {
            cell.textContent = text;
            // Place cursor at end
            const sel = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(cell);
            range.collapse(false);
            sel?.removeAllRanges();
            sel?.addRange(range);
            this._cb.onCellUpdate?.(_id, row, col, text);
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

    async _cutCell(cell) {
        const { _id } = this._table;
        const row = parseInt(cell.dataset.row);
        const col = parseInt(cell.dataset.col);
        const val = this._table.data?.[row]?.[col] ?? '';

        if (!val.trim()) return; // nothing to cut

        if (isImageCell(val)) {
            const imgPath = getImagePath(val);
            const fileName = imgPath.split('/').pop().split('\\').pop() || 'image';
            try {
                const url = await this._resolveImageUrl(imgPath);
                const res = await fetch(url);
                const blob = await res.blob();
                await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
            } catch {
                showToast('cut failed', 'error');
                return;
            }
            // Delete the image file from disk
            await window.electron.images.delete(imgPath).catch(() => {});
            // Clear cell
            if (this._table.data[row]) this._table.data[row][col] = '';
            this._renderCellContent(cell, '');
            this._cb.onCellUpdate?.(_id, row, col, '');
            showToast(`cut "${fileName}"`, 'success');
        } else {
            try {
                await navigator.clipboard.writeText(val);
            } catch {
                showToast('cut failed', 'error');
                return;
            }
            const preview = val.length > 24 ? val.substring(0, 24) + '…' : val;
            // Clear cell
            if (this._table.data[row]) this._table.data[row][col] = '';
            cell.textContent = '';
            this._cb.onCellUpdate?.(_id, row, col, '');
            showToast(`cut "${preview}"`, 'success');
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

    /**
     * Build clipboard payload from a NodeList of .cell-selected elements.
     * Returns { rowMap, tsv, html, count }
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

        const tsv = sortedRows.map(([, colMap]) => {
            const cols = [...colMap.entries()].sort((a, b) => a[0] - b[0]);
            return cols.map(([, v]) => isImageCell(v) ? '[image]' : v).join('\t');
        }).join('\n');

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

    _installSelectionHandlers() {
        const el = this._el;
        if (!el) return;

        const getCell = (target) => target.closest('.cell[data-row][data-col]');

        // True only after the pointer moves to a different cell — not on a plain click.
        // We defer disabling contentEditable until an actual cross-cell drag begins so
        // that single-click focus and double-click text-selection work naturally.
        let dragActive = false;

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
            dragActive = false;
            this._sel.active = false;
            this._sel.startRow = this._sel.endRow = this._sel.startCol = this._sel.endCol = -1;
            el.querySelectorAll('.cell-selected').forEach(c => c.classList.remove('cell-selected'));
            el.querySelectorAll('.cell:not(.has-image)').forEach(c => (c.contentEditable = 'true'));
        };

        el.addEventListener('mousedown', (e) => {
            const cell = getCell(e.target);
            if (!cell || e.button !== 0) return;

            dragActive = false;
            this._sel.active = true;
            this._sel.startRow = this._sel.endRow = parseInt(cell.dataset.row);
            this._sel.startCol = this._sel.endCol = parseInt(cell.dataset.col);

            // Do NOT disable contentEditable here — that would break single-click
            // focus and double-click text selection. We only disable it if the user
            // actually drags across multiple cells (handled in mousemove below).
        }, { capture: false });

        el.addEventListener('mousemove', (e) => {
            if (!this._sel.active) return;
            const cell = getCell(e.target);
            if (!cell) return;
            const r = parseInt(cell.dataset.row);
            const c = parseInt(cell.dataset.col);
            if (r !== this._sel.endRow || c !== this._sel.endCol) {
                if (!dragActive) {
                    // Cross-cell drag confirmed — now disable contentEditable to
                    // prevent text-cursor fighting with multi-cell selection.
                    dragActive = true;
                    el.querySelectorAll('.cell').forEach(c => (c.contentEditable = 'false'));
                }
                this._sel.endRow = r;
                this._sel.endCol = c;
                updateSelection();
            }
        });

        const finishSelection = (e) => {
            if (!this._sel.active) return;

            if (!dragActive) {
                // Plain click — clear any leftover multi-cell highlight and let the
                // browser handle focus naturally (contentEditable was never disabled).
                clearSelection();
            } else {
                // End of cross-cell drag — keep visual selection, restore editing.
                dragActive = false;
                this._sel.active = false;
                el.querySelectorAll('.cell:not(.has-image)').forEach(c => (c.contentEditable = 'true'));
            }
        };

        el.addEventListener('mouseup', finishSelection);

        // Ctrl/Cmd+C copies selected cells as HTML table + TSV fallback
        // Ctrl/Cmd+X copies then clears all selected cells
        document.addEventListener('keydown', async (e) => {
            const selected = el.querySelectorAll('.cell-selected');
            if (!selected.length) return;

            if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
                e.preventDefault();
                const { tsv, html, count } = this._buildSelectionPayload(selected);
                await navigator.clipboard.write([
                    new ClipboardItem({
                        'text/html':  new Blob([html], { type: 'text/html' }),
                        'text/plain': new Blob([tsv],  { type: 'text/plain' }),
                    })
                ]);
                showToast(`copied ${count} cell${count > 1 ? 's' : ''}`, 'success');
            }

            if ((e.ctrlKey || e.metaKey) && e.key === 'x') {
                e.preventDefault();
                const { rowMap, tsv, html, count } = this._buildSelectionPayload(selected);
                try {
                    await navigator.clipboard.write([
                        new ClipboardItem({
                            'text/html':  new Blob([html], { type: 'text/html' }),
                            'text/plain': new Blob([tsv],  { type: 'text/plain' }),
                        })
                    ]);
                } catch {
                    showToast('cut failed', 'error');
                    return;
                }
                // Clear every selected cell
                for (const [r, colMap] of rowMap) {
                    for (const [col, val] of colMap) {
                        if (isImageCell(val)) {
                            await window.electron.images.delete(getImagePath(val)).catch(() => {});
                        }
                        if (this._table.data[r]) this._table.data[r][col] = '';
                        const cellEl = el.querySelector(`.cell[data-row="${r}"][data-col="${col}"]`);
                        if (cellEl) {
                            if (cellEl.classList.contains('has-image')) {
                                this._renderCellContent(cellEl, '');
                            } else {
                                cellEl.textContent = '';
                            }
                        }
                        this._cb.onCellUpdate?.(this._table._id, r, col, '');
                    }
                }
                clearSelection();
                showToast(`cut ${count} cell${count > 1 ? 's' : ''}`, 'success');
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
