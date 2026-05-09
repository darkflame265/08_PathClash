# 빙결지대 (Ice Field) Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `ice_field` skill — a utility skill linked to the `frost_heart` skin that lets players place a 3-turn ice tile; any player who steps onto it slides in their direction of travel until hitting the grid boundary or a root wall tile.

**Architecture:** Server-side: extend `AbilityTypes.ts` with `AbilityIceFieldTile` type, add two pure helpers (`updateIceFieldTile`, `computeSlidePath`), handle placement and movement-loop slide detection in `AbilityEngine.ts`, and include the tile list and overridden-path data in the resolution payload. Client-side: mirror the types in `ability.types.ts`, wire a `pendingIceField` flow in `AbilityScreen.tsx` matching the existing `pendingRootWall` pattern, and render tiles + muted overridden paths in `AbilityGrid.tsx`.

**Tech Stack:** TypeScript, Node.js (server), React + Vite (client)

---

## File Map

| Status | File | Change |
|--------|------|--------|
| Modify | `server/src/game/ability/AbilityTypes.ts` | Add `AbilityIceFieldTile`, extend `AbilitySkillId`, `AbilityBattleState`, `AbilityResolutionPayload` |
| Modify | `server/src/game/ability/AbilityEngine.ts` | Add helpers, placement block, slide detection in movement loop, tile cleanup, payload fields |
| Modify | `client/src/types/ability.types.ts` | Mirror server additions; add skill metadata |
| Create | `client/public/ui/ability/ice_field.svg` | Snowflake skill icon |
| Modify | `client/src/components/Ability/AbilityScreen.tsx` | Add `pendingIceField` state, begin/handle/target-select functions, muted-path state |
| Modify | `client/src/components/Ability/AbilityGrid.tsx` | Render ice tiles, target-selection overlay, muted overridden-path `PathLine` |

---

## Task 1 — Server: Type Definitions

**Files:**
- Modify: `server/src/game/ability/AbilityTypes.ts`

- [ ] **Step 1: Locate the `AbilitySkillId` union (line ~11) and add `'ice_field'`**

```typescript
// Find the line that ends the union (currently ends with 'root_wall' or similar)
// Add before the closing semicolon:
  | 'ice_field'
```

- [ ] **Step 2: Add `AbilityIceFieldTile` interface after `AbilityRootWallTile` (~line 200)**

```typescript
export interface AbilityIceFieldTile {
  position: Position;
  remainingTurns: number;
}
```

- [ ] **Step 3: Add `iceFieldTiles` to `AbilityBattleState` (~line 258)**

```typescript
// In AbilityBattleState, after rootWallTiles line:
iceFieldTiles: AbilityIceFieldTile[];
```

- [ ] **Step 4: Add `iceFieldTiles` and `iceSlideOverriddenPaths` to `AbilityResolutionPayload` (~line 316)**

```typescript
// In AbilityResolutionPayload, after rootWallTiles line:
iceFieldTiles: AbilityIceFieldTile[];
// After rootWallBlockedPaths:
iceSlideOverriddenPaths?: {
  red: { start: Position; path: Position[] } | null;
  blue: { start: Position; path: Position[] } | null;
};
```

- [ ] **Step 5: Add `iceFieldTiles` to the `resolveAbilityRound` params type**

Find the `export function resolveAbilityRound(params: {` signature (~line 177). Add after the `rootWallTiles` param:

```typescript
iceFieldTiles: AbilityIceFieldTile[];
```

- [ ] **Step 6: Add `iceFieldTiles` to the function return type**

The return type of `resolveAbilityRound` includes `lavaTiles`, `trapTiles`, `rootWallTiles`. Add after `rootWallTiles`:

```typescript
iceFieldTiles: AbilityIceFieldTile[];
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
cd server && npx tsc --noEmit
```

Expected: Errors only on `AbilityEngine.ts` (not yet updated). No errors in `AbilityTypes.ts` itself.

- [ ] **Step 8: Commit**

```bash
git add server/src/game/ability/AbilityTypes.ts
git commit -m "feat(server): add AbilityIceFieldTile types and extend payload"
```

---

## Task 2 — Server: Helper Functions in AbilityEngine

**Files:**
- Modify: `server/src/game/ability/AbilityEngine.ts` (after `updateRootWallTile`, ~line 166)

- [ ] **Step 1: Add `updateIceFieldTile` after `updateRootWallTile` (~line 166)**

```typescript
function updateIceFieldTile(
  iceFieldTiles: AbilityIceFieldTile[],
  position: Position,
  remainingTurns: number,
) {
  const existing = iceFieldTiles.find((tile) => samePosition(tile.position, position));
  if (existing) {
    existing.remainingTurns = Math.max(existing.remainingTurns, remainingTurns);
    return;
  }
  iceFieldTiles.push({ position: { ...position }, remainingTurns });
}
```

- [ ] **Step 2: Add `computeSlidePath` directly after `updateIceFieldTile`**

```typescript
function computeSlidePath(
  from: Position,
  direction: { dr: number; dc: number },
  activeRootWallTiles: AbilityRootWallTile[],
): Position[] {
  const slide: Position[] = [];
  let row = from.row;
  let col = from.col;
  for (;;) {
    const nr = row + direction.dr;
    const nc = col + direction.dc;
    // Stop at grid boundary (grid is 5×5, rows/cols 0-4)
    if (nr < 0 || nr > 4 || nc < 0 || nc > 4) break;
    // Stop before root wall tiles
    if (activeRootWallTiles.some((t) => t.position.row === nr && t.position.col === nc)) break;
    // Ice tiles and lava tiles are passed through — no stop condition
    row = nr;
    col = nc;
    slide.push({ row, col });
  }
  return slide;
}
```

- [ ] **Step 3: Verify the two functions compile in isolation**

```bash
cd server && npx tsc --noEmit 2>&1 | grep AbilityEngine
```

Expected: Errors only about usages not yet written (later tasks), none inside the two new functions.

- [ ] **Step 4: Commit**

```bash
git add server/src/game/ability/AbilityEngine.ts
git commit -m "feat(server): add updateIceFieldTile and computeSlidePath helpers"
```

---

## Task 3 — Server: Tile Initialization and Placement in AbilityEngine

**Files:**
- Modify: `server/src/game/ability/AbilityEngine.ts`

- [ ] **Step 1: Initialize `activeIceFieldTiles` near line 215 (after `activeRootWallTiles` copy)**

```typescript
const activeIceFieldTiles: AbilityIceFieldTile[] = params.iceFieldTiles.map((tile) => ({
  position: { ...tile.position },
  remainingTurns: tile.remainingTurns,
}));
```

- [ ] **Step 2: Add slide-tracking state variables near line 248 (after root wall state vars)**

```typescript
let redIceSlideApplied = false;
let blueIceSlideApplied = false;
let redIceSlideOverriddenPath: { start: Position; path: Position[] } | null = null;
let blueIceSlideOverriddenPath: { start: Position; path: Position[] } | null = null;
```

- [ ] **Step 3: Change `const maxStep` to `let maxStep` (~line 279)**

```typescript
// Change:
const maxStep = Math.max(redPath.length, bluePath.length);
// To:
let maxStep = Math.max(redPath.length, bluePath.length);
```

- [ ] **Step 4: Add `ice_field` placement block in `processSkill` after the `root_wall` block (~line 791)**

```typescript
if (reservation.skillId === 'ice_field' && reservation.target) {
  if (color === 'red') {
    redMana = spendMana(casterMana, reservation.skillId);
  } else {
    blueMana = spendMana(casterMana, reservation.skillId);
  }
  updateIceFieldTile(activeIceFieldTiles, reservation.target, 3);
  skillEvents.push({
    step: reservation.step,
    order: reservation.order,
    color,
    skillId: reservation.skillId,
    affectedPositions: [{ ...reservation.target }],
    to: { ...reservation.target },
  });
  return;
}
```

- [ ] **Step 5: Compile check**

```bash
cd server && npx tsc --noEmit 2>&1 | grep -v "iceSlideOverriddenPath\|iceField\|nextIceField"
```

Expected: No new errors from this task's code.

- [ ] **Step 6: Commit**

```bash
git add server/src/game/ability/AbilityEngine.ts
git commit -m "feat(server): ice_field tile init and placement in processSkill"
```

---

## Task 4 — Server: Slide Detection in Movement Loop

**Files:**
- Modify: `server/src/game/ability/AbilityEngine.ts` (~line 966, after root wall `redNext`/`blueNext` are determined)

The movement loop determines `redNext` and `blueNext` after root wall blocking. Insert slide detection immediately after those two lines.

- [ ] **Step 1: Add red slide detection after `const redNext = ...` and `const blueNext = ...`**

```typescript
// After: const redNext = redBlockedByRootWall ? { ...redPrev } : redCandidate;

if (
  !redIceSlideApplied &&
  redCanAdvance &&
  !samePosition(redNext, redPos) &&
  activeIceFieldTiles.some((t) => samePosition(t.position, redNext))
) {
  const dr = redNext.row - redPos.row;
  const dc = redNext.col - redPos.col;
  const slidePath = computeSlidePath(redNext, { dr, dc }, activeRootWallTiles);
  redIceSlideOverriddenPath = {
    start: { ...redNext },
    path: redPath.slice(step + 1).map((p) => ({ ...p })),
  };
  redPath.splice(step + 1, redPath.length - step - 1, ...slidePath);
  maxStep = Math.max(maxStep, redPath.length - 1, bluePath.length - 1);
  redIceSlideApplied = true;
}
```

- [ ] **Step 2: Add blue slide detection after `const blueNext = ...`**

```typescript
// After: const blueNext = blueBlockedByRootWall ? { ...bluePrev } : blueCandidate;

if (
  !blueIceSlideApplied &&
  blueCanAdvance &&
  !samePosition(blueNext, bluePos) &&
  activeIceFieldTiles.some((t) => samePosition(t.position, blueNext))
) {
  const dr = blueNext.row - bluePos.row;
  const dc = blueNext.col - bluePos.col;
  const slidePath = computeSlidePath(blueNext, { dr, dc }, activeRootWallTiles);
  blueIceSlideOverriddenPath = {
    start: { ...blueNext },
    path: bluePath.slice(step + 1).map((p) => ({ ...p })),
  };
  bluePath.splice(step + 1, bluePath.length - step - 1, ...slidePath);
  maxStep = Math.max(maxStep, redPath.length - 1, bluePath.length - 1);
  blueIceSlideApplied = true;
}
```

**Note:** Lava damage during the slide is handled automatically — the existing `applyLavaDamage` calls run at each step after this detection block, so any lava tile the player slides through triggers the normal damage logic.

- [ ] **Step 3: Compile check**

```bash
cd server && npx tsc --noEmit 2>&1 | grep AbilityEngine
```

Expected: Zero errors in this block. Remaining errors only in payload assembly (Task 5).

- [ ] **Step 4: Commit**

```bash
git add server/src/game/ability/AbilityEngine.ts
git commit -m "feat(server): ice field slide detection in movement loop"
```

---

## Task 5 — Server: Turn Cleanup and Payload Assembly

**Files:**
- Modify: `server/src/game/ability/AbilityEngine.ts`

- [ ] **Step 1: Add ice field tile cleanup after `nextRootWallTiles` (~line 1273)**

```typescript
const nextIceFieldTiles = activeIceFieldTiles
  .map((tile) => ({
    position: { ...tile.position },
    remainingTurns: tile.remainingTurns - 1,
  }))
  .filter((tile) => tile.remainingTurns > 0);
```

- [ ] **Step 2: Add `iceFieldTiles` to the `payload` object (~line 1312, after `rootWallTiles`)**

```typescript
// In the payload object (inside the return statement):
iceFieldTiles: activeIceFieldTiles.map((tile) => ({
  position: { ...tile.position },
  remainingTurns: tile.remainingTurns,
})),
iceSlideOverriddenPaths: {
  red: redIceSlideOverriddenPath,
  blue: blueIceSlideOverriddenPath,
},
```

- [ ] **Step 3: Add `iceFieldTiles: nextIceFieldTiles` to the top-level return object (~line 1360, after `rootWallTiles`)**

```typescript
// In the top-level return (alongside lavaTiles, trapTiles, rootWallTiles):
iceFieldTiles: nextIceFieldTiles,
```

- [ ] **Step 4: Find where `resolveAbilityRound` is called (search the server for the call site)**

```bash
cd server && grep -rn "resolveAbilityRound" src/ --include="*.ts"
```

Open that call site file. Pass the current stored `iceFieldTiles` as a param:

```typescript
// In the call to resolveAbilityRound, add:
iceFieldTiles: room.iceFieldTiles ?? [],  // or however room state stores it
```

And persist the returned `iceFieldTiles`:

```typescript
// After resolveAbilityRound returns:
room.iceFieldTiles = result.iceFieldTiles;
```

And include `iceFieldTiles` in the `AbilityBattleState` sent to clients with `round_start` (search for where `lavaTiles` is assembled into the game state broadcast).

- [ ] **Step 5: Compile the full server**

```bash
cd server && npx tsc --noEmit
```

Expected: Zero errors.

- [ ] **Step 6: Commit**

```bash
git add server/src/game/ability/AbilityEngine.ts
git commit -m "feat(server): ice field turn cleanup and resolution payload"
```

---

## Task 6 — Client: Type Definitions

**Files:**
- Modify: `client/src/types/ability.types.ts`

- [ ] **Step 1: Add `'ice_field'` to the client `AbilitySkillId` union**

Find the same union on the client (mirrors the server union). Add `| 'ice_field'`.

- [ ] **Step 2: Add `AbilityIceFieldTile` interface after `AbilityRootWallTile`**

```typescript
export interface AbilityIceFieldTile {
  position: Position;
  remainingTurns: number;
}
```

- [ ] **Step 3: Add `iceFieldTiles` to client `AbilityBattleState`**

```typescript
// In AbilityBattleState, after rootWallTiles:
iceFieldTiles: AbilityIceFieldTile[];
```

- [ ] **Step 4: Add `iceFieldTiles` and `iceSlideOverriddenPaths` to client `AbilityResolutionPayload`**

```typescript
// In AbilityResolutionPayload, after rootWallTiles:
iceFieldTiles: AbilityIceFieldTile[];
// After rootWallBlockedPaths:
iceSlideOverriddenPaths?: {
  red: { start: Position; path: Position[] } | null;
  blue: { start: Position; path: Position[] } | null;
};
```

- [ ] **Step 5: Add `ice_field` skill metadata object**

Find the skill metadata object (the large object keyed by `AbilitySkillId`, ~line 379). Add the `ice_field` entry alongside the others:

```typescript
ice_field: {
  id: "ice_field",
  name: { en: "Ice Field", kr: "빙결지대" },
  loadoutDescription: {
    en: "Place an ice tile for 3 turns. Any player who steps onto it slides in their direction of travel until hitting the grid edge or a Root Wall.",
    kr: "선택한 1칸에 3턴 동안 빙판을 설치합니다. 밟은 플레이어는 진행 방향으로 그리드 끝 또는 뿌리장벽에 닿을 때까지 강제로 미끄러집니다.",
  },
  manaCost: 6,
  category: "utility",
  skinId: "frost_heart",
  icon: "❄️",
},
```

- [ ] **Step 6: Compile check**

```bash
cd client && npx tsc --noEmit
```

Expected: Errors only in `AbilityScreen.tsx` / `AbilityGrid.tsx` (not yet updated). No errors in `ability.types.ts`.

- [ ] **Step 7: Commit**

```bash
git add client/src/types/ability.types.ts
git commit -m "feat(client): add ice_field types and skill metadata"
```

---

## Task 7 — Client: SVG Icon

**Files:**
- Create: `client/public/ui/ability/ice_field.svg`

- [ ] **Step 1: Create the snowflake SVG icon**

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs>
    <radialGradient id="fh-bg" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#0c2d48"/>
      <stop offset="100%" stop-color="#000a14"/>
    </radialGradient>
    <filter id="fh-glow" x="-35%" y="-35%" width="170%" height="170%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="1.5" result="b1"/>
      <feColorMatrix in="b1" type="matrix"
        values="0 0 0 0 0.4  0 0 0 0 0.9  0 0 0 0 1  0 0 0 1.2 0"
        result="g1"/>
      <feGaussianBlur in="SourceAlpha" stdDeviation="4" result="b2"/>
      <feColorMatrix in="b2" type="matrix"
        values="0 0 0 0 0.2  0 0 0 0 0.7  0 0 0 0 1  0 0 0 0.6 0"
        result="g2"/>
      <feMerge>
        <feMergeNode in="g2"/>
        <feMergeNode in="g1"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <g id="fh-arm">
      <line x1="0" y1="0"    x2="0"    y2="-37"   stroke="#f0f9ff" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="0" y1="-18.5" x2="9.9"  y2="-24.2" stroke="#bae6fd" stroke-width="1.8" stroke-linecap="round"/>
      <line x1="0" y1="-18.5" x2="-9.9" y2="-24.2" stroke="#bae6fd" stroke-width="1.8" stroke-linecap="round"/>
      <line x1="0" y1="-29"   x2="6.8"  y2="-33"   stroke="#e0f2fe" stroke-width="1.4" stroke-linecap="round"/>
      <line x1="0" y1="-29"   x2="-6.8" y2="-33"   stroke="#e0f2fe" stroke-width="1.4" stroke-linecap="round"/>
      <polygon points="0,-42 3.5,-37 0,-32 -3.5,-37" fill="#e0f9ff"/>
    </g>
  </defs>
  <circle cx="50" cy="50" r="50" fill="url(#fh-bg)"/>
  <g transform="translate(50,50)" filter="url(#fh-glow)">
    <use href="#fh-arm" transform="rotate(0)"/>
    <use href="#fh-arm" transform="rotate(60)"/>
    <use href="#fh-arm" transform="rotate(120)"/>
    <use href="#fh-arm" transform="rotate(180)"/>
    <use href="#fh-arm" transform="rotate(240)"/>
    <use href="#fh-arm" transform="rotate(300)"/>
    <circle cx="0" cy="0" r="4" fill="#ffffff" opacity="0.9"/>
  </g>
</svg>
```

- [ ] **Step 2: Verify the file renders correctly**

Open `client/public/ui/ability/ice_field.svg` in a browser. Expected: Dark blue circular background, six-armed cyan snowflake with glowing branches and diamond tips, white center dot.

- [ ] **Step 3: Commit**

```bash
git add client/public/ui/ability/ice_field.svg
git commit -m "feat(client): add ice_field snowflake SVG icon"
```

---

## Task 8 — Client: AbilityScreen Wiring

**Files:**
- Modify: `client/src/components/Ability/AbilityScreen.tsx`

- [ ] **Step 1: Add type alias and empty-factory near the `RootWallBlockedPathsByColor` block (~line 155)**

```typescript
type IceSlideOverriddenPathsByColor = NonNullable<
  AbilityResolutionPayload["iceSlideOverriddenPaths"]
>;

function createEmptyIceSlideOverriddenPaths(): IceSlideOverriddenPathsByColor {
  return { red: null, blue: null };
}
```

- [ ] **Step 2: Add `pendingIceField` state near `pendingRootWall` (~line 494)**

```typescript
const [pendingIceField, setPendingIceField] = useState(false);
```

- [ ] **Step 3: Add `movingIceSlideOverriddenPaths` state near `movingRootWallBlockedPaths` (~line 548)**

```typescript
const [movingIceSlideOverriddenPaths, setMovingIceSlideOverriddenPaths] =
  useState<IceSlideOverriddenPathsByColor>(createEmptyIceSlideOverriddenPaths);
```

- [ ] **Step 4: Add `beginIceFieldPick` function after `beginRootWallPick` (~line 1594)**

```typescript
const beginIceFieldPick = () => {
  const alreadyReserved = skillReservations.some(
    (entry) => entry.skillId === "ice_field",
  );
  if (alreadyReserved) {
    removeReservation("ice_field");
    return;
  }
  if (pendingIceField && selectedSkillId === "ice_field") {
    setSelectedSkillId(null);
    setPendingIceField(false);
    return;
  }
  if (getRemainingMana() < getSkillCost("ice_field")) return;
  setSelectedSkillId("ice_field");
  setPendingIceField(true);
  setPendingTeleport(false);
  setPendingBlitz(false);
  setPendingInferno(false);
  setPendingRootWall(false);
};
```

- [ ] **Step 5: Add `handleIceFieldTargetSelect` after `handleRootWallTargetSelect` (~line 1616)**

```typescript
const handleIceFieldTargetSelect = (target: Position) => {
  if (!state) return;
  if (
    posEqual(target, state.players.red.position) ||
    posEqual(target, state.players.blue.position)
  ) {
    return;
  }
  const nextReservations: AbilitySkillReservation[] = [
    ...skillReservations.filter((entry) => entry.skillId !== "ice_field"),
    {
      skillId: "ice_field",
      step: 0,
      order: reservationOrderRef.current++,
      target,
    },
  ];
  setSkillReservations(nextReservations);
  setSelectedSkillId(null);
  setPendingIceField(false);
};
```

- [ ] **Step 6: Wire `beginIceFieldPick` in `handleSkillClick`**

Find the `switch` or `if` chain in `handleSkillClick` that handles `"root_wall"`. Add the `ice_field` case immediately after:

```typescript
case "ice_field":
  beginIceFieldPick();
  break;
```

- [ ] **Step 7: Update `keyboardTargetMode` (~line 1877) to include `ice_field`**

```typescript
const keyboardTargetMode = pendingTeleport
  ? "teleport"
  : pendingBlitz
    ? "blitz"
    : pendingInferno && selectedSkillId === "inferno_field"
      ? "inferno"
      : pendingRootWall && selectedSkillId === "root_wall"
        ? "root_wall"
        : pendingIceField && selectedSkillId === "ice_field"
          ? "ice_field"
          : null;
```

- [ ] **Step 8: Update the `setMovingPaths` block (~line 993) to receive `iceSlideOverriddenPaths`**

```typescript
// Add after setMovingRootWallBlockedPaths:
setMovingIceSlideOverriddenPaths(
  payload.iceSlideOverriddenPaths ?? createEmptyIceSlideOverriddenPaths(),
);
```

- [ ] **Step 9: Pass new props to `<AbilityGrid>` (~line 4465)**

Add these props alongside the existing `rootWallTargetsVisible` and related props:

```typescript
iceFieldTargetsVisible={pendingIceField && selectedSkillId === "ice_field"}
iceFieldMarker={
  skillReservations.find((r) => r.skillId === "ice_field")?.target ?? null
}
movingIceSlideOverriddenPaths={movingIceSlideOverriddenPaths}
onIceFieldTargetSelect={handleIceFieldTargetSelect}
```

- [ ] **Step 10: Compile check**

```bash
cd client && npx tsc --noEmit
```

Expected: Errors only in `AbilityGrid.tsx` (props not yet added). No errors in `AbilityScreen.tsx`.

- [ ] **Step 11: Commit**

```bash
git add client/src/components/Ability/AbilityScreen.tsx
git commit -m "feat(client): wire ice_field pending state and handlers in AbilityScreen"
```

---

## Task 9 — Client: AbilityGrid Rendering

**Files:**
- Modify: `client/src/components/Ability/AbilityGrid.tsx`

- [ ] **Step 1: Add new props to the `Props` interface**

Find the `Props` interface. Add after the `rootWallTargetsVisible` / `onRootWallTargetSelect` entries:

```typescript
iceFieldTargetsVisible: boolean;
iceFieldMarker: Position | null;
movingIceSlideOverriddenPaths: {
  red: { start: Position; path: Position[] } | null;
  blue: { start: Position; path: Position[] } | null;
};
onIceFieldTargetSelect: (target: Position) => void;
```

- [ ] **Step 2: Destructure the new props in the component signature**

```typescript
// Add to the destructuring alongside rootWallTargetsVisible etc.:
iceFieldTargetsVisible,
iceFieldMarker,
movingIceSlideOverriddenPaths,
onIceFieldTargetSelect,
```

- [ ] **Step 3: Render ice field tiles on the grid**

Find the block that renders `state.rootWallTiles.map(...)` (~line 798). Add directly after it:

```typescript
{state.iceFieldTiles.map((tile) => (
  <div
    key={`ice-field-${tile.position.row}-${tile.position.col}`}
    className="ability-ice-field-tile"
    style={{
      left: tile.position.col * responsiveCellSize,
      top: tile.position.row * responsiveCellSize,
      width: responsiveCellSize,
      height: responsiveCellSize,
    }}
  >
    <img
      src="/ui/ability/ice_field.svg"
      alt=""
      className="ability-ice-field-tile__img"
      draggable={false}
    />
  </div>
))}
{iceFieldMarker && (
  <div
    className="ability-ice-field-tile ability-ice-field-tile--pending"
    style={{
      left: iceFieldMarker.col * responsiveCellSize,
      top: iceFieldMarker.row * responsiveCellSize,
      width: responsiveCellSize,
      height: responsiveCellSize,
    }}
  >
    <img
      src="/ui/ability/ice_field.svg"
      alt=""
      className="ability-ice-field-tile__img"
      draggable={false}
    />
  </div>
)}
```

- [ ] **Step 4: Add target-selection cell overlay for `iceFieldTargetsVisible`**

Find the block that renders the inferno target selection overlay (the `.map` over all 5×5 cells that shows a transparent button when `infernoTargetsVisible` is true, ~line 1044). Add an analogous block directly after it:

```typescript
{iceFieldTargetsVisible &&
  Array.from({ length: 5 }, (_, row) =>
    Array.from({ length: 5 }, (_, col) => (
      <button
        key={`ice-target-${row}-${col}`}
        className="ability-target-overlay-cell"
        style={{
          left: col * responsiveCellSize,
          top: row * responsiveCellSize,
          width: responsiveCellSize,
          height: responsiveCellSize,
        }}
        onClick={() => onIceFieldTargetSelect({ row, col })}
        aria-label={`Select ice field position ${row},${col}`}
      />
    )),
  )}
```

- [ ] **Step 5: Add muted PathLine rendering for `movingIceSlideOverriddenPaths`**

Find the block that renders `movingRootWallBlockedPaths.red` and `movingRootWallBlockedPaths.blue` as muted PathLines (~line 1113). Add directly after those blocks:

```typescript
{movingIceSlideOverriddenPaths.red ? (
  <PathLine
    color="red"
    path={movingIceSlideOverriddenPaths.red.path}
    startPos={movingIceSlideOverriddenPaths.red.start}
    cellSize={responsiveCellSize}
    isPlanning={false}
    muted
  />
) : null}
{movingIceSlideOverriddenPaths.blue ? (
  <PathLine
    color="blue"
    path={movingIceSlideOverriddenPaths.blue.path}
    startPos={movingIceSlideOverriddenPaths.blue.start}
    cellSize={responsiveCellSize}
    isPlanning={false}
    muted
  />
) : null}
```

- [ ] **Step 6: Add minimal CSS for the ice tile**

Find the CSS file for AbilityGrid (likely `AbilityGrid.css` or similar). Add:

```css
.ability-ice-field-tile {
  position: absolute;
  pointer-events: none;
  z-index: 3;
}

.ability-ice-field-tile__img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.ability-ice-field-tile--pending {
  opacity: 0.65;
}
```

- [ ] **Step 7: Full compile check**

```bash
cd client && npx tsc --noEmit
```

Expected: Zero errors across all files.

- [ ] **Step 8: Commit**

```bash
git add client/src/components/Ability/AbilityGrid.tsx
git commit -m "feat(client): render ice_field tiles, target overlay, and muted slide paths"
```

---

## Task 10 — Integration Test and Final Commit

- [ ] **Step 1: Start dev server and server**

```bash
# Terminal 1
cd server && npm run dev

# Terminal 2
cd client && npm run dev
```

- [ ] **Step 2: Manual test — tile placement**

1. Start an ability game with a Frost Heart skin player.
2. Equip `ice_field` in the skill loadout.
3. Enter a planning phase. Click the `ice_field` skill button.
4. Verify: all grid cells become clickable (target overlay appears).
5. Click a cell. Verify: the ice tile SVG appears on that cell. The skill button deactivates.
6. Submit the path and complete the round.
7. Verify: the ice tile remains on the grid for subsequent rounds and disappears after 3 turns.

- [ ] **Step 3: Manual test — slide mechanic**

1. Place an ice tile at a known position (e.g., row 2, col 2).
2. On the next turn, plan a path that moves THROUGH that cell (e.g., right-to-left: col 4 → col 3 → col 2).
3. Submit the path.
4. Verify during movement playback:
   - Player moves normally until hitting col 2.
   - Player then slides left (col 1 → col 0) without stopping.
   - The original planned path beyond col 2 is shown as a muted dashed line.

- [ ] **Step 4: Manual test — slide stops at root wall**

1. Place a root wall at col 0 (or another blocking tile).
2. Place an ice tile at col 2 on the same row.
3. Plan a right-to-left path through col 2.
4. Verify: the slide stops at col 1 (directly before the root wall).

- [ ] **Step 5: Manual test — slide passes through lava, takes damage**

1. Place a lava tile at col 1 and an ice tile at col 2 on the same row.
2. Plan a right-to-left path through col 2.
3. Verify: player slides through col 1 (lava), takes 1 HP damage, continues to col 0.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat: complete ice_field skill — slide mechanic, tiles, and UI"
```
