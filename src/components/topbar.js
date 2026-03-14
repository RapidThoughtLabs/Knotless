/**
 * Topbar — RTL Knotless V2  (sheets edition)
 *
 * Layout (left → right):
 *   macOS: [native traffic lights safe zone] [sheet label+chevron] [⋯ sheet opts] [search-slot] [spacer] [* add pill] [⚙ circle]
 *   Windows: same but with win controls on right
 *
 * Emits:
 *   'rtl:sheet-change'        — detail: { sheet }   (sheet doc: { _id, name })
 *   'rtl:add-sheet-click'     — user wants to create a new sheet
 *   'rtl:sheet-options-click' — detail: { anchorEl, sheet } — three-dot button clicked
 *   'rtl:add-click'
 *   'rtl:settings-click'
 *   'rtl:search-close'        — search bar closed (emitted by SearchBar, caught here to restore ⋯ btn)
 */

export class Topbar {
    constructor() {
        this._el = null;
        this._currentSheet = null;  // { _id, name }
        this._sheets = [];          // all sheet docs
        this._menuOpen = false;
        this._searchOpen = false;
    }

    create() {
        const isMac = window.electron?.isMac ?? false;
        const isWindows = window.electron?.isWindows ?? false;

        const el = document.createElement('div');
        el.className = 'topbar';
        el.id = 'topbar-root';

        el.innerHTML = `
            ${/* Full-bar drag region (sits behind interactive elements via pointer-events) */''}
            <div class="topbar-drag-region"></div>

            ${/* macOS: reserved space for native traffic lights */''}
            ${isMac ? `<div class="tl-safe-zone"></div>` : ''}

            ${/* Sheet selector — bold accent text + chevron */''}
            <div class="filter-wrapper">
                <div class="filter-btn" id="topbar-filter-btn">
                    <span id="topbar-filter-label"></span>
                    <span class="filter-chevron">›</span>
                </div>
                <div class="filter-menu" id="topbar-filter-menu">
                    <div class="sheet-list" id="topbar-sheet-list"></div>
                    <div class="sheet-add-wrapper">
                        <button class="btn-add-sheet" id="topbar-add-sheet">* add sheet</button>
                    </div>
                </div>
            </div>

            ${/* Sheet options ⋯ button — solid disc, right of sheet label */''}
            <button class="btn-sheet-options" id="topbar-sheet-opts" title="Sheet options" aria-label="Sheet options">
                <span class="sheet-opts-dots">•••</span>
            </button>

            ${/* Search bar slot — ⋯ button and search bar share this space */''}
            <div class="search-bar-slot" id="search-bar-slot"></div>

            <div class="topbar-spacer"></div>

            <div class="topbar-actions">
                ${/* Pill add button with * icon */''}
                <button class="btn-add" id="topbar-add-btn">* add</button>

                ${/* Settings — accent circle border, black icon */''}
                <button class="btn-settings" id="topbar-settings-btn" title="Settings">⚙</button>
            </div>

            ${isWindows ? `
            <div class="windows-controls" id="windows-controls">
                <div class="win-controls-inner">
                    <button class="win-btn win-minimize" id="win-min" title="Minimize">
                        <svg width="10" height="1" viewBox="0 0 10 1"><rect width="10" height="1" fill="currentColor"/></svg>
                    </button>
                    <button class="win-btn win-maximize" id="win-max" title="Maximize">
                        <svg width="10" height="10" viewBox="0 0 10 10"><rect width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>
                    </button>
                    <button class="win-btn win-close" id="win-close" title="Close">
                        <svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 0L10 10M10 0L0 10" stroke="currentColor" stroke-width="1.2"/></svg>
                    </button>
                </div>
            </div>
            ` : ''}
        `;

        if (isWindows) el.classList.add('win-topbar');

        this._el = el;
        this._bind();
        return el;
    }

    mount(container) {
        if (!this._el) this.create();
        container.appendChild(this._el);
    }

    /** Update active sheet label and re-render list */
    setSheet(sheet) {
        this._currentSheet = sheet;
        const label = this._el?.querySelector('#topbar-filter-label');
        if (label) label.textContent = sheet.name;
        this._renderSheetList();
    }

    /** Replace full sheet list and re-render */
    setSheets(sheets) {
        this._sheets = sheets;
        this._renderSheetList();
    }

    /** Called by app.js after a sheet rename so the label updates */
    updateSheetLabel(sheet) {
        this._currentSheet = sheet;
        const label = this._el?.querySelector('#topbar-filter-label');
        if (label) label.textContent = sheet.name;
        this._renderSheetList();
    }

    /** Show the ⋯ button (called when search bar closes) */
    showSheetOptsBtn() {
        const btn = this._el?.querySelector('#topbar-sheet-opts');
        if (btn) btn.style.display = '';
        this._searchOpen = false;
    }

    /** Hide the ⋯ button (called when search bar opens) */
    hideSheetOptsBtn() {
        const btn = this._el?.querySelector('#topbar-sheet-opts');
        if (btn) btn.style.display = 'none';
        this._searchOpen = true;
    }

    _renderSheetList() {
        const list = this._el?.querySelector('#topbar-sheet-list');
        if (!list) return;
        list.innerHTML = this._sheets.map(s => `
            <div class="filter-option${s._id === this._currentSheet?._id ? ' active' : ''}"
                 data-sheet-id="${s._id}">${s.name}</div>
        `).join('');
    }

    _bind() {
        const el = this._el;
        const filterBtn = el.querySelector('#topbar-filter-btn');
        const filterMenu = el.querySelector('#topbar-filter-menu');

        // Toggle sheet dropdown
        filterBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._menuOpen = !this._menuOpen;
            filterMenu?.classList.toggle('filter-menu--open', this._menuOpen);
            filterBtn.classList.toggle('open', this._menuOpen);
            // Signal all other menus to close when this one opens
            if (this._menuOpen) {
                document.dispatchEvent(new CustomEvent('rtl:any-menu-open', { detail: { id: 'sheet-dropdown' } }));
            }
        });

        // Select a sheet from the list
        el.querySelector('#topbar-sheet-list')?.addEventListener('click', (e) => {
            const opt = e.target.closest('.filter-option');
            if (!opt) return;
            const sheetId = opt.dataset.sheetId;
            const sheet = this._sheets.find(s => s._id === sheetId);
            if (!sheet) return;
            this._currentSheet = sheet;
            el.querySelector('#topbar-filter-label').textContent = sheet.name;
            this._renderSheetList();
            filterMenu.classList.remove('filter-menu--open');
            this._menuOpen = false;
            filterBtn.classList.remove('open');
            document.dispatchEvent(new CustomEvent('rtl:sheet-change', { detail: { sheet } }));
        });

        // Add sheet button
        el.querySelector('#topbar-add-sheet')?.addEventListener('click', (e) => {
            e.stopPropagation();
            filterMenu.classList.remove('filter-menu--open');
            this._menuOpen = false;
            filterBtn.classList.remove('open');
            document.dispatchEvent(new CustomEvent('rtl:add-sheet-click'));
        });

        // ⋯ Sheet options button — toggle: open/close
        el.querySelector('#topbar-sheet-opts')?.addEventListener('click', (e) => {
            e.stopPropagation();
            const btn = e.currentTarget;
            // Dispatch toggle event — app.js decides to show or hide
            document.dispatchEvent(new CustomEvent('rtl:sheet-options-click', {
                detail: { anchorEl: btn, sheet: this._currentSheet }
            }));
        });

        // Listen for search bar close → restore ⋯ button
        document.addEventListener('rtl:search-close', () => {
            this.showSheetOptsBtn();
        });

        // Add table button
        el.querySelector('#topbar-add-btn')?.addEventListener('click', () => {
            document.dispatchEvent(new CustomEvent('rtl:add-click'));
        });

        // Settings button
        el.querySelector('#topbar-settings-btn')?.addEventListener('click', () => {
            document.dispatchEvent(new CustomEvent('rtl:settings-click'));
        });

        // Reset ⋯ button state whenever the sheet-options-menu hides (outside click, Escape, action)
        document.addEventListener('rtl:menu-hide', (e) => {
            if (e.detail?.id === 'sheet-options-menu') {
                el.querySelector('#topbar-sheet-opts')?.classList.remove('open');
            }
        });

        // Close sheet dropdown when any other menu opens
        document.addEventListener('rtl:any-menu-open', (e) => {
            if (e.detail?.id !== 'sheet-dropdown' && this._menuOpen) {
                filterMenu?.classList.remove('filter-menu--open');
                filterBtn?.classList.remove('open');
                this._menuOpen = false;
            }
        });

        // Close menu on outside click
        document.addEventListener('click', (e) => {
            if (this._menuOpen &&
                !filterMenu?.contains(e.target) &&
                !filterBtn?.contains(e.target)) {
                filterMenu?.classList.remove('filter-menu--open');
                filterBtn?.classList.remove('open');
                this._menuOpen = false;
            }
        });

        // Windows controls
        if (window.electron?.isWindows) {
            el.querySelector('#win-min')?.addEventListener('click', () => window.electron.windowControls.minimize());
            el.querySelector('#win-max')?.addEventListener('click', () => window.electron.windowControls.maximize());
            el.querySelector('#win-close')?.addEventListener('click', () => window.electron.windowControls.close());

            // Swap maximize icon when window is maximized/restored
            window.electron.onWindowMaximized?.((isMax) => {
                const svg = el.querySelector('#win-max svg');
                if (!svg) return;
                svg.innerHTML = isMax
                    ? '<path d="M2 0H10V8M0 2H8V10H0V2Z" stroke="currentColor" fill="none" stroke-width="1.2"/>'
                    : '<rect width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.2"/>';
            });
        }
    }
}
