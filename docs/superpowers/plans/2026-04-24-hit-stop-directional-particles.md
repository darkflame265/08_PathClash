# Hit Stop + 방향성 충돌 파티클 구현 플랜

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 충돌 순간 100ms hit stop을 추가하고, 충돌 파티클이 공격자 진행 방향으로 집중해서 튀어나오게 한다.

**Architecture:** `CollisionEffect` 컴포넌트에 `direction` prop을 추가해 스파크 각도를 동적으로 결정한다. 각 모드의 애니메이션 루프에서 충돌 step에 100ms hit stop을 추가하고, 공격자 경로 시퀀스에서 충돌 방향을 계산해 effect에 전달한다.

**Tech Stack:** React, TypeScript, CSS Custom Properties (--spark-rotate), Zustand

---

## 파일 목록

| 파일 | 작업 |
|------|------|
| `client/src/components/Effects/CollisionEffect.tsx` | direction prop 추가, 스파크 각도 동적 계산 |
| `client/src/store/gameStore.ts` | collisionEffects 타입 및 triggerCollisionEffect 시그니처 확장 |
| `client/src/socket/socketHandlers.ts` | 충돌 방향 계산, hit stop, direction 전달 |
| `client/src/components/Game/GameGrid.tsx` | CollisionEffect에 direction 전달 |
| `client/src/components/Ability/AbilityScreen.tsx` | local state 타입, triggerLocalHit direction, hit stop |
| `client/src/components/Ability/AbilityGrid.tsx` | CollisionEffect에 direction 전달 |
| `client/src/components/TwoVsTwo/TwoVsTwoScreen.tsx` | local state 타입, 방향 계산, hit stop |
| `client/src/components/TwoVsTwo/TwoVsTwoGrid.tsx` | CollisionEffect에 direction 전달 |

---

## Task 1: CollisionEffect — direction prop 추가

**Files:**
- Modify: `client/src/components/Effects/CollisionEffect.tsx`

스파크 6개의 각도 분배: `[0, 30, -30, 60, -60, 180]` (primaryAngle 기준 오프셋).
direction이 없거나 zero vector면 기존 CSS 클래스 값 그대로 (fallback).

- [ ] **Step 1: CollisionEffect.tsx 수정**

```tsx
import type { Position } from '../../types/game.types';
import './CollisionEffect.css';

interface Props {
  position: Position;
  cellSize: number;
  direction?: { dx: number; dy: number };
}

const SPARK_LETTERS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;
const DIRECTIONAL_OFFSETS = [0, 30, -30, 60, -60, 180];

export function CollisionEffect({ position, cellSize, direction }: Props) {
  const x = position.col * cellSize + cellSize / 2;
  const y = position.row * cellSize + cellSize / 2;
  const effectSize = Math.max(34, Math.round(cellSize * 0.72));

  const hasDirection = direction && (direction.dx !== 0 || direction.dy !== 0);
  const primaryAngle = hasDirection
    ? Math.atan2(direction!.dy, direction!.dx) * (180 / Math.PI)
    : null;

  return (
    <div
      className="collision-effect"
      style={{
        left: x,
        top: y,
        width: effectSize,
        height: effectSize,
        transform: 'translate(-50%, -50%)',
      }}
    >
      <span className="collision-effect-core" />
      {SPARK_LETTERS.map((letter, i) => (
        <span
          key={letter}
          className={`collision-effect-spark collision-effect-spark-${letter}`}
          style={
            primaryAngle !== null
              ? ({ '--spark-rotate': `${primaryAngle + DIRECTIONAL_OFFSETS[i]}deg` } as React.CSSProperties)
              : undefined
          }
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: 빌드 확인**

```bash
cd client && npm run build
```

Expected: 에러 없이 빌드 성공.

- [ ] **Step 3: 커밋**

```bash
git add client/src/components/Effects/CollisionEffect.tsx
git commit -m "feat: CollisionEffect에 방향성 파티클 direction prop 추가"
```

---

## Task 2: gameStore — collisionEffects 타입 확장

**Files:**
- Modify: `client/src/store/gameStore.ts`

- [ ] **Step 1: collisionEffects 타입 변경**

`client/src/store/gameStore.ts`에서:

```ts
// 변경 전
collisionEffects: { id: number; position: Position }[];

// 변경 후
collisionEffects: { id: number; position: Position; direction: { dx: number; dy: number } }[];
```

인터페이스 `GameStore`의 해당 라인과 초기값(`collisionEffects: []`) 모두 확인 — 초기값은 빈 배열이므로 타입만 선언 변경.

- [ ] **Step 2: triggerCollisionEffect 시그니처 변경**

`GameStore` 인터페이스:
```ts
// 변경 전
triggerCollisionEffect: (pos: Position) => void;

// 변경 후
triggerCollisionEffect: (pos: Position, direction: { dx: number; dy: number }) => void;
```

구현체:
```ts
triggerCollisionEffect: (pos, direction) => {
  const id = Date.now();
  set({
    collisionEffects: [...get().collisionEffects, { id, position: pos, direction }],
  });
  setTimeout(
    () =>
      set({
        collisionEffects: get().collisionEffects.filter((e) => e.id !== id),
      }),
    600,
  );
},
```

- [ ] **Step 3: 빌드 확인 (타입 에러 예상)**

```bash
cd client && npm run build 2>&1 | head -40
```

Expected: `triggerCollisionEffect` 호출 측에서 argument 개수 에러 — Task 3에서 수정 예정.

- [ ] **Step 4: 커밋**

```bash
git add client/src/store/gameStore.ts
git commit -m "feat: gameStore collisionEffects에 direction 타입 추가"
```

---

## Task 3: socketHandlers.ts — 일반전 hit stop + direction

**Files:**
- Modify: `client/src/socket/socketHandlers.ts`

현재 구조 (line ~129-187):
- `STEP_DURATION = 200`, `HIT_VISUAL_DELAY_MS = 100`
- `const collision = collisionMap.get(step)` 후 처리
- 마지막 줄: `setTimeout(tick, STEP_DURATION)`

- [ ] **Step 1: HIT_STOP_MS 상수 추가 및 충돌 방향 계산 + hit stop 적용**

```ts
const STEP_DURATION = 200; // ms per step
const HIT_VISUAL_DELAY_MS = 100;
const HIT_STOP_MS = 100;

function runAnimation(payload: PathsRevealPayload): void {
  const { redPath, bluePath, redStart, blueStart, collisions } = payload;
  const store = useGameStore.getState;

  const redSeq = [redStart, ...redPath];
  const blueSeq = [blueStart, ...bluePath];
  const maxSteps = Math.max(redSeq.length, blueSeq.length);

  const collisionMap = new Map<number, typeof collisions[0]>();
  for (const c of collisions) collisionMap.set(c.step, c);

  let step = 0;
  const tick = () => {
    if (step >= maxSteps) {
      store().finishAnimation();
      return;
    }

    const newRed = redSeq[Math.min(step, redSeq.length - 1)];
    const newBlue = blueSeq[Math.min(step, blueSeq.length - 1)];
    useGameStore.setState({ redDisplayPos: newRed, blueDisplayPos: newBlue });

    const collision = collisionMap.get(step);
    if (collision) {
      const escapee = collision.escapeeColor;
      const attackerColor = escapee === 'red' ? 'blue' : 'red';
      const attackerSeq = attackerColor === 'red' ? redSeq : blueSeq;
      const cur = attackerSeq[Math.min(step, attackerSeq.length - 1)];
      const prev = attackerSeq[Math.max(step - 1, 0)];
      const direction = { dx: cur.col - prev.col, dy: cur.row - prev.row };

      const gs = store().gameState;
      if (gs) {
        useGameStore.setState({
          gameState: {
            ...gs,
            players: {
              ...gs.players,
              [escapee]: { ...gs.players[escapee], hp: collision.newHp },
            },
          },
        });
      }

      window.setTimeout(() => {
        store().triggerHit(escapee);
        store().triggerCollisionEffect(collision.position, direction);
        const prevHp = collision.newHp + 1;
        store().triggerHeartShake(escapee, prevHp - 1);
        if (!store().isSfxMuted) playHit(store().sfxVolume);
        if (collision.newHp <= 0) {
          store().triggerExplosion(escapee);
        }
      }, HIT_VISUAL_DELAY_MS);
    }

    step++;
    setTimeout(tick, STEP_DURATION + (collision ? HIT_STOP_MS : 0));
  };

  setTimeout(tick, STEP_DURATION);
}
```

- [ ] **Step 2: 빌드 확인**

```bash
cd client && npm run build 2>&1 | grep -E "error|Error" | head -20
```

Expected: socketHandlers 관련 에러 없음. gameStore 호출 측 에러 해소.

- [ ] **Step 3: 커밋**

```bash
git add client/src/socket/socketHandlers.ts
git commit -m "feat: 일반전 충돌 방향 계산 및 hit stop 100ms 추가"
```

---

## Task 4: GameGrid.tsx — direction 전달

**Files:**
- Modify: `client/src/components/Game/GameGrid.tsx`

현재 (line ~724-730):
```tsx
{collisionEffects.map(({ id, position }) => (
  <CollisionEffect
    key={id}
    position={position}
    cellSize={responsiveCellSize}
  />
))}
```

- [ ] **Step 1: direction 구조분해 및 전달**

```tsx
{collisionEffects.map(({ id, position, direction }) => (
  <CollisionEffect
    key={id}
    position={position}
    cellSize={responsiveCellSize}
    direction={direction}
  />
))}
```

- [ ] **Step 2: 빌드 확인**

```bash
cd client && npm run build 2>&1 | grep -E "error|Error" | head -20
```

Expected: 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add client/src/components/Game/GameGrid.tsx
git commit -m "feat: GameGrid에서 CollisionEffect에 direction 전달"
```

---

## Task 5: AbilityScreen.tsx — hit stop + direction

**Files:**
- Modify: `client/src/components/Ability/AbilityScreen.tsx`

**변경 지점 3곳:**
1. `collisionEffects` local state 타입 (line ~451)
2. `triggerLocalHit` 함수 — direction 파라미터 추가 (line ~2017)
3. `applyCollision` 함수 — 방향 계산 + 전달 (line ~2785)
4. `advance()` 함수 — hit stop (line ~2972, 3025)

- [ ] **Step 1: collisionEffects state 타입 변경**

파일 내 다음 부분을 찾아 수정:
```ts
// 변경 전
const [collisionEffects, setCollisionEffects] = useState<
  { id: number; position: Position }[]
>([]);

// 변경 후
const [collisionEffects, setCollisionEffects] = useState<
  { id: number; position: Position; direction: { dx: number; dy: number } }[]
>([]);
```

- [ ] **Step 2: triggerLocalHit에 direction 파라미터 추가**

```ts
// 변경 전
const triggerLocalHit = (
  color: PlayerColor,
  hpAfter: number,
  position: Position,
) => {
  queueAnimationTimeout(() => {
    setHitFlags((prev) => ({ ...prev, [color]: true }));
    queueAnimationTimeout(() => {
      setHitFlags((prev) => ({ ...prev, [color]: false }));
    }, 650);
    triggerHeartShake(color, Math.max(0, hpAfter));
    const effectId = Date.now() + Math.random();
    setCollisionEffects((prev) => [...prev, { id: effectId, position }]);
    queueAnimationTimeout(() => {
      setCollisionEffects((prev) =>
        prev.filter((entry) => entry.id !== effectId),
      );
    }, 600);
    if (!isSfxMuted) playHit(sfxVolume);
    if (hpAfter <= 0) {
      queueAnimationTimeout(() => {
        setExplodingFlags((prev) => ({ ...prev, [color]: true }));
        queueAnimationTimeout(() => {
          setExplodingFlags((prev) => ({ ...prev, [color]: false }));
        }, 600);
      }, 600);
    }
  }, HIT_VISUAL_DELAY_MS);
};

// 변경 후
const triggerLocalHit = (
  color: PlayerColor,
  hpAfter: number,
  position: Position,
  direction: { dx: number; dy: number } = { dx: 0, dy: 0 },
) => {
  queueAnimationTimeout(() => {
    setHitFlags((prev) => ({ ...prev, [color]: true }));
    queueAnimationTimeout(() => {
      setHitFlags((prev) => ({ ...prev, [color]: false }));
    }, 650);
    triggerHeartShake(color, Math.max(0, hpAfter));
    const effectId = Date.now() + Math.random();
    setCollisionEffects((prev) => [...prev, { id: effectId, position, direction }]);
    queueAnimationTimeout(() => {
      setCollisionEffects((prev) =>
        prev.filter((entry) => entry.id !== effectId),
      );
    }, 600);
    if (!isSfxMuted) playHit(sfxVolume);
    if (hpAfter <= 0) {
      queueAnimationTimeout(() => {
        setExplodingFlags((prev) => ({ ...prev, [color]: true }));
        queueAnimationTimeout(() => {
          setExplodingFlags((prev) => ({ ...prev, [color]: false }));
        }, 600);
      }, 600);
    }
  }, HIT_VISUAL_DELAY_MS);
};
```

- [ ] **Step 3: applyCollision에 방향 계산 추가**

`runAnimation` 클로저 안에 있는 `applyCollision` 함수 (line ~2785):

```ts
// 변경 전
const applyCollision = (
  collision: AbilityResolutionPayload["collisions"][number],
) => {
  setState((prev) => {
    if (!prev) return prev;
    const currentHp = prev.players[collision.escapeeColor].hp;
    return {
      ...prev,
      players: {
        ...prev.players,
        [collision.escapeeColor]: {
          ...prev.players[collision.escapeeColor],
          hp: Math.min(currentHp, collision.newHp),
        },
      },
    };
  });
  triggerLocalHit(
    collision.escapeeColor,
    collision.newHp,
    collision.position,
  );
};

// 변경 후
const applyCollision = (
  collision: AbilityResolutionPayload["collisions"][number],
) => {
  setState((prev) => {
    if (!prev) return prev;
    const currentHp = prev.players[collision.escapeeColor].hp;
    return {
      ...prev,
      players: {
        ...prev.players,
        [collision.escapeeColor]: {
          ...prev.players[collision.escapeeColor],
          hp: Math.min(currentHp, collision.newHp),
        },
      },
    };
  });
  const attackerColor = collision.escapeeColor === 'red' ? 'blue' : 'red';
  const attackerSeq = attackerColor === 'red' ? redSeq : blueSeq;
  const s = collision.step;
  const cur = attackerSeq[Math.min(s, attackerSeq.length - 1)];
  const prev = attackerSeq[Math.max(s - 1, 0)];
  const direction = { dx: cur.col - prev.col, dy: cur.row - prev.row };
  triggerLocalHit(
    collision.escapeeColor,
    collision.newHp,
    collision.position,
    direction,
  );
};
```

- [ ] **Step 4: advance()에 hit stop 추가**

`advance` 함수 내에서 `STEP_DURATION_MS`를 사용하는 `queueAnimationTimeout` (line ~3025):

```ts
// 변경 전 (line ~3025)
queueAnimationTimeout(() => {
  runStepEventsAndCollisions(step, () => {
    const finalizeDefenseEnd = () => { ... };
    finalizeDefenseEnd();
  });
}, STEP_DURATION_MS);

// 변경 후
const stepHasCollision = (collisionMap.get(step) ?? []).length > 0;
queueAnimationTimeout(() => {
  runStepEventsAndCollisions(step, () => {
    const finalizeDefenseEnd = () => { ... };
    finalizeDefenseEnd();
  });
}, STEP_DURATION_MS + (stepHasCollision ? HIT_STOP_MS : 0));
```

`HIT_STOP_MS = 100` 상수를 `STEP_DURATION_MS = 200` 근처 (line ~77)에 추가:
```ts
const HIT_STOP_MS = 100;
```

- [ ] **Step 5: 빌드 확인**

```bash
cd client && npm run build 2>&1 | grep -E "error|Error" | head -20
```

Expected: 에러 없음.

- [ ] **Step 6: 커밋**

```bash
git add client/src/components/Ability/AbilityScreen.tsx
git commit -m "feat: Ability 모드 hit stop + 충돌 방향성 파티클"
```

---

## Task 6: AbilityGrid.tsx — direction 전달

**Files:**
- Modify: `client/src/components/Ability/AbilityGrid.tsx`

현재 (line ~1170):
```tsx
<CollisionEffect
  key={id}
  position={position}
  cellSize={responsiveCellSize}
/>
```

- [ ] **Step 1: collisionEffects prop 타입 확인 및 direction 전달**

`AbilityGrid.tsx`의 `collisionEffects` prop 타입을 찾아 direction 포함하도록 업데이트:

```ts
// 인터페이스 props 또는 인라인 타입 찾아서
collisionEffects: { id: number; position: Position; direction: { dx: number; dy: number } }[];
```

렌더링 부분:
```tsx
{collisionEffects.map(({ id, position, direction }) => (
  <CollisionEffect
    key={id}
    position={position}
    cellSize={responsiveCellSize}
    direction={direction}
  />
))}
```

- [ ] **Step 2: 빌드 확인**

```bash
cd client && npm run build 2>&1 | grep -E "error|Error" | head -20
```

- [ ] **Step 3: 커밋**

```bash
git add client/src/components/Ability/AbilityGrid.tsx
git commit -m "feat: AbilityGrid에서 CollisionEffect에 direction 전달"
```

---

## Task 7: TwoVsTwoScreen.tsx — hit stop + direction

**Files:**
- Modify: `client/src/components/TwoVsTwo/TwoVsTwoScreen.tsx`

- [ ] **Step 1: HIT_STOP_MS 상수 추가 + collisionEffects 타입 변경**

`STEP_DURATION_MS = 200` 근처에:
```ts
const HIT_STOP_MS = 100;
```

local state 타입:
```ts
// 변경 전
const [collisionEffects, setCollisionEffects] = useState<{ id: number; position: Position }[]>([]);

// 변경 후
const [collisionEffects, setCollisionEffects] = useState<
  { id: number; position: Position; direction: { dx: number; dy: number } }[]
>([]);
```

- [ ] **Step 2: 방향 계산 헬퍼 추가 (컴포넌트 바깥)**

파일 상단 import 이후, 컴포넌트 정의 전에 추가:

```ts
function calcHitDirection(
  slot: TwoVsTwoSlot,
  step: number,
  paths: Record<TwoVsTwoSlot, Position[]>,
  starts: Record<TwoVsTwoSlot, Position>,
): { dx: number; dy: number } {
  const victimSeq = [starts[slot], ...paths[slot]];
  const victimPos = victimSeq[Math.min(step, victimSeq.length - 1)];
  const opposingSlots: TwoVsTwoSlot[] = slot.startsWith('red')
    ? ['blue_top', 'blue_bottom']
    : ['red_top', 'red_bottom'];

  for (const opSlot of opposingSlots) {
    const opSeq = [starts[opSlot], ...paths[opSlot]];
    const opCur = opSeq[Math.min(step, opSeq.length - 1)];
    if (opCur.row === victimPos.row && opCur.col === victimPos.col) {
      const opPrev = opSeq[Math.max(step - 1, 0)];
      return { dx: opCur.col - opPrev.col, dy: opCur.row - opPrev.row };
    }
  }
  return { dx: 0, dy: 0 };
}
```

- [ ] **Step 3: tick 함수에서 direction 계산 + setCollisionEffects 업데이트 + hit stop 추가**

현재 (line ~336):
```ts
setCollisionEffects(
  stepHits.map((hit) => ({
    id: Date.now() + Math.random(),
    position: ([payload.starts[hit.slot], ...payload.paths[hit.slot]])[
      Math.min(step + 1, payload.paths[hit.slot].length)
    ],
  })),
);
```

변경 후:
```ts
setCollisionEffects(
  stepHits.map((hit) => ({
    id: Date.now() + Math.random(),
    position: ([payload.starts[hit.slot], ...payload.paths[hit.slot]])[
      Math.min(step + 1, payload.paths[hit.slot].length)
    ],
    direction: calcHitDirection(hit.slot, step, payload.paths, payload.starts),
  })),
);
```

hit stop — tick 함수 내부의 마지막 줄(step 진행 후 next tick 예약)만 수정. 최초 호출(`timeoutRef.current = window.setTimeout(tick, STEP_DURATION_MS)` 루프 바깥 줄)은 수정 하지 않음.

```ts
// tick() 함수 내부 마지막 줄만:
// 변경 전
timeoutRef.current = window.setTimeout(tick, STEP_DURATION_MS);

// 변경 후
timeoutRef.current = window.setTimeout(tick, STEP_DURATION_MS + (stepHits.length > 0 ? HIT_STOP_MS : 0));
```

- [ ] **Step 4: 빌드 확인**

```bash
cd client && npm run build 2>&1 | grep -E "error|Error" | head -20
```

Expected: 에러 없음.

- [ ] **Step 5: 커밋**

```bash
git add client/src/components/TwoVsTwo/TwoVsTwoScreen.tsx
git commit -m "feat: 2v2 모드 hit stop + 충돌 방향성 파티클"
```

---

## Task 8: TwoVsTwoGrid.tsx — direction 전달

**Files:**
- Modify: `client/src/components/TwoVsTwo/TwoVsTwoGrid.tsx`

현재 (line ~317):
```tsx
<CollisionEffect key={id} position={position} cellSize={responsiveCellSize} />
```

- [ ] **Step 1: collisionEffects prop 타입 업데이트 + direction 전달**

`TwoVsTwoGrid.tsx`의 `collisionEffects` prop 타입에 direction 추가:
```ts
collisionEffects: { id: number; position: Position; direction: { dx: number; dy: number } }[];
```

렌더링:
```tsx
{collisionEffects.map(({ id, position, direction }) => (
  <CollisionEffect
    key={id}
    position={position}
    cellSize={responsiveCellSize}
    direction={direction}
  />
))}
```

- [ ] **Step 2: 최종 빌드 확인**

```bash
cd client && npm run build
```

Expected: 에러 없이 완전한 빌드 성공.

- [ ] **Step 3: 최종 커밋**

```bash
git add client/src/components/TwoVsTwo/TwoVsTwoGrid.tsx
git commit -m "feat: TwoVsTwoGrid에서 CollisionEffect에 direction 전달"
```

---

## 구현 완료 후 확인 항목

- [ ] 일반전 AI 대전에서 충돌 시 파티클이 공격자 진행 방향으로 집중해 튀는지 확인
- [ ] 충돌 순간 이동이 100ms 멈췄다가 재개되는지 확인
- [ ] 연속 충돌(같은 라운드에 2회 이상)에서 매번 hit stop이 적용되는지 확인
- [ ] direction 없는 경우(기존 코드 경로)에서 파티클이 기존처럼 고르게 퍼지는지 확인
