# 매직마인 (Magic Mine) 스킬 설계

## 개요

위자드(Wizard) 전설 스킨 전용 공격 스킬. 경로 이동 중 N번째 스텝 시점에 해당 위치에 보이지 않는 함정을 설치한다. 상대가 해당 칸을 밟으면 1 피해를 입히고 함정은 즉시 소멸한다. 함정은 설치자에게만 보이며, 발동 순간 상대에게도 위치가 공개된다.

---

## 스킬 명세

| 항목 | 값 |
|---|---|
| ID | `wizard_magic_mine` |
| 이름 | 매직마인 / Magic Mine |
| 카테고리 | 공격 (attack) |
| 마나 비용 | 8 |
| 역할 제한 | 공격자 (attacker) |
| 사용 타이밍 | 경로 N번째 스텝 이후 자유롭게 (stepRule: any) |
| 타겟 방식 | 없음 (targetRule: none) — 스킬 발동 스텝 기준 캐스터 이동 위치에 자동 설치 |
| 지속 턴수 | 5턴 (미발동 시 자동 소멸) |
| 발동 조건 | 상대가 함정 칸을 밟음 (일회성, 한 스텝에 하나만 발동) |
| 피해량 | 1 |
| 가시성 | 설치자: 항상 보임 / 상대: 발동 순간에만 보임 |

### 함정 위치 명확화

함정은 **리졸루션 중 reservation.step 시점에 캐스터가 도달한 이동 위치**에 설치된다. 예: 경로 3칸 이동 후 스킬을 예약했다면, 리졸루션에서 step=3일 때 `currentPos` (3번째 칸)에 함정이 설치된다.

### 중복 함정 처리

같은 칸에 두 플레이어의 함정이 동시에 존재할 경우, 한 스텝에 최대 하나만 발동한다 (배열 순서 기준 첫 번째 해당 함정). 같은 소유자의 함정이 같은 칸에 중복될 수 없다 (기존 함정은 `remainingTurns` 갱신 또는 무시).

---

## 아키텍처

### 새 타입: `AbilityTrapTile`

서버 (`server/src/game/ability/AbilityTypes.ts`) 및 클라이언트 (`client/src/types/ability.types.ts`) 동일하게 추가.

```ts
export interface AbilityTrapTile {
  position: Position;
  owner: PlayerColor;       // 설치한 플레이어 색
  remainingTurns: number;   // 최대 5. 매 턴 종료 시 -1, 0이 되면 소멸
}
```

### 기존 타입 변경

- `AbilitySkillId`: `'wizard_magic_mine'` 추가
- `ABILITY_SKILL_COSTS`: `wizard_magic_mine: 8`
- `AbilityBattleState`: `trapTiles: AbilityTrapTile[]` 필드 추가
- `AbilityResolutionPayload`: `trapTiles: AbilityTrapTile[]` 추가 (턴 종료 후 잔존 함정 동기화용 — 개인화 emit으로 전송)
- `AbilitySkillEvent`: 기존 필드로 충분 (`affectedPositions`, `damages` 사용)

---

## 서버 로직

### AbilityTypes.ts (서버)

```ts
// ABILITY_SKILL_COSTS에 추가
wizard_magic_mine: 8,

// ABILITY_SKILL_SERVER_RULES에 추가
wizard_magic_mine: {
  roleRestriction: 'attacker',
  stepRule: 'any',
  targetRule: 'none',
},
```

### AbilityEngine.ts

**함수 시그니처 변경**:
```ts
export function resolveAbilityRound(params: {
  red: AbilityPlayerState;
  blue: AbilityPlayerState;
  attackerColor: PlayerColor;
  obstacles: Position[];
  lavaTiles: AbilityLavaTile[];
  trapTiles: AbilityTrapTile[];   // 추가
}): {
  ...
  lavaTiles: AbilityLavaTile[];
  trapTiles: AbilityTrapTile[];   // 추가
  winner: ...;
}
```

**스킬 발동 처리** (reservation 루프 안, step 진행 중 currentPos 기준):
```ts
if (reservation.skillId === 'wizard_magic_mine') {
  // 마나 차감
  // activeTrapTiles에 { position: currentPos, owner: color, remainingTurns: 5 } 추가
  // (같은 소유자의 동일 위치 중복 방지: 기존 함정 remainingTurns를 max로 갱신)
  // skillEvent 기록: { skillId, step, order, color, affectedPositions: [currentPos] }
  return;
}
```

**매 step 함정 체크** (lava 체크 다음):
```ts
for (const trap of activeTrapTiles) {
  if (trap.owner === color) continue;              // 설치자는 자신 함정에 피해 없음
  if (!samePosition(nextPos, trap.position)) continue;
  // 1 피해 처리
  // activeTrapTiles에서 해당 trap 제거 (일회성)
  // skillEvent: { skillId: 'wizard_magic_mine', step, color: trap.owner,
  //               affectedPositions: [trap.position], damages: [피해 이벤트] }
  break; // 한 스텝에 하나만 발동
}
```

**턴 종료 처리** (lavaTiles 감소 이후):
```ts
const nextTrapTiles = activeTrapTiles
  .map(t => ({ ...t, remainingTurns: t.remainingTurns - 1 }))
  .filter(t => t.remainingTurns > 0);
```

**`getSkillPriority`에 추가**:
```ts
case 'wizard_magic_mine':
  return 2; // 다른 공격 스킬과 동일
```

### AbilityRoom.ts

**클래스 필드 추가**:
```ts
private trapTiles: AbilityTrapTile[] = [];
```

**`resetGame()`에 추가**:
```ts
this.trapTiles = [];
```

**`toClientState()` 변경**: `forColor?: PlayerColor` 파라미터를 추가하고, `trapTiles`를 필터링:
```ts
private toClientState(forColor?: PlayerColor): AbilityBattleState {
  return {
    ...기존 필드...,
    trapTiles: forColor
      ? this.trapTiles.filter(t => t.owner === forColor)
      : [],
  };
}
```

**개인화 emit 패턴**: `trapTiles`가 포함된 모든 이벤트는 `io.to(roomId).emit(...)` 대신 플레이어별 소켓에 개별 emit. 이 패턴을 `ability_game_start`, `ability_round_start`, `ability_resolution`에 일관되게 적용.

```ts
// ability_round_start 예시
for (const player of this.players.values()) {
  this.io.to(player.socketId).emit('ability_round_start', {
    timeLimit,
    roundEndsAt,
    state: this.toClientState(player.color),
  });
}

// ability_resolution 예시
for (const player of this.players.values()) {
  this.io.to(player.socketId).emit('ability_resolution', {
    ...resolutionPayload,
    trapTiles: this.trapTiles.filter(t => t.owner === player.color),
  });
}
```

**`findFinisherSkillId`에 추가**: `wizard_magic_mine`을 킬 크레딧 대상 스킬에 추가.

**`resolveAbilityRound` 호출 시 `trapTiles: this.trapTiles` 전달 및 결과에서 `this.trapTiles = resolution.trapTiles` 업데이트**.

---

## 클라이언트 로직

### ability.types.ts (클라이언트)

- `AbilitySkillId`에 `'wizard_magic_mine'` 추가
- `ABILITY_SKILL_COSTS`에 `wizard_magic_mine: 8`
- `AbilityBattleState`에 `trapTiles: AbilityTrapTile[]` 추가
- `ABILITY_SKILLS`에 스킬 정의 추가:

```ts
wizard_magic_mine: {
  id: 'wizard_magic_mine',
  name: { en: 'Magic Mine', kr: '매직마인' },
  description: {
    en: 'Place an invisible trap at your position (at the chosen step). If the opponent steps on it, they take 1 damage and the trap disappears. Lasts 5 turns.',
    kr: '지정한 스텝 시점의 현재 위치에 보이지 않는 함정을 설치합니다. 상대가 밟으면 1 피해를 주고 사라집니다. 5턴 지속됩니다.',
  },
  loadoutTags: { en: 'Move OK · Combo OK', kr: '이동 가능 · 조합 가능' },
  loadoutDescription: {
    en: 'Place an invisible 1-damage trap at your movement position. Lasts 5 turns.',
    kr: '이동 위치에 1 피해짜리 보이지 않는 함정을 설치합니다. 5턴 지속됩니다.',
  },
  manaCost: 8,
  category: 'attack',
  skinId: 'wizard',
  icon: '✦',
}
```

### gameStore.ts

`initialAbilityLoadout` validator 배열에 `'wizard_magic_mine'` 추가 (localStorage 로드아웃 검증용).

### AbilityScreen.tsx

`trapTiles` 상태는 `AbilityScreen.tsx` 내부 `useState<AbilityTrapTile[]>`로 관리.

- 초기값: `[]`
- `ability_round_start` 수신 시: `payload.state.trapTiles`로 설정 (서버가 이미 필터링한 값)
- `ability_resolution` 수신 후 애니메이션 완료 시: `payload.trapTiles`로 업데이트
- `ability_game_start` 수신 시: `[]`로 리셋

`AbilityGrid`에 `trapTiles` prop으로 전달.

### AbilityGrid.tsx

**함정 렌더링**:
- `props.trapTiles` (소유자 함정만 수신됨) 를 그리드 위에 렌더링
- CSS 클래스 `ability-wizard-mine`
- 발동 시 `skillEvent`에서 `wizard_magic_mine` 감지 → 해당 위치에 `ability-wizard-mine-trigger` 클래스로 폭발 애니메이션 (양쪽 플레이어 모두 표시 — 발동 이벤트는 resolution payload에 포함됨)

**위치 기준**: 기존 `.ability-lava-tile`의 `left: col * cellSize + cellSize/2`, `top: row * cellSize + cellSize/2` + `transform: translate(-50%, -50%)` 패턴을 그대로 따름.

---

## 함정 비주얼 디자인

위자드 스킨의 보라색 마법진 테마에 맞춰 설계. 색상 팔레트: `rgba(160~210, 40~90, 255, ...)`.

### 대기 상태 (설치자에게만 보임)

셀 크기의 70% 크기 원형 마법진. SVG 육각별(두 삼각형 중첩)을 내부에 표시 — 위자드 Game.tsx의 삼각형과 동일한 방식.

```css
/* ability-grid.css에 추가 */
.ability-wizard-mine {
  position: absolute;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    rgba(160, 40, 255, 0.18) 0%,
    transparent 70%
  );
  border: 1px solid rgba(200, 80, 255, 0.45);
  transform: translate(-50%, -50%);
  pointer-events: none;
  animation: wizardMinePulse 3s ease-in-out infinite,
             wizardMineRotate 20s linear infinite;
}

@keyframes wizardMinePulse {
  0%, 100% { opacity: 0.55; }
  50%       { opacity: 1; }
}

@keyframes wizardMineRotate {
  to { transform: translate(-50%, -50%) rotate(360deg); }
}
```

내부 SVG (AbilityGrid.tsx에서 인라인 렌더링):
```jsx
<svg viewBox="0 0 60 60" width="70%" height="70%">
  {/* 삼각형 1 (위) */}
  <polygon points="30,4 56,50 4,50"
    fill="none" stroke="rgba(190,70,255,0.7)" strokeWidth="2" />
  {/* 삼각형 2 (아래) */}
  <polygon points="30,56 4,10 56,10"
    fill="none" stroke="rgba(220,110,255,0.6)" strokeWidth="2" />
</svg>
```

### 발동 애니메이션 (양쪽 플레이어 모두 표시)

0.5s 동안 확장 + 보라색 플래시 후 사라짐. 발동 위치에 임시 DOM 요소 추가로 구현 (설치 함정과 별개).

발동 트리거 요소는 **기존 lava tile 패턴**과 동일하게 JS에서 px 값을 직접 계산해 인라인 스타일로 전달한다. CSS 변수(`var(--cell-size)`)는 셀 div 스코프에만 존재하므로 그리드 컨테이너 레벨 요소에서 사용할 수 없다.

```jsx
// AbilityGrid.tsx — 발동 트리거 요소 예시
<div
  className="ability-wizard-mine-trigger"
  style={{
    left: col * responsiveCellSize + responsiveCellSize / 2,
    top: row * responsiveCellSize + responsiveCellSize / 2,
    width: responsiveCellSize,
    height: responsiveCellSize,
  }}
/>
```

```css
/* ability-grid.css */
.ability-wizard-mine-trigger {
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
  transform: translate(-50%, -50%);
  background: radial-gradient(circle, rgba(220,80,255,0.9) 0%, transparent 70%);
  box-shadow: 0 0 20px rgba(200, 60, 255, 1);
  animation: wizardMineBurst 0.5s ease-out forwards;
}

@keyframes wizardMineBurst {
  0%   { transform: translate(-50%, -50%) scale(1);   opacity: 1; }
  60%  { transform: translate(-50%, -50%) scale(2.2); opacity: 0.85; }
  100% { transform: translate(-50%, -50%) scale(3);   opacity: 0; }
}
```

---

## 파일 변경 목록

| 파일 | 변경 내용 |
|---|---|
| `server/src/game/ability/AbilityTypes.ts` | `wizard_magic_mine` ID/비용/규칙, `AbilityTrapTile` 타입, `AbilityBattleState.trapTiles`, `AbilityResolutionPayload.trapTiles` |
| `server/src/game/ability/AbilityEngine.ts` | `resolveAbilityRound` 파라미터/반환값, 우선순위, 스킬 발동/함정 체크/턴 종료 처리 |
| `server/src/game/ability/AbilityRoom.ts` | `private trapTiles`, `resetGame()` 초기화, `toClientState(forColor?)`, `ability_game_start`/`ability_round_start`/`ability_resolution` 개인화 emit, `findFinisherSkillId` 추가 |
| `client/src/types/ability.types.ts` | `wizard_magic_mine` ID/비용/정의, `AbilityTrapTile` 타입, `AbilityBattleState.trapTiles` |
| `client/src/store/gameStore.ts` | `initialAbilityLoadout` validator에 `'wizard_magic_mine'` 추가 |
| `client/src/components/Ability/AbilityScreen.tsx` | `trapTiles` useState, 소켓 이벤트 처리, `AbilityGrid`에 prop 전달 |
| `client/src/components/Ability/AbilityGrid.tsx` | 함정 렌더링 (대기 상태 SVG 마법진), 발동 애니메이션 트리거 |
| `client/src/components/Ability/ability-grid.css` | `.ability-wizard-mine`, `.ability-wizard-mine-trigger` CSS |
