/**
 * OptionsMenu — RTL Knotless V2
 *
 * Reusable base class for all dropdown option menus in Knotless.
 * Used by TableOptionsMenu and SheetOptionsMenu.
 *
 * Shared features:
 *   - Mounts a singleton ctx-menu div to document.body
 *   - Positions the menu below/above the anchor element
 *   - Closes on outside click or Escape
 *   - Subclasses implement buildHTML(data) + handleAction(action, data)
 *
 * Usage:
 *   class MyMenu extends OptionsMenu {
 *     buildHTML(data) { return `<div class="ctx-item" data-action="foo">foo</div>`; }
 *     handleAction(action, data) { ... }
 *   }
 */

export class OptionsMenu {
    /**
     * @param {string} id     - Unique element ID for the menu div
     * @param {Function} onAction - (action, data) => void  called on item click
     */
    constructor(id, onAction) {
        this._id = id;
        this._onAction = onAction || (() => { });
        this._el = null;
        this._data = null;        // whatever was passed to show()
        this._anchorEl = null;    // button that triggered this menu
        this._menuWidth = 172;    // override in subclass if needed
        this._hideTimer = null;
    }

    /**
     * Mount the menu element to the DOM. Call once on app init.
     */
    mount() {
        this._el = document.createElement('div');
        this._el.id = this._id;
        this._el.className = 'ctx-menu ctx-menu--hidden';
        document.body.appendChild(this._el);

        // Close on outside click
        document.addEventListener('click', (e) => {
            if (this._el && !this._el.contains(e.target) && e.target !== this._anchorEl) {
                this.hide();
            }
        });
        // Close on Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.hide();
        });
        // Close when any other menu opens
        document.addEventListener('rtl:any-menu-open', (e) => {
            if (e.detail?.id !== this._id) this.hide();
        });
        // Close on scroll — menu is positionally anchored; scrolling orphans it
        window.addEventListener('scroll', () => { if (this.isVisible) this.hide(); }, { capture: true, passive: true });
    }

    /**
     * Show the menu anchored to an element.
     * @param {HTMLElement} anchorEl - Button that was clicked
     * @param {*} data               - Passed through to buildHTML / handleAction
     * @param {'left'|'right'} [align='right'] - Whether to right-align or left-align below anchor
     */
    show(anchorEl, data, align = 'right') {
        this._anchorEl = anchorEl;
        this._data = data;

        // Cancel any pending hide animation
        if (this._hideTimer) { clearTimeout(this._hideTimer); this._hideTimer = null; }
        this._el.classList.remove('ctx-menu--hiding');

        // Signal all other menus to close
        document.dispatchEvent(new CustomEvent('rtl:any-menu-open', { detail: { id: this._id } }));

        // Build content (subclass)
        this._el.innerHTML = this.buildHTML(data);
        this._el.classList.remove('ctx-menu--hidden');

        // Position
        const rect = anchorEl.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const w = this._menuWidth;

        let left = align === 'left'
            ? rect.left                  // left-align: popup starts at left edge of button
            : rect.right - w;            // right-align: popup ends at right edge of button

        let top = rect.bottom + 4;

        // Clamp horizontally
        if (left < 8) left = 8;
        if (left + w > vw) left = vw - w - 8;

        // Flip above if no room below
        // (measure after innerHTML set so offsetHeight is real)
        const mh = this._el.offsetHeight;
        if (top + mh > vh - 8) {
            top = rect.top - mh - 4;
            this._el.style.transformOrigin = 'bottom center';
        } else {
            this._el.style.transformOrigin = 'top center';
        }

        this._el.style.left = `${left}px`;
        this._el.style.top = `${top}px`;
        this._el.style.minWidth = `${w}px`;

        // Animate in
        if (document.documentElement.dataset.anim !== 'off') {
            this._el.classList.add('ctx-menu--entering');
            setTimeout(() => this._el?.classList.remove('ctx-menu--entering'), 130);
        }

        // Wire clicks — subclass or passed-in handler
        this._el.onclick = (e) => {
            const item = e.target.closest('[data-action]');
            if (!item) return;
            const action = item.dataset.action;
            if (item.classList.contains('ctx-disabled')) return;
            this._onAction(action, this._data);
            this.hide();
        };
    }

    /** Whether the popup is currently visible (excludes mid-hide state) */
    get isVisible() {
        return this._el &&
            !this._el.classList.contains('ctx-menu--hidden') &&
            !this._el.classList.contains('ctx-menu--hiding');
    }

    hide() {
        if (!this._el) return;
        if (this._el.classList.contains('ctx-menu--hiding')) return;
        const wasVisible = !this._el.classList.contains('ctx-menu--hidden');
        if (!wasVisible) return;

        // Notify listeners immediately (topbar uses this to reset button state)
        document.dispatchEvent(new CustomEvent('rtl:menu-hide', { detail: { id: this._id } }));
        this._anchorEl = null;
        this._data = null;

        if (document.documentElement.dataset.anim === 'off') {
            this._el.classList.add('ctx-menu--hidden');
            return;
        }

        this._el.classList.add('ctx-menu--hiding');
        this._hideTimer = setTimeout(() => {
            this._el?.classList.add('ctx-menu--hidden');
            this._el?.classList.remove('ctx-menu--hiding');
            this._hideTimer = null;
        }, 100);
    }

    /**
     * Subclasses override this to return the inner HTML of the menu.
     * @param {*} data
     * @returns {string}
     */
    // eslint-disable-next-line no-unused-vars
    buildHTML(data) {
        return '';
    }
}
