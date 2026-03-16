/**
 * Table Options Menu — RTL Knotless V2
 *
 * The ⋯ button dropdown per TableNote.
 * Extends OptionsMenu base for shared show/hide/position logic.
 *
 * Actions dispatched: 'pin', 'unpin', 'add-col', 'remove-col',
 *   'toggle-checklist', 'toggle-exclude-first-row', 'move-to',
 *   'delete-table', 'table-highlight', 'clear-table-highlight'
 */

import { OptionsMenu } from './options-menu-base.js';
import { buildSwatchHTML } from './context-menu.js';

const TABLE_SWATCH_HTML = buildSwatchHTML(' Highlight');

export class TableOptionsMenu extends OptionsMenu {
    /**
     * @param {Function} onAction - (action, tableId) => void
     */
    constructor(onAction) {
        // Highlight actions need the full data object (carries `key`); others just need tableId
        super('table-options-menu', (action, data) => {
            if (action === 'table-highlight' || action === 'clear-table-highlight') {
                onAction(action, data);
            } else {
                onAction(action, data.tableId);
            }
        });
    }

    buildHTML({ pinned, checklist, columns, excludeFirstRow }) {
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
            <div class="ctx-sub-option-wrapper${checklist ? ' open' : ''}">
                <div class="ctx-item ctx-toggle-row ctx-sub-option" data-action="toggle-exclude-first-row">
                    <span class="ctx-sub-arrow">↳</span> exclude first row
                    <div class="toggle toggle-sm ${excludeFirstRow ? 'on' : ''}"></div>
                </div>
            </div>
            <div class="ctx-divider"></div>
            <div class="ctx-item" data-action="move-to">move to →</div>
            <div class="ctx-divider"></div>
            <div class="ctx-item ctx-highlight-trigger">highlight</div>
            <div class="ctx-swatches">${TABLE_SWATCH_HTML}</div>
            <div class="ctx-divider"></div>
            <div class="ctx-item ctx-danger" data-action="delete-table">delete table</div>
        `;
    }

    /** Catch swatch clicks + handle in-place toggle actions */
    show(anchorEl, tableId, tableData) {
        super.show(anchorEl, { tableId, ...tableData }, 'right');

        // Override onclick to handle swatches + in-place toggles
        this._el.onclick = (e) => {
            // Swatch row expand/collapse — never closes the menu
            const expandToggle = e.target.closest('[data-action="toggle-swatches"]');
            if (expandToggle) {
                const swatchesEl = expandToggle.closest('.ctx-swatches');
                const isExpanded = swatchesEl?.classList.toggle('expanded');
                expandToggle.textContent = isExpanded ? '▴' : '▾';
                return;
            }

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

            if (action === 'toggle-checklist') {
                // Flip the toggle pill in-place
                const toggleEl = item.querySelector('.toggle');
                const isNowOn = !toggleEl?.classList.contains('on');
                toggleEl?.classList.toggle('on', isNowOn);
                this._data = { ...this._data, checklist: isNowOn };

                // Animate sub-option wrapper in/out
                const wrapper = this._el.querySelector('.ctx-sub-option-wrapper');
                if (wrapper) {
                    wrapper.classList.toggle('open', isNowOn);
                }

                this._onAction(action, { tableId: this._data.tableId });
                return; // don't close menu
            }

            if (action === 'toggle-exclude-first-row') {
                // Flip the sub-option toggle in-place
                const toggleEl = item.querySelector('.toggle');
                const isNowOn = !toggleEl?.classList.contains('on');
                toggleEl?.classList.toggle('on', isNowOn);
                this._data = { ...this._data, excludeFirstRow: isNowOn };

                this._onAction(action, { tableId: this._data.tableId });
                return; // don't close menu
            }

            this._onAction(action, { tableId: this._data.tableId });
            this.hide();
        };
    }

    /** Update column count display without hiding */
    updateColCount(count) {
        const span = this._el?.querySelector('.ctx-col-count');
        if (span) span.textContent = count;
    }
}
