import type { Metadata } from 'next';
import { requireOnboarded } from '@/lib/server/context';
import { latestNutrition } from '@/lib/server/queries';
import { bodyweightSeries } from '@/lib/server/bodyweight';
import { PageHeader, Stat, Why } from '@/components/app/bits';
import { BodyweightChart } from '@/components/app/charts';
import { ProposalCard, type ProposalView } from '@/components/app/proposal-card';
import { daysBetween } from '@/lib/engine/util';
import { NUTRITION } from '@/lib/knowledge/constants';
import type { Status } from '@/lib/engine/types';
import { fmtNum, toDisplay } from '@/lib/utils/units';
import { prettyDate } from '@/lib/utils/dates';
import { PhaseEditor, WeighInForm } from './client';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Nutrition' };

const PHASE_LABEL = { gain: 'Gaining', maintain: 'Maintaining', loss: 'Losing' } as const;

const GUIDES: { title: string; body: string; rules: string[] }[] = [
  { title: 'Spread your protein', body: 'Split protein over 3–6 meals of roughly equal size. The daily total matters most; even spacing is a bonus.', rules: ['N-PRO-01'] },
  { title: 'Creatine', body: 'Creatine monohydrate (3–5 g a day, any time) is the one supplement with strong evidence for muscle and strength.', rules: [] },
  { title: 'How to weigh in', body: 'Morning, after the bathroom, before food or drink, same clothes. Daily swings of 1–2% are noise — the weekly average is what counts.', rules: ['N-WGT-01', 'N-WGT-02'] },
  { title: 'The 4:1 rule', body: 'Spend at least four times as long gaining or maintaining as you spend cutting. A four-month gain earns a one-month mini-cut.', rules: ['N-PHS-02'] },
  { title: 'Recomp is real', body: 'You can build muscle at maintenance or in a small deficit — especially if you are newer or your training just improved.', rules: ['N-PHS-03'] },
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
  const history = (ns?.phase_history as { phase: string; from: string; to: string | null }[]) ?? [];
  const days = (h: { from: string; to: string | null }) => daysBetween(h.from, h.to ?? today);
  const cutDays = history.filter((h) => h.phase === 'loss').reduce((a, h) => a + days(h), 0);
  const buildDays = history.filter((h) => h.phase !== 'loss').reduce((a, h) => a + days(h), 0);
  const rate = ns ? Math.abs(Number(ns.target_rate_pct)) : 0;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader kicker={`${PHASE_LABEL[phase]} · week ${weeksIn + 1}`} title="Nutrition" />
      <div className="rise grid gap-4 px-4 sm:px-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:px-8">
        <div className="space-y-4">
          {nt && (
            <section className="bg-card overflow-hidden rounded-2xl border">
              <div className="knurl border-b px-5 py-4">
                <p className="stamp text-muted-foreground">Daily target · from {prettyDate(nt.effective_from)}</p>
                <p className="font-display num mt-1 text-6xl leading-none font-extrabold">
                  {fmtNum(nt.kcal)} <span className="text-muted-foreground text-2xl">kcal</span>
                </p>
                <p className="num text-muted-foreground mt-1 text-sm">
                  Anywhere in {fmtNum(nt.kcal_low)}–{fmtNum(nt.kcal_high)} is on target <Why ruleIds={['N-MNT-01', 'N-MNT-02', 'N-RAT-03']} />
                </p>
              </div>
              <div className="grid grid-cols-3 gap-4 p-5">
                <Stat label="Protein" value={`${nt.protein_g}g`} sub="at least" />
                <Stat label="Fat" value={`${nt.fat_g}g`} sub={`min ${nt.fat_min_g}g`} />
                <Stat label="Carbs" value={`${nt.carbs_g}g`} sub={`min ${nt.carbs_min_g}g`} />
              </div>
              <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-5 py-3 text-xs">
                <span>
                  Flexible calories above minimums: <span className="text-foreground num font-semibold">{fmtNum(Math.max(0, nt.kcal - (nt.protein_g * 4 + nt.fat_min_g * 9 + nt.carbs_min_g * 4)))}</span>
                </span>
                <span>
                  Sports included: <span className="text-foreground num font-semibold">~{nt.sport_kcal_per_day}/day</span>
                </span>
                <Why ruleIds={['N-MAC-01', 'N-PRO-01', 'N-FAT-01', 'N-CHO-01', 'N-SPT-03']} />
              </div>
            </section>
          )}

          {(proposals ?? []).map((p) => (
            <ProposalCard
              key={p.id}
              p={{ id: p.id, kind: p.kind, title: p.title, rationale: p.rationale, rule_ids: p.rule_ids, status: p.status, preview: null, payload: p.payload as ProposalView['payload'], expires_on: p.expires_on }}
            />
          ))}

          <section className="bg-card rounded-2xl border p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-2xl font-bold uppercase">Bodyweight</h2>
              <WeighInForm units={units} />
            </div>
            {hide ? (
              <p className="mt-2 text-sm">
                Trend: <span className="font-semibold capitalize">{bw.direction}</span>
              </p>
            ) : (
              <p className="text-muted-foreground mt-1 text-sm">
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
              <BodyweightChart data={bw.points} unit={units} hideNumbers={hide} />
            </div>
            <ul className="num mt-3 flex flex-wrap gap-1.5 text-xs">
              {bw.weeks.slice(-6).map((w) => (
                <li key={w.weekStart} className={cn('rounded-full px-2.5 py-1', w.lowData ? 'bg-warn/15 text-warn' : 'bg-muted')}>
                  {prettyDate(w.weekStart, { weekday: false })}: {hide ? '•' : `${toDisplay(w.avg, units)}`} ({w.n}){w.lowData && ' low data'}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="space-y-4">
          <section className="bg-card rounded-2xl border p-5">
            <h2 className="font-display text-2xl font-bold uppercase">Phase</h2>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <Stat label="Phase" value={PHASE_LABEL[phase]} />
              <Stat label="Target" value={phase === 'maintain' ? '±0' : `${rate}%`} sub={phase === 'loss' ? 'per week' : phase === 'gain' ? 'per month' : 'stable'} />
              <Stat label="Weeks in" value={weeksIn + 1} />
            </div>
            <div className="mt-4">
              <p className="stamp text-muted-foreground">
                4:1 ratio · build vs cut <Why ruleIds={['N-PHS-02']} />
              </p>
              <div className="bg-muted mt-1.5 flex h-3 overflow-hidden rounded-full" role="img" aria-label={`${buildDays} days gaining or maintaining, ${cutDays} days cutting`}>
                <div className="bg-chart-1" style={{ width: `${(buildDays / Math.max(1, buildDays + cutDays)) * 100}%` }} />
                <div className="bg-warn" style={{ width: `${(cutDays / Math.max(1, buildDays + cutDays)) * 100}%` }} />
              </div>
              <p className="num text-muted-foreground mt-1 text-xs">
                {Math.round(buildDays / 7)} wk build/maintain · {Math.round(cutDays / 7)} wk cut
                {cutDays > 0 && buildDays / cutDays < NUTRITION.gainToCutRatio && <span className="text-warn"> — spend more time building before the next cut</span>}
              </p>
            </div>
            <PhaseEditor phase={phase} rate={rate} status={settings.training_status as Status} />
          </section>

          <section className="space-y-3">
            {GUIDES.map((g) => (
              <div key={g.title} className="bg-card rounded-2xl border p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold">{g.title}</h3>
                  {g.rules.length > 0 && <Why ruleIds={g.rules} />}
                </div>
                <p className="text-muted-foreground mt-1 text-sm">{g.body}</p>
              </div>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}
