-- Session logger gaps (PROGRESS §4): system labels split from user notes, warm-up logging, targeted history reads.

-- ---------------------------------------------------------------------------
-- 1. planned_exercises.label: engine-written text ("Top single @ RPE 6", "Back-off sets @ RPE 7").
--    `note` is now only the user's own note, so editing it can no longer drop the label that drives the load.
-- ---------------------------------------------------------------------------
alter table public.planned_exercises add column label text;

-- Labels that are still in `note` move over.
update public.planned_exercises
   set label = note, note = null
 where note like 'Top single%' or note like 'Back-off%';

-- Labels a user note already overwrote are rebuilt from the prescription (RPE = 10 - RIR); the user's text stays in `note`.
update public.planned_exercises
   set label = 'Top single @ RPE ' || trim_scale(10 - rir_min)
 where label is null and coalesce(is_main_lift_single, false);
update public.planned_exercises
   set label = 'Back-off sets @ RPE ' || trim_scale(10 - rir_min)
 where label is null and not coalesce(is_main_lift_single, false) and 'T-STR-03' = any(rule_ids);

-- Plan materialisation writes the label column. `note` in the payload is still accepted as the label so an
-- older caller keeps working; user notes never come from the plan.
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
        rest_seconds, suggested_load_kg, is_main_lift_single, label, rule_ids)
      values (v_session, auth.uid(), (e->>'exercise_id')::uuid, e->>'slot_key', (e->>'position')::smallint, (e->>'sets')::smallint,
        (e->>'rep_min')::smallint, (e->>'rep_max')::smallint, (e->>'rir_min')::numeric, (e->>'rir_max')::numeric,
        (e->>'rest_seconds')::smallint, nullif(e->>'suggested_load_kg','')::numeric, coalesce((e->>'is_main_lift_single')::boolean, false),
        coalesce(e->>'label', e->>'note'), coalesce(array(select jsonb_array_elements_text(e->'rule_ids')), '{}'));
    end loop;
  end loop;
  return v_block;
end $$;
grant execute on function public.replace_future_plan(jsonb, jsonb, jsonb, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Warm-up sets are logged (is_warmup = true) with their own set_index sequence, so the idempotency key
--    includes is_warmup: warm-up 1 and working set 1 of the same exercise are different rows.
-- ---------------------------------------------------------------------------
alter table public.logged_sets drop constraint logged_sets_idempotent;
alter table public.logged_sets add constraint logged_sets_idempotent unique (planned_exercise_id, is_warmup, set_index); -- NULLs are distinct, so ad-hoc sets never conflict

-- ---------------------------------------------------------------------------
-- 3. Targeted history for the logger, replacing a global "latest 600 rows" read: only the exercises planned in
--    one session, everything before that session. One round trip each, since the exercise ids come from the session.
--    Both are security invoker and also filter on auth.uid(), so RLS and the explicit filter agree.
-- ---------------------------------------------------------------------------

-- Working sets from the latest `p_exposures` training days of each exercise in the session (other sessions only).
create or replace function public.session_exercise_history(p_session_id uuid, p_exposures int)
returns setof public.logged_sets
language sql stable security invoker set search_path = public as $$
  select (x.l).*
    from (
      select l, dense_rank() over (partition by l.exercise_id order by l.performed_on desc) as rk
        from public.logged_sets l
       where l.user_id = auth.uid()
         and l.exercise_id in (select pe.exercise_id from public.planned_exercises pe where pe.session_id = p_session_id)
         and not l.is_warmup
         and l.session_id is distinct from p_session_id
    ) x
   where x.rk <= p_exposures;
$$;

-- All-time best e1RM per exercise in the session, from other sessions (the PR baseline). Same formula as
-- lib/engine/e1rm.ts e1rm(): Brzycki on effective reps r = reps + RIR, load * 36 / (37 - r), none above r = 12.
create or replace function public.session_exercise_best_e1rm(p_session_id uuid)
returns table (exercise_id uuid, best_e1rm numeric)
language sql stable security invoker set search_path = public as $$
  select l.exercise_id, max(l.load_kg * 36 / (37 - (l.reps + coalesce(l.rir, 0))))
    from public.logged_sets l
   where l.user_id = auth.uid()
     and l.exercise_id in (select pe.exercise_id from public.planned_exercises pe where pe.session_id = p_session_id)
     and not l.is_warmup
     and l.load_kg > 0 and l.reps > 0
     and l.reps + coalesce(l.rir, 0) <= 12
     and l.session_id is distinct from p_session_id
   group by l.exercise_id;
$$;

revoke execute on function public.session_exercise_history(uuid, int) from public, anon;
revoke execute on function public.session_exercise_best_e1rm(uuid) from public, anon;
grant execute on function public.session_exercise_history(uuid, int) to authenticated;
grant execute on function public.session_exercise_best_e1rm(uuid) to authenticated;
