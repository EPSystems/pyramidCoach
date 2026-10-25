'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, GripVertical, Medal, Moon } from 'lucide-react';
import { toast } from 'sonner';
import { moveSession } from '@/lib/actions/training';
import { prettyDate } from '@/lib/utils/dates';
import { cn } from '@/lib/utils';
import { MoveSessionDialog } from '../today/actions-ui';

export interface DayCell {
  date: string;
  isToday: boolean;
  isPast: boolean;
  sessions: { id: string; title: string; status: string; kind: string; est: number | null; templateKey: string; exercises: number }[];
  sports: { name: string; intensity: string; minutes: number }[];
  sportLogs: { name: string; minutes: number; rpe: number | null }[];
}

const STATUS: Record<string, string> = { planned: 'Planned', in_progress: 'In progress', done: 'Done', skipped: 'Skipped', moved: 'Moved' };

export function WeekBoard({ days, today }: { days: DayCell[]; today: string }) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overDate, setOverDate] = useState<string | null>(null);
  const [, start] = useTransition();
  const router = useRouter();

  const drop = (date: string) => {
    const id = dragId;
    setDragId(null);
    setOverDate(null);
    if (!id) return;
    start(async () => {
      let r = await moveSession(id, date, false);
      if (r.ok && r.data?.warnings.length) {
        if (!window.confirm(`${r.data.warnings.join('\n')}\n\nOK anyway?`)) return;
        r = await moveSession(id, date, true);
      }
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(`Moved to ${prettyDate(date)}`);
        router.refresh();
      }
    });
  };

  const futureDates = days.map((d) => d.date).filter((d) => d >= today);

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
      <ol className="grid min-w-[44rem] grid-cols-7 gap-2 lg:min-w-0">
        {days.map((d) => {
          const isRest = d.sessions.length === 0 && d.sports.length === 0;
          return (
            <li
              key={d.date}
              onDragOver={(e) => {
                if (dragId && !d.isPast) {
                  e.preventDefault();
                  setOverDate(d.date);
                }
              }}
              onDragLeave={() => setOverDate(null)}
              onDrop={() => drop(d.date)}
              className={cn(
                'bg-card flex min-h-44 flex-col gap-2 rounded-2xl border p-2.5 transition-colors',
                d.isToday && 'border-volt shadow-[0_0_0_1px_var(--volt)]',
                d.isPast && 'opacity-70',
                overDate === d.date && 'bg-accent',
              )}
            >
              <p className={cn('stamp', d.isToday ? 'text-volt' : 'text-muted-foreground')}>{prettyDate(d.date)}</p>
              {d.sessions.map((s) => {
                const missed = d.isPast && s.status === 'planned';
                return (
                  <div
                    key={s.id}
                    draggable={s.status === 'planned'}
                    onDragStart={() => setDragId(s.id)}
                    className={cn(
                      'group relative rounded-xl p-2 text-sm',
                      s.status === 'done' ? 'bg-volt/15' : missed ? 'bg-danger/10' : s.status === 'skipped' ? 'bg-muted line-through opacity-60' : 'bg-muted',
                      s.status === 'planned' && 'cursor-grab active:cursor-grabbing',
                    )}
                  >
                    <Link href={`/session/${s.id}`} className="block font-semibold leading-tight underline-offset-2 hover:underline">
                      {s.title}
                    </Link>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {missed ? 'Missed' : STATUS[s.status]} · ~{s.est}m{s.kind !== 'lift' ? ` · ${s.kind}` : ''}
                    </p>
                    {s.status === 'done' && <Check className="text-volt absolute top-2 right-2 size-4" />}
                    {s.status === 'planned' && <GripVertical className="text-muted-foreground absolute top-2 right-1.5 hidden size-4 lg:block" />}
                    {s.status === 'planned' && (
                      <div className="mt-1.5 lg:hidden [&_button]:h-8 [&_button]:w-full [&_button]:px-2 [&_button]:text-xs">
                        <MoveSessionDialog sessionId={s.id} title={s.title} dates={futureDates.filter((x) => x !== d.date)} triggerLabel="Move" />
                      </div>
                    )}
                  </div>
                );
              })}
              {d.sports.map((sp) => (
                <div key={sp.name} className="border-chart-2/40 text-chart-2 rounded-xl border border-dashed p-2 text-xs">
                  <p className="flex items-center gap-1 font-semibold">
                    <Medal className="size-3.5" /> {sp.name.split(' ')[0]}
                  </p>
                  <p className="opacity-80">
                    {sp.intensity} · {sp.minutes}m
                  </p>
                </div>
              ))}
              {d.sportLogs.map((l, i) => (
                <p key={i} className="text-muted-foreground text-xs">
                  ✓ {l.name.split(' ')[0]} {l.minutes}m{l.rpe ? ` @${l.rpe}` : ''}
                </p>
              ))}
              {isRest && (
                <p className="text-muted-foreground mt-auto flex items-center gap-1 text-xs">
                  <Moon className="size-3.5" /> Rest
                </p>
              )}
            </li>
          );
        })}
      </ol>
      <p className="text-muted-foreground mt-2 hidden text-xs lg:block">Drag a planned session to another day to move it.</p>
    </div>
  );
}
