/**
 * Sheet Options Menu — RTL Knotless V2
 *
 * The ⋯ button (btn-sheet-options) next to the sheet label in the topbar.
 * Extends OptionsMenu base — same popup style as table options.
 *
 * Actions: 'search', 'rename', 'import', 'export', 'clear', 'delete'
 */

import { OptionsMenu } from './options-menu-base.js';

export class SheetOptionsMenu extends OptionsMenu {
    /**
     * @param {Function} onAction - (action, sheet) => void
     */
    constructor(onAction) {
        super('sheet-options-menu', onAction);
        this._menuWidth = 172;
    }

    /**
     * Override show() to pin the popup's top to the topbar's bottom edge,
     * matching the sheet-selector dropdown's vertical position.
     */
    show(anchorEl, data, align = 'left') {
        super.show(anchorEl, data, align);
        const topbar = document.querySelector('.topbar');
        if (topbar && this._el) {
            const topbarRect = topbar.getBoundingClientRect();
            this._el.style.top = `${topbarRect.bottom}px`;
        }
    }

    buildHTML(sheet) {
        return `
            <div class="ctx-item" data-action="search">search sheet</div>
            <div class="ctx-divider"></div>
            <div class="ctx-item" data-action="rename">rename</div>
            <div class="ctx-divider"></div>
            <div class="ctx-item" data-action="import">import .ktl</div>
            <div class="ctx-item" data-action="export">export .ktl</div>
            <div class="ctx-divider"></div>
            <div class="ctx-item" data-action="clear">clear sheet</div>
            <div class="ctx-item ctx-danger" data-action="delete">delete sheet</div>
        `;
    }
}
