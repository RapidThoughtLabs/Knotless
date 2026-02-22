/**
 * Topbar — RTL Knotless V2  (revised)
 *
 * Layout (left → right):
 *   macOS: [native traffic lights safe zone] [filter label+chevron] [spacer] [* add pill] [⚙ circle]
 *   Windows: [filter label+chevron] [spacer] [* add pill] [⚙ circle] [win controls]
 *
 * Emits:
 *   'rtl:filter-change' — detail: { filter }
 *   'rtl:add-click'
 *   'rtl:settings-click'
 */

const FILTERS = ['recents', 'starred', 'archives'];

export class Topbar {
    constructor() {
        this._el = null;
        this._currentFilter = 'recents';
        this._menuOpen = false;
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

            ${/* Filter label — bold accent text + chevron, NO border */''}
            <div class="filter-wrapper">
                <div class="filter-btn" id="topbar-filter-btn">
                    <span id="topbar-filter-label">recents</span>
                    <span class="filter-chevron">›</span>
                </div>
                <div class="filter-menu" id="topbar-filter-menu">
                    ${FILTERS.map(f => `
                        <div class="filter-option${f === 'recents' ? ' active' : ''}" data-filter="${f}">${f}</div>
                    `).join('')}
                </div>
            </div>

            <div class="topbar-spacer"></div>

            <div class="topbar-actions">
                ${/* Pill add button with * icon */''}
                <button class="btn-add" id="topbar-add-btn">* add</button>

                ${/* Settings — accent circle border, black icon */''}
                <button class="btn-settings" id="topbar-settings-btn" title="Settings">⚙</button>
            </div>

            ${isWindows ? `
            <div class="windows-controls">
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
            ` : ''}
        `;

        this._el = el;
        this._bind();
        return el;
    }

    mount(container) {
        if (!this._el) this.create();
        container.appendChild(this._el);
    }

    setFilter(filter) {
        this._currentFilter = filter;
        const label = this._el?.querySelector('#topbar-filter-label');
        if (label) label.textContent = filter;
        this._el?.querySelectorAll('.filter-option').forEach(opt => {
            opt.classList.toggle('active', opt.dataset.filter === filter);
        });
    }

    _bind() {
        const el = this._el;
        const filterBtn = el.querySelector('#topbar-filter-btn');
        const filterMenu = el.querySelector('#topbar-filter-menu');

        // Toggle dropdown
        filterBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this._menuOpen = !this._menuOpen;
            filterMenu?.classList.toggle('filter-menu--open', this._menuOpen);
            filterBtn.classList.toggle('open', this._menuOpen);
        });

        // Select a filter
        filterMenu?.addEventListener('click', (e) => {
            const opt = e.target.closest('.filter-option');
            if (!opt) return;
            const filter = opt.dataset.filter;
            this._currentFilter = filter;
            el.querySelector('#topbar-filter-label').textContent = filter;
            filterMenu.querySelectorAll('.filter-option').forEach(o =>
                o.classList.toggle('active', o === opt));
            filterMenu.classList.remove('filter-menu--open');
            this._menuOpen = false;
            filterBtn.classList.remove('open');
            document.dispatchEvent(new CustomEvent('rtl:filter-change', { detail: { filter } }));
        });

        // Add button
        el.querySelector('#topbar-add-btn')?.addEventListener('click', () => {
            document.dispatchEvent(new CustomEvent('rtl:add-click'));
        });

        // Settings button
        el.querySelector('#topbar-settings-btn')?.addEventListener('click', () => {
            document.dispatchEvent(new CustomEvent('rtl:settings-click'));
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
        }
    }
}
