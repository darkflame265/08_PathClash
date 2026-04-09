"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listPlayerAchievements = listPlayerAchievements;
exports.syncAchievementDerivedProgress = syncAchievementDerivedProgress;
exports.markTutorialComplete = markTutorialComplete;
exports.trackSettingsAchievements = trackSettingsAchievements;
exports.recordMatchPlayed = recordMatchPlayed;
exports.recordModeWin = recordModeWin;
exports.recordDailyRewardGrant = recordDailyRewardGrant;
exports.recordAbilitySpecialWin = recordAbilitySpecialWin;
exports.recordAbilitySkillFinish = recordAbilitySkillFinish;
exports.recordAbilityBlockEvents = recordAbilityBlockEvents;
exports.recordAbilityUtilityUsage = recordAbilityUtilityUsage;
exports.claimAchievementReward = claimAchievementReward;
exports.claimAllAchievementRewards = claimAllAchievementRewards;
exports.getAchievementCatalog = getAchievementCatalog;
exports.mergePlayerAchievements = mergePlayerAchievements;
const supabase_1 = require("../lib/supabase");
const achievementCatalog_1 = require("../achievements/achievementCatalog");
const WIN_SERIES = [1, 3, 5, 10, 30, 50, 100, 500, 1000, 10000];
const TOTAL_WIN_SERIES = [10, 50, 100, 500, 1000, 10000];
const GAMES_PLAYED_SERIES = [10, 50, 100, 500, 1000];
const SKIN_SERIES = [3, 10, 20];
const DAILY_REWARD_SERIES = [10, 50];
const FULL_HP_SERIES = [1, 5, 30];
const ATTACK_SKILL_SERIES = [1, 5, 10, 30];
const DEFENSE_SKILL_SERIES = [1, 5, 10, 30];
const UTILITY_SKILL_SERIES = [5, 25, 50, 150];
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
function toState(row) {
    return {
        achievementId: row.achievement_id,
        progress: Number(row.progress ?? 0),
        completed: Boolean(row.completed),
        claimed: Boolean(row.claimed),
        completedAt: row.completed_at ?? null,
        claimedAt: row.claimed_at ?? null,
    };
}
async function readRows(userId, achievementIds) {
    if (!supabase_1.supabaseAdmin)
        return new Map();
    let query = supabase_1.supabaseAdmin
        .from('player_achievements')
        .select('achievement_id, progress, completed, claimed, completed_at, claimed_at')
        .eq('user_id', userId);
    if (achievementIds && achievementIds.length > 0) {
        query = query.in('achievement_id', achievementIds);
    }
    const { data, error } = await query.returns();
    if (error) {
        console.error('[achievements] failed to read rows', error);
        return new Map();
    }
    return new Map((data ?? []).map((row) => [row.achievement_id, toState(row)]));
}
async function upsertRows(userId, entries) {
    if (!supabase_1.supabaseAdmin || entries.length === 0)
        return;
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
    const { error } = await supabase_1.supabaseAdmin
        .from('player_achievements')
        .upsert(payload, { onConflict: 'user_id,achievement_id' });
    if (error) {
        console.error('[achievements] failed to upsert rows', error);
    }
}
async function applySeriesAbsolute(userId, prefix, milestones, progress) {
    const ids = milestones.map((goal) => `${prefix}${goal}`);
    const existing = await readRows(userId, ids);
    const nowIso = new Date().toISOString();
    const updates = milestones.map((goal) => {
        const achievementId = `${prefix}${goal}`;
        const current = existing.get(achievementId);
        const nextProgress = Math.max(current?.progress ?? 0, progress);
        const completed = nextProgress >= goal;
        return {
            achievementId,
            progress: nextProgress,
            completed,
            claimed: current?.claimed ?? false,
            completedAt: completed ? current?.completedAt ?? nowIso : current?.completedAt ?? null,
            claimedAt: current?.claimedAt ?? null,
        };
    });
    await upsertRows(userId, updates);
}
async function incrementSeries(userId, prefix, milestones, amount = 1) {
    const ids = milestones.map((goal) => `${prefix}${goal}`);
    const existing = await readRows(userId, ids);
    const currentProgress = ids.reduce((max, id) => Math.max(max, existing.get(id)?.progress ?? 0), 0);
    await applySeriesAbsolute(userId, prefix, milestones, currentProgress + amount);
}
async function setSingleProgressAbsolute(userId, achievementId, progress) {
    const existing = await readRows(userId, [achievementId]);
    const current = existing.get(achievementId);
    const catalog = achievementCatalog_1.ACHIEVEMENT_CATALOG_BY_ID.get(achievementId);
    if (!catalog)
        return;
    const nowIso = new Date().toISOString();
    const nextProgress = Math.max(current?.progress ?? 0, progress);
    const completed = nextProgress >= catalog.goal;
    await upsertRows(userId, [{
            achievementId,
            progress: nextProgress,
            completed,
            claimed: current?.claimed ?? false,
            completedAt: completed ? current?.completedAt ?? nowIso : current?.completedAt ?? null,
            claimedAt: current?.claimedAt ?? null,
        }]);
}
async function incrementSingle(userId, achievementId, amount = 1) {
    const existing = await readRows(userId, [achievementId]);
    const current = existing.get(achievementId);
    const catalog = achievementCatalog_1.ACHIEVEMENT_CATALOG_BY_ID.get(achievementId);
    if (!catalog)
        return;
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
async function addTokens(userId, tokenAmount) {
    if (!supabase_1.supabaseAdmin || tokenAmount <= 0)
        return;
    const { data, error } = await supabase_1.supabaseAdmin
        .from('player_stats')
        .select('tokens')
        .eq('user_id', userId)
        .maybeSingle();
    if (error) {
        console.error('[achievements] failed to read tokens', error);
        return;
    }
    const currentTokens = Number(data?.tokens ?? 0);
    const { error: upsertError } = await supabase_1.supabaseAdmin.from('player_stats').upsert({
        user_id: userId,
        tokens: currentTokens + tokenAmount,
        updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    if (upsertError) {
        console.error('[achievements] failed to grant tokens', upsertError);
    }
}
async function listPlayerAchievements(userId) {
    const rows = await readRows(userId);
    return [...rows.values()];
}
async function syncAchievementDerivedProgress(args) {
    await setSingleProgressAbsolute(args.userId, 'welcome_to_pathclash', 1);
    const ownedSkinCount = new Set(['classic', ...(args.ownedSkins ?? [])]).size;
    await applySeriesAbsolute(args.userId, 'skins_owned_', SKIN_SERIES, ownedSkinCount);
}
async function markTutorialComplete(userId) {
    if (!userId)
        return;
    await setSingleProgressAbsolute(userId, 'tutorial_complete', 1);
}
async function trackSettingsAchievements(args) {
    const isAudioOffZero = args.isMusicMuted &&
        args.isSfxMuted &&
        args.musicVolumePercent === 0 &&
        args.sfxVolumePercent === 0;
    const isAudioOnFull = !args.isMusicMuted &&
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
async function recordMatchPlayed(args) {
    const userIds = [...new Set(args.userIds.filter((value) => Boolean(value)))];
    await Promise.all(userIds.map(async (userId) => {
        await incrementSingle(userId, 'first_match_played', 1);
        await incrementSeries(userId, 'games_played_', GAMES_PLAYED_SERIES, 1);
    }));
}
async function recordModeWin(args) {
    const userId = args.userId;
    if (!userId)
        return;
    await incrementSingle(userId, 'first_win', 1);
    await incrementSeries(userId, 'wins_total_', TOTAL_WIN_SERIES, 1);
    const prefixByMode = {
        ai: 'ai_win_',
        duel: 'duel_win_',
        ability: 'ability_win_',
        twovtwo: 'twovtwo_win_',
        coop: 'coop_clear_',
    };
    await incrementSeries(userId, prefixByMode[args.mode], WIN_SERIES, 1);
}
async function recordDailyRewardGrant(userIds, rewardWins) {
    const normalizedUserIds = [...new Set(userIds.filter((value) => Boolean(value)))];
    if (rewardWins <= 0)
        return;
    await Promise.all(normalizedUserIds.map((userId) => incrementSeries(userId, 'daily_reward_', DAILY_REWARD_SERIES, rewardWins)));
}
async function recordAbilitySpecialWin(args) {
    if (!args.winnerUserId || args.disconnectWin)
        return;
    if (args.winnerHp !== 5)
        return;
    await incrementSeries(args.winnerUserId, 'ability_win_full_hp_', FULL_HP_SERIES, 1);
}
async function recordAbilitySkillFinish(args) {
    if (!args.winnerUserId || !args.finisherSkillId)
        return;
    if (!ATTACK_FINISH_SKILLS.has(args.finisherSkillId))
        return;
    await incrementSeries(args.winnerUserId, `skill_finish_${args.finisherSkillId}_`, ATTACK_SKILL_SERIES, 1);
}
async function recordAbilityBlockEvents(args) {
    const entries = Object.entries(args.byUserId);
    await Promise.all(entries.flatMap(([userId, skillIds]) => skillIds
        .filter((skillId) => DEFENSE_BLOCK_SKILLS.has(skillId))
        .map((skillId) => incrementSeries(userId, `skill_block_${skillId}_`, DEFENSE_SKILL_SERIES, 1))));
}
async function recordAbilityUtilityUsage(args) {
    const entries = Object.entries(args.byUserId);
    await Promise.all(entries.flatMap(([userId, skillIds]) => skillIds
        .filter((skillId) => UTILITY_USE_SKILLS.has(skillId))
        .map((skillId) => incrementSeries(userId, `skill_use_${skillId}_`, UTILITY_SKILL_SERIES, 1))));
}
async function claimAchievementReward(userId, achievementId) {
    const catalog = achievementCatalog_1.ACHIEVEMENT_CATALOG_BY_ID.get(achievementId);
    if (!catalog)
        return 0;
    const rows = await readRows(userId, [achievementId]);
    const current = rows.get(achievementId);
    if (!current || !current.completed || current.claimed)
        return 0;
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
async function claimAllAchievementRewards(userId) {
    const rows = await readRows(userId);
    const claimable = [...rows.values()].filter((row) => row.completed && !row.claimed);
    if (claimable.length === 0)
        return 0;
    const totalTokens = claimable.reduce((sum, row) => {
        const catalog = achievementCatalog_1.ACHIEVEMENT_CATALOG_BY_ID.get(row.achievementId);
        return sum + (catalog?.rewardTokens ?? 0);
    }, 0);
    await upsertRows(userId, claimable.map((row) => ({
        achievementId: row.achievementId,
        progress: row.progress,
        completed: true,
        claimed: true,
        completedAt: row.completedAt,
        claimedAt: new Date().toISOString(),
    })));
    await addTokens(userId, totalTokens);
    return totalTokens;
}
function getAchievementCatalog() {
    return achievementCatalog_1.ACHIEVEMENT_CATALOG;
}
async function mergePlayerAchievements(sourceUserId, targetUserId) {
    if (!supabase_1.supabaseAdmin || !sourceUserId || !targetUserId || sourceUserId === targetUserId) {
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
    const { error } = await supabase_1.supabaseAdmin
        .from('player_achievements')
        .delete()
        .eq('user_id', sourceUserId);
    if (error) {
        console.error('[achievements] failed to clear source achievements after merge', error);
    }
}
