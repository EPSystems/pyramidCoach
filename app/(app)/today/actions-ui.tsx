'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { BatteryLow, CalendarClock, Medal } from 'lucide-react';
import { toast } from 'sonner';
import { logSport, moveSession, swapForLightest } from '@/lib/actions/training';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Segmented, Why } from '@/components/app/bits';
import { prettyDate } from '@/lib/utils/dates';

export function DrainedButton({ sessionId }: { sessionId: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      variant="outline"
      className="justify-start"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await swapForLightest(sessionId);
          if (!r.ok) toast.error(r.error);
          else {
            toast.success(`Swapped — today is now ${r.data?.title}`);
            router.refresh();
          }
        })
      }
    >
      <BatteryLow /> Feeling drained? Swap for the lightest session
    </Button>
  );
}

export function MoveSessionDialog({ sessionId, title, dates, triggerLabel = "Move today's session" }: { sessionId: string; title: string; dates: string[]; triggerLabel?: string }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(dates[0] ?? '');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const router = useRouter();
  const submit = (force: boolean) =>
    start(async () => {
      const r = await moveSession(sessionId, date, force);
      if (!r.ok) return void toast.error(r.error);
      if (r.data?.warnings.length) return setWarnings(r.data.warnings);
      toast.success(`${title} moved to ${prettyDate(date)}`);
      setOpen(false);
      setWarnings([]);
      router.refresh();
    });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="justify-start">
          <CalendarClock /> {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display text-2xl uppercase">Move {title}</DialogTitle>
          <DialogDescription>
            Pick a day. Two hard sessions never go on the same day. <Why ruleIds={['T-FAT-07', 'T-SCH-04']} />
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-2">
          {dates.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => {
                setDate(d);
                setWarnings([]);
              }}
              className={`h-12 rounded-lg text-sm font-medium ${date === d ? 'bg-volt text-volt-ink' : 'bg-muted'}`}
            >
              {prettyDate(d)}
            </button>
          ))}
        </div>
        {warnings.length > 0 && (
          <div className="bg-warn/15 text-warn rounded-lg p-3 text-sm">
            {warnings.map((w) => (
              <p key={w}>⚠ {w}</p>
            ))}
            <p className="text-foreground mt-1">OK anyway?</p>
          </div>
        )}
        <DialogFooter>
          {warnings.length ? (
            <Button onClick={() => submit(true)} disabled={pending}>
              Move anyway
            </Button>
          ) : (
            <Button onClick={() => submit(false)} disabled={pending || !date}>
              Move
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const RPE_HINT: Record<number, string> = {
  1: 'Very easy', 2: 'Easy', 3: 'Easy', 4: 'Comfortable', 5: 'Moderate', 6: 'Moderate', 7: 'Somewhat hard', 8: 'Hard', 9: 'Very hard', 10: 'Max effort',
};

export function LogSportDialog({ sports, defaultSport }: { sports: { id: string; name: string; minutes: number }[]; defaultSport?: string }) {
  const [open, setOpen] = useState(false);
  const [sportId, setSportId] = useState(defaultSport ?? sports[0]?.id ?? '');
  const [minutes, setMinutes] = useState(String(sports.find((s) => s.id === (defaultSport ?? sports[0]?.id))?.minutes ?? 60));
  const [rpe, setRpe] = useState<number | null>(7);
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!sports.length) return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="justify-start">
          <Medal /> Log a sport session
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display text-2xl uppercase">Log sport</DialogTitle>
          <DialogDescription>
            Session effort on a 1–10 scale. <Why ruleIds={['N-SPT-01']} />
          </DialogDescription>
        </DialogHeader>
        <Segmented label="Sport" value={sportId} onChange={setSportId} options={sports.map((s) => ({ value: s.id, label: s.name.split(' ')[0] }))} />
        <label className="flex items-center justify-between gap-3 text-sm font-medium">
          Minutes
          <Input inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} className="num h-11 w-24 text-right" />
        </label>
        <div className="space-y-1.5">
          <p className="text-sm font-medium">
            Session RPE: <span className="text-volt">{rpe}</span> <span className="text-muted-foreground">— {rpe ? RPE_HINT[rpe] : ''}</span>
          </p>
          <div className="grid grid-cols-10 gap-1">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <button key={n} type="button" onClick={() => setRpe(n)} aria-pressed={rpe === n} className={`num h-11 rounded-md text-sm font-semibold ${rpe === n ? 'bg-volt text-volt-ink' : 'bg-muted'}`}>
                {n}
              </button>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await logSport({ sportId, minutes: Number(minutes) || 0, rpe: rpe ?? 5 });
                if (!r.ok) toast.error(r.error);
                else {
                  toast.success('Sport session logged');
                  setOpen(false);
                  router.refresh();
                }
              })
            }
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
