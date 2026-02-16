# NoteLess UI/UX Redesign Plan

> **Design Philosophy:** Retro-minimalistic with monochromatic gray palette and monospace typography

---

## Overview

This document outlines the complete UI/UX redesign based on the wireframe mockup. The new design moves away from colorful tab themes to a clean, retro-minimalist aesthetic using shades of gray and JetBrains Mono typography.

![Reference Wireframe](/Users/ruchitnannavare/.gemini/antigravity/brain/56271e0d-3bb7-4fed-aa3d-5c3b02f8c935/uploaded_media_1770530475821.jpg)

---

## Design Specifications

### Typography
- **Primary Font:** JetBrains Mono (Google Fonts)
- **Fallback:** `'Courier New', Consolas, monospace`
- **Style:** Clean, retro terminal aesthetic

### Color Palette (Monochromatic Grays)

| Row/Region | Purpose | Color | Hex Value |
|------------|---------|-------|-----------|
| **Row A** | App Header (Logo + Traffic Lights) | Dark Gray | `#1a1a1a` |
| **Row B** | Tab/Filter Bar | Medium Gray | `#2d2d2d` |
| **Row C** | Content Area | Light Gray | `#3a3a3a` |
| **Accent** | Text/Icons | Off-White | `#e0e0e0` |
| **Muted** | Secondary Text | Mid Gray | `#808080` |

### Layout Structure (Based on Wireframe)

```
┌─────────────────────────────────────────────────────────────┐
│ [ROW A - Dark Gray]                                         │
│  ● ● ●  noteless                                            │
├─────────────────────────────────────────────────────────────┤
│ [ROW B - Medium Gray]                                       │
│  # recents ▼                                    [ + add ]   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ [ROW C - Light Gray / Content Area]                         │
│                                                             │
│         (TableNotes will be rendered here)                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Proposed Changes

### Component 1: Fonts & Base Styles

#### [MODIFY] [index.html](file:///Users/ruchitnannavare/GitHub/RapidThoughtLabs/NoteLess/index.html)
- Add Google Fonts link for JetBrains Mono in `<head>`

---

### Component 2: CSS Overhaul

#### [MODIFY] [style.css](file:///Users/ruchitnannavare/GitHub/RapidThoughtLabs/NoteLess/src/style.css)

**Remove:**
- All colorful tab theme variables (Recents blue, Starred peach, Archives green)
- Dynamic color backgrounds based on `data-active-tab`
- Tab-specific color styling

**Add:**
- New monochromatic gray palette CSS variables
- JetBrains Mono font-family declarations
- Three distinct row backgrounds (Row A, B, C)
- Retro-minimalist styling for all elements
- Updated scrollbar styling with gray theme

**New CSS Variables:**
```css
:root {
  /* Gray Palette */
  --row-a-bg: #1a1a1a;      /* Dark - Header */
  --row-b-bg: #2d2d2d;      /* Medium - Tab bar */
  --row-c-bg: #3a3a3a;      /* Light - Content */
  
  /* Text Colors */
  --text-primary: #e0e0e0;
  --text-secondary: #808080;
  --text-muted: #5a5a5a;
  
  /* Accents */
  --border-color: #404040;
  --hover-bg: #444444;
  --active-bg: #505050;
  
  /* Typography */
  --font-mono: 'JetBrains Mono', 'Courier New', Consolas, monospace;
}
```

---

### Component 3: HTML Structure Redesign

#### [MODIFY] [index.html](file:///Users/ruchitnannavare/GitHub/RapidThoughtLabs/NoteLess/index.html)

**Restructure titlebar into two rows:**

**Row A (Header):**
- Traffic lights placeholder (macOS)
- App logo text: "noteless" in lowercase

**Row B (Tab/Filter Bar):**
- Grid icon + "recents" with dropdown indicator
- Spacer
- "+ add" button on right

**Remove:**
- Three separate tab buttons (Recents, Starred, Archives)
- Windows controls (or move to Row A if needed)

---

### Component 4: JavaScript Updates

#### [MODIFY] [main.js](file:///Users/ruchitnannavare/GitHub/RapidThoughtLabs/NoteLess/src/main.js)

**Remove:**
- Tab switching logic between Recents/Starred/Archives
- Dynamic body `data-active-tab` attribute updates
- Tab color theme management

**Add/Update:**
- Dropdown menu toggle for "recents" filter
- "+ add" button click handler (placeholder for now)
- Updated platform detection logic

---

## Visual Mockup

### Current State → New State

```carousel
**BEFORE (Current)**
- Colorful pastel backgrounds
- Three visible tab buttons
- System font (Apple system font)
- Color-coded theming per tab

<!-- slide -->

**AFTER (Redesigned)**
- Monochromatic gray palette
- Single dropdown filter
- JetBrains Mono throughout
- Retro terminal aesthetic
- "+ add" action button
```

---

## Implementation Order

1. **Phase 1: Font Integration**
   - Add JetBrains Mono from Google Fonts
   - Update base typography

2. **Phase 2: CSS Overhaul**
   - Replace color variables with gray palette
   - Style Row A, B, C with distinct backgrounds
   - Update all component styles

3. **Phase 3: HTML Restructure**
   - Convert three-tab layout to dropdown filter
   - Add "+ add" button
   - Restructure into Row A/B/C layout

4. **Phase 4: JavaScript Updates**
   - Remove old tab switching
   - Add dropdown toggle
   - Wire up new interactions

---

## Verification Plan

### Visual Testing (Manual)
1. Run the application with `npm run dev` (or equivalent)
2. Verify three distinct gray rows are visible
3. Confirm JetBrains Mono font is applied to all text
4. Check traffic lights are properly positioned in Row A
5. Verify "+ add" button is visible on the right of Row B

### Platform Testing
- **macOS:** Verify traffic lights space is reserved
- **Windows:** Verify window controls are visible and functional

### Responsive Check
- Resize window to various sizes
- Confirm layout doesn't break

---

## Questions for User Review

1. Should the "recents" dropdown include options for Starred/Archives, or is this a completely new filter system?
2. Do you want the traffic lights inside a pill-shaped container as shown in the wireframe, or just with appropriate spacing?
3. Should the "+ add" button have any specific styling (outlined, filled, icon-only)?
4. Are there any hover/active state effects you'd like (subtle color shifts, underlines, etc.)?

---

## Notes

- The redesign maintains the existing Electron + Vanilla JS architecture
- No framework changes required
- All platform-specific logic (macOS traffic lights, Windows controls) remains intact
