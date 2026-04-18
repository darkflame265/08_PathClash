import { supabaseAdmin } from '../lib/supabase';
import type { PieceSkin } from '../types/game.types';
import {
  ACHIEVEMENT_CATALOG,
  ACHIEVEMENT_CATALOG_BY_ID,
  type AchievementCatalogEntry,
} from '../achievements/achievementCatalog';

export interface PlayerAchievementState {
  achievementId: string;
  progress: number;
  completed: boolean;
  claimed: boolean;
  completedAt: string | null;
  claimedAt: string | null;
}

interface AchievementRow {
  achievement_id: string;
  progress: number | null;
  completed: boolean | null;
  claimed: boolean | null;
  completed_at: string | null;
  claimed_at: string | null;
}

type AchievementUpdate = {
  achievementId: string;
  progress: number;
  completed: boolean;
  claimed?: boolean;
  completedAt?: string | null;
  claimedAt?: string | null;
};

type AchievementCounterSpec =
  | { kind: 'single'; achievementId: string; amount?: number }
  | { kind: 'series'; prefix: string; milestones: readonly number[]; amount?: number };

const WIN_SERIES = [1, 3, 5, 10, 30, 50, 100, 500, 1000, 10000] as const;
const TOTAL_WIN_SERIES = [10, 50, 100, 500, 1000, 10000] as const;
const GAMES_PLAYED_SERIES = [10, 50, 100, 500, 1000] as const;
const SKIN_SERIES = [3, 10, 20] as const;
const DAILY_REWARD_SERIES = [10, 50] as const;
const FULL_HP_SERIES = [1, 5, 30] as const;
const ATTACK_SKILL_SERIES = [1, 5, 10, 30] as const;
const DEFENSE_SKILL_SERIES = [1, 5, 10, 30] as const;
const UTILITY_SKILL_SERIES = [5, 25, 50, 150] as const;

const ATTACK_FINISH_SKILLS = new Set([
  'ember_blast',
  'sun_chariot',
  'atomic_fission',
  'inferno_field',
  'nova_blast',
  'electric_blitz',
  'cosmic_bigbang',
]);

const DEFENSE_BLOCK_SKILLS = new Set(['classic_guard', 'arc_reactor_field']);
const UTILITY_USE_SKILLS = new Set([
  'aurora_heal',
  'quantum_shift',
  'plasma_charge',
  'void_cloak',
  'phase_shift',
  'gold_overdrive',
  'wizard_magic_mine',
  'chronos_time_rewind',
]);

function toState(row: AchievementRow): PlayerAchievementState {
  return {
    achievementId: row.achievement_id,
    progress: Number(row.progress ?? 0),
    completed: Boolean(row.completed),
    claimed: Boolean(row.claimed),
    completedAt: row.completed_at ?? null,
    claimedAt: row.claimed_at ?? null,
  };
}

async function readRows(userId: string, achievementIds?: string[]): Promise<Map<string, PlayerAchievementState>> {
  if (!supabaseAdmin) return new Map();
  let query = supabaseAdmin
    .from('player_achievements')
    .select('achievement_id, progress, completed, claimed, completed_at, claimed_at')
    .eq('user_id', userId);

  if (achievementIds && achievementIds.length > 0) {
    query = query.in('achievement_id', achievementIds);
  }

  const { data, error } = await query.returns<AchievementRow[]>();
  if (error) {
    console.error('[achievements] failed to read rows', error);
    return new Map();
  }

  return new Map((data ?? []).map((row) => [row.achievement_id, toState(row)]));
}

async function upsertRows(
  userId: string,
  entries: AchievementUpdate[],
): Promise<void> {
  if (!supabaseAdmin || entries.length === 0) return;

  const payload = entries.map((entry) => ({
    user_id: userId,
    achievement_id: entry.achievementId,
    progress: entry.progress,
    completed: entry.completed,
    claimed: entry.claimed ?? false,
    completed_at: entry.completedAt ?? null,
    claimed_at: entry.claimedAt ?? null,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabaseAdmin
    .from('player_achievements')
    .upsert(payload, { onConflict: 'user_id,achievement_id' });

  if (error) {
    console.error('[achievements] failed to upsert rows', error);
  }
}

function hasMeaningfulAchievementChange(
  current: PlayerAchievementState | undefined,
  next: AchievementUpdate,
) {
  if (!current) return true;
  return (
    current.progress !== next.progress ||
    current.completed !== next.completed ||
    current.claimed !== Boolean(next.claimed) ||
    current.completedAt !== (next.completedAt ?? null) ||
    current.claimedAt !== (next.claimedAt ?? null)
  );
}

async function applySeriesAbsolute(
  userId: string,
  prefix: string,
  milestones: readonly number[],
  progress: number,
  existingRows?: Map<string, PlayerAchievementState>,
): Promise<void> {
  const ids = milestones.map((goal) => `${prefix}${goal}`);
  const existing = existingRows ?? await readRows(userId, ids);
  const nowIso = new Date().toISOString();
  const updates = milestones.flatMap((goal) => {
    const achievementId = `${prefix}${goal}`;
    const current = existing.get(achievementId);
    const nextProgress = Math.max(current?.progress ?? 0, progress);
    const completed = nextProgress >= goal;
    const next = {
      achievementId,
      progress: nextProgress,
      completed,
      claimed: current?.claimed ?? false,
      completedAt: completed ? current?.completedAt ?? nowIso : current?.completedAt ?? null,
      claimedAt: current?.claimedAt ?? null,
    };
    return hasMeaningfulAchievementChange(current, next) ? [next] : [];
  });

  await upsertRows(userId, updates);
}

async function incrementSeries(
  userId: string,
  prefix: string,
  milestones: readonly number[],
  amount = 1,
): Promise<void> {
  const ids = milestones.map((goal) => `${prefix}${goal}`);
  const existing = await readRows(userId, ids);
  const currentProgress = ids.reduce((max, id) => Math.max(max, existing.get(id)?.progress ?? 0), 0);
  await applySeriesAbsolute(userId, prefix, milestones, currentProgress + amount, existing);
}

async function setSingleProgressAbsolute(userId: string, achievementId: string, progress: number): Promise<void> {
  const existing = await readRows(userId, [achievementId]);
  const current = existing.get(achievementId);
  const catalog = ACHIEVEMENT_CATALOG_BY_ID.get(achievementId);
  if (!catalog) return;
  const nowIso = new Date().toISOString();
  const nextProgress = Math.max(current?.progress ?? 0, progress);
  const completed = nextProgress >= catalog.goal;
  const next = {
    achievementId,
    progress: nextProgress,
    completed,
    claimed: current?.claimed ?? false,
    completedAt: completed ? current?.completedAt ?? nowIso : current?.completedAt ?? null,
    claimedAt: current?.claimedAt ?? null,
  };
  if (!hasMeaningfulAchievementChange(current, next)) return;
  await upsertRows(userId, [next]);
}

async function incrementSingle(userId: string, achievementId: string, amount = 1): Promise<void> {
  const existing = await readRows(userId, [achievementId]);
  const current = existing.get(achievementId);
  const catalog = ACHIEVEMENT_CATALOG_BY_ID.get(achievementId);
  if (!catalog) return;
  const nextProgress = (current?.progress ?? 0) + amount;
  const completed = nextProgress >= catalog.goal;
  const nowIso = new Date().toISOString();
  await upsertRows(userId, [{
    achievementId,
    progress: nextProgress,
    completed,
    claimed: current?.claimed ?? false,
    completedAt: completed ? current?.completedAt ?? nowIso : current?.completedAt ?? null,
    claimedAt: current?.claimedAt ?? null,
  }]);
}

async function incrementAchievementCounters(
  userId: string,
  specs: AchievementCounterSpec[],
): Promise<void> {
  if (specs.length === 0) return;

  const ids = [
    ...new Set(
      specs.flatMap((spec) =>
        spec.kind === 'single'
          ? [spec.achievementId]
          : spec.milestones.map((goal) => `${spec.prefix}${goal}`),
      ),
    ),
  ];
  const existing = await readRows(userId, ids);
  const nowIso = new Date().toISOString();
  const updates: AchievementUpdate[] = [];

  for (const spec of specs) {
    const amount = spec.amount ?? 1;
    if (spec.kind === 'single') {
      const catalog = ACHIEVEMENT_CATALOG_BY_ID.get(spec.achievementId);
      if (!catalog) continue;
      const current = existing.get(spec.achievementId);
      const nextProgress = (current?.progress ?? 0) + amount;
      const completed = nextProgress >= catalog.goal;
      const next = {
        achievementId: spec.achievementId,
        progress: nextProgress,
        completed,
        claimed: current?.claimed ?? false,
        completedAt: completed ? current?.completedAt ?? nowIso : current?.completedAt ?? null,
        claimedAt: current?.claimedAt ?? null,
      };
      if (hasMeaningfulAchievementChange(current, next)) {
        updates.push(next);
      }
      continue;
    }

    const seriesIds = spec.milestones.map((goal) => `${spec.prefix}${goal}`);
    const currentProgress = seriesIds.reduce(
      (max, id) => Math.max(max, existing.get(id)?.progress ?? 0),
      0,
    );
    const nextSeriesProgress = currentProgress + amount;

    for (const goal of spec.milestones) {
      const achievementId = `${spec.prefix}${goal}`;
      const current = existing.get(achievementId);
      const nextProgress = Math.max(current?.progress ?? 0, nextSeriesProgress);
      const completed = nextProgress >= goal;
      const next = {
        achievementId,
        progress: nextProgress,
        completed,
        claimed: current?.claimed ?? false,
        completedAt: completed ? current?.completedAt ?? nowIso : current?.completedAt ?? null,
        claimedAt: current?.claimedAt ?? null,
      };
      if (hasMeaningfulAchievementChange(current, next)) {
        updates.push(next);
      }
    }
  }

  await upsertRows(userId, updates);
}

async function addTokens(userId: string, tokenAmount: number): Promise<void> {
  if (!supabaseAdmin || tokenAmount <= 0) return;
  const { data, error } = await supabaseAdmin
    .from('player_stats')
    .select('tokens')
    .eq('user_id', userId)
    .maybeSingle<{ tokens: number | null }>();

  if (error) {
    console.error('[achievements] failed to read tokens', error);
    return;
  }

  const currentTokens = Number(data?.tokens ?? 0);
  const { error: upsertError } = await supabaseAdmin.from('player_stats').upsert(
    {
      user_id: userId,
      tokens: currentTokens + tokenAmount,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );

  if (upsertError) {
    console.error('[achievements] failed to grant tokens', upsertError);
  }
}

export async function listPlayerAchievements(userId: string): Promise<PlayerAchievementState[]> {
  const rows = await readRows(userId);
  return [...rows.values()];
}

export async function syncAchievementDerivedProgress(args: {
  userId: string;
  ownedSkins?: PieceSkin[];
}): Promise<void> {
  await setSingleProgressAbsolute(args.userId, 'welcome_to_pathclash', 1);
  const ownedSkinCount = new Set(['classic', ...(args.ownedSkins ?? [])]).size;
  await applySeriesAbsolute(args.userId, 'skins_owned_', SKIN_SERIES, ownedSkinCount);
}

export async function markTutorialComplete(userId: string | null | undefined): Promise<void> {
  if (!userId) return;
  await setSingleProgressAbsolute(userId, 'tutorial_complete', 1);
}

export async function trackSettingsAchievements(args: {
  userId: string;
  isMusicMuted: boolean;
  isSfxMuted: boolean;
  musicVolumePercent: number;
  sfxVolumePercent: number;
}): Promise<void> {
  const isAudioOffZero =
    args.isMusicMuted &&
    args.isSfxMuted &&
    args.musicVolumePercent === 0 &&
    args.sfxVolumePercent === 0;
  const isAudioOnFull =
    !args.isMusicMuted &&
    !args.isSfxMuted &&
    args.musicVolumePercent === 100 &&
    args.sfxVolumePercent === 100;

  if (isAudioOffZero) {
    await setSingleProgressAbsolute(args.userId, 'settings_audio_off_zero', 1);
  }
  if (isAudioOnFull) {
    await setSingleProgressAbsolute(args.userId, 'settings_audio_on_full', 1);
  }
}

export async function recordMatchPlayed(args: {
  userIds: Array<string | null | undefined>;
  matchType: 'ai' | 'duel' | 'ability' | 'twovtwo' | 'coop';
}): Promise<void> {
  const userIds = [...new Set(args.userIds.filter((value): value is string => Boolean(value)))];
  await Promise.all(
    userIds.map((userId) =>
      incrementAchievementCounters(userId, [
        { kind: 'single', achievementId: 'first_match_played' },
        { kind: 'series', prefix: 'games_played_', milestones: GAMES_PLAYED_SERIES },
      ]),
    ),
  );
}

export async function recordModeWin(args: {
  userId: string | null | undefined;
  mode: 'ai' | 'duel' | 'ability' | 'twovtwo' | 'coop';
}): Promise<void> {
  const userId = args.userId;
  if (!userId) return;

  const prefixByMode = {
    ai: 'ai_win_',
    duel: 'duel_win_',
    ability: 'ability_win_',
    twovtwo: 'twovtwo_win_',
    coop: 'coop_clear_',
  } as const;

  await incrementAchievementCounters(userId, [
    { kind: 'single', achievementId: 'first_win' },
    { kind: 'series', prefix: 'wins_total_', milestones: TOTAL_WIN_SERIES },
    { kind: 'series', prefix: prefixByMode[args.mode], milestones: WIN_SERIES },
  ]);
}

export async function recordDailyRewardGrant(userIds: Array<string | null | undefined>, rewardWins: number): Promise<void> {
  const normalizedUserIds = [...new Set(userIds.filter((value): value is string => Boolean(value)))];
  if (rewardWins <= 0) return;
  await Promise.all(
    normalizedUserIds.map((userId) => incrementSeries(userId, 'daily_reward_', DAILY_REWARD_SERIES, rewardWins)),
  );
}

export async function recordAbilitySpecialWin(args: {
  winnerUserId: string | null | undefined;
  winnerHp: number;
  disconnectWin?: boolean;
}): Promise<void> {
  if (!args.winnerUserId || args.disconnectWin) return;
  if (args.winnerHp !== 5) return;
  await incrementSeries(args.winnerUserId, 'ability_win_full_hp_', FULL_HP_SERIES, 1);
}

export async function recordAbilitySkillFinish(args: {
  winnerUserId: string | null | undefined;
  finisherSkillId: string | null;
}): Promise<void> {
  if (!args.winnerUserId || !args.finisherSkillId) return;
  if (!ATTACK_FINISH_SKILLS.has(args.finisherSkillId)) return;
  await incrementSeries(
    args.winnerUserId,
    `skill_finish_${args.finisherSkillId}_`,
    ATTACK_SKILL_SERIES,
    1,
  );
}

export async function recordAbilityBlockEvents(args: {
  byUserId: Record<string, Array<'classic_guard' | 'arc_reactor_field'>>;
}): Promise<void> {
  const entries = Object.entries(args.byUserId);
  await Promise.all(
    entries.flatMap(([userId, skillIds]) =>
      skillIds
        .filter((skillId) => DEFENSE_BLOCK_SKILLS.has(skillId))
        .map((skillId) =>
          incrementSeries(userId, `skill_block_${skillId}_`, DEFENSE_SKILL_SERIES, 1),
        ),
    ),
  );
}

export async function recordAbilityUtilityUsage(args: {
  byUserId: Record<string, string[]>;
}): Promise<void> {
  const entries = Object.entries(args.byUserId);
  await Promise.all(
    entries.flatMap(([userId, skillIds]) =>
      skillIds
        .filter((skillId) => UTILITY_USE_SKILLS.has(skillId))
        .map((skillId) => incrementSeries(userId, `skill_use_${skillId}_`, UTILITY_SKILL_SERIES, 1)),
    ),
  );
}

export async function claimAchievementReward(userId: string, achievementId: string): Promise<number> {
  const catalog = ACHIEVEMENT_CATALOG_BY_ID.get(achievementId);
  if (!catalog) return 0;

  const rows = await readRows(userId, [achievementId]);
  const current = rows.get(achievementId);
  if (!current || !current.completed || current.claimed) return 0;

  await upsertRows(userId, [{
    achievementId,
    progress: current.progress,
    completed: current.completed,
    claimed: true,
    completedAt: current.completedAt,
    claimedAt: new Date().toISOString(),
  }]);
  await addTokens(userId, catalog.rewardTokens);
  return catalog.rewardTokens;
}

export async function claimAllAchievementRewards(userId: string): Promise<number> {
  const rows = await readRows(userId);
  const claimable = [...rows.values()].filter((row) => row.completed && !row.claimed);
  if (claimable.length === 0) return 0;

  const totalTokens = claimable.reduce((sum, row) => {
    const catalog = ACHIEVEMENT_CATALOG_BY_ID.get(row.achievementId);
    return sum + (catalog?.rewardTokens ?? 0);
  }, 0);

  await upsertRows(
    userId,
    claimable.map((row) => ({
      achievementId: row.achievementId,
      progress: row.progress,
      completed: true,
      claimed: true,
      completedAt: row.completedAt,
      claimedAt: new Date().toISOString(),
    })),
  );
  await addTokens(userId, totalTokens);
  return totalTokens;
}

export function getAchievementCatalog(): AchievementCatalogEntry[] {
  return ACHIEVEMENT_CATALOG;
}

export async function mergePlayerAchievements(
  sourceUserId: string | null | undefined,
  targetUserId: string | null | undefined,
): Promise<void> {
  if (!supabaseAdmin || !sourceUserId || !targetUserId || sourceUserId === targetUserId) {
    return;
  }

  const [sourceRows, targetRows] = await Promise.all([
    readRows(sourceUserId),
    readRows(targetUserId),
  ]);

  const mergedIds = new Set([...sourceRows.keys(), ...targetRows.keys()]);
  const mergedRows = [...mergedIds].map((achievementId) => {
    const source = sourceRows.get(achievementId);
    const target = targetRows.get(achievementId);
    return {
      achievementId,
      progress: Math.max(source?.progress ?? 0, target?.progress ?? 0),
      completed: Boolean(source?.completed || target?.completed),
      claimed: Boolean(source?.claimed || target?.claimed),
      completedAt: target?.completedAt ?? source?.completedAt ?? null,
      claimedAt: target?.claimedAt ?? source?.claimedAt ?? null,
    };
  });

  await upsertRows(targetUserId, mergedRows);

  const { error } = await supabaseAdmin
    .from('player_achievements')
    .delete()
    .eq('user_id', sourceUserId);

  if (error) {
    console.error('[achievements] failed to clear source achievements after merge', error);
  }
}
