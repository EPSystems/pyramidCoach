-- Plan writes (§3 gap fixes, docs/DECISIONS.md "Plan generation gaps"). Columns are added in 20261027120001;
-- the functions live here so they run after 20261027130001_logger_gaps (label column) and
-- 20261027160001_nutrition_targets_bodyweight (bodyweight_kg) and include both.

-- ---------------------------------------------------------------------------
-- replace_future_plan: the logger version (label column, `note` accepted as label) plus status / planned_on /
-- plan_key / original_exercise_id, so skips, moves, swaps and deloads carried over by lib/engine/carryover.ts are written.
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
    insert into public.planned_sessions (user_id, block_id, week_index, scheduled_on, planned_on, plan_key, template_key, title, kind, status, est_minutes, order_in_week)
    values (auth.uid(), v_block, (s->>'week_index')::smallint, (s->>'scheduled_on')::date,
            coalesce((s->>'planned_on')::date, (s->>'scheduled_on')::date), s->>'plan_key', s->>'template_key', s->>'title',
            s->>'kind', coalesce(s->>'status', 'planned'), (s->>'est_minutes')::smallint, (s->>'order_in_week')::smallint)
    returning id into v_session;
    for e in select * from jsonb_array_elements(s->'exercises') loop
      insert into public.planned_exercises (session_id, user_id, exercise_id, original_exercise_id, slot_key, position, sets, rep_min, rep_max, rir_min, rir_max,
        rest_seconds, suggested_load_kg, is_main_lift_single, label, rule_ids)
      values (v_session, auth.uid(), (e->>'exercise_id')::uuid, coalesce((e->>'original_exercise_id')::uuid, (e->>'exercise_id')::uuid),
        e->>'slot_key', (e->>'position')::smallint, (e->>'sets')::smallint,
        (e->>'rep_min')::smallint, (e->>'rep_max')::smallint, (e->>'rir_min')::numeric, (e->>'rir_max')::numeric,
        (e->>'rest_seconds')::smallint, nullif(e->>'suggested_load_kg','')::numeric, coalesce((e->>'is_main_lift_single')::boolean, false),
        coalesce(e->>'label', e->>'note'), coalesce(array(select jsonb_array_elements_text(e->'rule_ids')), '{}'));
    end loop;
  end loop;
  return v_block;
end $$;
revoke execute on function public.replace_future_plan(jsonb, jsonb, jsonb, date) from public, anon;
grant execute on function public.replace_future_plan(jsonb, jsonb, jsonb, date) to authenticated;

-- ---------------------------------------------------------------------------
-- apply_plan_writes: one transaction for everything a proposal accept or a plan regeneration writes
-- (replaces the sequential writes of DECISIONS 12). Security invoker, so RLS applies to every statement.
-- Keys (all optional):
--   settings          { training_status?, status_source?, target_adjustments? }
--   exercise_updates  [{ id, sets?, rir_min?, rir_max?, rep_min?, rep_max?, exercise_id? }]
--   exercise_deletes  [id]
--   session_updates   [{ id, status?, kind? }]
--   injury            { id?, muscle_id, label, severity?, add_avoid_ids, started_on }: update (id) or insert, before the plan
--   plan              { block, targets, sessions, from }  → replace_future_plan
--   nutrition_target  a nutrition_targets row (id/user_id/created_at ignored)
--   nutrition_settings a nutrition_settings row, upserted (user_id ignored)
--   accept_proposal_id  marks that proposal accepted; raises if it is no longer pending (double accept → no writes)
-- Returns { block_id } (null when no plan was written).
-- ---------------------------------------------------------------------------
create or replace function public.apply_plan_writes(p jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_block uuid;
  u jsonb;
  n integer;
begin
  if v_uid is null then raise exception 'Not signed in' using errcode = '42501'; end if;

  if p ? 'settings' then
    update public.user_settings
       set training_status = coalesce(p->'settings'->>'training_status', training_status),
           status_source = coalesce(p->'settings'->>'status_source', status_source),
           target_adjustments = coalesce(p->'settings'->'target_adjustments', target_adjustments)
     where user_id = v_uid;
    get diagnostics n = row_count;
    if n = 0 then raise exception 'Settings not found' using errcode = 'P0002'; end if;
  end if;

  for u in select * from jsonb_array_elements(coalesce(p->'exercise_updates', '[]'::jsonb)) loop
    update public.planned_exercises
       set sets = coalesce((u->>'sets')::smallint, sets),
           rir_min = coalesce((u->>'rir_min')::numeric, rir_min),
           rir_max = coalesce((u->>'rir_max')::numeric, rir_max),
           rep_min = coalesce((u->>'rep_min')::smallint, rep_min),
           rep_max = coalesce((u->>'rep_max')::smallint, rep_max),
           exercise_id = coalesce((u->>'exercise_id')::uuid, exercise_id)
     where id = (u->>'id')::uuid and user_id = v_uid;
  end loop;

  delete from public.planned_exercises
   where user_id = v_uid
     and id in (select x::uuid from jsonb_array_elements_text(coalesce(p->'exercise_deletes', '[]'::jsonb)) x);

  for u in select * from jsonb_array_elements(coalesce(p->'session_updates', '[]'::jsonb)) loop
    update public.planned_sessions
       set status = coalesce(u->>'status', status),
           kind = coalesce(u->>'kind', kind)
     where id = (u->>'id')::uuid and user_id = v_uid;
  end loop;

  if p ? 'injury' then
    if nullif(p->'injury'->>'id', '') is not null then
      update public.injuries
         set avoid_exercise_ids = array(select distinct x from unnest(avoid_exercise_ids || array(select jsonb_array_elements_text(coalesce(p->'injury'->'add_avoid_ids', '[]'::jsonb)))::uuid[]) x),
             severity = coalesce(p->'injury'->>'severity', severity)
       where id = (p->'injury'->>'id')::uuid and user_id = v_uid;
      get diagnostics n = row_count;
      if n = 0 then raise exception 'Injury not found' using errcode = 'P0002'; end if;
    else
      insert into public.injuries (user_id, muscle_id, label, severity, status, avoid_exercise_ids, started_on)
      values (v_uid, p->'injury'->>'muscle_id', coalesce(p->'injury'->>'label', 'Pain (from check-ins)'), coalesce(p->'injury'->>'severity', 'pain'), 'active',
              array(select jsonb_array_elements_text(coalesce(p->'injury'->'add_avoid_ids', '[]'::jsonb)))::uuid[], (p->'injury'->>'started_on')::date);
    end if;
  end if;

  if p ? 'plan' then
    v_block := public.replace_future_plan(p->'plan'->'block', p->'plan'->'targets', p->'plan'->'sessions', (p->'plan'->>'from')::date);
  end if;

  if p ? 'nutrition_target' then
    insert into public.nutrition_targets (user_id, effective_from, kcal, kcal_low, kcal_high, protein_g, fat_min_g, fat_g, carbs_min_g, carbs_g,
                                          sport_kcal_per_day, maintenance_kcal, bodyweight_kg, reason)
    select v_uid, r.effective_from, r.kcal, r.kcal_low, r.kcal_high, r.protein_g, r.fat_min_g, r.fat_g, r.carbs_min_g, r.carbs_g,
           coalesce(r.sport_kcal_per_day, 0), r.maintenance_kcal, r.bodyweight_kg, r.reason
      from jsonb_populate_record(null::public.nutrition_targets, p->'nutrition_target') r;
  end if;

  if p ? 'nutrition_settings' then
    insert into public.nutrition_settings (user_id, phase, activity_multiplier, maintenance_kcal, target_rate_pct, phase_started_on, last_adjusted_on,
                                           initial_adjust_done, kcal_offset, phase_history)
    select v_uid, r.phase, r.activity_multiplier, r.maintenance_kcal, r.target_rate_pct, r.phase_started_on, r.last_adjusted_on,
           coalesce(r.initial_adjust_done, false), coalesce(r.kcal_offset, 0), coalesce(r.phase_history, '[]'::jsonb)
      from jsonb_populate_record(null::public.nutrition_settings, p->'nutrition_settings') r
    on conflict (user_id) do update
       set phase = excluded.phase,
           activity_multiplier = excluded.activity_multiplier,
           maintenance_kcal = excluded.maintenance_kcal,
           target_rate_pct = excluded.target_rate_pct,
           phase_started_on = excluded.phase_started_on,
           last_adjusted_on = excluded.last_adjusted_on,
           initial_adjust_done = excluded.initial_adjust_done,
           kcal_offset = excluded.kcal_offset,
           phase_history = excluded.phase_history;
  end if;

  if p ? 'accept_proposal_id' then
    update public.proposals
       set status = 'accepted', decided_at = now()
     where id = (p->>'accept_proposal_id')::uuid and user_id = v_uid and status = 'pending';
    get diagnostics n = row_count;
    if n = 0 then raise exception 'Already decided' using errcode = 'P0001'; end if;
  end if;

  return jsonb_build_object('block_id', v_block);
end $$;
revoke execute on function public.apply_plan_writes(jsonb) from public, anon;
grant execute on function public.apply_plan_writes(jsonb) to authenticated;
