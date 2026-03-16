/**
 * SearchBar — RTL Knotless V2
 *
 * Inline search bar in the topbar that expands from the ⋯ button.
 * Uses Fuse.js for fuzzy matching across cell text, table names, and file names.
 *
 * Usage:
 *   const sb = new SearchBar({ getTables, getAllTables, getSheets });
 *   sb.mount(slotEl);          // mount into the search-bar-slot div
 *   sb.open();                 // expand
 *   sb.close();                // collapse back
 *   sb.next();                 // navigate to next hit
 *   sb.prev();                 // navigate to previous hit
 */

import Fuse from 'fuse.js';

const FILE_PREFIX = 'FILE:';
const IMG_PREFIX = 'IMG:';
const DEBOUNCE_MS = 150;

/**
 * Extract a human-readable text string from a raw cell value.
 * Returns null for image cells (not searchable).
 */
function cellText(val) {
    if (!val || typeof val !== 'string') return val || '';
    if (val.startsWith(IMG_PREFIX)) return null;  // images: skip
    if (val.startsWith(FILE_PREFIX)) {
        // Extract original filename from FILE:/path|name|size
        const parts = val.slice(FILE_PREFIX.length).split('|');
        return parts[1] || parts[0].split('/').pop() || '';
    }
    return val;
}

export class SearchBar {
    /**
     * @param {Object} opts
     * @param {Function} opts.getTables  - () => Table[]  (current sheet tables, already loaded)
     * @param {Function} opts.getAllTables - async () => Table[]  (IPC: all tables across sheets)
     * @param {Function} opts.getSheets  - () => Sheet[]  (all sheets, for label lookup)
     */
    constructor({ getTables, getAllTables, getSheets }) {
        this._getTables = getTables;
        this._getAllTables = getAllTables;
        this._getSheets = getSheets;

        this._slot = null;      // mount element
        this._el = null;        // search bar root div
        this._input = null;
        this._countEl = null;
        this._scopeToggle = null;
        this._scopeLabel = null;

        this._isOpen = false;
        this._scope = 'current';    // 'current' | 'all'
        this._query = '';
        this._matches = [];         // flat list of { tableId, row, col, text }
        this._idx = -1;             // current focused match index
        this._debounce = null;
    }

    // ── Mount / lifecycle ──────────────────────────────────────────────────────

    mount(slotEl) {
        this._slot = slotEl;
    }

    open() {
        if (this._isOpen) {
            this._input?.focus();
            return;
        }
        this._isOpen = true;
        this._render();
        // Small delay so the expand animation plays before focus
        requestAnimationFrame(() => this._input?.focus());
    }

    close() {
        if (!this._isOpen) return;
        this._isOpen = false;
        this._clearHighlights();
        this._matches = [];
        this._idx = -1;
        this._query = '';

        // Notify topbar immediately so the ⋯ button can reappear
        document.dispatchEvent(new CustomEvent('rtl:search-close'));

        if (this._el) {
            const el = this._el;
            this._el = null;
            el.classList.add('search-bar--closing');
            el.addEventListener('animationend', () => el.remove(), { once: true });
        }
    }

    next() {
        if (!this._matches.length) return;
        this._idx = (this._idx + 1) % this._matches.length;
        this._focusMatch();
        this._updateCount();
    }

    prev() {
        if (!this._matches.length) return;
        this._idx = (this._idx - 1 + this._matches.length) % this._matches.length;
        this._focusMatch();
        this._updateCount();
    }

    // ── Render ────────────────────────────────────────────────────────────────

    _render() {
        const el = document.createElement('div');
        el.className = 'search-bar';
        el.id = 'search-bar';
        el.innerHTML = `
            <span class="search-icon">⌕</span>
            <input class="search-input" id="search-input"
                placeholder="search..." autocomplete="off" spellcheck="false" />
            <span class="search-count" id="search-count"></span>
            <button class="search-nav-btn" id="search-prev" title="Previous (Cmd+Shift+G)">▲</button>
            <button class="search-nav-btn" id="search-next" title="Next (Cmd+G)">▼</button>
            <span class="search-scope-label" id="search-scope-label">current</span>
            <div class="search-scope-toggle" id="search-scope-toggle" title="Toggle: current sheet / all sheets">
                <div class="search-scope-thumb"></div>
            </div>
        `;

        this._slot.appendChild(el);
        this._el = el;

        this._input = el.querySelector('#search-input');
        this._countEl = el.querySelector('#search-count');
        this._scopeToggle = el.querySelector('#search-scope-toggle');
        this._scopeLabel = el.querySelector('#search-scope-label');

        // Input
        this._input.addEventListener('input', () => {
            this._query = this._input.value;
            clearTimeout(this._debounce);
            this._debounce = setTimeout(() => this._runSearch(), DEBOUNCE_MS);
        });

        this._input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') { this.close(); return; }
            if (e.key === 'Enter' || (e.key === 'g' && (e.metaKey || e.ctrlKey))) {
                e.preventDefault();
                e.shiftKey ? this.prev() : this.next();
            }
        });

        // Nav buttons
        el.querySelector('#search-prev').addEventListener('click', (e) => { e.stopPropagation(); this.prev(); });
        el.querySelector('#search-next').addEventListener('click', (e) => { e.stopPropagation(); this.next(); });

        // Scope toggle
        this._scopeToggle.addEventListener('click', () => {
            this._scope = this._scope === 'current' ? 'all' : 'current';
            this._scopeToggle.classList.toggle('on', this._scope === 'all');
            this._scopeLabel.textContent = this._scope === 'all' ? 'all' : 'current';
            this._clearHighlights();
            this._runSearch();
        });
    }

    // ── Search logic ──────────────────────────────────────────────────────────

    async _runSearch() {
        this._clearHighlights();
        this._matches = [];
        this._idx = -1;

        const q = this._query.trim();
        if (!q) { this._updateCount(); return; }

        // Build flat index entries
        const tables = this._scope === 'all'
            ? await this._getAllTables()
            : this._getTables();

        const sheets = this._getSheets();
        const sheetMap = Object.fromEntries(sheets.map(s => [s._id, s.name]));

        const entries = [];
        for (const table of tables) {
            const sheetName = sheetMap[table.sheetId] || '';
            // Table name as a searchable entry (row=-1 sentinel)
            entries.push({ text: table.name, tableId: table._id, sheetId: table.sheetId, sheetName, row: -1, col: -1 });

            // Cell entries
            for (let r = 0; r < (table.data?.length ?? 0); r++) {
                const rowData = table.data[r];
                for (let c = 0; c < (rowData?.length ?? 0); c++) {
                    const t = cellText(rowData[c]);
                    if (t === null || !t) continue;
                    entries.push({ text: t, tableId: table._id, sheetId: table.sheetId, sheetName, row: r, col: c });
                }
            }
        }

        if (!entries.length) { this._updateCount(); return; }

        const fuse = new Fuse(entries, {
            keys: ['text'],
            threshold: 0.2,       // tighter — reduces obscure/noisy results
            ignoreLocation: true,
            minMatchCharLength: 2, // ignore single-char noise matches
        });

        const results = fuse.search(q);
        this._matches = results.map(r => r.item);

        if (this._matches.length > 0) {
            this._idx = 0;
            this._focusMatch();
        }
        this._updateCount();
    }

    // ── Match focusing ────────────────────────────────────────────────────────

    async _focusMatch() {
        if (this._idx < 0 || this._idx >= this._matches.length) return;
        const m = this._matches[this._idx];

        this._clearHighlights();

        // 1. If "all sheets" mode and the match is in a different sheet — we can't scroll
        //    to it since those tables aren't rendered. Highlight count & show toast instead.
        const tableCard = document.querySelector(`.table-card[data-table-id="${m.tableId}"]`);
        if (!tableCard) return;

        // 2. If the table is collapsed, expand it first then wait for the animation
        if (tableCard.classList.contains('collapsed')) {
            tableCard.classList.remove('collapsed');
            tableCard.dispatchEvent(new CustomEvent('rtl:table-expand', {
                bubbles: true,
                detail: { tableId: m.tableId },
            }));
            // Wait for the expand animation (matches CSS transition duration 280ms)
            await new Promise(r => setTimeout(r, 310));
        }

        if (m.row === -1) {
            // Table name match — highlight the table card header area as a whole
            tableCard.classList.add('table-search-hit');
            tableCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }

        // Cell match
        const cell = tableCard.querySelector(`.cell[data-row="${m.row}"][data-col="${m.col}"]`);
        if (!cell) return;

        cell.classList.add('cell--search-hit');
        cell.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    _clearHighlights() {
        document.querySelectorAll('.cell--search-hit').forEach(el => el.classList.remove('cell--search-hit'));
        document.querySelectorAll('.table-search-hit').forEach(el => el.classList.remove('table-search-hit'));
    }

    _updateCount() {
        if (!this._countEl) return;
        if (!this._matches.length || !this._query.trim()) {
            this._countEl.textContent = '';
            return;
        }
        this._countEl.textContent = `${this._idx + 1}/${this._matches.length}`;
    }
}
