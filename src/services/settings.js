import path from 'path';
import fs from 'fs';
import { app } from 'electron';

const DEFAULT_SETTINGS = {
    general: {
        launchOnStartup: false,
        defaultColumns: 3,
        autoSaveInterval: 30
    },
    theme: {
        appearance: 'dark',
        fontSize: 13,
        compactMode: false,

        background: {
            type: 'solid',
            color: '#3a3a3a',
            gradient: {
                from: '#2d2d2d',
                to: '#1a1a1a',
                angle: 135
            },
            wallpaperUrl: '',
            opacity: 1.0
        },

        chrome: {
            headerBg: '#1a1a1a',
            filterBarBg: '#2d2d2d',
            borderColor: '#404040',
            hoverBg: '#444444',
            activeBg: '#505050'
        },

        text: {
            primary: '#e0e0e0',
            secondary: '#a0a0a0',
            muted: '#5a5a5a'
        },

        tables: {
            cellBg: '#f5f5f5',
            cellHoverBg: '#fafafa',
            cellFocusBg: '#ffffff',
            cellText: '#1a1a1a',
            cellPlaceholder: '#999999',
            gridLineColor: '#000000',
            gridLineMode: 'lines',
            footerBg: '#1a1a1a',
            opacity: 1.0
        },

        accents: {
            success: '#2ea043',
            danger: '#e81123',
            dangerHover: '#ff6b6b',
            toggleActive: '#2ea043'
        },

        highlights: [
            { name: 'Soft Red', color: '#ffd6cc' },
            { name: 'Soft Orange', color: '#ffe4cc' },
            { name: 'Soft Yellow', color: '#fff5cc' },
            { name: 'Soft Green', color: '#d6f5d6' },
            { name: 'Soft Blue', color: '#ccf0ff' }
        ]
    },
    security: {
        lockOnSleep: false,
        autoLockTimeout: 'never',
        clearDataOnExit: false
    }
};

class SettingsService {
    constructor() {
        this.filePath = path.join(app.getPath('userData'), 'settings.json');
        this.settings = this._load();
    }

    /**
     * Load settings from disk, creating defaults if file doesn't exist
     */
    _load() {
        try {
            if (fs.existsSync(this.filePath)) {
                const raw = fs.readFileSync(this.filePath, 'utf-8');
                const saved = JSON.parse(raw);
                // Deep merge with defaults so new keys are always present
                return this._deepMerge(structuredClone(DEFAULT_SETTINGS), saved);
            }
        } catch (err) {
            console.error('Failed to load settings, using defaults:', err);
        }

        // First boot or corrupt file — write defaults
        this._write(DEFAULT_SETTINGS);
        return structuredClone(DEFAULT_SETTINGS);
    }

    /**
     * Write current settings to disk
     */
    _write(settings) {
        try {
            fs.writeFileSync(this.filePath, JSON.stringify(settings, null, 2), 'utf-8');
        } catch (err) {
            console.error('Failed to write settings:', err);
        }
    }

    /**
     * Deep merge source into target (target wins for existing keys, source fills gaps)
     */
    _deepMerge(target, source) {
        for (const key of Object.keys(source)) {
            if (
                source[key] &&
                typeof source[key] === 'object' &&
                !Array.isArray(source[key]) &&
                target[key] &&
                typeof target[key] === 'object' &&
                !Array.isArray(target[key])
            ) {
                this._deepMerge(target[key], source[key]);
            } else {
                target[key] = source[key];
            }
        }
        return target;
    }

    /**
     * Get the full settings object
     */
    get() {
        return structuredClone(this.settings);
    }

    /**
     * Update a nested setting by dot-path
     * e.g. update('theme.background.color', '#ff0000')
     */
    update(dotPath, value) {
        const keys = dotPath.split('.');
        let obj = this.settings;

        for (let i = 0; i < keys.length - 1; i++) {
            if (!obj[keys[i]] || typeof obj[keys[i]] !== 'object') {
                obj[keys[i]] = {};
            }
            obj = obj[keys[i]];
        }

        obj[keys[keys.length - 1]] = value;
        this._write(this.settings);
        return this.get();
    }

    /**
     * Reset all settings to defaults
     */
    reset() {
        this.settings = structuredClone(DEFAULT_SETTINGS);
        this._write(this.settings);
        return this.get();
    }
}

export default SettingsService;
