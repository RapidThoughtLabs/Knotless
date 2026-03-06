# Windows Controls Refactor — Collapsible Corner Tile

**Branch:** `windows-action-button`
**Scope:** Windows-only (`isWindows` guard preserved)
**Files touched:** `src/components/topbar.js`, `src/style.css`

---

## Goal

Replace the standard three-button row in the top-right corner with a two-state collapsible tile:

| State | Description |
|-------|-------------|
| **Idle** | A single square tile anchored flush to the top-right corner, filled with the app accent color. No icon. Height = topbar height (42 px). |
| **Hover / Expanded** | On mouse-enter, the tile expands leftward to reveal three equal-width buttons — Minimize (C), Maximize (B), Close (A) — with their respective icons. |

The animation expands to the left only; the right edge is fixed to the window corner.

---

## Visual Reference

```
IDLE STATE (42 × 42 px):
┌────────┐
│ ██████ │  ← solid accent color, no icon
└────────┘
    ^corner

HOVER / EXPANDED STATE (126 × 42 px):
┌──────┬──────┬──────┐
│  –   │  □   │  ×   │  ← icons visible, C | B | A
└──────┴──────┴──────┘
 C=min  B=max  A=close
```

- **C (Minimize):** `–` dash SVG, neutral hover (surface2)
- **B (Maximize):** `□` square SVG, neutral hover (surface2)
- **A (Close):** `×` SVG, red hover (`#e81123`) — also the idle accent tile

---

## State Transitions

### Idle → Expanded
1. Mouse enters `.windows-controls` container
2. Container width transitions: `42px → 126px` over 200 ms (easing: `cubic-bezier(0.4, 0, 0.2, 1)`)
3. Buttons C and B slide into view from beneath the left clip edge (inner is anchored `right: 0`)
4. SVG icons fade in with a 80 ms delay (after expansion starts)
5. Close button background transitions from `var(--accent)` to transparent

### Expanded → Idle
1. Mouse leaves container
2. Reverse: icons fade out first (no delay), then width collapses back to 42 px
3. Close button regains accent background

---

## Architecture

### Layout Strategy

`.windows-controls` will be taken **out of the flex flow** via `position: absolute; right: 0; top: 0`. This:
- Pins it permanently to the top-right corner regardless of topbar padding
- Avoids shifting the rest of the topbar when the tile expands
- Lets it expand leftward naturally (right edge fixed, left edge grows)

The topbar's right padding will be set to `42px` on Windows so `topbar-actions` (add + settings buttons) are never overlapped by the idle tile.

### Inner container

A `win-controls-inner` wrapper inside `.windows-controls` is `position: absolute; right: 0; top: 0` with all three buttons as flex children. As the outer container widens, the inner (anchored right) reveals buttons from right to left.

```
Outer clip box  ←  expands leftward
┌──────────────────┐
│ inner (126px)    │
│  [C][B][A] ──── right:0
└──────────────────┘
```

---

## Implementation Steps

### Step 1 — HTML (`src/components/topbar.js`)

Replace the Windows controls template block (lines 61–73) with the new two-layer structure:

```html
${isWindows ? `
<div class="windows-controls" id="windows-controls">
  <div class="win-controls-inner">
    <button class="win-btn win-minimize" id="win-min" title="Minimize">
      <svg width="10" height="1" viewBox="0 0 10 1">
        <rect width="10" height="1" fill="currentColor"/>
      </svg>
    </button>
    <button class="win-btn win-maximize" id="win-max" title="Maximize">
      <svg width="10" height="10" viewBox="0 0 10 10">
        <rect width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.2"/>
      </svg>
    </button>
    <button class="win-btn win-close" id="win-close" title="Close">
      <svg width="10" height="10" viewBox="0 0 10 10">
        <path d="M0 0L10 10M10 0L0 10" stroke="currentColor" stroke-width="1.2"/>
      </svg>
    </button>
  </div>
</div>
` : ''}
```

No JS binding changes required — IDs are preserved (`#win-min`, `#win-max`, `#win-close`).

---

### Step 2 — CSS (`src/style.css`)

#### 2a. Topbar — add position context + Windows right padding

```css
.topbar {
  position: relative;          /* ADD: anchor for absolute children */
}

/* Windows: reserve space on the right for the idle tile */
.topbar.win-topbar {
  padding-right: 50px;         /* 42px tile + 8px breathing room */
}
```

> **Note:** The `win-topbar` class will be added to the topbar element by `topbar.js` when `isWindows` is true (Step 3).

#### 2b. Replace the old `.windows-controls` block (lines 231–261) with:

```css
/* ── Windows collapsible corner controls ─────────────────────────────────── */
.windows-controls {
  position: absolute;
  right: 0;
  top: 0;
  height: 42px;           /* = topbar height */
  width: 42px;            /* idle: single tile */
  overflow: hidden;
  transition: width 200ms cubic-bezier(0.4, 0, 0.2, 1);
  -webkit-app-region: no-drag;
  z-index: 20;
}

.windows-controls:hover {
  width: 126px;           /* expanded: 3 × 42px */
}

/* Inner container anchored to right edge */
.win-controls-inner {
  position: absolute;
  right: 0;
  top: 0;
  display: flex;
  height: 100%;
}

/* Base button */
.win-btn {
  width: 42px;
  height: 42px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--text-mid);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

/* Idle: close tile is accent-colored, covers the entire visible area */
.win-close {
  background: var(--accent);
  color: var(--accent-txt);
}

/* Icons: hidden in idle state */
.windows-controls svg {
  opacity: 0;
  transition: opacity 80ms ease;
}

/* Expanded: icons fade in, close reverts to neutral, hover states activate */
.windows-controls:hover svg {
  opacity: 1;
  transition: opacity 120ms ease 80ms;  /* 80ms delay after expansion */
}

.windows-controls:hover .win-close {
  background: transparent;
  color: var(--text-mid);
}

.windows-controls:hover .win-btn:hover {
  background: var(--surface2);
  color: var(--text);
}

.windows-controls:hover .win-close:hover {
  background: #e81123;
  color: #fff;
}
```

---

### Step 3 — JS (`src/topbar.js`)

Two minor additions to the `create()` method:

1. **Add `win-topbar` class** to the topbar element when on Windows so the CSS padding rule applies:
   ```js
   if (isWindows) el.classList.add('win-topbar');
   ```

2. **Optional — maximize icon toggle:** Listen to `onWindowMaximized` to swap the maximize button SVG between the restore and maximize icons. This gives visual feedback when the window is maximized.
   ```js
   // In _bind(), after Windows controls wiring:
   if (window.electron?.isWindows) {
     window.electron.onWindowMaximized?.((isMax) => {
       const svg = el.querySelector('#win-max svg');
       if (!svg) return;
       svg.innerHTML = isMax
         ? '<path d="M2 0H10V8M0 2H8V10H0V2Z" stroke="currentColor" fill="none" stroke-width="1.2"/>'  // restore
         : '<rect width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.2"/>';        // maximize
     });
   }
   ```

---

## File Changes Summary

| File | Change |
|------|--------|
| `src/components/topbar.js` | Replace Windows controls HTML template; add `win-topbar` class; optional maximize icon swap |
| `src/style.css` | Add `position: relative` to `.topbar`; add `.topbar.win-topbar` padding rule; replace entire Windows controls CSS block |

---

## Edge Cases & Considerations

| Case | Handling |
|------|----------|
| Mouse leaves while mid-expansion | CSS transition reverses immediately; icon opacity falls before collapse completes |
| Keyboard/focus access | Buttons remain focusable by Tab; visible icon content appears when `.windows-controls` receives `:focus-within` (add `:focus-within` selector alongside `:hover`) |
| High-DPI displays | SVGs are resolution-independent; the 42px tile is in CSS pixels |
| Window maximized state | Maximize icon optionally swaps (Step 3 optional) |
| Drag region conflict | `.windows-controls` has `-webkit-app-region: no-drag`; parent drag region sits under it (`pointer-events: none`) |
| Topbar actions overlap | Handled by `padding-right: 50px` on `.topbar.win-topbar` (Step 2a) |

---

## Checklist

- [ ] Create `win-controls-inner` wrapper in HTML
- [ ] Add `position: relative` to `.topbar`
- [ ] Add `.topbar.win-topbar` right padding rule
- [ ] Replace `.windows-controls` CSS block with new collapsible version
- [ ] Add `win-topbar` class in `topbar.js` `create()`
- [ ] Verify no overlap between topbar-actions and expanded controls
- [ ] Test idle tile accent color matches current theme
- [ ] Test expand/collapse animation feel (adjust duration/easing if needed)
- [ ] Test all three button click actions still fire IPC correctly
- [ ] (Optional) Add `:focus-within` alongside `:hover` for keyboard accessibility
- [ ] (Optional) Implement maximize icon swap
