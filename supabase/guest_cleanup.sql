-- Guest account cleanup plan for PathClash
--
-- Goal
--   Remove truly disposable guest accounts that never meaningfully progressed.
--
-- Safe deletion policy
--   1. profiles.is_guest = true
--   2. wins = 0
--   3. losses = 0
--   4. tokens = 0
--   5. no owned_skins rows
--   6. no google_play_token_purchases rows
--   7. no account_merges history as source or target
--   8. latest activity is older than the chosen threshold
--      Activity uses the latest of:
--      - profiles.updated_at
--      - player_stats.updated_at
--      - auth.users.last_sign_in_at
--
-- Notes
--   - Deleting from auth.users will cascade to public tables because the schema
--     uses foreign keys with ON DELETE CASCADE.
--   - This is intentionally conservative.
--   - Recommended first threshold: 60 days.

create or replace function public.list_stale_guest_cleanup_candidates(
  p_older_than interval default interval '60 days'
)
returns table (
  user_id uuid,
  profile_created_at timestamptz,
  profile_updated_at timestamptz,
  stats_updated_at timestamptz,
  last_sign_in_at timestamptz
)
language sql
security definer
set search_path = public, auth
as $$
  select
    p.id as user_id,
    p.created_at as profile_created_at,
    p.updated_at as profile_updated_at,
    ps.updated_at as stats_updated_at,
    u.last_sign_in_at
  from public.profiles p
  join auth.users u
    on u.id = p.id
  left join public.player_stats ps
    on ps.user_id = p.id
  where p.is_guest = true
    and coalesce(ps.wins, 0) = 0
    and coalesce(ps.losses, 0) = 0
    and coalesce(ps.tokens, 0) = 0
    and not exists (
      select 1
      from public.owned_skins os
      where os.user_id = p.id
    )
    and not exists (
      select 1
      from public.google_play_token_purchases gp
      where gp.user_id = p.id
    )
    and not exists (
      select 1
      from public.account_merges am
      where am.source_user_id = p.id
         or am.target_user_id = p.id
    )
    and greatest(
      coalesce(p.updated_at, p.created_at),
      coalesce(ps.updated_at, p.created_at),
      coalesce(u.last_sign_in_at, p.created_at)
    ) < now() - p_older_than
  order by greatest(
    coalesce(p.updated_at, p.created_at),
    coalesce(ps.updated_at, p.created_at),
    coalesce(u.last_sign_in_at, p.created_at)
  ) asc;
$$;

create or replace function public.cleanup_stale_guest_accounts(
  p_older_than interval default interval '60 days'
)
returns table (
  deleted_user_id uuid
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_row record;
begin
  for v_row in
    select candidate.user_id
    from public.list_stale_guest_cleanup_candidates(p_older_than) candidate
  loop
    delete from auth.users
    where id = v_row.user_id;

    if found then
      deleted_user_id := v_row.user_id;
      return next;
    end if;
  end loop;
end;
$$;

-- Optional cron example for projects with pg_cron enabled:
--
-- select cron.schedule(
--   'pathclash-guest-cleanup-weekly',
--   '15 5 * * 1',
--   $$select public.cleanup_stale_guest_accounts(interval '60 days');$$
-- );
--
-- Recommended usage:
--   1) Preview candidates
--      select * from public.list_stale_guest_cleanup_candidates(interval '60 days');
--
--   2) Run cleanup
--      select * from public.cleanup_stale_guest_accounts(interval '60 days');
