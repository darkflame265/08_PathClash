# Tablet Layout Fix — Design Spec
Date: 2026-04-15

## Problem

On tablets (768~1024px), the game UI breaks: elements stretch abnormally and positions shift. Root cause is `.app { width: 100vw }` — internal vw-based units calculate against the full viewport width, causing oversized elements on tablet screens.

Mobile and desktop are unaffected because:
- Mobile: narrow viewport, vw units stay small
- Desktop: centered card UI with existing max-width works fine

## Goal

Three-tier responsive behavior:
- **Mobile (<768px)**: full-screen vertical UI, current design unchanged
- **Tablet (768~1024px)**: centered fixed-width game column (max 520px), black letterbox sides (Clash Royale style)
- **Desktop (>1024px)**: current centered card UI maintained

## Approach: Outer + Inner Wrapper

Split the single `.app` container into two layers.

### HTML Structure (App.tsx)

```
<div class="app-outer [app-outer--lobby | app-outer--game]">
  <div class="app-inner">
    ... existing lobby/game content ...
  </div>
</div>
```

Replace current:
```tsx
<div className={`app ${view === "lobby" ? "app-lobby" : "app-game"}`}>
```

With:
```tsx
<div className={`app-outer ${view === "lobby" ? "app-outer--lobby" : "app-outer--game"}`}>
  <div className="app-inner">
```

### CSS Changes

**index.css** — ensure full-height chain:
```css
html, body, #root {
  height: 100%;
}
```

**App.css** — redefine container structure:

```css
/* Outer: full screen, black bg for letterbox */
.app-outer {
  width: 100%;
  height: 100%;
  min-height: 100dvh;
  background: #000;
  display: flex;
  align-items: flex-start;
  justify-content: center;
}

.app-outer--lobby {
  align-items: center;
}

/* Inner: constrained viewport — the "game column" */
.app-inner {
  width: 100%;
  height: 100%;
  min-height: 100dvh;
  overflow: hidden;
  background: var(--bg, #12181B);
}

/* Mobile: full width, no constraint */
@media (max-width: 767px) {
  .app-inner {
    max-width: 100%;
  }
}

/* Tablet: letterbox */
@media (min-width: 768px) and (max-width: 1024px) {
  .app-inner {
    max-width: 520px;
  }
}

/* Desktop: wider allowed */
@media (min-width: 1025px) {
  .app-inner {
    max-width: 600px;
  }
}
```

### Files Changed

| File | Change |
|------|--------|
| `client/src/App.tsx` | Wrap content with `app-outer` + `app-inner` divs (main render ~line 888 AND early-return loading state ~line 852) |
| `client/src/App.css` | Replace `.app` / `.app-lobby` / `.app-game` with new outer/inner classes |
| `client/src/index.css` | Add `height: 100%` to `html, body, #root` |

### Files NOT Changed

- `LobbyScreen.css` — internal `max-width: 520px` already correct
- `GameScreen.css` — internal `max-width: 600px` + `margin: 0 auto` already correct
- All skin CSS files — unaffected
- All component CSS files — unaffected

## Why This Fixes the Tablet Problem

Before: vw units inside elements resolve against the full 1024px tablet viewport.  
After: the `.app-inner` column is capped at 520px. The surrounding black letterbox is pure CSS — no DOM content lives there, so overflow:hidden on app-inner keeps everything contained.

## Out of Scope

- Replacing vw units inside component CSS files (LobbyScreen, GameScreen, etc.) — not needed once the viewport column is constrained
- Any game logic changes
- Any skin changes
