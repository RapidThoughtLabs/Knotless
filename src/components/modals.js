/**
 * Modals — RTL Knotless V2
 *
 * Two small modals:
 *   - New table dialog
 *   - Confirm dialog
 *
 * Usage:
 *   import { showAddTableModal, showConfirm } from './modals.js';
 *
 *   const name = await showAddTableModal();          // resolves with string or null (cancelled)
 *   const ok = await showConfirm('delete this?');   // resolves with true/false
 */

import { showToast } from './toast.js';

// ── Shared overlay ────────────────────────────────────────────────────────────

function makeOverlay(content) {
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
            overlay.remove();
            resolve(name);
        }

        function cancel() {
            overlay.remove();
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

        function yes() { overlay.remove(); resolve(true); }
        function no() { overlay.remove(); resolve(false); }

        overlay.querySelector('#confirm-ok')?.addEventListener('click', yes);
        overlay.querySelector('#confirm-cancel')?.addEventListener('click', no);
        overlay.addEventListener('rtl:modal-cancel', no);

        document.addEventListener('keydown', function handler(e) {
            if (e.key === 'Escape') { no(); document.removeEventListener('keydown', handler); }
        });
    });
}
