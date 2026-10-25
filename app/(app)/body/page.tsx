import type { Metadata } from 'next';
import { requireOnboarded, loadExercises, mapSet } from '@/lib/server/context';
import { activeBlock, sessionsBetween } from '@/lib/server/queries';
import { PageHeader } from '@/components/app/bits';
import { addDays, daysBetween, mondayOf } from '@/lib/engine/util';
import { fractionalSets, loggedMuscleSets } from '@/lib/engine/counting';
import { ALL_MUSCLES, type MuscleId } from '@/lib/engine/types';
import { BodyExplorer, type MuscleInfo } from './explorer';

export const metadata: Metadata = { title: 'Body' };

export default async function BodyPage() {
  const ctx = await requireOnboarded();
  const { supabase, user, today } = ctx;
  const start = mondayOf(today);
  const end = addDays(start, 7);
  const [block, sessions, exercises, { data: setRows }, { data: checkins }] = await Promise.all([
    activeBlock(supabase, user.id),
    sessionsBetween(supabase, user.id, start, end),
    loadExercises(supabase),
    supabase.from('logged_sets').select('*').eq('user_id', user.id).gte('performed_on', addDays(today, -60)),
    supabase.from('checkins').select('day, soreness').eq('user_id', user.id).gte('day', addDays(today, -6)).order('day'),
  ]);
  const exMap = new Map(exercises.map((e) => [e.id, e]));
  const sets = (setRows ?? []).map(mapSet);
  const weekIdx = block ? Math.floor(daysBetween(block.starts_on, start) / 7) : -1;
  const { data: targets } = block && weekIdx >= 0 ? await supabase.from('weekly_targets').select('*').eq('block_id', block.id).eq('week_index', weekIdx) : { data: [] };
  const logged = loggedMuscleSets(sets, exMap, start);
  const trims = (block?.inputs_snapshot as { sports?: { name: string; musclesStressed: string[] }[] } | null)?.sports ?? [];

  const info: Partial<Record<MuscleId, MuscleInfo>> = {};
  for (const m of ALL_MUSCLES) {
    const t = targets?.find((x) => x.muscle_id === m);
    const plannedEx: MuscleInfo['exercises'] = [];
    let planned = 0;
    for (const s of sessions) {
      if (s.status === 'skipped') continue;
      for (const pe of s.planned_exercises) {
        const ex = exMap.get(pe.exercise_id);
        if (!ex || pe.is_main_lift_single) continue;
        const v = fractionalSets(ex, pe.sets)[m];
        if (!v) continue;
        planned += v;
        const role = ex.muscles.find((x) => x.muscle === m)!.role;
        const prev = plannedEx.find((p) => p.name === ex.name);
        if (prev) prev.sets += pe.sets;
        else plannedEx.push({ name: ex.name, slug: ex.slug, weight: role === 'primary' ? 1 : 0.5, sets: pe.sets });
      }
    }
    const lastDay = sets
      .filter((s) => !s.isWarmup && exMap.get(s.exerciseId)?.muscles.some((x) => x.muscle === m && x.role === 'primary'))
      .reduce<string | null>((a, s) => (!a || s.performedOn > a ? s.performedOn : a), null);
    info[m] = {
      target: t ? Number(t.target_sets) : null,
      sportTrim: t ? Number(t.sport_trim) : 0,
      trimSports: trims.filter((s) => s.musclesStressed.includes(m)).map((s) => s.name),
      logged: Math.round(logged[m] * 10) / 10,
      planned: Math.round(planned * 10) / 10,
      daysSince: lastDay ? daysBetween(lastDay, today) : null,
      soreness: (checkins ?? []).flatMap((c) => {
        const v = (c.soreness as Record<string, string>)[m];
        return v ? [{ day: c.day, level: v as 'sore' | 'pain' }] : [];
      }),
      exercises: plannedEx.sort((a, b) => b.weight - a.weight),
      injured: ctx.injuries.some((i) => i.muscleId === m),
      specialised: (ctx.settings.specialization_muscles as string[]).includes(m),
    };
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader kicker="This week" title="Body" />
      <div className="px-4 sm:px-6 lg:px-8">
        <BodyExplorer info={info} adjustments={(ctx.settings.target_adjustments as Record<string, number>) ?? {}} />
      </div>
    </div>
  );
}
