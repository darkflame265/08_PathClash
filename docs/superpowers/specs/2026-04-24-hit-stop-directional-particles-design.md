# Hit Stop + 방향성 충돌 파티클 설계

날짜: 2026-04-24  
적용 모드: 일반전, Ability, 2v2

---

## 목표

충돌 순간 타격감을 강화하기 위해 두 가지 효과를 추가한다.

1. **Hit Stop**: 충돌 step에서 다음 tick을 100ms 늦춤
2. **방향성 파티클**: 충돌 방향을 계산해 스파크가 그 방향으로 집중해서 튀어나옴

---

## 1. Hit Stop

### 원리

각 모드의 애니메이션 루프는 `setTimeout(tick, STEP_DURATION)` 패턴으로 동작한다.  
충돌이 발생하는 step에서 딜레이를 `STEP_DURATION + 100`으로 늘린다.

### 변경 위치

| 파일 | 현재 | 변경 후 |
|------|------|---------|
| `socketHandlers.ts` | `setTimeout(tick, STEP_DURATION)` | `setTimeout(tick, STEP_DURATION + (collision ? 100 : 0))` |
| `AbilityScreen.tsx` | `queueAnimationTimeout(next, STEP_DURATION_MS)` | `queueAnimationTimeout(next, STEP_DURATION_MS + (hasCollision ? 100 : 0))` |
| `TwoVsTwoScreen.tsx` | `window.setTimeout(tick, STEP_DURATION_MS)` | `window.setTimeout(tick, STEP_DURATION_MS + (stepHits.length > 0 ? 100 : 0))` |

`HIT_STOP_MS = 100` 상수를 각 파일에 추가한다.

---

## 2. 방향성 파티클

### 충돌 방향 계산

**일반전 / Ability**

충돌 step `s`에서 공격자(non-escapee)의 이전→현재 이동 벡터를 사용한다.

```
attackerSeq = [attackerStart, ...attackerPath]
prev = attackerSeq[max(s - 1, 0)]
cur  = attackerSeq[s]

dx = cur.col - prev.col   (-1 | 0 | 1)
dy = cur.row  - prev.row  (-1 | 0 | 1)
primaryAngle = Math.atan2(dy, dx) * (180 / Math.PI)
```

예: 공격자가 오른쪽(dx=1, dy=0)에서 오면 primaryAngle = 0°

**2v2**

`TwoVsTwoPlayerHitEvent`에 공격자 정보가 없으므로, step `s`에서 피해자(victim slot) 위치와 겹치는 opposing team 플레이어를 `payload.paths`/`starts`에서 탐색한다.

```
victimSeq = [starts[slot], ...paths[slot]]
victimPos = victimSeq[min(s, victimSeq.length - 1)]

opposingSlots = slot이 red_* 이면 [blue_top, blue_bottom], 반대면 [red_top, red_bottom]
for each opSlot in opposingSlots:
  opSeq = [starts[opSlot], ...paths[opSlot]]
  if opSeq[min(s, opSeq.length-1)] === victimPos:
    dx = opSeq[s].col - opSeq[s-1].col
    dy = opSeq[s].row  - opSeq[s-1].row
    break

없으면 dx=0, dy=0 → fallback
```

### 스파크 분배 (6개)

| 스파크 | 각도 오프셋 | 역할 |
|--------|------------|------|
| a | 0° | 정면 |
| b | +30° | 우측 대각 |
| c | -30° | 좌측 대각 |
| d | +60° | 우측 넓은 각 |
| e | -60° | 좌측 넓은 각 |
| f | +180° | 후방 back-scatter |

결과: 5개가 충돌 진행 방향 ±60° 이내에 집중, 1개가 반대로 튀어나옴.

### 타입 변경

**`gameStore.ts`**:
```ts
collisionEffects: { id: number; position: Position; direction: { dx: number; dy: number } }[]

triggerCollisionEffect: (pos: Position, direction: { dx: number; dy: number }) => void
```

**`AbilityScreen.tsx` / `TwoVsTwoScreen.tsx`** local state:
```ts
{ id: number; position: Position; direction: { dx: number; dy: number } }[]
```

### CollisionEffect 컴포넌트 변경

```tsx
interface Props {
  position: Position;
  cellSize: number;
  direction?: { dx: number; dy: number };
}
```

- `direction`이 없거나 `dx === 0 && dy === 0`이면 기존 고정 각도 fallback
- `direction`이 있으면 primaryAngle을 계산해 각 스파크의 `--spark-rotate`를 인라인 스타일로 주입
- CSS에서 `.collision-effect-spark-a ~ f`의 `--spark-rotate` 하드코딩 제거 (인라인으로 대체)

---

## 영향 파일 목록

| 파일 | 변경 내용 |
|------|----------|
| `client/src/components/Effects/CollisionEffect.tsx` | direction prop 추가, 각도 계산 및 인라인 스타일 주입 |
| `client/src/components/Effects/CollisionEffect.css` | 스파크 클래스별 `--spark-rotate` 하드코딩 제거 |
| `client/src/store/gameStore.ts` | collisionEffects 타입, triggerCollisionEffect 시그니처 확장 |
| `client/src/socket/socketHandlers.ts` | 충돌 방향 계산, triggerCollisionEffect에 전달, hit stop |
| `client/src/components/Game/GameGrid.tsx` | CollisionEffect에 direction 전달 |
| `client/src/components/Ability/AbilityScreen.tsx` | local collisionEffects 타입, 방향 계산, hit stop |
| `client/src/components/Ability/AbilityGrid.tsx` | CollisionEffect에 direction 전달 |
| `client/src/components/TwoVsTwo/TwoVsTwoScreen.tsx` | local collisionEffects 타입, 방향 계산, hit stop |
| `client/src/components/TwoVsTwo/TwoVsTwoGrid.tsx` | CollisionEffect에 direction 전달 |

---

## 비변경 범위

- 서버 코드 (`GameEngine.ts`, `GameRoom.ts` 등) 변경 없음
- 충돌 판정 로직 변경 없음
- `CollisionEvent` 타입 변경 없음 (방향은 클라이언트에서 계산)
- Coop 모드: 충돌 판정 없어 적용 대상 아님
