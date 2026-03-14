import path from 'path';
import fs from 'fs';

const DEFAULT_SETTINGS = {
    general: {
        launchOnStartup: false,
        defaultColumns: 3,
        maxFileSizeMB: 50,
        lastOpenSheetId: null,
    },
    theme: {
        mode: 'dark',
        accent: 'purple',
        gridMode: 'lines',
    },
    security: {
        lockOnSleep: false,
        autoLockTimeout: 'never',
        clearDataOnExit: false,
    },
    // ── Export / Import config (hidden from settings UI) ──────────────────────
    // Capped at 250 MB to prevent massive exports that could hang the app or
    // fill the user's disk. Not exposed in the settings panel intentionally.
    // To increase the limit, change maxBlobSizeMB here or edit settings.json
    // directly in the userData directory.
    exportImport: {
        maxBlobSizeMB: 250,
    },
};

class SettingsService {
    constructor(userDataPath) {
        this.filePath = path.join(userDataPath, 'settings.json');
        this.settings = this._load();
    }


    _load() {
        try {
            if (fs.existsSync(this.filePath)) {
                const raw = fs.readFileSync(this.filePath, 'utf-8');
                const saved = JSON.parse(raw);
                return this._deepMerge(structuredClone(DEFAULT_SETTINGS), saved);
            }
        } catch (err) {
            console.error('[Settings] Failed to load, using defaults:', err);
        }
        this._write(DEFAULT_SETTINGS);
        return structuredClone(DEFAULT_SETTINGS);
    }

    _write(settings) {
        try {
            fs.writeFileSync(this.filePath, JSON.stringify(settings, null, 2), 'utf-8');
        } catch (err) {
            console.error('[Settings] Failed to write:', err);
        }
    }

    _deepMerge(target, source) {
        for (const key of Object.keys(source)) {
            if (
                source[key] && typeof source[key] === 'object' &&
                !Array.isArray(source[key]) &&
                target[key] && typeof target[key] === 'object' &&
                !Array.isArray(target[key])
            ) {
                this._deepMerge(target[key], source[key]);
            } else {
                target[key] = source[key];
            }
        }
        return target;
    }

    get() { return structuredClone(this.settings); }

    update(dotPath, value) {
        const keys = dotPath.split('.');
        let obj = this.settings;
        for (let i = 0; i < keys.length - 1; i++) {
            if (!obj[keys[i]] || typeof obj[keys[i]] !== 'object') obj[keys[i]] = {};
            obj = obj[keys[i]];
        }
        obj[keys[keys.length - 1]] = value;
        this._write(this.settings);
        return this.get();
    }

    reset() {
        this.settings = structuredClone(DEFAULT_SETTINGS);
        this._write(this.settings);
        return this.get();
    }
}

export default SettingsService;
