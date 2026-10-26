'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, ChevronDown, EllipsisVertical, Flame, Minus, Plus, Repeat2, SkipForward, StickyNote, Timer, TrendingDown, TrendingUp, Trophy, X } from 'lucide-react';
import { toast } from 'sonner';
import { addSetToExercise, addSoreness, deleteSet, finishSession, logSet, saveExerciseNote, skipExercise, swapExercise } from '@/lib/actions/training';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Why } from '@/components/app/bits';
import { formatRx, showRirHint } from '@/lib/engine/prescription';
import { e1rm } from '@/lib/engine/e1rm';
import { nudgeLoad } from '@/lib/engine/progression';
import type { ExerciseMuscle, MuscleId } from '@/lib/engine/types';
import { MUSCLE_SHORT } from '@/lib/knowledge/muscles';
import { fmtLoad, fromDisplay, toDisplay, type Units } from '@/lib/utils/units';
import { cn } from '@/lib/utils';
import { createLogger } from '@/lib/log';

const log = createLogger('session/logger');

export interface LoggerExercise {
  plannedId: string;
  exerciseId: string;
  name: string;
  slug: string;
  category: string;
  muscles: ExerciseMuscle[];
  sets: number;
  rx: { repMin: number; repMax: number; rirMin: number; rirMax: number };
  restSeconds: number;
  isSingle: boolean;
  note: string | null;
  skipped: boolean;
  ruleIds: string[];
  increment: number;
  suggestion: { load: number | null; repsTarget: number; hint: string | null };
  last: { date: string; sets: { load: number | null; reps: number }[] } | null;
  bestE1rm: number | null;
  warmup: { load: number; reps: number }[];
  logged: { setIndex: number; load: number | null; reps: number; rir: number | null }[];
  subs: { id: string; name: string }[];
}

interface Row {
  load: number | null;
  reps: number;
  rir: number | null;
  logged: boolean;
}

const defaultRir = (rx: LoggerExercise['rx'], i: number) => Math.max(rx.rirMin, rx.rirMax - i);

function initRows(ex: LoggerExercise): Row[] {
  const n = Math.max(ex.sets, ...ex.logged.map((l) => l.setIndex + 1), 0);
  const rows: Row[] = [];
  let carryLoad = ex.suggestion.load;
  let carryReps = ex.suggestion.repsTarget;
  for (let i = 0; i < n; i++) {
    const l = ex.logged.find((x) => x.setIndex === i);
    if (l) {
      rows.push({ load: l.load, reps: l.reps, rir: l.rir, logged: true });
      carryLoad = l.load;
      carryReps = Math.max(ex.rx.repMin - 1, l.reps);
    } else rows.push({ load: carryLoad, reps: carryReps, rir: defaultRir(ex.rx, i), logged: false });
  }
  return rows;
}

function useRestTimer() {
  const [rest, setRest] = useState<{ start: number; target: number; name: string } | null>(null);
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!rest) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [rest]);
  return { rest, elapsed: rest ? Math.max(0, Math.floor((now - rest.start) / 1000)) : 0, start: (target: number, name: string) => { setNow(Date.now()); setRest({ start: Date.now(), target, name }); }, stop: () => setRest(null) };
}
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export function Logger({ session, exercises, units }: { session: { id: string; title: string; status: string; date: string; kind: string; estMinutes: number | null }; exercises: LoggerExercise[]; units: Units }) {
  const timer = useRestTimer();
  const [rows, setRows] = useState<Record<string, Row[]>>(() => Object.fromEntries(exercises.map((e) => [e.plannedId + e.exerciseId, initRows(e)])));
  const [finishing, setFinishing] = useState(false);
  const router = useRouter();

  const totalSets = exercises.filter((e) => !e.skipped).reduce((a, e) => a + (rows[e.plannedId + e.exerciseId]?.length ?? 0), 0);
  const doneSets = exercises.reduce((a, e) => a + (rows[e.plannedId + e.exerciseId]?.filter((r) => r.logged).length ?? 0), 0);

  return (
    <div className="mx-auto max-w-3xl pb-28">
      <header className="bg-background/90 sticky top-0 z-30 border-b px-4 py-3 backdrop-blur sm:px-6">
        <div className="flex items-center gap-3">
          <Link href="/today" className="bg-muted grid size-11 shrink-0 place-items-center rounded-lg" aria-label="Back to Today">
            <ArrowLeft className="size-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="stamp text-muted-foreground">
              {session.kind === 'deload' ? 'Deload · ' : session.kind === 'intro' ? 'Intro week · ' : ''}
              {doneSets}/{totalSets} sets
            </p>
            <h1 className="font-display truncate text-2xl leading-tight font-extrabold uppercase">{session.title}</h1>
          </div>
          <Button onClick={() => setFinishing(true)} variant={doneSets === totalSets && totalSets > 0 ? 'default' : 'outline'}>
            Finish
          </Button>
        </div>
        <div className="bg-muted mt-2 h-1 overflow-hidden rounded-full">
          <div className="bg-volt h-full transition-all" style={{ width: `${totalSets ? (doneSets / totalSets) * 100 : 0}%` }} />
        </div>
      </header>

      <div className="rise space-y-4 px-4 pt-4 sm:px-6">
        {exercises.map((ex) => (
          <ExerciseCard
            key={ex.plannedId + ex.exerciseId}
            ex={ex}
            rows={rows[ex.plannedId + ex.exerciseId] ?? []}
            setRows={(r) => setRows((all) => ({ ...all, [ex.plannedId + ex.exerciseId]: typeof r === 'function' ? r(all[ex.plannedId + ex.exerciseId] ?? []) : r }))}
            sessionId={session.id}
            units={units}
            onLogged={() => timer.start(ex.restSeconds, ex.name)}
            onChanged={() => router.refresh()}
          />
        ))}
      </div>

      {timer.rest && (
        <button
          type="button"
          onClick={timer.stop}
          className={cn(
            'fixed inset-x-3 bottom-20 z-40 flex items-center gap-3 rounded-2xl border px-4 py-3 text-left shadow-lg backdrop-blur lg:bottom-6 lg:left-auto lg:w-80',
            timer.elapsed >= timer.rest.target ? 'bg-volt text-volt-ink border-transparent' : 'bg-card/95',
          )}
          aria-live="polite"
          aria-label="Rest timer, tap to dismiss"
        >
          <Timer className="size-5 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="stamp block opacity-70">Rest · {timer.rest.name}</span>
            <span className="num font-display text-2xl font-bold">
              {mmss(timer.elapsed)} <span className="text-base opacity-60">/ {mmss(timer.rest.target)}</span>
            </span>
          </span>
          <X className="size-4 opacity-60" />
        </button>
      )}

      <FinishDialog open={finishing} onOpenChange={setFinishing} session={session} exercises={exercises} rows={rows} units={units} />
    </div>
  );
}

function ExerciseCard({
  ex,
  rows,
  setRows,
  sessionId,
  units,
  onLogged,
  onChanged,
}: {
  ex: LoggerExercise;
  rows: Row[];
  setRows: (r: Row[] | ((prev: Row[]) => Row[])) => void;
  sessionId: string;
  units: Units;
  onLogged: () => void;
  onChanged: () => void;
}) {
  const [skipped, setSkipped] = useState(ex.skipped);
  const [swapOpen, setSwapOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [, start] = useTransition();
  const firstLogged = rows[0]?.logged;
  const allDone = rows.length > 0 && rows.every((r) => r.logged);

  const patch = (i: number, p: Partial<Row>) => setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...p } : r)));

  const nudgeAll = (dir: 1 | -1) =>
    setRows((prev) => prev.map((r) => (r.logged ? r : { ...r, load: nudgeLoad(r.load, ex.increment, dir) })));

  // Set indexes with a save or delete in flight. The ref blocks a double tap before React re-renders; the state disables the button.
  const inFlight = useRef(new Set<number>());
  const [saving, setSaving] = useState<ReadonlySet<number>>(new Set());
  const markSaving = (i: number, on: boolean) => {
    if (on) inFlight.current.add(i);
    else inFlight.current.delete(i);
    setSaving(new Set(inFlight.current));
  };

  async function toggle(i: number) {
    if (inFlight.current.has(i)) return;
    const r = rows[i];
    markSaving(i, true);
    try {
      if (r.logged) await undoSet(i);
      else await saveSet(i, r);
    } finally {
      markSaving(i, false);
    }
  }

  async function undoSet(i: number) {
    patch(i, { logged: false });
    // A thrown action (network drop, server crash) is treated like a failed result: revert and tell the user.
    const res = await deleteSet(ex.plannedId, i).catch((e: unknown) => {
      log.error('deleteSet threw', { plannedExerciseId: ex.plannedId, setIndex: i, err: e });
      return { ok: false as const, error: 'Could not undo that set. Check your connection and try again.' };
    });
    if (!res.ok) {
      log.warn('deleteSet failed', { plannedExerciseId: ex.plannedId, setIndex: i, error: res.error });
      patch(i, { logged: true });
      toast.error(res.error);
    }
  }

  async function saveSet(i: number, r: Row) {
    patch(i, { logged: true });
    onLogged();
    const res = await logSet({ sessionId, plannedExerciseId: ex.plannedId, exerciseId: ex.exerciseId, setIndex: i, loadKg: r.load, reps: r.reps, rir: r.rir, rx: ex.rx, increment: ex.increment }).catch((e: unknown) => {
      log.error('logSet threw', { sessionId, plannedExerciseId: ex.plannedId, setIndex: i, err: e });
      return { ok: false as const, error: 'Could not save that set. Check your connection and try again.', data: undefined };
    });
    if (!res.ok) {
      log.warn('logSet failed', { sessionId, plannedExerciseId: ex.plannedId, setIndex: i, error: res.error });
      patch(i, { logged: false });
      toast.error(res.error);
      return;
    }
    const next = res.data!.next;
    setRows((prev) =>
      prev.map((row, j) => {
        if (j <= i || row.logged) return row;
        // After set 1 the corrected load applies to all remaining sets (T-PRG-03); later sets carry forward.
        if (i === 0 || j === i + 1) return { ...row, load: next.load, reps: next.repsTarget };
        return row;
      }),
    );
    if (i === 0 && next.ruleIds.includes('T-PRG-03') && next.load !== r.load) {
      toast(`Next sets: ${fmtLoad(next.load, units)} × ${next.repsTarget}`, { description: 'Adjusted ~4% per rep outside your range (T-PRG-03).' });
    }
  }

  return (
    <section className={cn('bg-card overflow-hidden rounded-2xl border transition-opacity', skipped && 'opacity-50', allDone && 'border-volt/40')}>
      <div className="flex items-start gap-2 px-4 pt-4">
        <div className="min-w-0 flex-1">
          <Link href={`/library/${ex.slug}`} className="font-display text-2xl leading-tight font-bold uppercase underline-offset-4 hover:underline">
            {ex.name}
          </Link>
          <p className="num text-muted-foreground mt-0.5 text-sm">
            {ex.isSingle ? (ex.note ?? 'Top single') : formatRx({ sets: rows.length, ...ex.rx })} · rest {mmss(ex.restSeconds)}
          </p>
          <p className="num text-muted-foreground text-sm">
            {ex.last ? `Last: ${fmtLoad(ex.last.sets[0]?.load, units)} × ${ex.last.sets.map((s) => s.reps).join(', ')}` : ex.suggestion.hint ?? 'First time: pick a weight you can control.'}
          </p>
        </div>
        <Why ruleIds={ex.ruleIds} className="mt-1" />
        <DropdownMenu>
          <DropdownMenuTrigger className="text-muted-foreground hover:bg-muted grid size-11 place-items-center rounded-lg" aria-label="Exercise menu">
            <EllipsisVertical className="size-5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setSwapOpen(true)} disabled={!ex.subs.length}>
              <Repeat2 /> Swap exercise
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                start(async () => {
                  const added = rows.length;
                  setRows((prev) => [...prev, { ...(prev[prev.length - 1] ?? { load: ex.suggestion.load, reps: ex.suggestion.repsTarget, rir: ex.rx.rirMin }), logged: false }]);
                  const res = await addSetToExercise(ex.plannedId).catch((e: unknown) => {
                    log.error('addSetToExercise threw', { plannedExerciseId: ex.plannedId, err: e });
                    return { ok: false as const, error: 'Could not add a set. Check your connection and try again.' };
                  });
                  if (!res.ok) {
                    log.warn('addSetToExercise failed', { plannedExerciseId: ex.plannedId, error: res.error });
                    // Drop the optimistic row, unless the user already logged into it.
                    setRows((prev) => (prev[added] && !prev[added].logged ? prev.filter((_, j) => j !== added) : prev));
                    toast.error(res.error);
                  }
                })
              }
            >
              <Plus /> Add set
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                start(async () => {
                  const next = !skipped;
                  setSkipped(next);
                  const res = await skipExercise(ex.plannedId, next).catch((e: unknown) => {
                    log.error('skipExercise threw', { plannedExerciseId: ex.plannedId, skipped: next, err: e });
                    return { ok: false as const, error: 'Could not update the exercise. Check your connection and try again.' };
                  });
                  if (!res.ok) {
                    log.warn('skipExercise failed', { plannedExerciseId: ex.plannedId, skipped: next, error: res.error });
                    setSkipped(!next);
                    toast.error(res.error);
                  }
                })
              }
            >
              <SkipForward /> {skipped ? 'Un-skip' : 'Skip exercise'}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setNoteOpen(true)}>
              <StickyNote /> Note
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {ex.note && !ex.isSingle && <p className="text-muted-foreground px-4 pt-1 text-xs italic">{ex.note}</p>}

      {ex.warmup.length > 0 && (
        <details className="group mx-4 mt-3 rounded-lg border border-dashed px-3 py-2 text-sm">
          <summary className="flex cursor-pointer list-none items-center gap-2 font-medium">
            <Flame className="text-warn size-4" /> Warm-up ramp <ChevronDown className="ml-auto size-4 transition-transform group-open:rotate-180" />
          </summary>
          <p className="text-muted-foreground mt-1 text-xs">General warm-up first, then:</p>
          <ul className="num mt-1 space-y-0.5">
            {ex.warmup.map((w, i) => (
              <li key={i}>
                {fmtLoad(w.load, units)} × {w.reps}
              </li>
            ))}
          </ul>
          <Why ruleIds={['T-WUP-01']} className="mt-2" />
        </details>
      )}

      {/* Rendered even before a load exists so entering the first weight doesn't shift the rows under the user's thumb. */}
      {!firstLogged && !skipped && !ex.isSingle && (
        <div className="flex gap-2 px-4 pt-3">
          <button type="button" disabled={rows[0]?.load == null} onClick={() => nudgeAll(1)} className="bg-muted inline-flex h-9 items-center gap-1 rounded-full px-3 text-xs font-medium disabled:opacity-40">
            <TrendingUp className="text-ok size-3.5" /> Feeling strong +1 step
          </button>
          <button type="button" disabled={rows[0]?.load == null} onClick={() => nudgeAll(-1)} className="bg-muted inline-flex h-9 items-center gap-1 rounded-full px-3 text-xs font-medium disabled:opacity-40">
            <TrendingDown className="text-warn size-3.5" /> Feeling flat −1 step
          </button>
        </div>
      )}

      <ol className="mt-3 divide-y border-t">
        {rows.map((r, i) => (
          // Mobile: steppers on line 1, RIR + log button on line 2 (one line was ~390px wide and clipped the log button). sm+: log button returns to line 1.
          <li key={i} className={cn('flex flex-wrap items-center gap-2 px-3 py-3 sm:px-4', r.logged && 'bg-volt/[0.06]')}>
            <div className="flex min-w-0 basis-full items-center gap-2 sm:flex-1 sm:basis-auto">
              <span className="num text-muted-foreground w-5 shrink-0 text-center text-sm font-semibold">{i + 1}</span>
              <LoadInput key={`${r.load}-${units}`} value={r.load} units={units} step={ex.increment} disabled={r.logged} onChange={(v) => patch(i, { load: v })} />
              <span className="text-muted-foreground text-sm">×</span>
              <div className="flex items-center">
                <button type="button" disabled={r.logged} onClick={() => patch(i, { reps: Math.max(0, r.reps - 1) })} className="bg-muted grid size-11 place-items-center rounded-l-lg disabled:opacity-40" aria-label={`Set ${i + 1} fewer reps`}>
                  <Minus className="size-4" />
                </button>
                <output className="num bg-muted/50 grid h-11 w-10 place-items-center text-lg font-semibold" aria-label={`Set ${i + 1} reps`}>
                  {r.reps}
                </output>
                <button type="button" disabled={r.logged} onClick={() => patch(i, { reps: r.reps + 1 })} className="bg-muted grid size-11 place-items-center rounded-r-lg disabled:opacity-40" aria-label={`Set ${i + 1} more reps`}>
                  <Plus className="size-4" />
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void toggle(i)}
              disabled={skipped || saving.has(i)}
              aria-busy={saving.has(i)}
              aria-pressed={r.logged}
              aria-label={r.logged ? `Undo set ${i + 1}` : `Log set ${i + 1}`}
              className={cn(
                'order-3 ml-auto grid size-12 shrink-0 place-items-center rounded-xl border-2 transition-all sm:order-2',
                r.logged ? 'bg-volt text-volt-ink border-volt pop' : 'border-volt/60 text-volt hover:bg-volt/10',
              )}
            >
              <Check className="size-6" strokeWidth={3} />
            </button>
            <div className="order-2 flex items-center gap-1.5 sm:order-3 sm:basis-full sm:pl-7">
              <span className="stamp text-muted-foreground mr-1">RIR</span>
              {[0, 1, 2, 3, 4].map((v) => (
                <button
                  key={v}
                  type="button"
                  disabled={r.logged}
                  onClick={() => patch(i, { rir: v })}
                  aria-pressed={r.rir === v}
                  className={cn(
                    'num h-8 min-w-9 rounded-md px-2 text-sm font-semibold transition-colors disabled:opacity-60',
                    r.rir === v ? 'bg-foreground text-background' : v >= ex.rx.rirMin && v <= ex.rx.rirMax ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground',
                  )}
                >
                  {v === 4 ? '4+' : v}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ol>
      {showRirHint(ex.rx.repMax) && <p className="text-muted-foreground px-4 py-2 text-xs">Most people have ~1 more rep than they think. <Why ruleIds={['T-RIR-01']} /></p>}

      <SwapDialog open={swapOpen} onOpenChange={setSwapOpen} ex={ex} onDone={onChanged} />
      <NoteDialog open={noteOpen} onOpenChange={setNoteOpen} ex={ex} />
    </section>
  );
}

function LoadInput({ value, units, step, disabled, onChange }: { value: number | null; units: Units; step: number; disabled: boolean; onChange: (kg: number | null) => void }) {
  const [text, setText] = useState(value == null ? '' : String(toDisplay(value, units)));
  return (
    <div className="flex min-w-0 flex-1 items-center sm:flex-none">
      <button type="button" disabled={disabled} onClick={() => onChange(nudgeLoad(value ?? 0, step, -1))} className="bg-muted grid size-11 place-items-center rounded-l-lg disabled:opacity-40" aria-label="Less weight">
        <Minus className="size-4" />
      </button>
      <Input
        inputMode="decimal"
        disabled={disabled}
        value={text}
        placeholder={units}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => onChange(text.trim() === '' ? null : fromDisplay(Number(text), units))}
        className="num h-11 min-w-0 flex-1 rounded-none sm:w-16 sm:flex-none border-x-0 px-1 text-center text-lg font-semibold disabled:opacity-100"
        aria-label={`Weight in ${units}`}
      />
      <button type="button" disabled={disabled} onClick={() => onChange(nudgeLoad(value ?? 0, step, 1))} className="bg-muted grid size-11 place-items-center rounded-r-lg disabled:opacity-40" aria-label="More weight">
        <Plus className="size-4" />
      </button>
    </div>
  );
}

function SwapDialog({ open, onOpenChange, ex, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; ex: LoggerExercise; onDone: () => void }) {
  const [pick, setPick] = useState<string | null>(null);
  const [block, setBlock] = useState(false);
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display text-2xl uppercase">Swap {ex.name}</DialogTitle>
          <DialogDescription>Same main muscle, filtered for your equipment and injuries. The prescription stays the same.</DialogDescription>
        </DialogHeader>
        <div className="max-h-72 space-y-1.5 overflow-y-auto">
          {ex.subs.map((s) => (
            <button key={s.id} type="button" onClick={() => setPick(s.id)} className={cn('flex h-12 w-full items-center rounded-lg px-3 text-left font-medium', pick === s.id ? 'bg-volt text-volt-ink' : 'bg-muted')}>
              {s.name}
            </button>
          ))}
        </div>
        <label className="flex items-center justify-between gap-3 text-sm">
          Swap for the rest of the block
          <Switch checked={block} onCheckedChange={setBlock} />
        </label>
        <DialogFooter>
          <Button
            disabled={!pick || pending}
            onClick={() =>
              start(async () => {
                const r = await swapExercise(ex.plannedId, pick!, block ? 'block' : 'session');
                if (!r.ok) toast.error(r.error);
                else {
                  toast.success(block ? 'Swapped for the rest of the block' : 'Swapped for this session');
                  onOpenChange(false);
                  onDone();
                }
              })
            }
          >
            Swap
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NoteDialog({ open, onOpenChange, ex }: { open: boolean; onOpenChange: (o: boolean) => void; ex: LoggerExercise }) {
  const [note, setNote] = useState(ex.isSingle ? '' : (ex.note ?? ''));
  const [saving, setSaving] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display text-2xl uppercase">Note</DialogTitle>
        </DialogHeader>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Seat height, grip, how it felt…" />
        <DialogFooter>
          <Button
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              const res = await saveExerciseNote(ex.plannedId, note).catch((e: unknown) => {
                log.error('saveExerciseNote threw', { plannedExerciseId: ex.plannedId, err: e });
                return { ok: false as const, error: 'Could not save the note. Check your connection and try again.' };
              });
              setSaving(false);
              // Keep the dialog open on failure so the typed note isn't lost.
              if (!res.ok) return void toast.error(res.error);
              toast.success('Note saved');
              onOpenChange(false);
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FinishDialog({
  open,
  onOpenChange,
  session,
  exercises,
  rows,
  units,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  session: { id: string };
  exercises: LoggerExercise[];
  rows: Record<string, Row[]>;
  units: Units;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [sore, setSore] = useState<Partial<Record<MuscleId, 'sore'>>>({});
  const summary = useMemo(() => {
    let done = 0;
    let planned = 0;
    const muscles: Partial<Record<MuscleId, number>> = {};
    const prs: { name: string; e1rm: number; load: number | null; reps: number }[] = [];
    for (const ex of exercises) {
      const rs = rows[ex.plannedId + ex.exerciseId] ?? [];
      if (!ex.skipped) planned += rs.length;
      let best = 0;
      let bestRow: Row | null = null;
      for (const r of rs.filter((x) => x.logged)) {
        done++;
        if (r.reps >= 4 && (r.rir == null || r.rir <= 4)) {
          for (const m of ex.muscles) muscles[m.muscle] = (muscles[m.muscle] ?? 0) + (m.role === 'primary' ? 1 : 0.5);
        }
        const v = e1rm(r.load, r.reps, r.rir) ?? 0;
        if (v > best) {
          best = v;
          bestRow = r;
        }
      }
      if (bestRow && ex.bestE1rm != null && best > ex.bestE1rm + 0.05) prs.push({ name: ex.name, e1rm: best, load: bestRow.load, reps: bestRow.reps });
    }
    return { done, planned, muscles, prs };
  }, [exercises, rows]);
  const trained = Object.keys(summary.muscles) as MuscleId[];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-3xl uppercase">Session summary</DialogTitle>
          <DialogDescription className="num">
            {summary.done} of {summary.planned} planned sets done.
          </DialogDescription>
        </DialogHeader>
        {summary.prs.length > 0 && (
          <div className="bg-accent text-accent-foreground space-y-1 rounded-xl p-3">
            {summary.prs.map((p) => (
              <p key={p.name} className="flex items-center gap-2 text-sm font-semibold">
                <Trophy className="size-4" /> e1RM PR · {p.name}: {fmtLoad(p.e1rm, units)} ({fmtLoad(p.load, units)} × {p.reps})
              </p>
            ))}
          </div>
        )}
        <div>
          <p className="stamp text-muted-foreground mb-1">Sets added this week <Why ruleIds={['T-VOL-05', 'T-VOL-06']} /></p>
          <div className="num grid grid-cols-2 gap-x-4 text-sm">
            {trained.map((m) => (
              <p key={m} className="flex justify-between">
                <span>{MUSCLE_SHORT[m]}</span>
                <span className="font-semibold">+{summary.muscles[m]}</span>
              </p>
            ))}
            {!trained.length && <p className="text-muted-foreground">No counted sets yet.</p>}
          </div>
        </div>
        {trained.length > 0 && (
          <div>
            <p className="text-sm font-medium">Anything sore now?</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {trained.map((m) => (
                <button key={m} type="button" aria-pressed={!!sore[m]} onClick={() => setSore((s) => (s[m] ? Object.fromEntries(Object.entries(s).filter(([k]) => k !== m)) : { ...s, [m]: 'sore' }))} className={cn('h-9 rounded-full px-3 text-sm', sore[m] ? 'bg-warn/20 text-warn' : 'bg-muted')}>
                  {MUSCLE_SHORT[m]}
                </button>
              ))}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button
            size="lg"
            className="w-full"
            disabled={pending}
            onClick={() =>
              start(async () => {
                if (Object.keys(sore).length) {
                  const s = await addSoreness(sore);
                  if (!s.ok) log.warn('addSoreness failed, finishing anyway', { sessionId: session.id, error: s.error });
                }
                const r = await finishSession(session.id);
                if (!r.ok) return void toast.error(r.error);
                toast.success('Session saved. Nice work.');
                router.push('/today');
              })
            }
          >
            Finish session
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
