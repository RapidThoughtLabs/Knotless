/**
 * App Footer — RTL Knotless V2
 *
 * Bottom status bar: RTL://noteless brand · table count · filter · saved status
 */

export class AppFooter {
    constructor() {
        this._el = null;
    }

    create() {
        const el = document.createElement('div');
        el.className = 'app-footer';
        el.id = 'app-footer-root';
        el.innerHTML = `
            <div class="footer-brand"><span>RTL://</span>noteless</div>
            <div class="footer-info">
                <span id="footer-count">0 tables</span><span class="footer-dot">·</span><span id="footer-filter">recents</span>
            </div>
            <div class="footer-end">
                <div class="footer-status">
                    <div class="status-dot" id="footer-status-dot"></div>
                    <span id="footer-status-text">saved</span>
                </div>
            </div>
        `;
        this._el = el;
        return el;
    }

    mount(container) {
        if (!this._el) this.create();
        container.appendChild(this._el);
    }

    update({ count = 0, filter = 'recents', status = 'saved' } = {}) {
        if (!this._el) return;
        const countEl = this._el.querySelector('#footer-count');
        const filterEl = this._el.querySelector('#footer-filter');
        const statusText = this._el.querySelector('#footer-status-text');
        const statusDot = this._el.querySelector('#footer-status-dot');

        if (countEl) countEl.textContent = `${count} table${count !== 1 ? 's' : ''}`;
        if (filterEl) filterEl.textContent = filter;
        if (statusText) statusText.textContent = status;
        if (statusDot) {
            statusDot.classList.toggle('saving', status === 'saving');
        }
    }

    setSaving() { this.update({ status: 'saving...' }); }
    setSaved() { this.update({ status: 'saved' }); }
}
