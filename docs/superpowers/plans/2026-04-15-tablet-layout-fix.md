# Tablet Layout Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix tablet (768~1024px) layout breakage by wrapping the app in an outer/inner container structure that creates a max-520px letterbox column, preventing vw-based elements from scaling against the full tablet viewport.

**Architecture:** Replace the single `.app` root div with two layers — `.app-outer` (full-screen black background, flex-center) and `.app-inner` (max-width 520px game column). Media queries apply the letterbox only at tablet width; mobile stays full-width and desktop allows up to 600px.

**Tech Stack:** React (App.tsx), CSS (App.css, index.css) — no build tools or libraries involved.

---

## File Map

| File | What changes |
|------|-------------|
| `client/src/index.css` | Add `height: 100%` to `html, body, #root` so the outer container can fill full height |
| `client/src/App.css` | Replace `.app` / `.app-lobby` / `.app-game` with `.app-outer` / `.app-outer--lobby` / `.app-outer--game` / `.app-inner`; add 3-tier media queries |
| `client/src/App.tsx` | Two spots: (1) loading early-return ~line 852, (2) main return ~line 888 — wrap with `app-outer` + `app-inner` |

---

## Task 1: index.css — height chain

**Files:**
- Modify: `client/src/index.css:29-37`

This ensures `app-outer` can use `height: 100%` to fill the full screen. Without it, percentage heights on children resolve to 0.

- [ ] **Step 1: Add height to html/body**

Open `client/src/index.css`. The current `html` block (line 29) looks like:
```css
html {
  scrollbar-width: none;
}

body {
  margin: 0;
  min-height: 100vh;
  scrollbar-width: none;
}
```

Replace with:
```css
html {
  height: 100%;
  scrollbar-width: none;
}

body {
  margin: 0;
  height: 100%;
  min-height: 100vh;
  scrollbar-width: none;
}
```

- [ ] **Step 2: Check index.html for #root div and confirm it exists**

Open `client/index.html`. Confirm there is a `<div id="root"></div>`. It should be present (standard Vite React template).

- [ ] **Step 3: Add #root height in index.css**

At the end of `client/src/index.css`, append:
```css
#root {
  height: 100%;
}
```

- [ ] **Step 4: Commit**

```bash
git add client/src/index.css
git commit -m "fix: add height:100% chain to html/body/#root for tablet layout"
```

---

## Task 2: App.css — replace .app with outer/inner structure

**Files:**
- Modify: `client/src/App.css:10-27` (the `.app`, `.app-lobby`, `.app-game` block)

- [ ] **Step 1: Replace the .app / .app-lobby / .app-game block**

Current block in `client/src/App.css` (lines 10–27):
```css
.app {
  width: 100vw;
  min-height: 100vh;
  display: flex;
}

.app-lobby {
  align-items: center;
  justify-content: center;
}

.app-game {
  align-items: flex-start;
  justify-content: center;
  height: 100dvh;
  min-height: 100dvh;
  overflow: hidden;
}
```

Replace with:
```css
/* ── Outer: full-screen shell, black letterbox bg ─────────────── */
.app-outer {
  width: 100%;
  height: 100%;
  min-height: 100dvh;
  background: #000;
  display: flex;
  justify-content: center;
  align-items: flex-start;
}

.app-outer--lobby {
  align-items: center;
}

/* ── Inner: the actual game column ──────────────────────────────── */
.app-inner {
  width: 100%;
  min-height: 100dvh;
  background: var(--bg, #12181B);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Mobile: full width */
@media (max-width: 767px) {
  .app-inner {
    max-width: 100%;
  }
}

/* Tablet: letterbox at 520px */
@media (min-width: 768px) and (max-width: 1024px) {
  .app-inner {
    max-width: 520px;
  }
}

/* Desktop: up to 600px */
@media (min-width: 1025px) {
  .app-inner {
    max-width: 600px;
  }
}
```

- [ ] **Step 2: Verify .app-loading still works**

Search `client/src/App.css` for `.app-loading`. It should still be present further down. No changes needed — it will be used as an additional class on `.app-inner`.

- [ ] **Step 3: Commit**

```bash
git add client/src/App.css
git commit -m "fix: replace .app with outer/inner letterbox structure for tablet layout"
```

---

## Task 3: App.tsx — update JSX structure

**Files:**
- Modify: `client/src/App.tsx:852` (loading early return)
- Modify: `client/src/App.tsx:888-1057` (main return)

- [ ] **Step 1: Update loading early return (line 852)**

Current (line 852):
```tsx
return <div className="app app-loading">Connecting guest session...</div>;
```

Replace with:
```tsx
return (
  <div className="app-outer app-outer--lobby">
    <div className="app-inner app-loading">Connecting guest session...</div>
  </div>
);
```

- [ ] **Step 2: Update main return — outer div (line 888)**

Current (line 888):
```tsx
<div className={`app ${view === "lobby" ? "app-lobby" : "app-game"}`}>
```

Replace with:
```tsx
<div className={`app-outer ${view === "lobby" ? "app-outer--lobby" : "app-outer--game"}`}>
  <div className="app-inner">
```

- [ ] **Step 3: Update main return — close inner div (line 1057)**

Current closing structure (lines 1055–1058):
```tsx
        </div>
      )}
    </div>
  );
```

Replace with:
```tsx
        </div>
      )}
    </div>{/* app-inner */}
  </div>
);
```

That is: add `</div>{/* app-inner */}` before the closing `</div>` of `app-outer`.

- [ ] **Step 4: Update Suspense fallback (line 889)**

Current:
```tsx
<Suspense fallback={<div className="app app-loading">Loading...</div>}>
```

Replace with:
```tsx
<Suspense fallback={<div className="loading">Loading...</div>}>
```

(The fallback is already rendered inside `.app-inner`, so it inherits flex layout. `.loading` provides the text styling.)

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd client && npx tsc --noEmit
```

Expected: no errors. If there are errors, they will be in App.tsx and will be about unclosed JSX tags — fix by counting open/close div tags.

- [ ] **Step 6: Commit**

```bash
git add client/src/App.tsx
git commit -m "fix: wrap App in app-outer/app-inner for tablet letterbox layout"
```

---

## Task 4: Manual Verification

No automated tests exist for CSS layout. Verify in browser DevTools.

- [ ] **Step 1: Start dev server**

```bash
cd client && npm run dev
```

Open browser at `http://localhost:5173` (or the port Vite reports).

- [ ] **Step 2: Mobile check (< 768px)**

In DevTools → Toggle Device Toolbar → set width to 390px (iPhone 14).
Expected:
- Lobby fills full width, no black bars
- Game screen fills full width
- No visual regressions vs. before

- [ ] **Step 3: Tablet check (768~1024px)**

Set DevTools width to 820px (iPad Air).
Expected:
- Black bars visible on left and right
- Game column centered, max 520px wide
- Lobby UI not stretched
- Game board not over-sized

- [ ] **Step 4: Desktop check (> 1024px)**

Set DevTools width to 1280px.
Expected:
- Layout centered, max ~600px wide
- Same appearance as before this change

- [ ] **Step 5: Check modals**

On tablet width (820px), trigger any modal (e.g. wait for legal consent, or edit source to force `hasLegalConsent = false`).
Expected:
- Modal backdrop covers full screen (position: fixed covers viewport, not app-inner)
- Modal content centered on full screen

- [ ] **Step 6: Commit if any minor tweaks made**

```bash
git add client/src/App.css client/src/index.css client/src/App.tsx
git commit -m "fix: minor tablet layout adjustments after verification"
```
