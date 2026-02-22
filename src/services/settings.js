import path from 'path';
import fs from 'fs';
import { app } from 'electron';

const DEFAULT_SETTINGS = {
    general: {
        launchOnStartup: false,
        defaultColumns: 3,
    },
    theme: {
        mode: 'dark',
        accent: 'lime',
        gridMode: 'lines',
    },
    security: {
        lockOnSleep: false,
        autoLockTimeout: 'never',
        clearDataOnExit: false,
    },
};

class SettingsService {
    constructor() {
        this.filePath = path.join(app.getPath('userData'), 'settings.json');
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
