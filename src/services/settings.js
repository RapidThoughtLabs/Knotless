import path from 'path';
import fs from 'fs';

const DEFAULT_SETTINGS = {
    general: {
        launchOnStartup: false,
        defaultColumns: 3,
        maxFileSizeMB: 50,
        lastOpenSheetId: null,
        tableControlsPosition: 'header', // 'header' | 'footer'
    },
    theme: {
        mode: 'light',
        accent: 'yellow',
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
    // ── Handbook sheet lifecycle tracking ─────────────────────────────────────
    // added:       true if the handbook sheet currently exists in the DB.
    //              flips back to false when the user deletes the sheet.
    // lastCreated: ISO timestamp of the last successful injection. Stays set
    //              even after deletion so the app knows the user chose to delete
    //              it (vs. a fresh install that has never seen it).
    // sheetId:     _id of the handbook sheet in sheets.db. Used to detect
    //              deletion and to target regeneration.
    // version:     HANDBOOK_VERSION string that was last injected. When the
    //              app ships a newer HANDBOOK_VERSION, the lifecycle logic can
    //              detect the bump and regenerate if autoUpdate is on.
    // autoUpdate:  if true, a version bump auto-replaces the handbook on launch.
    //              if false, the user regenerates manually from settings.
    handbook: {
        added: false,
        lastCreated: null,
        sheetId: null,
        version: null,
        autoUpdate: true,
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
