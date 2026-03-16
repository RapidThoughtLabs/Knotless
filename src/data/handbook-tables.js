/**
 * Handbook Tables — RTL Knotless V2
 *
 * Defines the content injected into the "handbook" sheet on first launch.
 * Each entry maps directly to a table document created via db().create().
 *
 * To update the handbook, edit the data arrays here and bump HANDBOOK_VERSION.
 * Users with auto-update on will get the new version on next app launch.
 * Users can always regenerate manually via Settings → Handbook → generate.
 *
 * Formatting: **text** = bold, *text* = italic (rendered by table-card.js)
 * highlight: table-level color badge (hl-lime/red/pink/purple/yellow/blue/cyan/orange)
 */

export const HANDBOOK_VERSION = '1.5';

export const HANDBOOK_TABLES = [

    // ── 1. Welcome ───────────────────────────────────────────────────────────
    {
        name: 'welcome to knotless',
        columns: 2,
        pinned: true,
        highlight: 'hl-blue',
        data: [
            ['**topic**',               '**description**'],
            ['**what is knotless**',    'your offline-first digital organizer — tables, not folders. everything lives on your machine, *zero cloud*.'],
            ['**philosophy**',          'zero cloud, zero noise. distraction-free capture with complete data sovereignty.'],
            ['**core concept**',        'everything is a cell. text, images, files, commands — all live in table cells inside sheets.'],
            ['**sheets**',              'containers that group related tables. think workspaces or projects.'],
            ['**tables**',              'grids of cells that *auto-save as you type*. no save button, ever.'],
            ['**artifacts**',           'images, gifs, videos, and files embedded directly in cells. your offline library.'],
            ['**this handbook**',       'a living reference — regenerate it anytime from *settings → handbook → generate*.'],
        ],
    },

    // ── 2. What's New ────────────────────────────────────────────────────────
    {
        name: "what's new",
        columns: 2,
        pinned: true,
        highlight: 'hl-cyan',
        data: [
            ['**update**',                          '**details**'],
            ['**table highlighting**',              'give any table a colored name badge — table options (⋯) → highlight. 8 colors. great for at-a-glance status across a sheet.'],
            ['**move table to sheet**',             'relocate a table without recreating it — table options (⋯) → move to → pick a sheet.'],
            ['**checklist header exclusion**',      'exclude the first row from checklist checkboxes and % calc — table options (⋯) → checklist → exclude first row.'],
            ['**table controls position**',         'move the table name bar and controls above or below the grid — settings → general → table controls.'],
            ['**expanded highlight palette**',      'cell highlights now have 8 colors: lime, red, pink, purple, yellow, blue, cyan, orange.'],
            ['**file not found modal**',            'opening a missing file or image now shows a dialog — dismiss or clear the dead cell reference.'],
            ['**copy strips formatting**',          'copying cells with **bold** or *italic* markers now strips the asterisks — clean plain text on your clipboard.'],
            ['**sharper search**',                  'search is now tighter — fewer noisy matches, minimum 2 characters required.'],
        ],
    },

    // ── 3. Cell Types in Action ──────────────────────────────────────────────
    {
        name: 'cell types in action',
        columns: 3,
        data: [
            ['**type**',            '**live example**',                     '**try it**'],
            ['**text**',            'just type anything here',              'click and type — auto-saves on blur'],
            ['**url**',             'https://github.com',                   'right-click → open in browser'],
            ['**command**',         'git status',                           'right-click → ▶ run'],
            ['**file path**',       '~/Documents',                          'right-click → reveal in finder'],
            ['**code**',            '`console.log("hello")`',               'backtick-wrapped = code styling'],
            ['**api token**',       'sk-1234abcdef...',                     'auto-detected — visually distinct for safety'],
            ['**image**',           '← drag any image or gif here →',       'drag & drop or paste from clipboard'],
            ['**file**',            '← drag any file here →',               'long-press to copy text file contents'],
            ['**bold text**',       '**this is bold**, *this is italic*',   'renders styled at rest — cmd/ctrl+B / cmd/ctrl+I to format'],
        ],
    },

    // ── 4. Keyboard Shortcuts ────────────────────────────────────────────────
    {
        name: 'keyboard shortcuts',
        columns: 3,
        data: [
            ['**shortcut**',                        '**action**',                           '**context**'],
            ['**cmd / ctrl + F**',                  'open search bar',                      'global'],
            ['**cmd / ctrl + G**',                  'next search result',                   'while searching'],
            ['**shift + cmd / ctrl + G**',          'previous search result',               'while searching'],
            ['**enter**',                           'confirm and save cell',                'while editing a cell'],
            ['**escape**',                          'close modal / cancel search',          'modals, search bar'],
            ['**cmd / ctrl + B**',                  'bold selected text',                   'while editing a text cell'],
            ['**cmd / ctrl + I**',                  'italicize selected text',              'while editing a text cell'],
            ['**cmd / ctrl + C** (no selection)',   'copy entire cell value',               'any text cell'],
            ['**cmd / ctrl + X** (no selection)',   'cut entire cell value',                'any text cell'],
            ['**double-click**',                    'select all text in cell',              'text cells'],
            ['**long-press (500ms)**',              'copy cell content',                    'any cell with content'],
            ['**right-click**',                     'open context menu',                    'any cell'],
            ['**drag & drop file**',                'attach file or image to cell',         'any empty cell'],
        ],
    },

    // ── 5. Context Menu Actions ──────────────────────────────────────────────
    {
        name: 'context menu actions',
        columns: 3,
        highlight: 'hl-red',
        data: [
            ['**action**',          '**what it does**',                                                                         '**available when**'],
            ['**copy**',            'copy cell text to clipboard',                                                              'any cell with text'],
            ['**paste**',           'paste clipboard text or image into cell',                                                  'any cell'],
            ['**clear**',           'empty the cell content',                                                                   'any cell with content'],
            ['**highlight**',       'apply a color swatch — 8 colors: lime, red, pink, purple, yellow, blue, cyan, orange',     'any cell'],
            ['**clear highlight**', 'remove the cell highlight color',                                                          'highlighted cells only'],
            ['**delete row**',      'remove the entire row from the table',                                                     'any row'],
            ['**open in browser**', 'launch the URL in your default browser',                                                   'URL cells'],
            ['**▶ run**',           'execute the shell command in a terminal',                                                   'command cells'],
            ['**reveal in finder**','show the file or path in Finder / Explorer',                                               'file and path cells'],
            ['**open file**',       'launch the file with its default app',                                                     'file cells'],
            ['**copy file**',       'copy the file to your system clipboard',                                                   'file cells'],
            ['**copy path**',       'copy the file path as plain text',                                                         'file and image cells'],
            ['**copy contents**',   'copy the text content of the file',                                                       'text-type files: txt, md, json, py…'],
        ],
    },

    // ── 6. Sheet & Table Management ──────────────────────────────────────────
    {
        name: 'sheet & table management',
        columns: 2,
        highlight: 'hl-lime',
        data: [
            ['**action**',                          '**how**'],
            ['**create a sheet**',                  'click *+ add sheet* in the topbar sheet selector'],
            ['**switch sheets**',                   'click any sheet name in the topbar dropdown'],
            ['**rename a sheet**',                  'right-click the sheet name → rename'],
            ['**delete a sheet**',                  'right-click the sheet name → delete sheet (removes all its tables)'],
            ['**create a table**',                  'click the *+ add* button at the bottom of the content area'],
            ['**rename a table**',                  'click the table name in the footer bar — it\'s editable inline'],
            ['**pin a table**',                     'table options menu (⋯) → pin — floats the table to the top'],
            ['**toggle checklist mode**',           'table options menu (⋯) → checklist — adds checkboxes + % badge'],
            ['**exclude header from checklist**',   'table options (⋯) → checklist → exclude first row — skips row 0 from checkboxes and % calc'],
            ['**add / remove columns**',            'table options menu (⋯) → adjust column count (1–100)'],
            ['**move table to sheet**',             'table options (⋯) → move to → select destination sheet'],
            ['**highlight a table**',               'table options (⋯) → highlight → pick a color — wraps the table name in a colored badge'],
            ['**clear table highlight**',           'table options (⋯) → clear table highlight'],
            ['**delete a table**',                  'table options menu (⋯) → delete table'],
            ['**reorder pinned tables**',           'use the ↑ move up button on pinned tables'],
            ['**collapse / expand**',               'click the collapse arrow on any table card to fold it'],
            ['**table controls position**',         'settings → general → table controls — place the name bar above (header) or below (footer) the grid'],
        ],
    },

    // ── 7. Use Case Ideas ────────────────────────────────────────────────────
    {
        name: 'use case ideas',
        columns: 2,
        highlight: 'hl-yellow',
        data: [
            ['**use case**',                '**how to set it up**'],
            ['**project manager**',         'one sheet per project. tables for tasks, links, notes, and blockers. use highlights as status: *red=blocked, yellow=in review, lime=done*. highlight the table itself to mark urgency.'],
            ['**meme & gif collection**',   'drag images and gifs straight into cells. one sheet per category (reaction gifs, screenshots, memes). long-press any cell to copy and paste into discord.'],
            ['**dev command bank**',        'store frequently-used commands: `cd ~/project && npm run dev`. right-click → *▶ run* to fire them instantly. *prefix with `cd /path/to/project &&`* to run in the right folder.'],
            ['**api token vault**',         'paste tokens (sk-..., ghp_..., AKIA...) — they auto-style for visual safety. 100% local, never leaves your machine.'],
            ['**test attachment tray**',    'drag test plans, screenshots, and log files into a table for a project. export as .ktl.zip to share everything as a single file.'],
            ['**quick journal**',           'single-column table. one row per thought or daily log. enable checklist mode for to-do tracking with a live % badge.'],
            ['**link library**',            'paste URLs — right-click → open in browser. organize by topic across tables. never lose a useful link again.'],
            ['**snippet stash**',           'code wrapped in backticks gets code styling. store SQL queries, regex patterns, one-liners, and prompts for instant copy.'],
        ],
    },

    // ── 8. Weekly Task Checklist ──────────────────────────────────────────────
    // Demonstrates checklist mode: enable it on any table via the (⋯) menu.
    // Check off rows as you complete tasks — the footer shows a live % badge.
    {
        name: 'weekly task checklist',
        columns: 4,
        checklist: true,
        highlight: 'hl-orange',
        // Two rows pre-checked to show what completion looks like
        checked: [false, true, true, false, false, false, false, false, false],
        data: [
            ['**task**',                    '**mon / tue**',    '**wed / thu**',    '**fri**'],
            ['team standup',                '9:00 am',          '9:00 am',          'async update'],
            ['review pull requests',        '2:00 pm',          '—',                '11:00 am'],
            ['deep work block',             '10am – 12pm',      '10am – 12pm',      '10am – 1pm'],
            ['1-on-1 with manager',         'mon 3:00 pm',      '—',                '—'],
            ['deploy to staging',           '—',                'wed 3:00 pm',      '—'],
            ['write weekly update',         '—',                '—',                'before 5pm'],
            ['team retro',                  '—',                '—',                'fri 4:00 pm'],
            ['clear inbox',                 'end of day',       'end of day',       'end of day'],
        ],
    },

    // ── 9. Export & Import ───────────────────────────────────────────────────
    {
        name: 'export & import',
        columns: 3,
        data: [
            ['**format**',          '**what\'s included**',                                                                         '**best for**'],
            ['**.ktl.json**',       'text-only snapshot — images and files become `[image: name]` placeholders.',                   'sharing text, archival, quick backup'],
            ['**.ktl.zip**',        '*full bundle*: JSON + all images & files + a self-contained offline HTML viewer.',             'complete backup — *also directly importable back into knotless*'],
            ['**html viewer**',     'self-contained HTML inside the zip — works offline in any browser, read-only.',                'viewing an export without knotless installed'],
            ['**how to export**',   'sheet options (⋯) → export → choose json or zip → pick a save location.',                     '—'],
            ['**how to import**',   'topbar → import button → select a .ktl.json *or* .ktl.zip — knotless reads both directly.',   '—'],
            ['**blob size cap**',   'default 250 MB total per zip export. change it in settings.json directly.',                    'increase if you have large attachments'],
        ],
    },

    // ── 10. Tips & Tricks ────────────────────────────────────────────────────
    {
        name: 'tips & tricks',
        columns: 2,
        data: [
            ['**tip**',                                 '**details**'],
            ['**command directory trick**',             'prefix shell commands with `cd /path/to/folder &&` before your command to run it exactly where you want: `cd ~/project && git pull`.'],
            ['**cell highlight as status**',            'use the 8 highlight colors as a personal kanban: *red=blocked, orange=todo, yellow=review, lime=done, blue=reference, pink=flagged, purple=waiting, cyan=note*.'],
            ['**table highlight for categories**',      'use table-level highlights (⋯ → highlight) to color-code entire tables — mark urgency, type, or status at a glance across a whole sheet.'],
            ['**search across all sheets**',            'toggle *all sheets* in the search bar to find content anywhere in your entire knotless.'],
            ['**bulk organize**',                       'use sheets to group related tables — one sheet per project, client, or context.'],
            ['**checklist power**',                     'enable checklist mode on any table via the (⋯) menu — adds checkboxes and a live % completion badge in the footer.'],
            ['**file as knowledge**',                   'drop reference PDFs, code files, and docs into cells — your personal offline library without any cloud.'],
            ['**export for sharing**',                  'use .ktl.zip to send a sheet — the recipient can open it in any browser with the bundled HTML viewer, or import it directly back into knotless.'],
            ['**handbook regeneration**',               'edit this handbook however you like — get a fresh copy anytime from *settings → handbook → generate*.'],
            ['**bold & italic**',                       'use **bold** and *italic* markers in any cell. cmd/ctrl+B and cmd/ctrl+I wrap your selection automatically. renders styled at rest.'],
        ],
    },

];
