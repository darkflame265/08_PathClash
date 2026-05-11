# Ability Skill Presets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 5 numbered preset slots to the lobby equipped-skill modal so players can save and instantly switch between different skill loadouts, with the active preset persisted across sessions.

**Architecture:** Two new DB columns (`ability_skill_presets jsonb`, `active_preset smallint`) are added to the `profiles` table. `equipped_ability_skills` stays in sync with the active preset so the server game logic is unchanged. The client stores both fields in Zustand, syncs on every skill toggle or preset switch.

**Tech Stack:** Supabase (PostgreSQL), Node.js/TypeScript server, React/TypeScript client, Zustand

---

## File Map

| File | Change |
|------|--------|
| `supabase/schema.sql` | Add 2 columns + data migration + updated RPC |
| `server/src/services/playerAuth.ts` | ProfileRow, AccountProfile, readAccountProfile |
| `client/src/auth/guestAuth.ts` | Types + snapshot fns + syncAbilityPresets |
| `client/src/store/gameStore.ts` | New state fields + 2 new actions |
| `client/src/App.tsx` | Update sync effect + account_sync handler |
| `client/src/components/Lobby/LobbyScreen.tsx` | Preset buttons UI |
| `client/src/components/Lobby/LobbyScreen.css` | Preset button styles |

---

### Task 1: DB Schema — Add Columns and Update RPC

**Files:**
- Modify: `supabase/schema.sql` (append to end of file)

- [ ] **Step 1: Append column additions, data migration, and updated RPC to schema.sql**

At the very end of `supabase/schema.sql`, append:

```sql
-- ── Ability Skill Presets ────────────────────────────────────────────────────
alter table public.profiles
add column if not exists ability_skill_presets jsonb not null default '[[],[],[],[],[]]'::jsonb;

alter table public.profiles
add column if not exists active_preset smallint not null default 1;

-- Migrate existing equipped_ability_skills into preset slot 1 for all rows
-- that still have the default empty presets (idempotent: only runs on unset rows)
update public.profiles
set ability_skill_presets = jsonb_set(
  '[[],[],[],[],[]]'::jsonb,
  '{0}',
  to_jsonb(equipped_ability_skills)
)
where ability_skill_presets = '[[],[],[],[],[]]'::jsonb;

-- Updated get_account_snapshot to include preset fields
create or replace function public.get_account_snapshot(
  target_user_id uuid default auth.uid()
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_day text := to_char(timezone('utc', now()), 'YYYY-MM-DD');
  reward_wins integer := 0;
begin
  if target_user_id is null or auth.uid() is null or auth.uid() <> target_user_id then
    return null;
  end if;

  reward_wins := coalesce((
    select least(20, greatest(0, ps.daily_reward_wins))
    from public.player_stats ps
    where ps.user_id = target_user_id
      and ps.daily_reward_day::text = current_day
  ), 0);

  return jsonb_build_object(
    'nickname',
      (select p.nickname from public.profiles p where p.id = target_user_id),
    'equippedSkin',
      coalesce(
        (select p.equipped_skin from public.profiles p where p.id = target_user_id),
        'classic'
      ),
    'equippedBoardSkin',
      coalesce(
        (select p.equipped_board_skin from public.profiles p where p.id = target_user_id),
        'classic'
      ),
    'equippedAbilitySkills',
      coalesce(
        (
          select to_jsonb(p.equipped_ability_skills)
          from public.profiles p
          where p.id = target_user_id
        ),
        '["classic_guard"]'::jsonb
      ),
    'abilitySkillPresets',
      coalesce(
        (select p.ability_skill_presets from public.profiles p where p.id = target_user_id),
        '[[],[],[],[],[]]'::jsonb
      ),
    'activePreset',
      coalesce(
        (select p.active_preset from public.profiles p where p.id = target_user_id),
        1
      ),
    'ownedSkins',
      coalesce(
        (
          select jsonb_agg(os.skin_id order by os.skin_id)
          from public.owned_skins os
          where os.user_id = target_user_id
        ),
        '[]'::jsonb
      ),
    'ownedBoardSkins',
      coalesce(
        (
          select jsonb_agg(obs.board_skin_id order by obs.board_skin_id)
          from public.owned_board_skins obs
          where obs.user_id = target_user_id
        ),
        '[]'::jsonb
      ),
    'wins',
      coalesce((select ps.wins from public.player_stats ps where ps.user_id = target_user_id), 0),
    'losses',
      coalesce((select ps.losses from public.player_stats ps where ps.user_id = target_user_id), 0),
    'tokens',
      coalesce((select ps.tokens from public.player_stats ps where ps.user_id = target_user_id), 0),
    'dailyRewardWins',
      reward_wins,
    'dailyRewardTokens',
      reward_wins * 6,
    'achievements',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'achievementId', pa.achievement_id,
              'progress', pa.progress,
              'completed', pa.completed,
              'claimed', pa.claimed,
              'completedAt', pa.completed_at,
              'claimedAt', pa.claimed_at
            )
            order by pa.achievement_id
          )
          from public.player_achievements pa
          where pa.user_id = target_user_id
        ),
        '[]'::jsonb
      ),
    'currentRating',
      coalesce((select ps.current_rating from public.player_stats ps where ps.user_id = target_user_id), 0),
    'highestArena',
      coalesce((select ps.highest_arena_reached from public.player_stats ps where ps.user_id = target_user_id), 1),
    'rankedUnlocked',
      coalesce((select ps.ranked_unlocked from public.player_stats ps where ps.user_id = target_user_id), false)
  );
end;
$$;
```

- [ ] **Step 2: Apply migration in Supabase SQL Editor**

Open the Supabase dashboard SQL Editor, paste and run the new block you just appended (the ALTER TABLE statements, UPDATE, and CREATE OR REPLACE FUNCTION). Verify:
- `profiles` table now has `ability_skill_presets` and `active_preset` columns
- Existing rows have `ability_skill_presets[0]` populated from their `equipped_ability_skills`

- [ ] **Step 3: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat: add ability_skill_presets and active_preset columns to profiles"
```

---

### Task 2: Server — ProfileRow, AccountProfile, readAccountProfile

**Files:**
- Modify: `server/src/services/playerAuth.ts`

- [ ] **Step 1: Add fields to ProfileRow (line ~71)**

Find `interface ProfileRow` and add two new optional fields:

```typescript
interface ProfileRow {
  nickname: string | null;
  equipped_skin: PieceSkin | null;
  equipped_board_skin?: BoardSkin | null;
  equipped_ability_skills?: AbilitySkillId[] | null;
  ability_skill_presets?: unknown | null;
  active_preset?: number | null;
}
```

- [ ] **Step 2: Add fields to AccountProfile (line ~39)**

Find `export interface AccountProfile` and add:

```typescript
export interface AccountProfile {
  userId: string;
  nickname: string;
  equippedSkin: PieceSkin;
  equippedBoardSkin: BoardSkin;
  equippedAbilitySkills: AbilitySkillId[];
  abilitySkillPresets: AbilitySkillId[][];
  activePreset: number;
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

- [ ] **Step 3: Add normalizeAbilityPresets helper (after the existing normalizeAbilityLoadout function, ~line 110)**

```typescript
function normalizeAbilityPresets(
  value: unknown,
  activeLoadout: AbilitySkillId[],
): AbilitySkillId[][] {
  const defaultPresets: AbilitySkillId[][] = [activeLoadout, [], [], [], []];
  if (!Array.isArray(value) || value.length === 0) return defaultPresets;
  const presets = (value as unknown[])
    .slice(0, 5)
    .map((p) => normalizeAbilityLoadout(p));
  while (presets.length < 5) presets.push([]);
  return presets;
}
```

- [ ] **Step 4: Update the SELECT query in readAccountProfile (line ~237)**

Change:
```typescript
.select('nickname, equipped_skin, equipped_board_skin, equipped_ability_skills')
```
To:
```typescript
.select('nickname, equipped_skin, equipped_board_skin, equipped_ability_skills, ability_skill_presets, active_preset')
```

- [ ] **Step 5: Parse new fields and build return value in readAccountProfile**

After the existing `equippedAbilitySkills` is computed (after line 300), add:

```typescript
  const rawActivePreset = typeof profileResult?.data?.active_preset === 'number'
    ? profileResult.data.active_preset
    : 1;
  const activePreset = Math.max(1, Math.min(5, rawActivePreset));
  const abilitySkillPresets = normalizeAbilityPresets(
    profileResult?.data?.ability_skill_presets,
    equippedAbilitySkills,
  );
```

- [ ] **Step 6: Update the rotation-skill-removal DB update to also sync ability_skill_presets (line ~302)**

Find the block that updates `equipped_ability_skills` when rotation skills are removed, and change it to also update `ability_skill_presets`:

```typescript
  if (removedRotationSkills.length > 0) {
    const updatedPresets = [...abilitySkillPresets];
    updatedPresets[activePreset - 1] = equippedAbilitySkills;
    void Promise.resolve(
      supabaseAdmin
        ?.from('profiles')
        .update({
          equipped_ability_skills: equippedAbilitySkills,
          ability_skill_presets: updatedPresets,
        })
        .eq('id', userId)
    ).then((result) => {
      if (result?.error) console.error('[rotation] failed to update equipped_ability_skills', result.error);
    }).catch((err: unknown) => {
      console.error('[rotation] unexpected error updating equipped_ability_skills', err);
    });
  }
```

- [ ] **Step 7: Add new fields to the return object in readAccountProfile**

Find the `return {` near line 316 and add:

```typescript
  return {
    userId,
    nickname,
    equippedSkin: profileResult?.data?.equipped_skin ?? 'classic',
    equippedBoardSkin: profileResult?.data?.equipped_board_skin ?? 'classic',
    equippedAbilitySkills,
    abilitySkillPresets,
    activePreset,
    ownedSkins,
    // ... rest unchanged
  };
```

- [ ] **Step 8: Build server dist**

```bash
cd server && npx tsc --noEmit
```

Expected: no TypeScript errors. Fix any that appear.

- [ ] **Step 9: Commit**

```bash
git add server/src/services/playerAuth.ts
git commit -m "feat: server reads and returns ability skill presets from DB"
```

---

### Task 3: Client — guestAuth.ts Types

**Files:**
- Modify: `client/src/auth/guestAuth.ts`

- [ ] **Step 1: Add fields to ProfileRow (line ~34)**

```typescript
interface ProfileRow {
  nickname: string | null;
  equipped_skin: PieceSkin | null;
  equipped_board_skin?: BoardSkin | null;
  equipped_ability_skills?: AbilitySkillId[] | null;
  ability_skill_presets?: unknown | null;
  active_preset?: number | null;
  legal_consent_version?: string | null;
  legal_consented_at?: string | null;
}
```

- [ ] **Step 2: Add fields to AccountSnapshotRpcRow (line ~103)**

```typescript
interface AccountSnapshotRpcRow {
  nickname?: string | null;
  equippedSkin?: PieceSkin | null;
  equippedBoardSkin?: BoardSkin | null;
  equippedAbilitySkills?: string[] | null;
  abilitySkillPresets?: unknown | null;
  activePreset?: number | null;
  ownedSkins?: string[] | null;
  // ... rest unchanged
}
```

- [ ] **Step 3: Add fields to AccountSnapshot (line ~85)**

```typescript
interface AccountSnapshot {
  nickname: string | null;
  equippedSkin: PieceSkin;
  equippedBoardSkin: BoardSkin;
  equippedAbilitySkills: AbilitySkillId[];
  abilitySkillPresets: AbilitySkillId[][];
  activePreset: number;
  ownedSkins: PieceSkin[];
  // ... rest unchanged
}
```

- [ ] **Step 4: Add fields to exported AccountProfile (line ~128)**

```typescript
export interface AccountProfile {
  userId: string;
  nickname: string;
  equippedSkin: PieceSkin;
  equippedBoardSkin: BoardSkin;
  equippedAbilitySkills: AbilitySkillId[];
  abilitySkillPresets: AbilitySkillId[][];
  activePreset: number;
  ownedSkins: PieceSkin[];
  // ... rest unchanged
}
```

- [ ] **Step 5: Add fields to lastSyncedProfileState map type (line ~202)**

```typescript
const lastSyncedProfileState = new Map<
  string,
  {
    nickname?: string | null;
    equippedSkin?: PieceSkin;
    equippedBoardSkin?: BoardSkin;
    equippedAbilitySkills?: AbilitySkillId[];
    abilitySkillPresets?: AbilitySkillId[][];
    activePreset?: number;
    legalConsentVersion?: string | null;
    legalConsentedAt?: string | null;
  }
>();
```

- [ ] **Step 6: Check for TypeScript errors**

```bash
cd client && npx tsc --noEmit 2>&1 | head -50
```

Expected: errors about snapshot/profile return statements — these will be fixed in Task 4.

---

### Task 4: Client — guestAuth.ts Functions

**Files:**
- Modify: `client/src/auth/guestAuth.ts`

- [ ] **Step 1: Add normalizeAbilityPresets helper (place after normalizeAbilityLoadout usage, near line 214)**

```typescript
function normalizeAbilityPresets(
  value: unknown,
  activeLoadout: AbilitySkillId[],
): AbilitySkillId[][] {
  const defaultPresets: AbilitySkillId[][] = [activeLoadout, [], [], [], []];
  if (!Array.isArray(value) || (value as unknown[]).length === 0) return defaultPresets;
  const presets = (value as unknown[])
    .slice(0, 5)
    .map((p) => normalizeAbilityLoadout(p as unknown));
  while (presets.length < 5) presets.push([]);
  return presets;
}
```

- [ ] **Step 2: Update normalizeAccountSnapshot to include new fields (line ~618)**

In the `normalizeAccountSnapshot` function's return object, add after `equippedAbilitySkills`:

```typescript
    equippedAbilitySkills: normalizeAbilityLoadout(
      source?.equippedAbilitySkills ?? [],
    ),
    abilitySkillPresets: normalizeAbilityPresets(
      source?.abilitySkillPresets,
      normalizeAbilityLoadout(source?.equippedAbilitySkills ?? []),
    ),
    activePreset: Math.max(1, Math.min(5, Number(source?.activePreset ?? 1) || 1)),
```

- [ ] **Step 3: Update the no-supabase early return in getAccountSnapshot (line ~661)**

Find the early return when `!supabase` and add the two new fields:

```typescript
    return {
      nickname: null,
      equippedSkin: "classic",
      equippedBoardSkin: "classic",
      equippedAbilitySkills: [],
      abilitySkillPresets: [[], [], [], [], []],
      activePreset: 1,
      ownedSkins: [],
      // ... rest unchanged
    };
```

- [ ] **Step 4: Update the fallback profiles query in getAccountSnapshot (line ~750)**

Change:
```typescript
        .select(
          "nickname, equipped_skin, equipped_board_skin, equipped_ability_skills",
        )
```
To:
```typescript
        .select(
          "nickname, equipped_skin, equipped_board_skin, equipped_ability_skills, ability_skill_presets, active_preset",
        )
```

- [ ] **Step 5: Update the snapshot construction in fallback path (line ~762)**

Add the two new fields after `equippedAbilitySkills`:

```typescript
      equippedAbilitySkills: normalizeAbilityLoadout(
        profileResult.data?.equipped_ability_skills ?? [],
      ),
      abilitySkillPresets: normalizeAbilityPresets(
        profileResult.data?.ability_skill_presets,
        normalizeAbilityLoadout(profileResult.data?.equipped_ability_skills ?? []),
      ),
      activePreset: Math.max(
        1,
        Math.min(5, Number(profileResult.data?.active_preset ?? 1) || 1),
      ),
```

- [ ] **Step 6: Update toAuthState to pass new fields (line ~365)**

In `toAuthState` return object, add after `equippedAbilitySkills`:

```typescript
    equippedAbilitySkills: snapshot?.equippedAbilitySkills,
    abilitySkillPresets: snapshot?.abilitySkillPresets,
    activePreset: snapshot?.activePreset,
```

- [ ] **Step 7: Update createDisconnectedAuthState (line ~392)**

Add after `equippedAbilitySkills: []`:

```typescript
    equippedAbilitySkills: [],
    abilitySkillPresets: [[], [], [], [], []],
    activePreset: 1,
```

- [ ] **Step 8: Update refreshAccountSummary early returns and main return (line ~1040)**

The two early returns (no supabase, no session) need the new fields. And the final `return { ... }` needs them too.

For both early returns:
```typescript
      equippedAbilitySkills: [],
      abilitySkillPresets: [[], [], [], [], []],
      activePreset: 1,
```

For the main return (line ~1089):
```typescript
    equippedAbilitySkills: snapshot.equippedAbilitySkills,
    abilitySkillPresets: snapshot.abilitySkillPresets,
    activePreset: snapshot.activePreset,
```

- [ ] **Step 9: Add syncAbilityPresets export function (after syncEquippedAbilitySkills)**

```typescript
export async function syncAbilityPresets(
  presets: AbilitySkillId[][],
  activePreset: number,
): Promise<void> {
  if (!supabase) return;
  const session = await getCurrentSession();
  if (!session?.user) return;

  const userId = session.user.id;
  const normalizedPresets = presets.map((p) => normalizeAbilityLoadout(p));
  const clamped = Math.max(1, Math.min(5, activePreset));
  const activeLoadout = normalizedPresets[clamped - 1] ?? [];

  const { error } = await supabase.from("profiles").upsert({
    id: userId,
    ability_skill_presets: normalizedPresets,
    active_preset: clamped,
    equipped_ability_skills: activeLoadout,
    is_guest: session.user.is_anonymous ?? false,
  });

  if (error) {
    console.error("[supabase] failed to sync ability presets", error);
    return;
  }

  invalidateAccountSnapshot(userId);
  const current = lastSyncedProfileState.get(userId);
  lastSyncedProfileState.set(userId, {
    ...(current ?? {}),
    equippedAbilitySkills: activeLoadout,
    abilitySkillPresets: normalizedPresets,
    activePreset: clamped,
  });
  knownProfileUsers.add(userId);
}
```

- [ ] **Step 10: Verify no TypeScript errors**

```bash
cd client && npx tsc --noEmit 2>&1 | head -50
```

Expected: errors only in gameStore.ts and App.tsx (not yet updated).

- [ ] **Step 11: Commit**

```bash
git add client/src/auth/guestAuth.ts
git commit -m "feat: client guestAuth supports ability skill presets"
```

---

### Task 5: gameStore.ts — State and Actions

**Files:**
- Modify: `client/src/store/gameStore.ts`

- [ ] **Step 1: Add new fields to GameStore interface (after equippedAbilitySkills, ~line 73)**

```typescript
  equippedAbilitySkills?: AbilitySkillId[];
  abilitySkillPresets: AbilitySkillId[][];
  activePreset: number;
```

- [ ] **Step 2: Add new fields to setAuthState payload type (~line 149)**

In the `setAuthState` parameter object type, add after `equippedAbilitySkills?`:

```typescript
    equippedAbilitySkills?: AbilitySkillId[];
    abilitySkillPresets?: AbilitySkillId[][];
    activePreset?: number;
```

- [ ] **Step 3: Add new action signatures to GameStore interface (~line 187)**

After `setAbilityLoadout`:
```typescript
  setAbilityLoadoutForPreset: (skills: AbilitySkillId[]) => void;
  switchAbilityPreset: (presetIndex: number) => void;
```

- [ ] **Step 4: Initialize new state fields (~line 358)**

After `abilityLoadout: initialAbilityLoadout,`:

```typescript
  abilitySkillPresets: [[], [], [], [], []],
  activePreset: 1,
```

- [ ] **Step 5: Update setAuthState implementation to handle new fields (~line 401)**

Destructure the new params:

```typescript
  setAuthState: ({
    ready,
    userId,
    accessToken,
    isGuestUser,
    nickname,
    equippedSkin,
    equippedBoardSkin,
    equippedAbilitySkills,
    abilitySkillPresets,
    activePreset,
    ownedSkins,
    // ... rest
  }) => {
```

In the `set((state) => ({ ... }))` block, replace the `abilityLoadout` logic and add new fields:

```typescript
      abilitySkillPresets: abilitySkillPresets ?? state.abilitySkillPresets,
      activePreset: activePreset ?? state.activePreset,
      abilityLoadout:
        abilitySkillPresets !== undefined
          ? normalizeAbilityLoadout(
              abilitySkillPresets[(activePreset ?? state.activePreset) - 1] ?? [],
            )
          : equippedAbilitySkills !== undefined
            ? normalizeAbilityLoadout(equippedAbilitySkills)
            : userId
              ? userId !== state.authUserId
                ? initialAbilityLoadout
                : state.abilityLoadout
              : initialAbilityLoadout,
```

- [ ] **Step 6: Add setAbilityLoadoutForPreset action (after setAbilityLoadout)**

```typescript
  setAbilityLoadoutForPreset: (skills) =>
    set((state) => {
      const normalized = normalizeAbilityLoadout(skills);
      const newPresets = [...state.abilitySkillPresets];
      newPresets[state.activePreset - 1] = normalized;
      return { abilityLoadout: normalized, abilitySkillPresets: newPresets };
    }),
```

- [ ] **Step 7: Add switchAbilityPreset action (after setAbilityLoadoutForPreset)**

```typescript
  switchAbilityPreset: (presetIndex) =>
    set((state) => {
      const clamped = Math.max(1, Math.min(5, presetIndex));
      const newLoadout = normalizeAbilityLoadout(
        state.abilitySkillPresets[clamped - 1] ?? [],
      );
      return { activePreset: clamped, abilityLoadout: newLoadout };
    }),
```

- [ ] **Step 8: Verify no TypeScript errors**

```bash
cd client && npx tsc --noEmit 2>&1 | head -50
```

Expected: errors only in App.tsx and LobbyScreen.tsx.

- [ ] **Step 9: Commit**

```bash
git add client/src/store/gameStore.ts
git commit -m "feat: gameStore adds abilitySkillPresets, activePreset, and preset actions"
```

---

### Task 6: App.tsx — Update Sync Effect and account_sync Handler

**Files:**
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Update the import from guestAuth (~line 22)**

Change:
```typescript
  syncEquippedAbilitySkills,
```
To:
```typescript
  syncAbilityPresets,
```

- [ ] **Step 2: Add abilitySkillPresets and activePreset to useGameStore destructure (~line 200)**

After `abilityLoadout,`:
```typescript
  abilityLoadout,
  abilitySkillPresets,
  activePreset,
```

- [ ] **Step 3: Update the abilityLoadout sync useEffect (~line 522)**

Replace the entire effect:
```typescript
  useEffect(() => {
    if (!authReady || !authUserId || !authAccessToken || accountSummaryLoading)
      return;
    const { abilitySkillPresets: presets, activePreset: preset } =
      useGameStore.getState();
    void syncAbilityPresets(presets, preset);
  }, [
    abilityLoadout,
    accountSummaryLoading,
    authAccessToken,
    authReady,
    authUserId,
  ]);
```

Note: `abilitySkillPresets` and `activePreset` are read inside the effect (not as deps) to avoid infinite loops from array reference inequality. The effect still fires on `abilityLoadout` changes, which happen whenever `setAbilityLoadoutForPreset` or `switchAbilityPreset` is called.

- [ ] **Step 4: Update the account_sync handler to use setAbilityLoadoutForPreset (~line 629)**

Find this block:
```typescript
                  if (removed.length > 0) {
                    store.setPendingRemovedRotationSkillsNotice(removed);
                    const equipped = (syncResp.profile.equippedAbilitySkills ??
                      []) as AbilitySkillId[];
                    store.setAbilityLoadout(equipped);
                  }
```

Replace `store.setAbilityLoadout(equipped)` with `store.setAbilityLoadoutForPreset(equipped)` so the active preset slot is updated too:

```typescript
                  if (removed.length > 0) {
                    store.setPendingRemovedRotationSkillsNotice(removed);
                    const equipped = (syncResp.profile.equippedAbilitySkills ??
                      []) as AbilitySkillId[];
                    store.setAbilityLoadoutForPreset(equipped);
                  }
```

- [ ] **Step 5: Add abilitySkillPresets and activePreset to ESLint deps if needed**

If `abilitySkillPresets` and `activePreset` are unused after destructuring (only accessed via `useGameStore.getState()` inside the effect), remove them from the destructure — only `abilityLoadout` is needed as a reactive dep.

Actually: Remove `abilitySkillPresets` and `activePreset` from the useGameStore destructure unless they are used elsewhere in the component. Check for usage first. If not used elsewhere, don't destructure them.

- [ ] **Step 6: Verify no TypeScript errors**

```bash
cd client && npx tsc --noEmit 2>&1 | head -50
```

Expected: errors only in LobbyScreen.tsx.

- [ ] **Step 7: Commit**

```bash
git add client/src/App.tsx
git commit -m "feat: App.tsx syncs full ability preset state on loadout change"
```

---

### Task 7: LobbyScreen UI — Preset Buttons

**Files:**
- Modify: `client/src/components/Lobby/LobbyScreen.tsx`
- Modify: `client/src/components/Lobby/LobbyScreen.css`

- [ ] **Step 1: Update useGameStore destructure in LobbyScreen (~line 892)**

Add to the destructured values:
```typescript
    abilitySkillPresets,
    activePreset,
    setAbilityLoadoutForPreset,
    switchAbilityPreset,
```

Remove `setAbilityLoadout` from the destructure if it's no longer needed (check usage).

- [ ] **Step 2: Add handleSwitchPreset handler (after handleToggleAbilitySkill ~line 3792)**

```typescript
  const handleSwitchPreset = (presetIndex: number) => {
    switchAbilityPreset(presetIndex);
  };
```

- [ ] **Step 3: Update handleToggleAbilitySkill to use setAbilityLoadoutForPreset (~line 3792)**

Change:
```typescript
  const handleToggleAbilitySkill = (skillId: AbilitySkillId) => {
    const isEquipped = abilityLoadout.includes(skillId);

    if (isEquipped) {
      setAbilityLoadout(abilityLoadout.filter((value) => value !== skillId));
      return;
    }

    if (abilityLoadout.length >= 3) {
      showSkinFloatingMessage(
        lang === "en"
          ? "You can equip up to 3 skills."
          : "스킬은 최대 3개까지 장착할 수 있습니다.",
      );
      return;
    }

    setAbilityLoadout([...abilityLoadout, skillId]);
  };
```

To:
```typescript
  const handleToggleAbilitySkill = (skillId: AbilitySkillId) => {
    const isEquipped = abilityLoadout.includes(skillId);

    if (isEquipped) {
      setAbilityLoadoutForPreset(abilityLoadout.filter((value) => value !== skillId));
      return;
    }

    if (abilityLoadout.length >= 3) {
      showSkinFloatingMessage(
        lang === "en"
          ? "You can equip up to 3 skills."
          : "스킬은 최대 3개까지 장착할 수 있습니다.",
      );
      return;
    }

    setAbilityLoadoutForPreset([...abilityLoadout, skillId]);
  };
```

- [ ] **Step 4: Remove unused abilityLoadoutDesc variable (~line 1331)**

`abilityLoadoutDesc` is only used at line 5134 (the `<p>` we're removing). Delete the const declaration at line 1331:
```typescript
  // DELETE these lines:
  const abilityLoadoutDesc =
    lang === "en"
      ? "Select up to 3 skills..."
      : "능력 대전에 가져갈 스킬을 최대 3개까지 선택하세요.";
```

`abilityLoadoutTitle` stays — it's still used at lines 4185 and 4211.

Also update the `syncEquippedAbilitySkills` call before matchmaking (~line 3333) to use `syncAbilityPresets`:
```typescript
// Change:
await syncEquippedAbilitySkills(useGameStore.getState().abilityLoadout);
// To:
const s = useGameStore.getState();
await syncAbilityPresets(s.abilitySkillPresets, s.activePreset);
```
Update the import at line 40 accordingly.

- [ ] **Step 6: Update the ability loadout modal JSX (~line 5110)**

Find the ability loadout modal. The modal currently has this structure:
```jsx
<div className="skin-modal-head">
  <h3>{abilityLoadoutTitle}</h3>
  <div className="skin-token-badge" ...>...</div>
</div>
<p>{abilityLoadoutDesc}</p>
<div className="ability-loadout-chip-row ability-loadout-modal-selected">
  ...
</div>
```

Replace it with:
```jsx
<div className="ability-preset-bar">
  {[1, 2, 3, 4, 5].map((index) => (
    <button
      key={index}
      type="button"
      className={`ability-preset-btn${activePreset === index ? " is-active" : ""}`}
      onClick={() => handleSwitchPreset(index)}
    >
      {index}
    </button>
  ))}
  <div className="skin-token-badge ability-preset-count" aria-label="Ability loadout count">
    <span className="skin-token-badge-main">
      <span>{equippedAbilitySkillDefs.length} / 3</span>
      <span>{abilityLoadoutCount}</span>
    </span>
  </div>
</div>
<div className="ability-loadout-chip-row ability-loadout-modal-selected">
  ...chip row content unchanged...
</div>
```

Specifically: remove the `<div className="skin-modal-head">` block and the `<p>{abilityLoadoutDesc}</p>`, and add the `<div className="ability-preset-bar">` block in their place.

- [ ] **Step 8: Add CSS for preset buttons in LobbyScreen.css**

Append after the `.ability-loadout-chip-row` block (after line ~3980):

```css
.ability-preset-bar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0 0 0.75rem 0;
}

.ability-preset-btn {
  width: 2.2rem;
  height: 2.2rem;
  border-radius: 0.45rem;
  border: 1.5px solid var(--tile-border, #3a444d);
  background: var(--tile, #2a3137);
  color: var(--text-muted, #8a9bb0);
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s, color 0.15s;
  flex: 0 0 auto;
}

.ability-preset-btn:hover {
  border-color: var(--blue, #3b82f6);
  color: var(--text, #e2e8f0);
}

.ability-preset-btn.is-active {
  border-color: var(--blue, #3b82f6);
  background: rgba(59, 130, 246, 0.15);
  color: #93c5fd;
}

.ability-preset-count {
  margin-left: auto;
}
```

- [ ] **Step 9: Verify TypeScript compiles**

```bash
cd client && npx tsc --noEmit 2>&1 | head -50
```

Expected: no errors.

- [ ] **Step 10: Build and test manually**

```bash
cd client && npm run dev
```

Open the lobby, open the equipped skills modal. Verify:
1. Five numbered buttons appear at the top
2. Button 1 is highlighted (active) by default
3. Clicking buttons 2-5 switches the displayed skills instantly
4. Toggling a skill saves to the current preset
5. Switching to a different preset shows that preset's skills
6. No title "장착 스킬" and no description text
7. The count badge (X / 3) is still visible

- [ ] **Step 11: Test persistence**

1. Switch to preset 2, equip a skill
2. Refresh the page
3. Verify preset 2 is still selected and still shows the equipped skill

- [ ] **Step 12: Commit**

```bash
git add client/src/components/Lobby/LobbyScreen.tsx client/src/components/Lobby/LobbyScreen.css
git commit -m "feat: add preset buttons to lobby ability skill modal"
```

---

## Done

All 7 tasks complete. The lobby equipped-skill modal now has 5 numbered preset slots, each storing up to 3 skills independently. The active preset is persisted to DB on every change and restored on login.
