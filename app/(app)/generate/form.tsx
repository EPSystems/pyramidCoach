'use client';

import { useState, useTransition } from 'react';
import { unstable_rethrow } from 'next/navigation';
import { Play, Save, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { previewWorkout, saveWorkout, type ExistingSession, type GenFormInput, type GenPreview } from '@/lib/actions/generate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BodyMap } from '@/components/app/body-map';
import { Chip, Segmented, Why } from '@/components/app/bits';
import { TRACKED_MUSCLES, type Equipment, type MuscleId, type TrackedMuscle } from '@/lib/engine/types';
import { MUSCLE_SHORT } from '@/lib/knowledge/muscles';
import { addDays } from '@/lib/engine/util';
import { prettyDate } from '@/lib/utils/dates';
import { fmtLoad, type Units } from '@/lib/utils/units';
import { createLogger } from '@/lib/log';

const log = createLogger('generate/form');

const EQ: Equipment[] = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'band', 'sled'];

const STATUS_LABEL: Record<string, string> = { planned: 'planned', in_progress: 'in progress', done: 'done' };

export function GenerateForm({ initialMuscle, units, today }: { initialMuscle: TrackedMuscle | null; units: Units; today: string }) {
  const [minutes, setMinutes] = useState<GenFormInput['minutes']>(45);
  const [preset, setPreset] = useState<GenFormInput['preset']>('full');
  const [equipment, setEquipment] = useState<Equipment[]>(['dumbbell', 'bodyweight']);
  const [focusMode, setFocusMode] = useState<'auto' | 'upper' | 'lower' | 'full' | 'pick'>(initialMuscle ? 'pick' : 'auto');
  const [picked, setPicked] = useState<TrackedMuscle[]>(initialMuscle ? [initialMuscle] : []);
  const [readiness, setReadiness] = useState<'normal' | 'tired'>('normal');
  const [date, setDate] = useState(today);
  const [onExisting, setOnExisting] = useState<'add' | 'replace' | null>(null);
  const [result, setResult] = useState<{ key: string; preview: GenPreview } | null>(null);
  const [pending, start] = useTransition();

  const input: GenFormInput = {
    minutes,
    preset,
    equipment: preset === 'custom' ? equipment : undefined,
    focus: focusMode === 'pick' ? (picked.length ? picked : ['chest']) : focusMode,
    readiness,
    date,
  };
  const key = JSON.stringify(input);
  const preview = result?.key === key ? result.preview : null;
  const noEquipment = preset === 'custom' && !equipment.length;
  const isToday = date === today;
  const existing = preview?.existing ?? [];
  const canReplace = existing.some((x) => x.status === 'planned');
  const mustChoose = existing.length > 0 && !onExisting;

  const run = () =>
    start(async () => {
      const r = await previewWorkout(input);
      if (!r.ok) toast.error(r.error);
      else {
        setResult({ key, preview: r.preview! });
        setOnExisting(null);
      }
    });

  // saveWorkout redirects on success and throws on failure (after cleaning up its own partial writes).
  const save = (startNow: boolean) =>
    start(async () => {
      try {
        const r = await saveWorkout(input, startNow, onExisting ?? undefined);
        // Something was added to that day since the preview: show it and let the user choose.
        if (r?.conflict.length) showConflict(r.conflict);
      } catch (e) {
        unstable_rethrow(e);
        log.error('saveWorkout failed', { startNow, err: e });
        toast.error('Could not save the workout. Please try again.');
      }
    });

  const showConflict = (conflict: ExistingSession[]) => {
    if (preview) setResult({ key, preview: { ...preview, existing: conflict } });
    setOnExisting(null);
    toast.warning('That day already has a session. Choose what to do with it.');
  };

  const pickMuscle = (m: MuscleId) => {
    if (!(TRACKED_MUSCLES as readonly string[]).includes(m) || m === 'front_delts') return;
    const t = m as TrackedMuscle;
    setFocusMode('pick');
    setPicked((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]));
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-5">
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Minutes</p>
          <Segmented label="Minutes" value={minutes} onChange={setMinutes} options={[20, 30, 45, 60, 75].map((m) => ({ value: m as GenFormInput['minutes'], label: m }))} />
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Equipment</p>
          <Segmented label="Equipment" value={preset} onChange={setPreset} options={[{ value: 'full', label: 'Full gym' }, { value: 'dumbbells', label: 'Dumbbells' }, { value: 'bodyweight', label: 'Bodyweight' }, { value: 'custom', label: 'Custom' }]} />
          {preset === 'custom' && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {EQ.map((e) => (
                <Chip key={e} className="h-9 px-3 capitalize" active={equipment.includes(e)} onClick={() => setEquipment(equipment.includes(e) ? equipment.filter((x) => x !== e) : [...equipment, e])}>
                  {e}
                </Chip>
              ))}
            </div>
          )}
          {noEquipment && (
            <p className="text-warn text-xs" role="alert">
              Pick at least one piece of equipment (choose bodyweight if you have none).
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Focus</p>
          <Segmented label="Focus" value={focusMode} onChange={setFocusMode} options={[{ value: 'auto', label: 'Auto' }, { value: 'upper', label: 'Upper' }, { value: 'lower', label: 'Lower' }, { value: 'full', label: 'Full' }, { value: 'pick', label: 'Pick' }]} />
          {focusMode === 'auto' && (
            <p className="text-muted-foreground text-xs">Fills the muscles furthest behind this week’s targets. Skips anything in pain or sore in the last 48 h, and puts muscles trained hard in the last 48 h last in line.</p>
          )}
          {focusMode === 'pick' && (
            <>
              <BodyMap side="both" className="mx-auto max-w-xs" selected={null} onSelect={pickMuscle} styles={Object.fromEntries(picked.map((m) => [m, { fill: 'var(--volt)', label: 'picked' }]))} />
              <p className="text-muted-foreground text-center text-xs">{picked.length ? picked.map((m) => MUSCLE_SHORT[m]).join(', ') : 'Tap muscles to pick them'}</p>
            </>
          )}
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Readiness</p>
          <Segmented label="Readiness" value={readiness} onChange={setReadiness} options={[{ value: 'normal', label: 'Normal' }, { value: 'tired', label: 'Tired' }]} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="gen-date" className="text-sm font-medium">
            Day
          </label>
          <Input id="gen-date" type="date" value={date} min={today} max={addDays(today, 13)} onChange={(e) => setDate(e.target.value || today)} className="h-11 w-48" />
        </div>
        <Button size="lg" className="w-full" onClick={run} disabled={pending || noEquipment || (focusMode === 'pick' && !picked.length)}>
          <Sparkles /> {pending ? 'Generating…' : 'Preview workout'}
        </Button>
      </div>

      <section className="bg-card h-fit rounded-2xl border p-5" aria-live="polite">
        {!preview ? (
          <p className="text-muted-foreground py-10 text-center text-sm">Your workout preview appears here.</p>
        ) : (
          <>
            <p className="stamp text-muted-foreground">~{preview.estMinutes} min</p>
            <h2 className="font-display text-3xl font-extrabold uppercase">{preview.title}</h2>
            <ol className="mt-3 divide-y">
              {preview.exercises.map((e, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{e.name}</p>
                    <p className="num text-muted-foreground text-sm">
                      {e.rx}
                      {e.load != null && ` · ${fmtLoad(e.load, units)}`}
                    </p>
                    {e.hint && <p className="text-muted-foreground text-xs">{e.hint}</p>}
                  </div>
                  <Why ruleIds={e.ruleIds} />
                </li>
              ))}
            </ol>
            {preview.exercises.length === 0 && <p className="text-warn text-sm">Nothing fits these settings. Try more minutes or more equipment.</p>}
            {preview.notes.map((n) => (
              <p key={n} className="text-muted-foreground mt-2 text-xs">
                {n}
              </p>
            ))}
            {existing.length > 0 && (
              <div className="bg-warn/10 mt-4 space-y-2 rounded-xl border p-3" role="alert">
                <p className="text-sm">
                  {isToday ? 'Today' : prettyDate(date)} already has {existing.map((x) => `${x.title} (${STATUS_LABEL[x.status] ?? x.status})`).join(', ')}. Pick another day above, or:
                </p>
                <Segmented
                  label="Existing session"
                  value={onExisting}
                  onChange={setOnExisting}
                  options={[...(canReplace ? [{ value: 'replace' as const, label: 'Replace it' }] : []), { value: 'add' as const, label: 'Keep both' }]}
                />
                {onExisting === 'replace' && <p className="text-muted-foreground text-xs">The planned session is marked skipped{existing.some((x) => x.status !== 'planned') ? '; started or finished ones stay' : ''}.</p>}
              </div>
            )}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button variant="outline" disabled={pending || !preview.exercises.length || mustChoose} onClick={() => save(false)}>
                <Save /> {isToday ? 'Save for later' : `Save for ${prettyDate(date)}`}
              </Button>
              <Button disabled={pending || !preview.exercises.length || mustChoose || !isToday} onClick={() => save(true)}>
                <Play /> Start now
              </Button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
