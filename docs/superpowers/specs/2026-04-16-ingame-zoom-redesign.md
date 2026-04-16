# 인게임 화면 확대/축소 대응 레이아웃 재설계

**날짜**: 2026-04-16  
**범위**: GameScreen, AbilityScreen (일반 대결전 + 능력 대전)

---

## 1. 문제 정의

### 현상
- 브라우저 150% 확대(CSS 뷰포트 축소) 또는 OS 접근성 폰트 크기 증가 시 인게임 레이아웃 붕괴
- 문제 해상도: 817×782, 490×782 (CSS px)
- 정상 해상도: 490×1130, 932×1130, 1524×1130 (CSS px, 100% 줌)

### 근본 원인: `--gs-scale` 순환 의존성

현재 구조는 JS가 CSS 변수 `--gs-scale`을 계산하여 HUD 크기를 제어한다.  
이 값은 보드 그리드 셀 크기(`cellSize`)로부터 파생된다.

```
cellSize → scale → HUD 높이 → grid area 높이 → cellSize (순환)
```

`MAX_SCALE = 0.85` 캡이 수렴을 막아 다음과 같이 진동한다:

- 초기 scale = 0.85 → HUD 390px → board area 392px → cellSize 78px → scale 0.81
- scale = 0.81 → HUD 370px → board area 412px → cellSize 82px → scale 0.85 (캡)
- 무한 반복 → ResizeObserver 사이클 감지 → 레이아웃 동결 (잘못된 상태)

AbilityScreen은 스킬 패널 추가로 진동이 더 빠르게 발생한다.

---

## 2. 해결 방향

**로비와 동일한 방식**: JS 스케일 계산을 완전히 제거하고 순수 `rem` + `flex` 레이아웃으로 전환.

- **HUD 요소**: 순수 `rem` 단위 — 브라우저 줌/OS 폰트가 자연스럽게 흡수
- **보드 그리드**: JS `cellSize` 유지 — ResizeObserver가 남은 공간에 맞춤
- **순환 의존성 소멸**: HUD 크기가 JS scale에 의존하지 않으므로 피드백 루프 없음

### 동작 원리 (150% 줌 예시)

```
뷰포트: 490×782 CSS px
HUD (순수 rem, 16px 기준): ~200px
board area (flex: 1): ~582px
ResizeObserver → cellSize = min(466, 582) / 5 = 93px
board: 465×465px  ✓
```

OS 폰트 20px (접근성 125%) + 150% 줌:

```
뷰포트: 490×782 CSS px
HUD (rem at 20px): ~250px
board area: ~532px
cellSize = min(466, 532) / 5 = 93px
board: 465×465px  ✓
```

---

## 3. 변경 파일 목록

### 3-1. TypeScript 파일

#### `client/src/components/Game/GameScreen.tsx`
- `const MAX_SCALE = 0.85` 삭제
- `const scale = Math.min(cellSize / DEFAULT_CELL, MAX_SCALE)` 삭제
- `style={{ "--gs-scale": scale } as CSSProperties}` 삭제
- `type CSSProperties` import 삭제 (미사용 시)

#### `client/src/components/Ability/AbilityScreen.tsx`
- 동일 (scale 계산 및 `--gs-scale` style prop 제거)

### 3-2. CSS 파일

**공통 규칙**: `calc(X * var(--gs-scale, 1))` → `X`  
픽셀 기반 배수(`calc(Npx * var(--gs-scale, 1))`)는 `N/16 rem`으로 변환.

#### `client/src/components/Game/GameScreen.css`
- padding, gap, border-radius, min-width, height 등 전체 `--gs-scale` 제거
- `clamp(min, calc(X * var(--gs-scale, 1)), max)` → `X` (또는 적절한 고정값)

#### `client/src/components/Game/TimerBar.css`
- `height: 22px` → `height: 1.375rem`

#### `client/src/components/Game/HpDisplay.css`
- `calc(X * var(--gs-scale, 1))` → `X`
- `calc(2px * var(--gs-scale, 1))` → `0.125rem`

#### `client/src/components/Game/PlayerInfo.css`
- scale 관련 `calc()` 제거

#### `client/src/components/Ability/AbilityScreen.css`
- 전체 `--gs-scale` 참조 제거

---

## 4. 유지되는 것

- `useAdaptiveCellSize` 훅: 보드 그리드 크기 계산용으로 그대로 유지
- `cellSize` → `GameGrid`에 전달하는 흐름: 변경 없음
- `MIN_CELL = 52`, `MAX_CELL = 160` 상수: 유지
- `@media (max-height: 820px)`, `@media (max-height: 420px)`, `@media (max-width: 360px)` breakpoints: 유지 (단, 각 규칙 내 scale 곱셈 제거)
- 보드 배경 스킨 클래스 (`board-bg-pharaoh-screen` 등): 변경 없음
- 튜토리얼 힌트, `game-over-overlay`: 변경 없음

---

## 5. 예상 결과

| 환경 | 변경 전 | 변경 후 |
|---|---|---|
| 100% 줌, 490×1130 | 정상 | 정상 |
| 150% 줌, 490×782 | 레이아웃 붕괴 | 정상 |
| 150% 줌, 817×782 | 레이아웃 붕괴 | 정상 |
| OS 폰트 125%, 모바일 | 불안정 | 정상 |
| 태블릿 1024×768 | 정상 (scale 0.85) | 정상 (HUD 미세하게 더 큼, 허용 범위) |

---

## 6. 비범위

- 로비 화면: 이미 재설계 완료, 변경 없음
- 보드 스킨 렌더링 로직: 변경 없음
- 서버 로직: 변경 없음
- `GameGrid.css`: 변경 없음 (보드 그리드 자체는 cellSize JS로 제어)
