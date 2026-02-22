/**
 * App — RTL Knotless V2
 *
 * Main orchestrator. Replaces the old 1678-line src/main.js.
 * Initialises the RTL Theme Engine, mounts all components,
 * and wires their events to DB + IPC calls.
 */

import { RTLThemeEngine } from './rtl-theme/rtl-theme-engine.js';
import { Topbar } from './components/topbar.js';
import { AppFooter } from './components/app-footer.js';
import { TableCard } from './components/table-card.js';
import { CellContextMenu } from './components/context-menu.js';
import { TableOptionsMenu } from './components/table-options-menu.js';
import { SettingsModal } from './components/settings-modal.js';
import { showAddTableModal, showConfirm } from './components/modals.js';
import { showToast, setToastPosition } from './components/toast.js';

// ── Shorthand for Electron IPC ───────────────────────────────────────────────
const db = () => window.electron?.database;
const settings = () => window.electron?.settings;

// ── App State ────────────────────────────────────────────────────────────────
let currentFilter = 'recents';
let tables = [];         // current array of loaded table docs
let tableCards = new Map();  // tableId → TableCard instance

// ── Components (module-level singletons) ─────────────────────────────────────
let topbar;
let appFooter;
let cellCtxMenu;
let tableOptsMenu;
let settingsModal;
let themeEngine;

// ── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
    // 1 — Theme Engine (must be first — sets data-mode / data-accent on <html>)
    themeEngine = new RTLThemeEngine({
        load: async () => {
            const s = await settings()?.get();
            return s?.theme ?? null;
        },
        persist: async (cfg) => {
            if (!settings()) return;
            await settings().update('theme.mode', cfg.mode);
            await settings().update('theme.accent', cfg.accent);
            await settings().update('theme.gridMode', cfg.gridMode);
        },
    });
    await themeEngine.init();

    // 1.5 — Apply saved toast position before any toast fires
    try {
        const savedSettings = await settings()?.get();
        const toastPos = savedSettings?.general?.toastPosition ?? 'titlebar';
        setToastPosition(toastPos);
    } catch { /* no settings yet — use default */ }

    // 2 — Topbar
    topbar = new Topbar();
    topbar.mount(document.getElementById('topbar'));

    // 3 — App footer
    appFooter = new AppFooter();
    appFooter.mount(document.getElementById('app-footer'));

    // 4 — Cell context menu (singleton)
    cellCtxMenu = new CellContextMenu({ onAction: handleCellAction });
    cellCtxMenu.mount();

    // 5 — Table options menu (singleton)
    tableOptsMenu = new TableOptionsMenu(handleTableAction);
    tableOptsMenu.mount();

    // 6 — Settings modal
    settingsModal = new SettingsModal(themeEngine, settings());
    settingsModal.mount();

    // 7 — Wire topbar events
    document.addEventListener('rtl:filter-change', (e) => {
        currentFilter = e.detail.filter;
        loadTables();
        topbar.setFilter(currentFilter);
    });
    document.addEventListener('rtl:add-click', handleAddTable);
    document.addEventListener('rtl:settings-click', () => settingsModal.toggle());

    // 8 — Initial table load
    await loadTables();
});

// ── Table Loading ─────────────────────────────────────────────────────────────

async function loadTables() {
    try {
        // Map filter label → DB type
        const typeMap = { recents: 'recent', starred: 'starred', archives: 'archives' };
        const dbType = typeMap[currentFilter] ?? 'recent';

        tables = await db().getByType(dbType);
        renderAll();
    } catch (err) {
        console.error('[App] Failed to load tables:', err);
        showToast('failed to load tables', 'error');
    }
}

function renderAll() {
    const content = document.getElementById('content');
    content.innerHTML = '';
    tableCards.clear();

    if (tables.length === 0) {
        content.innerHTML = `
            <div class="empty-state">
                <div class="empty-title">no tables yet</div>
                <div class="empty-sub">press <span>+ add</span> to create one</div>
            </div>`;
    } else {
        tables.forEach(table => {
            const card = new TableCard(table, {
                onCellUpdate: handleCellUpdate,
                onCheckedUpdate: handleCheckedUpdate,
                onHighlight: handleHighlight,
                onContextMenu: (e, cellEl) => {
                    cellCtxMenu.show(e.clientX, e.clientY, cellEl);
                },
                onNameChange: handleNameChange,
                onAddRow: handleAddRow,
                onOptions: (btnEl, tableId, tableData) => {
                    tableOptsMenu.show(btnEl, tableId, tableData);
                },
                onMoveUp: handleMoveUp,
                onResize: handleResize,
            });
            const el = card.create();
            tableCards.set(table._id, card);
            content.appendChild(el);
        });
    }

    // Update footer
    appFooter.update({ count: tables.length, filter: currentFilter });
}

// ── Cell Handlers ─────────────────────────────────────────────────────────────

async function handleCellUpdate(tableId, row, col, value) {
    const table = tables.find(t => t._id === tableId);
    if (!table) return;

    // Update local state
    if (!table.data[row]) table.data[row] = [];
    table.data[row][col] = value;

    appFooter.setSaving();
    try {
        await db().update(tableId, { data: table.data });
        appFooter.setSaved();
    } catch (err) {
        console.error('[App] Cell update failed:', err);
        showToast('save failed', 'error');
    }
}

async function handleCheckedUpdate(tableId, rowIndex, isChecked) {
    const table = tables.find(t => t._id === tableId);
    if (!table) return;
    table.checked = table.checked ?? [];
    table.checked[rowIndex] = isChecked;

    try {
        await db().update(tableId, { checked: table.checked });
    } catch (err) {
        console.error('[App] Checked update failed:', err);
    }
}

async function handleHighlight(tableId, row, col, hlKey) {
    const table = tables.find(t => t._id === tableId);
    if (!table) return;
    table.highlights = table.highlights ?? {};
    table.highlights[`${row}-${col}`] = hlKey;

    // Update cell class in-place
    const card = tableCards.get(tableId);
    card?.updateHighlight(row, col, hlKey);

    try {
        await db().update(tableId, { highlights: table.highlights });
    } catch (err) {
        console.error('[App] Highlight update failed:', err);
    }
}

async function handleNameChange(tableId, newName) {
    const table = tables.find(t => t._id === tableId);
    if (!table) return;
    table.name = newName;
    try {
        await db().update(tableId, { name: newName });
    } catch (err) {
        console.error('[App] Name update failed:', err);
    }
}

async function handleAddRow(tableId) {
    const table = tables.find(t => t._id === tableId);
    if (!table) return;
    const newRow = Array(table.columns).fill('');
    table.data.push(newRow);
    table.checked = [...(table.checked ?? []), false];

    try {
        await db().update(tableId, { data: table.data, checked: table.checked });
        // Re-render the card
        const card = tableCards.get(tableId);
        if (card) {
            const newEl = card.rerender(table);
            tableCards.set(tableId, card);
        }
        showToast('row added', 'success');
    } catch (err) {
        showToast('failed to add row', 'error');
    }
}

// ── Move pinned table up one position ─────────────────────────────────────────

async function handleMoveUp(tableId) {
    const table = tables.find(t => t._id === tableId);
    if (!table || !table.pinned) return;

    // Find this card and the one above it in the DOM
    const content = document.getElementById('content');
    const cards = [...content.querySelectorAll('.table-card[data-table-id]')];
    const thisCard = cards.find(c => c.dataset.tableId === tableId);
    if (!thisCard) return;
    const thisIdx = cards.indexOf(thisCard);
    if (thisIdx <= 0) return; // already first

    const aboveCard = cards[thisIdx - 1];
    const aboveId = aboveCard.dataset.tableId;
    const aboveTable = tables.find(t => t._id === aboveId);
    if (!aboveTable) return;

    // Animate the visual swap
    const thisRect = thisCard.getBoundingClientRect();
    const aboveRect = aboveCard.getBoundingClientRect();
    const deltaY = thisRect.top - aboveRect.top;

    thisCard.style.transition = 'transform 0.25s ease';
    aboveCard.style.transition = 'transform 0.25s ease';
    thisCard.style.transform = `translateY(-${deltaY}px)`;
    aboveCard.style.transform = `translateY(${deltaY}px)`;

    // After animation, swap in DOM and persist
    setTimeout(async () => {
        thisCard.style.transition = '';
        thisCard.style.transform = '';
        aboveCard.style.transition = '';
        aboveCard.style.transform = '';

        // Swap in DOM
        content.insertBefore(thisCard, aboveCard);

        // Assign fresh sortOrder: higher = rendered first (sorted descending)
        const now = Date.now();
        const newThisOrder = now + 1;
        const newAboveOrder = now;

        try {
            await Promise.all([
                db().update(tableId, { sortOrder: newThisOrder }),
                db().update(aboveId, { sortOrder: newAboveOrder }),
            ]);
            table.sortOrder = newThisOrder;
            aboveTable.sortOrder = newAboveOrder;
        } catch (err) {
            console.error('[App] handleMoveUp failed:', err);
            showToast('could not reorder', 'error');
        }
    }, 260);
}

// ── Persist card height to DB ──────────────────────────────────────────────────

async function handleResize(tableId, height) {
    const table = tables.find(t => t._id === tableId);
    if (!table) return;
    table.cardHeight = height;
    try {
        await db().update(tableId, { cardHeight: height });
    } catch (err) {
        console.error('[App] handleResize failed:', err);
    }
}

// ── Cell Context Menu Action Handlers ─────────────────────────────────────────

async function handleCellAction(action, cellEl, extra) {
    const tableId = cellEl.dataset.tableId;
    const row = parseInt(cellEl.dataset.row);
    const col = parseInt(cellEl.dataset.col);
    const table = tables.find(t => t._id === tableId);
    if (!table) return;

    const IMG_PREFIX = 'IMG:';
    const isImageCell = (v) => typeof v === 'string' && v.startsWith(IMG_PREFIX);
    const currentVal = table.data?.[row]?.[col] ?? '';

    switch (action) {
        case 'copy': {
            if (isImageCell(currentVal)) {
                try {
                    const path = currentVal.slice(IMG_PREFIX.length);
                    const url = await window.electron.pathUtils.toFileUrl(path);
                    const res = await fetch(url);
                    const blob = await res.blob();
                    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
                    showToast('image copied', 'success');
                } catch { showToast('copy failed', 'error'); }
            } else {
                await navigator.clipboard.writeText(currentVal);
                showToast(`copied`, 'success');
            }
            break;
        }

        case 'paste': {
            try {
                const items = await navigator.clipboard.read();
                for (const item of items) {
                    const imgType = item.types.find(t => t.startsWith('image/'));
                    if (imgType) {
                        if (currentVal && !isImageCell(currentVal)) {
                            showToast('clear cell before pasting image', 'error');
                            return;
                        }
                        const blob = await item.getType(imgType);
                        const buf = await blob.arrayBuffer();
                        const path = await window.electron.images.save(Array.from(new Uint8Array(buf)));
                        await handleCellUpdate(tableId, row, col, `${IMG_PREFIX}${path}`);
                        showToast('image pasted', 'success');
                        await loadTables();
                        return;
                    }
                }
                const text = await navigator.clipboard.readText();
                if (text) {
                    if (isImageCell(currentVal)) { showToast('clear cell first', 'error'); return; }
                    await handleCellUpdate(tableId, row, col, text);
                    // Update cell text in-place
                    cellEl.textContent = text;
                }
            } catch { showToast('paste failed', 'error'); }
            break;
        }

        case 'clear': {
            if (isImageCell(currentVal)) {
                const imgPath = currentVal.slice(IMG_PREFIX.length);
                try { await window.electron.images.delete(imgPath); } catch { }
            }
            await handleCellUpdate(tableId, row, col, '');
            await loadTables();
            showToast('cell cleared', 'info');
            break;
        }

        case 'highlight': {
            await handleHighlight(tableId, row, col, extra);
            break;
        }

        case 'clear-highlight': {
            await handleHighlight(tableId, row, col, null);
            break;
        }

        case 'delete-row': {
            if ((table.data?.length ?? 0) <= 1) {
                showToast('cannot delete — only 1 row remaining', 'error');
                return;
            }
            const hasData = table.data[row].some(v => v && v.trim());
            if (hasData) {
                const ok = await showConfirm('delete this row? data will be <strong>lost permanently.</strong>', 'delete', true);
                if (!ok) return;
            }
            table.data.splice(row, 1);
            if (table.checked) table.checked.splice(row, 1);
            // Clean up highlights for this row and reindex
            const newHighlights = {};
            Object.entries(table.highlights ?? {}).forEach(([key, val]) => {
                const [r, c] = key.split('-').map(Number);
                if (r !== row) newHighlights[`${r > row ? r - 1 : r}-${c}`] = val;
            });
            table.highlights = newHighlights;

            await db().update(tableId, { data: table.data, checked: table.checked, highlights: table.highlights });
            await loadTables();
            showToast('row deleted', 'info');
            break;
        }
    }
}

// ── Table Options Handlers ─────────────────────────────────────────────────────

async function handleTableAction(action, tableId) {
    const table = tables.find(t => t._id === tableId);
    if (!table) return;

    switch (action) {
        case 'pin':
        case 'unpin': {
            const pinned = action === 'pin';
            await db().update(tableId, { pinned });
            showToast(pinned ? 'pinned to top ↑' : 'unpinned', 'success');
            await loadTables();
            break;
        }

        case 'add-col': {
            const maxCols = 10;
            if (table.columns >= maxCols) { showToast(`max ${maxCols} columns`, 'info'); return; }
            const newData = table.data.map(row => [...row, '']);
            await db().update(tableId, { columns: table.columns + 1, data: newData });
            showToast('column added', 'success');
            await loadTables();
            break;
        }

        case 'remove-col': {
            if (table.columns <= 1) { showToast('minimum 1 column', 'info'); return; }
            const lastColIdx = table.columns - 1;
            const hasData = table.data.some(row => row[lastColIdx] && row[lastColIdx].trim());
            if (hasData) {
                const ok = await showConfirm(
                    `remove column <strong>${table.columns}</strong>? data will be <strong>lost permanently.</strong>`,
                    'remove', true
                );
                if (!ok) return;
            }
            // Clean up images in the removed column
            for (const row of table.data) {
                const val = row[lastColIdx];
                if (typeof val === 'string' && val.startsWith('IMG:')) {
                    try { await window.electron.images.delete(val.slice(4)); } catch { }
                }
            }
            // Remove highlights for the removed column
            const newHighlights = {};
            Object.entries(table.highlights ?? {}).forEach(([key, val]) => {
                const [r, c] = key.split('-').map(Number);
                if (c !== lastColIdx) newHighlights[key] = val;
            });
            const newData = table.data.map(row => row.slice(0, lastColIdx));
            await db().update(tableId, { columns: table.columns - 1, data: newData, highlights: newHighlights });
            showToast('column removed', 'info');
            await loadTables();
            break;
        }

        case 'toggle-checklist': {
            const checklist = !table.checklist;
            await db().update(tableId, { checklist });
            showToast(checklist ? 'checklist on' : 'checklist off', 'success');
            await loadTables();
            break;
        }

        case 'star': {
            await db().update(tableId, { type: 'starred' });
            showToast('moved to starred ★', 'success');
            await loadTables();
            break;
        }

        case 'archive': {
            await db().update(tableId, { type: 'archives' });
            showToast('sent to archives', 'info');
            await loadTables();
            break;
        }

        case 'move-recents': {
            await db().update(tableId, { type: 'recent' });
            showToast('moved to recents', 'info');
            await loadTables();
            break;
        }

        case 'delete-row': {
            if ((table.data?.length ?? 0) <= 1) {
                showToast('cannot delete — only 1 row remaining', 'error');
                return;
            }
            const lastRow = table.data[table.data.length - 1];
            const hasData = lastRow.some(v => v && v.trim());
            if (hasData) {
                const ok = await showConfirm('delete last row? data will be <strong>lost permanently.</strong>', 'delete', true);
                if (!ok) return;
            }
            table.data.pop();
            if (table.checked?.length > 0) table.checked.pop();
            await db().update(tableId, { data: table.data, checked: table.checked ?? [] });
            showToast('last row deleted', 'info');
            await loadTables();
            break;
        }

        case 'delete-table': {
            const ok = await showConfirm(
                `delete <strong>${table.name}</strong>? all data will be <strong>permanently lost.</strong>`,
                'delete', true
            );
            if (!ok) return;
            // Clean up all images
            for (const row of (table.data ?? [])) {
                for (const val of row) {
                    if (typeof val === 'string' && val.startsWith('IMG:')) {
                        try { await window.electron.images.delete(val.slice(4)); } catch { }
                    }
                }
            }
            await db().delete(tableId);
            showToast('table deleted', 'error');
            await loadTables();
            break;
        }
    }
}

// ── Add Table ─────────────────────────────────────────────────────────────────

async function handleAddTable() {
    const name = await showAddTableModal();
    if (name === null) return; // cancelled

    let defaultColumns = 3;
    try {
        const s = await settings().get();
        defaultColumns = s?.general?.defaultColumns ?? 3;
    } catch { }

    try {
        await db().create({
            name,
            type: 'recent',
            columns: defaultColumns,
            data: [Array(defaultColumns).fill('')],
            pinned: false,
            checklist: false,
            checked: [false],
            highlights: {},
        });
        showToast('table created', 'success');
        // Switch to recents and reload
        if (currentFilter !== 'recents') {
            currentFilter = 'recents';
            topbar.setFilter('recents');
        }
        await loadTables();
    } catch (err) {
        console.error('[App] Create table failed:', err);
        showToast('failed to create table', 'error');
    }
}
