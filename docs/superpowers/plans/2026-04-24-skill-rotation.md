# Skill Rotation System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 매일 UTC 00:00마다 등급별(common/rare/legendary) 스킬 1개씩 총 3개를 로테이션으로 선정하여 모든 플레이어가 일시적으로 장착할 수 있게 하고, 로테이션 만료 시 스킨 미보유 플레이어의 장착 스킬을 로그인 시 자동 해제 + 플로팅 텍스트로 알린다.

**Architecture:** 서버 인메모리에 현재 로테이션을 캐싱하고 `skill_rotations` DB 테이블로 날짜별 영속화한다. 클라이언트는 소켓 연결 직후 `get_rotation` 이벤트로 배지 표시용 로테이션을 받고, `account_sync` 이벤트로 만료된 장착 스킬을 서버가 DB에서 제거한 결과를 받아 Zustand 스토어에 반영한다.

**Tech Stack:** Node.js/TypeScript (server), React/Zustand/TypeScript (client), Supabase (PostgreSQL), Socket.IO

---

## 파일 변경 목록

| 파일 | 유형 |
|------|------|
| `server/src/services/rotationService.ts` | 신규 생성 |
| `server/src/services/playerAuth.ts` | 수정 |
| `server/src/socket/socketServer.ts` | 수정 |
| `server/src/index.ts` | 수정 |
| `client/src/store/gameStore.ts` | 수정 |
| `client/src/auth/guestAuth.ts` | 수정 |
| `client/src/App.tsx` | 수정 |
| `client/src/components/Lobby/LobbyScreen.tsx` | 수정 |
| `client/src/components/Lobby/LobbyScreen.css` | 수정 |
| `supabase/schema.sql` | 수정 |

---

## Task 1: DB 스키마 + rotationService.ts 생성

**Files:**
- Create: `server/src/services/rotationService.ts`
- Modify: `supabase/schema.sql`

### 배경 지식

- 로테이션 후보 풀: common 5개, rare 3개, legendary 4개 — 모두 구매 스킨 연결 스킬
- 각 스킬은 연결된 스킨이 있어야 장착 가능. 서버는 이 매핑이 필요하다 (`skinId` 매핑은 클라이언트 `ability.types.ts`에만 있으므로 서비스에 직접 정의)
- DB 테이블 `skill_rotations` 에 날짜별 레코드를 저장하여 전날 로테이션 제외 규칙에 사용

- [ ] **Step 1: schema.sql에 skill_rotations 테이블 추가**

`supabase/schema.sql` 끝에 다음을 추가한다 (기존 마지막 줄 이후):

```sql
-- Skill rotation: daily UTC rotation slots
create table if not exists skill_rotations (
  date            text primary key,  -- 'YYYY-MM-DD' UTC
  common_skill    text not null,
  rare_skill      text not null,
  legendary_skill text not null
);
```

- [ ] **Step 2: rotationService.ts 전체 작성**

`server/src/services/rotationService.ts` 를 신규 생성한다:

```typescript
import type { AbilitySkillId } from '../game/ability/AbilityTypes';
import type { PieceSkin } from '../types/game.types';
import { supabaseAdmin } from '../lib/supabase';

// 로테이션 후보 풀 — 구매 스킨 연결 스킬만 포함 (승리 기반/기본 제외)
const ROTATION_POOL: Record<'common' | 'rare' | 'legendary', AbilitySkillId[]> = {
  common: ['plasma_charge', 'gold_overdrive', 'phase_shift', 'inferno_field', 'quantum_shift'],
  rare: ['cosmic_bigbang', 'arc_reactor_field', 'electric_blitz'],
  legendary: ['wizard_magic_mine', 'chronos_time_rewind', 'atomic_fission', 'sun_chariot'],
};

// 각 로테이션 스킬에 연결된 스킨 (만료 시 소유 여부 확인용)
const ROTATION_SKILL_TO_SKIN: Partial<Record<AbilitySkillId, PieceSkin>> = {
  plasma_charge: 'plasma',
  gold_overdrive: 'gold_core',
  phase_shift: 'neon_pulse',
  inferno_field: 'inferno',
  quantum_shift: 'quantum',
  cosmic_bigbang: 'cosmic',
  arc_reactor_field: 'arc_reactor',
  electric_blitz: 'electric_core',
  wizard_magic_mine: 'wizard',
  chronos_time_rewind: 'chronos',
  atomic_fission: 'atomic',
  sun_chariot: 'sun',
};

const ALL_ROTATION_SKILLS = new Set<AbilitySkillId>([
  ...ROTATION_POOL.common,
  ...ROTATION_POOL.rare,
  ...ROTATION_POOL.legendary,
]);

interface RotationState {
  date: string;
  skills: AbilitySkillId[]; // [common, rare, legendary]
}

let currentRotation: RotationState | null = null;

function getUtcDateKey(offsetDays = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

function pickRandom<T>(pool: T[], exclude: T[]): T {
  const candidates = pool.filter((s) => !exclude.includes(s));
  const source = candidates.length > 0 ? candidates : pool;
  return source[Math.floor(Math.random() * source.length)];
}

async function generateAndSaveRotation(excludeSkills: AbilitySkillId[]): Promise<AbilitySkillId[]> {
  const common = pickRandom(ROTATION_POOL.common, excludeSkills);
  const rare = pickRandom(ROTATION_POOL.rare, excludeSkills);
  const legendary = pickRandom(ROTATION_POOL.legendary, excludeSkills);
  const skills: AbilitySkillId[] = [common, rare, legendary];

  const dateKey = getUtcDateKey();
  await supabaseAdmin
    ?.from('skill_rotations')
    .upsert({ date: dateKey, common_skill: common, rare_skill: rare, legendary_skill: legendary });

  return skills;
}

async function loadOrCreateRotation(): Promise<AbilitySkillId[]> {
  const todayKey = getUtcDateKey();
  const yesterdayKey = getUtcDateKey(-1);

  // 오늘 로테이션이 이미 DB에 있으면 반환
  const { data: todayRow } = await supabaseAdmin
    ?.from('skill_rotations')
    .select('common_skill, rare_skill, legendary_skill')
    .eq('date', todayKey)
    .maybeSingle() ?? { data: null };

  if (todayRow) {
    return [
      todayRow.common_skill as AbilitySkillId,
      todayRow.rare_skill as AbilitySkillId,
      todayRow.legendary_skill as AbilitySkillId,
    ];
  }

  // 어제 로테이션을 읽어 제외 목록 구성
  const { data: yesterdayRow } = await supabaseAdmin
    ?.from('skill_rotations')
    .select('common_skill, rare_skill, legendary_skill')
    .eq('date', yesterdayKey)
    .maybeSingle() ?? { data: null };

  const excludeSkills: AbilitySkillId[] = yesterdayRow
    ? [
        yesterdayRow.common_skill as AbilitySkillId,
        yesterdayRow.rare_skill as AbilitySkillId,
        yesterdayRow.legendary_skill as AbilitySkillId,
      ]
    : [];

  return generateAndSaveRotation(excludeSkills);
}

let resetTimeout: ReturnType<typeof setTimeout> | null = null;

function scheduleNextReset(): void {
  const now = Date.now();
  const nextMidnightUtc = new Date();
  nextMidnightUtc.setUTCHours(24, 0, 0, 0);
  const delay = Math.max(1_000, nextMidnightUtc.getTime() - now);

  resetTimeout = setTimeout(async () => {
    resetTimeout = null;
    await resetRotation();
  }, delay);
}

async function resetRotation(): Promise<void> {
  try {
    const skills = await loadOrCreateRotation();
    currentRotation = { date: getUtcDateKey(), skills };
    console.log('[rotation] reset:', currentRotation);
  } catch (err) {
    console.error('[rotation] resetRotation error:', err);
  }
  scheduleNextReset();
}

/** 서버 시작 시 1회 호출 */
export async function initRotation(): Promise<void> {
  try {
    const skills = await loadOrCreateRotation();
    currentRotation = { date: getUtcDateKey(), skills };
    console.log('[rotation] initialized:', currentRotation);
  } catch (err) {
    console.error('[rotation] initRotation error:', err);
    currentRotation = null;
  }
  scheduleNextReset();
}

/** 현재 로테이션 스킬 3개 반환. 초기화 전이면 빈 배열 */
export function getCurrentRotation(): AbilitySkillId[] {
  return currentRotation?.skills ?? [];
}

/** 이 스킬이 로테이션 후보 풀에 속하는지 */
export function isRotationSkill(skillId: AbilitySkillId): boolean {
  return ALL_ROTATION_SKILLS.has(skillId);
}

/** 이 스킬에 연결된 스킨 ID 반환. 풀 밖이면 null */
export function getRotationSkillSkin(skillId: AbilitySkillId): PieceSkin | null {
  return ROTATION_SKILL_TO_SKIN[skillId] ?? null;
}
```

- [ ] **Step 3: 서버 빌드 확인**

```bash
cd server && npm run build
```

Expected: TypeScript 컴파일 에러 없이 완료.

- [ ] **Step 4: 커밋**

```bash
git add supabase/schema.sql server/src/services/rotationService.ts
git commit -m "feat: rotationService 및 skill_rotations DB 스키마 추가"
```

---

## Task 2: playerAuth.ts — AccountProfile 타입 수정 + 만료 해제 로직

**Files:**
- Modify: `server/src/services/playerAuth.ts`

### 배경 지식

- `AccountProfile` 인터페이스에 `rotationSkills: AbilitySkillId[]` 와 `removedRotationSkills: AbilitySkillId[]` 를 추가한다.
- `readAccountProfile` 함수 내에서 `equippedAbilitySkills` 를 필터링할 때, 로테이션 풀 스킬 중 현재 로테이션에도 없고 스킨도 미소유인 항목을 제거한다.
- 제거된 스킬이 있으면 DB `profiles.equipped_ability_skills` 를 업데이트한다.

- [ ] **Step 1: AccountProfile 타입에 필드 추가**

`server/src/services/playerAuth.ts` 의 `AccountProfile` 인터페이스를 찾아 두 필드를 추가한다:

기존:
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
}
```

변경 후:
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
}
```

- [ ] **Step 2: rotationService import 추가**

파일 상단 import 목록에 추가:

```typescript
import {
  getCurrentRotation,
  getRotationSkillSkin,
  isRotationSkill,
} from './rotationService';
```

- [ ] **Step 3: readAccountProfile — 만료 해제 로직 추가**

`readAccountProfile` 함수 내부에서 `equippedAbilitySkills` 를 확정한 직후 (현재 `normalizeAbilityLoadout()` 호출 결과를 담는 부분)에 다음 블록을 삽입한다.

현재 코드 위치 (`server/src/services/playerAuth.ts:265~283` 의 return 블록):

```typescript
  return {
    userId,
    nickname,
    equippedSkin: profileResult?.data?.equipped_skin ?? 'classic',
    equippedBoardSkin: profileResult?.data?.equipped_board_skin ?? 'classic',
    equippedAbilitySkills: normalizeAbilityLoadout(
      profileResult?.data?.equipped_ability_skills ?? [],
    ),
    ownedSkins,
    ownedBoardSkins,
    wins: statsResult?.data?.wins ?? 0,
    losses: statsResult?.data?.losses ?? 0,
    tokens: statsResult?.data?.tokens ?? 0,
    dailyRewardWins,
    dailyRewardTokens: dailyRewardWins * DAILY_REWARD_TOKENS_PER_WIN,
    isGuestUser,
    achievements,
  };
```

이 블록을 아래로 교체한다:

```typescript
  const rawEquipped = normalizeAbilityLoadout(
    profileResult?.data?.equipped_ability_skills ?? [],
  );
  const activeRotation = getCurrentRotation();

  // 로테이션 만료 스킬 필터링: 풀 소속이지만 현재 로테이션에도 없고 스킨도 미보유인 스킬 제거
  const removedRotationSkills: AbilitySkillId[] = [];
  const equippedAbilitySkills = rawEquipped.filter((skillId) => {
    if (!isRotationSkill(skillId)) return true;
    if (activeRotation.includes(skillId)) return true;
    const requiredSkin = getRotationSkillSkin(skillId);
    if (requiredSkin && ownedSkins.includes(requiredSkin)) return true;
    removedRotationSkills.push(skillId);
    return false;
  });

  // 제거된 스킬이 있으면 DB 업데이트
  if (removedRotationSkills.length > 0) {
    supabaseAdmin
      ?.from('profiles')
      .update({ equipped_ability_skills: equippedAbilitySkills })
      .eq('id', userId)
      .then(({ error }) => {
        if (error) console.error('[rotation] failed to update equipped_ability_skills', error);
      });
  }

  return {
    userId,
    nickname,
    equippedSkin: profileResult?.data?.equipped_skin ?? 'classic',
    equippedBoardSkin: profileResult?.data?.equipped_board_skin ?? 'classic',
    equippedAbilitySkills,
    ownedSkins,
    ownedBoardSkins,
    wins: statsResult?.data?.wins ?? 0,
    losses: statsResult?.data?.losses ?? 0,
    tokens: statsResult?.data?.tokens ?? 0,
    dailyRewardWins,
    dailyRewardTokens: dailyRewardWins * DAILY_REWARD_TOKENS_PER_WIN,
    isGuestUser,
    achievements,
    rotationSkills: activeRotation,
    removedRotationSkills,
  };
```

- [ ] **Step 4: 서버 빌드 확인**

```bash
cd server && npm run build
```

Expected: 에러 없이 완료. `AccountProfile` 에 새 필드가 생겼으므로 이를 사용하는 다른 곳에서 타입 에러가 날 수 있다. 에러가 나면 관련 함수의 반환 객체에 `rotationSkills: []` 와 `removedRotationSkills: []` 를 추가한다.

구체적으로 타입 에러가 날 수 있는 함수들:
- `resolvePlayerProfile` — `PersistentPlayerProfile` 을 반환하므로 `AccountProfile` 을 직접 반환하지 않음. 영향 없음.
- `resolveAccount`, `resolveAccountForUser` — `readAccountProfile` 의 반환값을 그대로 전달하므로 자동으로 새 필드 포함됨. 영향 없음.
- `mergeGuestToLinked` 등 내부 함수들은 `AccountProfile` 을 직접 생성하지 않음. 영향 없음.
- `refreshAccountSummary` (클라이언트, `guestAuth.ts`) — 클라이언트의 `AccountProfile` 타입은 별도이므로 Task 5 에서 처리.

- [ ] **Step 5: 커밋**

```bash
git add server/src/services/playerAuth.ts
git commit -m "feat: readAccountProfile에 로테이션 만료 스킬 자동 해제 로직 추가"
```

---

## Task 3: socketServer.ts에 get_rotation 이벤트 추가 + index.ts에 initRotation 호출

**Files:**
- Modify: `server/src/socket/socketServer.ts`
- Modify: `server/src/index.ts`

- [ ] **Step 1: index.ts에 initRotation 호출 추가**

`server/src/index.ts` 상단 imports에 추가:

```typescript
import { initRotation } from './services/rotationService';
```

`initSocketServer(io)` 호출 직전(또는 직후)에 추가:

```typescript
void initRotation();
```

실제 위치: 파일 내 `initSocketServer(io)` 를 찾아 그 바로 앞 줄에 삽입.

- [ ] **Step 2: socketServer.ts에 get_rotation 이벤트 핸들러 추가**

`server/src/socket/socketServer.ts` 상단 imports에 추가:

```typescript
import { getCurrentRotation } from '../services/rotationService';
```

`io.on('connection', (socket) => { ... })` 블록 안에서 `sync_time` 핸들러 바로 뒤에 추가:

```typescript
    socket.on(
      'get_rotation',
      (ack?: (response: { skills: AbilitySkillId[] }) => void) => {
        ack?.({ skills: getCurrentRotation() });
      },
    );
```

`AbilitySkillId` 는 이미 `socketServer.ts` 에서 import되어 있는지 확인한다. 없으면 상단에 추가:

```typescript
import type { AbilitySkillId } from '../game/ability/AbilityTypes';
```

- [ ] **Step 3: 서버 빌드 확인**

```bash
cd server && npm run build
```

Expected: 에러 없이 완료.

- [ ] **Step 4: 커밋**

```bash
git add server/src/index.ts server/src/socket/socketServer.ts
git commit -m "feat: 서버에 initRotation 호출 및 get_rotation 소켓 이벤트 추가"
```

---

## Task 4: Zustand store — rotationSkills 및 알림 상태 추가

**Files:**
- Modify: `client/src/store/gameStore.ts`

### 배경 지식

- `rotationSkills: AbilitySkillId[]`: 현재 로테이션 스킬. `get_rotation` 소켓 이벤트 응답으로 채운다. 로비의 배지 표시와 스킬 잠금 해제 조건에 사용.
- `pendingRemovedRotationSkillsNotice: AbilitySkillId[]`: `account_sync` 응답에서 받은 제거된 스킬 목록. LobbyScreen이 이를 감지해 플로팅 텍스트로 보여주고 즉시 초기화한다.

- [ ] **Step 1: 상태 타입 선언부에 필드 추가**

`gameStore.ts` 에서 `abilityLoadout: AbilitySkillId[]` 선언 바로 아래에 추가:

```typescript
  rotationSkills: AbilitySkillId[];
  pendingRemovedRotationSkillsNotice: AbilitySkillId[];
```

- [ ] **Step 2: 액션 타입 선언부에 setter 추가**

`setAbilityLoadout: (skills: AbilitySkillId[]) => void;` 바로 아래에 추가:

```typescript
  setRotationSkills: (skills: AbilitySkillId[]) => void;
  setPendingRemovedRotationSkillsNotice: (skills: AbilitySkillId[]) => void;
```

- [ ] **Step 3: 초기값 추가**

store 초기값 객체에서 `abilityLoadout: initialAbilityLoadout,` 바로 아래에 추가:

```typescript
  rotationSkills: [],
  pendingRemovedRotationSkillsNotice: [],
```

- [ ] **Step 4: 액션 구현 추가**

`setAbilityLoadout` 구현부 바로 아래에 추가:

```typescript
  setRotationSkills: (skills) => set({ rotationSkills: skills }),
  setPendingRemovedRotationSkillsNotice: (skills) =>
    set({ pendingRemovedRotationSkillsNotice: skills }),
```

- [ ] **Step 5: 클라이언트 빌드 확인**

```bash
cd client && npm run build
```

Expected: 에러 없이 완료.

- [ ] **Step 6: 커밋**

```bash
git add client/src/store/gameStore.ts
git commit -m "feat: Zustand store에 rotationSkills, pendingRemovedRotationSkillsNotice 추가"
```

---

## Task 5: guestAuth.ts 클라이언트 타입 + App.tsx 소켓 호출 추가

**Files:**
- Modify: `client/src/auth/guestAuth.ts`
- Modify: `client/src/App.tsx`

### 배경 지식

- 클라이언트의 `AccountProfile` (`guestAuth.ts`) 과 서버의 `AccountProfile` (`playerAuth.ts`) 은 별도 타입이다.
- 클라이언트 타입에 `rotationSkills?: AbilitySkillId[]` 와 `removedRotationSkills?: AbilitySkillId[]` 를 추가한다 (optional, 서버를 통하지 않는 직접 Supabase 경로에서는 이 필드가 없을 수 있음).
- `App.tsx` 에서 소켓 연결 후 두 이벤트를 순차로 호출한다:
  1. `get_rotation` → 스토어의 `rotationSkills` 업데이트
  2. `account_sync` → 스토어 `pendingRemovedRotationSkillsNotice` 업데이트 + `abilityLoadout` 갱신 (만료 스킬 제거 반영)

- [ ] **Step 1: guestAuth.ts AccountProfile 타입에 optional 필드 추가**

`client/src/auth/guestAuth.ts` 의 `AccountProfile` 인터페이스 (line ~116):

기존:
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
}
```

변경 후:
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
  rotationSkills?: AbilitySkillId[];
  removedRotationSkills?: AbilitySkillId[];
}
```

- [ ] **Step 2: App.tsx에 rotationSkills, pending 관련 스토어 getter import 확인**

`App.tsx` 에서 `useGameStore` 를 사용하는 부분을 확인한다. `setRotationSkills`, `setPendingRemovedRotationSkillsNotice`, `setAuthState` 는 `useGameStore.getState()` 로 접근한다.

- [ ] **Step 3: App.tsx에 get_rotation + account_sync 호출 추가**

`App.tsx` 에서 `session_register` 를 emit하는 `registerSession` 함수를 찾는다 (line ~396):

현재:
```typescript
    const registerSession = async () => {
      const authMetadata = await getClientAuthMetadata();
      socket.emit(
        "session_register",
        {
          auth: {
            accessToken: authAccessToken,
            userId: authUserId ?? undefined,
            clientPlatform: authMetadata.clientPlatform,
            appVersionCode: authMetadata.appVersionCode,
          },
        },
        (response: { updateRequired?: boolean } & Partial<UpdateRequiredPayload>) => {
          if (response?.updateRequired) {
            applyUpdateRequired(response as UpdateRequiredPayload);
          }
        },
      );
    };
```

변경 후:
```typescript
    const registerSession = async () => {
      const authMetadata = await getClientAuthMetadata();
      const auth = {
        accessToken: authAccessToken,
        userId: authUserId ?? undefined,
        clientPlatform: authMetadata.clientPlatform,
        appVersionCode: authMetadata.appVersionCode,
      };
      socket.emit(
        "session_register",
        { auth },
        (response: { updateRequired?: boolean } & Partial<UpdateRequiredPayload>) => {
          if (response?.updateRequired) {
            applyUpdateRequired(response as UpdateRequiredPayload);
            return;
          }
          // 1) 로테이션 스킬 배지용 데이터 (인증 불필요, 빠름)
          socket.emit(
            "get_rotation",
            (rotationResp: { skills: string[] }) => {
              useGameStore
                .getState()
                .setRotationSkills(
                  (rotationResp?.skills ?? []) as import("./types/ability.types").AbilitySkillId[],
                );
            },
          );
          // 2) 계정 동기화: 만료 스킬 제거 + 알림
          if (authAccessToken && authUserId) {
            socket.emit(
              "account_sync",
              { auth },
              (syncResp: { status: string; profile?: { equippedAbilitySkills?: string[]; removedRotationSkills?: string[]; rotationSkills?: string[] } }) => {
                if (syncResp?.status === "ACCOUNT_OK" && syncResp.profile) {
                  const removed = (syncResp.profile.removedRotationSkills ?? []) as import("./types/ability.types").AbilitySkillId[];
                  const rotSkills = (syncResp.profile.rotationSkills ?? []) as import("./types/ability.types").AbilitySkillId[];
                  const store = useGameStore.getState();
                  if (rotSkills.length > 0) {
                    store.setRotationSkills(rotSkills);
                  }
                  if (removed.length > 0) {
                    store.setPendingRemovedRotationSkillsNotice(removed);
                    // 장착 스킬도 갱신
                    const equipped = (syncResp.profile.equippedAbilitySkills ?? []) as import("./types/ability.types").AbilitySkillId[];
                    store.setAbilityLoadout(equipped);
                  }
                }
              },
            );
          }
        },
      );
    };
```

**주의:** `import("./types/ability.types").AbilitySkillId[]` 는 타입 단언이 장황하다. 파일 상단에 이미 `AbilitySkillId` 가 import되어 있으면 그냥 `as AbilitySkillId[]` 를 사용한다. App.tsx 상단 imports를 확인하고 없으면 추가:

```typescript
import type { AbilitySkillId } from "./types/ability.types";
```

그러면 위의 타입 단언을 `as AbilitySkillId[]` 로 단순화한다.

- [ ] **Step 4: 클라이언트 빌드 확인**

```bash
cd client && npm run build
```

Expected: 에러 없이 완료.

- [ ] **Step 5: 커밋**

```bash
git add client/src/auth/guestAuth.ts client/src/App.tsx
git commit -m "feat: 로그인 후 get_rotation, account_sync 소켓 호출 추가"
```

---

## Task 6: LobbyScreen UI — 로테이션 배지, 잠금 해제 조건, 알림 + CSS

**Files:**
- Modify: `client/src/components/Lobby/LobbyScreen.tsx`
- Modify: `client/src/components/Lobby/LobbyScreen.css`

### 배경 지식

- `rotationSkills` 와 `pendingRemovedRotationSkillsNotice` 를 스토어에서 읽는다.
- 스킬 카드 `hasAbilitySkinUnlocked` 함수: 스킬이 현재 로테이션에 있으면 소유 없이도 `true` 반환.
- 스킬 카드 이름 옆에 `<span className="ability-rotation-badge">로테이션</span>` 표시.
- `pendingRemovedRotationSkillsNotice` 를 `useEffect` 로 감지해 `showSkinFloatingMessage` 호출 후 즉시 초기화.

- [ ] **Step 1: 스토어에서 rotationSkills, pendingRemovedRotationSkillsNotice 구독**

`LobbyScreen.tsx` 내에서 `abilityLoadout` 을 읽는 곳 근처에 추가. 파일 내 `useGameStore` destructure 구문을 찾아(여러 곳에 분산되어 있을 수 있음) 적절한 위치에:

```typescript
const rotationSkills = useGameStore((s) => s.rotationSkills);
const pendingRemovedRotationSkillsNotice = useGameStore(
  (s) => s.pendingRemovedRotationSkillsNotice,
);
const setPendingRemovedRotationSkillsNotice = useGameStore(
  (s) => s.setPendingRemovedRotationSkillsNotice,
);
```

- [ ] **Step 2: 만료 알림 useEffect 추가**

컴포넌트 내부 적절한 `useEffect` 들 근처에 추가:

```typescript
useEffect(() => {
  if (pendingRemovedRotationSkillsNotice.length === 0) return;
  const first = ABILITY_SKILLS[pendingRemovedRotationSkillsNotice[0]];
  const firstName = lang === "en" ? first?.name.en : first?.name.kr;
  const extra =
    pendingRemovedRotationSkillsNotice.length > 1
      ? lang === "en"
        ? ` and ${pendingRemovedRotationSkillsNotice.length - 1} more`
        : ` 외 ${pendingRemovedRotationSkillsNotice.length - 1}개`
      : "";
  showSkinFloatingMessage(
    lang === "en"
      ? `Rotation expired: ${firstName ?? "skill"}${extra} unequipped.`
      : `로테이션 만료로 ${firstName ?? "스킬"}${extra} 장착이 해제되었습니다.`,
  );
  setPendingRemovedRotationSkillsNotice([]);
}, [pendingRemovedRotationSkillsNotice, lang, setPendingRemovedRotationSkillsNotice]);
```

**주의:** `showSkinFloatingMessage` 는 `useCallback` 으로 감싸여 있거나 컴포넌트 내부 함수다. `useEffect` 의 dependency에 추가하거나 `useRef` 로 감싸야 린터 경고가 없다. 이미 컴포넌트 내부 함수라면 `// eslint-disable-next-line` 을 추가하거나, 아래처럼 `useRef` 로 래핑한다:

```typescript
const showSkinFloatingMessageRef = useRef(showSkinFloatingMessage);
showSkinFloatingMessageRef.current = showSkinFloatingMessage;
```

그 후 `useEffect` 에서 `showSkinFloatingMessageRef.current(...)` 사용.

가장 간단한 방법: `showSkinFloatingMessage` 를 dependency에 포함하되, 이 함수가 매 렌더마다 재생성되지 않는지 확인. 만약 재생성된다면 `useCallback` 으로 감싸거나 ref 패턴 사용.

- [ ] **Step 3: hasAbilitySkinUnlocked 함수에 로테이션 조건 추가**

`LobbyScreen.tsx` 의 `hasAbilitySkinUnlocked` 함수 (line ~2211):

현재:
```typescript
  const hasAbilitySkinUnlocked = (skinId: PieceSkin) => {
    if (skinId === "classic") return true;
    if (skinId === "ember") return accountWins >= 10;
    if (skinId === "nova") return accountWins >= 50;
    if (skinId === "aurora") return accountWins >= 100;
    if (skinId === "void") return accountWins >= 500;
    if (skinId === "quantum") return ownedSkins.includes("quantum");
    return ownedSkins.includes(skinId);
  };
```

변경 후:
```typescript
  const hasAbilitySkinUnlocked = (skinId: PieceSkin) => {
    if (skinId === "classic") return true;
    if (skinId === "ember") return accountWins >= 10;
    if (skinId === "nova") return accountWins >= 50;
    if (skinId === "aurora") return accountWins >= 100;
    if (skinId === "void") return accountWins >= 500;
    if (skinId === "quantum") return ownedSkins.includes("quantum");
    // 로테이션 해금: 이 스킨에 연결된 스킬이 현재 로테이션에 있으면 unlock
    const skillForSkin = Object.values(ABILITY_SKILLS).find(
      (s) => s.skinId === skinId,
    );
    if (skillForSkin && rotationSkills.includes(skillForSkin.id)) return true;
    return ownedSkins.includes(skinId);
  };
```

- [ ] **Step 4: 스킬 카드에 로테이션 배지 추가**

`LobbyScreen.tsx` 의 스킬 카드 렌더링 부분 (line ~4797):

현재:
```tsx
                    <span className="skin-option-copy">
                      <strong>
                        {lang === "en" ? skill.name.en : skill.name.kr}
                      </strong>
```

변경 후:
```tsx
                    <span className="skin-option-copy">
                      <strong>
                        {lang === "en" ? skill.name.en : skill.name.kr}
                        {rotationSkills.includes(skill.id) && (
                          <span className="ability-rotation-badge">
                            {lang === "en" ? "Rotation" : "로테이션"}
                          </span>
                        )}
                      </strong>
```

- [ ] **Step 5: LobbyScreen.css에 배지 스타일 추가**

`LobbyScreen.css` 의 `.skin-name-tier-legendary` 블록 바로 뒤에 추가:

```css
.ability-rotation-badge {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 0.65em;
  font-weight: 600;
  background: linear-gradient(90deg, #b8860b, #ffd700, #b8860b);
  color: #1a1a1a;
  vertical-align: middle;
  letter-spacing: 0.02em;
}
```

- [ ] **Step 6: 클라이언트 빌드 + 린트 확인**

```bash
cd client && npm run build
```

Expected: 에러 없이 완료.

- [ ] **Step 7: 커밋**

```bash
git add client/src/components/Lobby/LobbyScreen.tsx \
        client/src/components/Lobby/LobbyScreen.css
git commit -m "feat: 로테이션 배지, 잠금 해제 조건, 만료 알림 UI 추가"
```

---

## Self-Review 체크리스트

### 스펙 커버리지

| 요구사항 | 구현 태스크 |
|----------|-------------|
| 매일 UTC 00:00 리셋 | Task 1 — `scheduleNextReset()` |
| common/rare/legendary 각 1개 | Task 1 — `ROTATION_POOL` + `generateAndSaveRotation` |
| 이전 로테이션 제외 | Task 1 — `loadOrCreateRotation` (전날 레코드 참조) |
| 로테이션 스킬 임시 해금 | Task 6 — `hasAbilitySkinUnlocked` 수정 |
| 스킬 카드에 "로테이션" 배지 | Task 6 — `ability-rotation-badge` 렌더링 |
| 만료 시 미소유 스킬 자동 해제 | Task 2 — `readAccountProfile` 필터링 + DB 업데이트 |
| 플로팅 텍스트 알림 | Task 6 — `useEffect` + `showSkinFloatingMessage` |
| 기존 플로팅 텍스트 스타일 재사용 | Task 6 — CSS 클래스명 `.skin-floating-message` 유지 |

### 타입 일관성

- `rotationSkills: AbilitySkillId[]` — Task 1(서버 서비스), Task 2(서버 AccountProfile), Task 4(Zustand), Task 5(클라이언트 AccountProfile), Task 6(LobbyScreen 소비)
- `removedRotationSkills: AbilitySkillId[]` — Task 2(서버 반환), Task 5(App.tsx 소비), Task 4(store pending notice)
- `pendingRemovedRotationSkillsNotice: AbilitySkillId[]` — Task 4(store 정의), Task 5(set), Task 6(get + clear)

### Edge cases

- rare 풀이 3개뿐: 전날 스킬 1개만 제외되므로 2개가 남아 항상 제외 규칙 적용 가능. ✅
- 서버 재시작 시: DB에서 오늘 로테이션 복구. ✅
- `initRotation` 실패 시: `currentRotation = null` → `getCurrentRotation()` 빈 배열 → 로테이션 배지 없음, 제거 로직도 작동하지 않음 (안전한 fallback). ✅
- 게스트 사용자: `isGuestUser = true` 여도 `readAccountProfile` 경로 동일. ✅
