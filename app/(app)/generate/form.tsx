'use client';

import { useState, useTransition } from 'react';
import { Play, Save, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { previewWorkout, saveWorkout, type GenFormInput, type GenPreview } from '@/lib/actions/generate';
import { Button } from '@/components/ui/button';
import { BodyMap } from '@/components/app/body-map';
import { Chip, Segmented, Why } from '@/components/app/bits';
import { TRACKED_MUSCLES, type Equipment, type MuscleId, type TrackedMuscle } from '@/lib/engine/types';
import { MUSCLE_SHORT } from '@/lib/knowledge/muscles';
import { fmtLoad, type Units } from '@/lib/utils/units';

const EQ: Equipment[] = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'band', 'sled'];

export function GenerateForm({ initialMuscle, units }: { initialMuscle: TrackedMuscle | null; units: Units }) {
  const [minutes, setMinutes] = useState<GenFormInput['minutes']>(45);
  const [preset, setPreset] = useState<GenFormInput['preset']>('full');
  const [equipment, setEquipment] = useState<Equipment[]>(['dumbbell', 'bodyweight']);
  const [focusMode, setFocusMode] = useState<'auto' | 'upper' | 'lower' | 'full' | 'pick'>(initialMuscle ? 'pick' : 'auto');
  const [picked, setPicked] = useState<TrackedMuscle[]>(initialMuscle ? [initialMuscle] : []);
  const [readiness, setReadiness] = useState<'normal' | 'tired'>('normal');
  const [result, setResult] = useState<{ key: string; preview: GenPreview } | null>(null);
  const [pending, start] = useTransition();

  const input: GenFormInput = {
    minutes,
    preset,
    equipment: preset === 'custom' ? equipment : undefined,
    focus: focusMode === 'pick' ? (picked.length ? picked : ['chest']) : focusMode,
    readiness,
  };
  const key = JSON.stringify(input);
  const preview = result?.key === key ? result.preview : null;

  const run = () =>
    start(async () => {
      const r = await previewWorkout(input);
      if (!r.ok) toast.error(r.error);
      else setResult({ key, preview: r.preview! });
    });

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
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Focus</p>
          <Segmented label="Focus" value={focusMode} onChange={setFocusMode} options={[{ value: 'auto', label: 'Auto' }, { value: 'upper', label: 'Upper' }, { value: 'lower', label: 'Lower' }, { value: 'full', label: 'Full' }, { value: 'pick', label: 'Pick' }]} />
          {focusMode === 'auto' && <p className="text-muted-foreground text-xs">Fills the muscles furthest behind this week’s targets, skipping anything sore or trained hard in the last 48 h.</p>}
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
        <Button size="lg" className="w-full" onClick={run} disabled={pending || (focusMode === 'pick' && !picked.length)}>
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
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button variant="outline" disabled={pending || !preview.exercises.length} onClick={() => start(() => saveWorkout(input, false))}>
                <Save /> Save for later
              </Button>
              <Button disabled={pending || !preview.exercises.length} onClick={() => start(() => saveWorkout(input, true))}>
                <Play /> Start now
              </Button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
