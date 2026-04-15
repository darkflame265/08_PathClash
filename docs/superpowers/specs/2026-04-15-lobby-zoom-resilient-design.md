# 로비 확대/축소 대응 레이아웃 설계

**날짜:** 2026-04-15  
**범위:** `client/src/index.css`, `client/src/components/Lobby/LobbyScreen.css`  
**접근법:** Approach A — 외과적 최소 수정 (시각 스타일 유지)

---

## 목표

- 100% ~ 200%+ 확대/축소에서 레이아웃이 깨지지 않을 것
- 텍스트, 버튼, 카드가 커져도 잘리지 않고 자연스럽게 재배치될 것
- 필요 시 세로 스크롤 허용 (한 화면 고정 금지)
- 모바일 / 태블릿 / 데스크탑 + 확대 환경 모두 대응
- 현재 색상, 폰트, 카드 디자인 스타일 유지

---

## 원인 분석

### 1. 루트 height 잠금
`body { height: 100% }` + `#root { height: 100% }` 조합이 뷰포트 크기로 고정된다.  
확대 시 CSS px 기준 뷰포트가 작아지고, 내용이 컨테이너를 벗어나도 스크롤이 안 생겨 잘린다.

### 2. 모달 overflow: hidden
모달 외부 래퍼에 `overflow: hidden`이 있고, `max-height: min(46rem, calc(100dvh - 2rem))`로 높이가 제한된다.  
200% 확대 시 `100dvh`가 절반으로 줄어 내용이 잘린다.

### 3. px 고정 배지/아이콘
번호 배지(`28px`), 로딩 스피너(`14px`), 계정 스피너(`20px`)가 `px`로 고정되어 OS 글꼴 크기 변경 시 텍스트와 비율이 틀어진다.

---

## 변경 명세

### 섹션 1 — `index.css`: 루트/바디 스크롤 잠금 해제

```css
/* 변경 전 */
body {
  height: 100%;       /* ← 제거 */
  min-height: 100vh;
}

#root {
  height: 100%;       /* ← min-height: 100% 로 교체 */
}

/* 변경 후 */
body {
  /* height: 100% 삭제 — min-height: 100vh 이 이미 있으므로 중복 없음 */
  min-height: 100vh;
}

#root {
  min-height: 100%;
}
```

`html { height: 100% }`는 유지 (스크롤 앵커 역할).

---

### 섹션 2 — `LobbyScreen.css`: 모달 max-height + overflow 수정

영향 받는 모달: 스킨창, 설정창, 토큰샵, 모바일 미디어쿼리 내 변형

**패턴 변경:**

```css
/* 변경 전 */
.some-modal-wrapper {
  max-height: min(46rem, calc(100dvh - 2rem));
  overflow: hidden;
}

/* 변경 후 */
.some-modal-wrapper {
  max-height: min(46rem, 85dvh);  /* calc(100dvh - 2rem) → 85dvh */
  overflow-y: auto;               /* hidden → auto: 내용이 넘치면 스크롤 */
}
```

내부 스크롤 영역(`.xxx-list`, `.xxx-body` 등 이미 `overflow-y: auto` 가 달린 것)의 `max-height`는 외부 래퍼가 `overflow-y: auto`를 갖게 되므로 별도 max-height 제거 또는 `none`으로 해제한다. 스크롤은 외부 래퍼 단에서 처리한다.

모바일 `@media (max-width: 640px)` 내 `calc(100dvh - 16.5rem)` 등 고정 rem 빼기 패턴도 비율 기반으로 교체한다:
- `calc(100dvh - 16.5rem)` → `70dvh`
- `calc(100dvh - 9.5rem)` → `78dvh`
- `calc(100dvh - 16rem)` → `70dvh`

---

### 섹션 3 — `LobbyScreen.css`: 고정 px 배지/아이콘 → em 변환

| 선택자 | 속성 | 변경 전 | 변경 후 |
|---|---|---|---|
| `.lobby-card h2::before` | width, height | `28px` | `1.75em` |
| `.mode-content-card h2::after` | width, height | `14px` | `0.875em` |
| `.spinner.account-sync-spinner` | width, height | `20px` | `1.25em` |

**변환하지 않는 것:**
- `border-width`, `border-radius`, `1px` 선 — px 고정이 적절
- `clamp(2.7rem, 8vw, 3.35rem)` 처럼 이미 유동적인 값 — 건드리지 않음

---

## 비범위 (Out of scope)

- 모드 선택 그리드 4열 → 2열 리플로우 (Approach B 영역)
- CSS 전체 px → rem 변환 (Approach C 영역)
- 인게임 화면 레이아웃
- 시각 디자인(색상, 폰트, 카드 스타일) 변경

---

## 검증 기준

- [ ] 100%, 150%, 200% 브라우저 확대에서 로고가 잘리지 않음
- [ ] 200% 확대에서 모든 카드가 세로 스크롤로 접근 가능
- [ ] 스킨창 / 토큰샵 / 설정창을 200% 확대에서 열었을 때 내용이 잘리지 않음
- [ ] OS 글꼴 크기를 크게 설정했을 때 배지가 텍스트 크기에 맞게 스케일됨
- [ ] 100% 기본 상태에서 시각적 변화 없음
