# Arena Gallery Modal — Design Spec
**Date:** 2026-04-30

## Overview

로비의 아레나 이미지를 클릭하면 아레나 갤러리 모달이 열린다. 사용자는 좌우 스와이프로 아레나 1~10을 탐색하며 각 아레나의 이미지, 레이팅 범위, 해금 스킨을 확인할 수 있다.

---

## 신규/수정 파일

| 파일 | 변경 |
|------|------|
| `client/src/components/Lobby/arena/ArenaGalleryModal.tsx` | 신규 |
| `client/src/components/Lobby/arena/ArenaGalleryModal.css` | 신규 |
| `client/src/data/arenaCatalog.ts` | `ArenaRange`에 `themeName` 필드 추가, `ARENA_REWARD_SKINS` 상수 추가 |
| `client/src/components/Lobby/LobbyScreen.tsx` | `showArenaGallery` 상태 추가, 아레나 showcase onClick 추가, ArenaGalleryModal 렌더링 |

---

## arenaCatalog.ts 변경

`ArenaRange` 인터페이스에 `themeName: string` 필드 추가.

```ts
export interface ArenaRange {
  arena: number;
  label: string;
  themeName: string;
  minRating: number;
  maxRating: number;
}
```

전체 아레나 데이터:

| arena | label | themeName | minRating | maxRating |
|-------|-------|-----------|-----------|-----------|
| 1 | Arena 1 | 시작의 방 | 0 | 199 |
| 2 | Arena 2 | 네온사인-사이버펑크 | 200 | 499 |
| 3 | Arena 3 | 화산지대 | 500 | 899 |
| 4 | Arena 4 | 번개지대 | 900 | 1399 |
| 5 | Arena 5 | 마법사의 방 | 1400 | 1999 |
| 6 | Arena 6 | 피라미드 | 2000 | 2699 |
| 7 | Arena 7 | 몽환의 숲 | 2700 | 3499 |
| 8 | Arena 8 | 과학의 방 | 3500 | 4199 |
| 9 | Arena 9 | 고산지대 | 4200 | 4799 |
| 10 | Arena 10 | 천공의 신전 | 4800 | 4999 |

아레나별 해금 스킨 (`ARENA_REWARD_SKINS`) — `arenaCatalog.ts`에 추가:

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

아레나 7, 9는 해금 스킨 없음 (키 없음).

---

## ArenaGalleryModal — Props

```ts
interface ArenaGalleryModalProps {
  highestArena: number;    // 초기 표시 아레나 + 클리어 판단 기준
  currentRating: number;   // 현재 아레나 실제 진행도 계산용
  onClose: () => void;
}
```

---

## 레이아웃

```
┌──────────────────────────────────────┐
│                                      │
│     [ 아레나 이미지 (object-fit cover) ]  │  ← lobby-arena-showcase 구조 그대로
│                                      │
│  Arena 1   시작의 방   ← 이미지 오버레이  │  ← arena-name-in-bar (absolute bottom)
│  ████████░░░  0 / 199  ← 이미지 오버레이 │  ← arena-progress-bar-wrap (absolute bottom)
└──────────────────────────────────────┘
  해금 스킨:
  [프리뷰1]  [프리뷰2]                      ← 스킨 없으면 공간 유지, 프리뷰만 없음
        [ 닫기 ]                            ← lobby-btn primary
```

- 이미지+오버레이 블록: 로비의 `.lobby-arena-showcase` + `.arena-progress-bar-wrap` + `.arena-name-in-bar` CSS 클래스를 그대로 재사용
- `arena-name-in-bar` 내부 구조 변경: 좌측 소문자 `Arena 1` + 우측 테마명 `시작의 방` (flex row)
- 모달 컨테이너: `upgrade-modal-backdrop` + `upgrade-modal skin-modal` 클래스 재사용
- 배경 오버레이 클릭 시 닫힘

---

## 게이지 바 채움 규칙

| 조건 | 채움 |
|------|------|
| 보고 있는 아레나 < highestArena | 100% (이미 클리어) |
| 보고 있는 아레나 === highestArena | 실제 진행도 (currentRating 기반) |
| 보고 있는 아레나 > highestArena | 0% (미개방) |

---

## 스와이프 동작

- **좌→우 스와이프**: 이전(낮은) 아레나로 이동
- **우→좌 스와이프**: 다음(높은) 아레나로 이동
- `onTouchStart` / `onTouchMove` / `onTouchEnd` + `onMouseDown` / `onMouseMove` / `onMouseUp` 동일 처리
- 드래그 threshold: 50px. 미달 시 `transition: transform 0.25s ease`로 제자리 복귀
- 전환 애니메이션: `transition: transform 0.25s ease`
- 경계(arena 1 또는 arena 10)에서 스와이프 시도 시 `@keyframes arenaGalleryBounce`로 bounce 연출

---

## 이미지 fallback

```tsx
<img
  src={`/arena/arena${viewArena}.png`}
  onError={(e) => { e.currentTarget.src = "/arena/arena6.png"; }}
/>
```

---

## LobbyScreen 변경 요약

```tsx
const [showArenaGallery, setShowArenaGallery] = useState(false);

// 아레나 showcase figure에 추가:
<figure
  className="lobby-arena-showcase"
  onClick={() => setShowArenaGallery(true)}
  style={{ cursor: "pointer" }}
  ...
>

// 렌더링 끝 부근에 추가:
{showArenaGallery && (
  <ArenaGalleryModal
    highestArena={highestArena}
    currentRating={currentRating}
    onClose={() => setShowArenaGallery(false)}
  />
)}
```

---

## 스킨 프리뷰 컴포넌트 매핑

`ArenaGalleryModal.tsx` 내부에서 `PieceSkin → Preview 컴포넌트` 매핑을 통해 해당 아레나의 스킨 프리뷰를 렌더링한다. 기존 `LobbyScreen.tsx`에서 import하는 Preview 컴포넌트들을 동일하게 사용한다.
