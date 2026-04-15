# 로비 확대/축소 대응 레이아웃 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 브라우저 확대(100%~200%+)와 OS 글꼴 크기 변경 시에도 로비 레이아웃이 잘리지 않고 자연스럽게 스크롤되도록 수정한다.

**Architecture:** (1) `#root`/`body` height 잠금 해제로 기본 스크롤 복구, (2) 모달 외부 래퍼의 `overflow: hidden` → `overflow-y: auto` + `max-height` 비율 기반 교체로 모달 내부 스크롤 확보, (3) 내부 이중 스크롤 제거, (4) 고정 px 배지를 `em`으로 교체. 시각 디자인(색상·폰트·카드 스타일) 변경 없음.

**Tech Stack:** CSS (no JS changes)

---

## 변경 파일 목록

| 파일 | 변경 내용 |
|---|---|
| `client/src/index.css` | `body` `height: 100%` 제거, `#root` `height` → `min-height` |
| `client/src/components/Lobby/LobbyScreen.css` | 모달 래퍼 overflow/max-height, 내부 스크롤 max-height 제거, 모바일 미디어쿼리, px → em 배지 |

---

## Task 1: index.css — body/root 스크롤 잠금 해제

**Files:**
- Modify: `client/src/index.css:34-67`

### 배경

현재 `body { height: 100% }` + `#root { height: 100% }` 조합이 레이아웃을 뷰포트 높이로 고정한다.
확대 시 CSS px 기준 뷰포트가 작아지고 내용이 잘린다.
`body`에는 이미 `min-height: 100vh`가 있으므로 `height: 100%`는 중복이다.

- [ ] **Step 1: `body`에서 `height: 100%` 제거**

`client/src/index.css` 34~39번 줄:
```css
/* 변경 전 */
body {
  margin: 0;
  height: 100%;
  min-height: 100vh;
  scrollbar-width: none;
}

/* 변경 후 */
body {
  margin: 0;
  min-height: 100vh;
  scrollbar-width: none;
}
```

- [ ] **Step 2: `#root` `height: 100%` → `min-height: 100%`**

`client/src/index.css` 65~67번 줄:
```css
/* 변경 전 */
#root {
  height: 100%;
}

/* 변경 후 */
#root {
  min-height: 100%;
}
```

- [ ] **Step 3: 브라우저에서 100% 확대 상태 확인**

로비 화면을 열고 기본 100% 상태에서 시각적으로 이상 없음을 확인한다.

- [ ] **Step 4: 브라우저에서 200% 확대 확인**

브라우저 확대를 200%로 올렸을 때:
- 로고가 잘리지 않고 보임
- 카드들이 세로 스크롤로 접근 가능함

- [ ] **Step 5: Commit**

```bash
git add client/src/index.css
git commit -m "fix: remove height lock on body/root to allow scroll at high zoom"
```

---

## Task 2: LobbyScreen.css — 모달 래퍼 overflow/max-height 수정

**Files:**
- Modify: `client/src/components/Lobby/LobbyScreen.css:1231-1235, 1314-1318, 2160-2164, 2331-2335, 2485-2489`

### 배경

5개 모달 래퍼가 `overflow: hidden` + `max-height: min(XX rem, calc(100dvh - 2rem))` 조합을 쓴다.
200% 확대 시 `100dvh`가 절반이 되어 내용이 잘리고 스크롤도 안 된다.
`overflow-y: auto` 로 바꾸면 래퍼가 넘친 내용을 스크롤로 보여준다.
`calc(100dvh - 2rem)` → `85dvh` 로 바꾸면 어떤 zoom에서도 뷰포트의 85%로 안정된다.

- [ ] **Step 1: `.skin-modal` 수정 (line 1231)**

```css
/* 변경 전 */
.skin-modal {
  max-width: 28rem;
  max-height: min(46rem, calc(100dvh - 2rem));
  overflow: hidden;
}

/* 변경 후 */
.skin-modal {
  max-width: 28rem;
  max-height: min(46rem, 85dvh);
  overflow-y: auto;
}
```

- [ ] **Step 2: `.token-shop-modal` 수정 (line 1314)**

```css
/* 변경 전 */
.token-shop-modal {
  width: min(100%, 42rem);
  max-height: min(48rem, calc(100dvh - 2rem));
  overflow: hidden;
}

/* 변경 후 */
.token-shop-modal {
  width: min(100%, 42rem);
  max-height: min(48rem, 85dvh);
  overflow-y: auto;
}
```

- [ ] **Step 3: `.achievements-modal` 수정 (line 2160)**

```css
/* 변경 전 */
.achievements-modal {
  width: min(100%, 40rem);
  max-height: min(48rem, calc(100dvh - 2rem));
  overflow: hidden;
}

/* 변경 후 */
.achievements-modal {
  width: min(100%, 40rem);
  max-height: min(48rem, 85dvh);
  overflow-y: auto;
}
```

- [ ] **Step 4: `.settings-modal` 수정 (line 2331)**

```css
/* 변경 전 */
.settings-modal {
  width: min(100%, 24rem);
  max-height: min(46rem, calc(100dvh - 2rem));
  overflow: hidden;
}

/* 변경 후 */
.settings-modal {
  width: min(100%, 24rem);
  max-height: min(46rem, 85dvh);
  overflow-y: auto;
}
```

- [ ] **Step 5: `.skin-detail-modal` 수정 (line 2485)**

```css
/* 변경 전 */
.skin-detail-modal {
  width: min(100%, 30rem);
  max-height: min(52rem, calc(100dvh - 2rem));
  overflow: hidden;
  gap: 0.9rem;
}

/* 변경 후 */
.skin-detail-modal {
  width: min(100%, 30rem);
  max-height: min(52rem, 85dvh);
  overflow-y: auto;
  gap: 0.9rem;
}
```

- [ ] **Step 6: Commit**

```bash
git add client/src/components/Lobby/LobbyScreen.css
git commit -m "fix: change modal wrappers to overflow-y auto with dvh-based max-height"
```

---

## Task 3: LobbyScreen.css — 내부 스크롤 컨테이너 max-height 제거

**Files:**
- Modify: `client/src/components/Lobby/LobbyScreen.css:2203-2207, 2337-2343`

### 배경

모달 래퍼가 이제 `overflow-y: auto`로 스크롤을 담당한다.
내부 스크롤 컨테이너(`.achievements-scroll-body`, `.settings-scroll-body`)에 남아 있는 `max-height`를 제거하지 않으면 이중 스크롤바가 생긴다.
`.skin-option-list`, `.skin-option-grid`, `.token-pack-grid`는 base CSS에 max-height가 없으므로 건드리지 않는다.

- [ ] **Step 1: `.achievements-scroll-body` max-height 제거 (line 2203)**

```css
/* 변경 전 */
.achievements-scroll-body {
  max-height: min(60vh, 31rem);
  overflow-y: auto;
  padding-right: 0.2rem;
}

/* 변경 후 */
.achievements-scroll-body {
  overflow-y: visible;
  padding-right: 0.2rem;
}
```

- [ ] **Step 2: `.settings-scroll-body` max-height 제거 (line 2337)**

```css
/* 변경 전 */
.settings-scroll-body {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  overflow-y: auto;
  max-height: calc(100dvh - 12.5rem);
  padding-right: 0.2rem;
}

/* 변경 후 */
.settings-scroll-body {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  overflow-y: visible;
  padding-right: 0.2rem;
}
```

- [ ] **Step 3: 스킨창 / 설정창 / 업적창을 열고 이중 스크롤바 없음 확인**

각 모달을 열어 스크롤바가 하나만 보이는지 확인한다.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/Lobby/LobbyScreen.css
git commit -m "fix: remove inner scroll max-height to prevent double scrollbars in modals"
```

---

## Task 4: LobbyScreen.css — 모바일 미디어쿼리 max-height 수정

**Files:**
- Modify: `client/src/components/Lobby/LobbyScreen.css:1833-1932` (`@media (max-width: 640px)` 블록)

### 배경

모바일 미디어쿼리에서 모달 래퍼와 내부 스크롤 컨테이너에 `calc(100dvh - X.Xrem)` 패턴이 반복된다.
래퍼 max-height는 비율 기반으로 교체하고, 내부 스크롤 컨테이너 max-height는 Task 3과 동일하게 제거한다.

- [ ] **Step 1: `.skin-modal` 모바일 max-height 교체 (line 1843)**

```css
/* 변경 전 */
.skin-modal {
  width: min(100%, 24rem);
  max-height: calc(100dvh - 1.7rem);
  padding: 1rem;
  gap: 0.75rem;
  border-radius: 1rem;
}

/* 변경 후 */
.skin-modal {
  width: min(100%, 24rem);
  max-height: 92dvh;
  padding: 1rem;
  gap: 0.75rem;
  border-radius: 1rem;
}
```

- [ ] **Step 2: `.skin-option-list`, `.skin-option-grid` 모바일 max-height 제거 (line 1851)**

```css
/* 변경 전 */
.skin-option-list,
.skin-option-grid {
  gap: 0.6rem;
  max-height: calc(100dvh - 16.5rem);
}

/* 변경 후 */
.skin-option-list,
.skin-option-grid {
  gap: 0.6rem;
}
```

- [ ] **Step 3: `.settings-scroll-body` 모바일 max-height 제거 (line 1857)**

```css
/* 변경 전 */
.settings-scroll-body {
  max-height: calc(100dvh - 9.5rem);
}

/* 변경 후 (규칙 자체 삭제) */
/* .settings-scroll-body 모바일 override 제거 */
```

해당 줄을 통째로 제거한다:
```
  .settings-scroll-body {
    max-height: calc(100dvh - 9.5rem);
  }
```

- [ ] **Step 4: `.token-shop-modal` 모바일 max-height 교체 (line 1889)**

```css
/* 변경 전 */
.token-shop-modal {
  width: min(100%, 25rem);
  max-height: calc(100dvh - 1.7rem);
  padding: 1rem;
}

/* 변경 후 */
.token-shop-modal {
  width: min(100%, 25rem);
  max-height: 92dvh;
  padding: 1rem;
}
```

- [ ] **Step 5: `.token-pack-grid` 모바일 max-height 제거 (line 1895)**

```css
/* 변경 전 */
.token-pack-grid {
  grid-template-columns: 1fr;
  max-height: calc(100dvh - 16rem);
}

/* 변경 후 */
.token-pack-grid {
  grid-template-columns: 1fr;
}
```

- [ ] **Step 6: `.achievements-modal` 모바일 max-height 교체 (line 1900)**

```css
/* 변경 전 */
.achievements-modal {
  width: min(100%, 25rem);
  max-height: calc(100dvh - 1.7rem);
  padding: 1rem;
}

/* 변경 후 */
.achievements-modal {
  width: min(100%, 25rem);
  max-height: 92dvh;
  padding: 1rem;
}
```

- [ ] **Step 7: `.achievements-scroll-body` 모바일 max-height 제거 (line 1915)**

```css
/* 변경 전 */
.achievements-scroll-body {
  max-height: calc(100dvh - 16rem);
}

/* 변경 후 (규칙 자체 삭제) */
/* .achievements-scroll-body 모바일 override 제거 */
```

해당 블록 통째로 제거:
```
  .achievements-scroll-body {
    max-height: calc(100dvh - 16rem);
  }
```

- [ ] **Step 8: 모바일 viewport(375px 너비)에서 각 모달 열고 이상 없음 확인**

DevTools에서 375×812 viewport로 스킨창, 설정창, 토큰샵, 업적창을 각각 열어 스크롤 가능함을 확인한다.

- [ ] **Step 9: Commit**

```bash
git add client/src/components/Lobby/LobbyScreen.css
git commit -m "fix: replace dvh-minus-rem modal heights with ratio-based dvh in mobile breakpoint"
```

---

## Task 5: LobbyScreen.css — 고정 px 배지/아이콘 → em 변환

**Files:**
- Modify: `client/src/components/Lobby/LobbyScreen.css:189-204, 336-346, 385-391`

### 배경

번호 배지(`28px`), 로딩 스피너(`14px`), 계정 스피너(`20px`)가 `px` 고정이라 OS 글꼴 크기 확대 시 텍스트와 비율이 틀어진다.
`em`으로 바꾸면 부모 폰트 크기(`1.1rem`)에 맞춰 자동 스케일된다.

- [ ] **Step 1: 번호 배지 `.lobby-card h2::before` px → em (line 189)**

```css
/* 변경 전 */
.lobby-card h2::before {
  content: attr(data-step);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(56, 102, 65, 0.2);
  border: 1px solid rgba(56, 102, 65, 0.4);
  color: var(--primary, #386641);
  font-size: 0.78rem;
  font-weight: 800;
  flex-shrink: 0;
}

/* 변경 후 */
.lobby-card h2::before {
  content: attr(data-step);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.75em;
  height: 1.75em;
  border-radius: 50%;
  background: rgba(56, 102, 65, 0.2);
  border: 1px solid rgba(56, 102, 65, 0.4);
  color: var(--primary, #386641);
  font-size: 0.78rem;
  font-weight: 800;
  flex-shrink: 0;
}
```

- [ ] **Step 2: 로딩 스피너 `.mode-content-card h2::after` px → em (line 336)**

```css
/* 변경 전 */
.mode-content-card.is-db-loading h2::after {
  content: "";
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid var(--tile-border, #3a444d);
  border-top-color: var(--primary, #386641);
  border-radius: 50%;
  animation: spin 0.75s linear infinite;
  flex-shrink: 0;
}

/* 변경 후 */
.mode-content-card.is-db-loading h2::after {
  content: "";
  display: inline-block;
  width: 0.875em;
  height: 0.875em;
  border: 2px solid var(--tile-border, #3a444d);
  border-top-color: var(--primary, #386641);
  border-radius: 50%;
  animation: spin 0.75s linear infinite;
  flex-shrink: 0;
}
```

- [ ] **Step 3: 계정 스피너 `.spinner.account-sync-spinner` px → em (line 385)**

```css
/* 변경 전 */
.spinner.account-sync-spinner {
  width: 20px;
  height: 20px;
  margin: 0;
  border-width: 1.75px;
  flex-shrink: 0;
}

/* 변경 후 */
.spinner.account-sync-spinner {
  width: 1.25em;
  height: 1.25em;
  margin: 0;
  border-width: 1.75px;
  flex-shrink: 0;
}
```

- [ ] **Step 4: 번호 배지 비율 확인**

브라우저에서 OS 글꼴 크기를 크게 설정하거나, DevTools에서 `html { font-size: 20px }` 를 강제 적용한 뒤 로비를 열어 번호 배지가 텍스트와 함께 커지는지 확인한다.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/Lobby/LobbyScreen.css
git commit -m "fix: replace fixed px badge/spinner sizes with em for font-scale compatibility"
```

---

## 최종 검증 체크리스트

- [ ] 100% 확대에서 로비 시각적 변화 없음
- [ ] 150% 확대에서 로고가 잘리지 않고 카드가 세로 스크롤로 접근 가능
- [ ] 200% 확대에서 로고가 잘리지 않고 카드가 세로 스크롤로 접근 가능
- [ ] 200% 확대에서 스킨창을 열었을 때 내용이 잘리지 않고 스크롤 가능
- [ ] 200% 확대에서 토큰샵을 열었을 때 내용이 잘리지 않고 스크롤 가능
- [ ] 200% 확대에서 설정창을 열었을 때 내용이 잘리지 않고 스크롤 가능
- [ ] 스킨창 / 설정창 / 토큰샵 / 업적창에 이중 스크롤바 없음
- [ ] 모바일(375px) 100% 기준에서 모달 정상 동작
- [ ] OS 글꼴 크기 확대 시 번호 배지가 텍스트 크기에 맞게 스케일됨
