/**
 * RTL Theme Engine — v1
 * Rapid Thought Labs shared theming module
 *
 * Manages dark/light/system mode + accent color selection.
 * Applies theme by setting data-mode and data-accent on <html>.
 * Works in both Electron (via IPC) and web (via localStorage).
 *
 * Usage:
 *   import { RTLThemeEngine } from './rtl-theme/rtl-theme-engine.js';
 *   const theme = new RTLThemeEngine({ load, persist });
 *   await theme.init();
 *   theme.setMode('dark');
 *   theme.setAccent('purple');
 */

const RTL_ACCENT_PRESETS = ['lime', 'red', 'pink', 'purple', 'yellow', 'blue', 'cyan', 'orange'];
const RTL_MODES = ['dark', 'light', 'system'];

const DEFAULT_CONFIG = {
    rtl_theme_version: 1,
    mode: 'dark',
    accent: 'lime',
    gridMode: 'lines',
    product: 'noteless',
};

export class RTLThemeEngine {
    /**
     * @param {Object} options
     * @param {Function} options.load    - async () => config object | null
     * @param {Function} options.persist - async (config) => void
     */
    constructor({ load, persist } = {}) {
        this._load = load || (() => null);
        this._persist = persist || (() => { });
        this._config = { ...DEFAULT_CONFIG };
        this._mediaQuery = null;
        this._boundMediaHandler = this._onMediaChange.bind(this);
    }

    /**
     * Initialise: load saved config and apply to DOM.
     */
    async init() {
        let saved = null;
        try {
            saved = await this._load();
        } catch (e) {
            console.warn('[RTLThemeEngine] Failed to load config, using defaults:', e);
        }

        this._config = { ...DEFAULT_CONFIG, ...(saved || {}) };
        this._apply();
        return this._config;
    }

    // ── Public API ──────────────────────────────────────────────────────────

    /** Set colour mode: 'dark' | 'light' | 'system' */
    async setMode(mode) {
        if (!RTL_MODES.includes(mode)) return;
        this._config.mode = mode;
        this._apply();
        await this._save();
    }

    /** Set accent preset: 'lime' | 'red' | 'pink' | ... */
    async setAccent(name) {
        if (!RTL_ACCENT_PRESETS.includes(name)) return;
        this._config.accent = name;
        this._apply();
        await this._save();
    }

    /** Set grid mode: 'lines' | 'gaps' */
    async setGridMode(mode) {
        this._config.gridMode = mode;
        this._applyGridMode();
        await this._save();
    }

    /** Get current config snapshot */
    getConfig() {
        return { ...this._config };
    }

    /** Get list of available accent presets */
    getAccents() {
        return [...RTL_ACCENT_PRESETS];
    }

    /** Reset to defaults */
    async reset() {
        this._config = { ...DEFAULT_CONFIG };
        this._apply();
        await this._save();
        return this.getConfig();
    }

    // ── Private ──────────────────────────────────────────────────────────────

    _apply() {
        this._applyMode();
        this._applyAccent();
        this._applyGridMode();
    }

    _applyMode() {
        const html = document.documentElement;
        const { mode } = this._config;

        // Clean up previous media listener
        if (this._mediaQuery) {
            this._mediaQuery.removeEventListener('change', this._boundMediaHandler);
            this._mediaQuery = null;
        }

        if (mode === 'system') {
            this._mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            this._mediaQuery.addEventListener('change', this._boundMediaHandler);
            html.dataset.mode = this._mediaQuery.matches ? 'dark' : 'light';
        } else {
            html.dataset.mode = mode;
        }
    }

    _onMediaChange(e) {
        document.documentElement.dataset.mode = e.matches ? 'dark' : 'light';
    }

    _applyAccent() {
        document.documentElement.dataset.accent = this._config.accent;
    }

    _applyGridMode() {
        const html = document.documentElement;
        if (this._config.gridMode === 'gaps') {
            html.classList.add('gap-mode');
        } else {
            html.classList.remove('gap-mode');
        }
    }

    async _save() {
        try {
            await this._persist(this.getConfig());
        } catch (e) {
            console.warn('[RTLThemeEngine] Failed to persist config:', e);
        }
    }
}

// ── Accent dot colours for the picker UI ─────────────────────────────────────
// These map accent names to their visual swatch color (approximate hsl midpoint)
export const RTL_ACCENT_SWATCH_COLORS = {
    lime: '#c8f060',
    red: '#ff6b6b',
    pink: '#f06090',
    purple: '#b070e8',
    yellow: '#ffd040',
    blue: '#60b0f0',
    cyan: '#40c8c0',
    orange: '#f08040',
};
