/**
 * Table Options Menu — RTL Knotless V2
 *
 * The ⋯ button dropdown per TableNote.
 * Extends OptionsMenu base for shared show/hide/position logic.
 *
 * Actions dispatched: 'pin', 'unpin', 'add-col', 'remove-col',
 *   'toggle-checklist', 'delete-table', 'table-highlight', 'clear-table-highlight'
 */

import { OptionsMenu } from './options-menu-base.js';
import { HIGHLIGHT_COLORS } from './context-menu.js';

const TABLE_SWATCH_HTML = HIGHLIGHT_COLORS.map(h =>
    `<div class="ctx-swatch" data-highlight="${h.key}" title="${h.label} Highlight" style="background:${h.color};"></div>`
).join('') + `<div class="ctx-swatch ctx-swatch--clear" data-action="clear-table-highlight" title="Remove highlight">✕</div>`;

export class TableOptionsMenu extends OptionsMenu {
    /**
     * @param {Function} onAction - (action, tableId) => void
     */
    constructor(onAction) {
        // Wrap so base class signature (action, data) maps to (action, tableId)
        super('table-options-menu', (action, data) => onAction(action, data.tableId));
    }

    /**
     * Show options menu for a given table.
     * @param {HTMLElement} anchorEl - The ⋯ button
     * @param {string} tableId
     * @param {Object} tableData - { pinned, checklist, columns }
     */
    show(anchorEl, tableId, tableData) {
        super.show(anchorEl, { tableId, ...tableData }, 'right');
    }

    buildHTML({ pinned, checklist, columns }) {
        return `
            <div class="ctx-item" data-action="${pinned ? 'unpin' : 'pin'}">
                ${pinned ? 'unpin ↓' : 'pin to top ↑'}
            </div>
            <div class="ctx-item ctx-col-row">
                columns
                <span class="ctx-col-controls">
                    <span class="ctx-col-btn" data-action="remove-col">−</span>
                    <span class="ctx-col-count">${columns}</span>
                    <span class="ctx-col-btn" data-action="add-col">+</span>
                </span>
            </div>
            <div class="ctx-item ctx-toggle-row" data-action="toggle-checklist">
                checklist
                <div class="toggle toggle-sm ${checklist ? 'on' : ''}"></div>
            </div>
            <div class="ctx-divider"></div>
            <div class="ctx-item ctx-highlight-trigger">highlight <span class="ctx-arrow">›</span></div>
            <div class="ctx-swatches">${TABLE_SWATCH_HTML}</div>
            <div class="ctx-divider"></div>
            <div class="ctx-item ctx-danger" data-action="delete-table">delete table</div>
        `;
    }

    /** Catch swatch clicks before they hit the default action handler */
    show(anchorEl, tableId, tableData) {
        super.show(anchorEl, { tableId, ...tableData }, 'right');
        
        // Override onclick to handle swatches properly
        this._el.onclick = (e) => {
            const swatch = e.target.closest('[data-highlight]');
            if (swatch) {
                const key = swatch.dataset.highlight;
                this._onAction('table-highlight', { tableId: this._data.tableId, key });
                this.hide();
                return;
            }

            const item = e.target.closest('[data-action]');
            if (!item) return;
            const action = item.dataset.action;
            if (item.classList.contains('ctx-disabled')) return;
            
            // For clear-table-highlight, pass the action with tableId
            if (action === 'clear-table-highlight') {
                this._onAction(action, { tableId: this._data.tableId });
            } else {
                this._onAction(action, { tableId: this._data.tableId });
            }
            this.hide();
        };
    }

    /** Update column count display without hiding */
    updateColCount(count) {
        const span = this._el?.querySelector('.ctx-col-count');
        if (span) span.textContent = count;
    }
}
