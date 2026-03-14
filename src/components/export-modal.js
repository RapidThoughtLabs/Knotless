/**
 * Export Modal — RTL Knotless V2
 *
 * Dual-option card popup that lets the user choose between exporting
 * the current sheet as a plain .ktl.json or a full .ktl.zip bundle.
 *
 * Usage:
 *   import { showExportModal } from './export-modal.js';
 *   const choice = await showExportModal(); // 'json' | 'zip' | null (cancelled)
 */

import { makeOverlay } from './modals.js';

/**
 * Show the export format picker.
 * @returns {Promise<'json'|'zip'|null>} Resolves with the user's choice or null if cancelled.
 */
export function showExportModal() {
    return new Promise((resolve) => {
        const overlay = makeOverlay(`
            <div class="modal-title">export sheet_</div>
            <div class="export-options">
                <div class="export-option" id="export-opt-json" tabindex="0" role="button">
                    <span class="export-option-icon">
                        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
                            <polyline points="13 2 13 9 20 9"/>
                            <line x1="8" y1="13" x2="16" y2="13"/>
                            <line x1="8" y1="17" x2="16" y2="17"/>
                        </svg>
                    </span>
                    <div>
                        <div class="export-option-title">export json</div>
                        <div class="export-option-desc">text-only export — no blobs or attachments included<br>(.ktl.json)</div>
                    </div>
                </div>
                <div class="export-option" id="export-opt-zip" tabindex="0" role="button">
                    <span class="export-option-icon">
                        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="21 8 21 21 3 21 3 8"/>
                            <rect x="1" y="3" width="22" height="5"/>
                            <line x1="10" y1="12" x2="14" y2="12"/>
                        </svg>
                    </span>
                    <div>
                        <div class="export-option-title">export bundle</div>
                        <div class="export-option-desc">complete export with all blobs, attachments<br>and an offline viewer (.ktl.zip)</div>
                    </div>
                </div>
            </div>
            <div class="modal-actions">
                <button class="btn-cancel" id="export-modal-cancel">cancel</button>
            </div>
        `);

        function choose(value) {
            overlay.remove();
            resolve(value);
        }

        function cancel() {
            overlay.remove();
            resolve(null);
        }

        overlay.querySelector('#export-opt-json')?.addEventListener('click', () => choose('json'));
        overlay.querySelector('#export-opt-zip')?.addEventListener('click',  () => choose('zip'));
        overlay.querySelector('#export-modal-cancel')?.addEventListener('click', cancel);
        overlay.addEventListener('rtl:modal-cancel', cancel);

        // Keyboard: Enter on focused card triggers it
        overlay.querySelector('#export-opt-json')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose('json'); }
        });
        overlay.querySelector('#export-opt-zip')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose('zip'); }
        });

        document.addEventListener('keydown', function handler(e) {
            if (e.key === 'Escape') { cancel(); document.removeEventListener('keydown', handler); }
        });
    });
}
