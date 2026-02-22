/**
 * Table Options Menu — RTL Knotless V2
 *
 * The ⋯ button dropdown per TableNote.
 * Shared singleton — repositions to the triggering button each time.
 *
 * Actions dispatched: 'pin', 'unpin', 'add-col', 'remove-col',
 *   'toggle-checklist', 'star', 'archive', 'unarchive', 'move-recents',
 *   'delete-row', 'delete-table'
 */

export class TableOptionsMenu {
    /**
     * @param {Function} onAction - (action, tableId, extra?) => void
     */
    constructor(onAction) {
        this._onAction = onAction || (() => { });
        this._el = null;
        this._tableId = null;
        this._tableData = null;
    }

    mount() {
        this._el = document.createElement('div');
        this._el.id = 'table-options-menu';
        this._el.className = 'ctx-menu ctx-menu--hidden';
        document.body.appendChild(this._el);

        // Hide on outside click
        document.addEventListener('click', (e) => {
            if (this._el && !this._el.contains(e.target)) this.hide();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.hide();
        });
    }

    /**
     * Show options menu for a given table.
     * @param {HTMLElement} anchorEl - The ⋯ button
     * @param {string} tableId
     * @param {Object} tableData - { pinned, type, checklist, columns }
     */
    show(anchorEl, tableId, tableData) {
        this._tableId = tableId;
        this._tableData = tableData;

        const { pinned, type, checklist, columns } = tableData;

        this._el.innerHTML = `
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
            ${type === 'recent' ? `
                <div class="ctx-item" data-action="star">add to starred ★</div>
                <div class="ctx-item" data-action="archive">send to archives</div>
            ` : ''}
            ${type === 'starred' ? `
                <div class="ctx-item" data-action="move-recents">move to recents</div>
                <div class="ctx-item" data-action="archive">send to archives</div>
            ` : ''}
            ${type === 'archives' ? `
                <div class="ctx-item" data-action="star">add to starred ★</div>
                <div class="ctx-item" data-action="move-recents">move to recents</div>
            ` : ''}
            <div class="ctx-divider"></div>
            <div class="ctx-item" data-action="delete-row">delete last row</div>
            <div class="ctx-item ctx-danger" data-action="delete-table">delete table</div>
        `;

        this._el.classList.remove('ctx-menu--hidden');

        // Position below anchor
        const rect = anchorEl.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        let left = rect.right - 164;
        let top = rect.bottom + 4;
        if (left < 8) left = 8;
        if (left + 164 > vw) left = vw - 168;
        if (top + this._el.offsetHeight > vh) top = rect.top - this._el.offsetHeight - 4;

        this._el.style.left = `${left}px`;
        this._el.style.top = `${top}px`;

        // Bind clicks
        this._el.onclick = (e) => {
            const item = e.target.closest('[data-action]');
            if (!item) return;
            const action = item.dataset.action;
            this._onAction(action, this._tableId);
            this.hide();
        };
    }

    hide() {
        this._el?.classList.add('ctx-menu--hidden');
        this._tableId = null;
    }

    /** Update column count display without hiding */
    updateColCount(count) {
        const span = this._el?.querySelector('.ctx-col-count');
        if (span) span.textContent = count;
        this._tableData = { ...this._tableData, columns: count };
    }
}
