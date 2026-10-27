'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Scale } from 'lucide-react';
import { toast } from 'sonner';
import { updatePhase } from '@/lib/actions/nutrition';
import { logWeighIn, refreshNutritionNow } from '@/lib/actions/training';
import { allowedRatePcts } from '@/lib/engine/nutrition';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Segmented, Why } from '@/components/app/bits';
import { NUTRITION } from '@/lib/knowledge/constants';
import type { Status } from '@/lib/engine/types';
import { fromDisplay, type Units } from '@/lib/utils/units';

export function WeighInForm({ units }: { units: Units }) {
  const [v, setV] = useState('');
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const n = Number(v);
        if (!n) return;
        start(async () => {
          const r = await logWeighIn(fromDisplay(n, units));
          if (!r.ok) toast.error(r.error);
          else {
            toast.success(r.data?.targetsUpdated ? 'Weigh-in saved. Targets updated to your new bodyweight.' : 'Weigh-in saved');
            setV('');
            router.refresh();
          }
        });
      }}
    >
      <Input inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} placeholder={`Today (${units})`} aria-label={`Morning weight in ${units}`} className="num h-11 w-32" />
      <Button type="submit" disabled={pending || !v}>
        <Scale /> Log
      </Button>
    </form>
  );
}

/** Re-runs the target calculation with the latest bodyweight, sports and settings (a rebase, not an adjustment). */
export function RecalculateButton() {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await refreshNutritionNow();
          if (!r.ok) toast.error(r.error);
          else {
            toast.success('Targets recalculated');
            router.refresh();
          }
        })
      }
    >
      <RefreshCw className={pending ? 'animate-spin' : undefined} /> Recalculate
    </Button>
  );
}

const defaultRate = (p: 'gain' | 'maintain' | 'loss', status: Status) => (p === 'loss' ? NUTRITION.lossRatePctPerWeek.default : p === 'gain' ? NUTRITION.gainDefault[status] : 0);

export function PhaseEditor({ phase, rate, status }: { phase: 'gain' | 'maintain' | 'loss'; rate: number; status: Status }) {
  const [p, setP] = useState(phase);
  const [r, setR] = useState(rate || defaultRate(phase, status));
  const [pending, start] = useTransition();
  const router = useRouter();
  // Same list the server accepts (N-RAT-01 for loss, the status's N-RAT-02 range for gain).
  const options = allowedRatePcts(p, status).map((x) => ({ value: x, label: `${x}%/${p === 'loss' ? 'wk' : 'mo'}` }));
  return (
    <div className="mt-5 space-y-3 border-t pt-4">
      <p className="text-sm font-medium">Change phase</p>
      <Segmented
        label="Nutrition phase"
        value={p}
        onChange={(v) => {
          setP(v);
          setR(defaultRate(v, status));
        }}
        options={[
          { value: 'gain', label: 'Gain' },
          { value: 'maintain', label: 'Maintain' },
          { value: 'loss', label: 'Lose' },
        ]}
      />
      {options.length > 0 && (
        <>
          <Segmented label="Target rate" value={r} onChange={setR} options={options} />
          <p className="text-muted-foreground text-xs">
            {p === 'loss' ? 'Leaner people should stay near 0.5% per week.' : `Recommended for a ${status} lifter: ${NUTRITION.gainRatePctPerMonth[status].join('–')}% per month.`}{' '}
            <Why ruleIds={p === 'loss' ? ['N-RAT-01', 'N-RAT-04'] : ['N-RAT-02']} />
          </p>
        </>
      )}
      <Button
        className="w-full"
        disabled={pending || (p === phase && r === rate)}
        onClick={() =>
          start(async () => {
            const res = await updatePhase({ phase: p, ratePct: p === 'maintain' ? 0 : r });
            if (!res.ok) toast.error(res.error);
            else {
              toast.success('Targets updated');
              res.warnings?.forEach((w) => toast.warning(w));
              router.refresh();
            }
          })
        }
      >
        Update targets
      </Button>
    </div>
  );
}
