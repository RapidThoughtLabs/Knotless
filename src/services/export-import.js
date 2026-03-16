/**
 * ExportImportService — runs in the Electron main process.
 *
 * Handles all serialisation and deserialisation for .ktl.json and .ktl.zip.
 * Uses Node.js fs / path / crypto + JSZip (main-process only, NOT bundled by Vite).
 *
 * Instantiated once in main.js and consumed via ipcMain handlers.
 */

import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import JSZip from 'jszip';

const IMG_PREFIX  = 'IMG:';
const FILE_PREFIX = 'FILE:';
const IMAGE_EXTS  = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'tiff', 'ico', 'avif']);

// ── Tiny helpers ──────────────────────────────────────────────────────────────

function extOf(filename) {
    return (path.extname(filename) || '').toLowerCase().slice(1);
}

function isImageFile(filename) {
    return IMAGE_EXTS.has(extOf(filename));
}

function hashFile(absPath) {
    try {
        const buf = fs.readFileSync(absPath);
        return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
    } catch {
        return null;
    }
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ── Blob collection & deduplication ──────────────────────────────────────────

/**
 * Walk all cells across all tables and collect every blob reference.
 * Returns an array of { absPath, type: 'img'|'file', originalName, size }.
 */
function collectBlobRefs(tables) {
    const refs = [];
    for (const table of tables) {
        for (const row of (table.data ?? [])) {
            for (const cell of row) {
                if (typeof cell !== 'string') continue;
                if (cell.startsWith(IMG_PREFIX)) {
                    const absPath = cell.slice(IMG_PREFIX.length);
                    refs.push({ absPath, type: 'img', originalName: path.basename(absPath), size: '0' });
                } else if (cell.startsWith(FILE_PREFIX)) {
                    const parts = cell.slice(FILE_PREFIX.length).split('|');
                    refs.push({
                        absPath:      parts[0],
                        type:         'file',
                        originalName: parts[1] || path.basename(parts[0]),
                        size:         parts[2] || '0',
                    });
                }
            }
        }
    }
    return refs;
}

/**
 * Build a dedup map:  absPath  →  export filename in blobs/  (or null if file missing).
 *
 * Rules:
 *   - Same content hash   → same export filename (one copy shipped)
 *   - Different hash but  same filename collision → rename second with _1, _2, … suffix
 *   - File doesn't exist  → null  (cell becomes a placeholder in the exported JSON)
 */
function buildDedupeMap(refs) {
    const hashToName   = {};   // hash   → export filename
    const nameSet      = new Set();
    const abspathToName = {};  // absPath → export filename | null

    for (const ref of refs) {
        if (Object.prototype.hasOwnProperty.call(abspathToName, ref.absPath)) continue;

        if (!fs.existsSync(ref.absPath)) {
            abspathToName[ref.absPath] = null;
            continue;
        }

        const hash = hashFile(ref.absPath);
        if (!hash) { abspathToName[ref.absPath] = null; continue; }

        if (hashToName[hash]) {
            // Same content — reuse the already-assigned export name
            abspathToName[ref.absPath] = hashToName[hash];
        } else {
            // New content — find a unique export name
            const basePart = path.basename(ref.originalName, path.extname(ref.originalName));
            const extPart  = path.extname(ref.originalName);
            let exportName = ref.originalName;
            let counter    = 1;
            while (nameSet.has(exportName)) {
                exportName = `${basePart}_${counter}${extPart}`;
                counter++;
            }
            hashToName[hash]           = exportName;
            nameSet.add(exportName);
            abspathToName[ref.absPath] = exportName;
        }
    }
    return abspathToName;
}

// ── Cell rewriters ────────────────────────────────────────────────────────────

/** Rewrite cells for a plain JSON export (no blobs — human-readable placeholders). */
function rewriteCellsJson(tables) {
    return tables.map(table => ({
        name:      table.name      ?? 'untitled',
        columns:   table.columns   ?? 1,
        data:      (table.data ?? []).map(row =>
            row.map(cell => {
                if (typeof cell !== 'string') return cell;
                if (cell.startsWith(IMG_PREFIX)) {
                    return `[image: ${path.basename(cell.slice(IMG_PREFIX.length))}]`;
                }
                if (cell.startsWith(FILE_PREFIX)) {
                    const parts = cell.slice(FILE_PREFIX.length).split('|');
                    return `[file: ${parts[1] || path.basename(parts[0])}]`;
                }
                return cell;
            })
        ),
        checklist: table.checklist ?? false,
        checked:   table.checked   ?? [],
        highlights:table.highlights ?? {},
        pinned:    table.pinned    ?? false,
        sortOrder: table.sortOrder ?? Date.now(),
        cardHeight:table.cardHeight ?? null,
    }));
}

/** Rewrite cells for a ZIP export (blob cells → relative blobs/ paths). */
function rewriteCellsZip(tables, dedupeMap) {
    return tables.map(table => ({
        name:      table.name      ?? 'untitled',
        columns:   table.columns   ?? 1,
        data:      (table.data ?? []).map(row =>
            row.map(cell => {
                if (typeof cell !== 'string') return cell;
                if (cell.startsWith(IMG_PREFIX)) {
                    const absPath    = cell.slice(IMG_PREFIX.length);
                    const exportName = dedupeMap[absPath];
                    if (!exportName) return `[image: ${path.basename(absPath)}]`;
                    return `${IMG_PREFIX}blobs/${exportName}`;
                }
                if (cell.startsWith(FILE_PREFIX)) {
                    const parts      = cell.slice(FILE_PREFIX.length).split('|');
                    const absPath    = parts[0];
                    const origName   = parts[1] || path.basename(absPath);
                    const size       = parts[2] || '0';
                    const exportName = dedupeMap[absPath];
                    if (!exportName) return `[file: ${origName}]`;
                    return `${FILE_PREFIX}blobs/${exportName}|${origName}|${size}`;
                }
                return cell;
            })
        ),
        checklist: table.checklist ?? false,
        checked:   table.checked   ?? [],
        highlights:table.highlights ?? {},
        pinned:    table.pinned    ?? false,
        sortOrder: table.sortOrder ?? Date.now(),
        cardHeight:table.cardHeight ?? null,
    }));
}

// ── Import validation ─────────────────────────────────────────────────────────

/**
 * Returns true if the parsed JSON object is a valid KTL sheet.
 *
 * Required top-level:
 *   ktl_version (any truthy value), sheet.name (non-empty string), tables (array)
 *
 * Required per table:
 *   name (non-empty string), columns (number ≥ 1),
 *   data (array of arrays, each row length === columns)
 *
 * Unknown fields are silently ignored — forwards compatible.
 */
function validateKtlJson(parsed) {
    if (!parsed || typeof parsed !== 'object') return false;
    if (!parsed.ktl_version) return false;
    if (!parsed.sheet || typeof parsed.sheet !== 'object') return false;
    if (!parsed.sheet.name || typeof parsed.sheet.name !== 'string' || !parsed.sheet.name.trim()) return false;
    if (!Array.isArray(parsed.tables)) return false;

    for (const t of parsed.tables) {
        if (!t.name || typeof t.name !== 'string' || !t.name.trim()) return false;
        if (typeof t.columns !== 'number' || t.columns < 1) return false;
        if (!Array.isArray(t.data)) return false;
        for (const row of t.data) {
            if (!Array.isArray(row) || row.length !== t.columns) return false;
        }
    }
    return true;
}

/** Apply default values to optional table fields before inserting into the DB. */
function applyTableDefaults(t) {
    return {
        name:      t.name,
        columns:   t.columns,
        data:      t.data,
        checklist: t.checklist  ?? false,
        checked:   t.checked    ?? [],
        highlights:t.highlights ?? {},
        pinned:    t.pinned     ?? false,
        sortOrder: t.sortOrder  ?? Date.now(),
        cardHeight:t.cardHeight ?? null,
    };
}

// ── Service class ─────────────────────────────────────────────────────────────

class ExportImportService {
    /**
     * @param {string} electronDir  Path to the electron/ directory (= __dirname from main.js).
     *                              Used to locate the HTML viewer template bundled with the app.
     */
    constructor(electronDir) {
        this._templatePath  = path.join(electronDir, 'templates', 'ktl-viewer-template.html');
        this._fileIconsDir  = path.join(electronDir, '..', 'node_modules', 'file-icons-js');
    }

    // ── Export: plain JSON ────────────────────────────────────────────────────

    async exportSheetAsJson(sheetDoc, tables, saveFilePath) {
        const ktlJson = {
            ktl_version: '1.0',
            exported_at: new Date().toISOString(),
            sheet: {
                name:      sheetDoc.name      ?? 'untitled',
                createdAt: sheetDoc.createdAt ?? new Date().toISOString(),
            },
            tables: rewriteCellsJson(tables),
        };

        fs.writeFileSync(saveFilePath, JSON.stringify(ktlJson, null, 2), 'utf-8');
        return { ok: true };
    }

    // ── Export: ZIP bundle ────────────────────────────────────────────────────

    async exportSheetAsZip(sheetDoc, tables, saveFilePath, blobCapMB = 250) {
        // 1 — Collect blob refs and build dedup map
        const refs      = collectBlobRefs(tables);
        const dedupeMap = buildDedupeMap(refs);

        // 2 — Enforce blob size cap (sum over deduplicated unique files only)
        const counted  = new Set();
        let totalBytes = 0;
        for (const [absPath, exportName] of Object.entries(dedupeMap)) {
            if (!exportName || counted.has(exportName)) continue;
            counted.add(exportName);
            try { totalBytes += fs.statSync(absPath).size; } catch { /* skip missing */ }
        }
        const totalMB = totalBytes / (1024 * 1024);
        if (totalMB > blobCapMB) {
            return { error: 'blob_cap_exceeded', totalMB: Math.round(totalMB * 10) / 10 };
        }

        // 3 — Build the JSON with relative blob references
        const exportedTables = rewriteCellsZip(tables, dedupeMap);
        const sheetSafe    = (sheetDoc.name ?? 'untitled').replace(/[^a-zA-Z0-9_\-]/g, '_');
        const ktlJson = {
            ktl_version: '1.0',
            exported_at: new Date().toISOString(),
            source_file: sheetSafe + '.ktl.json',
            sheet: {
                name:      sheetDoc.name      ?? 'untitled',
                createdAt: sheetDoc.createdAt ?? new Date().toISOString(),
            },
            tables: exportedTables,
        };
        const jsonStr      = JSON.stringify(ktlJson, null, 2);

        // 4 — Build the HTML viewer (inject JSON inline — no fetch, no CORS issues)
        let htmlContent = '';
        try {
            htmlContent = fs.readFileSync(this._templatePath, 'utf-8');
        } catch (err) {
            console.error('[ExportImport] Failed to read HTML template:', err);
            htmlContent = `<!DOCTYPE html><html><body>
                <p style="color:#ccc;font-family:monospace;padding:24px">
                Viewer template not found — open the .ktl.json file directly.</p>
                </body></html>`;
        }

        // Escape any </script> sequences inside the injected JSON to avoid breaking
        // the surrounding script tag.
        const jsonEscaped = jsonStr.replace(/<\/script>/gi, '<\\/script>');
        htmlContent = htmlContent
            .replace('/*__KTL_DATA__*/', jsonEscaped)
            .replace(/<!--KTL_SHEET_NAME-->/g, escapeHtml(sheetDoc.name ?? 'untitled'));

        // 5 — Assemble the ZIP
        const zip = new JSZip();
        zip.file(`${sheetSafe}.ktl.json`, jsonStr);
        zip.file(`${sheetSafe}.ktl.html`, htmlContent);

        // Bundle file-icons-js assets so the HTML viewer can render proper file icons
        this._bundleFileIcons(zip);

        // Add blobs (one copy per unique-hash file)
        const addedBlobs = new Set();
        for (const [absPath, exportName] of Object.entries(dedupeMap)) {
            if (!exportName || addedBlobs.has(exportName)) continue;
            addedBlobs.add(exportName);
            try {
                zip.file(`blobs/${exportName}`, fs.readFileSync(absPath));
            } catch { /* file gone between check and read — silently skip */ }
        }

        // 6 — Write ZIP to disk
        const zipBuf = await zip.generateAsync({
            type: 'nodebuffer',
            compression: 'DEFLATE',
            compressionOptions: { level: 6 },
        });
        fs.writeFileSync(saveFilePath, zipBuf);
        return { ok: true };
    }

    // ── Bundle file-icons-js assets into ZIP ─────────────────────────────────

    _bundleFileIcons(zip) {
        try {
            // JS bundle
            const jsPath = path.join(this._fileIconsDir, 'dist', 'file-icons.js');
            if (fs.existsSync(jsPath)) {
                zip.file('file-icons/file-icons.js', fs.readFileSync(jsPath));
            }

            // CSS — rewrite font URLs from "../fonts/" to "fonts/" so they resolve
            // correctly relative to file-icons/style.css inside the ZIP.
            const cssPath = path.join(this._fileIconsDir, 'css', 'style.css');
            if (fs.existsSync(cssPath)) {
                const css = fs.readFileSync(cssPath, 'utf-8')
                    .replace(/url\("\.\.\/fonts\//g, 'url("fonts/');
                zip.file('file-icons/style.css', css);
            }

            // Fonts
            const fontsDir = path.join(this._fileIconsDir, 'fonts');
            if (fs.existsSync(fontsDir)) {
                for (const fname of fs.readdirSync(fontsDir)) {
                    if (fname.endsWith('.woff2')) {
                        zip.file(
                            'file-icons/fonts/' + fname,
                            fs.readFileSync(path.join(fontsDir, fname)),
                        );
                    }
                }
            }
        } catch (err) {
            console.warn('[ExportImport] Could not bundle file-icons assets:', err.message);
        }
    }

    // ── Import ────────────────────────────────────────────────────────────────

    async importSheet(filePath, appUserDataPath) {
        if (filePath.endsWith('.ktl.json')) return this._importJson(filePath);
        if (filePath.endsWith('.ktl.zip'))  return this._importZip(filePath, appUserDataPath);
        return { error: 'invalid' };
    }

    async _importJson(filePath) {
        try {
            const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            if (!validateKtlJson(parsed)) return { error: 'invalid' };
            return {
                sheet:  { name: parsed.sheet.name, createdAt: parsed.sheet.createdAt ?? new Date().toISOString() },
                tables: parsed.tables.map(applyTableDefaults),
            };
        } catch {
            return { error: 'invalid' };
        }
    }

    async _importZip(filePath, appUserDataPath) {
        try {
            const buf = fs.readFileSync(filePath);
            const zip = await JSZip.loadAsync(buf);

            // Locate the .ktl.json inside
            const jsonEntry = Object.values(zip.files).find(f => !f.dir && f.name.endsWith('.ktl.json'));
            if (!jsonEntry) return { error: 'invalid' };

            const parsed = JSON.parse(await jsonEntry.async('string'));
            if (!validateKtlJson(parsed)) return { error: 'invalid' };

            // Ensure storage directories exist
            const imagesDir = path.join(appUserDataPath, 'images');
            const filesDir  = path.join(appUserDataPath, 'files');
            if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });
            if (!fs.existsSync(filesDir))  fs.mkdirSync(filesDir,  { recursive: true });

            // Extract blobs → app storage, build blobName → absPath map
            const blobToAbsPath = {};
            for (const [zipPath, entry] of Object.entries(zip.files)) {
                if (entry.dir || !zipPath.startsWith('blobs/')) continue;
                const blobName   = path.basename(zipPath);
                const isImg      = isImageFile(blobName);
                const ext        = extOf(blobName);
                const timestamp  = Date.now();
                const randomId   = crypto.randomBytes(2).toString('hex');
                const prefix     = isImg ? 'img' : 'file';
                const newFilename= `${prefix}_${timestamp}_${randomId}${ext ? '.' + ext : ''}`;
                const destDir    = isImg ? imagesDir : filesDir;
                const destPath   = path.join(destDir, newFilename);

                fs.writeFileSync(destPath, await entry.async('nodebuffer'));
                blobToAbsPath[blobName] = path.normalize(destPath).replace(/\\/g, '/');
            }

            // Rewrite cell references: blobs/name → absolute app-storage path
            const tables = parsed.tables.map(table => {
                const data = table.data.map(row =>
                    row.map(cell => {
                        if (typeof cell !== 'string') return cell;
                        if (cell.startsWith(IMG_PREFIX)) {
                            const blobName = path.basename(cell.slice(IMG_PREFIX.length));
                            const absPath  = blobToAbsPath[blobName];
                            return absPath ? `${IMG_PREFIX}${absPath}` : `[image: ${blobName}]`;
                        }
                        if (cell.startsWith(FILE_PREFIX)) {
                            const parts      = cell.slice(FILE_PREFIX.length).split('|');
                            const blobName   = path.basename(parts[0]);
                            const origName   = parts[1] || blobName;
                            const size       = parts[2] || '0';
                            const absPath    = blobToAbsPath[blobName];
                            return absPath ? `${FILE_PREFIX}${absPath}|${origName}|${size}` : `[file: ${origName}]`;
                        }
                        return cell;
                    })
                );
                return applyTableDefaults({ ...table, data });
            });

            return {
                sheet:  { name: parsed.sheet.name, createdAt: parsed.sheet.createdAt ?? new Date().toISOString() },
                tables,
            };
        } catch (err) {
            console.error('[ExportImport] _importZip failed:', err);
            return { error: 'invalid' };
        }
    }
}

export default ExportImportService;
