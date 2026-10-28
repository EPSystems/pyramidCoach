-- Plan generation gaps (§3): lifting time of day, edits that survive regeneration, atomic plan/proposal writes.
-- See docs/DECISIONS.md, "Plan generation gaps (§3)".

-- ---------------------------------------------------------------------------
-- Lifting time of day (T-SCH-03). NULL = unknown: a morning sport is then assumed to come before lifting.
-- ---------------------------------------------------------------------------
alter table public.user_settings
  add column lifting_time text check (lifting_time in ('morning','midday','evening'));

-- ---------------------------------------------------------------------------
-- Carry-over keys. planned_on = the engine's date (scheduled_on differs after a move);
-- plan_key = week Monday | template | occurrence, stable across regenerations;
-- original_exercise_id = the engine's choice (exercise_id differs after a session-only swap).
-- ---------------------------------------------------------------------------
alter table public.planned_sessions
  add column planned_on date,
  add column plan_key text;
alter table public.planned_exercises
  add column original_exercise_id uuid references public.exercises(id) on delete set null;

-- Backfill. Earlier moves can't be told apart from engine dates any more, so existing rows start "unmoved".
update public.planned_sessions set planned_on = scheduled_on where planned_on is null;
update public.planned_sessions ps
   set plan_key = k.key
  from (
    select id,
           to_char(date_trunc('week', scheduled_on)::date, 'YYYY-MM-DD') || '|' || template_key || '|' ||
           (row_number() over (partition by user_id, date_trunc('week', scheduled_on), template_key order by scheduled_on, order_in_week) - 1) as key
      from public.planned_sessions
     where kind <> 'generated'
  ) k
 where ps.id = k.id and ps.plan_key is null;
update public.planned_exercises set original_exercise_id = exercise_id where original_exercise_id is null;
create index on public.planned_sessions (user_id, planned_on);

-- The functions that write these columns (replace_future_plan, apply_plan_writes) are in
-- 20261027170001_plan_writes.sql, which runs after 20261027130001_logger_gaps (it also redefines replace_future_plan).
