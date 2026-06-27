# knotless

**rapid table-based notes** — by [Rapid Thought Labs](https://github.com/RapidThoughtLabs)

![version](https://img.shields.io/badge/version-0.1.1-808080?style=flat-square)
![platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-808080?style=flat-square)
![license](https://img.shields.io/badge/license-AGPL--3.0%20%2B%20Commercial-7c3aed?style=flat-square)
![built with](https://img.shields.io/badge/built%20with-Electron%20%2B%20Vite-808080?style=flat-square)

---

Knotless is a minimalist desktop note-taking app built around structured, table-based notes. No rich text editor. No markdown parser. Just clean, fast, keyboard-friendly tables — stored locally, owned by you.

---

## features

**tables**
- spreadsheet-style cells with live auto-save
- auto-expanding rows as you type
- configurable column count
- inline text formatting (bold, italic, highlight, strikethrough)
- file attachment cells with icon previews
- cell context menu with formatting and highlight options

**sheets**
- multiple sheets to organize tables into workspaces
- rename, reorder, and delete sheets
- move tables between sheets

**search**
- full-text search across all tables in the active sheet
- instant filtering as you type

**import / export**
- export tables and sheets to `.ktl` (native format), CSV, or JSON
- import `.ktl` files with conflict resolution

**theming**
- dark and light mode
- 8 accent colors: `purple` `lime` `red` `pink` `yellow` `blue` `cyan` `orange`
- adjustable font size (11–17px)
- animation level control (`full` / `reduced` / `off`)
- grid mode toggle

**platform**
- native frameless window on macOS and Windows
- macOS traffic light controls
- Windows custom title bar controls
- cross-platform data storage

---

## stack

| layer | technology |
|---|---|
| desktop shell | Electron v28 |
| bundler | Vite v5 |
| database | NeDB (embedded, local) |
| font | JetBrains Mono |
| theme system | RTL Theme Engine (internal) |

---

## getting started

**prerequisites**
- Node.js v18+
- npm

**install**

```bash
git clone https://github.com/RapidThoughtLabs/KnotLess.git
cd KnotLess
npm install
```

**run (dev)**

```bash
npm run electron:dev
```

**build**

```bash
# current platform
npm run electron:build

# macOS (x64 + arm64 dmg)
npm run electron:build:mac

# Windows (nsis + portable)
npm run electron:build:win
```

Output goes to `dist/`.

---

## opening Knotless on macOS

Knotless is **not yet signed with an Apple Developer ID or notarized** (that
requires a paid Apple Developer account). Because the DMG is downloaded from the
internet, macOS adds it to quarantine and Gatekeeper will block the first launch
with a warning like *"Knotless can't be opened because Apple cannot check it for
malicious software."*

This is expected. To open it:

1. Open the `.dmg` and drag **Knotless** into your **Applications** folder.
2. Open **Terminal** and run:

   ```bash
   xattr -cr /Applications/Knotless.app
   ```

3. Launch Knotless normally from Applications.

The `xattr -cr` command removes the download quarantine flag. You only need to do
this once per install. The app is otherwise safe — the warning is purely because
it isn't Apple-notarized yet.

> Make sure you download the right build: **Apple Silicon (M1/M2/M3…)** → the
> `-arm64.dmg`, **Intel Macs** → the plain `.dmg`.

---

## data storage

All data is stored locally — no cloud, no accounts.

| platform | path |
|---|---|
| macOS | `~/Library/Application Support/knotless/` |
| Windows | `%APPDATA%\knotless\` |

---

## keyboard shortcuts

| key | action |
|---|---|
| `Enter` | confirm / exit cell edit |
| `Escape` | close modal or menu |
| `Tab` | move to next cell |

---

## license

Knotless is dual-licensed.

- **open source use** — licensed under AGPL-3.0. Any distribution or hosted use must remain open source under the same terms.
- **commercial use** — if you intend to use Knotless in a proprietary product or hosted service without open-sourcing your code, contact us for a commercial license.

See `LICENSE` for the full AGPL-3.0 text.
For commercial licensing inquiries: [ruchit@rapidthoughtlabs.com](mailto:ruchit@rapidthoughtlabs.com)

---

*rapid thought labs — 2026*
