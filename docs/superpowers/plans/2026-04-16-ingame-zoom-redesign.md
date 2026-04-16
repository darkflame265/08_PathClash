# In-Game Zoom-Resilient Layout Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the JS-computed `--gs-scale` CSS variable from all HUD elements so that the in-game screen renders correctly at any browser zoom level or OS font scale.

**Architecture:** HUD elements use plain `rem` units (same as the lobby). The board grid continues to use JS-computed `cellSize` from `useAdaptiveCellSize`. The circular dependency (`cellSize → scale → HUD height → grid area → cellSize`) is eliminated.

**Tech Stack:** React + TypeScript, CSS (no framework), Vite build

---

## File Map

| File | Change |
|---|---|
| `client/src/components/Game/GameScreen.tsx` | Remove `MAX_SCALE`, `scale`, `--gs-scale` style prop |
| `client/src/components/Ability/AbilityScreen.tsx` | Remove `scale`, `--gs-scale` style prop |
| `client/src/components/Game/TimerBar.css` | `height: 22px` → `height: 1.375rem` |
| `client/src/components/Game/HpDisplay.css` | Strip 4 `var(--gs-scale, 1)` occurrences |
| `client/src/components/Game/PlayerInfo.css` | Strip 3 `var(--gs-scale, 1)` occurrences |
| `client/src/components/Game/GameScreen.css` | Strip 56 `var(--gs-scale, 1)` occurrences, convert px→rem |
| `client/src/components/Ability/AbilityScreen.css` | Strip 120 `var(--gs-scale, 1)` occurrences, convert px→rem |

---

## Task 1: Remove `--gs-scale` from GameScreen.tsx

**Files:**
- Modify: `client/src/components/Game/GameScreen.tsx`

- [ ] **Step 1: Remove `MAX_SCALE` constant and `scale` computation**

Find and delete these two lines (around line 34 and line 163):
```typescript
// DELETE this line:
const MAX_SCALE = 0.85;

// DELETE this line (after cellSize is declared):
const scale = Math.min(cellSize / DEFAULT_CELL, MAX_SCALE);
```

- [ ] **Step 2: Remove `--gs-scale` from the JSX style prop**

Find the root `<div>` in the return statement (around line 566):
```tsx
// BEFORE:
<div
  className={`game-screen ${screenBoardClass}`}
  style={{ "--gs-scale": scale } as CSSProperties}
  ref={screenRef}
>

// AFTER:
<div
  className={`game-screen ${screenBoardClass}`}
  ref={screenRef}
>
```

- [ ] **Step 3: Remove unused `CSSProperties` import**

```typescript
// BEFORE:
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

// AFTER:
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
```

- [ ] **Step 4: Verify TypeScript builds cleanly**

```bash
cd client && npx tsc --noEmit
```
Expected: no errors referencing `scale` or `CSSProperties`

- [ ] **Step 5: Commit**

```bash
git add client/src/components/Game/GameScreen.tsx
git commit -m "refactor: remove --gs-scale computation from GameScreen"
```

---

## Task 2: Remove `--gs-scale` from AbilityScreen.tsx

**Files:**
- Modify: `client/src/components/Ability/AbilityScreen.tsx`

- [ ] **Step 1: Remove `scale` computation**

Find and delete this line (around line 434):
```typescript
// DELETE:
const scale = cellSize / DEFAULT_CELL;
```

- [ ] **Step 2: Remove `--gs-scale` from the JSX style prop**

Find the root `<div>` in the return (around line 2877):
```tsx
// BEFORE:
<div
  className={`game-screen ability-screen ${screenBoardClass}`}
  style={{ "--gs-scale": scale } as CSSProperties}
>

// AFTER:
<div
  className={`game-screen ability-screen ${screenBoardClass}`}
>
```

- [ ] **Step 3: Remove unused `CSSProperties` import**

```typescript
// BEFORE:
import { useEffect, useRef, useState, type CSSProperties } from "react";

// AFTER:
import { useEffect, useRef, useState } from "react";
```

- [ ] **Step 4: Verify TypeScript builds cleanly**

```bash
cd client && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add client/src/components/Ability/AbilityScreen.tsx
git commit -m "refactor: remove --gs-scale computation from AbilityScreen"
```

---

## Task 3: Rewrite TimerBar.css

**Files:**
- Modify: `client/src/components/Game/TimerBar.css`

- [ ] **Step 1: Replace fixed `height: 22px` with rem-based height**

Write the complete new file:

```css
/* TimerBar — 타이머 진행 바 */

.timer-container {
  position: relative;
  width: 100%;
  height: 1.375rem;
  background: var(--tile, #2A3137);
  border-radius: 999px;
  border: 1px solid var(--tile-border, #3A444D);
  overflow: hidden;
}

.timer-bar {
  height: 100%;
  border-radius: 999px;
  transition: width 0.05s linear, background-color 0.4s;
}

.timer-bar.green  { background: linear-gradient(90deg, #15803d, #22c55e); }
.timer-bar.yellow { background: linear-gradient(90deg, #a16207, #eab308); }
.timer-bar.red    {
  background: linear-gradient(90deg, #b91c1c, #EF4444);
  animation: timer-pulse 0.35s ease-in-out infinite alternate;
}

@keyframes timer-pulse {
  from { opacity: 1; }
  to   { opacity: 0.5; }
}

.timer-text {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  font-family: var(--mono, monospace);
  font-size: 0.7rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.85);
  letter-spacing: 0.05em;
}
```

- [ ] **Step 2: Verify no `--gs-scale` remains**

```bash
grep "gs-scale" client/src/components/Game/TimerBar.css
```
Expected: no output

- [ ] **Step 3: Commit**

```bash
git add client/src/components/Game/TimerBar.css
git commit -m "refactor: replace fixed px height in TimerBar with rem"
```

---

## Task 4: Rewrite HpDisplay.css

**Files:**
- Modify: `client/src/components/Game/HpDisplay.css`

- [ ] **Step 1: Write the complete new file (4 occurrences removed)**

```css
/* HP label and heart display */

.hp-display {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.hp-label {
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--text-muted, #9aa4ae);
  white-space: nowrap;
}

.hp-label.bold {
  font-weight: 800;
  color: var(--text, #f0f4f8);
}

.hearts {
  display: flex;
  gap: 0.125rem;
}

.heart {
  font-size: 1.25rem;
  display: inline-block;
  line-height: 1;
  transition: transform 0.15s;
}

.heart.filled {
  color: #ef4444;
  filter: drop-shadow(0 0 5px rgba(239, 68, 68, 0.55));
}

.heart.empty {
  color: var(--tile-border, #3a444d);
  filter: none;
  opacity: 0.7;
}

@keyframes heart-shake {
  0%,
  100% {
    transform: translateX(0);
  }
  20% {
    transform: translateX(-5px);
  }
  40% {
    transform: translateX(5px);
  }
  60% {
    transform: translateX(-4px);
  }
  80% {
    transform: translateX(4px);
  }
}

.heart.shaking {
  animation: heart-shake 400ms ease;
}

@keyframes heart-heal-pulse {
  0% {
    transform: scale(0.88);
    filter:
      drop-shadow(0 0 0 rgba(34, 197, 94, 0))
      drop-shadow(0 0 0 rgba(134, 239, 172, 0));
  }
  26% {
    transform: scale(1.26);
    filter:
      drop-shadow(0 0 10px rgba(34, 197, 94, 0.92))
      drop-shadow(0 0 18px rgba(134, 239, 172, 0.62));
  }
  62% {
    transform: scale(1.08);
    filter:
      drop-shadow(0 0 16px rgba(34, 197, 94, 0.82))
      drop-shadow(0 0 24px rgba(187, 247, 208, 0.48));
  }
  100% {
    transform: scale(1);
    filter:
      drop-shadow(0 0 5px rgba(239, 68, 68, 0.55))
      drop-shadow(0 0 0 rgba(34, 197, 94, 0));
  }
}

.heart.healing {
  animation: heart-heal-pulse 900ms ease;
}
```

- [ ] **Step 2: Verify no `--gs-scale` remains**

```bash
grep "gs-scale" client/src/components/Game/HpDisplay.css
```
Expected: no output

- [ ] **Step 3: Commit**

```bash
git add client/src/components/Game/HpDisplay.css
git commit -m "refactor: remove --gs-scale from HpDisplay"
```

---

## Task 5: Rewrite PlayerInfo.css

**Files:**
- Modify: `client/src/components/Game/PlayerInfo.css`

- [ ] **Step 1: Write the complete new file (3 occurrences removed)**

```css
/* PlayerInfo: nickname button + stat dropdown */

.player-info {
  position: relative;
  display: inline-flex;
  flex: 0 0 auto;
  width: fit-content;
  max-width: 100%;
}

.nickname-btn {
  background: transparent;
  border: 1px solid transparent;
  border-radius: 0.45rem;
  display: inline-flex;
  align-items: center;
  padding: 0.2rem 0.45rem;
  font-size: 0.85rem;
  font-weight: 700;
  font-family: 'Plus Jakarta Sans', sans-serif;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  letter-spacing: 0.01em;
  line-height: 1.3;
  max-width: 100%;
  width: auto;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 0 0 auto;
}

.nickname-btn.color-red { color: #f87171; }
.nickname-btn.color-blue { color: #60a5fa; }

.nickname-btn.color-red:hover {
  background: rgba(239, 68, 68, 0.08);
  border-color: rgba(239, 68, 68, 0.3);
}

.nickname-btn.color-blue:hover {
  background: rgba(59, 130, 246, 0.08);
  border-color: rgba(59, 130, 246, 0.3);
}

.profile-box {
  position: absolute;
  top: calc(100% + 6px);
  bottom: auto;
  left: 0;
  right: auto;
  z-index: 200;
  background: var(--panel, #1E252B);
  border: 1px solid var(--tile-border, #3A444D);
  border-radius: 0.75rem;
  padding: 0.625rem;
  min-width: 180px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.65);
  user-select: text;
  -webkit-user-select: text;
  cursor: text;
}

.profile-box.profile-box-self {
  top: auto;
  bottom: calc(100% + 6px);
  left: 0;
  right: auto;
}

.profile-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 0.22rem 0;
  font-size: 0.8rem;
  border-bottom: 1px solid var(--tile, #2A3137);
}

.profile-row:last-child {
  border-bottom: none;
}

.profile-row span:first-child {
  color: var(--text-muted, #9AA4AE);
  font-size: 0.75rem;
  letter-spacing: 0.04em;
  user-select: text;
  -webkit-user-select: text;
}

.profile-row span:last-child {
  color: var(--text, #F0F4F8);
  font-weight: 600;
  font-family: 'Plus Jakarta Sans', sans-serif;
  user-select: text;
  -webkit-user-select: text;
}

.profile-id-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  border: 1px solid rgba(59, 130, 246, 0.28);
  background: rgba(59, 130, 246, 0.1);
  color: var(--text, #f0f4f8);
  border-radius: 999px;
  padding: 0.28rem 0.55rem;
  font-size: 0.75rem;
  font-weight: 700;
  font-family: var(--mono, 'JetBrains Mono', monospace);
  cursor: pointer;
  transition: all 0.15s ease;
}

.profile-id-btn:hover {
  background: rgba(59, 130, 246, 0.16);
  border-color: rgba(59, 130, 246, 0.42);
}

.profile-id-btn.is-copied {
  border-color: rgba(72, 187, 120, 0.38);
  background: rgba(72, 187, 120, 0.12);
}

.profile-id-copy {
  color: #93c5fd;
  font-family: 'Plus Jakarta Sans', sans-serif;
  font-size: 0.68rem;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

.profile-id-btn.is-copied .profile-id-copy {
  color: #86efac;
}
```

- [ ] **Step 2: Verify no `--gs-scale` remains**

```bash
grep "gs-scale" client/src/components/Game/PlayerInfo.css
```
Expected: no output

- [ ] **Step 3: Commit**

```bash
git add client/src/components/Game/PlayerInfo.css
git commit -m "refactor: remove --gs-scale from PlayerInfo"
```

---

## Task 6: Strip `--gs-scale` from GameScreen.css

**Files:**
- Modify: `client/src/components/Game/GameScreen.css`

**Background:** 56 occurrences. Two transformation rules:
1. `calc(X * var(--gs-scale, 1))` → `X` (rem stays rem)
2. `calc(Npx * var(--gs-scale, 1))` → convert px to rem: `N/16 rem`
3. `clamp(a, calc(X * var(--gs-scale, 1)), b)` → `X` (remove clamp wrapper)
4. `height: clamp(7px, calc(10px * var(--gs-scale, 1)), 14px)` → `height: 0.625rem`

**Pixel → rem conversions used in this file:**
- `6px` → `0.375rem`
- `16px` → `1rem`
- `50px` → `3.125rem`
- `14px` → `0.875rem`
- `4px` → `0.25rem`
- `10px` (gauge height) → `0.625rem`
- `3px` → `0.1875rem`

- [ ] **Step 1: Write the complete new GameScreen.css**

```css
/* ============================================================
   GAME SCREEN — Tactical Command Interface
   ============================================================ */

/* ── 루트 컨테이너 ─────────────────────────────────────────── */
.game-screen {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.5rem;
  padding-top: calc(0.75rem + env(safe-area-inset-top, 0px));
  padding-right: 0.75rem;
  padding-left: 0.75rem;
  padding-bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px));
  height: 100%;
  overflow: visible;
  width: 100%;
  max-width: 600px;
  margin: 0 auto;
  box-sizing: border-box;
}

.game-screen.board-bg-pharaoh-screen::before {
  content: "";
  position: absolute;
  inset: 0;
  background:
    linear-gradient(rgba(12, 8, 5, 0.3), rgba(12, 8, 5, 0.3)),
    url("/board/pharaoh_board_bg.webp") center / cover no-repeat;
  opacity: 0.98;
  z-index: 0;
  pointer-events: none;
}

.game-screen.board-bg-magic-screen::before {
  content: "";
  position: absolute;
  inset: 0;
  background:
    linear-gradient(rgba(11, 8, 19, 0.34), rgba(11, 8, 19, 0.34)),
    url("/board/magic_board_bg.webp") center / cover no-repeat;
  opacity: 0.99;
  z-index: 0;
  pointer-events: none;
}

.game-screen.board-bg-pharaoh-screen > * {
  position: relative;
  z-index: 1;
}

.game-screen.board-bg-magic-screen > * {
  position: relative;
  z-index: 1;
}

.gs-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100%;
  color: var(--text-muted);
  font-size: 0.875rem;
  letter-spacing: 0.12em;
  font-family: var(--mono);
}

/* ── 유틸리티 바 ───────────────────────────────────────────── */
.gs-utility-bar {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  width: 100%;
  flex-shrink: 0;
}

.gs-timer-slot {
  flex: 1;
  min-width: 0;
  max-width: calc(100% - 7.6rem);
}

.gs-utility-buttons {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

/* ── 유틸리티 버튼 ─────────────────────────────────────────── */
.gs-lobby-btn {
  background: var(--tile);
  border: 1px solid var(--tile-border);
  border-radius: 0.5rem;
  color: var(--text-muted);
  cursor: pointer;
  font-family: "Plus Jakarta Sans", sans-serif;
  line-height: 1;
  transition:
    background 0.15s,
    border-color 0.15s,
    color 0.15s;
}

.gs-lobby-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.4rem 0.8rem;
  font-size: 1.08rem;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  min-width: 5.8rem;
  height: 2.2rem;
}

.gs-lobby-btn:hover {
  border-color: var(--primary);
  color: var(--text);
  background: var(--tile-hover);
}

/* ── 이동 중 상태 표시 ─────────────────────────────────────── */
.gs-phase-moving {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-family: var(--mono);
  font-size: 0.75rem;
  font-weight: 500;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--blue);
}

.gs-moving-pip {
  width: 0.375rem;
  height: 0.375rem;
  border-radius: 50%;
  background: var(--blue);
  flex-shrink: 0;
  animation: gs-pip-pulse 0.7s ease-in-out infinite alternate;
}

@keyframes gs-pip-pulse {
  from {
    opacity: 0.35;
    transform: scale(0.75);
  }
  to {
    opacity: 1;
    transform: scale(1.25);
  }
}

/* ── 플레이어 카드 ─────────────────────────────────────────── */
.gs-player-card {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 0.75rem;
  padding: 0.55rem 0.875rem;
  background: var(--panel);
  border: 1px solid var(--tile-border);
  border-radius: 0.875rem;
  position: relative;
  overflow: visible;
  flex-shrink: 0;
  transition: border-color 0.2s;
  --corner-color: var(--tile-border);
}

/* 코너 브라켓 — 우상단 */
.gs-player-card::after {
  content: "";
  position: absolute;
  top: 0;
  right: 0;
  width: 1rem;
  height: 1rem;
  border-top: 2px solid var(--corner-color);
  border-right: 2px solid var(--corner-color);
  border-radius: 0 0.875rem 0 0;
  opacity: 0.45;
  pointer-events: none;
}

/* 컬러 left-border accent */
.gs-color-red {
  border-left: 3px solid rgba(239, 68, 68, 0.65);
}
.gs-color-blue {
  border-left: 3px solid rgba(59, 130, 246, 0.65);
}

/* 내 패널 강조 */
.gs-self {
  box-shadow:
    0 0 0 1px rgba(56, 102, 65, 0.14) inset,
    0 4px 20px rgba(0, 0, 0, 0.28);
}

.gs-self.gs-color-red {
  --corner-color: rgba(239, 68, 68, 0.35);
}
.gs-self.gs-color-blue {
  --corner-color: rgba(59, 130, 246, 0.35);
}

/* ── 역할 배지 ─────────────────────────────────────────────── */
.gs-role-badge {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  padding: 0.45rem 0.55rem;
  background: var(--tile);
  border: 1px solid var(--tile-border);
  border-radius: 0.625rem;
  min-width: 3.125rem;
  flex-shrink: 0;
}

.gs-role-badge-self {
  border-color: rgba(56, 102, 65, 0.38);
  background: rgba(56, 102, 65, 0.08);
}

.gs-role-icon {
  font-size: 1.4rem;
  line-height: 1;
}

.gs-role-label {
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--text-muted);
  line-height: 1;
}

/* ══════════════════════════════════════════════════════════════
   내 역할 카드 — ATK / RUN 역할별 강화 스타일
   ══════════════════════════════════════════════════════════════ */

/* ── ATK: 공격적·압박감 ─────────────────────────────────────── */
.gs-self.gs-role-atk {
  background: linear-gradient(
    135deg,
    rgba(239, 68, 68, 0.09) 0%,
    var(--panel) 55%
  );
  box-shadow:
    0 0 0 1px rgba(220, 38, 38, 0.15) inset,
    0 0 28px rgba(239, 68, 68, 0.1),
    0 4px 20px rgba(0, 0, 0, 0.28);
}

/* 상단 경고선 accent */
.gs-self.gs-role-atk::before {
  content: "";
  position: absolute;
  top: 0;
  left: 8%;
  right: 8%;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(239, 68, 68, 0.55),
    transparent
  );
  pointer-events: none;
}

.gs-role-badge-self.gs-role-badge-atk {
  position: relative;
  background: linear-gradient(
    145deg,
    rgba(239, 68, 68, 0.22) 0%,
    rgba(185, 28, 28, 0.1) 100%
  );
  border-color: rgba(239, 68, 68, 0.6);
  border-radius: 0.35rem;
  box-shadow:
    0 0 14px rgba(239, 68, 68, 0.22),
    0 0 0 1px rgba(239, 68, 68, 0.12) inset;
  animation: gs-atk-badge-pulse 2.5s ease-in-out infinite;
}

/* 배지 상단 경고선 */
.gs-role-badge-self.gs-role-badge-atk::before {
  content: "";
  position: absolute;
  top: 0;
  left: 15%;
  right: 15%;
  height: 2px;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(239, 68, 68, 0.85),
    transparent
  );
  border-radius: 0 0 2px 2px;
}

.gs-role-badge-atk .gs-role-icon {
  color: #f87171;
  text-shadow:
    0 0 8px rgba(239, 68, 68, 0.8),
    0 0 18px rgba(220, 38, 38, 0.45);
  font-weight: 900;
}

.gs-role-badge-atk .gs-role-label {
  color: rgba(248, 113, 113, 0.85);
}

@keyframes gs-atk-badge-pulse {
  0%,
  100% {
    box-shadow:
      0 0 14px rgba(239, 68, 68, 0.22),
      0 0 0 1px rgba(239, 68, 68, 0.12) inset;
  }
  50% {
    box-shadow:
      0 0 22px rgba(239, 68, 68, 0.38),
      0 0 0 1px rgba(239, 68, 68, 0.22) inset;
  }
}

/* ── RUN: 민첩·탈출감 ───────────────────────────────────────── */
.gs-self.gs-role-run {
  background: linear-gradient(
    135deg,
    rgba(6, 182, 212, 0.06) 0%,
    var(--panel) 55%
  );
  box-shadow:
    0 0 0 1px rgba(6, 182, 212, 0.1) inset,
    0 0 28px rgba(6, 182, 212, 0.08),
    0 4px 20px rgba(0, 0, 0, 0.28);
}

/* 하단 흐름선 accent */
.gs-self.gs-role-run::before {
  content: "";
  position: absolute;
  bottom: 0;
  left: 8%;
  right: 8%;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(6, 182, 212, 0.45),
    transparent
  );
  pointer-events: none;
}

.gs-role-badge-self.gs-role-badge-run {
  position: relative;
  overflow: hidden;
  background: linear-gradient(
    145deg,
    rgba(6, 182, 212, 0.18) 0%,
    rgba(20, 184, 166, 0.07) 100%
  );
  border-color: rgba(6, 182, 212, 0.55);
  border-radius: 1rem;
  box-shadow:
    0 0 14px rgba(6, 182, 212, 0.18),
    0 0 0 1px rgba(6, 182, 212, 0.1) inset;
}

/* 흐르는 스피드 라인 */
.gs-role-badge-self.gs-role-badge-run::before {
  content: "";
  position: absolute;
  top: calc(50% - 1px);
  left: -80%;
  width: 70%;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(6, 182, 212, 0.65),
    transparent
  );
  animation: gs-run-streak 2.2s ease-in-out infinite;
}

@keyframes gs-run-streak {
  0% {
    left: -70%;
    opacity: 0;
  }
  15% {
    opacity: 1;
  }
  85% {
    opacity: 1;
  }
  100% {
    left: 110%;
    opacity: 0;
  }
}

.gs-role-badge-run .gs-role-icon {
  color: #22d3ee;
  text-shadow:
    0 0 8px rgba(6, 182, 212, 0.8),
    0 0 18px rgba(20, 184, 166, 0.45);
  font-style: italic;
  font-weight: 700;
}

.gs-role-badge-run .gs-role-label {
  color: rgba(34, 211, 238, 0.85);
}

/* ── 플레이어 중앙 정보 ─────────────────────────────────────── */
.gs-player-mid {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
}

.gs-color-tag {
  font-family: var(--mono);
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: var(--text-muted);
  opacity: 0.5;
}

/* ── HP 슬롯 ───────────────────────────────────────────────── */
.gs-hp-slot {
  display: flex;
  justify-content: flex-end;
  flex-shrink: 0;
}

/* ── 그리드 영역 ───────────────────────────────────────────── */
.gs-grid-area {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: visible;
}

/* ── 경로 포인트 게이지 ────────────────────────────────────── */
.gs-path-bar {
  width: 100%;
  padding: 0.55rem 0.875rem;
  background: var(--panel);
  border: 1px solid var(--tile-border);
  border-radius: 0.875rem;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  transition:
    border-color 0.25s,
    box-shadow 0.25s;
  position: relative;
  flex-shrink: 0;
}

/* 코너 브라켓 장식 */
.gs-path-bar::after {
  content: "";
  position: absolute;
  top: 0;
  right: 0;
  width: 0.875rem;
  height: 0.875rem;
  border-top: 2px solid var(--tile-border);
  border-right: 2px solid var(--tile-border);
  border-radius: 0 0.875rem 0 0;
  opacity: 0.35;
  pointer-events: none;
}

/* 꽉 찼을 때 */
.gs-path-full {
  border-color: rgba(34, 197, 94, 0.45);
  box-shadow:
    0 0 14px rgba(34, 197, 94, 0.1),
    0 0 0 1px rgba(34, 197, 94, 0.08) inset;
}

.gs-path-full::after {
  border-color: rgba(34, 197, 94, 0.4);
  opacity: 0.6;
}

/* ── 게이지 헤더 ────────────────────────────────────────────── */
.gs-path-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.gs-path-label {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.gs-path-count {
  font-family: var(--mono);
  font-size: 0.8rem;
  color: var(--text-muted);
  line-height: 1;
}

.gs-path-current {
  font-size: 1rem;
  font-weight: 700;
  color: #22c55e;
  transition: color 0.2s;
}

.gs-path-full .gs-path-current {
  color: #4ade80;
}

.gs-path-sep {
  opacity: 0.4;
}

.gs-path-max {
  color: var(--text-muted);
}

/* ── 세그먼트 게이지 (가우지) ──────────────────────────────── */
.gs-path-gauge {
  display: flex;
  gap: 0.25rem;
}

.gs-path-seg {
  flex: 1;
  height: 0.625rem;
  background: var(--tile);
  border: 1px solid var(--tile-border);
  border-radius: 0.1875rem;
  transition:
    background 0.2s ease,
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.gs-path-seg.filled {
  background: linear-gradient(180deg, #22c55e 0%, #16a34a 100%);
  border-color: rgba(34, 197, 94, 0.6);
  box-shadow: 0 0 6px rgba(34, 197, 94, 0.35);
}

.gs-path-full .gs-path-seg.filled {
  box-shadow: 0 0 8px rgba(34, 197, 94, 0.5);
}

/* 마지막으로 채워진 세그먼트에 팝 애니메이션 */
.gs-path-seg.latest {
  animation: gs-seg-pop 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes gs-seg-pop {
  0% {
    transform: scaleY(0.5);
    opacity: 0.5;
  }
  60% {
    transform: scaleY(1.25);
  }
  100% {
    transform: scaleY(1);
    opacity: 1;
  }
}

/* ── 최대 너비 확장 (넓은 화면) ─────────────────────────────── */
.gs-result-slot {
  width: 100%;
  flex-shrink: 0;
}

.game-screen {
  overflow-y: visible;
  overflow-x: hidden;
}

.gs-grid-area {
  position: relative;
  z-index: 1;
}

.gs-result-slot {
  position: relative;
  z-index: 5;
  margin-bottom: 0.5rem;
}

.gs-board-stage {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: stretch;
}

.gs-board-stage .gs-grid-area {
  flex: 1;
  min-height: 0;
}

.gs-board-stage .gs-result-slot {
  position: absolute;
  top: auto;
  bottom: 0.5rem;
  left: 50%;
  transform: translateX(-50%);
  width: min(100%, 26rem);
  margin-bottom: 0;
  pointer-events: none;
}

.gs-board-stage .gameover-overlay {
  pointer-events: none;
}

.gs-board-stage .gameover-box,
.gs-board-stage .rematch-btn {
  pointer-events: auto;
}

/* ── 높이 부족 환경 (태블릿 가로, 13인치 노트북 등) ─────────── */
@media (max-height: 820px) {
  .gs-player-card {
    padding: 0.3rem 0.7rem;
    gap: 0.5rem;
  }

  .gs-path-bar {
    padding: 0.3rem 0.7rem;
    gap: 0.25rem;
  }
}

/* ── 매우 좁은 높이 (가로 폰, 420px 이하) ───────────────────── */
@media (max-height: 420px) {
  .chat-panel {
    display: none;
  }
}

/* ── 매우 좁은 너비 (작은 폰 세로) ─────────────────────────── */
@media (max-width: 360px) {
  .game-screen {
    padding-top: calc(0.375rem + env(safe-area-inset-top, 0px));
    padding-right: 0.375rem;
    padding-left: 0.375rem;
    padding-bottom: calc(0.375rem + env(safe-area-inset-bottom, 0px));
    gap: 0.25rem;
  }
}
```

- [ ] **Step 2: Verify zero `--gs-scale` remain**

```bash
grep -c "gs-scale" client/src/components/Game/GameScreen.css
```
Expected: `0`

- [ ] **Step 3: Commit**

```bash
git add client/src/components/Game/GameScreen.css
git commit -m "refactor: remove --gs-scale from GameScreen.css, use plain rem"
```

---

## Task 7: Strip `--gs-scale` from AbilityScreen.css

**Files:**
- Modify: `client/src/components/Ability/AbilityScreen.css`

**Background:** 120 occurrences. Strategy: sed for the bulk rem-based removals, then 3 targeted pixel→rem fixes.

**Pixel → rem conversions:**
- `72px` → `4.5rem` (role badge min-width)
- `44px` → `2.75rem` (role badge min-width in narrow breakpoint)

- [ ] **Step 1: Remove all rem-based `var(--gs-scale, 1)` multiplications with sed**

```bash
# Run from the repo root
sed -i 's/ \* var(--gs-scale, 1)//g' client/src/components/Ability/AbilityScreen.css
```

This converts patterns like `calc(0.45rem * var(--gs-scale, 1))` → `calc(0.45rem)`.  
CSS is still valid; we clean up the redundant `calc()` wrappers in the next steps.

- [ ] **Step 2: Clean up single-value `calc()` wrappers left by sed**

```bash
# calc(0.45rem) → 0.45rem  (any single rem value inside calc)
sed -i 's/calc(\([0-9.]*rem\))/\1/g' client/src/components/Ability/AbilityScreen.css
```

- [ ] **Step 3: Fix the three pixel-based occurrences manually**

Open the file and make these three targeted edits:

**Line 2** (`.ability-screen .gs-role-badge`):
```css
/* BEFORE: */
  min-width: calc(72px);

/* AFTER: */
  min-width: 4.5rem;
```

**Lines 1616 and 1631** (`@media (max-width: 480px)` block):
```css
/* BEFORE (both lines): */
    min-width: calc(44px);

/* AFTER (both lines): */
    min-width: 2.75rem;
```

- [ ] **Step 4: Clean up any remaining `clamp(a, X, b)` where X is a fixed rem**

These patterns like `clamp(0.58rem, 0.66rem, 0.78rem)` are valid CSS (middle value always wins), but can be simplified. If desired, run:

```bash
# Optional simplification — safe to skip if build passes
sed -i 's/clamp([0-9.]*rem, \([0-9.]*rem\), [0-9.]*rem)/\1/g' client/src/components/Ability/AbilityScreen.css
```

- [ ] **Step 5: Verify zero `--gs-scale` remain**

```bash
grep -c "gs-scale" client/src/components/Ability/AbilityScreen.css
```
Expected: `0`

- [ ] **Step 6: Commit**

```bash
git add client/src/components/Ability/AbilityScreen.css
git commit -m "refactor: remove --gs-scale from AbilityScreen.css, use plain rem"
```

---

## Task 8: Build Verification

- [ ] **Step 1: Full TypeScript type-check**

```bash
cd client && npx tsc --noEmit
```
Expected: exit 0, no errors

- [ ] **Step 2: Production build**

```bash
cd client && npm run build
```
Expected: build completes without errors

- [ ] **Step 3: Start dev server and verify at 100% zoom**

```bash
cd client && npm run dev
```

Open `http://localhost:5173`, start an AI game. Verify:
- Player cards display correctly
- Board fills available space
- Timer bar visible
- HP hearts render correctly
- Path gauge visible

- [ ] **Step 4: Verify at 150% browser zoom**

In Chrome DevTools, set zoom to 150% (or use Ctrl+Plus × 2).  
Expected:
- Layout does not break
- All HUD elements visible
- Board shrinks proportionally to fit the smaller viewport
- No horizontal or vertical overflow

- [ ] **Step 5: Verify AbilityScreen at 150% zoom**

Start an Ability Battle game. Verify:
- Skill panel visible and not overflowing
- Board shrinks to accommodate skill panel
- No layout collapse

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore: ingame zoom-resilient layout complete"
```
