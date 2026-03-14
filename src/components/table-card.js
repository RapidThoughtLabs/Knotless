/**
 * Table Card — RTL Knotless V2
 *
 * Renders a complete TableNote card:
 *   [optional top accent bar for pinned]
 *   [grid of rows × columns, each cell is contenteditable or image]
 *   [table footer]
 *
 * Ref: V2 HTML lines 147-265
 */

import { TableFooter } from './table-footer.js';
import { HIGHLIGHT_COLORS } from './context-menu.js';
import { showToast } from './toast.js';

// — Image cell detection helpers —
const IMG_PREFIX = 'IMG:';
function isImageCell(val) { return typeof val === 'string' && val.startsWith(IMG_PREFIX); }
function getImagePath(val) { return val.slice(IMG_PREFIX.length); }

// — File cell detection helpers —
const FILE_PREFIX = 'FILE:';
function isFileCell(val) { return typeof val === 'string' && val.startsWith(FILE_PREFIX); }
function parseFileValue(val) {
    const raw = val.slice(FILE_PREFIX.length);
    const [filePath, originalName, sizeStr] = raw.split('|');
    return {
        filePath,
        originalName: originalName || filePath.split('/').pop(),
        size: parseInt(sizeStr || '0', 10),
    };
}
function buildFileValue(filePath, originalName, size) {
    return `${FILE_PREFIX}${filePath}|${originalName}|${size}`;
}

// Extensions whose contents are human-readable text (copy contents on long-press)
const TEXT_EXTENSIONS = new Set([
    'txt', 'md', 'json', 'csv', 'xml', 'yaml', 'yml', 'toml',
    'js', 'ts', 'jsx', 'tsx', 'py', 'rb', 'rs', 'go', 'java',
    'c', 'cpp', 'h', 'hpp', 'cs', 'swift', 'kt', 'sh', 'bash',
    'zsh', 'fish', 'ps1', 'bat', 'cmd', 'sql', 'html', 'css',
    'scss', 'sass', 'less', 'vue', 'svelte', 'lua', 'r', 'php',
    'pl', 'ex', 'exs', 'hs', 'ml', 'clj', 'elm', 'dart',
    'env', 'ini', 'cfg', 'conf', 'log', 'gitignore', 'dockerfile',
]);
function isTextFile(filename) {
    const ext = (filename.split('.').pop() || '').toLowerCase();
    return TEXT_EXTENSIONS.has(ext);
}

function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// — HTML escape util for clipboard HTML table —
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// — Cell content-type class detection —
const URL_PATTERN = /^https?:\/\//i;
const BARE_URL_PATTERN = /^(www\.)\S+\.\S+|^\S+\.(com|net|org|io|dev|app|co|in|uk|edu|gov|me|ai|xyz|info|biz)(\/\S*)?$/i;
const CODE_PATTERN = /^[`'"!@#\$]{1}|sk-|ghp_|sk-ant/;
const PATH_PATTERN = /^[~\/\\]|^[A-Z]:\\/;

// Comprehensive set of known shell / CLI commands — first-word Set lookup is
// O(1) and far more extensible than a regex alternation.
const SHELL_COMMANDS = new Set([
    // ── Filesystem ──────────────────────────────────────────────────────────
    'ls','dir','ll','la','cd','pwd','mkdir','rmdir','rm','cp','mv','ln','touch',
    'cat','head','tail','less','more','file','stat','du','df','find','locate',
    'which','whereis','basename','dirname','realpath','readlink','tree',
    // ── Text processing ─────────────────────────────────────────────────────
    'grep','egrep','fgrep','rg','sed','awk','cut','sort','uniq','wc','tr',
    'paste','join','split','diff','patch','comm','tee','xargs','strings',
    'fmt','fold','column','nl','od','xxd','hexdump',
    // ── Archive / compression ───────────────────────────────────────────────
    'tar','zip','unzip','gzip','gunzip','bzip2','bunzip2','xz','unxz',
    '7z','7za','rar','unrar','zstd',
    // ── Network ─────────────────────────────────────────────────────────────
    'curl','wget','ssh','scp','sftp','rsync','ftp','telnet','nc','ncat',
    'ping','traceroute','tracepath','mtr','nslookup','dig','host','whois',
    'netstat','ss','ifconfig','ip','iptables','ip6tables','tcpdump','nmap',
    'lsof','ab','wrk','httpie','http','aria2c',
    // ── Process / job management ────────────────────────────────────────────
    'ps','top','htop','btop','kill','killall','pkill','pgrep','nice','renice',
    'bg','fg','jobs','nohup','screen','tmux','watch','timeout','parallel',
    // ── System / admin ───────────────────────────────────────────────────────
    'sudo','su','chmod','chown','chgrp','umask','id','whoami','who','w',
    'last','uptime','uname','hostname','env','printenv','export','source',
    'alias','unalias','history','time','date','cal','timedatectl',
    'shutdown','reboot','halt','mount','umount','fdisk','lsblk','lsusb',
    'lspci','dmesg','sysctl','cron','crontab','at','systemctl','service',
    'journalctl','launchctl','pmset','diskutil','say','pbcopy','pbpaste',
    // ── Shells & scripting ───────────────────────────────────────────────────
    'bash','sh','zsh','fish','dash','ksh','tcsh','csh','pwsh',
    'echo','printf','read','test','expr','bc','let','eval',
    // ── Dev tools — JS/Node ─────────────────────────────────────────────────
    'node','npm','npx','yarn','pnpm','bun','deno','corepack',
    // ── Dev tools — Python ──────────────────────────────────────────────────
    'python','python3','pip','pip3','pipenv','poetry','conda','virtualenv',
    'pytest','pylint','black','mypy','ruff','uv',
    // ── Dev tools — Ruby ────────────────────────────────────────────────────
    'ruby','gem','bundle','bundler','rake','rails','rspec',
    // ── Dev tools — JVM ─────────────────────────────────────────────────────
    'java','javac','mvn','gradle','kotlin','kotlinc','scala','sbt','clojure',
    // ── Dev tools — Go / Rust / C ───────────────────────────────────────────
    'go','cargo','rustc','rustup','gcc','g++','clang','clang++','cc','make',
    'cmake','ninja','meson','bazel',
    // ── Dev tools — Version control ──────────────────────────────────────────
    'git','gh','hub','tig','svn','hg','fossil',
    // ── Dev tools — Containers / cloud ──────────────────────────────────────
    'docker','docker-compose','podman','kubectl','k9s','helm','terraform',
    'ansible','ansible-playbook','vagrant','packer',
    'aws','gcloud','az','heroku','fly','wrangler','vercel','netlify',
    // ── Package managers ────────────────────────────────────────────────────
    'brew','apt','apt-get','apt-cache','dpkg','yum','dnf','pacman','snap',
    'flatpak','apk','xbps-install','zypper','emerge','port','nix','nix-env',
    // ── Editors ─────────────────────────────────────────────────────────────
    'vim','vi','nvim','emacs','nano','code','subl','atom','open','xdg-open',
    'mate','gedit','kate','micro',
    // ── Media / image ────────────────────────────────────────────────────────
    'ffmpeg','ffprobe','convert','identify','mogrify','magick','exiftool',
    'yt-dlp','youtube-dl','sox','mpv','vlc','imagemagick',
    // ── Data / databases ────────────────────────────────────────────────────
    'jq','yq','xmllint','xq','fx','sqlite3','mysql','psql','mongo',
    'redis-cli','mongosh','influx','clickhouse',
    // ── Security / crypto ────────────────────────────────────────────────────
    'openssl','gpg','gpg2','ssh-keygen','ssh-add','ssh-agent','certbot',
    'nmap','nikto','john','hashcat',
    // ── Misc utilities ───────────────────────────────────────────────────────
    'man','info','tldr','help','type','hash','true','false','yes','seq',
    'shuf','tput','stty','clear','reset','sleep','wait','exit','logout',
    'ln','mktemp','mkfifo','tee','dd','sync','strace','ltrace',
]);

function looksLikeCommand(val) {
    const t = val.trimStart();
    // Explicit $ shell prompt prefix (e.g. "$ npm install")
    if (/^\$\s+\S/.test(t)) return true;
    // First word must be a known command and followed by a space (not just the word alone)
    const spaceIdx = t.search(/\s/);
    if (spaceIdx === -1) return false; // single word with no args → not a command
    const firstWord = t.slice(0, spaceIdx).toLowerCase().replace(/^\/.*\//, ''); // strip abs path prefix
    return SHELL_COMMANDS.has(firstWord);
}


/** Detect token/hash/key-looking strings via pattern + Shannon entropy */
function looksLikeToken(val) {
    const t = val.trim();
    // Must be a single continuous string, long enough to be a token
    if (t.length < 16 || /\s/.test(t)) return false;
    // Hex hashes (SHA-256, MD5, etc.)
    if (/^[0-9a-fA-F]{32,}$/.test(t)) return true;
    // JWT: three dot-separated base64url segments
    if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(t)) return true;
    // Shannon entropy — tokens/encoded strings have high character randomness
    const freq = {};
    for (const ch of t) freq[ch] = (freq[ch] || 0) + 1;
    const len = t.length;
    let entropy = 0;
    for (const count of Object.values(freq)) {
        const p = count / len;
        entropy -= p * Math.log2(p);
    }
    return entropy > 4.0;
}
function cellTypeClass(val) {
    if (!val || !val.trim()) return 'empty';
    if (URL_PATTERN.test(val)) return 'has-url';
    if (BARE_URL_PATTERN.test(val)) return 'has-url';
    if (looksLikeCommand(val)) return 'has-command';
    if (CODE_PATTERN.test(val)) return 'has-code';
    if (PATH_PATTERN.test(val)) return 'has-path';
    if (looksLikeToken(val)) return 'has-code';
    return '';
}

// — Build highlight CSS class from key —
function hlClass(key) {
    const found = HIGHLIGHT_COLORS.find(h => h.key === key);
    return found ? key : '';
}

export class TableCard {
    /**
     * @param {Object} table - Full table document from DB
     * @param {Object} callbacks
     * @param {Function} callbacks.onCellUpdate   - (tableId, row, col, value) => void
     * @param {Function} callbacks.onCheckedUpdate - (tableId, rowIndex, checked) => void
     * @param {Function} callbacks.onHighlight    - (tableId, row, col, highlightKey) => void
     * @param {Function} callbacks.onContextMenu  - (e, cellEl) => void
     * @param {Function} callbacks.onNameChange   - (tableId, name) => void
     * @param {Function} callbacks.onAddRow       - (tableId) => void
     * @param {Function} callbacks.onOptions      - (btnEl, tableId, tableData) => void
     */
    constructor(table, callbacks = {}) {
        this._table = table;
        this._cb = callbacks;
        this._el = null;
        this._footer = null;
        // Long-press state
        this._lpTimer = null;
        // Multi-cell selection state
        this._sel = { active: false, startRow: -1, startCol: -1, endRow: -1, endCol: -1 };
        // Resize drag state
        this._resizeDrag = { active: false, startY: 0, startH: 0 };
    }

    /** Build and return the card element */
    create() {
        const { _id, columns, data = [], pinned, checklist, checked = [], highlights = {}, highlight } = this._table;

        const el = document.createElement('div');
        const hlClass = highlight ? ` table-${highlight}` : '';
        el.className = `table-card${pinned ? ' pinned' : ''}${hlClass}`;
        el.dataset.tableId = _id;

        // ── Grid ─────────────────────────────────────────────────────────────
        const grid = document.createElement('div');
        grid.className = 'table-grid';

        data.forEach((row, rIdx) => {
            const rowEl = document.createElement('div');
            rowEl.className = 'table-row';
            rowEl.style.gridTemplateColumns = checklist
                ? `36px repeat(${columns}, 1fr)`
                : `repeat(${columns}, 1fr)`;

            // Checklist checkbox cell
            if (checklist) {
                const checkCell = document.createElement('div');
                checkCell.className = 'cell-check';
                checkCell.dataset.row = rIdx;
                checkCell.dataset.tableId = _id;

                const box = document.createElement('div');
                box.className = `checkbox${checked[rIdx] ? ' checked' : ''}`;
                box.textContent = checked[rIdx] ? '✓' : '';
                checkCell.appendChild(box);

                checkCell.addEventListener('click', () => this._toggleCheck(rIdx));
                rowEl.appendChild(checkCell);
            }

            // Data cells
            for (let cIdx = 0; cIdx < columns; cIdx++) {
                const val = row[cIdx] ?? '';
                const hlKey = highlights[`${rIdx}-${cIdx}`];

                const cellEl = this._buildCell(val, rIdx, cIdx, hlKey);
                rowEl.appendChild(cellEl);
            }

            grid.appendChild(rowEl);
        });

        // ── Wrap grid for collapse animation ──────────────────────────────────
        const gridWrapper = document.createElement('div');
        gridWrapper.className = 'table-grid-wrapper';
        gridWrapper.appendChild(grid);
        el.appendChild(gridWrapper);

        // ── Footer ────────────────────────────────────────────────────────────
        this._footer = new TableFooter(this._table, {
            onNameChange: this._cb.onNameChange,
            onAddRow: this._cb.onAddRow,
            onOptions: this._cb.onOptions,
            onMoveUp: this._cb.onMoveUp,
            onCollapse: () => this._toggleCollapse(),
        });
        el.appendChild(this._footer.create());

        // ── Apply saved card height ────────────────────────────────────────────
        if (this._table.cardHeight) {
            el.style.height = `${this._table.cardHeight}px`;
            el.classList.add('resizable');
        }

        // ── Apply saved collapsed state (no animation on initial render) ───────
        if (this._table.collapsed) {
            el.classList.add('collapsed', 'no-anim');
            requestAnimationFrame(() => el.classList.remove('no-anim'));
        }

        this._el = el;

        // After el is assigned, wire up interactive handlers
        this._installSelectionHandlers();
        this._installResizeHandle();

        return el;
    }

    /** Re-render the entire card (e.g. after columns change) */
    /** Toggle collapsed state, animate, and notify app to persist */
    _toggleCollapse() {
        const nowCollapsed = !this._el.classList.contains('collapsed');
        this._table.collapsed = nowCollapsed;
        this._el.classList.toggle('collapsed', nowCollapsed);
        this._cb.onCollapse?.(this._table._id, nowCollapsed);
    }

    /** Expand the card (called by search when a match is inside a collapsed table) */
    expandCard() {
        if (!this._el?.classList.contains('collapsed')) return;
        this._table.collapsed = false;
        this._el.classList.remove('collapsed');
        this._cb.onCollapse?.(this._table._id, false);
    }

    rerender(newTable) {
        this._table = newTable;
        const oldEl = this._el;
        const newEl = this.create();
        oldEl?.parentNode?.replaceChild(newEl, oldEl);
        return newEl;
    }

    /** Update cell value in-place (fast path for single cell edits) */
    updateCell(row, col, value) {
        const cellEl = this._el?.querySelector(`[data-row="${row}"][data-col="${col}"]`);
        if (!cellEl) return;
        this._renderCellContent(cellEl, value);
    }

    /** Update highlight on a specific cell */
    updateHighlight(row, col, hlKey) {
        const cellEl = this._el?.querySelector(`[data-row="${row}"][data-col="${col}"]`);
        if (!cellEl) return;
        // Remove old highlight classes
        HIGHLIGHT_COLORS.forEach(h => cellEl.classList.remove(h.key));
        if (hlKey) cellEl.classList.add(hlKey);
    }

    /** Update table highlight in-place */
    updateTableHighlight(hlKey) {
        if (!this._el) return;
        HIGHLIGHT_COLORS.forEach(h => this._el.classList.remove(`table-${h.key}`));
        if (hlKey) {
            this._el.classList.add(`table-${hlKey}`);
            this._table.highlight = hlKey;
        } else {
            delete this._table.highlight;
        }
    }

    // ── Private helpers ──────────────────────────────────────────────────────

    /** Strip stale content-type classes and re-apply based on current text */
    _refreshCellTypeClass(cell) {
        ['empty', 'has-url', 'has-code', 'has-path', 'has-command'].forEach(c => cell.classList.remove(c));
        const cls = cellTypeClass(cell.textContent ?? '');
        if (cls) cell.classList.add(cls);
    }

    _buildCell(val, rIdx, cIdx, hlKey) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.row = rIdx;
        cell.dataset.col = cIdx;
        cell.dataset.tableId = this._table._id;

        if (hlKey) cell.classList.add(hlKey);

        this._renderCellContent(cell, val);
        this._bindCellEvents(cell);
        return cell;
    }

    _renderCellContent(cell, val) {
        // Clear existing content-type classes
        HIGHLIGHT_COLORS.forEach(h => { }); // highlights are stored separately
        ['empty', 'has-url', 'has-code', 'has-path', 'has-image', 'has-file'].forEach(c => cell.classList.remove(c));
        cell.contentEditable = 'false';

        if (isImageCell(val)) {
            cell.classList.add('has-image');
            cell.contentEditable = 'false';
            cell.tabIndex = 0;
            const imgPath = getImagePath(val);
            cell.innerHTML = `<img class="cell-image" src="" alt="cell image" />`;
            // Resolve file:// URL for cross-platform display
            this._resolveImageUrl(imgPath).then(url => {
                const img = cell.querySelector('img');
                if (img) img.src = url;
            });
        } else if (isFileCell(val)) {
            cell.classList.add('has-file');
            cell.contentEditable = 'false';
            cell.tabIndex = 0;
            cell.draggable = true;
            const { filePath, originalName, size } = parseFileValue(val);
            const ext = (originalName.split('.').pop() || '').toUpperCase();
            const sizeLabel = formatBytes(size);

            // Use getClass (no per-icon color classes) — CSS forces --text color
            let iconClass = 'icon default-icon'; // generic file icon fallback
            try {
                if (window.fileIcons) {
                    const cls = window.fileIcons.getClass(originalName);
                    if (cls) iconClass = cls;
                }
            } catch { /* keep fallback */ }

            cell.innerHTML = `
                <div class="cell-file-card">
                    <span class="file-icon ${iconClass}" aria-hidden="true"></span>
                    <div class="file-info">
                        <div class="file-name" title="${originalName}">${originalName}</div>
                        <div class="file-meta">${ext} · ${sizeLabel}</div>
                    </div>
                </div>
            `;

            // Mark the parent row for min-height enforcement
            const parentRow = cell.closest('.table-row');
            if (parentRow) parentRow.classList.add('has-file-row');

            // Wire drag-out immediately after building DOM
            cell.addEventListener('dragstart', (e) => {
                e.preventDefault();
                window.electron?.startDrag?.(filePath);
            });

            // Adaptive layout: switch to column (icon top-left / info bottom-right)
            // when the cell is tall (sibling image inflates the row height).
            // ResizeObserver fires on every height change so it stays in sync
            // even when an async image URL resolves and causes the row to grow.
            cell._fileResizeObserver?.disconnect();
            const fileRO = new ResizeObserver(([entry]) => {
                const h = entry.contentRect.height;
                cell.classList.toggle('has-file-tall', h > 60);
            });
            fileRO.observe(cell);
            cell._fileResizeObserver = fileRO;
        } else {
            const cls = cellTypeClass(val);
            if (cls) cell.classList.add(cls);
            cell.contentEditable = 'true';
            cell.textContent = val;
        }
    }

    async _resolveImageUrl(filePath) {
        try {
            if (window.electron?.pathUtils?.toFileUrl) {
                return await window.electron.pathUtils.toFileUrl(filePath);
            }
            return filePath;
        } catch {
            return filePath;
        }
    }

    _bindCellEvents(cell) {
        const { _id } = this._table;

        // Focus / editable
        cell.addEventListener('focus', () => {
            cell.classList.add('focused');
        });

        // Blur → save
        cell.addEventListener('blur', async () => {
            cell.classList.remove('focused');
            if (cell.classList.contains('has-image')) return;
            if (cell.classList.contains('has-file')) return;
            const row = parseInt(cell.dataset.row);
            const col = parseInt(cell.dataset.col);
            const val = cell.textContent ?? '';
            // Re-apply content-type class so color updates immediately on blur
            this._refreshCellTypeClass(cell);
            this._cb.onCellUpdate?.(_id, row, col, val);
        });

        // Enter key blurs (no newlines in cells).
        // Ctrl/Cmd+C with no text selection → copy all cell text.
        // Ctrl/Cmd+X → cut cell content (copy + clear).
        cell.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter') { e.preventDefault(); cell.blur(); }

            if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
                const sel = window.getSelection();
                if (sel && sel.isCollapsed) {
                    // Nothing selected — copy the entire cell value
                    e.preventDefault();
                    const val = cell.textContent.trim();
                    if (val) {
                        navigator.clipboard.writeText(val)
                            .then(() => showToast('copied', 'success'))
                            .catch(() => showToast('copy failed', 'error'));
                    }
                }
                // If text is already selected, let the browser copy the selection.
            }

            if ((e.ctrlKey || e.metaKey) && e.key === 'x') {
                // Image cells: Ctrl+X cuts via _cutCell (browser default would do nothing useful)
                // Text cells with a selection: let browser handle the selection cut natively,
                //   unless nothing is selected — then cut the whole cell.
                if (cell.classList.contains('has-image')) {
                    e.preventDefault();
                    await this._cutCell(cell);
                } else {
                    const sel = window.getSelection();
                    if (sel && sel.isCollapsed) {
                        e.preventDefault();
                        await this._cutCell(cell);
                    }
                    // If text is selected, browser cuts the selection — leave it alone.
                }
            }
        });

        // Paste: text only into text cells, images only into empty cells.
        cell.addEventListener('paste', async (e) => {
            e.preventDefault();
            await this._handlePaste(e, cell);
        });

        // Double-click on text cells → select all text (like a normal editor).
        // Image cells: no action on double-click.
        // File cells: double-click opens the file with system default app.
        cell.addEventListener('dblclick', (e) => {
            if (cell.classList.contains('has-file')) {
                const row = parseInt(cell.dataset.row);
                const col = parseInt(cell.dataset.col);
                const val = this._table.data?.[row]?.[col] ?? '';
                if (isFileCell(val)) {
                    const { filePath } = parseFileValue(val);
                    window.electron?.files?.open?.(filePath);
                }
                return;
            }
            if (cell.classList.contains('has-image')) {
                const row = parseInt(cell.dataset.row);
                const col = parseInt(cell.dataset.col);
                const val = this._table.data?.[row]?.[col] ?? '';
                if (isImageCell(val)) {
                    const imgPath = getImagePath(val);
                    const ext     = imgPath.split('.').pop().toLowerCase();
                    const type    = ['mp4', 'mov', 'webm', 'avi', 'mkv'].includes(ext) ? 'video' : 'image';
                    const mode    = document.documentElement.dataset.mode   || 'dark';
                    const accent  = document.documentElement.dataset.accent || 'purple';
                    window.electron?.media?.preview?.(imgPath, type, { mode, accent });
                }
                return;
            }
            const range = document.createRange();
            range.selectNodeContents(cell);
            const sel = window.getSelection();
            sel?.removeAllRanges();
            sel?.addRange(range);
        });

        // Long-press (500ms): copy cell content.
        // File cells fire onFileLongPress (handled by app.js via context menu).
        // Image/text cells copy directly.
        // Guard: only trigger on primary (left) button — right-click must not start
        // the timer, otherwise pointercancel (which macOS fires on draggable elements
        // when the OS takes over the contextmenu) leaves the timer running and the
        // menu opens a second time ~500ms after the first show.
        let lpFired = false;
        cell.addEventListener('pointerdown', (e) => {
            if (e.button !== 0 || e.ctrlKey) return; // ignore right-click / ctrl+click (macOS) / middle-click
            lpFired = false;
            this._lpTimer = setTimeout(() => {
                lpFired = true;
                if (cell.classList.contains('has-file')) {
                    this._cb.onFileLongPress?.(cell, e.clientX, e.clientY);
                } else {
                    this._copyCell(cell);
                }
            }, 500);
        });
        // Clear timer on pointer release OR cancel (e.g. macOS cancels the pointer
        // on draggable elements when the OS contextmenu takes over).
        const clearLp = (e) => {
            clearTimeout(this._lpTimer);
            if (lpFired) {
                e.stopPropagation();
                lpFired = false;
            }
        };
        cell.addEventListener('pointerup', clearLp);
        cell.addEventListener('pointercancel', clearLp);
        cell.addEventListener('click', (e) => {
            if (lpFired) { e.stopPropagation(); lpFired = false; }
        });

        // Drag-over: show drop-target ring on eligible cells (not image/file — read-only)
        cell.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!cell.classList.contains('has-image') && !cell.classList.contains('has-file')) {
                cell.classList.add('drag-over');
            }
        });

        cell.addEventListener('dragleave', () => {
            cell.classList.remove('drag-over');
        });

        cell.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            cell.classList.remove('drag-over');
            await this._handleDrop(e, cell);
        });

        // Right-click → context menu
        // Also clear the long-press timer here as a safeguard: on macOS, ctrl+click
        // fires pointerdown with button=0 which can slip past the guard above and
        // start the timer. Clearing it here prevents the timer from calling show()
        // a second time ~500ms after contextmenu already showed the menu.
        cell.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            clearTimeout(this._lpTimer);
            this._cb.onContextMenu?.(e, cell);
        });
    }

    async _handlePaste(e, cell) {
        const { _id } = this._table;
        const row = parseInt(cell.dataset.row);
        const col = parseInt(cell.dataset.col);
        const isImg = cell.classList.contains('has-image');
        const isFile = cell.classList.contains('has-file');

        // ── RULE: image cells and file cells are read-only ────────────────────
        if (isImg) {
            showToast('image cells are read-only — long press to copy', 'error');
            return;
        }
        if (isFile) {
            showToast('file cells are read-only — long press to copy', 'error');
            return;
        }

        const items = e.clipboardData?.items ?? [];

        // ── GIF rescue: clipboard converts GIFs to static PNG, so check HTML
        //    for the original animated source URL and fetch the real file ──────
        const hasImageBlob = [...items].some(i => i.type.startsWith('image/'));
        if (hasImageBlob) {
            const existingText = cell.textContent.trim();
            if (existingText) {
                showToast("can't add an image to a text cell — clear it first", 'error');
                return;
            }

            // Look for animated-image URL in HTML clipboard first
            const htmlItem = [...items].find(i => i.type === 'text/html');
            if (htmlItem) {
                const html = await new Promise(r => htmlItem.getAsString(r));
                const srcMatch = html.match(/<img[^>]+src="([^"]+)"/i);
                if (srcMatch) {
                    const srcUrl = srcMatch[1];
                    const isAnimated = /\.(gif|webp|apng)(\?|$)/i.test(srcUrl)
                        || srcUrl.startsWith('data:image/gif');
                    if (isAnimated) {
                        try {
                            const res = await fetch(srcUrl);
                            const blob = await res.blob();
                            const mime = blob.type || 'image/gif';
                            const buf = await blob.arrayBuffer();
                            const path = await window.electron.images.save(
                                Array.from(new Uint8Array(buf)), mime,
                            );
                            const imgVal = `${IMG_PREFIX}${path}`;
                            if (this._table.data[row]) this._table.data[row][col] = imgVal;
                            this._renderCellContent(cell, imgVal);
                            this._cb.onCellUpdate?.(_id, row, col, imgVal);
                            showToast('gif pasted', 'success');
                            return;
                        } catch { /* fall through to normal image paste */ }
                    }
                }
            }

            // Standard image paste (PNG / JPEG / native GIF if clipboard provides it)
            for (const item of items) {
                if (item.type.startsWith('image/')) {
                    const file = item.getAsFile();
                    if (!file) return;
                    const buf = await file.arrayBuffer();
                    try {
                        const path = await window.electron.images.save(Array.from(new Uint8Array(buf)), item.type);
                        const imgVal = `${IMG_PREFIX}${path}`;
                        if (this._table.data[row]) this._table.data[row][col] = imgVal;
                        this._renderCellContent(cell, imgVal);
                        this._cb.onCellUpdate?.(_id, row, col, imgVal);
                        showToast('image pasted', 'success');
                    } catch {
                        showToast('failed to save image', 'error');
                    }
                    return;
                }
            }
        }

        // Check for file blobs (non-image files)
        for (const item of items) {
            if (item.kind === 'file' && !item.type.startsWith('image/')) {
                const existingText = cell.textContent.trim();
                if (existingText) {
                    showToast("clear the cell first", 'error');
                    return;
                }

                const file = item.getAsFile();
                if (!file) continue;

                // Validate file size against settings
                try {
                    const savedSettings = await window.electron?.settings?.get();
                    const maxMB = savedSettings?.general?.maxFileSizeMB ?? 50;
                    if (maxMB > 0 && file.size > maxMB * 1024 * 1024) {
                        showToast(`file too large — max ${maxMB} MB`, 'error');
                        return;
                    }
                } catch { /* proceed if settings unavailable */ }

                const buf = await file.arrayBuffer();
                try {
                    const result = await window.electron.files.save(
                        Array.from(new Uint8Array(buf)),
                        file.name
                    );
                    const fileVal = buildFileValue(result.path, result.originalName, result.size);
                    if (this._table.data[row]) this._table.data[row][col] = fileVal;
                    this._renderCellContent(cell, fileVal);
                    this._cb.onCellUpdate?.(_id, row, col, fileVal);
                    showToast(`attached "${result.originalName}"`, 'success');
                } catch {
                    showToast('failed to save file', 'error');
                }
                return;
            }
        }

        // Plain text paste into text / empty cell
        const text = e.clipboardData?.getData('text/plain') ?? '';
        if (text) {
            cell.textContent = text;
            // Refresh content-type classes so URL/token/path highlight applies immediately
            this._refreshCellTypeClass(cell);
            // Place cursor at end
            const sel = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(cell);
            range.collapse(false);
            sel?.removeAllRanges();
            sel?.addRange(range);
            this._cb.onCellUpdate?.(_id, row, col, text);
        }
    }

    async _handleDrop(e, cell) {
        const { _id } = this._table;
        const row = parseInt(cell.dataset.row);
        const col = parseInt(cell.dataset.col);
        const isImg = cell.classList.contains('has-image');
        const isFile = cell.classList.contains('has-file');

        // ── RULE: image cells and file cells are read-only ────────────────────
        if (isImg) {
            showToast('image cells are read-only — long press to copy', 'error');
            return;
        }
        if (isFile) {
            showToast('file cells are read-only — long press to copy', 'error');
            return;
        }

        const files = [...(e.dataTransfer?.files ?? [])];
        if (!files.length) return;

        const file = files[0]; // one file per cell

        // ── Image drop ───────────────────────────────────────────────────────
        if (file.type.startsWith('image/')) {
            const existingText = cell.textContent.trim();
            if (existingText) {
                showToast("can't add an image to a text cell — clear it first", 'error');
                return;
            }
            const buf = await file.arrayBuffer();
            try {
                const path = await window.electron.images.save(Array.from(new Uint8Array(buf)), file.type);
                const imgVal = `${IMG_PREFIX}${path}`;
                if (this._table.data[row]) this._table.data[row][col] = imgVal;
                this._renderCellContent(cell, imgVal);
                this._cb.onCellUpdate?.(_id, row, col, imgVal);
                showToast('image dropped', 'success');
            } catch {
                showToast('failed to save image', 'error');
            }
            return;
        }

        // ── Non-image file drop ──────────────────────────────────────────────
        const existingText = cell.textContent.trim();
        if (existingText) {
            showToast('clear the cell first', 'error');
            return;
        }

        // Validate file size against settings
        try {
            const savedSettings = await window.electron?.settings?.get();
            const maxMB = savedSettings?.general?.maxFileSizeMB ?? 50;
            if (maxMB > 0 && file.size > maxMB * 1024 * 1024) {
                showToast(`file too large — max ${maxMB} MB`, 'error');
                return;
            }
        } catch { /* proceed if settings unavailable */ }

        const buf = await file.arrayBuffer();
        try {
            const result = await window.electron.files.save(
                Array.from(new Uint8Array(buf)),
                file.name
            );
            const fileVal = buildFileValue(result.path, result.originalName, result.size);
            if (this._table.data[row]) this._table.data[row][col] = fileVal;
            this._renderCellContent(cell, fileVal);
            this._cb.onCellUpdate?.(_id, row, col, fileVal);
            showToast(`attached "${result.originalName}"`, 'success');
        } catch {
            showToast('failed to save file', 'error');
        }
    }

    async _copyCell(cell) {
        const row = parseInt(cell.dataset.row);
        const col = parseInt(cell.dataset.col);
        const val = this._table.data?.[row]?.[col] ?? '';
        if (isFileCell(val)) {
            const { filePath, originalName } = parseFileValue(val);
            if (isTextFile(originalName)) {
                // Text file — copy file contents
                try {
                    const content = await window.electron.files.readText(filePath);
                    await navigator.clipboard.writeText(content);
                    showToast(`copied contents of "${originalName}"`, 'success');
                } catch { showToast('copy failed', 'error'); }
            } else {
                // Binary file — copy file path
                try {
                    await navigator.clipboard.writeText(filePath);
                    showToast(`copied path for "${originalName}"`, 'success');
                } catch { showToast('copy failed', 'error'); }
            }
        } else if (isImageCell(val)) {
            try {
                const imgPath = getImagePath(val);
                const fileName = imgPath.split('/').pop().split('\\').pop() || 'image';
                // GIF / animated: use native file clipboard to preserve animation
                if (/\.(gif|webp|apng)$/i.test(imgPath)) {
                    await window.electron.clipboard.copyFile(imgPath);
                } else {
                    const url = await this._resolveImageUrl(imgPath);
                    const res = await fetch(url);
                    const blob = await res.blob();
                    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
                }
                showToast(`copied "${fileName}"`, 'success');
            } catch { showToast('copy failed', 'error'); }
        } else {
            if (!val.trim()) return; // nothing to copy
            await navigator.clipboard.writeText(val);
            const preview = val.length > 24 ? val.substring(0, 24) + '…' : val;
            showToast(`copied "${preview}"`, 'success');
        }
    }

    async _cutCell(cell) {
        const { _id } = this._table;
        const row = parseInt(cell.dataset.row);
        const col = parseInt(cell.dataset.col);
        const val = this._table.data?.[row]?.[col] ?? '';

        if (!val.trim && !isFileCell(val)) {
            if (!val) return;
        }
        if (!val) return;

        if (isFileCell(val)) {
            const { filePath, originalName } = parseFileValue(val);
            if (isTextFile(originalName)) {
                try {
                    const content = await window.electron.files.readText(filePath);
                    await navigator.clipboard.writeText(content);
                    showToast(`cut contents of "${originalName}"`, 'success');
                } catch {
                    showToast('cut failed', 'error');
                    return;
                }
            } else {
                try {
                    await navigator.clipboard.writeText(filePath);
                    showToast(`cut path for "${originalName}"`, 'success');
                } catch {
                    showToast('cut failed', 'error');
                    return;
                }
            }
            // Delete file from disk
            await window.electron.files.delete(filePath).catch(() => { });
            // Clear cell
            if (this._table.data[row]) this._table.data[row][col] = '';
            this._renderCellContent(cell, '');
            this._cb.onCellUpdate?.(_id, row, col, '');
        } else if (isImageCell(val)) {
            const imgPath = getImagePath(val);
            const fileName = imgPath.split('/').pop().split('\\').pop() || 'image';
            try {
                if (/\.(gif|webp|apng)$/i.test(imgPath)) {
                    await window.electron.clipboard.copyFile(imgPath);
                } else {
                    const url = await this._resolveImageUrl(imgPath);
                    const res = await fetch(url);
                    const blob = await res.blob();
                    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
                }
            } catch {
                showToast('cut failed', 'error');
                return;
            }
            // Delete the image file from disk
            await window.electron.images.delete(imgPath).catch(() => { });
            // Clear cell
            if (this._table.data[row]) this._table.data[row][col] = '';
            this._renderCellContent(cell, '');
            this._cb.onCellUpdate?.(_id, row, col, '');
            showToast(`cut "${fileName}"`, 'success');
        } else {
            if (!val.trim()) return;
            try {
                await navigator.clipboard.writeText(val);
            } catch {
                showToast('cut failed', 'error');
                return;
            }
            const preview = val.length > 24 ? val.substring(0, 24) + '…' : val;
            // Clear cell
            if (this._table.data[row]) this._table.data[row][col] = '';
            cell.textContent = '';
            this._cb.onCellUpdate?.(_id, row, col, '');
            showToast(`cut "${preview}"`, 'success');
        }
    }

    _toggleCheck(rowIndex) {
        const { _id, checked = [] } = this._table;
        const newChecked = [...checked];
        newChecked[rowIndex] = !newChecked[rowIndex];
        this._table = { ...this._table, checked: newChecked };

        // Update checkbox UI
        const box = this._el?.querySelector(`[data-row="${rowIndex}"].cell-check .checkbox`);
        if (box) {
            box.classList.toggle('checked', newChecked[rowIndex]);
            box.textContent = newChecked[rowIndex] ? '\u2713' : '';
        }

        // Update dial
        const total = this._table.data?.length ?? 0;
        this._footer?.updateDial(newChecked, total);

        this._cb.onCheckedUpdate?.(_id, rowIndex, newChecked[rowIndex]);
    }

    // ── Multi-cell drag selection ──────────────────────────────────────────

    /**
     * Build clipboard payload from a NodeList of .cell-selected elements.
     * Returns { rowMap, tsv, html, count }
     */
    _buildSelectionPayload(selectedCells) {
        const rowMap = new Map();
        selectedCells.forEach(c => {
            const r = parseInt(c.dataset.row);
            const col = parseInt(c.dataset.col);
            if (!rowMap.has(r)) rowMap.set(r, new Map());
            const val = this._table.data?.[r]?.[col] ?? '';
            rowMap.get(r).set(col, val);
        });

        const sortedRows = [...rowMap.entries()].sort((a, b) => a[0] - b[0]);

        const cellDisplayText = (v) => {
            if (isImageCell(v)) return '[image]';
            if (isFileCell(v)) return parseFileValue(v).originalName;
            return v;
        };

        const tsv = sortedRows.map(([, colMap]) => {
            const cols = [...colMap.entries()].sort((a, b) => a[0] - b[0]);
            return cols.map(([, v]) => cellDisplayText(v)).join('\t');
        }).join('\n');

        const htmlRows = sortedRows.map(([, colMap]) => {
            const cols = [...colMap.entries()].sort((a, b) => a[0] - b[0]);
            const tds = cols.map(([, v]) => {
                return `<td>${escapeHtml(cellDisplayText(v))}</td>`;
            }).join('');
            return `<tr>${tds}</tr>`;
        }).join('');
        const html = `<table>${htmlRows}</table>`;

        return { rowMap, tsv, html, count: selectedCells.length };
    }

    _installSelectionHandlers() {
        const el = this._el;
        if (!el) return;

        const getCell = (target) => target.closest('.cell[data-row][data-col]');

        // True only after the pointer moves to a different cell — not on a plain click.
        // We defer disabling contentEditable until an actual cross-cell drag begins so
        // that single-click focus and double-click text-selection work naturally.
        let dragActive = false;

        const updateSelection = () => {
            const { startRow, endRow, startCol, endCol } = this._sel;
            const minR = Math.min(startRow, endRow);
            const maxR = Math.max(startRow, endRow);
            const minC = Math.min(startCol, endCol);
            const maxC = Math.max(startCol, endCol);

            el.querySelectorAll('.cell').forEach(c => {
                const r = parseInt(c.dataset.row);
                const col = parseInt(c.dataset.col);
                const inRange = r >= minR && r <= maxR && col >= minC && col <= maxC;
                c.classList.toggle('cell-selected', inRange);
            });
        };

        const clearSelection = () => {
            dragActive = false;
            this._sel.active = false;
            this._sel.startRow = this._sel.endRow = this._sel.startCol = this._sel.endCol = -1;
            el.querySelectorAll('.cell-selected').forEach(c => c.classList.remove('cell-selected'));
            el.querySelectorAll('.cell:not(.has-image):not(.has-file)').forEach(c => (c.contentEditable = 'true'));
        };

        el.addEventListener('mousedown', (e) => {
            const cell = getCell(e.target);
            if (!cell || e.button !== 0) return;

            // File cells handle their own drag (native drag-out) — skip multi-cell selection
            if (cell.classList.contains('has-file')) return;

            dragActive = false;
            this._sel.active = true;
            this._sel.startRow = this._sel.endRow = parseInt(cell.dataset.row);
            this._sel.startCol = this._sel.endCol = parseInt(cell.dataset.col);

            // Do NOT disable contentEditable here — that would break single-click
            // focus and double-click text selection. We only disable it if the user
            // actually drags across multiple cells (handled in mousemove below).
        }, { capture: false });

        el.addEventListener('mousemove', (e) => {
            if (!this._sel.active) return;
            const cell = getCell(e.target);
            if (!cell) return;
            const r = parseInt(cell.dataset.row);
            const c = parseInt(cell.dataset.col);
            if (r !== this._sel.endRow || c !== this._sel.endCol) {
                if (!dragActive) {
                    // Cross-cell drag confirmed — now disable contentEditable to
                    // prevent text-cursor fighting with multi-cell selection.
                    dragActive = true;
                    el.querySelectorAll('.cell').forEach(c => (c.contentEditable = 'false'));
                }
                this._sel.endRow = r;
                this._sel.endCol = c;
                updateSelection();
            }
        });

        const finishSelection = (e) => {
            if (!this._sel.active) return;

            if (!dragActive) {
                // Plain click — clear any leftover multi-cell highlight and let the
                // browser handle focus naturally (contentEditable was never disabled).
                clearSelection();
            } else {
                // End of cross-cell drag — keep visual selection, restore editing.
                dragActive = false;
                this._sel.active = false;
                el.querySelectorAll('.cell:not(.has-image):not(.has-file)').forEach(c => (c.contentEditable = 'true'));
            }
        };

        el.addEventListener('mouseup', finishSelection);

        // Ctrl/Cmd+C copies selected cells as HTML table + TSV fallback
        // Ctrl/Cmd+X copies then clears all selected cells
        document.addEventListener('keydown', async (e) => {
            const selected = el.querySelectorAll('.cell-selected');
            if (!selected.length) return;

            if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
                e.preventDefault();
                const { tsv, html, count } = this._buildSelectionPayload(selected);
                await navigator.clipboard.write([
                    new ClipboardItem({
                        'text/html': new Blob([html], { type: 'text/html' }),
                        'text/plain': new Blob([tsv], { type: 'text/plain' }),
                    })
                ]);
                showToast(`copied ${count} cell${count > 1 ? 's' : ''}`, 'success');
            }

            if ((e.ctrlKey || e.metaKey) && e.key === 'x') {
                e.preventDefault();
                const { rowMap, tsv, html, count } = this._buildSelectionPayload(selected);
                try {
                    await navigator.clipboard.write([
                        new ClipboardItem({
                            'text/html': new Blob([html], { type: 'text/html' }),
                            'text/plain': new Blob([tsv], { type: 'text/plain' }),
                        })
                    ]);
                } catch {
                    showToast('cut failed', 'error');
                    return;
                }
                await this._clearCells(rowMap);
                clearSelection();
                showToast(`cut ${count} cell${count > 1 ? 's' : ''}`, 'success');
            }

            if ((e.key === 'Delete' || e.key === 'Backspace') && !e.ctrlKey && !e.metaKey) {
                const active = document.activeElement;
                if (active && (active.contentEditable === 'true' || active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
                e.preventDefault();
                const { rowMap, count } = this._buildSelectionPayload(selected);
                await this._clearCells(rowMap);
                clearSelection();
                showToast(`cleared ${count} cell${count > 1 ? 's' : ''}`, 'info');
            }

            if (e.key === 'Escape') {
                clearSelection();
            }
        });

        // Click outside clears selection.
        // Exception: clicking inside the context menu must NOT clear selection —
        // batch highlight/clear-highlight reads .cell-selected after the click.
        document.addEventListener('mousedown', (e) => {
            const ctxMenu = document.getElementById('cell-ctx-menu');
            if (!el.contains(e.target) && !(ctxMenu && ctxMenu.contains(e.target))) {
                clearSelection();
            }
        }, { capture: true });
    }

    // ── Clear cells without touching clipboard ──────────────────────────────

    async _clearCells(rowMap) {
        const el = this._el;
        for (const [r, colMap] of rowMap) {
            for (const [col, val] of colMap) {
                if (isImageCell(val)) {
                    await window.electron.images.delete(getImagePath(val)).catch(() => { });
                }
                if (isFileCell(val)) {
                    const { filePath: fp } = parseFileValue(val);
                    await window.electron.files.delete(fp).catch(() => { });
                }
                if (this._table.data[r]) this._table.data[r][col] = '';
                const cellEl = el.querySelector(`.cell[data-row="${r}"][data-col="${col}"]`);
                if (cellEl) {
                    if (cellEl.classList.contains('has-image') || cellEl.classList.contains('has-file')) {
                        this._renderCellContent(cellEl, '');
                    } else {
                        cellEl.textContent = '';
                    }
                }
                this._cb.onCellUpdate?.(this._table._id, r, col, '');
            }
        }
    }

    // ── Bottom-edge resize handle ───────────────────────────────────────────

    _installResizeHandle() {
        const el = this._el;
        if (!el) return;

        const HANDLE_ZONE = 5; // px from bottom edge that acts as drag handle
        const MIN_HEIGHT = 68; // ~1 row + footer

        el.addEventListener('mousemove', (e) => {
            if (this._resizeDrag.active) return;
            const rect = el.getBoundingClientRect();
            const nearBottom = e.clientY >= rect.bottom - HANDLE_ZONE;
            el.style.cursor = nearBottom ? 'ns-resize' : '';
        });

        el.addEventListener('mouseleave', () => {
            if (!this._resizeDrag.active) el.style.cursor = '';
        });

        el.addEventListener('mousedown', (e) => {
            const rect = el.getBoundingClientRect();
            const nearBottom = e.clientY >= rect.bottom - HANDLE_ZONE;
            if (!nearBottom) return;

            e.preventDefault();
            e.stopPropagation();

            // Snapshot the natural (unconstrained) content height BEFORE locking
            const savedH = el.style.height;
            el.style.height = '';
            el.classList.remove('resizable');
            this._resizeDrag.naturalH = el.scrollHeight;
            el.style.height = savedH;
            el.classList.add('resizable');

            this._resizeDrag.active = true;
            this._resizeDrag.startY = e.clientY;
            this._resizeDrag.startH = rect.height;
            el.style.userSelect = 'none';
        }, { capture: false });

        const onMouseMove = (e) => {
            if (!this._resizeDrag.active) return;
            const delta = e.clientY - this._resizeDrag.startY;
            const maxH = this._resizeDrag.naturalH;
            const newH = Math.max(MIN_HEIGHT, Math.min(maxH, this._resizeDrag.startH + delta));
            this._el.style.height = `${newH}px`;
            this._el.style.cursor = 'ns-resize';
        };

        const onMouseUp = (e) => {
            if (!this._resizeDrag.active) return;
            this._resizeDrag.active = false;
            this._el.style.userSelect = '';
            this._el.style.cursor = '';
            const finalH = parseFloat(this._el.style.height) || null;
            if (finalH && finalH !== this._resizeDrag.startH) {
                this._cb.onResize?.(this._table._id, finalH);
            }
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }
}
