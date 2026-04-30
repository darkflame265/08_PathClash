# Arena & Scoring System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 능력 대전 전용 아레나/점수 시스템 구현 — DB 컬럼 추가, 서버 rating 로직, 클라이언트 UI 표시까지 end-to-end.

**Architecture:** Supabase `player_stats`에 3개 컬럼(`current_rating`, `highest_arena_reached`, `ranked_unlocked`) 추가. 서버에 `arenaConfig.ts` 유틸 파일 신규 생성. `AbilityRoom`이 게임 종료 시 rating 업데이트 후 `ability_game_over` 이벤트에 rating 필드 포함. 클라이언트 로비에 아레나 박스, 결과 화면에 rating 변화 표시.

**Tech Stack:** TypeScript, Supabase (PostgreSQL + RPC), Socket.IO, React 19, Zustand

---

## 파일 목록

| 파일 | 작업 |
|------|------|
| `supabase/schema.sql` | player_stats 컬럼 추가, purchase_skin_with_tokens 아레나 체크, get_account_snapshot 아레나 필드 포함 |
| `server/src/game/arenaConfig.ts` | **신규**: 아레나 상수, `getArenaFromRating`, `getRatingChange` |
| `client/src/data/arenaCatalog.ts` | **신규**: 클라이언트 아레나 상수, 스킨-아레나 매핑 |
| `server/src/services/playerAuth.ts` | `AccountProfile`/`StatsRow` 아레나 필드 추가, `readAccountProfile` 업데이트, `updateAbilityRating` 추가 |
| `server/src/store/AbilityRoomStore.ts` | queue entry에 `currentRating` 추가 |
| `server/src/socket/socketServer.ts` | 아레나별 AI fallback 시간, rating 기반 매칭 |
| `server/src/game/ability/AbilityRoom.ts` | 게임 종료 시 rating 업데이트 호출, `ability_game_over` 페이로드 확장 |
| `client/src/types/ability.types.ts` | `ability_game_over` 페이로드 타입 추가 |
| `client/src/store/gameStore.ts` | `currentRating`, `highestArena`, `rankedUnlocked` 상태 추가 |
| `client/src/auth/guestAuth.ts` | `AccountSnapshot`, `AccountSnapshotRpcRow`, `AccountProfile` 아레나 필드 추가 |
| `client/src/components/Ability/AbilityScreen.tsx` | 결과 화면 rating 변화 표시, 아레나 승급 팝업 |
| `client/src/components/Lobby/LobbyScreen.tsx` | 닉네임 아래 아레나 박스 추가, 스킨 잠금 UI |

---

## Task 1: supabase/schema.sql — DB 컬럼 및 RPC 업데이트

**Files:**
- Modify: `supabase/schema.sql`

- [ ] **Step 1: player_stats에 3개 컬럼 추가**

`supabase/schema.sql`에서 `daily_reward_day date;` 뒤 빈 줄 다음에 추가:

```sql
alter table public.player_stats
add column if not exists current_rating integer not null default 0;

alter table public.player_stats
add column if not exists highest_arena_reached integer not null default 1;

alter table public.player_stats
add column if not exists ranked_unlocked boolean not null default false;
```

- [ ] **Step 2: purchase_skin_with_tokens RPC에 아레나 체크 추가**

`purchase_skin_with_tokens` 함수에서 `declare` 블록에 변수 추가하고, 비용 계산 직후 아레나 체크 삽입:

```sql
-- declare 블록에 추가:
  v_required_arena integer;
  v_highest_arena integer;
```

`v_cost` 계산 블록(case p_skin_id ... end) 바로 아래에 추가:

```sql
  v_required_arena := case p_skin_id
    when 'plasma'       then 1
    when 'inferno'      then 1
    when 'quantum'      then 2
    when 'cosmic'       then 2
    when 'neon_pulse'   then 3
    when 'arc_reactor'  then 3
    when 'electric_core' then 4
    when 'gold_core'    then 4
    when 'atomic'       then 5
    when 'chronos'      then 5
    when 'wizard'       then 6
    when 'sun'          then 6
    else 1
  end;

  select coalesce(highest_arena_reached, 1)
    into v_highest_arena
    from public.player_stats
   where user_id = v_user_id;

  if coalesce(v_highest_arena, 1) < v_required_arena then
    return 'ARENA_REQUIRED';
  end if;
```

- [ ] **Step 3: get_account_snapshot RPC에 아레나 필드 추가**

`get_account_snapshot` 함수에서 `jsonb_build_object` 마지막 항목(`'achievements', ...`) 뒤에 추가:

```sql
    'currentRating',
      coalesce((select ps.current_rating from public.player_stats ps where ps.user_id = target_user_id), 0),
    'highestArena',
      coalesce((select ps.highest_arena_reached from public.player_stats ps where ps.user_id = target_user_id), 1),
    'rankedUnlocked',
      coalesce((select ps.ranked_unlocked from public.player_stats ps where ps.user_id = target_user_id), false)
```

- [ ] **Step 4: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat: add arena columns to player_stats and update RPCs"
```

---

## Task 2: server/src/game/arenaConfig.ts — 신규 파일

**Files:**
- Create: `server/src/game/arenaConfig.ts`

- [ ] **Step 1: 파일 생성**

```typescript
export interface ArenaRange {
  arena: number;
  minRating: number;
  maxRating: number;
}

export const ARENA_RANGES: ArenaRange[] = [
  { arena: 1,  minRating: 0,    maxRating: 199  },
  { arena: 2,  minRating: 200,  maxRating: 499  },
  { arena: 3,  minRating: 500,  maxRating: 899  },
  { arena: 4,  minRating: 900,  maxRating: 1399 },
  { arena: 5,  minRating: 1400, maxRating: 1999 },
  { arena: 6,  minRating: 2000, maxRating: 2699 },
  { arena: 7,  minRating: 2700, maxRating: 3499 },
  { arena: 8,  minRating: 3500, maxRating: 4199 },
  { arena: 9,  minRating: 4200, maxRating: 4799 },
  { arena: 10, minRating: 4800, maxRating: 4999 },
];

export const RANKED_UNLOCKED_THRESHOLD = 5000;

interface RatingChange {
  win: number;
  loss: number;
}

const RATING_CHANGES: Array<{ arenas: number[]; change: RatingChange }> = [
  { arenas: [1, 2, 3],   change: { win: 50,  loss: -10 } },
  { arenas: [4, 5, 6],   change: { win: 40,  loss: -25 } },
  { arenas: [7, 8],      change: { win: 30,  loss: -30 } },
  { arenas: [9, 10],     change: { win: 25,  loss: -35 } },
];

const RANKED_RATING_CHANGE: RatingChange = { win: 20, loss: -40 };

export function getArenaFromRating(rating: number): number {
  if (rating >= RANKED_UNLOCKED_THRESHOLD) return 10;
  for (const range of ARENA_RANGES) {
    if (rating >= range.minRating && rating <= range.maxRating) {
      return range.arena;
    }
  }
  return 1;
}

export function getRatingChange(currentRating: number, isWin: boolean): number {
  if (currentRating >= RANKED_UNLOCKED_THRESHOLD) {
    return isWin ? RANKED_RATING_CHANGE.win : RANKED_RATING_CHANGE.loss;
  }
  const arena = getArenaFromRating(currentRating);
  for (const entry of RATING_CHANGES) {
    if (entry.arenas.includes(arena)) {
      return isWin ? entry.change.win : entry.change.loss;
    }
  }
  return isWin ? 25 : -35;
}

/** 아레나별 AI fallback 대기 시간 (ms). ranked_unlocked면 AI 없음(-1). */
export function getAbilityAiFallbackMs(currentRating: number, rankedUnlocked: boolean): number {
  if (rankedUnlocked || currentRating >= RANKED_UNLOCKED_THRESHOLD) return -1;
  const arena = getArenaFromRating(currentRating);
  if (arena <= 3) return 7_000;
  if (arena <= 6) return 12_000;
  if (arena <= 8) return 20_000;
  return 30_000;
}
```

- [ ] **Step 2: Commit**

```bash
git add server/src/game/arenaConfig.ts
git commit -m "feat: add arenaConfig utility (arena ranges, rating change, AI fallback)"
```

---

## Task 3: client/src/data/arenaCatalog.ts — 신규 파일

**Files:**
- Create: `client/src/data/arenaCatalog.ts`

- [ ] **Step 1: 파일 생성**

```typescript
import type { PieceSkin } from "../types/game.types";

export interface ArenaRange {
  arena: number;
  label: string;
  minRating: number;
  maxRating: number;
}

export const ARENA_RANGES: ArenaRange[] = [
  { arena: 1,  label: "Arena 1",  minRating: 0,    maxRating: 199  },
  { arena: 2,  label: "Arena 2",  minRating: 200,  maxRating: 499  },
  { arena: 3,  label: "Arena 3",  minRating: 500,  maxRating: 899  },
  { arena: 4,  label: "Arena 4",  minRating: 900,  maxRating: 1399 },
  { arena: 5,  label: "Arena 5",  minRating: 1400, maxRating: 1999 },
  { arena: 6,  label: "Arena 6",  minRating: 2000, maxRating: 2699 },
  { arena: 7,  label: "Arena 7",  minRating: 2700, maxRating: 3499 },
  { arena: 8,  label: "Arena 8",  minRating: 3500, maxRating: 4199 },
  { arena: 9,  label: "Arena 9",  minRating: 4200, maxRating: 4799 },
  { arena: 10, label: "Arena 10", minRating: 4800, maxRating: 4999 },
];

export const RANKED_UNLOCKED_THRESHOLD = 5000;

export function getArenaFromRating(rating: number): number {
  if (rating >= RANKED_UNLOCKED_THRESHOLD) return 10;
  for (const range of ARENA_RANGES) {
    if (rating >= range.minRating && rating <= range.maxRating) {
      return range.arena;
    }
  }
  return 1;
}

export function getArenaLabel(arena: number, rankedUnlocked: boolean): string {
  if (rankedUnlocked) return "Ranked";
  return `Arena ${arena}`;
}

/** 스킨별 필요 아레나 번호 */
export const SKIN_ARENA_REQUIREMENTS: Partial<Record<PieceSkin, number>> = {
  plasma:        1,
  inferno:       1,
  quantum:       2,
  cosmic:        2,
  neon_pulse:    3,
  arc_reactor:   3,
  electric_core: 4,
  gold_core:     4,
  atomic:        5,
  chronos:       5,
  wizard:        6,
  sun:           6,
};

export function getSkinRequiredArena(skinId: PieceSkin): number {
  return SKIN_ARENA_REQUIREMENTS[skinId] ?? 1;
}

export function isSkinArenaUnlocked(skinId: PieceSkin, highestArena: number): boolean {
  return highestArena >= getSkinRequiredArena(skinId);
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/data/arenaCatalog.ts
git commit -m "feat: add client arenaCatalog (arena ranges, skin requirements)"
```

---

## Task 4: server/src/services/playerAuth.ts — 아레나 필드 + updateAbilityRating

**Files:**
- Modify: `server/src/services/playerAuth.ts`

- [ ] **Step 1: StatsRow 인터페이스에 arena 필드 추가**

```typescript
interface StatsRow {
  wins: number | null;
  losses: number | null;
  tokens: number | null;
  daily_reward_wins: number | null;
  daily_reward_day: string | null;
  current_rating: number | null;
  highest_arena_reached: number | null;
  ranked_unlocked: boolean | null;
}
```

- [ ] **Step 2: AccountProfile 인터페이스에 arena 필드 추가**

```typescript
export interface AccountProfile {
  userId: string;
  nickname: string;
  equippedSkin: PieceSkin;
  equippedBoardSkin: BoardSkin;
  equippedAbilitySkills: AbilitySkillId[];
  ownedSkins: PieceSkin[];
  ownedBoardSkins: BoardSkin[];
  wins: number;
  losses: number;
  tokens: number;
  dailyRewardWins: number;
  dailyRewardTokens: number;
  isGuestUser: boolean;
  achievements: PlayerAchievementState[];
  rotationSkills: AbilitySkillId[];
  removedRotationSkills: AbilitySkillId[];
  currentRating: number;
  highestArena: number;
  rankedUnlocked: boolean;
}
```

- [ ] **Step 3: readAccountProfile의 statsPromise select에 arena 컬럼 추가**

```typescript
const statsPromise = supabaseAdmin
  ?.from('player_stats')
  .select('wins, losses, tokens, daily_reward_wins, daily_reward_day, current_rating, highest_arena_reached, ranked_unlocked')
  .eq('user_id', userId)
  .maybeSingle<StatsRow>();
```

- [ ] **Step 4: readAccountProfile return 객체에 arena 필드 추가**

```typescript
return {
  ...existing_fields,
  currentRating: statsResult?.data?.current_rating ?? 0,
  highestArena: statsResult?.data?.highest_arena_reached ?? 1,
  rankedUnlocked: statsResult?.data?.ranked_unlocked ?? false,
};
```

- [ ] **Step 5: updateAbilityRating 함수 추가 (파일 끝)**

```typescript
export interface AbilityRatingResult {
  ratingChange: number;
  newRating: number;
  newArena: number;
  arenaPromoted: boolean;
  rankedUnlocked: boolean;
}

export async function updateAbilityRating(
  userId: string,
  isWin: boolean,
): Promise<AbilityRatingResult | null> {
  if (!supabaseAdmin) return null;

  const { data: row, error } = await supabaseAdmin
    .from('player_stats')
    .select('current_rating, highest_arena_reached, ranked_unlocked')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[arena] failed to read player_stats for rating', error);
    return null;
  }

  const currentRating = Number(row?.current_rating ?? 0);
  const highestArena = Number(row?.highest_arena_reached ?? 1);
  const wasRankedUnlocked = Boolean(row?.ranked_unlocked ?? false);

  const { getRatingChange, getArenaFromRating, RANKED_UNLOCKED_THRESHOLD } = await import('../game/arenaConfig');

  const ratingChange = getRatingChange(currentRating, isWin);
  const newRating = Math.max(0, currentRating + ratingChange);
  const newArena = getArenaFromRating(newRating);
  const newHighestArena = Math.max(highestArena, newArena);
  const arenaPromoted = newHighestArena > highestArena;
  const rankedUnlocked = wasRankedUnlocked || newRating >= RANKED_UNLOCKED_THRESHOLD;

  const { error: upsertError } = await supabaseAdmin
    .from('player_stats')
    .upsert(
      {
        user_id: userId,
        current_rating: newRating,
        highest_arena_reached: newHighestArena,
        ranked_unlocked: rankedUnlocked,
      },
      { onConflict: 'user_id' },
    );

  if (upsertError) {
    console.error('[arena] failed to upsert rating', upsertError);
    return null;
  }

  return { ratingChange, newRating, newArena, arenaPromoted, rankedUnlocked };
}
```

- [ ] **Step 6: resolvePlayerProfile의 return에 arena 필드 포함 (PersistentPlayerProfile는 그대로, AccountProfile만)**

`PersistentPlayerProfile`는 변경 없음. `resolveAccount`, `resolveAccountForUser`는 `readAccountProfile`을 호출하므로 자동으로 포함됨.

- [ ] **Step 7: Commit**

```bash
git add server/src/services/playerAuth.ts
git commit -m "feat: add arena fields to AccountProfile, add updateAbilityRating"
```

---

## Task 5: server/src/store/AbilityRoomStore.ts — queue에 currentRating 추가

**Files:**
- Modify: `server/src/store/AbilityRoomStore.ts`

- [ ] **Step 1: queue 타입에 currentRating 추가**

```typescript
private queue: Array<{
  socketId: string;
  nickname: string;
  userId: string | null;
  stats: { wins: number; losses: number };
  pieceSkin: PieceSkin;
  boardSkin: BoardSkin;
  equippedSkills: AbilitySkillId[];
  currentRating: number;
}> = [];
```

- [ ] **Step 2: enqueue 시그니처에 currentRating 추가**

```typescript
enqueue(
  socketId: string,
  nickname: string,
  userId: string | null,
  stats: { wins: number; losses: number },
  pieceSkin: PieceSkin,
  boardSkin: BoardSkin,
  equippedSkills: AbilitySkillId[],
  currentRating = 0,
): void {
  this.removeFromQueue(socketId);
  this.queue.push({ socketId, nickname, userId, stats, pieceSkin, boardSkin, equippedSkills, currentRating });
}
```

- [ ] **Step 3: dequeue 반환 타입에 currentRating 추가**

```typescript
dequeue(): {
  socketId: string;
  nickname: string;
  userId: string | null;
  stats: { wins: number; losses: number };
  pieceSkin: PieceSkin;
  boardSkin: BoardSkin;
  equippedSkills: AbilitySkillId[];
  currentRating: number;
} | undefined {
  return this.queue.shift();
}
```

- [ ] **Step 4: rating 기반 dequeue 메서드 추가 (range 매칭)**

```typescript
/** rating 차이 |range| 이내인 가장 오래 기다린 상대 반환. range가 undefined면 제한 없음. */
dequeueWithinRange(
  currentRating: number,
  range?: number,
): {
  socketId: string;
  nickname: string;
  userId: string | null;
  stats: { wins: number; losses: number };
  pieceSkin: PieceSkin;
  boardSkin: BoardSkin;
  equippedSkills: AbilitySkillId[];
  currentRating: number;
} | undefined {
  if (this.queue.length === 0) return undefined;
  if (range === undefined) {
    return this.queue.shift();
  }
  const idx = this.queue.findIndex(
    (entry) => Math.abs(entry.currentRating - currentRating) <= range,
  );
  if (idx === -1) return undefined;
  const [entry] = this.queue.splice(idx, 1);
  return entry;
}
```

- [ ] **Step 5: Commit**

```bash
git add server/src/store/AbilityRoomStore.ts
git commit -m "feat: add currentRating to ability queue, add dequeueWithinRange"
```

---

## Task 6: server/src/socket/socketServer.ts — 동적 AI fallback + rating 매칭

**Files:**
- Modify: `server/src/socket/socketServer.ts`

- [ ] **Step 1: arenaConfig import 추가**

파일 상단 import 블록에:

```typescript
import { getAbilityAiFallbackMs, getArenaFromRating } from '../game/arenaConfig';
```

- [ ] **Step 2: abilityFallbackMatchMs 상수 제거**

`const abilityFallbackMatchMs = 7_000;` 라인 삭제.

- [ ] **Step 3: scheduleAbilityFallback에 currentRating 파라미터 추가 + 동적 타이머**

```typescript
const scheduleAbilityFallback = ({
  socket,
  profile,
  pieceSkin,
  boardSkin,
  equippedSkills,
  currentRating,
  rankedUnlocked,
}: {
  socket: Socket;
  profile: PersistentPlayerProfile;
  pieceSkin: PieceSkin;
  boardSkin: BoardSkin;
  equippedSkills: AbilitySkillId[];
  currentRating: number;
  rankedUnlocked: boolean;
}) => {
  clearAbilityFallback(socket.id);
  const fallbackMs = getAbilityAiFallbackMs(currentRating, rankedUnlocked);
  if (fallbackMs < 0) return; // ranked_unlocked: AI 없음
  abilityFallbackTimers.set(
    socket.id,
    setTimeout(() => {
      void createAbilityFallbackMatch({
        socket,
        profile,
        pieceSkin,
        boardSkin,
        equippedSkills,
      });
    }, fallbackMs),
  );
};
```

- [ ] **Step 4: join_ability 핸들러에서 currentRating/rankedUnlocked 읽기 + rating 기반 매칭 적용**

`join_ability` 핸들러 안의 `const queued = abilityStore.dequeue();` 부분을 아래로 교체:

```typescript
// 플레이어 프로필에서 현재 rating 읽기
const currentRating = (profile as { currentRating?: number }).currentRating ?? 0;
const rankedUnlocked = (profile as { rankedUnlocked?: boolean }).rankedUnlocked ?? false;

// rating ±300 이내 우선 매칭
const queued = abilityStore.dequeueWithinRange(currentRating, 300)
  ?? abilityStore.dequeueWithinRange(currentRating); // fallback: 제한 없음 (같은 dequeue로 처리)
```

> **주의**: `resolvePlayerProfile`이 반환하는 `PersistentPlayerProfile`는 `currentRating`을 갖고 있지 않다. 이를 해결하는 두 가지 옵션:
> 1. `PersistentPlayerProfile`에 arena 필드 추가 (추천 — Task 4의 `resolvePlayerProfile`을 확장)
> 2. `join_ability` 핸들러 안에서 별도 DB 조회
>
> **아래 Step 5에서 옵션 1로 진행**

- [ ] **Step 5: PersistentPlayerProfile에 arena 필드 추가 (playerAuth.ts)**

`server/src/services/playerAuth.ts`에서:

```typescript
export interface PersistentPlayerProfile {
  userId: string | null;
  nickname: string;
  stats: { wins: number; losses: number };
  currentRating: number;
  rankedUnlocked: boolean;
}
```

`resolvePlayerProfile` 함수 return에 추가:

```typescript
return {
  userId,
  nickname: profile.nickname,
  stats: { wins: profile.wins, losses: profile.losses },
  currentRating: profile.currentRating,
  rankedUnlocked: profile.rankedUnlocked,
};
```

`resolvePlayerProfileCached`도 같이 수정해야 하는데, 실제로는 `resolvePlayerProfile`을 호출하므로 자동으로 포함됨.

- [ ] **Step 6: join_ability 핸들러에서 enqueue에 currentRating 전달**

```typescript
abilityStore.enqueue(
  socket.id,
  profile.nickname,
  profile.userId,
  profile.stats,
  pieceSkin ?? 'classic',
  boardSkin ?? 'classic',
  equippedSkills,
  profile.currentRating,
);
```

- [ ] **Step 7: scheduleAbilityFallback 호출부에 currentRating, rankedUnlocked 전달**

두 군데 (`queued` 없는 경우 / `queued.socketId === socket.id` 경우) 모두:

```typescript
scheduleAbilityFallback({
  socket,
  profile,
  pieceSkin: pieceSkin ?? 'classic',
  boardSkin: boardSkin ?? 'classic',
  equippedSkills,
  currentRating: profile.currentRating,
  rankedUnlocked: profile.rankedUnlocked,
});
```

- [ ] **Step 8: Commit**

```bash
git add server/src/socket/socketServer.ts server/src/services/playerAuth.ts
git commit -m "feat: dynamic ability AI fallback timer + rating-based matchmaking"
```

---

## Task 7: server/src/game/ability/AbilityRoom.ts — rating 업데이트 + 이벤트 확장

**Files:**
- Modify: `server/src/game/ability/AbilityRoom.ts`

- [ ] **Step 1: updateAbilityRating import 추가**

```typescript
import { updateAbilityRating, type AbilityRatingResult } from '../../services/playerAuth';
```

- [ ] **Step 2: onMovingComplete에서 winner 처리 시 rating 업데이트 호출**

기존 `this.io.to(this.roomId).emit('ability_game_over', { winner });` 앞부분에:

```typescript
// rating 업데이트 (훈련/봇 경기 제외)
let winnerRating: AbilityRatingResult | null = null;
let loserRating: AbilityRatingResult | null = null;
if (winner !== 'draw' && !this.isTrainingMode && this.isRewardEligible()) {
  const loserColor: PlayerColor = winner === 'red' ? 'blue' : 'red';
  const winnerUserId = this.players.get(winner)?.userId ?? null;
  const loserUserId = this.players.get(loserColor)?.userId ?? null;
  if (winnerUserId) {
    winnerRating = await updateAbilityRating(winnerUserId, true);
  }
  if (loserUserId) {
    loserRating = await updateAbilityRating(loserUserId, false);
  }
}
```

> 주의: `onMovingComplete`이 `private` 동기 메서드이므로 `async`로 변경 필요. 해당 줄을:
> `private async onMovingComplete(...)`

- [ ] **Step 3: ability_game_over emit에 rating 페이로드 포함**

```typescript
const winnerColor = winner !== 'draw' ? winner : null;
const loserColor = winnerColor ? (winnerColor === 'red' ? 'blue' : 'red') : null;

// 각 플레이어에게 본인 rating 정보만 전송
for (const [color, player] of this.players.entries()) {
  const isWinner = color === winnerColor;
  const ratingResult = isWinner ? winnerRating : loserRating;
  const targetSocket = player.socketId;
  if (!targetSocket) continue;
  this.io.to(targetSocket).emit('ability_game_over', {
    winner,
    ratingChange: ratingResult?.ratingChange ?? null,
    newRating: ratingResult?.newRating ?? null,
    newArena: ratingResult?.newArena ?? null,
    arenaPromoted: ratingResult?.arenaPromoted ?? false,
    rankedUnlocked: ratingResult?.rankedUnlocked ?? false,
  });
}
// 소켓이 없는 플레이어(봇 등)를 위해 룸 전체에도 winner만 emit (중복 수신 방지 위해 개인 발송 후 룸 emit 제거)
// → 위 for loop으로 대체, 기존 this.io.to(this.roomId).emit 제거
```

> **단순화 옵션**: 각 플레이어에게 다른 페이로드를 보내기 위해 `player.socketId`가 필요함. `AbilityPlayerState`에 `socketId?: string`이 이미 있음(확인됨).

- [ ] **Step 4: isTrainingMode 필드 확인**

`AbilityRoom.ts`에서 `this.trainingMode` 또는 `this.isTraining` 등의 필드 확인 후 올바른 이름 사용. 현재 코드에서 `enableTrainingMode()` 메서드를 찾아서 해당 필드명 확인:

```bash
grep -n "trainingMode\|isTraining\|training" server/src/game/ability/AbilityRoom.ts | head -20
```

- [ ] **Step 5: Commit**

```bash
git add server/src/game/ability/AbilityRoom.ts
git commit -m "feat: update ability rating on game over, emit rating in ability_game_over"
```

---

## Task 8: 클라이언트 타입 + gameStore + guestAuth

**Files:**
- Modify: `client/src/types/ability.types.ts`
- Modify: `client/src/store/gameStore.ts`
- Modify: `client/src/auth/guestAuth.ts`

### ability.types.ts

- [ ] **Step 1: AbilityGameOverPayload 인터페이스 추가**

```typescript
export interface AbilityGameOverPayload {
  winner: PlayerColor | "draw";
  ratingChange: number | null;
  newRating: number | null;
  newArena: number | null;
  arenaPromoted: boolean;
  rankedUnlocked: boolean;
}
```

### guestAuth.ts

- [ ] **Step 2: AccountSnapshot에 arena 필드 추가**

```typescript
interface AccountSnapshot {
  nickname: string | null;
  equippedSkin: PieceSkin;
  equippedBoardSkin: BoardSkin;
  equippedAbilitySkills: AbilitySkillId[];
  ownedSkins: PieceSkin[];
  ownedBoardSkins: BoardSkin[];
  wins: number;
  losses: number;
  tokens: number;
  dailyRewardWins: number;
  dailyRewardTokens: number;
  achievements: PlayerAchievementState[];
  currentRating: number;
  highestArena: number;
  rankedUnlocked: boolean;
}
```

- [ ] **Step 3: AccountSnapshotRpcRow에 arena 필드 추가**

```typescript
interface AccountSnapshotRpcRow {
  // ... 기존 필드 ...
  currentRating?: number | null;
  highestArena?: number | null;
  rankedUnlocked?: boolean | null;
}
```

- [ ] **Step 4: AccountProfile에 arena 필드 추가**

```typescript
export interface AccountProfile {
  // ... 기존 필드 ...
  currentRating: number;
  highestArena: number;
  rankedUnlocked: boolean;
}
```

- [ ] **Step 5: normalizeAccountSnapshot에 arena 필드 추가**

`normalizeAccountSnapshot` 함수(또는 `getAccountSnapshot` 내 fallback 조회) 반환값에:

```typescript
currentRating: Number(rpcRow.currentRating ?? 0),
highestArena: Number(rpcRow.highestArena ?? 1),
rankedUnlocked: Boolean(rpcRow.rankedUnlocked ?? false),
```

fallback(직접 DB 조회) 경로의 `StatsRow` 인터페이스에도:

```typescript
interface StatsRow {
  // ... 기존 필드 ...
  current_rating: number | null;
  highest_arena_reached: number | null;
  ranked_unlocked: boolean | null;
}
```

그리고 fallback 조회의 `.select(...)` 문자열에 컬럼 추가:

```typescript
supabase
  .from("player_stats")
  .select("wins, losses, tokens, daily_reward_wins, daily_reward_day, current_rating, highest_arena_reached, ranked_unlocked")
```

- [ ] **Step 6: refreshAccountSummary의 리턴에 arena 필드 포함**

```typescript
return {
  // ... 기존 필드 ...
  currentRating: snapshot.currentRating,
  highestArena: snapshot.highestArena,
  rankedUnlocked: snapshot.rankedUnlocked,
};
```

fallback 리턴 두 곳(supabase 없음, session 없음)에도 기본값 추가:

```typescript
currentRating: 0,
highestArena: 1,
rankedUnlocked: false,
```

### gameStore.ts

- [ ] **Step 7: GameStore 인터페이스에 arena 필드 추가**

```typescript
interface GameStore {
  // ... 기존 필드 ...
  currentRating: number;
  highestArena: number;
  rankedUnlocked: boolean;
  // ...
}
```

- [ ] **Step 8: 초기값 추가**

```typescript
currentRating: 0,
highestArena: 1,
rankedUnlocked: false,
```

- [ ] **Step 9: setAuthState payload에 arena 필드 추가**

```typescript
setAuthState: (payload: {
  // ... 기존 필드 ...
  currentRating?: number;
  highestArena?: number;
  rankedUnlocked?: boolean;
}) => void;
```

`setAuthState` 구현부에:

```typescript
set((state) => ({
  // ... 기존 필드 ...
  currentRating: payload.currentRating ?? state.currentRating,
  highestArena: payload.highestArena ?? state.highestArena,
  rankedUnlocked: payload.rankedUnlocked ?? state.rankedUnlocked,
}));
```

- [ ] **Step 10: applyProfileToStore (LobbyScreen.tsx 내부)에 arena 필드 전달 확인**

`LobbyScreen.tsx`의 `applyProfileToStore` 함수 (또는 inline `setAuthState` 호출부)에서 `profile.currentRating`, `profile.highestArena`, `profile.rankedUnlocked`를 `setAuthState`에 전달하는지 확인. 없으면 추가.

- [ ] **Step 11: App.tsx의 refreshAccountSummary.then 처리 두 곳에 arena 필드 추가**

`App.tsx` 약 261줄과 543줄의 `.then(({ nickname, equippedSkin, ... }) => ...)` 구조분해에 `currentRating, highestArena, rankedUnlocked` 추가 후 `setAuthState` 호출 포함.

- [ ] **Step 12: Commit**

```bash
git add client/src/types/ability.types.ts client/src/store/gameStore.ts client/src/auth/guestAuth.ts client/src/App.tsx
git commit -m "feat: add arena fields to client types, gameStore, guestAuth"
```

---

## Task 9: client/src/components/Ability/AbilityScreen.tsx — rating 결과 표시

**Files:**
- Modify: `client/src/components/Ability/AbilityScreen.tsx`

- [ ] **Step 1: rating 관련 state 추가**

```typescript
const [ratingResult, setRatingResult] = useState<{
  ratingChange: number;
  newRating: number;
  newArena: number;
  arenaPromoted: boolean;
  rankedUnlocked: boolean;
} | null>(null);
```

- [ ] **Step 2: onGameOver 핸들러에서 rating 파싱**

```typescript
const onGameOver = ({
  winner: nextWinner,
  ratingChange,
  newRating,
  newArena,
  arenaPromoted,
  rankedUnlocked,
}: AbilityGameOverPayload) => {
  setWinner(nextWinner);
  setState((prev) => (prev ? { ...prev, phase: "gameover" } : prev));
  if (ratingChange !== null && newRating !== null && newArena !== null) {
    setRatingResult({ ratingChange, newRating, newArena, arenaPromoted, rankedUnlocked });
    if (arenaPromoted || rankedUnlocked) {
      // 아레나 승급/랭크 해금 스토어 업데이트
      useGameStore.getState().setAuthState({
        ready: true,
        userId: useGameStore.getState().authUserId,
        accessToken: useGameStore.getState().authAccessToken,
        isGuestUser: useGameStore.getState().isGuestUser,
        currentRating: newRating,
        highestArena: newArena,
        rankedUnlocked,
      });
    }
  }
};
```

- [ ] **Step 3: resetMatchUiState에 ratingResult 초기화 추가**

```typescript
const resetMatchUiState = () => {
  setWinner(null);
  setGameOverMessage(null);
  setRematchRequested(false);
  setRatingResult(null);
};
```

- [ ] **Step 4: gameover-box에 rating 표시 추가**

`gameover-reward` div 아래:

```tsx
{ratingResult && !isLocalAbilityTraining && (
  <>
    <div
      className={`gameover-rating-change ${ratingResult.ratingChange >= 0 ? "positive" : "negative"}`}
    >
      {ratingResult.ratingChange >= 0 ? "+" : ""}
      {ratingResult.ratingChange} Rating
    </div>
    <div className="gameover-new-rating">
      {lang === "en" ? "Rating:" : "레이팅:"} {ratingResult.newRating}
    </div>
    {ratingResult.arenaPromoted && (
      <div className="gameover-arena-promoted">
        {lang === "en"
          ? `Arena ${ratingResult.newArena - 1} → Arena ${ratingResult.newArena}`
          : `Arena ${ratingResult.newArena - 1} → Arena ${ratingResult.newArena} 승급!`}
      </div>
    )}
    {ratingResult.rankedUnlocked && (
      <div className="gameover-ranked-unlocked">
        {lang === "en" ? "🏆 Ranked Unlocked!" : "🏆 랭크전 해금!"}
      </div>
    )}
  </>
)}
```

- [ ] **Step 5: CSS 추가 (AbilityScreen에 인라인 또는 CSS 파일)**

프로젝트에서 AbilityScreen용 CSS 파일 위치 확인 (`Glob "**/*Ability*.css"`). 없으면 동일 디렉토리의 `index.css` 또는 컴포넌트 인라인으로 처리:

```css
.gameover-rating-change {
  font-size: 1.4rem;
  font-weight: 700;
  margin-top: 8px;
}
.gameover-rating-change.positive { color: #4ade80; }
.gameover-rating-change.negative { color: #f87171; }
.gameover-new-rating {
  font-size: 0.9rem;
  color: #94a3b8;
  margin-top: 2px;
}
.gameover-arena-promoted {
  font-size: 1rem;
  color: #fbbf24;
  font-weight: 700;
  margin-top: 6px;
  animation: pulse 0.6s ease-in-out 2;
}
.gameover-ranked-unlocked {
  font-size: 1.1rem;
  color: #fbbf24;
  font-weight: 700;
  margin-top: 6px;
}
@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.08); }
}
```

- [ ] **Step 6: Commit**

```bash
git add client/src/components/Ability/AbilityScreen.tsx
git commit -m "feat: show rating change and arena promotion in ability game over screen"
```

---

## Task 10: client/src/components/Lobby/LobbyScreen.tsx — 아레나 박스 + 스킨 잠금

**Files:**
- Modify: `client/src/components/Lobby/LobbyScreen.tsx`

- [ ] **Step 1: gameStore에서 arena 필드 구독**

`LobbyScreen` 컴포넌트 상단 `useGameStore` 구조분해에 추가:

```typescript
const { currentRating, highestArena, rankedUnlocked, ...existing } = useGameStore((state) => ({
  // ... 기존 구독 필드 ...
  currentRating: state.currentRating,
  highestArena: state.highestArena,
  rankedUnlocked: state.rankedUnlocked,
}));
```

- [ ] **Step 2: arenaCatalog import 추가**

```typescript
import { getArenaLabel, isSkinArenaUnlocked } from "../../data/arenaCatalog";
```

- [ ] **Step 3: 아레나 박스 렌더링 추가 (lobby-user-header 아래)**

`lobby-user-header` div 바로 아래:

```tsx
<div className="lobby-arena-box">
  <span className="lobby-arena-label">
    {getArenaLabel(highestArena, rankedUnlocked)}
  </span>
  <span className="lobby-arena-rating">
    {lang === "en" ? "Rating:" : "레이팅:"} {currentRating}
  </span>
</div>
```

- [ ] **Step 4: 스킨 선택 UI에서 아레나 잠금 표시**

`skinChoices` 렌더링 부분에서 각 스킨 아이템에 아레나 잠금 조건 추가:

```typescript
const isArenaLocked = !isSkinArenaUnlocked(choice.id as PieceSkin, highestArena);
const requiredArena = getSkinRequiredArena(choice.id as PieceSkin);
```

스킨 아이템 렌더링에서 `isLocked` 조건에 `isArenaLocked` 포함:

```typescript
// 기존 isLocked 계산 로직에 추가
const isLocked = isArenaLocked || existingLockCondition;
```

잠긴 스킨에 자물쇠 표시:

```tsx
{isArenaLocked && (
  <div className="skin-arena-lock">
    🔒 {lang === "en" ? `Arena ${requiredArena}` : `Arena ${requiredArena} 필요`}
  </div>
)}
```

- [ ] **Step 5: CSS 추가 (`client/src/index.css` 또는 Lobby CSS)**

```css
.lobby-arena-box {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 12px;
  background: #1E252B;
  border: 1px solid #3A444D;
  border-radius: 8px;
  margin-top: 6px;
}
.lobby-arena-label {
  font-weight: 700;
  color: #fbbf24;
  font-size: 0.9rem;
}
.lobby-arena-rating {
  color: #94a3b8;
  font-size: 0.85rem;
}
.skin-arena-lock {
  font-size: 0.75rem;
  color: #94a3b8;
  text-align: center;
  margin-top: 2px;
}
```

- [ ] **Step 6: applyProfileToStore 확인 및 arena 필드 전달**

`LobbyScreen.tsx`의 `applyProfileToStore` 함수 또는 `setAuthState` 호출부에서 `profile.currentRating`, `profile.highestArena`, `profile.rankedUnlocked`가 전달되는지 확인. 없으면 추가.

- [ ] **Step 7: Commit**

```bash
git add client/src/components/Lobby/LobbyScreen.tsx client/src/index.css
git commit -m "feat: add arena box to lobby UI, skin arena lock display"
```

---

## 구현 후 확인 사항

- [ ] `npm run build` (client) 에러 없음
- [ ] `npm run build` (server) 에러 없음
- [ ] 신규 유저 로그인 시 `current_rating=0`, `highest_arena_reached=1`, `ranked_unlocked=false`
- [ ] 능력 대전 승리 시 `ability_game_over` 이벤트에 `ratingChange > 0` 포함 확인
- [ ] 결과 화면에 `+N Rating` 표시 확인
- [ ] 로비에 Arena 박스 표시 확인
- [ ] `current_rating >= 5000` 도달 시 `ranked_unlocked = true` 로 변경 확인
- [ ] 훈련 모드에서는 rating 변화 없음 확인
