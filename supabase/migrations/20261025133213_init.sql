-- Pyramid Coach — initial schema (Section 5 of the plan).
-- Every user-owned table: user_id → auth.users, RLS "own rows".

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- App config (owner email etc.). No RLS policies → only service role / security definer functions can read.
create table public.app_config (
  key text primary key,
  value text not null
);
alter table public.app_config enable row level security;

-- ---------------------------------------------------------------------------
-- 5.1 Reference tables
-- ---------------------------------------------------------------------------
create table public.muscles (
  id text primary key,
  name text not null,
  region text not null check (region in ('upper','lower','core')),
  tracked boolean not null default true,
  body_map_side text[] not null
);

create table public.movement_patterns (
  id text primary key,
  name text not null
);

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  pattern_id text references public.movement_patterns(id),
  category text not null check (category in (
    'lower_free_compound','lower_machine_compound','upper_free_press','upper_machine_press','pulling_compound','isolation')),
  equipment text[] not null,
  is_main_lift boolean default false,
  main_lift_key text check (main_lift_key in ('squat','bench','deadlift','ohp')),
  long_length_bias boolean default false,
  unilateral boolean default false,
  axial_load boolean default false,
  impact_lower_body boolean default false,
  default_increment_kg numeric(4,2),
  cues text[] not null default '{}',
  mistakes text[] not null default '{}',
  substitutions text[] not null default '{}',
  slot_tags text[] not null default '{}',
  popularity integer not null default 1000,
  owner_user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);

create table public.exercise_muscles (
  exercise_id uuid references public.exercises(id) on delete cascade,
  muscle_id text references public.muscles(id),
  role text not null check (role in ('primary','secondary')),
  primary key (exercise_id, muscle_id)
);

create table public.sports (
  id text primary key,
  name text not null,
  lower_body_load smallint not null check (lower_body_load between 0 and 3),
  upper_body_load smallint not null check (upper_body_load between 0 and 3),
  eccentric_impact smallint not null check (eccentric_impact between 0 and 3),
  conditioning smallint not null check (conditioning between 0 and 3),
  muscles_stressed text[] not null,
  default_minutes smallint not null,
  notes text,
  owner_user_id uuid references auth.users(id) on delete cascade
);

create table public.rule_sources (
  id text primary key,
  source text not null check (source in ('MSP-T','MSP-N','GEN','APP')),
  page text,
  summary text not null check (char_length(summary) <= 280)
);

-- ---------------------------------------------------------------------------
-- 5.2 User tables
-- ---------------------------------------------------------------------------
create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  role text not null default 'member' check (role in ('owner','member')),
  sex text check (sex in ('male','female','unspecified')),
  birth_year smallint,
  height_cm numeric(5,1),
  bodyweight_kg numeric(5,2),
  body_fat_pct numeric(4,1),
  units text not null default 'kg' check (units in ('kg','lb')),
  timezone text not null default 'Europe/Sofia',
  hide_bodyweight boolean not null default false,
  onboarded_at timestamptz,
  last_active_at timestamptz,
  created_at timestamptz default now()
);

create table public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  goal text not null check (goal in ('lean_gain','recomp','strength','fat_loss','sport_support')),
  priority text not null default 'balanced' check (priority in ('lifting','balanced','sport')),
  training_status text not null check (training_status in ('novice','intermediate','advanced')),
  status_source text not null default 'self' check (status_source in ('self','inferred')),
  available_days smallint[] not null,
  session_minutes smallint not null default 60 check (session_minutes in (30,45,60,75,90,120)),
  max_lift_days smallint,
  lifestyle text not null default 'lightly_active' check (lifestyle in ('sedentary','lightly_active','active','very_active')),
  equipment text[] not null default '{barbell,dumbbell,machine,cable,bodyweight}',
  increments jsonb not null default '{"barbell":2.5,"dumbbell":2,"machine":5,"cable":2.5}',
  rep_variation text not null default 'within_session' check (rep_variation in ('within_session','between_session','alternating_week')),
  split_style text not null default 'default' check (split_style in ('default','alternative')),
  specialization_muscles text[] not null default '{}',
  strength_lifts text[] not null default '{squat,bench,deadlift}',
  disliked_exercise_ids uuid[] not null default '{}',
  e1rm_seeds jsonb not null default '{}',
  target_adjustments jsonb not null default '{}',
  test_date date,
  trained_last_month boolean not null default true,
  status_history text[] not null default '{}',
  updated_at timestamptz default now()
);
create trigger user_settings_updated before update on public.user_settings for each row execute function public.set_updated_at();

create table public.user_sports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  sport_id text not null references public.sports(id) on delete cascade,
  active boolean not null default true,
  weekdays smallint[] not null,
  intensity text not null check (intensity in ('light','moderate','hard','match')),
  minutes smallint not null,
  time_of_day text check (time_of_day in ('morning','midday','evening')),
  created_at timestamptz default now()
);

create table public.injuries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  muscle_id text references public.muscles(id),
  label text not null,
  severity text not null check (severity in ('niggle','pain','injury')),
  status text not null default 'active' check (status in ('active','rehab','resolved')),
  avoid_exercise_ids uuid[] not null default '{}',
  rehab_note text,
  started_on date not null,
  resolved_on date
);

create table public.blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('hypertrophy','strength_volume','strength_load','strength_peak','sport_support')),
  starts_on date not null,
  weeks smallint not null,
  intro_week boolean not null default false,
  split_key text not null,
  engine_version text not null,
  inputs_snapshot jsonb not null,
  schedule jsonb not null default '{}',
  selections jsonb not null default '{}',
  explanations jsonb not null default '[]',
  warnings jsonb not null default '[]',
  median_target numeric(4,1),
  status text not null default 'active' check (status in ('active','completed','superseded')),
  created_at timestamptz default now()
);
create index on public.blocks (user_id, status);

create table public.weekly_targets (
  block_id uuid references public.blocks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  week_index smallint not null,
  muscle_id text references public.muscles(id),
  target_sets numeric(4,1) not null,
  sport_trim numeric(4,1) not null default 0,
  primary key (block_id, week_index, muscle_id)
);

create table public.planned_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  block_id uuid references public.blocks(id) on delete cascade,
  week_index smallint not null,
  scheduled_on date not null,
  template_key text not null,
  title text not null,
  kind text not null default 'lift' check (kind in ('lift','deload','intro','generated')),
  status text not null default 'planned' check (status in ('planned','in_progress','done','skipped','moved')),
  est_minutes smallint,
  order_in_week smallint not null,
  started_at timestamptz,
  finished_at timestamptz
);
create index on public.planned_sessions (user_id, scheduled_on);

create table public.planned_exercises (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.planned_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id),
  slot_key text,
  position smallint not null,
  sets smallint not null,
  rep_min smallint not null,
  rep_max smallint not null,
  rir_min numeric(3,1) not null,
  rir_max numeric(3,1) not null,
  rest_seconds smallint not null,
  suggested_load_kg numeric(6,2),
  is_main_lift_single boolean default false,
  skipped boolean not null default false,
  note text,
  rule_ids text[] not null default '{}'
);
create index on public.planned_exercises (session_id);

create table public.logged_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid references public.planned_sessions(id) on delete set null,
  planned_exercise_id uuid references public.planned_exercises(id) on delete set null,
  exercise_id uuid not null references public.exercises(id),
  performed_on date not null,
  set_index smallint not null,
  load_kg numeric(6,2),
  reps smallint not null,
  rir numeric(3,1),
  is_warmup boolean not null default false,
  created_at timestamptz default now()
);
create index on public.logged_sets (user_id, exercise_id, performed_on desc);
alter table public.logged_sets add constraint logged_sets_idempotent unique (planned_exercise_id, set_index); -- NULLs are distinct, so ad-hoc sets never conflict

create table public.sport_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  sport_id text not null references public.sports(id) on delete cascade,
  performed_on date not null,
  minutes smallint not null,
  session_rpe smallint check (session_rpe between 1 and 10),
  note text
);

create table public.checkins (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  sleep_hours numeric(3,1),
  energy smallint check (energy between 1 and 5),
  stress smallint check (stress between 1 and 5),
  soreness jsonb not null default '{}',
  bodyweight_kg numeric(5,2),
  note text,
  primary key (user_id, day)
);

create table public.weekly_reviews (
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  dreading_gym boolean,
  sleep_worse boolean,
  performance_down boolean,
  stress_worse boolean,
  aches_worse boolean,
  autofilled jsonb not null default '{}',
  yes_count smallint generated always as (
    (coalesce(dreading_gym::int,0)+coalesce(sleep_worse::int,0)+coalesce(performance_down::int,0)
     +coalesce(stress_worse::int,0)+coalesce(aches_worse::int,0))) stored,
  completed_at timestamptz,
  primary key (user_id, week_start)
);

create table public.nutrition_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  phase text not null check (phase in ('gain','maintain','loss')),
  activity_multiplier numeric(3,2) not null,
  maintenance_kcal integer not null,
  target_rate_pct numeric(4,2) not null,
  phase_started_on date not null,
  last_adjusted_on date,
  initial_adjust_done boolean not null default false,
  kcal_offset integer not null default 0,
  phase_history jsonb not null default '[]'
);

create table public.nutrition_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  effective_from date not null,
  kcal integer not null,
  kcal_low integer not null,
  kcal_high integer not null,
  protein_g integer not null,
  fat_min_g integer not null,
  fat_g integer not null,
  carbs_min_g integer not null,
  carbs_g integer not null,
  sport_kcal_per_day integer not null default 0,
  maintenance_kcal integer,
  reason text not null,
  created_at timestamptz default now()
);
create index on public.nutrition_targets (user_id, effective_from desc, created_at desc);

create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in (
    'standard_deload','targeted_deload','intro_week','volume_change','exercise_swap',
    'block_transition','plan_regenerate','calorie_adjust','multiplier_adjust',
    'status_change','plateau_action','injury_adjust')),
  title text not null,
  rationale text not null,
  rule_ids text[] not null,
  payload jsonb not null,
  preview jsonb,
  status text not null default 'pending' check (status in ('pending','accepted','rejected','expired')),
  applies_from date,
  expires_on date,
  created_at timestamptz default now(),
  decided_at timestamptz
);
create index on public.proposals (user_id, status);

create table public.invites (
  email text primary key,
  invited_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- 5.3 RLS
-- ---------------------------------------------------------------------------
create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'owner');
$$;

do $$
declare t text;
begin
  foreach t in array array['user_settings','user_sports','injuries','blocks','weekly_targets','planned_sessions',
    'planned_exercises','logged_sets','sport_logs','checkins','weekly_reviews','nutrition_settings','nutrition_targets','proposals']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "own rows" on public.%I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where user_id = auth.uid();
$$;

alter table public.profiles enable row level security;
-- Users manage their own profile but cannot change their role.
create policy "own profile" on public.profiles for all using (user_id = auth.uid()) with check (user_id = auth.uid() and role = public.my_role());

-- Reference tables
alter table public.muscles enable row level security;
alter table public.movement_patterns enable row level security;
alter table public.rule_sources enable row level security;
create policy "read" on public.muscles for select to authenticated using (true);
create policy "read" on public.movement_patterns for select to authenticated using (true);
create policy "read" on public.rule_sources for select to authenticated using (true);
create policy "owner writes" on public.rule_sources for all to authenticated using (public.is_owner()) with check (public.is_owner());

alter table public.exercises enable row level security;
create policy "read" on public.exercises for select to authenticated using (owner_user_id is null or owner_user_id = auth.uid());
create policy "write own" on public.exercises for insert to authenticated with check (owner_user_id = auth.uid());
create policy "update own" on public.exercises for update to authenticated using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
create policy "delete own" on public.exercises for delete to authenticated using (owner_user_id = auth.uid());
create policy "owner writes globals" on public.exercises for all to authenticated using (public.is_owner() and owner_user_id is null) with check (public.is_owner() and owner_user_id is null);

alter table public.exercise_muscles enable row level security;
create policy "read" on public.exercise_muscles for select to authenticated using (
  exists (select 1 from public.exercises e where e.id = exercise_id and (e.owner_user_id is null or e.owner_user_id = auth.uid())));
create policy "write own" on public.exercise_muscles for all to authenticated using (
  exists (select 1 from public.exercises e where e.id = exercise_id and (e.owner_user_id = auth.uid() or (e.owner_user_id is null and public.is_owner()))))
  with check (exists (select 1 from public.exercises e where e.id = exercise_id and (e.owner_user_id = auth.uid() or (e.owner_user_id is null and public.is_owner()))));

alter table public.sports enable row level security;
create policy "read" on public.sports for select to authenticated using (owner_user_id is null or owner_user_id = auth.uid());
create policy "write own" on public.sports for insert to authenticated with check (owner_user_id = auth.uid());
create policy "update own" on public.sports for update to authenticated using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
create policy "delete own" on public.sports for delete to authenticated using (owner_user_id = auth.uid());
create policy "owner writes globals" on public.sports for all to authenticated using (public.is_owner() and owner_user_id is null) with check (public.is_owner() and owner_user_id is null);

alter table public.invites enable row level security;
create policy "owner only" on public.invites for all to authenticated using (public.is_owner()) with check (public.is_owner());

-- ---------------------------------------------------------------------------
-- Invite-only signup (Section 2): block unknown emails, create profile on first login.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_invite() returns trigger
language plpgsql security definer set search_path = public as $$
declare owner_email text;
begin
  select value into owner_email from public.app_config where key = 'owner_email';
  if lower(new.email) = lower(coalesce(owner_email, '')) then
    return new;
  end if;
  if not exists (select 1 from public.invites i where lower(i.email) = lower(new.email) and i.revoked_at is null) then
    raise exception 'Signup is invite-only' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger enforce_invite before insert on auth.users for each row execute function public.enforce_invite();

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare owner_email text;
begin
  select value into owner_email from public.app_config where key = 'owner_email';
  insert into public.profiles (user_id, email, role, display_name)
  values (new.id, new.email,
          case when lower(new.email) = lower(coalesce(owner_email, '')) then 'owner' else 'member' end,
          split_part(new.email, '@', 1))
  on conflict (user_id) do nothing;
  update public.invites set accepted_at = now() where lower(email) = lower(new.email) and accepted_at is null;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Server-side check used by the login form for a friendly error.
create or replace function public.is_invited(p_email text) returns boolean
language sql stable security definer set search_path = public as $$
  select lower(p_email) = lower(coalesce((select value from public.app_config where key = 'owner_email'), ''))
      or exists (select 1 from public.invites i where lower(i.email) = lower(p_email) and i.revoked_at is null);
$$;
grant execute on function public.is_invited(text) to anon, authenticated;

-- Owner admin list: names and activity only, never training/health data (Section 2).
create or replace function public.admin_list_users() returns table (user_id uuid, email text, display_name text, role text, joined timestamptz, last_active timestamptz, onboarded boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_owner() then
    raise exception 'owner only';
  end if;
  return query select p.user_id, p.email, p.display_name, p.role, p.created_at, p.last_active_at, p.onboarded_at is not null
    from public.profiles p order by p.created_at;
end $$;
grant execute on function public.admin_list_users() to authenticated;

-- Owner revokes access: removes invite and deletes the user (cascade removes their data).
create or replace function public.admin_revoke_user(p_email text) returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_owner() then
    raise exception 'owner only';
  end if;
  if lower(p_email) = lower(coalesce((select value from public.app_config where key = 'owner_email'), '')) then
    raise exception 'cannot revoke the owner';
  end if;
  update public.invites set revoked_at = now() where lower(email) = lower(p_email);
  delete from auth.users where lower(email) = lower(p_email);
end $$;
grant execute on function public.admin_revoke_user(text) to authenticated;

-- Account deletion by the user themself (Section 10).
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  delete from auth.users where id = auth.uid();
end $$;
grant execute on function public.delete_my_account() to authenticated;

-- ---------------------------------------------------------------------------
-- Plan materialisation (Section 4.2 / 6.14): one transaction, RLS applies (security invoker).
-- ---------------------------------------------------------------------------
create or replace function public.replace_future_plan(p_block jsonb, p_targets jsonb, p_sessions jsonb, p_from date)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_block uuid;
  v_session uuid;
  s jsonb;
  e jsonb;
begin
  update public.blocks set status = 'superseded' where user_id = auth.uid() and status = 'active';
  delete from public.planned_sessions
   where user_id = auth.uid() and scheduled_on >= p_from and status in ('planned','moved','skipped') and kind <> 'generated';

  insert into public.blocks (user_id, kind, starts_on, weeks, intro_week, split_key, engine_version, inputs_snapshot, schedule, selections, explanations, warnings, median_target)
  values (auth.uid(), p_block->>'kind', (p_block->>'starts_on')::date, (p_block->>'weeks')::smallint, (p_block->>'intro_week')::boolean,
          p_block->>'split_key', p_block->>'engine_version', p_block->'inputs_snapshot', p_block->'schedule', p_block->'selections',
          p_block->'explanations', p_block->'warnings', (p_block->>'median_target')::numeric)
  returning id into v_block;

  insert into public.weekly_targets (block_id, user_id, week_index, muscle_id, target_sets, sport_trim)
  select v_block, auth.uid(), (t->>'week_index')::smallint, t->>'muscle_id', (t->>'target_sets')::numeric, (t->>'sport_trim')::numeric
    from jsonb_array_elements(p_targets) t;

  for s in select * from jsonb_array_elements(p_sessions) loop
    insert into public.planned_sessions (user_id, block_id, week_index, scheduled_on, template_key, title, kind, est_minutes, order_in_week)
    values (auth.uid(), v_block, (s->>'week_index')::smallint, (s->>'scheduled_on')::date, s->>'template_key', s->>'title',
            s->>'kind', (s->>'est_minutes')::smallint, (s->>'order_in_week')::smallint)
    returning id into v_session;
    for e in select * from jsonb_array_elements(s->'exercises') loop
      insert into public.planned_exercises (session_id, user_id, exercise_id, slot_key, position, sets, rep_min, rep_max, rir_min, rir_max,
        rest_seconds, suggested_load_kg, is_main_lift_single, note, rule_ids)
      values (v_session, auth.uid(), (e->>'exercise_id')::uuid, e->>'slot_key', (e->>'position')::smallint, (e->>'sets')::smallint,
        (e->>'rep_min')::smallint, (e->>'rep_max')::smallint, (e->>'rir_min')::numeric, (e->>'rir_max')::numeric,
        (e->>'rest_seconds')::smallint, nullif(e->>'suggested_load_kg','')::numeric, coalesce((e->>'is_main_lift_single')::boolean, false),
        e->>'note', coalesce(array(select jsonb_array_elements_text(e->'rule_ids')), '{}'));
    end loop;
  end loop;
  return v_block;
end $$;
grant execute on function public.replace_future_plan(jsonb, jsonb, jsonb, date) to authenticated;

-- 5.4 Derived view: fractional sets per muscle per week (T-VOL-05/06).
create or replace view public.v_weekly_muscle_sets with (security_invoker = true) as
select ls.user_id,
       (date_trunc('week', ls.performed_on))::date as week_start,
       em.muscle_id,
       sum(case when em.role = 'primary' then 1.0 else 0.5 end) as sets
  from public.logged_sets ls
  join public.exercise_muscles em on em.exercise_id = ls.exercise_id
 where not ls.is_warmup and ls.reps >= 4 and (ls.rir is null or ls.rir <= 4)
 group by 1, 2, 3;
