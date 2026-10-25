'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { BodyMap, type MuscleStyle } from '@/components/app/body-map';
import { Segmented, Why } from '@/components/app/bits';
import { bandFill, mixVolt, NONE_FILL, RECENCY, volumeBand, VOLUME_BANDS } from '@/components/app/colors';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ALL_MUSCLES, TRACKED_MUSCLES, type MuscleId } from '@/lib/engine/types';
import { MUSCLE_SHORT } from '@/lib/knowledge/muscles';
import { prettyDate } from '@/lib/utils/dates';
import { cn } from '@/lib/utils';

export interface MuscleInfo {
  target: number | null;
  sportTrim: number;
  trimSports: string[];
  logged: number;
  planned: number;
  daysSince: number | null;
  soreness: { day: string; level: 'sore' | 'pain' }[];
  exercises: { name: string; slug: string; weight: number; sets: number }[];
  injured: boolean;
  specialised: boolean;
}

type Mode = 'volume' | 'planned' | 'recency' | 'soreness';

export function BodyExplorer({ info, adjustments }: { info: Partial<Record<MuscleId, MuscleInfo>>; adjustments: Record<string, number> }) {
  const [mode, setMode] = useState<Mode>('volume');
  const [sel, setSel] = useState<MuscleId | null>(null);

  const styleFor = (m: MuscleId): MuscleStyle => {
    const i = info[m];
    if (!i) return {};
    const dashed = i.injured;
    if (mode === 'volume' || mode === 'planned') {
      const v = mode === 'volume' ? i.logged : i.planned;
      if (i.target == null) return { fill: v > 0 ? mixVolt(30) : NONE_FILL, dashed, label: `${v} sets (not targeted)` };
      const band = volumeBand(v, i.target, i.specialised ? 30 : 20);
      return { fill: bandFill(band), dashed, label: `${v} of ${i.target} sets` };
    }
    if (mode === 'recency') {
      if (i.daysSince == null) return { fill: NONE_FILL, dashed, label: 'not trained recently' };
      const r = RECENCY.find((x) => i.daysSince! <= x.max)!;
      return { fill: mixVolt(r.pct), dashed, label: r.key };
    }
    const last = i.soreness[i.soreness.length - 1];
    if (!last) return { fill: NONE_FILL, dashed, label: 'no soreness' };
    return { fill: last.level === 'pain' ? 'var(--danger)' : 'color-mix(in oklch, var(--warn) 70%, var(--card))', dashed, label: `${last.level} (${prettyDate(last.day)})` };
  };

  const styles = useMemo(() => Object.fromEntries(ALL_MUSCLES.map((m) => [m, styleFor(m)])), [mode, info]); // eslint-disable-line react-hooks/exhaustive-deps
  const legend =
    mode === 'volume' || mode === 'planned'
      ? VOLUME_BANDS.map((b) => ({ label: b.label, fill: b.fill }))
      : mode === 'recency'
        ? [...RECENCY.map((r) => ({ label: r.key, fill: mixVolt(r.pct) })), { label: 'Not trained', fill: NONE_FILL }]
        : [
            { label: 'Sore', fill: 'color-mix(in oklch, var(--warn) 70%, var(--card))' },
            { label: 'Pain', fill: 'var(--danger)' },
            { label: 'Clear', fill: NONE_FILL },
          ];
  const i = sel ? info[sel] : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div>
        <Segmented
          label="Body map mode"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'volume', label: 'Volume' },
            { value: 'planned', label: 'Planned' },
            { value: 'recency', label: 'Last trained' },
            { value: 'soreness', label: 'Soreness' },
          ]}
        />
        <BodyMap side="both" className="mx-auto mt-4 max-w-xl" styles={styles} selected={sel} onSelect={setSel} />
        <ul className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1.5" aria-label="Legend">
          {legend.map((l) => (
            <li key={l.label} className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <span className="size-3 rounded-sm border" style={{ background: l.fill }} />
              {l.label}
            </li>
          ))}
          <li className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <span className="border-danger size-3 rounded-sm border border-dashed" /> Injury / rehab
          </li>
        </ul>
      </div>

      {/* Accessible list alternative (Section 11). */}
      <section className="bg-card h-fit rounded-2xl border p-4">
        <h2 className="font-display text-xl font-bold uppercase">Muscles</h2>
        <ul className="mt-2 divide-y">
          {TRACKED_MUSCLES.map((m) => {
            const mi = info[m]!;
            const st = styles[m] as MuscleStyle;
            return (
              <li key={m}>
                <button type="button" onClick={() => setSel(m)} className="hover:bg-muted flex h-11 w-full items-center gap-2 rounded-lg px-2 text-left text-sm">
                  <span className="size-3 shrink-0 rounded-sm" style={{ background: st.fill }} />
                  <span className={cn('flex-1', mi.injured && 'text-danger')}>{MUSCLE_SHORT[m]}</span>
                  <span className="num text-muted-foreground">
                    {mode === 'planned' ? mi.planned : mode === 'volume' ? mi.logged : mode === 'recency' ? (mi.daysSince == null ? '—' : `${mi.daysSince}d`) : (mi.soreness.at(-1)?.level ?? '—')}
                    {(mode === 'volume' || mode === 'planned') && mi.target != null && <span>/{mi.target}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <Sheet open={!!sel} onOpenChange={(o) => !o && setSel(null)}>
        <SheetContent side="bottom" className="mx-auto max-h-[85dvh] max-w-2xl overflow-y-auto rounded-t-3xl">
          {sel && i && (
            <>
              <SheetHeader>
                <SheetTitle className="font-display text-3xl uppercase">{MUSCLE_SHORT[sel]}</SheetTitle>
                <SheetDescription>
                  {i.target != null ? (
                    <>
                      Target band {Math.max(0, i.target - 1)}–{i.target + 1} sets this week.
                    </>
                  ) : (
                    'Shown on the map but not targeted in this version.'
                  )}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-4 px-4 pb-6">
                <div className="num grid grid-cols-3 gap-3">
                  <div className="bg-muted rounded-xl p-3">
                    <p className="stamp text-muted-foreground">Logged</p>
                    <p className="font-display text-3xl font-bold">{i.logged}</p>
                  </div>
                  <div className="bg-muted rounded-xl p-3">
                    <p className="stamp text-muted-foreground">Planned</p>
                    <p className="font-display text-3xl font-bold">{i.planned}</p>
                  </div>
                  <div className="bg-muted rounded-xl p-3">
                    <p className="stamp text-muted-foreground">Last trained</p>
                    <p className="font-display text-3xl font-bold">{i.daysSince == null ? '—' : `${i.daysSince}d`}</p>
                  </div>
                </div>
                {i.target != null && (
                  <ul className="text-muted-foreground space-y-1 text-sm">
                    <li>
                      Why this target: base volume for your status and goal
                      {i.sportTrim > 0 && `, −${i.sportTrim} sets for ${i.trimSports.join(', ').toLowerCase() || 'sport'}`}
                      {adjustments[sel] ? `, +${adjustments[sel]} after a plateau` : ''}
                      {i.specialised ? ', specialisation phase' : ''}. <Why ruleIds={['T-VOL-01', 'T-VOL-02', ...(i.sportTrim ? ['S-02'] : []), ...(i.specialised ? ['T-VOL-08'] : [])]} />
                    </li>
                  </ul>
                )}
                {i.injured && <p className="text-danger text-sm">Injury or rehab logged here — heavy spinal and impact work for this area is excluded. <Why ruleIds={['T-SEL-08']} /></p>}
                <div>
                  <p className="stamp text-muted-foreground mb-1">Exercises this week</p>
                  {i.exercises.length ? (
                    <ul className="divide-y text-sm">
                      {i.exercises.map((e) => (
                        <li key={e.name} className="flex justify-between py-1.5">
                          <Link href={`/library/${e.slug}`} className="underline-offset-2 hover:underline">
                            {e.name}
                          </Link>
                          <span className="num text-muted-foreground">
                            {e.sets} sets × {e.weight === 1 ? '1.0' : '0.5'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted-foreground text-sm">None planned this week.</p>
                  )}
                </div>
                {i.soreness.length > 0 && (
                  <p className="text-sm">
                    Soreness (7 days):{' '}
                    {i.soreness.map((s) => (
                      <span key={s.day} className={cn('mr-1.5', s.level === 'pain' ? 'text-danger' : 'text-warn')}>
                        {prettyDate(s.day)} {s.level}
                      </span>
                    ))}
                  </p>
                )}
                {(TRACKED_MUSCLES as readonly string[]).includes(sel) && (
                  <Button asChild className="w-full" size="lg">
                    <Link href={`/generate?muscle=${sel}`}>
                      <Sparkles /> Generate a workout for {MUSCLE_SHORT[sel].toLowerCase()}
                    </Link>
                  </Button>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
