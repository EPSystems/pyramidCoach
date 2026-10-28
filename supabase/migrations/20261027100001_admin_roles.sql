-- Roles: one owner (app_config.owner_email, unchanged) can appoint admins. Admins open /admin, see the user list and
-- edit global exercise text; only the owner changes roles or removes users. The owner role itself can't be changed.

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('owner','admin','member'));

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role in ('owner','admin'));
$$;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Same columns as before (names and activity only); now readable by admins too. create or replace keeps the grants.
create or replace function public.admin_list_users() returns table (user_id uuid, email text, display_name text, role text, joined timestamptz, last_active timestamptz, onboarded boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;
  return query select p.user_id, p.email, p.display_name, p.role, p.created_at, p.last_active_at, p.onboarded_at is not null
    from public.profiles p order by p.created_at;
end $$;

-- Admins may edit global exercises (cues/mistakes on /admin). Added next to the owner policy; permissive policies OR together.
create policy "admin updates globals" on public.exercises for update to authenticated
  using (public.is_admin() and owner_user_id is null) with check (public.is_admin() and owner_user_id is null);

-- Owner-only role change. Users can't change their own role through RLS ("own profile" pins role = my_role()),
-- so this security definer function is the only way to grant or take away admin.
create function public.admin_set_role(p_user_id uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
declare v_role text;
begin
  if not public.is_owner() then
    raise exception 'owner only';
  end if;
  if p_role is null or p_role not in ('admin','member') then
    raise exception 'role must be admin or member';
  end if;
  select role into v_role from public.profiles where user_id = p_user_id;
  if not found then
    raise exception 'user not found';
  end if;
  if v_role = 'owner' then
    raise exception 'cannot change the owner role';
  end if;
  update public.profiles set role = p_role where user_id = p_user_id;
end $$;
revoke execute on function public.admin_set_role(uuid, text) from public, anon;
grant execute on function public.admin_set_role(uuid, text) to authenticated;

-- Removing a user stays owner-only; also refuse any row that holds the owner role, not just the configured email.
create or replace function public.admin_remove_user(p_email text) returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_owner() then
    raise exception 'owner only';
  end if;
  if lower(p_email) = lower(coalesce((select value from public.app_config where key = 'owner_email'), ''))
     or exists (select 1 from public.profiles p where lower(p.email) = lower(p_email) and p.role = 'owner') then
    raise exception 'cannot remove the owner';
  end if;
  delete from auth.users where lower(email) = lower(p_email);
end $$;
