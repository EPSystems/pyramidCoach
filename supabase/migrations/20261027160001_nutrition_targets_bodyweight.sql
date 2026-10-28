-- Record the bodyweight each nutrition_targets row was computed from, so a new weigh-in can tell
-- whether the targets are stale (docs/DECISIONS.md 48). Older rows stay null and are refreshed on the next weigh-in.
alter table public.nutrition_targets add column if not exists bodyweight_kg numeric(5,2);
