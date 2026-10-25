-- Open sign-up (docs/AUTH_PLAN.md §4.1): drop the invite-only gate, create the profile only once the email is confirmed.

drop trigger if exists enforce_invite on auth.users;
drop function if exists public.enforce_invite();
drop function if exists public.is_invited(text);

-- Profile only once the email is confirmed (Google users arrive confirmed; email sign-ups get one when they click the link).
drop trigger if exists on_auth_user_created on auth.users;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare owner_email text;
begin
  select value into owner_email from public.app_config where key = 'owner_email';
  insert into public.profiles (user_id, email, role, display_name)
  values (new.id, new.email,
          case when lower(new.email) = lower(coalesce(owner_email, '')) then 'owner' else 'member' end,
          coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), split_part(new.email, '@', 1)))
  on conflict (user_id) do nothing;
  return new;
end $$;

create trigger on_auth_user_confirmed
  after insert or update of email_confirmed_at on auth.users
  for each row when (new.email_confirmed_at is not null)
  execute function public.handle_new_user();

-- Trigger function: nobody needs EXECUTE via the API (see harden_functions).
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Owner removes a user (cascade removes their data). Replaces admin_revoke_user, which also revoked the invite.
drop function if exists public.admin_revoke_user(text);

create function public.admin_remove_user(p_email text) returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_owner() then
    raise exception 'owner only';
  end if;
  if lower(p_email) = lower(coalesce((select value from public.app_config where key = 'owner_email'), '')) then
    raise exception 'cannot remove the owner';
  end if;
  delete from auth.users where lower(email) = lower(p_email);
end $$;
revoke execute on function public.admin_remove_user(text) from public, anon;
grant execute on function public.admin_remove_user(text) to authenticated;

drop table if exists public.invites;
