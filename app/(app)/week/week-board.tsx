'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, CircleSlash, GripVertical, Medal, Moon, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { moveSession, skipSession, unskipSession } from '@/lib/actions/training';
import { Button } from '@/components/ui/button';
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
  const [pending, start] = useTransition();
  const router = useRouter();

  const move = (id: string, date: string, force: boolean) =>
    start(async () => {
      const r = await moveSession(id, date, force);
      if (!r.ok) return void toast.error(r.error);
      // Legs near a leg-heavy sport: ask in the toast instead of a blocking browser dialog.
      if (r.data?.warnings.length) {
        return void toast.warning(r.data.warnings.join(' · '), { action: { label: 'Move anyway', onClick: () => move(id, date, true) } });
      }
      toast.success(`Moved to ${prettyDate(date)}`);
      router.refresh();
    });

  const drop = (date: string) => {
    const id = dragId;
    setDragId(null);
    setOverDate(null);
    if (id) move(id, date, false);
  };

  // No confirmation dialog: skipping is one tap, the toast offers Undo and the card keeps an Unskip button.
  const unskip = (id: string) =>
    start(async () => {
      const r = await unskipSession(id);
      if (!r.ok) return void toast.error(r.error);
      toast.success('Back on the plan');
      router.refresh();
    });
  const skip = (id: string, title: string) =>
    start(async () => {
      const r = await skipSession(id);
      if (!r.ok) return void toast.error(r.error);
      toast(`${title} skipped`, { description: 'The skip stays when the plan is rebuilt.', action: { label: 'Undo', onClick: () => unskip(id) } });
      router.refresh();
    });

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
                      s.status === 'done' ? 'bg-volt/15' : missed ? 'bg-danger/10' : 'bg-muted',
                      s.status === 'planned' && 'cursor-grab active:cursor-grabbing',
                    )}
                  >
                    <Link href={`/session/${s.id}`} className={cn('block font-semibold leading-tight underline-offset-2 hover:underline', s.status === 'skipped' && 'line-through opacity-60')}>
                      {s.title}
                    </Link>
                    <p className={cn('text-muted-foreground mt-0.5 text-xs', s.status === 'skipped' && 'opacity-60')}>
                      {missed ? 'Missed' : STATUS[s.status]} · ~{s.est}m{s.kind !== 'lift' ? ` · ${s.kind}` : ''}
                    </p>
                    {s.status === 'done' && <Check className="text-volt absolute top-2 right-2 size-4" />}
                    {s.status === 'planned' && <GripVertical className="text-muted-foreground absolute top-2 right-1.5 hidden size-4 lg:block" />}
                    {(s.status === 'planned' || (s.status === 'skipped' && !d.isPast)) && (
                      <div className="mt-1.5 flex flex-col gap-1 [&_button]:h-8 [&_button]:w-full [&_button]:px-2 [&_button]:text-xs">
                        {s.status === 'planned' && (
                          <div className="lg:hidden">
                            <MoveSessionDialog sessionId={s.id} title={s.title} dates={futureDates.filter((x) => x !== d.date)} triggerLabel="Move" />
                          </div>
                        )}
                        {s.status === 'planned' && !d.isPast && (
                          <Button variant="ghost" className="text-muted-foreground justify-start" disabled={pending} onClick={() => skip(s.id, s.title)}>
                            <CircleSlash /> Skip
                          </Button>
                        )}
                        {s.status === 'skipped' && (
                          <Button variant="ghost" className="justify-start" disabled={pending} onClick={() => unskip(s.id)}>
                            <Undo2 /> Unskip
                          </Button>
                        )}
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
      <p className="text-muted-foreground mt-2 hidden text-xs lg:block">Drag a planned session to another day to move it. Moves and skips stay when the plan is rebuilt.</p>
    </div>
  );
}
