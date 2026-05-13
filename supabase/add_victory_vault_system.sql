-- Victory Vault system
-- Run this once in the Supabase SQL Editor.
-- Adds daily vault progress/open state and exposes it through get_account_snapshot().

alter table public.player_stats
add column if not exists vault_wins integer not null default 0;

alter table public.player_stats
add column if not exists vault_day date;

alter table public.player_stats
add column if not exists vault_opened_day date;

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
  vault_wins_today integer := 0;
  vault_opened_today boolean := false;
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

  vault_opened_today := exists (
    select 1
    from public.player_stats ps
    where ps.user_id = target_user_id
      and ps.vault_opened_day::text = current_day
  );

  vault_wins_today := case
    when vault_opened_today then 0
    else coalesce((
      select least(3, greatest(0, ps.vault_wins))
      from public.player_stats ps
      where ps.user_id = target_user_id
        and ps.vault_day::text = current_day
    ), 0)
  end;

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
        '[]'::jsonb
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
    'vaultWins',
      vault_wins_today,
    'vaultRequiredWins',
      3,
    'vaultOpenedToday',
      vault_opened_today,
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
