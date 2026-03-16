/**
 * Modals — RTL Knotless V2
 *
 * Modals:
 *   - New table dialog
 *   - New sheet dialog
 *   - Confirm dialog
 *   - Alert dialog (info / error — single OK button, no cancel)
 *
 * Usage:
 *   import { showAddTableModal, showConfirm, showAlert } from './modals.js';
 *
 *   const name = await showAddTableModal();          // resolves with string or null (cancelled)
 *   const ok = await showConfirm('delete this?');   // resolves with true/false
 *   await showAlert('something went wrong');         // resolves when user clicks ok
 */

import { showToast } from './toast.js';

// ── Shared overlay ────────────────────────────────────────────────────────────

export function makeOverlay(content) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<div class="modal-sm">${content}</div>`;
    document.body.appendChild(overlay);

    // Click outside to dismiss (resolved as cancel)
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.dispatchEvent(new CustomEvent('rtl:modal-cancel', { bubbles: false }));
    });

    return overlay;
}

/**
 * Animate the overlay out, then remove it from the DOM.
 * Respects the data-anim="off" setting.
 * @param {HTMLElement} overlay
 */
function dismissOverlay(overlay) {
    if (document.documentElement.dataset.anim === 'off') {
        overlay.remove();
        return;
    }
    overlay.classList.add('modal-overlay--out');
    setTimeout(() => overlay.remove(), 150);
}

// ── Add Table Modal ───────────────────────────────────────────────────────────

/**
 * Show the "new table" dialog.
 * @param {string} [defaultName=''] - Pre-filled value
 * @returns {Promise<string|null>} Table name or null if cancelled
 */
export function showAddTableModal(defaultName = '') {
    return new Promise((resolve) => {
        const overlay = makeOverlay(`
            <div class="modal-title">new table_</div>
            <input class="modal-input" id="new-table-input" placeholder="untitled table" autocomplete="off" />
            <div class="modal-actions">
                <button class="btn-cancel" id="modal-cancel">cancel</button>
                <button class="btn-confirm" id="modal-add">add →</button>
            </div>
        `);

        const input = overlay.querySelector('#new-table-input');
        input.value = defaultName;

        // Focus and select
        requestAnimationFrame(() => { input.focus(); input.select(); });

        function confirm() {
            const name = input.value.trim() || 'untitled table';
            dismissOverlay(overlay);
            resolve(name);
        }

        function cancel() {
            dismissOverlay(overlay);
            resolve(null);
        }

        overlay.querySelector('#modal-add')?.addEventListener('click', confirm);
        overlay.querySelector('#modal-cancel')?.addEventListener('click', cancel);
        overlay.addEventListener('rtl:modal-cancel', cancel);

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') confirm();
            if (e.key === 'Escape') cancel();
        });
    });
}

// ── Add Sheet Modal ───────────────────────────────────────────────────────────

/**
 * Show the "new sheet" dialog.
 * @param {string} [defaultName=''] - Pre-filled value
 * @returns {Promise<string|null>} Sheet name or null if cancelled
 */
export function showAddSheetModal(defaultName = '') {
    return new Promise((resolve) => {
        const overlay = makeOverlay(`
            <div class="modal-title">new sheet_</div>
            <input class="modal-input" id="new-sheet-input" placeholder="untitled sheet" autocomplete="off" />
            <div class="modal-error hidden" id="sheet-name-error"></div>
            <div class="modal-actions">
                <button class="btn-cancel" id="modal-cancel">cancel</button>
                <button class="btn-confirm" id="modal-add">add →</button>
            </div>
        `);

        const input = overlay.querySelector('#new-sheet-input');
        const errorEl = overlay.querySelector('#sheet-name-error');
        input.value = defaultName;

        requestAnimationFrame(() => { input.focus(); input.select(); });

        // Reserved sheet names (case-insensitive)
        const RESERVED = ['handbook'];

        function confirm() {
            const name = input.value.trim() || 'untitled sheet';
            if (RESERVED.includes(name.toLowerCase())) {
                errorEl.textContent = `"${name.toLowerCase()}" is a system reserved name`;
                errorEl.classList.remove('hidden');
                input.focus();
                return;
            }
            errorEl.classList.add('hidden');
            dismissOverlay(overlay);
            resolve(name);
        }

        function cancel() {
            dismissOverlay(overlay);
            resolve(null);
        }

        // Clear error on any input change
        input.addEventListener('input', () => errorEl.classList.add('hidden'));

        overlay.querySelector('#modal-add')?.addEventListener('click', confirm);
        overlay.querySelector('#modal-cancel')?.addEventListener('click', cancel);
        overlay.addEventListener('rtl:modal-cancel', cancel);

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') confirm();
            if (e.key === 'Escape') cancel();
        });
    });
}

// ── Confirm Dialog ────────────────────────────────────────────────────────────

/**
 * Show a confirmation dialog.
 * @param {string} message - HTML message to show
 * @param {string} [confirmLabel='confirm'] - Label for confirm button
 * @param {boolean} [isDanger=true] - Whether to style confirm in danger red
 * @returns {Promise<boolean>}
 */
export function showConfirm(message, confirmLabel = 'confirm', isDanger = true) {
    return new Promise((resolve) => {
        const overlay = makeOverlay(`
            <div class="confirm-dialog">
                <div>${message}</div>
                <div class="confirm-row">
                    <button class="btn-cancel" id="confirm-cancel">cancel</button>
                    <button class="btn-confirm ${isDanger ? 'btn-danger' : ''}" id="confirm-ok">${confirmLabel}</button>
                </div>
            </div>
        `);

        function yes() { dismissOverlay(overlay); resolve(true); }
        function no() { dismissOverlay(overlay); resolve(false); }

        overlay.querySelector('#confirm-ok')?.addEventListener('click', yes);
        overlay.querySelector('#confirm-cancel')?.addEventListener('click', no);
        overlay.addEventListener('rtl:modal-cancel', no);

        document.addEventListener('keydown', function handler(e) {
            if (e.key === 'Escape') { no(); document.removeEventListener('keydown', handler); }
        });
    });
}

// ── Import Conflict Modal ─────────────────────────────────────────────────────

/**
 * Show a two-option conflict resolution dialog when importing a sheet whose
 * name already exists.
 * @param {string} sheetName - The conflicting sheet name
 * @returns {Promise<'replace'|'duplicate'|null>} Choice or null if cancelled
 */
export function showImportConflictModal(sheetName) {
    return new Promise((resolve) => {
        const overlay = makeOverlay(`
            <div class="modal-title">name conflict_</div>
            <div class="modal-conflict-info"><strong>${sheetName}</strong> already exists</div>
            <div class="modal-radio-group">
                <label class="modal-radio-option">
                    <input type="radio" name="import-conflict" value="replace" />
                    <span>replace current <strong>${sheetName}</strong></span>
                </label>
                <label class="modal-radio-option">
                    <input type="radio" name="import-conflict" value="duplicate" checked />
                    <span>add as <strong>${sheetName} (2)</strong></span>
                </label>
            </div>
            <div class="modal-actions">
                <button class="btn-cancel" id="modal-cancel">cancel</button>
                <button class="btn-confirm" id="modal-confirm">continue →</button>
            </div>
        `);

        function confirm() {
            const selected = overlay.querySelector('input[name="import-conflict"]:checked');
            const choice = selected?.value ?? 'duplicate';
            dismissOverlay(overlay);
            resolve(choice);
        }

        function cancel() {
            dismissOverlay(overlay);
            resolve(null);
        }

        overlay.querySelector('#modal-confirm')?.addEventListener('click', confirm);
        overlay.querySelector('#modal-cancel')?.addEventListener('click', cancel);
        overlay.addEventListener('rtl:modal-cancel', cancel);

        document.addEventListener('keydown', function handler(e) {
            if (e.key === 'Enter') { confirm(); document.removeEventListener('keydown', handler); }
            if (e.key === 'Escape') { cancel(); document.removeEventListener('keydown', handler); }
        });
    });
}

// ── Alert Dialog ──────────────────────────────────────────────────────────────

/**
 * Show an informational/error alert with a single OK button (no cancel).
 * Used for non-recoverable errors like the blob size cap being exceeded.
 * @param {string} message - HTML message to show
 * @returns {Promise<void>}
 */
export function showAlert(message) {
    return new Promise((resolve) => {
        const overlay = makeOverlay(`
            <div class="confirm-dialog">
                <div>${message}</div>
                <div class="confirm-row" style="justify-content:flex-end;">
                    <button class="btn-confirm" id="alert-ok">ok</button>
                </div>
            </div>
        `);

        function ok() { dismissOverlay(overlay); resolve(); }

        overlay.querySelector('#alert-ok')?.addEventListener('click', ok);
        overlay.addEventListener('rtl:modal-cancel', ok);

        document.addEventListener('keydown', function handler(e) {
            if (e.key === 'Escape' || e.key === 'Enter') {
                ok();
                document.removeEventListener('keydown', handler);
            }
        });
    });
}

// ── Move Table to Sheet Modal ──────────────────────────────────────────────────

/**
 * Show a sheet-picker popup for moving a table to another sheet.
 * @param {Array} sheets - All sheet docs [{ _id, name }]
 * @param {string} currentSheetId - ID of the sheet the table currently belongs to
 * @returns {Promise<string|null>} Selected sheetId or null if cancelled
 */
export function showMoveToSheetModal(sheets, currentSheetId) {
    const otherSheets = sheets.filter(s => s._id !== currentSheetId);

    const sheetItemsHTML = otherSheets.map(s =>
        `<div class="move-sheet-option" data-sheet-id="${s._id}">${s.name}</div>`
    ).join('');

    return new Promise((resolve) => {
        const overlay = makeOverlay(`
            <div class="modal-title">move to_</div>
            <div class="move-sheet-list">${sheetItemsHTML}</div>
            <div class="modal-actions">
                <button class="btn-cancel" id="modal-cancel">cancel</button>
            </div>
        `);

        function cancel() {
            dismissOverlay(overlay);
            resolve(null);
        }

        overlay.querySelector('.move-sheet-list')?.addEventListener('click', (e) => {
            const opt = e.target.closest('.move-sheet-option');
            if (!opt) return;
            dismissOverlay(overlay);
            resolve(opt.dataset.sheetId);
        });

        overlay.querySelector('#modal-cancel')?.addEventListener('click', cancel);
        overlay.addEventListener('rtl:modal-cancel', cancel);

        document.addEventListener('keydown', function handler(e) {
            if (e.key === 'Escape') { cancel(); document.removeEventListener('keydown', handler); }
        });
    });
}

/**
 * Show a "file not found" dialog with an option to clear the dead cell reference.
 * @param {string} fileName - Display name of the missing file
 * @returns {Promise<boolean>} true if user chose to clear the cell
 */
export function showFileMissingModal(fileName) {
    return new Promise((resolve) => {
        const overlay = makeOverlay(`
            <div class="confirm-dialog">
                <div><strong>${fileName}</strong> couldn't be found — it may have been moved or deleted.</div>
                <div class="confirm-row">
                    <button class="btn-cancel" id="missing-dismiss">dismiss</button>
                    <button class="btn-confirm btn-danger" id="missing-clear">clear cell</button>
                </div>
            </div>
        `);

        function clear() { dismissOverlay(overlay); resolve(true); }
        function dismiss() { dismissOverlay(overlay); resolve(false); }

        overlay.querySelector('#missing-clear')?.addEventListener('click', clear);
        overlay.querySelector('#missing-dismiss')?.addEventListener('click', dismiss);
        overlay.addEventListener('rtl:modal-cancel', dismiss);

        document.addEventListener('keydown', function handler(e) {
            if (e.key === 'Escape') { dismiss(); document.removeEventListener('keydown', handler); }
        });
    });
}
