-- Onboarding data writes in one transaction (DECISIONS #37). Security invoker, so RLS applies to every statement.
-- The caller (lib/actions/onboarding.ts) validates and derives the rows (lib/onboarding/derive.ts), then builds the
-- first plan and nutrition targets and only then sets profiles.onboarded_at, so a failed build can be resubmitted.
create or replace function public.complete_onboarding(p jsonb)
returns void language plpgsql security invoker set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (p->>'today')::date;
  v_onboarded timestamptz;
  pr jsonb := p->'profile';
  st jsonb := p->'settings';
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  -- Row lock: two tabs submitting at once run one after the other, and the second sees the first one's result.
  select onboarded_at into v_onboarded from public.profiles where user_id = v_uid for update;
  if not found then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;
  -- A resubmit from a stale tab would overwrite what the user has edited since.
  if v_onboarded is not null then
    raise exception 'already onboarded' using errcode = 'P0001', hint = 'already_onboarded';
  end if;

  update public.profiles set
    display_name = pr->>'display_name',
    sex = pr->>'sex',
    birth_year = (pr->>'birth_year')::smallint,
    height_cm = (pr->>'height_cm')::numeric,
    bodyweight_kg = (pr->>'bodyweight_kg')::numeric,
    body_fat_pct = (pr->>'body_fat_pct')::numeric,
    units = pr->>'units',
    timezone = pr->>'timezone',
    last_active_at = now()
  where user_id = v_uid;

  insert into public.user_settings (user_id, goal, priority, training_status, status_source, available_days, session_minutes,
    max_lift_days, lifestyle, equipment, e1rm_seeds, trained_last_month)
  values (v_uid, st->>'goal', st->>'priority', st->>'training_status', 'self',
    array(select jsonb_array_elements_text(st->'available_days')::smallint), (st->>'session_minutes')::smallint,
    (st->>'max_lift_days')::smallint, st->>'lifestyle', array(select jsonb_array_elements_text(st->'equipment')),
    coalesce(st->'e1rm_seeds', '{}'), (st->>'trained_last_month')::boolean)
  on conflict (user_id) do update set
    goal = excluded.goal, priority = excluded.priority, training_status = excluded.training_status,
    status_source = excluded.status_source, available_days = excluded.available_days, session_minutes = excluded.session_minutes,
    max_lift_days = excluded.max_lift_days, lifestyle = excluded.lifestyle, equipment = excluded.equipment,
    e1rm_seeds = excluded.e1rm_seeds, trained_last_month = excluded.trained_last_month;

  -- Replace sports. Before onboarding completes, the only way to own a custom sport is an earlier attempt of this
  -- function, so those rows are leftovers (deleting them cascades to their user_sports).
  delete from public.user_sports where user_id = v_uid;
  delete from public.sports where owner_user_id = v_uid;
  insert into public.sports (id, name, lower_body_load, upper_body_load, eccentric_impact, conditioning, muscles_stressed, default_minutes, owner_user_id)
  select c->>'id', c->>'name', (c->>'lower_body_load')::smallint, (c->>'upper_body_load')::smallint,
         (c->>'eccentric_impact')::smallint, (c->>'conditioning')::smallint,
         array(select jsonb_array_elements_text(c->'muscles_stressed')), 60, v_uid
    from jsonb_array_elements(coalesce(p->'custom_sports', '[]')) c;
  insert into public.user_sports (user_id, sport_id, weekdays, intensity, minutes, time_of_day)
  select v_uid, s->>'sport_id', array(select jsonb_array_elements_text(s->'weekdays')::smallint), s->>'intensity',
         (s->>'minutes')::smallint, s->>'time_of_day'
    from jsonb_array_elements(coalesce(p->'sports', '[]')) s;

  -- Replace injuries; avoided exercises arrive as slugs and resolve to the ids this user can see.
  delete from public.injuries where user_id = v_uid;
  insert into public.injuries (user_id, muscle_id, label, severity, status, rehab_note, avoid_exercise_ids, started_on)
  select v_uid, i->>'muscle_id', i->>'label', i->>'severity', i->>'status', i->>'rehab_note',
         array(select e.id from public.exercises e
                where e.slug in (select jsonb_array_elements_text(coalesce(i->'avoid_slugs', '[]')))
                order by e.slug),
         v_today
    from jsonb_array_elements(coalesce(p->'injuries', '[]')) i;

  -- Starting bodyweight counts as today's weigh-in.
  insert into public.checkins (user_id, day, bodyweight_kg) values (v_uid, v_today, (pr->>'bodyweight_kg')::numeric)
  on conflict (user_id, day) do update set bodyweight_kg = excluded.bodyweight_kg;
end $$;

revoke execute on function public.complete_onboarding(jsonb) from public, anon;
grant execute on function public.complete_onboarding(jsonb) to authenticated;
