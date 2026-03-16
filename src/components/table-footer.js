/**
 * Table Footer — RTL Knotless V2
 *
 * Renders the footer bar of a single TableNote:
 *   [↑ pin] [table name] [dial] [spacer] [+ row] [⋯ options]
 *
 * Ref: V2 HTML lines 222-265
 */

const DIAL_R = 10;
const DIAL_CIRC = 2 * Math.PI * DIAL_R; // ~62.83

/**
 * Build a checklist completion dial SVG.
 * @param {number} pct - 0..100
 */
function buildDial(pct = 0) {
    const offset = DIAL_CIRC - (pct / 100) * DIAL_CIRC;
    return `
        <div class="checklist-dial">
            <svg viewBox="0 0 28 28">
                <circle class="dial-track" cx="14" cy="14" r="${DIAL_R}"/>
                <circle class="dial-fill" cx="14" cy="14" r="${DIAL_R}"
                    stroke-dasharray="${DIAL_CIRC.toFixed(2)}"
                    stroke-dashoffset="${offset.toFixed(2)}"/>
            </svg>
            <div class="dial-text">${pct}</div>
        </div>
    `;
}

export class TableFooter {
    /**
     * @param {Object} table  - Full table document from DB
     * @param {Object} callbacks
     * @param {Function} callbacks.onNameChange  - (tableId, newName) => void
     * @param {Function} callbacks.onAddRow      - (tableId) => void
     * @param {Function} callbacks.onOptions     - (optionsBtnEl, tableId, tableData) => void
     */
    constructor(table, { onNameChange, onAddRow, onOptions, onMoveUp, onCollapse, position = 'footer' } = {}) {
        this._table = table;
        this._cb = { onNameChange, onAddRow, onOptions, onMoveUp, onCollapse };
        this._position = position;
        this._el = null;
    }

    create() {
        const { _id, name, pinned, checklist, checked = [], excludeFirstRow } = this._table;
        const skip = excludeFirstRow ? 1 : 0;
        const checkedCount = checked.slice(skip).filter(Boolean).length;
        const totalRows = Math.max(0, (this._table.data?.length ?? 0) - skip);
        const pct = (checklist && totalRows > 0) ? Math.round((checkedCount / totalRows) * 100) : 0;

        const el = document.createElement('div');
        el.className = this._position === 'header' ? 'table-footer table-footer--header' : 'table-footer';
        el.dataset.tableId = _id;
        el.innerHTML = `
            <div class="table-name-tag">
                ${pinned ? `<button class="pin-badge" data-table-id="${_id}" title="Click to move up">↑</button>` : ''}
                ${checklist ? buildDial(pct) : ''}
                <input class="table-name" value="${escapeAttr(name.slice(0, 50))}" data-table-id="${_id}" maxlength="50" />
            </div>
            <div class="footer-spacer"></div>
            <button class="btn-add-row" data-table-id="${_id}" tabindex="-1">+ row</button>
            <button class="btn-options" data-table-id="${_id}" tabindex="-1">⋯</button>
        `;

        this._el = el;
        this._bind();
        // Auto-size the name input to its content on first render
        const nameInput = el.querySelector('.table-name');
        if (nameInput) this._sizeInput(nameInput);
        return el;
    }

    /** Resize input width to exactly fit its current value */
    _sizeInput(input) {
        // +3 compensates for letter-spacing: 0.06em widening each glyph beyond 1ch
        input.style.width = (Math.max(4, input.value.length) + 3) + 'ch';
    }

    /** Update the checklist dial without a full re-render */
    updateDial(checked = [], total = 0) {
        const pct = total > 0 ? Math.round((checked.filter(Boolean).length / total) * 100) : 0;
        const dialEl = this._el?.querySelector('.checklist-dial');
        if (!dialEl) return;
        const fill = dialEl.querySelector('.dial-fill');
        const text = dialEl.querySelector('.dial-text');
        const offset = DIAL_CIRC - (pct / 100) * DIAL_CIRC;
        if (fill) fill.style.strokeDashoffset = offset.toFixed(2);
        if (text) text.textContent = pct;
    }

    _bind() {
        const el = this._el;
        const { _id } = this._table;
        const { onNameChange, onAddRow, onOptions, onMoveUp } = this._cb;

        // Pin badge — move table up
        el.querySelector('.pin-badge')?.addEventListener('click', (e) => {
            e.stopPropagation();
            onMoveUp?.(_id);
        });

        // Name edit
        const nameInput = el.querySelector('.table-name');
        nameInput?.addEventListener('input', () => this._sizeInput(nameInput));
        nameInput?.addEventListener('blur', () => {
            const newName = nameInput.value.trim() || 'untitled table';
            nameInput.value = newName;
            this._sizeInput(nameInput);
            onNameChange?.(_id, newName);
        });
        nameInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') nameInput.blur();
        });

        // Add row
        el.querySelector('.btn-add-row')?.addEventListener('click', () => onAddRow?.(_id));

        // Options
        el.querySelector('.btn-options')?.addEventListener('click', (e) => {
            e.stopPropagation();
            onOptions?.(e.currentTarget, _id, this._table);
        });

        // Collapse — dblclick on the spacer zone (the dynamic gap between
        // the table name and the ⋯ button). Ignores clicks on inputs/buttons/dial
        // so every interactive control keeps its own behaviour.
        el.addEventListener('dblclick', (e) => {
            if (e.target.closest('input, button, .checklist-dial, .pin-badge')) return;
            this._cb.onCollapse?.(_id);
        });
    }
}

function escapeAttr(str) {
    return String(str ?? '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
