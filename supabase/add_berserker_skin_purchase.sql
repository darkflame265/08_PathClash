-- Adds the Berserker skin to the token purchase RPC.
-- Run this in the Supabase SQL editor or deploy it with your normal DB update flow.

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
    when 'cosmic'        then 1
    when 'neon_pulse'    then 2
    when 'quantum'       then 2
    when 'inferno'       then 3
    when 'berserker'     then 3
    when 'electric_core' then 4
    when 'wizard'        then 5
    when 'sun'           then 6
    when 'gold_core'     then 6
    when 'atomic'        then 8
    when 'arc_reactor'   then 8
    when 'chronos'       then 10
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
