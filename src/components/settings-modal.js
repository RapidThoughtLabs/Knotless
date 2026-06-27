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

/**
 * App-wide typeface options. Each id maps to a Google Font stack.
 * The matching font files are preloaded in index.html — keep the two in sync.
 * `sample` is shown in the picker so the user can preview the look.
 */
export const FONT_OPTIONS = [
    // ── the keepers — clean, legible workhorses ─────────────────────────────────
    { id: 'jetbrains', group: 'everyday', label: 'JetBrains Mono', stack: "'JetBrains Mono', monospace",      tag: 'mono',    sample: 'const x = 42;' },
    { id: 'fira',      group: 'everyday', label: 'Fira Code',      stack: "'Fira Code', monospace",           tag: 'mono',    sample: 'a != b => c' },
    { id: 'space',     group: 'everyday', label: 'Space Mono',     stack: "'Space Mono', monospace",          tag: 'retro',   sample: 'mission log 01' },
    { id: 'inter',     group: 'everyday', label: 'Inter',          stack: "'Inter', sans-serif",              tag: 'clean',   sample: 'crisp & clear' },
    // ── out of the blue — weird, pretty, soulful ────────────────────────────────
    { id: 'grotesk',   group: 'out of the blue', label: 'Space Grotesk',  stack: "'Space Grotesk', sans-serif",      tag: 'grotesk', sample: 'a little odd' },
    { id: 'fraunces',  group: 'out of the blue', label: 'Fraunces',       stack: "'Fraunces', serif",                tag: 'soft',    sample: 'soft & wonky' },
    { id: 'instrument',group: 'out of the blue', label: 'Instrument Serif',stack: "'Instrument Serif', serif",        tag: 'editorial',sample: 'Headlines & ideas' },
    { id: 'cormorant', group: 'out of the blue', label: 'Cormorant',      stack: "'Cormorant', serif",               tag: 'refined', sample: 'Elegant evenings' },
    { id: 'syne',      group: 'out of the blue', label: 'Syne',           stack: "'Syne', sans-serif",               tag: 'artsy',   sample: 'gallery mode' },
    { id: 'unbounded', group: 'out of the blue', label: 'Unbounded',      stack: "'Unbounded', system-ui, sans-serif",tag: 'bold',   sample: 'LOUD & ROUND' },
    { id: 'josefin',   group: 'out of the blue', label: 'Josefin Sans',   stack: "'Josefin Sans', sans-serif",       tag: 'deco',    sample: 'vintage charm' },
    { id: 'quicksand', group: 'out of the blue', label: 'Quicksand',      stack: "'Quicksand', sans-serif",          tag: 'rounded', sample: 'soft & friendly' },
    { id: 'caveat',    group: 'out of the blue', label: 'Caveat',         stack: "'Caveat', cursive",                tag: 'handwritten',sample: 'dear diary…' },
    { id: 'major',     group: 'out of the blue', label: 'Major Mono',     stack: "'Major Mono Display', monospace",  tag: 'quirky',  sample: 'lowercase love' },
];

/**
 * Apply an app-wide typeface by id. Sets the --font-family CSS variable on
 * <html> (consumed everywhere via var(--font-family)) and a data-font hook for
 * any font-specific CSS tweaks. Falls back to the default if the id is unknown.
 * @param {string} id - one of FONT_OPTIONS ids
 */
export function applyFontFamily(id = 'jetbrains') {
    const opt = FONT_OPTIONS.find(f => f.id === id) || FONT_OPTIONS[0];
    document.documentElement.style.setProperty('--font-family', opt.stack);
    document.documentElement.dataset.font = opt.id;
}

export class SettingsModal {
    /**
     * @param {RTLThemeEngine} themeEngine - shared instance
     * @param {Object} settingsApi - { get, update, reset } via window.electron.settings
     */
    constructor(themeEngine, settingsApi) {
        this._theme = themeEngine;
        this._settings = settingsApi;
        this._el = null;
        this._visible = false;
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
            const osLabel = info?.osVersion ?? '';
            const versionLabel = info?.version ? `v${info.version}` : 'v—';

            const osEl = this._el?.querySelector('#settings-os-info');
            const verEl = this._el?.querySelector('#settings-app-version');
            if (osEl) osEl.textContent = osLabel ? `${osLabel} ` : '';
            if (verEl) verEl.textContent = versionLabel;
        } catch {
            // non-critical
        }
    }

    open() {
        if (!this._el) return;
        this._el.classList.remove('hidden');
        this._el.classList.remove('closing');
        this._visible = true;
        if (document.documentElement.dataset.anim !== 'off') {
            this._el.classList.add('opening');
            setTimeout(() => this._el?.classList.remove('opening'), 220);
        }
        this._syncFromState();
    }

    close() {
        if (!this._el) return;
        this._visible = false;
        if (document.documentElement.dataset.anim === 'off') {
            this._el.classList.add('hidden');
            return;
        }
        this._el.classList.add('closing');
        setTimeout(() => {
            this._el?.classList.add('hidden');
            this._el?.classList.remove('closing');
        }, 180);
    }

    toggle() {
        this._visible ? this.close() : this.open();
    }

    _buildHTML() {
        const cfg = this._theme.getConfig();
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
                <div class="settings-nav-item" data-section="handbook">
                    <span class="nav-icon">⊡</span> handbook
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
                        <div class="toast-pos-grid" id="toast-pos-seg">
                            <button class="toast-pos-btn" data-toast-pos="top-left">top left</button>
                            <button class="toast-pos-btn" data-toast-pos="top-right">top right</button>
                            <button class="toast-pos-btn active" data-toast-pos="titlebar">top</button>
                            <button class="toast-pos-btn" data-toast-pos="bottom-center">bottom</button>
                        </div>
                    </div>
                    <div class="setting-row">
                        <div>
                            <div class="setting-label">table controls</div>
                            <div class="setting-sub">where name & row controls appear</div>
                        </div>
                        <div class="toast-pos-grid table-ctrl-grid" id="table-ctrl-pos-seg">
                            <button class="toast-pos-btn active" data-table-ctrl-pos="header">header</button>
                            <button class="toast-pos-btn" data-table-ctrl-pos="footer">footer</button>
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
                    <div class="setting-row">
                        <div>
                            <div class="setting-label">file size limit</div>
                            <div class="setting-sub">max attachment size (0 = unlimited)</div>
                        </div>
                        <div class="slider-ctrl">
                            <input type="range" id="file-size-slider" min="0" max="100" step="5" value="50" />
                            <span id="file-size-val">50 MB</span>
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
                            <div class="seg-btn${cfg.mode === 'dark' ? ' active' : ''}" data-mode="dark">dark</div>
                            <div class="seg-btn${cfg.mode === 'light' ? ' active' : ''}" data-mode="light">light</div>
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

                    <!-- Font / typeface picker -->
                    <div class="setting-row setting-row-stacked">
                        <div>
                            <div class="setting-label">typeface</div>
                            <div class="setting-sub">font used across the whole app</div>
                        </div>
                        <div class="font-grid" id="font-grid">
                            ${(() => {
                                let html = '';
                                let lastGroup = null;
                                for (const f of FONT_OPTIONS) {
                                    if (f.group !== lastGroup) {
                                        html += `<div class="font-group-label">${f.group}</div>`;
                                        lastGroup = f.group;
                                    }
                                    html += `
                                        <button class="font-option" data-font-id="${f.id}" style="font-family:${f.stack}">
                                            <span class="font-option-top">
                                                <span class="font-option-name">${f.label}</span>
                                                <span class="font-option-tag">${f.tag}</span>
                                            </span>
                                            <span class="font-option-sample">${f.sample}</span>
                                        </button>`;
                                }
                                return html;
                            })()}
                        </div>
                    </div>

                    <button class="btn-reset" id="theme-reset-btn">↺ reset to defaults</button>
                </div>

                <!-- HANDBOOK -->
                <div class="settings-panel-section hidden" id="settings-handbook">
                    <div class="settings-section-title">handbook</div>
                    <div class="setting-row">
                        <div>
                            <div class="setting-label">generate handbook</div>
                            <div class="setting-sub">creates a reference sheet with all knotless features, shortcuts, and usage guides. replaces any existing handbook.</div>
                        </div>
                        <div>
                            <button class="btn-reset" id="btn-generate-handbook">generate</button>
                        </div>
                    </div>
                    <div class="setting-row">
                        <div>
                            <div class="setting-label">auto-update on new version</div>
                            <div class="setting-sub">automatically regenerate the handbook when a newer version ships with the app.</div>
                        </div>
                        <div>
                            <div class="toggle on" id="handbook-auto-update"></div>
                        </div>
                    </div>
                    <div class="setting-row">
                        <div>
                            <div class="setting-label">last generated</div>
                            <div class="setting-sub" id="handbook-last-created">never</div>
                        </div>
                        <div>
                            <div class="setting-sub" id="handbook-version" style="opacity:0.5;font-size:10px;text-align:right;"></div>
                        </div>
                    </div>
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
        el.querySelector('#settings-rtl-link')?.addEventListener('click', async () => {
            try {
                const ok = await window.electron?.openExternal?.('https://www.rapidthoughtlabs.com');
                if (!ok) console.warn('[Settings] openExternal returned false');
            } catch (err) {
                console.error('[Settings] openExternal failed:', err);
            }
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

        // Typeface picker
        el.querySelector('#font-grid')?.addEventListener('click', async (e) => {
            const opt = e.target.closest('[data-font-id]');
            if (!opt) return;
            const id = opt.dataset.fontId;
            el.querySelectorAll('#font-grid .font-option').forEach(b => b.classList.toggle('active', b === opt));
            applyFontFamily(id);
            await this._settings.update('general.fontFamily', id);
            const label = FONT_OPTIONS.find(f => f.id === id)?.label ?? id;
            showToast(`font → ${label}`, 'success');
        });

        // Startup toggle
        el.querySelector('#toggle-startup')?.addEventListener('click', async (e) => {
            const toggle = e.currentTarget;
            toggle.classList.toggle('on');
            await this._settings.update('general.launchOnStartup', toggle.classList.contains('on'));
        });

        // Default columns stepper
        el.querySelector('#default-cols-val') && el.querySelectorAll('.col-step-btn[data-step]').forEach(btn => {
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
            el.querySelectorAll('#toast-pos-seg .toast-pos-btn').forEach(b => b.classList.toggle('active', b === btn));
            setToastPosition(pos);
            await this._settings.update('general.toastPosition', pos);
            showToast('notification position set', 'info');
        });

        // Table controls position picker
        el.querySelector('#table-ctrl-pos-seg')?.addEventListener('click', async (e) => {
            const btn = e.target.closest('[data-table-ctrl-pos]');
            if (!btn) return;
            const pos = btn.dataset.tableCtrlPos;
            el.querySelectorAll('#table-ctrl-pos-seg .toast-pos-btn').forEach(b => b.classList.toggle('active', b === btn));
            await this._settings.update('general.tableControlsPosition', pos);
            document.dispatchEvent(new CustomEvent('rtl:table-controls-position-change', { detail: { position: pos } }));
            showToast(`table controls → ${pos}`, 'info');
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

        // File size limit slider
        el.querySelector('#file-size-slider')?.addEventListener('input', async (e) => {
            const v = parseInt(e.target.value);
            const label = el.querySelector('#file-size-val');
            if (label) label.textContent = v === 0 ? 'unlimited' : `${v} MB`;
            await this._settings.update('general.maxFileSizeMB', v);
        });

        // Handbook — generate button
        el.querySelector('#btn-generate-handbook')?.addEventListener('click', () => {
            document.dispatchEvent(new CustomEvent('rtl:generate-handbook'));
            this.close();
        });

        // Handbook — auto-update toggle (accent-colored .toggle div)
        el.querySelector('#handbook-auto-update')?.addEventListener('click', async (e) => {
            const toggle = e.currentTarget;
            const isOn = toggle.classList.toggle('on');
            await this._settings.update('handbook.autoUpdate', isOn);
        });

        // Theme reset
        el.querySelector('#theme-reset-btn')?.addEventListener('click', async () => {
            await this._theme.reset();
            await this._settings.update('theme.mode', 'dark');
            await this._settings.update('theme.accent', 'purple');
            await this._settings.update('theme.gridMode', 'lines');
            // Reset typeface to the app default too
            applyFontFamily('jetbrains');
            await this._settings.update('general.fontFamily', 'jetbrains');
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
            el.querySelectorAll('#toast-pos-seg .toast-pos-btn').forEach(b => {
                b.classList.toggle('active', b.dataset.toastPos === toastPos);
            });
            setToastPosition(toastPos);

            // Sync table controls position
            const tableCtrlPos = saved.general?.tableControlsPosition ?? 'header';
            el.querySelectorAll('#table-ctrl-pos-seg .toast-pos-btn').forEach(b => {
                b.classList.toggle('active', b.dataset.tableCtrlPos === tableCtrlPos);
            });

            // Sync and apply font size
            const fontSize = saved.general?.fontSize ?? 13;
            const fontValEl = el.querySelector('#font-size-val');
            if (fontValEl) fontValEl.textContent = fontSize;
            applyFontSize(fontSize);

            // Sync and apply font family (typeface picker)
            const fontFamily = saved.general?.fontFamily ?? 'jetbrains';
            el.querySelectorAll('#font-grid .font-option').forEach(b => {
                b.classList.toggle('active', b.dataset.fontId === fontFamily);
            });
            applyFontFamily(fontFamily);

            // Sync and apply animation level (Windows/Linux only)
            if (!window.electron?.isMac) {
                const animLevel = saved.general?.animations ?? 'full';
                el.querySelectorAll('#anim-seg .seg-btn').forEach(b => {
                    b.classList.toggle('active', b.dataset.animLevel === animLevel);
                });
                applyAnimationLevel(animLevel);
            }

            // Sync file size slider
            const maxFileSizeMB = saved.general?.maxFileSizeMB ?? 50;
            const slider = el.querySelector('#file-size-slider');
            const fileSizeLabel = el.querySelector('#file-size-val');
            if (slider) slider.value = maxFileSizeMB;
            if (fileSizeLabel) fileSizeLabel.textContent = maxFileSizeMB === 0 ? 'unlimited' : `${maxFileSizeMB} MB`;

            // Sync handbook last-generated label
            const hbLabel = el.querySelector('#handbook-last-created');
            if (hbLabel) {
                const ts = saved.handbook?.lastCreated ?? null;
                if (ts) {
                    const d = new Date(ts);
                    hbLabel.textContent = d.toLocaleString(undefined, {
                        year: 'numeric', month: 'short', day: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                    });
                } else {
                    hbLabel.textContent = 'never';
                }
            }

            // Sync handbook auto-update toggle (accent-colored .toggle div)
            const autoUpdateEl = el.querySelector('#handbook-auto-update');
            if (autoUpdateEl) {
                autoUpdateEl.classList.toggle('on', saved.handbook?.autoUpdate !== false);
            }

            // Sync handbook version badge
            const versionEl = el.querySelector('#handbook-version');
            if (versionEl) {
                const v = saved.handbook?.version ?? null;
                versionEl.textContent = v ? `v${v}` : '';
            }
        }
    }
}
