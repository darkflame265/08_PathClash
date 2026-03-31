create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text,
  equipped_skin text not null default 'classic',
  is_guest boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
add column if not exists equipped_skin text not null default 'classic';

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
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    return 'AUTH_REQUIRED';
  end if;

  v_cost := case p_skin_id
    when 'plasma' then 120
    when 'gold_core' then 120
    when 'neon_pulse' then 120
    when 'inferno' then 120
    when 'quantum' then 120
    when 'cosmic' then 350
    when 'arc_reactor' then 350
    when 'electric_core' then 350
    when 'atomic' then 900
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

alter table public.profiles enable row level security;
alter table public.player_stats enable row level security;
alter table public.account_merges enable row level security;
alter table public.owned_skins enable row level security;
alter table public.player_achievements enable row level security;
alter table public.google_play_token_purchases enable row level security;

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
