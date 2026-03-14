/**
 * Context Menu — RTL Knotless V2
 *
 * Cell right-click / long-press context menu.
 *
 * Unified 4-group layout for all cell types:
 *   Group 1 — Action      (url → "open in browser", cmd → "▶ run",
 *                           image → "open", file → "open",
 *                           path → "open in finder" / "open in explorer")
 *   Group 2 — Clipboard   (copy / paste / clear; file has 3 copy variants)
 *   Group 3 — Highlight   (swatches + clear — ALL cell types)
 *   Group 4 — Danger      ("delete row" in red)
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
    { key: 'hl-r', label: 'Red',    color: 'rgba(255,80,80,0.65)',   bg: 'rgba(255,80,80,0.10)' },
    { key: 'hl-o', label: 'Orange', color: 'rgba(255,160,50,0.65)',  bg: 'rgba(255,160,50,0.10)' },
    { key: 'hl-y', label: 'Yellow', color: 'rgba(250,220,50,0.65)',  bg: 'rgba(250,220,50,0.10)' },
    { key: 'hl-g', label: 'Green',  color: 'rgba(80,200,100,0.65)',  bg: 'rgba(80,200,100,0.10)' },
    { key: 'hl-b', label: 'Blue',   color: 'rgba(60,140,255,0.65)',  bg: 'rgba(60,140,255,0.10)' },
];

// ── Highlight swatches HTML (reused in every menu variant) ────────────────────
const SWATCH_HTML = HIGHLIGHT_COLORS.map(h =>
    `<div class="ctx-swatch" data-highlight="${h.key}" title="${h.label}" style="background:${h.color};"></div>`
).join('') + `<div class="ctx-swatch ctx-swatch--clear" data-action="clear-highlight" title="Remove highlight">✕</div>`;

// ── Single builder — composes the 4-group layout per cell type ────────────────
function buildMenuHTML(cellType) {
    let html = '';

    // ── Group 1: Action (url / cmd / image / file only) ─────────────────────
    if (cellType === 'url') {
        html += `<div class="ctx-item ctx-action ctx-action--url" data-action="open-url">open in browser</div>`;
        html += `<div class="ctx-divider"></div>`;
    } else if (cellType === 'command') {
        html += `<div class="ctx-item ctx-action ctx-action--cmd" data-action="run">▶ run</div>`;
        html += `<div class="ctx-divider"></div>`;
    } else if (cellType === 'image') {
        html += `<div class="ctx-item ctx-action ctx-action--blob" data-action="open">open</div>`;
        html += `<div class="ctx-divider"></div>`;
    } else if (cellType === 'file') {
        html += `<div class="ctx-item ctx-action ctx-action--blob" data-action="open">open</div>`;
        html += `<div class="ctx-divider"></div>`;
    } else if (cellType === 'path') {
        const isMac = navigator.platform?.startsWith('Mac');
        const label = isMac ? 'open in finder' : 'open in explorer';
        html += `<div class="ctx-item ctx-action ctx-action--path" data-action="reveal-path">${label}</div>`;
        html += `<div class="ctx-divider"></div>`;
    }
    // text / token: no Group 1 — menu starts directly at Group 2

    // ── Group 2: Clipboard ───────────────────────────────────────────────────
    if (cellType === 'file') {
        // Three copy variants for file cells
        html += `<div class="ctx-item" data-action="copy-file">copy file</div>`;
        html += `<div class="ctx-item" data-action="copy-path">copy path</div>`;
        html += `<div class="ctx-item" data-action="copy-text">copy as text</div>`;
        // File cells are read-only — no paste
    } else if (cellType === 'image') {
        html += `<div class="ctx-item" data-action="copy">copy image</div>`;
        // Image cells are read-only — no paste
    } else {
        // text / url / command — all editable
        html += `<div class="ctx-item" data-action="copy">copy</div>`;
        html += `<div class="ctx-item" data-action="paste">paste</div>`;
    }
    html += `<div class="ctx-item" data-action="clear">clear</div>`;

    // ── Group 3: Highlight — every cell type ─────────────────────────────────
    html += `<div class="ctx-divider"></div>`;
    html += `<div class="ctx-item ctx-highlight-trigger">highlight <span class="ctx-arrow">›</span></div>`;
    html += `<div class="ctx-swatches">${SWATCH_HTML}</div>`;

    // ── Group 4: Danger ──────────────────────────────────────────────────────
    html += `<div class="ctx-divider"></div>`;
    html += `<div class="ctx-item ctx-danger" data-action="delete-row">delete row</div>`;

    return html;
}

export class CellContextMenu {
    /**
     * @param {Object} options
     * @param {Function} options.onAction - (action, cellEl, extra?) => void
     *   actions: 'open-url', 'run', 'open', 'copy', 'paste', 'clear',
     *            'copy-file', 'copy-path', 'copy-text',
     *            'highlight', 'clear-highlight', 'delete-row'
     */
    constructor({ onAction } = {}) {
        this._onAction = onAction || (() => { });
        this._el = null;
        this._targetCell = null;
        this._hideTimer = null;
    }

    mount() {
        this._el = document.createElement('div');
        this._el.id = 'cell-ctx-menu';
        this._el.className = 'ctx-menu ctx-menu--hidden';
        this._el.innerHTML = buildMenuHTML('text'); // default seed
        document.body.appendChild(this._el);
        this._bind();
    }

    show(x, y, cellEl) {
        this._targetCell = cellEl;
        const el = this._el;
        if (!el) return;

        // Cancel any pending hide animation
        if (this._hideTimer) { clearTimeout(this._hideTimer); this._hideTimer = null; }
        el.classList.remove('ctx-menu--hiding');

        // Signal all other menus to close
        document.dispatchEvent(new CustomEvent('rtl:any-menu-open', { detail: { id: 'cell-ctx-menu' } }));

        // Determine cell type and rebuild menu HTML
        const isFile    = cellEl.classList.contains('has-file');
        const isImage   = cellEl.classList.contains('has-image');
        const isCommand = cellEl.classList.contains('has-command');
        const isUrl     = cellEl.classList.contains('has-url');
        const isPath    = cellEl.classList.contains('has-path');

        const cellType = isFile    ? 'file'
                       : isImage   ? 'image'
                       : isCommand ? 'command'
                       : isUrl     ? 'url'
                       : isPath    ? 'path'
                                   : 'text';

        el.innerHTML = buildMenuHTML(cellType);
        el.classList.remove('ctx-menu--hidden');

        // Position so menu never overflows viewport
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        let left = x, top = y;
        if (left + 170 > vw) left = vw - 174;
        if (top + el.offsetHeight > vh) top = vh - el.offsetHeight - 8;
        el.style.left = `${left}px`;
        el.style.top  = `${top}px`;

        // Animate in
        if (document.documentElement.dataset.anim !== 'off') {
            el.classList.add('ctx-menu--entering');
            setTimeout(() => el.classList.remove('ctx-menu--entering'), 130);
        }

        // Suppress the very next document click so the menu isn't dismissed
        // immediately when a long-press pointerup triggers a synthetic click.
        this._suppressNextClose = true;
        setTimeout(() => { this._suppressNextClose = false; }, 0);
    }

    hide() {
        const el = this._el;
        if (!el) return;
        if (el.classList.contains('ctx-menu--hiding') || el.classList.contains('ctx-menu--hidden')) {
            this._targetCell = null;
            return;
        }
        if (document.documentElement.dataset.anim === 'off') {
            el.classList.add('ctx-menu--hidden');
            this._targetCell = null;
            return;
        }
        el.classList.add('ctx-menu--hiding');
        this._hideTimer = setTimeout(() => {
            el.classList.add('ctx-menu--hidden');
            el.classList.remove('ctx-menu--hiding');
            this._hideTimer = null;
        }, 100);
        this._targetCell = null;
    }

    _bind() {
        const el = this._el;

        // Action items — use event delegation (innerHTML is rebuilt on every show())
        el.addEventListener('click', (e) => {
            const item   = e.target.closest('[data-action]');
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
            if (this._suppressNextClose) { this._suppressNextClose = false; return; }
            if (!el.contains(e.target)) this.hide();
        });

        // Hide on ESC
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.hide();
        });

        // Close when any other menu opens
        document.addEventListener('rtl:any-menu-open', (e) => {
            if (e.detail?.id !== 'cell-ctx-menu') this.hide();
        });

        // Prevent right-click on menu from re-triggering
        el.addEventListener('contextmenu', (e) => e.preventDefault());
    }
}
