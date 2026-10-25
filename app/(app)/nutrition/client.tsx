'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Scale } from 'lucide-react';
import { toast } from 'sonner';
import { updatePhase } from '@/lib/actions/nutrition';
import { logWeighIn } from '@/lib/actions/training';
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
            toast.success('Weigh-in saved');
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

export function PhaseEditor({ phase, rate, status }: { phase: 'gain' | 'maintain' | 'loss'; rate: number; status: Status }) {
  const [p, setP] = useState(phase);
  const [r, setR] = useState(rate || (phase === 'loss' ? 0.75 : NUTRITION.gainDefault[status]));
  const [pending, start] = useTransition();
  const router = useRouter();
  const options =
    p === 'loss'
      ? [0.5, 0.75, 1].map((x) => ({ value: x, label: `${x}%/wk` }))
      : p === 'gain'
        ? [0.5, 1, 1.5, 2].filter((x) => x <= NUTRITION.gainRatePctPerMonth[status][1] || x === NUTRITION.gainDefault[status]).map((x) => ({ value: x, label: `${x}%/mo` }))
        : [];
  return (
    <div className="mt-5 space-y-3 border-t pt-4">
      <p className="text-sm font-medium">Change phase</p>
      <Segmented
        label="Nutrition phase"
        value={p}
        onChange={(v) => {
          setP(v);
          setR(v === 'loss' ? 0.75 : v === 'gain' ? NUTRITION.gainDefault[status] : 0);
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
