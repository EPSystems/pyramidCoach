'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TrendLine } from '@/components/app/charts';
import { prettyDate } from '@/lib/utils/dates';
import type { TrendMetric } from '@/lib/engine/progress';
import type { Units } from '@/lib/utils/units';

export interface HistoryExercise {
  id: string;
  name: string;
  rows: { date: string; text: string; rir: string }[];
  /** e1RM when most days have one; volume load or total reps for high-rep work (T-EST-01 skips > 12 effective reps). */
  metric: TrendMetric;
  trend: { x: string; y: number }[];
}

const METRIC_LABEL: Record<TrendMetric, string> = { e1rm: 'First-set estimated 1-rep max', volume_load: 'Volume (load × reps)', reps: 'Total reps' };
const SHOWN_ROWS = 5;

export function ExerciseHistory({ exercises, unit }: { exercises: HistoryExercise[]; unit: Units }) {
  const [sel, setSel] = useState<string | null>(exercises[0]?.id ?? null);
  const [all, setAll] = useState(false);
  const cur = exercises.find((e) => e.id === sel);
  const rows = cur ? (all ? cur.rows : cur.rows.slice(0, SHOWN_ROWS)) : [];
  return (
    <section className="bg-card rounded-2xl border p-5">
      <h2 className="text-lg font-semibold">Any exercise</h2>
      {exercises.length === 0 ? (
        <p className="text-muted-foreground mt-1 text-sm">The exercises you log will show up here.</p>
      ) : (
        <>
          <Select
            value={sel ?? undefined}
            onValueChange={(v) => {
              setSel(v);
              setAll(false);
            }}
          >
            <SelectTrigger className="mt-3 h-11! w-full md:w-80" aria-label="Exercise">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {exercises.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {cur && (
            <div className="mt-4 min-w-0">
              <p className="text-sm font-medium">{METRIC_LABEL[cur.metric]}</p>
              {cur.metric !== 'e1rm' && <p className="text-muted-foreground text-sm">These sets are too far from a max to estimate a 1-rep max.</p>}
              <TrendLine data={cur.trend} unit={cur.metric === 'reps' ? 'reps' : unit} label={`${cur.name}, ${METRIC_LABEL[cur.metric].toLowerCase()}`} height={160} />
              <ul className="num mt-3 divide-y text-sm">
                {rows.map((r) => (
                  <li key={r.date} className="py-2.5">
                    <p className="font-medium">{prettyDate(r.date)}</p>
                    <p className="text-muted-foreground">{r.text}</p>
                    <p className="text-muted-foreground">RIR {r.rir}</p>
                  </li>
                ))}
              </ul>
              {cur.rows.length > SHOWN_ROWS && (
                <Button variant="ghost" className="mt-1 w-full" onClick={() => setAll(!all)}>
                  {all ? 'Show less' : `Show all ${cur.rows.length} days`}
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
