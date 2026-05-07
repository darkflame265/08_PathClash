create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text,
  equipped_skin text not null default 'classic',
  equipped_board_skin text not null default 'classic',
  equipped_ability_skills text[] not null default array['classic_guard']::text[],
  is_guest boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
add column if not exists equipped_skin text not null default 'classic';

alter table public.profiles
add column if not exists equipped_board_skin text not null default 'classic';

alter table public.profiles
add column if not exists equipped_ability_skills text[] not null default array['classic_guard']::text[];

alter table public.profiles
add column if not exists legal_consent_version text;

alter table public.profiles
add column if not exists legal_consented_at timestamptz;

create table if not exists public.player_stats (
  user_id uuid primary key references auth.users(id) on delete cascade,
  wins integer not null default 0,
  losses integer not null default 0,
  tokens integer not null default 0,
  daily_reward_wins integer not null default 0,
  daily_reward_day date,
  updated_at timestamptz not null default now()
);

alter table public.player_stats
add column if not exists tokens integer not null default 0;

alter table public.player_stats
add column if not exists daily_reward_wins integer not null default 0;

alter table public.player_stats
add column if not exists daily_reward_day date;

alter table public.player_stats
add column if not exists current_rating integer not null default 0;

alter table public.player_stats
add column if not exists highest_arena_reached integer not null default 1;

alter table public.player_stats
add column if not exists ranked_unlocked boolean not null default false;

create table if not exists public.account_merges (
  source_user_id uuid primary key references auth.users(id) on delete cascade,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  merged_wins integer not null default 0,
  merged_losses integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.owned_skins (
  user_id uuid not null references auth.users(id) on delete cascade,
  skin_id text not null,
  purchased_at timestamptz not null default now(),
  primary key (user_id, skin_id)
);

create table if not exists public.owned_board_skins (
  user_id uuid not null references auth.users(id) on delete cascade,
  board_skin_id text not null,
  purchased_at timestamptz not null default now(),
  primary key (user_id, board_skin_id)
);

create table if not exists public.player_achievements (
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_id text not null,
  progress integer not null default 0,
  completed boolean not null default false,
  claimed boolean not null default false,
  completed_at timestamptz null,
  claimed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

create index if not exists idx_player_achievements_claimable
on public.player_achievements (user_id, completed, claimed);

update public.owned_skins
set skin_id = 'atomic'
where skin_id = 'crystal';

update public.profiles
set equipped_skin = 'atomic'
where equipped_skin = 'crystal';

create table if not exists public.google_play_token_purchases (
  purchase_token text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  pack_id text not null,
  product_id text not null,
  tokens integer not null,
  created_at timestamptz not null default now()
);

create table if not exists public.nickname_change_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  old_nickname text,
  new_nickname text not null,
  token_balance_before integer not null,
  token_balance_after integer not null,
  cost_tokens integer not null,
  changed_at timestamptz not null default now()
);

create index if not exists idx_nickname_change_history_user_id_changed_at
on public.nickname_change_history (user_id, changed_at desc);

create or replace function public.grant_tokens_from_google_purchase(
  p_purchase_token text,
  p_user_id uuid,
  p_pack_id text,
  p_product_id text,
  p_tokens integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.google_play_token_purchases (
    purchase_token,
    user_id,
    pack_id,
    product_id,
    tokens
  )
  values (
    p_purchase_token,
    p_user_id,
    p_pack_id,
    p_product_id,
    p_tokens
  )
  on conflict (purchase_token) do nothing;

  if not found then
    return false;
  end if;

  insert into public.player_stats (
    user_id,
    wins,
    losses,
    tokens,
    updated_at
  )
  values (
    p_user_id,
    0,
    0,
    p_tokens,
    now()
  )
  on conflict (user_id) do update
    set tokens = public.player_stats.tokens + excluded.tokens,
        updated_at = now();

  return true;
end;
$$;

create or replace function public.purchase_skin_with_tokens(
  p_skin_id text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_tokens integer;
  v_cost integer;
  v_required_arena integer;
  v_highest_arena integer;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    return 'AUTH_REQUIRED';
  end if;

  v_cost := case p_skin_id
    when 'plasma' then 480
    when 'gold_core' then 480
    when 'neon_pulse' then 480
    when 'inferno' then 480
    when 'quantum' then 480
    when 'cosmic' then 1400
    when 'arc_reactor' then 1400
    when 'electric_core' then 1400
    when 'berserker' then 1400
    when 'atomic' then 3600
    when 'chronos' then 3600
    when 'wizard' then 3600
    when 'sun' then 3600
    else null
  end;

  if v_cost is null then
    return 'INVALID_SKIN';
  end if;

  v_required_arena := case p_skin_id
    when 'plasma'        then 1
    when 'inferno'       then 1
    when 'quantum'       then 2
    when 'cosmic'        then 2
    when 'neon_pulse'    then 3
    when 'arc_reactor'   then 3
    when 'berserker'     then 3
    when 'electric_core' then 4
    when 'gold_core'     then 4
    when 'atomic'        then 5
    when 'chronos'       then 5
    when 'wizard'        then 6
    when 'sun'           then 6
    else 1
  end;

  select coalesce(highest_arena_reached, 1)
    into v_highest_arena
    from public.player_stats
   where user_id = v_user_id;

  if coalesce(v_highest_arena, 1) < v_required_arena then
    return 'ARENA_REQUIRED';
  end if;

  select tokens
    into v_tokens
    from public.player_stats
   where user_id = v_user_id
   for update;

  if not found then
    return 'INSUFFICIENT_TOKENS';
  end if;

  if exists (
    select 1
      from public.owned_skins
     where user_id = v_user_id
       and skin_id = p_skin_id
  ) then
    return 'ALREADY_OWNED';
  end if;

  if coalesce(v_tokens, 0) < v_cost then
    return 'INSUFFICIENT_TOKENS';
  end if;

  insert into public.owned_skins (user_id, skin_id)
  values (v_user_id, p_skin_id)
  on conflict (user_id, skin_id) do nothing;

  if not found then
    return 'ALREADY_OWNED';
  end if;

  update public.player_stats
     set tokens = tokens - v_cost,
         updated_at = now()
   where user_id = v_user_id;

  return 'PURCHASED';
end;
$$;

create or replace function public.purchase_board_skin_with_tokens(
  p_board_skin_id text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_tokens integer;
  v_cost integer;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    return 'AUTH_REQUIRED';
  end if;

  v_cost := case p_board_skin_id
    when 'blue_gray' then 2000
    when 'pharaoh' then 7000
    when 'magic' then 7000
    else null
  end;

  if v_cost is null then
    return 'INVALID_SKIN';
  end if;

  select tokens
    into v_tokens
    from public.player_stats
   where user_id = v_user_id
   for update;

  if not found then
    return 'INSUFFICIENT_TOKENS';
  end if;

  if exists (
    select 1
      from public.owned_board_skins
     where user_id = v_user_id
       and board_skin_id = p_board_skin_id
  ) then
    return 'ALREADY_OWNED';
  end if;

  if coalesce(v_tokens, 0) < v_cost then
    return 'INSUFFICIENT_TOKENS';
  end if;

  insert into public.owned_board_skins (user_id, board_skin_id)
  values (v_user_id, p_board_skin_id)
  on conflict (user_id, board_skin_id) do nothing;

  if not found then
    return 'ALREADY_OWNED';
  end if;

  update public.player_stats
     set tokens = tokens - v_cost,
         updated_at = now()
   where user_id = v_user_id;

  return 'PURCHASED';
end;
$$;

create or replace function public.change_nickname_with_tokens(
  p_nickname text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_tokens integer;
  v_trimmed text;
  v_cost integer := 500;
  v_current_nickname text;
  v_token_balance_after integer;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    return 'AUTH_REQUIRED';
  end if;

  v_trimmed := nullif(btrim(coalesce(p_nickname, '')), '');

  if v_trimmed is null or char_length(v_trimmed) > 16 then
    return 'INVALID_NICKNAME';
  end if;

  select nickname
    into v_current_nickname
    from public.profiles
   where id = v_user_id;

  if coalesce(v_current_nickname, '') = v_trimmed then
    return 'NO_CHANGE';
  end if;

  insert into public.player_stats (user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;

  select tokens
    into v_tokens
    from public.player_stats
   where user_id = v_user_id
   for update;

  if coalesce(v_tokens, 0) < v_cost then
    return 'INSUFFICIENT_TOKENS';
  end if;

  update public.player_stats
     set tokens = tokens - v_cost,
         updated_at = now()
   where user_id = v_user_id;

  v_token_balance_after := greatest(coalesce(v_tokens, 0) - v_cost, 0);

  insert into public.profiles (id, nickname)
  values (v_user_id, v_trimmed)
  on conflict (id) do update
    set nickname = excluded.nickname,
        updated_at = now();

  insert into public.nickname_change_history (
    user_id,
    old_nickname,
    new_nickname,
    token_balance_before,
    token_balance_after,
    cost_tokens
  )
  values (
    v_user_id,
    v_current_nickname,
    v_trimmed,
    coalesce(v_tokens, 0),
    v_token_balance_after,
    v_cost
  );

  return 'UPDATED';
end;
$$;

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

alter table public.profiles enable row level security;
alter table public.player_stats enable row level security;
alter table public.account_merges enable row level security;
alter table public.owned_skins enable row level security;
alter table public.owned_board_skins enable row level security;
alter table public.player_achievements enable row level security;
alter table public.google_play_token_purchases enable row level security;
alter table public.nickname_change_history enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "player_stats_select_own" on public.player_stats;
create policy "player_stats_select_own"
on public.player_stats
for select
using (auth.uid() = user_id);

drop policy if exists "account_merges_select_involved" on public.account_merges;
create policy "account_merges_select_involved"
on public.account_merges
for select
using (auth.uid() = source_user_id or auth.uid() = target_user_id);

drop policy if exists "owned_skins_select_own" on public.owned_skins;
create policy "owned_skins_select_own"
on public.owned_skins
for select
using (auth.uid() = user_id);

drop policy if exists "owned_board_skins_select_own" on public.owned_board_skins;
create policy "owned_board_skins_select_own"
on public.owned_board_skins
for select
using (auth.uid() = user_id);

drop policy if exists "player_achievements_select_own" on public.player_achievements;
create policy "player_achievements_select_own"
on public.player_achievements
for select
using (auth.uid() = user_id);

drop policy if exists "google_play_token_purchases_select_own" on public.google_play_token_purchases;
create policy "google_play_token_purchases_select_own"
on public.google_play_token_purchases
for select
using (auth.uid() = user_id);

drop policy if exists "nickname_change_history_select_own" on public.nickname_change_history;
create policy "nickname_change_history_select_own"
on public.nickname_change_history
for select
using (auth.uid() = user_id);

-- Skill rotation: daily UTC rotation slots
create table if not exists skill_rotations (
  date            text primary key,  -- 'YYYY-MM-DD' UTC
  common_skill    text not null,
  rare_skill      text not null,
  legendary_skill text not null
);


