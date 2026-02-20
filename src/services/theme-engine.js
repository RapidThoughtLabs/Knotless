/**
 * ThemeEngine — Renderer-side module that applies theme settings as CSS custom properties
 */

const CSS_VAR_MAP = {
    // Chrome / app shell
    'theme.chrome.headerBg': '--row-a-bg',
    'theme.chrome.filterBarBg': '--row-b-bg',
    'theme.chrome.borderColor': '--border-color',
    'theme.chrome.hoverBg': '--hover-bg',
    'theme.chrome.activeBg': '--active-bg',

    // Text
    'theme.text.primary': '--text-primary',
    'theme.text.secondary': '--text-secondary',
    'theme.text.muted': '--text-muted',

    // Tables
    'theme.tables.cellBg': '--cell-bg',
    'theme.tables.cellHoverBg': '--cell-hover-bg',
    'theme.tables.cellFocusBg': '--cell-focus-bg',
    'theme.tables.cellText': '--cell-text',
    'theme.tables.cellPlaceholder': '--cell-placeholder',
    'theme.tables.gridLineColor': '--grid-line-color',
    'theme.tables.footerBg': '--table-footer-bg',
    'theme.tables.opacity': '--table-opacity',

    // Accents
    'theme.accents.success': '--accent-success',
    'theme.accents.danger': '--accent-danger',
    'theme.accents.dangerHover': '--accent-danger-hover',
    'theme.accents.toggleActive': '--accent-toggle-active',
};

class ThemeEngine {
    constructor() {
        this.config = null;
        this.wallpaperEl = null;
    }

    /**
     * Initialize the theme engine with the full settings config
     */
    async init() {
        const { settings } = window.electron;
        this.config = await settings.get();
        this._applyAll();
    }

    /**
     * Apply all theme properties from the current config
     */
    _applyAll() {
        const theme = this.config.theme;
        const root = document.documentElement;

        // Apply flat CSS variable mappings
        for (const [configPath, cssVar] of Object.entries(CSS_VAR_MAP)) {
            const value = this._getByPath(this.config, configPath);
            if (value !== undefined) {
                root.style.setProperty(cssVar, String(value));
            }
        }

        // Apply background
        this._applyBackground(theme.background);

        // Apply grid line mode
        this._applyGridLineMode(theme.tables.gridLineMode);

        // Apply font size
        root.style.setProperty('--font-size', `${theme.fontSize}px`);
    }

    /**
     * Apply background based on type (solid / gradient / wallpaper)
     */
    _applyBackground(bg) {
        const root = document.documentElement;

        // Remove existing wallpaper if switching away
        if (bg.type !== 'wallpaper') {
            this._removeWallpaper();
        }

        switch (bg.type) {
            case 'solid':
                root.style.setProperty('--app-bg', bg.color);
                break;

            case 'gradient':
                root.style.setProperty(
                    '--app-bg',
                    `linear-gradient(${bg.gradient.angle}deg, ${bg.gradient.from}, ${bg.gradient.to})`
                );
                break;

            case 'wallpaper':
                // Solid fallback behind wallpaper
                root.style.setProperty('--app-bg', bg.color || '#3a3a3a');
                this._applyWallpaper(bg.wallpaperUrl, bg.opacity);
                break;

            default:
                root.style.setProperty('--app-bg', bg.color);
        }
    }

    /**
     * Create or update the wallpaper background element
     */
    _applyWallpaper(url, opacity) {
        if (!url) {
            this._removeWallpaper();
            return;
        }

        if (!this.wallpaperEl) {
            this.wallpaperEl = document.createElement('div');
            this.wallpaperEl.id = 'wallpaper-bg';
            document.body.prepend(this.wallpaperEl);
        }

        this.wallpaperEl.style.backgroundImage = `url(${url})`;
        this.wallpaperEl.style.opacity = String(opacity ?? 1);
    }

    /**
     * Remove the wallpaper element
     */
    _removeWallpaper() {
        if (this.wallpaperEl) {
            this.wallpaperEl.remove();
            this.wallpaperEl = null;
        }
    }

    /**
     * Apply grid line mode: 'lines' or 'gaps'
     */
    _applyGridLineMode(mode) {
        const root = document.documentElement;
        if (mode === 'gaps') {
            root.classList.add('gap-mode');
        } else {
            root.classList.remove('gap-mode');
        }
    }

    /**
     * Update a single setting, persist via IPC, and re-apply
     */
    async update(dotPath, value) {
        const { settings } = window.electron;
        this.config = await settings.update(dotPath, value);
        this._applyAll();
        return this.config;
    }

    /**
     * Reset all settings to defaults
     */
    async reset() {
        const { settings } = window.electron;
        this.config = await settings.reset();
        this._applyAll();
        return this.config;
    }

    /**
     * Get the current config
     */
    getConfig() {
        return this.config;
    }

    /**
     * Get a value from object by dot-path
     */
    _getByPath(obj, path) {
        return path.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj);
    }
}

// Export a singleton
const themeEngine = new ThemeEngine();
export default themeEngine;
