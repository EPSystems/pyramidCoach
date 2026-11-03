import type { Metadata } from 'next';
import { requireOnboarded } from '@/lib/server/context';
import { latestNutrition } from '@/lib/server/queries';
import { bodyweightSeries } from '@/lib/server/bodyweight';
import { Disclosure, Group, PageHeader, Stat, Why } from '@/components/app/bits';
import { BodyweightChart } from '@/components/app/charts';
import { ProposalCard, type ProposalView } from '@/components/app/proposal-card';
import { daysBetween } from '@/lib/engine/util';
import { buildCutDays, type PhaseSpan } from '@/lib/engine/nutrition';
import { NUTRITION } from '@/lib/knowledge/constants';
import type { Status } from '@/lib/engine/types';
import { fmtNum, toDisplay } from '@/lib/utils/units';
import { prettyDate } from '@/lib/utils/dates';
import { PhaseEditor, RecalculateButton, WeighInForm } from './client';

export const metadata: Metadata = { title: 'Nutrition' };

const PHASE_LABEL = { gain: 'Gaining', maintain: 'Maintaining', loss: 'Losing' } as const;

const GUIDES: { title: string; body: string; rules: string[] }[] = [
  { title: 'Spread your protein', body: 'Split protein over 3–6 meals of roughly equal size. The daily total matters most; even spacing is a bonus.', rules: ['N-PRO-01'] },
  { title: 'Creatine', body: 'Creatine monohydrate (3–5 g a day, any time) is the one supplement with strong evidence for muscle and strength.', rules: [] },
  { title: 'How to weigh in', body: 'Morning, after the bathroom, before food or drink, same clothes. Daily swings of 1–2% are noise; the weekly average is what counts.', rules: ['N-WGT-01', 'N-WGT-02'] },
  { title: 'The 4:1 rule', body: 'Spend at least four times as long gaining or maintaining as you spend cutting. A four-month gain earns a one-month mini-cut.', rules: ['N-PHS-02'] },
  { title: 'Recomp is real', body: 'You can build muscle at maintenance or in a small deficit, especially if you are newer or your training just improved.', rules: ['N-PHS-03'] },
];

export default async function NutritionPage() {
  const ctx = await requireOnboarded();
  const { supabase, user, today, units, settings, profile } = ctx;
  const [nt, bw, { data: proposals }] = await Promise.all([
    latestNutrition(supabase, user.id),
    bodyweightSeries(supabase, user.id, today, units, { status: settings.training_status as Status }),
    supabase.from('proposals').select('*').eq('user_id', user.id).eq('status', 'pending').in('kind', ['calorie_adjust', 'multiplier_adjust']),
  ]);
  const ns = bw.settings;
  const hide = !!profile.hide_bodyweight;
  const phase = (ns?.phase ?? 'maintain') as keyof typeof PHASE_LABEL;
  const weeksIn = ns ? Math.floor(daysBetween(ns.phase_started_on, today) / 7) : 0;
  const { buildDays, cutDays } = buildCutDays((ns?.phase_history as PhaseSpan[] | undefined) ?? [], today);
  const rate = ns ? Math.abs(Number(ns.target_rate_pct)) : 0;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Nutrition" />
      <div className="grid gap-6 px-4 sm:px-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:px-8">
        <div className="space-y-6">
          {nt && (
            <section className="bg-card overflow-hidden rounded-2xl border">
              <div className="p-5">
                <p className="text-muted-foreground text-sm">Daily target</p>
                <p className="font-display num mt-1 text-6xl leading-none font-extrabold">
                  {fmtNum(nt.kcal)} <span className="text-muted-foreground font-sans text-xl font-normal">kcal</span>
                </p>
                <p className="num text-muted-foreground mt-2 text-sm">
                  Anywhere from {fmtNum(nt.kcal_low)} to {fmtNum(nt.kcal_high)} is on target.
                </p>
                <div className="mt-5 grid grid-cols-3 gap-4">
                  <Stat label="Protein" value={`${nt.protein_g}g`} sub="at least" />
                  <Stat label="Fat" value={`${nt.fat_g}g`} sub={`min ${nt.fat_min_g}g`} />
                  <Stat label="Carbs" value={`${nt.carbs_g}g`} sub={`min ${nt.carbs_min_g}g`} />
                </div>
              </div>
              <Disclosure summary="How this was worked out" className="border-t">
                <dl className="num divide-y text-sm">
                  <div className="flex justify-between gap-4 py-2">
                    <dt className="text-muted-foreground">In effect since</dt>
                    <dd>{prettyDate(nt.effective_from)}</dd>
                  </div>
                  <div className="flex justify-between gap-4 py-2">
                    <dt className="text-muted-foreground">Free calories after minimums</dt>
                    <dd>{fmtNum(Math.max(0, nt.kcal - (nt.protein_g * 4 + nt.fat_min_g * 9 + nt.carbs_min_g * 4)))}</dd>
                  </div>
                  <div className="flex justify-between gap-4 py-2">
                    <dt className="text-muted-foreground">Included for sports</dt>
                    <dd>about {nt.sport_kcal_per_day} a day</dd>
                  </div>
                  {nt.bodyweight_kg != null && !hide && (
                    <div className="flex justify-between gap-4 py-2">
                      <dt className="text-muted-foreground">Based on 7-day average weight</dt>
                      <dd>
                        {toDisplay(Number(nt.bodyweight_kg), units)} {units}
                      </dd>
                    </div>
                  )}
                </dl>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <Why ruleIds={['N-MNT-01', 'N-MNT-02', 'N-RAT-03', 'N-MAC-01', 'N-PRO-01', 'N-FAT-01', 'N-CHO-01', 'N-SPT-01', 'N-SPT-03']} />
                  <RecalculateButton />
                </div>
              </Disclosure>
            </section>
          )}

          {(proposals ?? []).map((p) => (
            <ProposalCard
              key={p.id}
              p={{ id: p.id, kind: p.kind, title: p.title, rationale: p.rationale, rule_ids: p.rule_ids, status: p.status, preview: null, payload: p.payload as ProposalView['payload'], expires_on: p.expires_on }}
            />
          ))}

          <section className="bg-card overflow-hidden rounded-2xl border">
            <div className="p-5">
              <h2 className="text-lg font-semibold">Bodyweight</h2>
              {hide ? (
                <p className="text-muted-foreground text-sm">
                  Trend: <span className="text-foreground font-medium capitalize">{bw.direction}</span>
                </p>
              ) : (
                <p className="num text-muted-foreground text-sm">
                  {bw.latest ? (
                    <>
                      Latest {toDisplay(bw.latest.kg, units)} {units} on {prettyDate(bw.latest.day)}
                      {bw.lastRate != null && <> · last week {bw.lastRate >= 0 ? '+' : ''}{bw.lastRate.toFixed(2)}%</>}
                    </>
                  ) : (
                    'No weigh-ins yet.'
                  )}
                </p>
              )}
              <div className="mt-3">
                <WeighInForm units={units} />
              </div>
              <div className="mt-4">
                <BodyweightChart data={bw.points} unit={units} hideNumbers={hide} />
              </div>
            </div>
            {bw.weeks.length > 0 && (
              <Disclosure summary="Weekly averages" className="border-t">
                <ul className="num divide-y text-sm">
                  {bw.weeks.slice(-6).map((w) => (
                    <li key={w.weekStart} className="flex items-center justify-between gap-3 py-2">
                      <span>Week of {prettyDate(w.weekStart, { weekday: false })}</span>
                      <span className="text-right">
                        {hide ? '•' : `${toDisplay(w.avg, units)} ${units}`}
                        <span className="text-muted-foreground"> · {w.n} {w.n === 1 ? 'weigh-in' : 'weigh-ins'}</span>
                        {w.lowData && <span className="text-warn block">Too few to trust</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </Disclosure>
            )}
          </section>
        </div>

        <div className="space-y-6">
          <section className="bg-card rounded-2xl border p-5">
            <h2 className="text-lg font-semibold">{PHASE_LABEL[phase]}</h2>
            <p className="num text-muted-foreground text-sm">
              Week {weeksIn + 1}
              {phase !== 'maintain' && <> · {rate}% per {phase === 'loss' ? 'week' : 'month'}</>}
            </p>
            <div className="mt-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">Building compared with cutting</p>
                <Why ruleIds={['N-PHS-02']} />
              </div>
              <div className="bg-muted mt-2 flex h-3 overflow-hidden rounded-full" role="img" aria-label={`${buildDays} days gaining or maintaining, ${cutDays} days cutting`}>
                <div className="bg-chart-1" style={{ width: `${(buildDays / Math.max(1, buildDays + cutDays)) * 100}%` }} />
                <div className="bg-warn" style={{ width: `${(cutDays / Math.max(1, buildDays + cutDays)) * 100}%` }} />
              </div>
              <p className="num text-muted-foreground mt-1.5 text-sm">
                {Math.round(buildDays / 7)} weeks building or maintaining · {Math.round(cutDays / 7)} weeks cutting
              </p>
              {cutDays > 0 && buildDays / cutDays < NUTRITION.gainToCutRatio && <p className="text-warn mt-1 text-sm">Spend more time building before your next cut.</p>}
            </div>
            <PhaseEditor phase={phase} rate={rate} status={settings.training_status as Status} />
          </section>

          <Group title="Good to know">
            {GUIDES.map((g) => (
              <Disclosure key={g.title} summary={g.title}>
                <p className="text-muted-foreground text-sm">{g.body}</p>
                {g.rules.length > 0 && <Why ruleIds={g.rules} className="mt-2" />}
              </Disclosure>
            ))}
          </Group>
        </div>
      </div>
    </div>
  );
}
