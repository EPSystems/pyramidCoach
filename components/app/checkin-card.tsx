'use client';

import { useState, useTransition } from 'react';
import { Check } from 'lucide-react';
import { toast } from 'sonner';
import { saveCheckin } from '@/lib/actions/training';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BodyMap } from './body-map';
import { Segmented, Stepper } from './bits';
import type { MuscleId } from '@/lib/engine/types';
import { MUSCLE_SHORT } from '@/lib/knowledge/muscles';
import { fromDisplay, type Units } from '@/lib/utils/units';
import { cn } from '@/lib/utils';

export interface CheckinValues {
  sleepHours: number | null;
  energy: number | null;
  stress: number | null;
  soreness: Partial<Record<MuscleId, 'sore' | 'pain'>>;
  bodyweightKg?: number | null;
}

const SORE = 'color-mix(in oklch, var(--warn) 70%, var(--card))';
const PAIN = 'var(--danger)';

/** 10-second morning check-in (8.2). Tap a muscle: sore → pain → clear. */
export function CheckinCard({ initial, units, compact, onSaved, hideWeight }: { initial: CheckinValues; units: Units; compact?: boolean; onSaved?: () => void; hideWeight?: boolean }) {
  const [sleep, setSleep] = useState<number | null>(initial.sleepHours ?? 7.5);
  const [energy, setEnergy] = useState<number | null>(initial.energy);
  const [stress, setStress] = useState<number | null>(initial.stress);
  const [sore, setSore] = useState(initial.soreness ?? {});
  const [weight, setWeight] = useState('');
  const [showMap, setShowMap] = useState(Object.keys(initial.soreness ?? {}).length > 0 || !compact);
  const [pending, start] = useTransition();

  const cycle = (m: MuscleId) => {
    const cur = sore[m];
    const next = { ...sore };
    if (!cur) next[m] = 'sore';
    else if (cur === 'sore') next[m] = 'pain';
    else delete next[m];
    setSore(next);
  };

  const save = () =>
    start(async () => {
      const w = weight.trim() ? fromDisplay(Number(weight), units) : null;
      const res = await saveCheckin({ sleepHours: sleep, energy, stress, soreness: sore, bodyweightKg: w });
      if (!res.ok) toast.error(res.error);
      else {
        toast.success('Check-in saved');
        onSaved?.();
      }
    });

  const scale = [1, 2, 3, 4, 5].map((n) => ({ value: n, label: n }));
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">Sleep</span>
        <Stepper label="Sleep hours" value={sleep} onChange={setSleep} step={0.5} min={0} max={14} format={(v) => (v == null ? '-' : `${v} h`)} />
      </div>
      <div className="space-y-1.5">
        <span className="text-sm font-medium">Energy</span>
        <Segmented label="Energy 1 to 5" value={energy} onChange={setEnergy} options={scale} />
      </div>
      <div className="space-y-1.5">
        <span className="text-sm font-medium">Stress</span>
        <Segmented label="Stress 1 to 5" value={stress} onChange={setStress} options={scale} />
      </div>
      <div>
        <button type="button" onClick={() => setShowMap(!showMap)} className="text-sm font-medium underline-offset-4 hover:underline" aria-expanded={showMap}>
          Anything sore? {Object.keys(sore).length > 0 && <span className="text-warn">({Object.keys(sore).length})</span>}
        </button>
        {showMap && (
          <div className="mt-2">
            <BodyMap
              side="both"
              className="mx-auto max-w-[19rem]"
              onSelect={cycle}
              styles={Object.fromEntries(Object.entries(sore).map(([m, v]) => [m, { fill: v === 'pain' ? PAIN : SORE, label: v }]))}
            />
            <p className="text-muted-foreground mt-1 text-center text-xs">Tap once = sore · twice = pain · three times = clear</p>
            {Object.keys(sore).length > 0 && (
              <div className="mt-2 flex flex-wrap justify-center gap-1.5">
                {Object.entries(sore).map(([m, v]) => (
                  <button key={m} type="button" onClick={() => cycle(m as MuscleId)} className={cn('rounded-full px-2.5 py-1 text-xs font-medium', v === 'pain' ? 'bg-danger/20 text-danger' : 'bg-warn/20 text-warn')}>
                    {MUSCLE_SHORT[m as MuscleId]}: {v}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {!hideWeight && (
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="ci-weight" className="text-sm font-medium">
            Morning weight <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <div className="flex items-center gap-2">
            <Input id="ci-weight" inputMode="decimal" placeholder={initial.bodyweightKg ? String(initial.bodyweightKg) : units} value={weight} onChange={(e) => setWeight(e.target.value)} className="num h-11 w-24 text-right" />
            <span className="text-muted-foreground text-sm">{units}</span>
          </div>
        </div>
      )}
      <Button size="lg" className="w-full" onClick={save} disabled={pending}>
        <Check /> {pending ? 'Saving…' : 'Save check-in'}
      </Button>
    </div>
  );
}
