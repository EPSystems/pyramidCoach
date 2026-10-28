-- Account hygiene (AUTH_PLAN §6 open question 3): unconfirmed email sign-ups are deleted after 7 days, plus a report of
-- every foreign key to auth.users so tests can prove deleting a user leaves nothing behind.

-- Unconfirmed sign-ups have no profile or app data (handle_new_user only runs on confirmation), so this only clears
-- auth rows. Users with a confirmed phone are kept to be safe, though the app doesn't use phone sign-in.
create or replace function public.purge_unconfirmed_users(p_older_than interval default interval '7 days') returns integer
language plpgsql security definer set search_path = public, auth as $$
declare n integer;
begin
  if p_older_than is null or p_older_than < interval '1 day' then
    raise exception 'p_older_than must be at least 1 day';
  end if;
  delete from auth.users u
   where u.email_confirmed_at is null
     and u.phone_confirmed_at is null
     and u.created_at < now() - p_older_than;
  get diagnostics n = row_count;
  return n;
end $$;
-- Never callable from the browser: only the scheduler (runs as postgres) and the service role.
revoke execute on function public.purge_unconfirmed_users(interval) from public, anon, authenticated;
grant execute on function public.purge_unconfirmed_users(interval) to service_role;

-- Nightly at 03:17 UTC when pg_cron exists. Locally the Supabase image ships it; on Supabase Cloud this enables the
-- extension too (Dashboard → Database → Extensions shows it). Never fail the migration over it: without pg_cron the
-- function can still be run by hand or from another scheduler.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    -- Same job name upserts, so re-running this migration doesn't duplicate the job.
    execute $cmd$select cron.schedule('purge-unconfirmed-users', '17 3 * * *', 'select public.purge_unconfirmed_users()')$cmd$;
  else
    raise notice 'pg_cron not available; purge_unconfirmed_users() is not scheduled';
  end if;
exception when others then
  raise notice 'pg_cron schedule skipped: %', sqlerrm;
end $$;

-- Every foreign key to auth.users from the public schema with its on-delete action (c = cascade, n = set null,
-- a = no action, r = restrict, d = set default). Service role only; used by tests/integration/cascade.test.ts.
create or replace function public.auth_user_fk_report() returns table (table_name text, column_name text, on_delete text)
language sql stable security definer set search_path = public, pg_catalog as $$
  select c.conrelid::regclass::text, a.attname::text, c.confdeltype::text
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
   where c.contype = 'f' and c.confrelid = 'auth.users'::regclass and c.connamespace = 'public'::regnamespace
   order by 1, 2;
$$;
revoke execute on function public.auth_user_fk_report() from public, anon, authenticated;
grant execute on function public.auth_user_fk_report() to service_role;
