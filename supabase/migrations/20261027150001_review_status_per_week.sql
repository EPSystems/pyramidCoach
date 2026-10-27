-- Weekly review / proposals fixes (docs/DECISIONS.md, "Weekly review and proposals (2026-10-27)").

-- T-STA-03 "two reviews in a row": store each week's status inference on that week's review row.
-- weekly_reviews already has primary key (user_id, week_start), so a re-submission overwrites the week's inference
-- instead of appending a second entry the way user_settings.status_history did.
alter table public.weekly_reviews
  add column if not exists inferred_status text check (inferred_status in ('novice', 'intermediate', 'advanced'));

-- A pending proposal replaced by a newer one of the same kind with different content is marked 'superseded'
-- (not 'rejected': the user never decided on it, and not 'expired': it didn't time out).
alter table public.proposals drop constraint if exists proposals_status_check;
alter table public.proposals
  add constraint proposals_status_check check (status in ('pending', 'accepted', 'rejected', 'expired', 'superseded'));
