'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { TrendLine } from '@/components/app/charts';
import { prettyDate } from '@/lib/utils/dates';
import { cn } from '@/lib/utils';

export interface HistoryExercise {
  id: string;
  name: string;
  rows: { date: string; text: string; rir: string }[];
  trend: { x: string; y: number }[];
}

export function ExerciseHistory({ exercises }: { exercises: HistoryExercise[] }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string | null>(exercises[0]?.id ?? null);
  const list = useMemo(() => exercises.filter((e) => e.name.toLowerCase().includes(q.toLowerCase())), [q, exercises]);
  const cur = exercises.find((e) => e.id === sel);
  return (
    <section className="bg-card rounded-2xl border p-5">
      <h2 className="font-display text-2xl font-bold uppercase">Any exercise</h2>
      {exercises.length === 0 ? (
        <p className="text-muted-foreground py-6 text-sm">Your logged exercises will show up here.</p>
      ) : (
        <div className="mt-3 grid gap-4 md:grid-cols-[14rem_1fr]">
          <div>
            <div className="relative">
              <Search className="text-muted-foreground absolute top-3 left-3 size-4" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="h-10 pl-9" aria-label="Search exercises" />
            </div>
            <ul className="mt-2 max-h-64 overflow-y-auto">
              {list.map((e) => (
                <li key={e.id}>
                  <button type="button" onClick={() => setSel(e.id)} className={cn('h-10 w-full truncate rounded-lg px-2 text-left text-sm', sel === e.id ? 'bg-accent text-accent-foreground font-semibold' : 'hover:bg-muted')}>
                    {e.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          {cur && (
            <div className="min-w-0">
              <p className="text-sm font-semibold">{cur.name} · first-set e1RM</p>
              <TrendLine data={cur.trend} unit="" label={`${cur.name} first set`} height={150} />
              <table className="num mt-3 w-full text-sm">
                <thead className="text-muted-foreground text-left text-xs">
                  <tr>
                    <th className="py-1 font-medium">Date</th>
                    <th className="font-medium">Sets</th>
                    <th className="text-right font-medium">RIR</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {cur.rows.slice(0, 12).map((r) => (
                    <tr key={r.date}>
                      <td className="py-1.5 pr-2 whitespace-nowrap">{prettyDate(r.date)}</td>
                      <td>{r.text}</td>
                      <td className="text-muted-foreground text-right">{r.rir}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
