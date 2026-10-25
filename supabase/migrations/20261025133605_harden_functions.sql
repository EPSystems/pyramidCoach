-- Security advisor hardening: only is_invited() is meant to be callable before sign-in.
-- Postgres grants EXECUTE to PUBLIC by default and Supabase grants anon/authenticated explicitly, so revoke both.

alter function public.set_updated_at() set search_path = public;

-- Signed-in only. is_owner()/my_role() back RLS policies; the admin_* functions also check is_owner() themselves.
revoke execute on function public.is_owner() from public, anon;
revoke execute on function public.my_role() from public, anon;
revoke execute on function public.admin_list_users() from public, anon;
revoke execute on function public.admin_revoke_user(text) from public, anon;
revoke execute on function public.delete_my_account() from public, anon;

-- Trigger functions: EXECUTE is checked when the trigger is created, not when it fires, so nobody needs it via the API.
revoke execute on function public.enforce_invite() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
