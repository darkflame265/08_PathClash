# Responsive In-Game Layout Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 모든 화면 크기에서 게임 보드가 잘리지 않고 인게임 전체가 자연스럽게 축소·재배치되어 playable하도록 만든다.

**Architecture:** 높이 정보를 CSS flex cascade로 `.game-grid-shell`까지 전달한 뒤, `ResizeObserver`가 width·height 모두를 읽어 `Math.min(w, h)` 기반 정사각 보드를 계산한다. 고정 px 값은 `clamp()`와 `svh` 단위로 교체하고, 높이 부족 환경에서는 media query로 채팅·패딩을 압축한다.

**Tech Stack:** React + TypeScript, CSS (clamp/svh/flex), ResizeObserver

---

## Root Cause Summary

1. `.gs-board-stage`가 `align-items: center`여서 자식 `.gs-grid-area`가 높이를 상속 못함
2. `.game-grid-shell`에 `height: 100%` 없어서 ResizeObserver가 contentRect.height = boardSize (순환)
3. `GameGrid.tsx` `updateSize(width)`가 높이를 무시 → width 기반 보드가 좁은 뷰포트 높이를 초과
4. `ChatPanel.css` `height: 80px` 고정

---

### Task 1: GameScreen.css — board-stage 높이 cascade 수정

**Files:**
- Modify: `client/src/components/Game/GameScreen.css`

**Step 1: `.gs-board-stage` 방향 변경 + `.gs-grid-area` 센터링 이동**

`.gs-board-stage`의 기존 규칙 (`.gs-board-stage { position: relative; flex: 1; ... display: flex; align-items: center; justify-content: center; }`)을 아래로 교체한다:

```css
/* 기존 */
.gs-board-stage {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 변경 후 */
.gs-board-stage {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: stretch;
}
```

**Step 2: `.gs-board-stage .gs-grid-area` 센터링 추가**

기존 rule:
```css
.gs-board-stage .gs-grid-area {
  flex: 1;
  min-height: 0;
}
```

변경:
```css
.gs-board-stage .gs-grid-area {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
```

(기존 `.gs-grid-area` 독립 rule에 이미 `align-items: center; justify-content: center; display: flex`가 있으면 중복 제거)

**Step 3: 확인**

GameScreen.css 저장 후 검토 — `.gs-board-stage`에 `flex-direction: column`과 `align-items: stretch`가 있는지 확인.

---

### Task 2: GameGrid.css — game-grid-shell에 height 추가

**Files:**
- Modify: `client/src/components/Game/GameGrid.css`

**Step 1: `.game-grid-shell`에 `height: 100%` 추가**

기존:
```css
.game-grid-shell {
  width: 100%;
  max-width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
```

변경:
```css
.game-grid-shell {
  width: 100%;
  height: 100%;       /* ← 추가: gs-grid-area 높이 상속 */
  max-width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
```

---

### Task 3: GameGrid.tsx — updateSize를 width+height 기반으로 수정

**Files:**
- Modify: `client/src/components/Game/GameGrid.tsx`

**Step 1: `updateSize` 시그니처 및 로직 변경**

기존:
```ts
const updateSize = (width: number) => {
  if (!width) return;
  setBoardSize(width * 0.92);
};

updateSize(element.getBoundingClientRect().width);

const observer = new ResizeObserver((entries) => {
  const entry = entries[0];
  if (!entry) return;
  updateSize(entry.contentRect.width);
});
```

변경:
```ts
const updateSize = (width: number, height: number) => {
  const side = Math.min(width, height > 60 ? height : width);
  if (!side) return;
  setBoardSize(side * 0.92);
};

const rect = element.getBoundingClientRect();
updateSize(rect.width, rect.height);

const observer = new ResizeObserver((entries) => {
  const entry = entries[0];
  if (!entry) return;
  updateSize(entry.contentRect.width, entry.contentRect.height);
});
```

`height > 60` 조건: height가 의미 없는 작은 값(0 또는 초기화 안 된 상태)이면 width만 사용.

---

### Task 4: ChatPanel.css — 채팅 높이 반응형 변경

**Files:**
- Modify: `client/src/components/Game/ChatPanel.css`

**Step 1: `height: 80px` → `clamp()` 교체**

기존:
```css
.chat-messages {
  height: 80px;
  ...
}
```

변경:
```css
.chat-messages {
  height: clamp(40px, 7svh, 80px);
  ...
}
```

- `7svh`: 뷰포트 높이의 7% (600px 뷰포트 → 42px, 900px → 63px)
- `clamp(40px, ..., 80px)`: 최소 40px, 최대 80px 유지

---

### Task 5: GameScreen.css — 높이 부족 환경 media query 추가

**Files:**
- Modify: `client/src/components/Game/GameScreen.css`

**Step 1: 파일 맨 끝에 media query 추가**

```css
/* ── 높이 부족 환경 (태블릿 가로, 13인치 노트북 등) ─────────── */
@media (max-height: 620px) {
  .chat-messages {
    height: clamp(28px, 5svh, 48px);
  }

  .gs-player-card {
    padding:
      calc(0.3rem * var(--gs-scale, 1))
      calc(0.7rem * var(--gs-scale, 1));
    gap: calc(0.5rem * var(--gs-scale, 1));
  }

  .gs-path-bar {
    padding:
      calc(0.3rem * var(--gs-scale, 1))
      calc(0.7rem * var(--gs-scale, 1));
    gap: calc(0.25rem * var(--gs-scale, 1));
  }
}

/* ── 매우 좁은 높이 (가로 폰, 400px 이하) ───────────────────── */
@media (max-height: 420px) {
  .chat-panel {
    display: none;
  }
}

/* ── 매우 좁은 너비 (작은 폰 세로) ─────────────────────────── */
@media (max-width: 360px) {
  .game-screen {
    padding: calc(0.375rem * var(--gs-scale, 1));
    gap: calc(0.25rem * var(--gs-scale, 1));
  }
}
```

---

### Task 6: 검증

**각 뷰포트 크기별 DevTools 확인:**

| 환경 | 크기 | 확인 사항 |
|------|------|-----------|
| 모바일 세로 | 375×667 | 보드가 화면 안에 있고, 플레이어 카드/채팅 모두 표시 |
| 태블릿 세로 | 768×1024 | 보드가 충분히 크고, 레이아웃 여유 있음 |
| 태블릿 가로 | 1024×768 | 보드가 높이 제약에 맞게 축소 |
| 13인치 노트북 | 1280×800 | 보드+모든 UI가 스크롤 없이 표시 |
| 데스크탑 | 1440×900+ | 정상 |

**브라우저 DevTools 방법:**
1. F12 → Toggle device toolbar (Ctrl+Shift+M)
2. 각 해상도 입력 후 게임 진입
3. 보드가 화면 안에 들어오는지, 스크롤이 생기지 않는지 확인

---

## 변경 파일 요약

| 파일 | 변경 내용 |
|------|-----------|
| `GameScreen.css` | `gs-board-stage` flex 방향 column으로, `gs-grid-area` 센터링 이동, media query 추가 |
| `GameGrid.css` | `game-grid-shell`에 `height: 100%` 추가 |
| `GameGrid.tsx` | `updateSize(w, h)` - width+height 모두 사용해 보드 크기 제한 |
| `ChatPanel.css` | `height: 80px` → `clamp(40px, 7svh, 80px)` |
