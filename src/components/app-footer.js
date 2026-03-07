/**
 * App Footer — RTL Knotless V2
 *
 * Bottom status bar: rtl://knotless brand · table count · filter · saved status
 */

import { showToast } from './toast.js';

export class AppFooter {
    constructor() {
        this._el      = null;
        this._dbPath  = null;
        // Track count/filter internally so setSaving/setSaved don't wipe them
        this._count   = 0;
        this._filter  = 'recents';
    }

    create() {
        const el = document.createElement('div');
        el.className = 'app-footer';
        el.id = 'app-footer-root';
        el.innerHTML = `
            <div class="footer-brand">
                <span class="footer-brand-link" id="footer-rtl-link">rtl://</span>knotless
            </div>
            <div class="footer-info">
                <span id="footer-count">0 tables</span><span class="footer-dot">·</span><span id="footer-filter">recents</span>
            </div>
            <div class="footer-end">
                <div class="footer-status-wrap" id="footer-status-area">
                    <div class="status-dot" id="footer-status-dot"></div>
                    <span id="footer-status-text">saved</span>
                    <span class="status-sep">·</span>
                    <span class="status-path" id="footer-status-path"></span>
                </div>
            </div>
        `;
        this._el = el;

        // rtl:// link → rapid thought labs
        el.querySelector('#footer-rtl-link')?.addEventListener('click', () => {
            window.electron?.openExternal?.('https://www.rapidthoughtlabs.com');
        });

        // Status area click → copy DB path
        el.querySelector('#footer-status-area')?.addEventListener('click', () => {
            if (!this._dbPath) return;
            navigator.clipboard.writeText(this._dbPath)
                .then(() => showToast('path copied', 'success'))
                .catch(() => {});
        });

        // Fetch + display DB path (non-blocking)
        this._fetchDbPath();

        return el;
    }

    async _fetchDbPath() {
        try {
            const fullPath = await window.electron?.getDbPath?.();
            if (!fullPath || !this._el) return;

            this._dbPath = fullPath;

            // Normalise display to forward slashes, show full path
            // CSS text-overflow + direction:rtl will truncate from the left
            const display = fullPath.replace(/\\/g, '/');

            const pathEl = this._el.querySelector('#footer-status-path');
            if (pathEl) pathEl.textContent = display;
        } catch {
            // non-critical — path feature is optional
        }
    }

    mount(container) {
        if (!this._el) this.create();
        container.appendChild(this._el);
    }

    /**
     * Update displayed values.
     * Only updates fields that are explicitly passed (undefined = keep current).
     */
    update({ count, filter, status } = {}) {
        if (!this._el) return;

        if (count !== undefined) {
            this._count = count;
            const el = this._el.querySelector('#footer-count');
            if (el) el.textContent = `${count} table${count !== 1 ? 's' : ''}`;
        }

        if (filter !== undefined) {
            this._filter = filter;
            const el = this._el.querySelector('#footer-filter');
            if (el) el.textContent = filter;
        }

        if (status !== undefined) {
            const textEl = this._el.querySelector('#footer-status-text');
            const dotEl  = this._el.querySelector('#footer-status-dot');
            if (textEl) textEl.textContent = status;
            if (dotEl)  dotEl.classList.toggle('saving', status === 'saving');
        }
    }

    setSaving() { this.update({ status: 'saving...' }); }
    setSaved()  { this.update({ status: 'saved' }); }
}
