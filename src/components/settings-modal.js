/**
 * Settings Modal — RTL Knotless V2
 *
 * Overlay with sidebar nav + content panels:
 *   - general (launch on startup, default columns, toast position, animations)
 *   - theme   (mode toggle, accent picker, grid mode, reset)
 *
 * Security panel intentionally omitted — ships in a future version.
 */

import { RTLThemeEngine, RTL_ACCENT_SWATCH_COLORS } from '../rtl-theme/rtl-theme-engine.js';
import { showToast, setToastPosition } from './toast.js';

/**
 * Apply an animation level globally by setting data-anim on <html>.
 * @param {'full'|'reduced'|'off'} level
 */
export function applyAnimationLevel(level = 'full') {
    document.documentElement.dataset.anim = level;
}

/**
 * Apply a font size globally via the --font-size CSS variable on <html>.
 * Also sets body font-size directly for immediate cascade.
 * @param {number} size - px value (11–17, default 13)
 */
export function applyFontSize(size = 13) {
    document.documentElement.style.setProperty('--font-size', `${size}px`);
    // Set directly on body too so elements using `inherit` pick it up instantly
    if (document.body) document.body.style.fontSize = `${size}px`;
}

export class SettingsModal {
    /**
     * @param {RTLThemeEngine} themeEngine - shared instance
     * @param {Object} settingsApi - { get, update, reset } via window.electron.settings
     */
    constructor(themeEngine, settingsApi) {
        this._theme    = themeEngine;
        this._settings = settingsApi;
        this._el       = null;
        this._visible  = false;
        this._activeSection = 'general';
    }

    mount() {
        this._el = document.createElement('div');
        this._el.id = 'settings-overlay';
        this._el.className = 'settings-overlay hidden';
        this._el.innerHTML = this._buildHTML();
        document.body.appendChild(this._el);
        this._bind();
        this._populateFooter();
    }

    async _populateFooter() {
        try {
            const info = await window.electron?.getAppInfo?.();
            const osLabel      = info?.osVersion ?? '';
            const versionLabel = info?.version ? `v${info.version}` : 'v—';

            const osEl  = this._el?.querySelector('#settings-os-info');
            const verEl = this._el?.querySelector('#settings-app-version');
            if (osEl)  osEl.textContent  = osLabel ? `${osLabel} ` : '';
            if (verEl) verEl.textContent = versionLabel;
        } catch {
            // non-critical
        }
    }

    open() {
        if (!this._el) return;
        this._el.classList.remove('hidden');
        this._visible = true;
        this._syncFromState();
    }

    close() {
        this._el?.classList.add('hidden');
        this._visible = false;
    }

    toggle() {
        this._visible ? this.close() : this.open();
    }

    _buildHTML() {
        const cfg     = this._theme.getConfig();
        const accents = Object.entries(RTL_ACCENT_SWATCH_COLORS);

        return `
        <div class="settings-modal" id="settings-panel">
          <div class="settings-body">
            <!-- Sidebar -->
            <div class="settings-sidebar">
                <div class="settings-logo"><span>rtl://</span>settings</div>
                <div class="settings-nav-item active" data-section="general">
                    <span class="nav-icon">⚙</span> general
                </div>
                <div class="settings-nav-item" data-section="theme">
                    <span class="nav-icon">◈</span> theme
                </div>
            </div>

            <!-- Content -->
            <div class="settings-content">

                <!-- GENERAL -->
                <div class="settings-panel-section" id="settings-general">
                    <div class="settings-section-title">general</div>
                    <div class="setting-row">
                        <div>
                            <div class="setting-label">launch on startup</div>
                            <div class="setting-sub">open knotless when you log in</div>
                        </div>
                        <div class="toggle" id="toggle-startup"><span></span></div>
                    </div>
                    <div class="setting-row">
                        <div>
                            <div class="setting-label">default columns</div>
                            <div class="setting-sub">new tables start with</div>
                        </div>
                        <div class="col-stepper">
                            <span class="col-step-btn" data-step="-1">−</span>
                            <span id="default-cols-val">3</span>
                            <span class="col-step-btn" data-step="1">+</span>
                        </div>
                    </div>
                    <div class="setting-row">
                        <div>
                            <div class="setting-label">notification position</div>
                            <div class="setting-sub">where toasts appear</div>
                        </div>
                        <div class="seg-ctrl" id="toast-pos-seg">
                            <div class="seg-btn active" data-toast-pos="titlebar">title bar</div>
                            <div class="seg-btn" data-toast-pos="top-right">top right</div>
                            <div class="seg-btn" data-toast-pos="bottom-center">bottom</div>
                            <div class="seg-btn" data-toast-pos="bottom-right">corner</div>
                        </div>
                    </div>
                    <div class="setting-row">
                        <div>
                            <div class="setting-label">font size</div>
                            <div class="setting-sub">adjust text size across the app</div>
                        </div>
                        <div class="col-stepper">
                            <span class="col-step-btn" data-font-step="-1">−</span>
                            <span id="font-size-val">13</span>
                            <span class="col-step-btn" data-font-step="1">+</span>
                        </div>
                    </div>
                    ${window.electron?.isMac ? '' : `
                    <div class="setting-row">
                        <div>
                            <div class="setting-label">animations</div>
                            <div class="setting-sub">ui motion level (recommended: off on windows)</div>
                        </div>
                        <div class="seg-ctrl" id="anim-seg">
                            <div class="seg-btn active" data-anim-level="full">full</div>
                            <div class="seg-btn" data-anim-level="reduced">reduced</div>
                            <div class="seg-btn" data-anim-level="off">off</div>
                        </div>
                    </div>
                    `}
                </div>

                <!-- THEME -->
                <div class="settings-panel-section hidden" id="settings-theme">
                    <div class="settings-section-title">theme</div>

                    <!-- Mode -->
                    <div class="setting-row">
                        <div>
                            <div class="setting-label">mode</div>
                            <div class="setting-sub">dark, light, or follow system</div>
                        </div>
                        <div class="seg-ctrl" id="mode-seg">
                            <div class="seg-btn${cfg.mode === 'dark'   ? ' active' : ''}" data-mode="dark">dark</div>
                            <div class="seg-btn${cfg.mode === 'light'  ? ' active' : ''}" data-mode="light">light</div>
                            <div class="seg-btn${cfg.mode === 'system' ? ' active' : ''}" data-mode="system">system</div>
                        </div>
                    </div>

                    <!-- Accent -->
                    <div class="setting-row">
                        <div>
                            <div class="setting-label">accent color</div>
                            <div class="setting-sub">used throughout the app</div>
                        </div>
                        <div class="accent-grid" id="accent-grid">
                            ${accents.map(([name, color]) => `
                                <div class="accent-dot${cfg.accent === name ? ' active' : ''}"
                                     data-accent="${name}"
                                     style="background:${color};"
                                     title="${name}"></div>
                            `).join('')}
                        </div>
                    </div>

                    <!-- Grid mode -->
                    <div class="setting-row">
                        <div>
                            <div class="setting-label">grid mode</div>
                            <div class="setting-sub">lines or gaps between cells</div>
                        </div>
                        <div class="seg-ctrl" id="grid-seg">
                            <div class="seg-btn${cfg.gridMode !== 'gaps' ? ' active' : ''}" data-grid="lines">lines</div>
                            <div class="seg-btn${cfg.gridMode === 'gaps' ? ' active' : ''}" data-grid="gaps">gaps</div>
                        </div>
                    </div>

                    <button class="btn-reset" id="theme-reset-btn">↺ reset to defaults</button>
                </div>

            </div>
          </div>
          <!-- Settings footer — reuses app-footer styles -->
          <div class="app-footer">
            <div class="footer-brand">
                <span class="footer-brand-link" id="settings-rtl-link">rtl://</span>knotless
            </div>
            <div class="footer-end">
              <div class="footer-status">
                <span id="settings-os-info"></span>
                <div class="status-dot"></div>
                <span id="settings-app-version">v—</span>
              </div>
            </div>
          </div>
        </div>
        `;
    }

    _bind() {
        const el = this._el;

        // Backdrop click → close
        el.addEventListener('click', (e) => {
            if (e.target === el) this.close();
        });

        // ESC → close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this._visible) this.close();
        });

        // rtl:// brand link in settings footer
        el.querySelector('#settings-rtl-link')?.addEventListener('click', () => {
            window.electron?.openExternal?.('https://www.rapidthoughtlabs.com');
        });

        // Sidebar nav
        el.querySelectorAll('.settings-nav-item').forEach(item => {
            item.addEventListener('click', () => {
                this._switchSection(item.dataset.section);
            });
        });

        // Mode segmented control
        el.querySelector('#mode-seg')?.addEventListener('click', async (e) => {
            const btn = e.target.closest('[data-mode]');
            if (!btn) return;
            const mode = btn.dataset.mode;
            el.querySelectorAll('#mode-seg .seg-btn').forEach(b => b.classList.toggle('active', b === btn));
            await this._theme.setMode(mode);
            await this._settings.update('theme.mode', mode);
            showToast(`mode → ${mode}`, 'info');
        });

        // Accent picker
        el.querySelector('#accent-grid')?.addEventListener('click', async (e) => {
            const dot = e.target.closest('[data-accent]');
            if (!dot) return;
            const accent = dot.dataset.accent;
            el.querySelectorAll('.accent-dot').forEach(d => d.classList.toggle('active', d === dot));
            await this._theme.setAccent(accent);
            await this._settings.update('theme.accent', accent);
            showToast(`accent → ${accent}`, 'success');
        });

        // Grid mode
        el.querySelector('#grid-seg')?.addEventListener('click', async (e) => {
            const btn = e.target.closest('[data-grid]');
            if (!btn) return;
            const grid = btn.dataset.grid;
            el.querySelectorAll('#grid-seg .seg-btn').forEach(b => b.classList.toggle('active', b === btn));
            await this._theme.setGridMode(grid);
            await this._settings.update('theme.gridMode', grid);
        });

        // Startup toggle
        el.querySelector('#toggle-startup')?.addEventListener('click', async (e) => {
            const toggle = e.currentTarget;
            toggle.classList.toggle('on');
            await this._settings.update('general.launchOnStartup', toggle.classList.contains('on'));
        });

        // Default columns stepper
        el.querySelector('#default-cols-val') && el.querySelectorAll('.col-step-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const valEl = el.querySelector('#default-cols-val');
                let v = parseInt(valEl.textContent) || 3;
                v = Math.max(1, Math.min(10, v + parseInt(btn.dataset.step)));
                valEl.textContent = v;
                await this._settings.update('general.defaultColumns', v);
            });
        });

        // Toast position segmented control
        el.querySelector('#toast-pos-seg')?.addEventListener('click', async (e) => {
            const btn = e.target.closest('[data-toast-pos]');
            if (!btn) return;
            const pos = btn.dataset.toastPos;
            el.querySelectorAll('#toast-pos-seg .seg-btn').forEach(b => b.classList.toggle('active', b === btn));
            setToastPosition(pos);
            await this._settings.update('general.toastPosition', pos);
            showToast('notification position set', 'info');
        });

        // Font size stepper
        el.querySelectorAll('[data-font-step]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const valEl = el.querySelector('#font-size-val');
                let v = parseInt(valEl.textContent) || 13;
                v = Math.max(11, Math.min(17, v + parseInt(btn.dataset.fontStep)));
                valEl.textContent = v;
                applyFontSize(v);
                await this._settings.update('general.fontSize', v);
            });
        });

        // Animations level segmented control (Windows/Linux only)
        if (!window.electron?.isMac) {
            el.querySelector('#anim-seg')?.addEventListener('click', async (e) => {
                const btn = e.target.closest('[data-anim-level]');
                if (!btn) return;
                const level = btn.dataset.animLevel;
                el.querySelectorAll('#anim-seg .seg-btn').forEach(b => b.classList.toggle('active', b === btn));
                applyAnimationLevel(level);
                await this._settings.update('general.animations', level);
                showToast(`animations → ${level}`, 'info');
            });
        }

        // Theme reset
        el.querySelector('#theme-reset-btn')?.addEventListener('click', async () => {
            await this._theme.reset();
            await this._settings.update('theme.mode', 'dark');
            await this._settings.update('theme.accent', 'purple');
            await this._settings.update('theme.gridMode', 'lines');
            this._syncFromState();
            showToast('theme reset to defaults', 'info');
        });
    }

    _switchSection(section) {
        this._activeSection = section;
        this._el?.querySelectorAll('.settings-nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.section === section);
        });
        this._el?.querySelectorAll('.settings-panel-section').forEach(panel => {
            panel.classList.toggle('hidden', panel.id !== `settings-${section}`);
        });
    }

    async _syncFromState() {
        const el = this._el;
        if (!el) return;

        const cfg = this._theme.getConfig();

        // Sync mode buttons
        el.querySelectorAll('#mode-seg .seg-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.mode === cfg.mode);
        });

        // Sync accent dots
        el.querySelectorAll('.accent-dot').forEach(d => {
            d.classList.toggle('active', d.dataset.accent === cfg.accent);
        });

        // Sync grid
        el.querySelectorAll('#grid-seg .seg-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.grid === cfg.gridMode);
        });

        // Sync general settings
        let saved = null;
        try { saved = await this._settings.get(); } catch { }
        if (saved) {
            const colVal = el.querySelector('#default-cols-val');
            if (colVal) colVal.textContent = saved.general?.defaultColumns ?? 3;

            const startupToggle = el.querySelector('#toggle-startup');
            if (startupToggle) startupToggle.classList.toggle('on', !!saved.general?.launchOnStartup);

            // Sync and apply toast position
            const toastPos = saved.general?.toastPosition ?? 'titlebar';
            el.querySelectorAll('#toast-pos-seg .seg-btn').forEach(b => {
                b.classList.toggle('active', b.dataset.toastPos === toastPos);
            });
            setToastPosition(toastPos);

            // Sync and apply font size
            const fontSize = saved.general?.fontSize ?? 13;
            const fontValEl = el.querySelector('#font-size-val');
            if (fontValEl) fontValEl.textContent = fontSize;
            applyFontSize(fontSize);

            // Sync and apply animation level (Windows/Linux only)
            if (!window.electron?.isMac) {
                const animLevel = saved.general?.animations ?? 'full';
                el.querySelectorAll('#anim-seg .seg-btn').forEach(b => {
                    b.classList.toggle('active', b.dataset.animLevel === animLevel);
                });
                applyAnimationLevel(animLevel);
            }
        }
    }
}
