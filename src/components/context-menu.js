/**
 * Context Menu — RTL Knotless V2
 *
 * Cell right-click context menu: copy, paste, clear, highlight (5 swatches + clear), delete row
 *
 * Usage:
 *   import { CellContextMenu } from './context-menu.js';
 *   const menu = new CellContextMenu({ onAction });
 *   menu.mount();
 *   // Then on right-click: menu.show(x, y, cellEl);
 */

import { showToast } from './toast.js';

// Fixed highlight colours matching V2 design (row bg at 10% opacity)
export const HIGHLIGHT_COLORS = [
    { key: 'hl-r', label: 'Red', color: 'rgba(255,80,80,0.65)', bg: 'rgba(255,80,80,0.10)' },
    { key: 'hl-o', label: 'Orange', color: 'rgba(255,160,50,0.65)', bg: 'rgba(255,160,50,0.10)' },
    { key: 'hl-y', label: 'Yellow', color: 'rgba(250,220,50,0.65)', bg: 'rgba(250,220,50,0.10)' },
    { key: 'hl-g', label: 'Green', color: 'rgba(80,200,100,0.65)', bg: 'rgba(80,200,100,0.10)' },
    { key: 'hl-b', label: 'Blue', color: 'rgba(60,140,255,0.65)', bg: 'rgba(60,140,255,0.10)' },
];

export class CellContextMenu {
    /**
     * @param {Object} options
     * @param {Function} options.onAction - (action, cellEl, extra?) => void
     *   actions: 'copy', 'paste', 'clear', 'highlight', 'clear-highlight', 'delete-row'
     */
    constructor({ onAction } = {}) {
        this._onAction = onAction || (() => { });
        this._el = null;
        this._targetCell = null;
    }

    mount() {
        this._el = document.createElement('div');
        this._el.id = 'cell-ctx-menu';
        this._el.className = 'ctx-menu ctx-menu--hidden';
        this._el.innerHTML = `
            <div class="ctx-item" data-action="copy">copy</div>
            <div class="ctx-item" data-action="paste">paste</div>
            <div class="ctx-item" data-action="clear">clear</div>
            <div class="ctx-divider"></div>
            <div class="ctx-item ctx-highlight-trigger">highlight <span class="ctx-arrow">›</span></div>
            <div class="ctx-swatches">
                ${HIGHLIGHT_COLORS.map(h => `
                    <div class="ctx-swatch" data-highlight="${h.key}" title="${h.label}"
                         style="background:${h.color};"></div>
                `).join('')}
                <div class="ctx-swatch ctx-swatch--clear" data-action="clear-highlight" title="Remove highlight">✕</div>
            </div>
            <div class="ctx-divider"></div>
            <div class="ctx-item ctx-danger" data-action="delete-row">delete row</div>
        `;
        document.body.appendChild(this._el);
        this._bind();
    }

    show(x, y, cellEl) {
        this._targetCell = cellEl;
        const el = this._el;
        if (!el) return;

        el.classList.remove('ctx-menu--hidden');

        // Position so menu never overflows viewport
        const rect = el.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        let left = x, top = y;
        if (left + 170 > vw) left = vw - 174;
        if (top + el.offsetHeight > vh) top = vh - el.offsetHeight - 8;
        el.style.left = `${left}px`;
        el.style.top = `${top}px`;
    }

    hide() {
        this._el?.classList.add('ctx-menu--hidden');
        this._targetCell = null;
    }

    _bind() {
        const el = this._el;

        // Action items
        el.addEventListener('click', (e) => {
            const item = e.target.closest('[data-action]');
            const swatch = e.target.closest('[data-highlight]');

            if (swatch && this._targetCell) {
                const key = swatch.dataset.highlight;
                this._onAction('highlight', this._targetCell, key);
                this.hide();
                return;
            }

            if (item && this._targetCell) {
                this._onAction(item.dataset.action, this._targetCell);
                this.hide();
            }
        });

        // Hide on outside click
        document.addEventListener('click', (e) => {
            if (!el.contains(e.target)) this.hide();
        });

        // Hide on ESC
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.hide();
        });

        // Prevent right-click on menu from re-triggering
        el.addEventListener('contextmenu', (e) => e.preventDefault());
    }
}
