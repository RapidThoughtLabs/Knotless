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
import { TableCard, stripFormatMarkers } from './components/table-card.js';
import { CellContextMenu } from './components/context-menu.js';
import { TableOptionsMenu } from './components/table-options-menu.js';
import { SheetOptionsMenu } from './components/sheet-options-menu.js';
import { SearchBar } from './components/search-bar.js';
import { SettingsModal, applyAnimationLevel, applyFontSize, applyFontFamily } from './components/settings-modal.js';
import { showAddTableModal, showAddSheetModal, showConfirm, showAlert, showImportConflictModal, showFileMissingModal, showMoveToSheetModal } from './components/modals.js';
import { showExportModal } from './components/export-modal.js';
import { showToast, setToastPosition } from './components/toast.js';
import { HANDBOOK_TABLES, HANDBOOK_VERSION } from './data/handbook-tables.js';

// ── File-icons-js: expose globally so table-card.js can look up icon classes ──
import * as fileIconsModule from 'file-icons-js';
import 'file-icons-js/css/style.css';
window.fileIcons = fileIconsModule;

// ── Shorthand for Electron IPC ───────────────────────────────────────────────
const db = () => window.electron?.database;
const settings = () => window.electron?.settings;
const sheets = () => window.electron?.sheets;

// ── App State ────────────────────────────────────────────────────────────────
let currentSheet = null;    // active sheet doc { _id, name }
let allSheets = [];         // cached list of all sheet docs
let tables = [];            // current array of loaded table docs
let tableCards = new Map(); // tableId → TableCard instance
let tableControlsPosition = 'header'; // 'header' | 'footer' — read from settings on init

// ── Components (module-level singletons) ─────────────────────────────────────
let topbar;
let appFooter;
let cellCtxMenu;
let tableOptsMenu;
let sheetOptsMenu;
let searchBar;
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

    // 1.5 — Apply saved toast position, animation level, font size, and table controls position
    try {
        const savedSettings = await settings()?.get();
        const toastPos = savedSettings?.general?.toastPosition ?? 'titlebar';
        setToastPosition(toastPos);
        tableControlsPosition = savedSettings?.general?.tableControlsPosition ?? 'header';
        // Font size
        const fontSize = savedSettings?.general?.fontSize ?? 13;
        applyFontSize(fontSize);
        // Font family (typeface)
        const fontFamily = savedSettings?.general?.fontFamily ?? 'jetbrains';
        applyFontFamily(fontFamily);
        // Mac has its own native animation system — never touch it
        if (!window.electron?.isMac) {
            const animLevel = savedSettings?.general?.animations ?? 'full';
            applyAnimationLevel(animLevel);
        }
    } catch { /* no settings yet — use defaults */ }

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

    // 7 — Sheet options menu (singleton — same ctx-menu style as table options)
    sheetOptsMenu = new SheetOptionsMenu(handleSheetAction);
    sheetOptsMenu.mount();

    // 8 — Search bar (mounted into the search-bar-slot in the topbar)
    searchBar = new SearchBar({
        getTables: () => tables,
        getAllTables: () => db().getAll(),
        getSheets: () => allSheets,
    });
    const searchSlot = document.getElementById('search-bar-slot');
    if (searchSlot) searchBar.mount(searchSlot);

    // 9 — Wire topbar events
    document.addEventListener('rtl:sheet-change', (e) => {
        currentSheet = e.detail.sheet;
        persistLastSheet(currentSheet);
        loadTables();
    });
    document.addEventListener('rtl:add-click', handleAddTable);

    // Search bar expands a collapsed table when navigating to a match inside it
    document.addEventListener('rtl:table-expand', (e) => {
        handleCollapse(e.detail.tableId, false);
    });
    document.addEventListener('rtl:add-sheet-click', handleAddSheet);
    document.addEventListener('rtl:settings-click', () => settingsModal.toggle());
    document.addEventListener('rtl:generate-handbook', () => regenerateHandbook());
    // Re-render tables when table controls position changes in settings
    document.addEventListener('rtl:table-controls-position-change', (e) => {
        tableControlsPosition = e.detail.position;
        renderAll();
    });

    // Sheet options button → toggle sheet menu open/close
    document.addEventListener('rtl:sheet-options-click', (e) => {
        const { anchorEl, sheet } = e.detail;
        if (sheetOptsMenu.isVisible) {
            sheetOptsMenu.hide();
        } else {
            anchorEl.classList.add('open');
            sheetOptsMenu.show(anchorEl, sheet, 'left');
        }
    });

    // 10 — Global keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        const mod = e.metaKey || e.ctrlKey;
        if (!mod) return;

        if (e.key === 'f' || e.key === 'F') {
            e.preventDefault();
            topbar.hideSheetOptsBtn();
            searchBar.open();
            return;
        }

        if (e.key === 'g' || e.key === 'G') {
            e.preventDefault();
            e.shiftKey ? searchBar.prev() : searchBar.next();
        }
    });

    // 8 — Global drag-and-drop prevention: stop Electron from navigating away
    //     when a file is dropped outside a cell. Cells have their own handlers
    //     that stopPropagation() and actually ingest the file.
    document.addEventListener('dragover', (e) => e.preventDefault());
    document.addEventListener('drop', (e) => e.preventDefault());

    // 9 — Initialise sheets + load tables
    await initSheets();
});

// ── Sheet Initialisation ──────────────────────────────────────────────────────

async function initSheets() {
    try {
        // Create default "home" sheet only if the DB is completely empty
        await sheets().ensureHome();
        // Inject handbook on first-ever launch (added=false, lastCreated=null)
        await initHandbook();
        // Load all sheets (re-fetch after potential handbook creation)
        allSheets = await sheets().getAll();
        // Restore the last open sheet, falling back to the first sheet
        let lastSheetId = null;
        try {
            const s = await settings().get();
            lastSheetId = s?.general?.lastOpenSheetId ?? null;
        } catch { }
        currentSheet = (lastSheetId && allSheets.find(s => s._id === lastSheetId)) || allSheets[0];
        // Push to topbar
        topbar.setSheets(allSheets);
        topbar.setSheet(currentSheet);
        // Load tables for active sheet
        await loadTables();
    } catch (err) {
        console.error('[App] initSheets failed:', err);
        showToast('failed to load sheets', 'error');
    }
}

// ── Persist active sheet id to settings ──────────────────────────────────────

async function persistLastSheet(sheet) {
    try { await settings().update('general.lastOpenSheetId', sheet._id); } catch { }
}

// ── Handbook ──────────────────────────────────────────────────────────────────

/**
 * On app start, decide whether to auto-inject the handbook.
 *
 * Rules (evaluated in order):
 *   1. added=false + lastCreated=null + version=null  → first ever launch → inject
 *   2. version bump + autoUpdate=true                 → auto-replace with new version
 *   3. version bump + autoUpdate=false                → do nothing (user regenerates manually)
 *   4. added=false + lastCreated≠null + version bump  → user deleted old, but NEW version
 *                                                        exists → inject new (overrides deletion)
 *   5. added=false + lastCreated≠null + no bump       → user deleted, respect it, do nothing
 *   6. added=true  + up to date                       → verify sheet still exists in DB
 */
async function initHandbook() {
    try {
        const s = await settings().get();
        const hb = s?.handbook ?? {};
        const hasVersionBump = isNewerHandbookVersion(HANDBOOK_VERSION, hb.version);

        // Rule 1: Fresh install — never had a handbook
        if (!hb.added && !hb.lastCreated && !hb.version) {
            await createHandbook();
            return;
        }

        // Rules 2–4: Version bump detected
        if (hasVersionBump) {
            if (hb.added && hb.autoUpdate !== false) {
                // Rule 2: Handbook exists and auto-update is on → replace it
                await regenerateHandbook();
                return;
            }
            if (!hb.added && hb.lastCreated) {
                // Rule 4: User deleted old version, but a genuinely new version exists
                // The user didn't delete THIS version — inject it
                await createHandbook();
                return;
            }
            // Rule 3: added=true but autoUpdate=false, or added=false with no lastCreated gap
            // Do nothing — user will manually regenerate from settings
            return;
        }

        // Rule 5: No version bump, user deleted it → respect deletion
        if (!hb.added && hb.lastCreated) return;

        // Rule 6: Handbook should exist — verify it wasn't wiped externally (DB reset)
        if (hb.added && hb.sheetId) {
            const all = await sheets().getAll();
            const stillExists = all.some(sh => sh._id === hb.sheetId);
            if (!stillExists) {
                await settings().update('handbook.added', false);
            }
        }
    } catch (err) {
        console.error('[App] initHandbook failed:', err);
    }
}

/**
 * Returns true if `current` is a newer version than `installed`.
 * Uses locale-aware numeric string comparison so '1.10' > '1.9'.
 */
function isNewerHandbookVersion(current, installed) {
    if (!installed) return false; // null/undefined means fresh install — handled separately
    return current.localeCompare(installed, undefined, { numeric: true }) > 0;
}

/**
 * Build a highlights map for a handbook table.
 * Each table gets its own color personality — different header colors,
 * different first-column colors, and a few sprinkled body highlights
 * to showcase the highlight feature itself.
 *
 * Colors: hl-lime, hl-red, hl-pink, hl-purple, hl-yellow, hl-blue, hl-cyan, hl-orange
 */
function buildHandbookHighlights(table, tableIndex) {
    const highlights = {};
    const rows = table.data?.length ?? 0;
    const cols = table.columns ?? 1;

    // Per-table color schemes: [headerColor, firstColColor, sprinkles]
    // sprinkles = array of { r, c, hl } for extra highlights in the body
    const schemes = [
        // 0: welcome — blue headers, lime first col, yellow on "this handbook" row
        { header: 'hl-blue',   col0: 'hl-lime',   sprinkles: [{ r: 7, c: 1, hl: 'hl-yellow' }] },
        // 1: what's new — cyan headers, cyan first col, purple on highlight palette row
        { header: 'hl-cyan',   col0: 'hl-cyan',   sprinkles: [{ r: 5, c: 1, hl: 'hl-purple' }] },
        // 2: cell types in action — orange headers, yellow first col, lime on "bold text" row
        { header: 'hl-orange', col0: 'hl-yellow', sprinkles: [{ r: 9, c: 1, hl: 'hl-lime' }, { r: 9, c: 2, hl: 'hl-lime' }] },
        // 3: keyboard shortcuts — blue headers, blue first col, lime on cmd+B/I rows
        { header: 'hl-blue',   col0: 'hl-blue',   sprinkles: [{ r: 7, c: 1, hl: 'hl-lime' }, { r: 8, c: 1, hl: 'hl-lime' }] },
        // 4: context menu — red headers, orange first col, lime on "▶ run"
        { header: 'hl-red',    col0: 'hl-orange', sprinkles: [{ r: 8, c: 1, hl: 'hl-lime' }] },
        // 5: sheet & table management — lime headers, lime first col, cyan on table highlight rows
        { header: 'hl-lime',   col0: 'hl-lime',   sprinkles: [{ r: 12, c: 1, hl: 'hl-cyan' }, { r: 13, c: 1, hl: 'hl-cyan' }] },
        // 6: use case ideas — yellow headers, orange first col, demo status highlights
        { header: 'hl-yellow', col0: 'hl-orange', sprinkles: [
            { r: 1, c: 1, hl: 'hl-lime' },   // project manager → lime (done)
            { r: 3, c: 1, hl: 'hl-blue' },   // dev commands → blue (reference)
            { r: 4, c: 1, hl: 'hl-red' },    // token vault → red (sensitive)
        ]},
        // 7: weekly task checklist — orange headers, lime first col, red on deploy row
        { header: 'hl-orange', col0: 'hl-lime',   sprinkles: [{ r: 5, c: 1, hl: 'hl-red' }, { r: 5, c: 2, hl: 'hl-red' }, { r: 5, c: 3, hl: 'hl-red' }] },
        // 8: export & import — blue headers, blue first col, lime on .ktl.zip row
        { header: 'hl-blue',   col0: 'hl-blue',   sprinkles: [{ r: 2, c: 2, hl: 'hl-lime' }] },
        // 9: tips & tricks — lime headers, yellow first col, orange on highlight tip, purple on table highlight tip
        { header: 'hl-lime',   col0: 'hl-yellow', sprinkles: [{ r: 2, c: 1, hl: 'hl-orange' }, { r: 3, c: 1, hl: 'hl-purple' }] },
    ];

    const scheme = schemes[tableIndex] ?? { header: 'hl-blue', col0: 'hl-blue', sprinkles: [] };

    // Header row (row 0)
    for (let c = 0; c < cols; c++) {
        highlights[`0-${c}`] = scheme.header;
    }
    // First column labels (skip row 0 — already highlighted)
    for (let r = 1; r < rows; r++) {
        highlights[`${r}-0`] = scheme.col0;
    }
    // Sprinkled body highlights
    for (const s of scheme.sprinkles) {
        if (s.r < rows && s.c < cols) {
            highlights[`${s.r}-${s.c}`] = s.hl;
        }
    }

    return highlights;
}

/**
 * Create the handbook sheet and inject all tables into it.
 * Updates handbook.added, handbook.lastCreated, handbook.sheetId in settings.
 */
async function createHandbook() {
    try {
        const sheet = await sheets().create('handbook');
        for (let i = 0; i < HANDBOOK_TABLES.length; i++) {
            const t = HANDBOOK_TABLES[i];
            await db().create({
                name:      t.name,
                sheetId:   sheet._id,
                columns:   t.columns,
                data:      t.data,
                pinned:    t.pinned ?? false,
                checklist: t.checklist ?? false,
                checked:   t.checked  ?? [],
                highlight: t.highlight ?? null,
                highlights: buildHandbookHighlights(t, i),
                sortOrder: Date.now(),
                cardHeight:null,
            });
        }
        await settings().update('handbook.added',      true);
        await settings().update('handbook.lastCreated', new Date().toISOString());
        await settings().update('handbook.sheetId',     sheet._id);
        await settings().update('handbook.version',     HANDBOOK_VERSION);
    } catch (err) {
        console.error('[App] createHandbook failed:', err);
        throw err;
    }
}

/**
 * Regenerate the handbook: delete any existing handbook sheet + tables,
 * then create a fresh copy. Called from settings → handbook → generate.
 */
async function regenerateHandbook() {
    try {
        const hb = (await settings().get())?.handbook ?? {};

        // If there's a tracked handbook sheet, nuke it first
        if (hb.sheetId) {
            const all = await sheets().getAll();
            const existing = all.find(sh => sh._id === hb.sheetId);
            if (existing) {
                const sheetTables = await db().getBySheetId(hb.sheetId);
                for (const t of sheetTables) {
                    await db().delete(t._id);
                }
                await sheets().delete(hb.sheetId);
            }
        }

        // Create a brand-new handbook
        await createHandbook();

        // Refresh the topbar sheet list
        allSheets = await sheets().getAll();
        topbar.setSheets(allSheets);

        showToast('handbook generated ✓', 'success');
    } catch (err) {
        console.error('[App] regenerateHandbook failed:', err);
        showToast('failed to generate handbook', 'error');
    }
}

// ── Table Loading ─────────────────────────────────────────────────────────────

async function loadTables() {
    if (!currentSheet) return;
    try {
        tables = await db().getBySheetId(currentSheet._id);
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
                <div class="empty-sub">press <span>* add</span> to create one</div>
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
                onFileLongPress: (cellEl, x, y) => {
                    cellCtxMenu.show(x, y, cellEl);
                },
                onNameChange: handleNameChange,
                onAddRow: handleAddRow,
                onOptions: (btnEl, tableId, tableData) => {
                    tableOptsMenu.show(btnEl, tableId, {
                        ...tableData,
                        excludeFirstRow: tableData.excludeFirstRow ?? false,
                    });
                },
                onMoveUp: handleMoveUp,
                onResize: handleResize,
                onCollapse: handleCollapse,
                controlsPosition: tableControlsPosition,
            });
            const el = card.create();
            tableCards.set(table._id, card);
            content.appendChild(el);
        });
    }

    // Update footer
    appFooter.update({ count: tables.length, filter: currentSheet?.name ?? 'home' });
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

async function handleCollapse(tableId, collapsed) {
    const table = tables.find(t => t._id === tableId);
    if (!table) return;
    table.collapsed = collapsed;
    try {
        await db().update(tableId, { collapsed });
    } catch (err) {
        console.error('[App] Collapse update failed:', err);
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

    // Animate the visual swap (skip if animations are off)
    const thisRect = thisCard.getBoundingClientRect();
    const aboveRect = aboveCard.getBoundingClientRect();
    const deltaY = thisRect.top - aboveRect.top;
    const animOff = document.documentElement.dataset.anim === 'off';

    if (!animOff) {
        thisCard.style.transition = 'transform 0.25s ease';
        aboveCard.style.transition = 'transform 0.25s ease';
        thisCard.style.transform = `translateY(-${deltaY}px)`;
        aboveCard.style.transform = `translateY(${deltaY}px)`;
    }

    // After animation (or instantly if off), swap in DOM and persist
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
    }, animOff ? 0 : 260);
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
    const FILE_PREFIX = 'FILE:';
    const isImageCell = (v) => typeof v === 'string' && v.startsWith(IMG_PREFIX);
    const isFileCell = (v) => typeof v === 'string' && v.startsWith(FILE_PREFIX);
    const parseFilePath = (v) => v.slice(FILE_PREFIX.length).split('|')[0];
    const parseFileName = (v) => v.slice(FILE_PREFIX.length).split('|')[1] || parseFilePath(v).split('/').pop();
    const TEXT_EXTS = new Set(['txt', 'md', 'json', 'csv', 'xml', 'yaml', 'yml', 'toml', 'js', 'ts', 'jsx', 'tsx', 'py', 'rb', 'rs', 'go', 'java', 'c', 'cpp', 'h', 'cs', 'swift', 'kt', 'sh', 'bash', 'zsh', 'sql', 'html', 'css', 'scss', 'vue', 'svelte', 'lua', 'r', 'php', 'env', 'ini', 'cfg', 'conf', 'log', 'gitignore', 'dockerfile']);
    const isTextFile = (name) => TEXT_EXTS.has((name.split('.').pop() || '').toLowerCase());
    const currentVal = table.data?.[row]?.[col] ?? '';

    switch (action) {
        case 'open-url': {
            // Add https:// if missing (handles bare domains like 'github.com')
            let url = currentVal.trim();
            if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
            try {
                const result = await window.electron.openExternal(url);
                if (result?.ok === false) throw new Error(result.error);
            } catch (err) {
                console.error('[open-url] failed:', err);
                showToast('could not open URL', 'error');
            }
            break;
        }

        case 'run': {
            // Strip leading $ prompt if present (e.g. "$ npm install" → "npm install")
            const cmd = currentVal.replace(/^\$\s+/, '').trim();
            if (!cmd) return;
            try {
                const result = await window.electron.commands.run(cmd);
                if (result?.ok === false) throw new Error(result.error);
                showToast('running in terminal ▶', 'success');
            } catch (err) {
                console.error('[run] failed:', err);
                showToast('could not open terminal', 'error');
            }
            break;
        }

        case 'open': {
            let pathToOpen = null;
            let displayName = null;
            if (isFileCell(currentVal)) {
                pathToOpen = parseFilePath(currentVal);
                displayName = parseFileName(currentVal);
            } else if (isImageCell(currentVal)) {
                pathToOpen = currentVal.slice(IMG_PREFIX.length);
                displayName = pathToOpen.split('/').pop().split('\\').pop() || 'image';
            }
            if (!pathToOpen) return;
            const fileExists = await window.electron.files.exists(pathToOpen);
            if (!fileExists) {
                const shouldClear = await showFileMissingModal(displayName);
                if (shouldClear) {
                    await handleCellUpdate(tableId, row, col, '');
                    await handleHighlight(tableId, row, col, null);
                    await loadTables();
                }
                return;
            }
            try {
                await window.electron.files.open(pathToOpen);
            } catch (err) {
                console.error('[open] failed:', err);
                showToast('could not open file', 'error');
            }
            break;
        }

        case 'reveal-path': {
            const pathToReveal = currentVal.trim();
            if (!pathToReveal) return;
            const pathExists = await window.electron.files.exists(pathToReveal);
            if (!pathExists) {
                const displayName = pathToReveal.split('/').pop().split('\\').pop() || pathToReveal;
                const shouldClear = await showFileMissingModal(displayName);
                if (shouldClear) {
                    await handleCellUpdate(tableId, row, col, '');
                    await handleHighlight(tableId, row, col, null);
                    await loadTables();
                }
                return;
            }
            try {
                await window.electron.files.reveal(pathToReveal);
            } catch (err) {
                console.error('[reveal-path] failed:', err);
                showToast('could not open location', 'error');
            }
            break;
        }

        case 'copy-file': {
            // Native file copy via Electron — pasteable in Finder/Explorer
            if (!isFileCell(currentVal)) return;
            const filePath = parseFilePath(currentVal);
            const fileName = parseFileName(currentVal);
            try {
                await window.electron.clipboard.copyFile(filePath);
                showToast(`copied "${fileName}"`, 'success');
            } catch (err) {
                console.error('[copy-file] failed:', err);
                showToast('copy failed — file may not exist', 'error');
            }
            break;
        }

        case 'copy-path': {
            if (!isFileCell(currentVal)) return;
            const filePath = parseFilePath(currentVal);
            const fileName = parseFileName(currentVal);
            try {
                await navigator.clipboard.writeText(filePath);
                showToast(`copied path for "${fileName}"`, 'success');
            } catch { showToast('copy failed', 'error'); }
            break;
        }

        case 'copy-text': {
            if (!isFileCell(currentVal)) return;
            const filePath = parseFilePath(currentVal);
            const fileName = parseFileName(currentVal);
            if (isTextFile(fileName)) {
                try {
                    const content = await window.electron.files.readText(filePath);
                    await navigator.clipboard.writeText(content);
                    showToast(`copied contents of "${fileName}"`, 'success');
                } catch { showToast('copy failed', 'error'); }
            } else {
                try {
                    await navigator.clipboard.writeText(filePath);
                    showToast(`copied path (binary file)`, 'success');
                } catch { showToast('copy failed', 'error'); }
            }
            break;
        }

        case 'copy': {
            if (isFileCell(currentVal)) {
                const filePath = parseFilePath(currentVal);
                const fileName = parseFileName(currentVal);
                if (isTextFile(fileName)) {
                    try {
                        const content = await window.electron.files.readText(filePath);
                        await navigator.clipboard.writeText(content);
                        showToast(`copied contents of "${fileName}"`, 'success');
                    } catch { showToast('copy failed', 'error'); }
                } else {
                    try {
                        await navigator.clipboard.writeText(filePath);
                        showToast(`copied path for "${fileName}"`, 'success');
                    } catch { showToast('copy failed', 'error'); }
                }
            } else if (isImageCell(currentVal)) {
                try {
                    const path = currentVal.slice(IMG_PREFIX.length);
                    const url = await window.electron.pathUtils.toFileUrl(path);
                    const res = await fetch(url);
                    const blob = await res.blob();
                    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
                    showToast('image copied', 'success');
                } catch { showToast('copy failed', 'error'); }
            } else {
                await navigator.clipboard.writeText(stripFormatMarkers(currentVal));
                showToast('copied', 'success');
            }
            break;
        }

        case 'paste': {
            // ── RULE: image/file cells are read-only ─────────────────────────
            if (isImageCell(currentVal) || isFileCell(currentVal)) {
                showToast('cell is read-only — long press to copy', 'error');
                return;
            }
            try {
                const items = await navigator.clipboard.read();
                for (const item of items) {
                    const imgType = item.types.find(t => t.startsWith('image/'));
                    if (imgType) {
                        // ── RULE: can't add image to a cell that has text ────
                        if (currentVal && currentVal.trim()) {
                            showToast("can't add an image to a text cell — clear it first", 'error');
                            return;
                        }
                        // Empty cell — allow image paste
                        const blob = await item.getType(imgType);
                        const buf = await blob.arrayBuffer();
                        const path = await window.electron.images.save(Array.from(new Uint8Array(buf)));
                        await handleCellUpdate(tableId, row, col, `${IMG_PREFIX}${path}`);
                        showToast('image pasted', 'success');
                        await loadTables();
                        return;
                    }
                }
                // Text paste into text / empty cell
                const text = await navigator.clipboard.readText();
                if (text) {
                    await handleCellUpdate(tableId, row, col, text);
                    cellEl.textContent = text;
                }
            } catch { showToast('paste failed', 'error'); }
            break;
        }


        case 'clear': {
            const selectedCells = document.querySelectorAll('.cell-selected');
            if (selectedCells.length > 0) {
                const count = selectedCells.length;
                for (const selCell of selectedCells) {
                    const selTableId = selCell.dataset.tableId;
                    const selRow = parseInt(selCell.dataset.row);
                    const selCol = parseInt(selCell.dataset.col);
                    const selTable = tables.find(t => t._id === selTableId);
                    if (!selTable) continue;
                    const selVal = selTable.data?.[selRow]?.[selCol] ?? '';
                    if (isFileCell(selVal)) {
                        try { await window.electron.files.delete(parseFilePath(selVal)); } catch { }
                    } else if (isImageCell(selVal)) {
                        try { await window.electron.images.delete(selVal.slice(IMG_PREFIX.length)); } catch { }
                    }
                    await handleCellUpdate(selTableId, selRow, selCol, '');
                }
                await loadTables();
                showToast(`cleared ${count} cell${count > 1 ? 's' : ''}`, 'info');
            } else {
                if (isFileCell(currentVal)) {
                    try { await window.electron.files.delete(parseFilePath(currentVal)); } catch { }
                } else if (isImageCell(currentVal)) {
                    try { await window.electron.images.delete(currentVal.slice(IMG_PREFIX.length)); } catch { }
                }
                await handleCellUpdate(tableId, row, col, '');
                await loadTables();
                showToast('cell cleared', 'info');
            }
            break;
        }

        case 'highlight': {
            const selectedForHl = document.querySelectorAll('.cell-selected');
            if (selectedForHl.length > 0) {
                // Batch: group updates per table to minimise DB writes
                const tableUpdates = new Map(); // tableId → highlights object
                for (const selCell of selectedForHl) {
                    const selTableId = selCell.dataset.tableId;
                    const selRow     = parseInt(selCell.dataset.row);
                    const selCol     = parseInt(selCell.dataset.col);
                    const selTable   = tables.find(t => t._id === selTableId);
                    if (!selTable) continue;
                    selTable.highlights = selTable.highlights ?? {};
                    selTable.highlights[`${selRow}-${selCol}`] = extra;
                    // Update the cell class in-place for immediate feedback
                    tableCards.get(selTableId)?.updateHighlight(selRow, selCol, extra);
                    tableUpdates.set(selTableId, selTable.highlights);
                }
                try {
                    await Promise.all([...tableUpdates.entries()].map(
                        ([tid, hls]) => db().update(tid, { highlights: hls })
                    ));
                    showToast(`highlighted ${selectedForHl.length} cell${selectedForHl.length > 1 ? 's' : ''}`, 'success');
                } catch (err) {
                    console.error('[App] Batch highlight failed:', err);
                }
            } else {
                await handleHighlight(tableId, row, col, extra);
            }
            break;
        }

        case 'clear-highlight': {
            const selectedForChk = document.querySelectorAll('.cell-selected');
            if (selectedForChk.length > 0) {
                const tableUpdates = new Map();
                for (const selCell of selectedForChk) {
                    const selTableId = selCell.dataset.tableId;
                    const selRow     = parseInt(selCell.dataset.row);
                    const selCol     = parseInt(selCell.dataset.col);
                    const selTable   = tables.find(t => t._id === selTableId);
                    if (!selTable) continue;
                    selTable.highlights = selTable.highlights ?? {};
                    delete selTable.highlights[`${selRow}-${selCol}`];
                    tableCards.get(selTableId)?.updateHighlight(selRow, selCol, null);
                    tableUpdates.set(selTableId, selTable.highlights);
                }
                try {
                    await Promise.all([...tableUpdates.entries()].map(
                        ([tid, hls]) => db().update(tid, { highlights: hls })
                    ));
                    showToast(`cleared highlights on ${selectedForChk.length} cell${selectedForChk.length > 1 ? 's' : ''}`, 'info');
                } catch (err) {
                    console.error('[App] Batch clear-highlight failed:', err);
                }
            } else {
                await handleHighlight(tableId, row, col, null);
            }
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
    // Highlight actions pass { tableId, key } object — extract the real id for the guard
    const resolvedId = (typeof tableId === 'object' && tableId !== null) ? tableId.tableId : tableId;
    const table = tables.find(t => t._id === resolvedId);
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
            // Clean up images AND files in the removed column
            for (const row of table.data) {
                const val = row[lastColIdx];
                if (typeof val === 'string') {
                    if (val.startsWith('IMG:')) {
                        try { await window.electron.images.delete(val.slice(4)); } catch { }
                    } else if (val.startsWith('FILE:')) {
                        const filePath = val.slice(5).split('|')[0];
                        try { await window.electron.files.delete(filePath); } catch { }
                    }
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

        case 'toggle-exclude-first-row': {
            if (!table.checklist) return;
            const excludeFirstRow = !table.excludeFirstRow;
            await db().update(tableId, { excludeFirstRow });
            await loadTables();
            break;
        }

        case 'move-to': {
            const targetSheetId = await showMoveToSheetModal(allSheets, currentSheet._id);
            if (!targetSheetId) return;
            const targetSheet = allSheets.find(s => s._id === targetSheetId);
            await db().update(tableId, { sheetId: targetSheetId });
            showToast(`moved to ${targetSheet?.name ?? 'sheet'}`, 'success');
            await loadTables();
            break;
        }

        case 'table-highlight': {
            const { tableId: tId, key: colorKey } = tableId; // receives full { tableId, key } object
            const targetTable = tables.find(t => t._id === tId);
            if (!targetTable) return;
            try {
                await db().update(tId, { highlight: colorKey });
                targetTable.highlight = colorKey;
                // Update the table card directly
                tableCards.get(tId)?.updateTableHighlight(colorKey);
                showToast('table highlighted', 'success');
            } catch (err) {
                console.error('[App] handleTableAction highlight failed:', err);
                showToast('failed to highlight table', 'error');
            }
            break;
        }

        case 'clear-table-highlight': {
            const tId = tableId.tableId ?? tableId; // receives { tableId } object
            const targetTable = tables.find(t => t._id === tId);
            if (!targetTable) return;
            try {
                await db().update(tId, { highlight: null });
                delete targetTable.highlight;
                // Update the table card directly
                tableCards.get(tId)?.updateTableHighlight(null);
                showToast('highlight removed', 'info');
            } catch (err) {
                console.error('[App] handleTableAction clear highlight failed:', err);
                showToast('failed to clear highlight', 'error');
            }
            break;
        }

        case 'delete-table': {
            const ok = await showConfirm(
                `delete <strong>${table.name}</strong>? all data will be <strong>permanently lost.</strong>`,
                'delete', true
            );
            if (!ok) return;
            // Clean up all images and files
            for (const row of (table.data ?? [])) {
                for (const val of row) {
                    if (typeof val === 'string') {
                        if (val.startsWith('IMG:')) {
                            try { await window.electron.images.delete(val.slice(4)); } catch { }
                        } else if (val.startsWith('FILE:')) {
                            const filePath = val.slice(5).split('|')[0];
                            try { await window.electron.files.delete(filePath); } catch { }
                        }
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
            sheetId: currentSheet._id,
            columns: defaultColumns,
            data: [Array(defaultColumns).fill('')],
            pinned: false,
            checklist: false,
            checked: [false],
            highlights: {},
        });
        showToast('table created', 'success');
        await loadTables();
    } catch (err) {
        console.error('[App] Create table failed:', err);
        showToast('failed to create table', 'error');
    }
}

// ── Add Sheet ─────────────────────────────────────────────────────────────────

async function handleAddSheet() {
    const name = await showAddSheetModal();
    if (name === null) return; // cancelled

    try {
        const newSheet = await sheets().create(name);
        // Refresh sheets list
        allSheets = await sheets().getAll();
        topbar.setSheets(allSheets);
        // Switch to the new sheet
        currentSheet = newSheet;
        topbar.setSheet(currentSheet);
        persistLastSheet(currentSheet);
        await loadTables();
        showToast('sheet created', 'success');
    } catch (err) {
        console.error('[App] Create sheet failed:', err);
        showToast('failed to create sheet', 'error');
    }
}

// ── Sheet Options Actions ─────────────────────────────────────────────────────

async function handleSheetAction(action, sheet) {
    switch (action) {

        case 'search': {
            // Open search bar — topbar hides ⋯ button, SearchBar expands into slot
            topbar.hideSheetOptsBtn();
            searchBar.open();
            break;
        }

        case 'rename': {
            // Reuse the add-sheet modal, pre-filled with current name
            const newName = await showAddSheetModal(sheet?.name ?? '');
            if (newName === null || newName === sheet?.name) return; // cancelled or unchanged
            try {
                await sheets().rename(sheet._id, newName);
                // Update local state
                const s = allSheets.find(x => x._id === sheet._id);
                if (s) s.name = newName;
                if (currentSheet?._id === sheet._id) {
                    currentSheet.name = newName;
                    topbar.updateSheetLabel(currentSheet);
                } else {
                    topbar.setSheets(allSheets);
                }
                showToast('sheet renamed', 'success');
            } catch (err) {
                console.error('[App] Rename sheet failed:', err);
                showToast('failed to rename sheet', 'error');
            }
            break;
        }

        case 'clear': {
            const ok = await showConfirm(
                `clear <strong>${sheet?.name}</strong>? all tables will be <strong>permanently deleted.</strong>`,
                'clear', true
            );
            if (!ok) return;
            try {
                // Delete all tables in this sheet
                const sheetTables = await db().getBySheetId(sheet._id);
                for (const t of sheetTables) {
                    // Clean up images and files first
                    for (const row of (t.data ?? [])) {
                        for (const val of row) {
                            if (typeof val === 'string') {
                                if (val.startsWith('IMG:')) {
                                    try { await window.electron.images.delete(val.slice(4)); } catch { }
                                } else if (val.startsWith('FILE:')) {
                                    try { await window.electron.files.delete(val.slice(5).split('|')[0]); } catch { }
                                }
                            }
                        }
                    }
                    await db().delete(t._id);
                }
                showToast('sheet cleared', 'info');
                await loadTables();
            } catch (err) {
                console.error('[App] Clear sheet failed:', err);
                showToast('failed to clear sheet', 'error');
            }
            break;
        }

        case 'delete': {
            const ok = await showConfirm(
                `delete <strong>${sheet?.name}</strong> and all its tables? this <strong>cannot be undone.</strong>`,
                'delete', true
            );
            if (!ok) return;
            try {
                // Delete all tables in the sheet first
                const sheetTables = await db().getBySheetId(sheet._id);
                for (const t of sheetTables) {
                    for (const row of (t.data ?? [])) {
                        for (const val of row) {
                            if (typeof val === 'string') {
                                if (val.startsWith('IMG:')) {
                                    try { await window.electron.images.delete(val.slice(4)); } catch { }
                                } else if (val.startsWith('FILE:')) {
                                    try { await window.electron.files.delete(val.slice(5).split('|')[0]); } catch { }
                                }
                            }
                        }
                    }
                    await db().delete(t._id);
                }
                // Delete the sheet itself
                await sheets().delete(sheet._id);
                // If the deleted sheet was the handbook, flip added → false
                // (keep lastCreated so the app knows the user chose to delete it)
                try {
                    const hb = (await settings().get())?.handbook;
                    if (hb?.sheetId === sheet._id) {
                        await settings().update('handbook.added', false);
                    }
                } catch { }
                showToast('sheet deleted', 'error');
                // Refresh sheet list — if none remain, create a blank "home" fallback
                allSheets = await sheets().getAll();
                if (allSheets.length === 0) {
                    await sheets().ensureHome();
                    allSheets = await sheets().getAll();
                }
                currentSheet = allSheets[0];
                topbar.setSheets(allSheets);
                topbar.setSheet(currentSheet);
                persistLastSheet(currentSheet);
                await loadTables();
            } catch (err) {
                console.error('[App] Delete sheet failed:', err);
                showToast('failed to delete sheet', 'error');
            }
            break;
        }

        case 'export': {
            // 1 — Show format picker (json / zip / cancel)
            const choice = await showExportModal();
            if (!choice) break;

            const ei = window.electron?.exportImport;
            if (!ei) { showToast('export not available', 'error'); break; }

            const sheetNameSafe = (currentSheet?.name ?? 'untitled').replace(/[^a-zA-Z0-9_\-]/g, '_');

            if (choice === 'json') {
                const savePath = await ei.saveDialog({
                    title: 'Export Sheet',
                    defaultPath: `${sheetNameSafe}.ktl.json`,
                    filters: [{ name: 'Knotless JSON', extensions: ['ktl.json'] }],
                });
                if (!savePath) break; // user cancelled Save dialog
                showToast('exporting…', 'info');
                try {
                    const result = await ei.exportJson(currentSheet, tables, savePath);
                    if (result?.ok) {
                        showToast('exported as json ✓', 'success');
                    } else {
                        showToast('export failed', 'error');
                    }
                } catch (err) {
                    console.error('[App] export:json failed:', err);
                    showToast('export failed', 'error');
                }

            } else if (choice === 'zip') {
                const savePath = await ei.saveDialog({
                    title: 'Export Sheet Bundle',
                    defaultPath: `${sheetNameSafe}.ktl.zip`,
                    filters: [{ name: 'Knotless Bundle', extensions: ['ktl.zip'] }],
                });
                if (!savePath) break; // user cancelled Save dialog
                showToast('exporting…', 'info');
                try {
                    const result = await ei.exportZip(currentSheet, tables, savePath);
                    if (result?.error === 'blob_cap_exceeded') {
                        await showAlert(
                            `export failed — blobs exceed the 250 mb limit<br>
                            <span style="font-size:10px;color:var(--text-dim)">
                            total blob size: ${result.totalMB} mb — reduce images/files and try again
                            </span>`
                        );
                    } else if (result?.ok) {
                        showToast('exported as bundle ✓', 'success');
                    } else {
                        showToast('export failed', 'error');
                    }
                } catch (err) {
                    console.error('[App] export:zip failed:', err);
                    showToast('export failed', 'error');
                }
            }
            break;
        }

        case 'import': {
            const ei = window.electron?.exportImport;
            if (!ei) { showToast('import not available', 'error'); break; }

            // 1 — Open file picker
            const filePath = await ei.openDialog({
                title: 'Import Sheet',
                filters: [{ name: 'Knotless Files', extensions: ['ktl.json', 'ktl.zip'] }],
                properties: ['openFile'],
            });
            if (!filePath) break; // cancelled

            // 2 — Parse and validate
            let result;
            try {
                result = await ei.importSheet(filePath);
            } catch (err) {
                console.error('[App] import:sheet failed:', err);
                showToast('import failed', 'error');
                break;
            }

            if (result?.error === 'invalid') {
                await showAlert('import failed — file is corrupt or invalid');
                break;
            }

            const { sheet: importedSheet, tables: importedTables } = result;
            const tableCount = importedTables?.length ?? 0;

            // 3 — Conflict check: sheet with same name already exists?
            let finalSheetName = importedSheet.name;

            // Reserved namespace guard — imported sheets can't claim "handbook"
            if (finalSheetName.toLowerCase() === 'handbook') {
                finalSheetName = 'handbook (imported)';
            }
            const conflictingSheet = allSheets.find(s => s.name === importedSheet.name);
            if (conflictingSheet) {
                const conflictChoice = await showImportConflictModal(importedSheet.name);
                if (!conflictChoice) break; // cancelled

                if (conflictChoice === 'replace') {
                    // Cascade-delete the existing sheet
                    const existingTables = await db().getBySheetId(conflictingSheet._id);
                    for (const t of existingTables) {
                        for (const row of (t.data ?? [])) {
                            for (const val of row) {
                                if (typeof val === 'string') {
                                    if (val.startsWith('IMG:')) {
                                        try { await window.electron.images.delete(val.slice(4)); } catch { }
                                    } else if (val.startsWith('FILE:')) {
                                        try { await window.electron.files.delete(val.slice(5).split('|')[0]); } catch { }
                                    }
                                }
                            }
                        }
                        await db().delete(t._id);
                    }
                    await sheets().delete(conflictingSheet._id);
                    allSheets = allSheets.filter(s => s._id !== conflictingSheet._id);
                } else {
                    // Generate a unique "(N)" suffix
                    let suffix = 2;
                    while (allSheets.find(s => s.name === `${importedSheet.name} (${suffix})`)) suffix++;
                    finalSheetName = `${importedSheet.name} (${suffix})`;
                }
            }

            // 4 — Confirm with user before creating
            const ok = await showConfirm(
                `import <strong>${finalSheetName}</strong>?
                 this will create a new sheet with ${tableCount} table${tableCount === 1 ? '' : 's'}.`,
                'import', false
            );
            if (!ok) break;

            // 5 — Create the sheet and all its tables
            try {
                const newSheet = await sheets().create(finalSheetName);
                for (const table of importedTables) {
                    await db().create({ ...table, sheetId: newSheet._id });
                }
                // Refresh and switch to the imported sheet
                allSheets = await sheets().getAll();
                topbar.setSheets(allSheets);
                currentSheet = newSheet;
                topbar.setSheet(currentSheet);
                persistLastSheet(currentSheet);
                await loadTables();
                showToast('sheet imported ✓', 'success');
            } catch (err) {
                console.error('[App] import create failed:', err);
                showToast('import failed', 'error');
            }
            break;
        }
    }
}

