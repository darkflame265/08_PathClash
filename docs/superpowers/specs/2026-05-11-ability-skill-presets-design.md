# Ability Skill Preset Feature Design

**Date:** 2026-05-11  
**Scope:** Lobby equipped-skill window only (training ground excluded)

---

## Overview

Add 5 numbered preset slots to the lobby's equipped-skill window. Each preset stores up to 3 ability skills independently. Switching presets instantly loads that preset's skills. The last-used preset is remembered across sessions via the database.

---

## Database Changes

Table: `profiles`

Add two columns:

```sql
ability_skill_presets jsonb NOT NULL DEFAULT '[[],[],[],[],[]]'
active_preset         smallint NOT NULL DEFAULT 1
```

- `ability_skill_presets`: a JSON array of 5 arrays, each holding up to 3 skill ID strings. Index 0 = preset 1, index 4 = preset 5.
- `active_preset`: integer 1–5 indicating the currently active preset.
- `equipped_ability_skills`: unchanged. Always kept in sync with `ability_skill_presets[active_preset - 1]` so the server game logic requires no changes.

**Migration:** When adding the columns, copy each player's existing `equipped_ability_skills` value into slot 0 (preset 1) of `ability_skill_presets`. Presets 2–5 start empty.

---

## Server Changes (`server/src/services/playerAuth.ts`)

In `readAccountProfile()`, additionally select `ability_skill_presets` and `active_preset` from the profiles table and include them in the returned `AccountProfile`.

Validation:
- Clamp `active_preset` to 1–5 (default 1 if out of range or null).
- Apply `normalizeAbilityLoadout()` to each preset array (trim to max 3 valid skill IDs). Skip rotation filtering for inactive presets — only apply it to the active preset (same as current behavior).

---

## Type Changes

Add to `AccountProfile`, `AccountSnapshot`, and `AuthStatePayload`:

```ts
abilitySkillPresets: AbilitySkillId[][]  // length 5, each sub-array 0–3 items
activePreset: number                      // 1–5
```

---

## Client State (`client/src/store/gameStore.ts`)

Add two fields to the account state slice:

```ts
abilitySkillPresets: AbilitySkillId[][]
activePreset: number
```

These are populated from `AccountProfile` on login, the same as `equippedAbilitySkills`.

---

## Save Logic (`client/src/auth/guestAuth.ts`)

### Skill toggle (existing `syncEquippedAbilitySkills` extended)

When the user toggles a skill inside the lobby skill window:

1. Compute the new skill array for the active preset.
2. Update `abilitySkillPresets[activePreset - 1]` in local state.
3. Upsert to DB: set `ability_skill_presets` = new full presets array, `equipped_ability_skills` = active preset's array.
4. Invalidate account snapshot cache.

Skip DB write if nothing changed (same guard as existing logic).

### Preset switch

When the user clicks a preset button:

1. Set `activePreset` = new index in local state.
2. Load `abilitySkillPresets[newIndex - 1]` as the displayed equipped skills.
3. Upsert to DB: set `active_preset` = new index, `equipped_ability_skills` = new preset's array.
4. Invalidate account snapshot cache.

---

## UI Changes (`client/src/components/Ability/AbilityScreen.tsx`)

### Lobby skill window only

- **Remove** the "장착 스킬" section title.
- **Remove** the "능력 대전에 가져갈 스킬을 최대 3개까지 선택하세요." description text.
- **Add** a row of 5 square buttons labeled `1` through `5` at the top of the modal content area.
  - Active preset button has a distinct highlight style (e.g., primary color border/background).
  - Clicking a button runs the preset switch flow above.

### Training ground skill window

No changes.

---

## Data Flow Summary

```
Login
  → server reads ability_skill_presets + active_preset
  → client stores both in gameStore

User opens lobby skill modal
  → shows preset buttons, highlights activePreset
  → shows skills from abilitySkillPresets[activePreset - 1]

User clicks preset N
  → activePreset = N (local)
  → equippedAbilitySkills = presets[N-1] (local)
  → DB: active_preset = N, equipped_ability_skills = presets[N-1]

User toggles skill X in active preset
  → presets[activePreset-1] updated (local)
  → equippedAbilitySkills = presets[activePreset-1] (local)
  → DB: ability_skill_presets = full array, equipped_ability_skills = active array
```

---

## Edge Cases

- **New player**: `active_preset` defaults to 1, `ability_skill_presets` defaults to `[[],[],[],[],[]]`. Preset 1 may be empty until the player equips skills.
- **Empty preset switch**: Switching to an empty preset results in 0 equipped skills — valid state.
- **Rotation skill removal**: Applied only to the active preset on profile load, same as current behavior.
