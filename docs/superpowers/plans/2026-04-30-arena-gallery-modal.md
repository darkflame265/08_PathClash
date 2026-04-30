# Arena Gallery Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로비 아레나 이미지 클릭 시 아레나 1~10을 좌우 스와이프로 탐색할 수 있는 갤러리 모달을 추가한다.

**Architecture:** `arenaCatalog.ts`에 테마명과 아레나별 해금 스킨 데이터를 추가하고, 신규 `ArenaGalleryModal` 컴포넌트(touch/mouse 스와이프, bounce 애니메이션, 스킨 프리뷰)를 작성한 뒤 `LobbyScreen.tsx`에서 아레나 showcase 클릭 시 모달을 연다.

**Tech Stack:** React 19, TypeScript, CSS (추가 의존성 없음)

---

## 파일 목록

| 파일 | 변경 |
|------|------|
| `client/src/data/arenaCatalog.ts` | `themeName` 필드 추가, `ARENA_REWARD_SKINS` 상수 추가 |
| `client/src/components/Lobby/arena/ArenaGalleryModal.css` | 신규 |
| `client/src/components/Lobby/arena/ArenaGalleryModal.tsx` | 신규 |
| `client/src/components/Lobby/LobbyScreen.tsx` | `showArenaGallery` 상태, onClick, 모달 렌더링 추가 |

---

## Task 1: arenaCatalog.ts 데이터 확장

**Files:**
- Modify: `client/src/data/arenaCatalog.ts`

- [ ] **Step 1: `ArenaRange` 인터페이스에 `themeName` 추가 및 `ARENA_RANGES` 배열 업데이트**

`client/src/data/arenaCatalog.ts`를 다음과 같이 수정한다.

```ts
import type { PieceSkin } from "../types/game.types";

export interface ArenaRange {
  arena: number;
  label: string;
  themeName: string;
  minRating: number;
  maxRating: number;
}

export const ARENA_RANGES: ArenaRange[] = [
  { arena: 1,  label: "Arena 1",  themeName: "시작의 방",          minRating: 0,    maxRating: 199  },
  { arena: 2,  label: "Arena 2",  themeName: "네온사인-사이버펑크", minRating: 200,  maxRating: 499  },
  { arena: 3,  label: "Arena 3",  themeName: "화산지대",            minRating: 500,  maxRating: 899  },
  { arena: 4,  label: "Arena 4",  themeName: "번개지대",            minRating: 900,  maxRating: 1399 },
  { arena: 5,  label: "Arena 5",  themeName: "마법사의 방",         minRating: 1400, maxRating: 1999 },
  { arena: 6,  label: "Arena 6",  themeName: "피라미드",            minRating: 2000, maxRating: 2699 },
  { arena: 7,  label: "Arena 7",  themeName: "몽환의 숲",           minRating: 2700, maxRating: 3499 },
  { arena: 8,  label: "Arena 8",  themeName: "과학의 방",           minRating: 3500, maxRating: 4199 },
  { arena: 9,  label: "Arena 9",  themeName: "고산지대",            minRating: 4200, maxRating: 4799 },
  { arena: 10, label: "Arena 10", themeName: "천공의 신전",         minRating: 4800, maxRating: 4999 },
];
```

- [ ] **Step 2: `ARENA_REWARD_SKINS` 상수 추가**

`arenaCatalog.ts` 파일 끝에 추가한다 (기존 함수들 아래):

```ts
export const ARENA_REWARD_SKINS: Partial<Record<number, PieceSkin[]>> = {
  1:  ["cosmic", "plasma"],
  2:  ["neon_pulse", "quantum"],
  3:  ["inferno"],
  4:  ["electric_core"],
  5:  ["wizard"],
  6:  ["sun", "gold_core"],
  8:  ["atomic", "arc_reactor"],
  10: ["chronos"],
};
```

- [ ] **Step 3: 빌드 에러 없는지 확인**

```bash
cd client && npx tsc --noEmit
```

Expected: 에러 없음. `themeName`을 추가했으므로 기존 `ARENA_RANGES` 참조 코드는 그대로 동작한다.

- [ ] **Step 4: 커밋**

```bash
git add client/src/data/arenaCatalog.ts
git commit -m "feat: arenaCatalog에 themeName 필드와 ARENA_REWARD_SKINS 추가"
```

---

## Task 2: ArenaGalleryModal CSS 작성

**Files:**
- Create: `client/src/components/Lobby/arena/ArenaGalleryModal.css`

- [ ] **Step 1: CSS 파일 생성**

`client/src/components/Lobby/arena/ArenaGalleryModal.css` 를 생성한다:

```css
/* ── 모달 컨테이너 ─────────────────────────────── */
.arena-gallery-modal {
  width: min(100%, 36rem);
  padding: 0;
  gap: 0;
  overflow: hidden;
}

/* ── 아레나 showcase (로비와 동일 구조, 높이만 조정) ── */
.arena-gallery-showcase {
  width: 100%;
  height: clamp(10rem, 28dvh, 19rem);
  border-radius: 0;
  border: none;
  flex-shrink: 0;
  cursor: grab;
  user-select: none;
  -webkit-user-select: none;
}

.arena-gallery-showcase:active {
  cursor: grabbing;
}

/* 드래그 중에는 transition 없음; snap-back 시에만 transition 적용 */
.arena-gallery-showcase.is-snapping {
  transition: transform 0.25s ease;
}

/* bounce 애니메이션 */
.arena-gallery-showcase.is-bouncing {
  animation: arenaGalleryBounce 0.45s ease;
}

@keyframes arenaGalleryBounce {
  0%, 100% { transform: translateX(0); }
  25%       { transform: translateX(16px); }
  55%       { transform: translateX(-9px); }
  78%       { transform: translateX(4px); }
}

/* ── 아레나 이름 바 (오버레이) ─────────────────── */
/* arena-name-in-bar 안의 flex row 구조용 */
.arena-gallery-name-bar {
  display: flex;
  align-items: baseline;
  gap: 0.55rem;
  margin-bottom: 0.45rem;
}

.arena-gallery-label {
  font-size: 0.78rem;
  font-weight: 700;
  color: rgba(251, 191, 36, 0.65);
  letter-spacing: 0.07em;
  flex-shrink: 0;
}

/* ── 해금 스킨 영역 ─────────────────────────────── */
.arena-gallery-rewards {
  padding: 0.9rem 1.2rem 0;
  min-height: 5rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.arena-gallery-rewards-label {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--text-muted, #9aa4ae);
  letter-spacing: 0.04em;
}

.arena-gallery-previews {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
}

.arena-gallery-preview-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.3rem;
}

/* ── 닫기 버튼 영역 ─────────────────────────────── */
.arena-gallery-actions {
  padding: 0.9rem 1.2rem 1.2rem;
}
```

- [ ] **Step 2: 커밋**

```bash
git add client/src/components/Lobby/arena/ArenaGalleryModal.css
git commit -m "feat: ArenaGalleryModal CSS 추가"
```

---

## Task 3: ArenaGalleryModal.tsx 구현

**Files:**
- Create: `client/src/components/Lobby/arena/ArenaGalleryModal.tsx`

- [ ] **Step 1: 컴포넌트 작성**

`client/src/components/Lobby/arena/ArenaGalleryModal.tsx` 를 생성한다:

```tsx
import { useRef, useState } from "react";

import { AtomicPreview } from "../../../skins/legendary/atomic/Preview";
import { ChronosPreview } from "../../../skins/legendary/chronos/Preview";
import { SunPreview } from "../../../skins/legendary/sun/Preview";
import { WizardPreview } from "../../../skins/legendary/wizard/Preview";
import { CosmicPreview } from "../../../skins/rare/cosmic/Preview";
import { ArcReactorPreview } from "../../../skins/rare/arc_reactor/Preview";
import { ElectricCorePreview } from "../../../skins/rare/electric_core/Preview";
import { PlasmaPreview } from "../../../skins/common/plasma/Preview";
import { GoldCorePreview } from "../../../skins/common/gold_core/Preview";
import { NeonPulsePreview } from "../../../skins/common/neon_pulse/Preview";
import { InfernoPreview } from "../../../skins/common/inferno/Preview";
import { QuantumPreview } from "../../../skins/common/quantum/Preview";

import { ARENA_RANGES, ARENA_REWARD_SKINS } from "../../../data/arenaCatalog";
import { LobbyArenaOverlay } from "./LobbyArenaOverlay";
import type { PieceSkin } from "../../../types/game.types";

import "./ArenaGalleryModal.css";

interface ArenaGalleryModalProps {
  highestArena: number;
  currentRating: number;
  onClose: () => void;
}

const DRAG_THRESHOLD = 50;
const BOUNCE_DURATION_MS = 480;
const SNAP_DURATION_MS = 280;

function renderSkinPreview(skinId: PieceSkin) {
  switch (skinId) {
    case "plasma":        return <PlasmaPreview />;
    case "gold_core":     return <GoldCorePreview />;
    case "neon_pulse":    return <NeonPulsePreview />;
    case "cosmic":        return <CosmicPreview />;
    case "inferno":       return <InfernoPreview />;
    case "arc_reactor":   return <ArcReactorPreview />;
    case "electric_core": return <ElectricCorePreview />;
    case "quantum":       return <QuantumPreview />;
    case "wizard":        return <WizardPreview />;
    case "atomic":        return <AtomicPreview ready={true} />;
    case "chronos":       return <ChronosPreview />;
    case "sun":           return <SunPreview />;
    default:              return null;
  }
}

export function ArenaGalleryModal({
  highestArena,
  currentRating,
  onClose,
}: ArenaGalleryModalProps) {
  const [viewArena, setViewArena] = useState(highestArena);
  const [dragOffset, setDragOffset] = useState(0);
  const [isSnapping, setIsSnapping] = useState(false);
  const [isBouncing, setIsBouncing] = useState(false);

  const dragStartX = useRef<number | null>(null);
  const isDragging = useRef(false);

  const range = ARENA_RANGES.find((r) => r.arena === viewArena)!;
  const rewardSkins = ARENA_REWARD_SKINS[viewArena] ?? [];

  // 게이지 채움 비율
  const gaugePct =
    viewArena < highestArena
      ? 100
      : viewArena === highestArena
        ? Math.min(
            100,
            Math.max(
              0,
              ((currentRating - range.minRating) /
                (range.maxRating - range.minRating)) *
                100,
            ),
          )
        : 0;

  function startDrag(clientX: number) {
    if (isBouncing) return;
    dragStartX.current = clientX;
    isDragging.current = true;
    setIsSnapping(false);
  }

  function moveDrag(clientX: number) {
    if (!isDragging.current || dragStartX.current === null) return;
    setDragOffset(clientX - dragStartX.current);
  }

  function endDrag(clientX: number) {
    if (!isDragging.current || dragStartX.current === null) return;
    isDragging.current = false;
    const delta = clientX - dragStartX.current;
    dragStartX.current = null;

    if (Math.abs(delta) < DRAG_THRESHOLD) {
      setIsSnapping(true);
      setDragOffset(0);
      setTimeout(() => setIsSnapping(false), SNAP_DURATION_MS);
      return;
    }

    // delta > 0: 오른쪽 스와이프 → 이전(낮은) 아레나
    // delta < 0: 왼쪽 스와이프 → 다음(높은) 아레나
    const next = viewArena + (delta > 0 ? -1 : 1);
    setDragOffset(0);

    if (next < 1 || next > 10) {
      setIsBouncing(true);
      setTimeout(() => setIsBouncing(false), BOUNCE_DURATION_MS);
      return;
    }

    setViewArena(next);
  }

  function cancelDrag() {
    if (!isDragging.current) return;
    isDragging.current = false;
    dragStartX.current = null;
    setIsSnapping(true);
    setDragOffset(0);
    setTimeout(() => setIsSnapping(false), SNAP_DURATION_MS);
  }

  const showcaseTransform = isBouncing
    ? undefined
    : `translateX(${dragOffset}px)`;

  const showcaseClass = [
    "lobby-arena-showcase",
    "arena-gallery-showcase",
    isSnapping ? "is-snapping" : "",
    isBouncing ? "is-bouncing" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className="upgrade-modal-backdrop"
      onClick={onClose}
    >
      <div
        className="upgrade-modal skin-modal arena-gallery-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 아레나 이미지 + 오버레이 */}
        <figure
          className={showcaseClass}
          style={{ transform: showcaseTransform }}
          aria-label={`${range.label} ${range.themeName}`}
          onTouchStart={(e) => startDrag(e.touches[0].clientX)}
          onTouchMove={(e) => moveDrag(e.touches[0].clientX)}
          onTouchEnd={(e) => endDrag(e.changedTouches[0].clientX)}
          onMouseDown={(e) => startDrag(e.clientX)}
          onMouseMove={(e) => moveDrag(e.clientX)}
          onMouseUp={(e) => endDrag(e.clientX)}
          onMouseLeave={cancelDrag}
        >
          <img
            src={`/arena/arena${viewArena}.png`}
            alt={`${range.label} ${range.themeName}`}
            onError={(e) => {
              if (e.currentTarget.src.endsWith("/arena/arena6.png")) return;
              e.currentTarget.src = "/arena/arena6.png";
            }}
          />
          <LobbyArenaOverlay arena={viewArena} />
          <div className="arena-progress-bar-wrap" aria-hidden="true">
            <div className="arena-name-in-bar arena-gallery-name-bar">
              <span className="arena-gallery-label">{range.label}</span>
              <span>{range.themeName}</span>
            </div>
            <div className="arena-progress-labels">
              <span>{range.minRating}</span>
              <span>{range.maxRating}</span>
            </div>
            <div className="arena-progress-track">
              <div
                className="arena-progress-fill"
                style={{ width: `${gaugePct}%` }}
              />
            </div>
          </div>
        </figure>

        {/* 해금 스킨 영역 (스킨 없어도 공간 유지) */}
        <div className="arena-gallery-rewards">
          <span className="arena-gallery-rewards-label">해금 스킨</span>
          <div className="arena-gallery-previews">
            {rewardSkins.map((skinId) => (
              <div key={skinId} className="arena-gallery-preview-item">
                <span
                  className={`skin-preview skin-preview-${skinId}`}
                  aria-hidden="true"
                >
                  {renderSkinPreview(skinId)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 닫기 버튼 */}
        <div className="arena-gallery-actions">
          <button
            className="lobby-btn primary"
            type="button"
            onClick={onClose}
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 타입 에러 없는지 확인**

```bash
cd client && npx tsc --noEmit
```

Expected: 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add client/src/components/Lobby/arena/ArenaGalleryModal.tsx
git commit -m "feat: ArenaGalleryModal 컴포넌트 구현"
```

---

## Task 4: LobbyScreen.tsx 연결

**Files:**
- Modify: `client/src/components/Lobby/LobbyScreen.tsx`

- [ ] **Step 1: import 추가**

`LobbyScreen.tsx` 상단 import 블록에 추가한다. `LobbyArenaOverlay` import 바로 아래에 넣는다:

```ts
import { ArenaGalleryModal } from "./arena/ArenaGalleryModal";
```

- [ ] **Step 2: `showArenaGallery` 상태 추가**

LobbyScreen 내부 상태 선언부에 추가한다. 기존 `const [isModePickerOpen, setIsModePickerOpen] = useState(false);` 근처에 넣는다:

```ts
const [showArenaGallery, setShowArenaGallery] = useState(false);
```

- [ ] **Step 3: 아레나 showcase `<figure>`에 onClick 추가**

기존 코드:
```tsx
<figure
  className="lobby-arena-showcase"
  aria-label={lobbyArenaImageAlt}
>
```

변경 후:
```tsx
<figure
  className="lobby-arena-showcase"
  aria-label={lobbyArenaImageAlt}
  onClick={() => setShowArenaGallery(true)}
  style={{ cursor: "pointer" }}
>
```

- [ ] **Step 4: ArenaGalleryModal 렌더링 추가**

`LobbyScreen` return 블록 끝 부근(다른 모달들이 렌더링되는 위치)에 추가한다:

```tsx
{showArenaGallery && (
  <ArenaGalleryModal
    highestArena={highestArena}
    currentRating={currentRating}
    onClose={() => setShowArenaGallery(false)}
  />
)}
```

- [ ] **Step 5: 빌드 및 타입 확인**

```bash
cd client && npx tsc --noEmit && npm run build
```

Expected: 빌드 성공, 타입 에러 없음.

- [ ] **Step 6: 커밋**

```bash
git add client/src/components/Lobby/LobbyScreen.tsx
git commit -m "feat: 로비 아레나 이미지 클릭 시 ArenaGalleryModal 열기 연결"
```

---

## 수동 검증 체크리스트

구현 완료 후 앱을 실행해서 확인:

- [ ] 로비의 아레나 이미지를 클릭하면 갤러리 모달이 열린다
- [ ] 모달이 플레이어의 현재 아레나(highestArena)에서 시작한다
- [ ] 아레나 이미지 위에 이름(좌: "Arena N" 소문자 / 우: 테마명)과 게이지가 오버레이로 표시된다
- [ ] 좌우 스와이프(또는 마우스 드래그)로 다른 아레나로 이동한다
- [ ] 50px 미만 드래그는 제자리로 돌아온다
- [ ] 아레나 1에서 오른쪽 스와이프, 아레나 10에서 왼쪽 스와이프 시 bounce 애니메이션이 발생한다
- [ ] 클리어한 아레나: 게이지 100%, 현재 아레나: 실제 진행도, 미개방 아레나: 0%
- [ ] 해금 스킨이 있는 아레나: 스킨 프리뷰가 표시된다
- [ ] 해금 스킨이 없는 아레나(7, 9): 보상 영역은 빈 공간으로 유지된다
- [ ] 이미지가 없는 아레나: arena6.png fallback 이미지가 표시된다
- [ ] 배경 오버레이 클릭 시 모달이 닫힌다
- [ ] 하단 "닫기" 버튼으로 모달이 닫힌다
