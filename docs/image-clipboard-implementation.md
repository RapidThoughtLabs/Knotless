# Image & Clipboard Interaction Implementation Plan

> **Goal:** Add image thumbnail support, cell data rules, mouse-click copy/paste shortcuts, and a toast notification system to NoteLess cells.

---

## Background

Cells are currently `contentEditable` divs that store text in a 2D string array (`table.data[][]`). There is no image support. All interactions are basic click-to-focus + type. This plan adds a rich image + clipboard layer on top of the existing cell model.

---

## Feature Breakdown

### Feature 1: Image Paste as Thumbnails

**Problem:** Pasted images render at full size inside cells, overwhelming the layout.

**Solution:**
- Intercept `paste` events on cells
- Extract image blob from clipboard (`clipboardData.items`)
- Send the raw image buffer to Electron **main process** via a new IPC channel `image:save`
- Main process writes the file to **`userData/images/`** (e.g. `~/Library/Application Support/noteless/images/`)
- File is saved with a unique name: `img_<timestamp>_<random>.png`
- Store the **absolute file path** in NeDB with an `IMG:` prefix
- Renderer loads thumbnails using `file://` protocol from the saved path
- Display constrained as a thumbnail (`max-width: 80px`, `max-height: 60px`)

**Data Model Change:**
```javascript
// Cell value conventions:
"hello world"                              // Plain text cell
"IMG:/Users/.../noteless/images/img_1707842400_a3f2.png"  // Image cell (file path on disk)
```

**Image Save Flow:**
```
Clipboard Paste → Blob in renderer
    → Convert to ArrayBuffer
    → IPC invoke 'image:save' with buffer
    → Main process writes to userData/images/
    → Returns absolute file path
    → Store "IMG:<path>" in NeDB cell data
    → Render <img src="file://<path>"> as thumbnail
```

> [!NOTE]
> Images are saved to disk in the app's user data directory, keeping the NeDB database lightweight. The `IMG:` prefix in cell values is how we distinguish image cells from text cells during rendering.

### Feature 2: Cell Data Rules

**Rules for what can go into a cell:**
1. **One image per cell** — a cell is either text or one image, never both
2. **Image can't be pasted into a cell that already has text** — paste is blocked, no silent overwrite
3. **Text can't be typed into a cell that has an image** — cell is non-editable when showing image (user must clear image first via long-click copy → then the cell can be reused, or through a future "clear cell" option)

**Implementation:**
- Before accepting a paste, check if cell already has content
- If cell has text → block image paste
- If cell has image → block all paste (text or image)
- If cell is empty → accept either text or image

### Feature 3: Mouse Click Interactions

Three distinct click behaviors on cells:

| Gesture | Condition | Action |
|---------|-----------|--------|
| **Single click** | Any cell | Focus cell, place text cursor (existing behavior) |
| **Double click** | Empty cell | Paste first item from clipboard directly |
| **Double click** | Cell with text | Append clipboard content on new line (`\n` separator) |
| **Long press** (~500ms) | Cell with text | Copy cell text to clipboard + show toast |
| **Long press** (~500ms) | Cell with image | Copy image to clipboard + show toast |

**Double-Click Paste Details:**
- Read from `navigator.clipboard` API
- If clipboard has an image and cell is empty → paste as thumbnail
- If clipboard has text and cell is empty → paste text directly
- If clipboard has text and cell has text → append with `\n`
- The `\n` is stored in the data but **not visually rendered** in the cell's display text (cell shows all content on one visual line, or wraps naturally without visible line breaks)
- If clipboard has image and cell has text → **block** (rule from Feature 2)

**Long-Press Copy Details:**
- Track `mousedown` → start 500ms timer
- If `mouseup` fires before 500ms → cancel (it was a regular click)
- If 500ms elapses → trigger copy action:
  - Text cell: copy `cell.textContent` to clipboard
  - Image cell: copy the image blob to clipboard
- Show toast notification on copy

### Feature 4: Toast Notification Bar

**Location:** Below Row A (the noteless title bar), overlaying the top of Row B. It slides down from under the header.

**Design:**
```
┌────────────────────────────────────────┐
│ ● ● ●         noteless                 │  ← Row A
├────────────────────────────────────────┤
│  ✓ copied "Meeting notes f..."         │  ← Toast (slides down, auto-hides)
├────────────────────────────────────────┤
│ # recents ▼                   [+ add]  │  ← Row B
```

**Behavior:**
- Appears as a slim bar (28px height) that slides down under Row A
- Auto-hides after 2 seconds with a fade-out
- Shows: `copied "First 20 chars..."` for text
- Shows: `copied image_name.png` for images (or `copied image` if no name)
- Uses the same `--font-mono` and dark gray palette
- Only one toast visible at a time (new toast replaces old)

---

## Proposed Changes

### Component 1: Cell Rendering & Data Model

#### [MODIFY] [main.js](file:///Users/ruchitnannavare/GitHub/RapidThoughtLabs/NoteLess/src/main.js)

**In `createTableElement()` (line ~273):**
- Update cell creation loop to detect `IMG:` prefix in cell values
- If cell value starts with `IMG:` → render an `<img>` element instead of text
- Make image cells `contentEditable = false`
- Apply thumbnail CSS class to image

**New function: `renderCellContent(cell, cellValue)`**
- Checks if value is `IMG:...` or plain text
- Sets cell innerHTML accordingly
- Toggles `contentEditable` based on content type

---

### Component 2: Image Save Pipeline (Electron Side)

#### [MODIFY] [main.js (Electron)](file:///Users/ruchitnannavare/GitHub/RapidThoughtLabs/NoteLess/electron/main.js)

- Create `userData/images/` directory on app startup if it doesn't exist
- Add IPC handler `image:save`:
  - Receives image buffer (ArrayBuffer) from renderer
  - Generates unique filename: `img_<timestamp>_<4char_random>.png`
  - Writes buffer to `userData/images/<filename>`
  - Returns the absolute file path
- Add IPC handler `image:delete`:
  - Receives file path, deletes the image from disk
  - Used when a cell is cleared or a table is deleted

#### [MODIFY] [preload.js](file:///Users/ruchitnannavare/GitHub/RapidThoughtLabs/NoteLess/electron/preload.js)

- Expose new image methods under `window.electron.images`:
  - `save(buffer)` → invokes `image:save`, returns file path
  - `delete(filePath)` → invokes `image:delete`

---

### Component 3: Paste Interception

#### [MODIFY] [main.js](file:///Users/ruchitnannavare/GitHub/RapidThoughtLabs/NoteLess/src/main.js)

**In `createTableElement()` cell creation loop:**
- Add `paste` event listener to each cell
- In the paste handler:
  1. Check `event.clipboardData.items` for image types
  2. If image found:
     - Check cell rules (block if cell has text/image)
     - Read blob as `ArrayBuffer`
     - Send buffer to main process via `window.electron.images.save(buffer)`
     - Receive file path back
     - Store `IMG:<file_path>` in cell data via `saveCellData()`
     - Re-render cell with `<img>` thumbnail
  3. If text found:
     - Check cell rules (block if cell has image)
     - Allow default paste behavior

---

### Component 4: Mouse Click Shortcuts

#### [MODIFY] [main.js](file:///Users/ruchitnannavare/GitHub/RapidThoughtLabs/NoteLess/src/main.js)

**In `createTableElement()` cell creation loop:**

**Double-click handler:**
- Add `dblclick` event listener
- Read clipboard via `navigator.clipboard.read()` 
- Apply paste rules from Feature 3 table above
- Call `saveCellData()` after modification

**Long-press handler:**
- Add `mousedown` → start timer (`longPressTimer`)
- Add `mouseup` / `mouseleave` → clear timer
- If timer fires (500ms):
  - Prevent default click behavior
  - Read cell content
  - If text: `navigator.clipboard.writeText(text)`
  - If image: extract base64, convert to blob, write to clipboard
  - Call `showToast()` with appropriate message

---

### Component 5: Toast Notification

#### [MODIFY] [index.html](file:///Users/ruchitnannavare/GitHub/RapidThoughtLabs/NoteLess/index.html)

- Add toast element after Row A:
```html
<div id="toast-bar" class="toast-bar hidden">
  <span id="toast-message"></span>
</div>
```

#### [MODIFY] [style.css](file:///Users/ruchitnannavare/GitHub/RapidThoughtLabs/NoteLess/src/style.css)

- Add `.toast-bar` styles: positioned below Row A, slim height, slide-down animation, auto-hide
- Add `.toast-bar.visible` for the revealed state
- Smooth CSS transition for slide-in / fade-out

#### [MODIFY] [main.js](file:///Users/ruchitnannavare/GitHub/RapidThoughtLabs/NoteLess/src/main.js)

- Add `showToast(message)` function:
  - Set toast text
  - Add `visible` class  
  - Set 2-second timeout to remove `visible` class
  - Cancel previous timeout if new toast triggers

---

### Component 6: Image Thumbnail Styles

#### [MODIFY] [style.css](file:///Users/ruchitnannavare/GitHub/RapidThoughtLabs/NoteLess/src/style.css)

New styles:
```css
/* Image cell */
.table-cell.image-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: default;
  padding: 6px;
}

.table-cell.image-cell img {
  max-width: 80px;
  max-height: 60px;
  object-fit: contain;
  border-radius: 2px;
  image-rendering: auto;
}

/* Long-press visual feedback */
.table-cell.long-pressing {
  outline: 2px solid #888888;
  outline-offset: -2px;
}
```

---

## Implementation Order

1. **Toast notification** — standalone utility, no dependencies
2. **Image save pipeline** — IPC handler + preload bridge for writing images to disk
3. **Cell rendering update** — detect `IMG:` prefix, render thumbnails from file path
4. **Paste interception** — capture image paste, enforce cell rules, save to disk via IPC
5. **Double-click paste** — clipboard read on double-click
5. **Long-press copy** — timer-based copy with toast feedback
6. **Polish** — test edge cases, refine thumbnail sizing, toast timing

---

## Verification Plan

### Manual Testing

Since this is an Electron app with clipboard interactions that can't easily be unit-tested, all verification is manual:

1. **Start the app:**
   ```bash
   npm run electron:dev
   ```

2. **Test image paste as thumbnail:**
   - Copy an image to clipboard (e.g. screenshot or right-click → Copy Image from browser)
   - Click on an empty cell → press `Cmd/Ctrl+V`
   - ✅ Verify image appears as a small thumbnail (not full size)
   - ✅ Verify cell is no longer text-editable (can't type into it)
   - Close and reopen app → verify image persists

3. **Test cell data rules:**
   - Type text in a cell → try pasting image → ✅ image paste should be blocked
   - Paste image in empty cell → try typing text → ✅ text input should be blocked
   - Paste image in empty cell → try pasting another image → ✅ should be blocked

4. **Test double-click paste:**
   - Copy text "hello" to clipboard
   - Double-click an empty cell → ✅ "hello" should appear in cell
   - Copy text "world" to clipboard
   - Double-click the same cell → ✅ cell should show "helloworld" (with hidden `\n`)
   - Copy an image to clipboard
   - Double-click an empty cell → ✅ image thumbnail should appear

5. **Test long-press copy:**
   - Type "test data" in a cell
   - Press and hold mouse on that cell for ~1 second
   - ✅ Toast should appear: `copied "test data"`
   - Open a text editor → paste → ✅ "test data" should appear
   - Long-press on an image cell
   - ✅ Toast should appear: `copied image`

6. **Test toast notifications:**
   - Trigger any copy action
   - ✅ Toast slides down below header bar
   - ✅ Toast auto-hides after ~2 seconds
   - Trigger two copies quickly → ✅ second toast replaces first

---

## Open Questions / Decisions

1. **Max thumbnail dimensions:** Proposed `80×60px` display. Is this reasonable or should cells accommodate larger previews?
2. **Long-press duration:** 500ms proposed. Should it be shorter (300ms) or longer (700ms)?
3. **Double-click on image cell:** Currently blocks all paste. Should double-click on an image cell replace the image?
4. **Image cleanup:** When a table is deleted, should we also delete its images from disk? (Proposed: yes)
