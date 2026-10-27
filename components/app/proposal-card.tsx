'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { acceptProposal, rejectProposal } from '@/lib/actions/review';
import { Button } from '@/components/ui/button';
import { Why } from './bits';
import { prettyDate } from '@/lib/utils/dates';
import { cn } from '@/lib/utils';

export interface ProposalView {
  id: string;
  kind: string;
  title: string;
  rationale: string;
  rule_ids: string[];
  status: string;
  preview: { date: string; rows: { name: string; before: number; after: number; swapTo?: string; reps?: string }[] }[] | null;
  payload: Record<string, unknown>;
  expires_on: string | null;
}

const KIND_LABEL: Record<string, string> = {
  standard_deload: 'Deload',
  targeted_deload: 'Targeted deload',
  intro_week: 'Intro week',
  volume_change: 'Volume',
  exercise_swap: 'Swap',
  block_transition: 'New block',
  plan_regenerate: 'Plan',
  calorie_adjust: 'Calories',
  multiplier_adjust: 'Calories',
  status_change: 'Status',
  plateau_action: 'Plateau',
  injury_adjust: 'Injury',
};

export function ProposalCard({ p }: { p: ProposalView }) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const decided = p.status !== 'pending';
  const changes = (p.payload.changes as { muscle: string; from: number; to: number }[] | undefined) ?? null;
  return (
    <article className={cn('bg-card overflow-hidden rounded-2xl border', !decided && 'border-volt/40')}>
      <div className="p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="stamp bg-accent text-accent-foreground rounded px-1.5 py-0.5">{KIND_LABEL[p.kind] ?? p.kind}</span>
          {decided ? <span className={cn('stamp', p.status === 'accepted' ? 'text-ok' : 'text-muted-foreground')}>{p.status}</span> : p.expires_on && <span className="text-muted-foreground text-xs">until {prettyDate(p.expires_on)}</span>}
        </div>
        <h3 className="font-display mt-2 text-2xl leading-tight font-bold uppercase">{p.title}</h3>
        <p className="text-muted-foreground mt-1 text-sm leading-relaxed">{p.rationale}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Why ruleIds={p.rule_ids} />
          <span className="stamp text-muted-foreground">{p.rule_ids.join(' · ')}</span>
        </div>
        {changes && (
          <ul className="num mt-3 text-sm">
            {changes.map((c) => (
              <li key={c.muscle}>
                {c.muscle.replace('_', ' ')}: {c.from} → <span className="text-volt font-semibold">{c.to}</span> sets/week
              </li>
            ))}
          </ul>
        )}
        {p.preview && p.preview.length > 0 && (
          <div className="mt-3">
            <button type="button" className="text-sm font-medium underline-offset-4 hover:underline" onClick={() => setOpen(!open)} aria-expanded={open}>
              {open ? 'Hide' : 'Show'} before / after
            </button>
            {open && (
              <div className="mt-2 space-y-3">
                {p.preview.map((s) => (
                  <div key={s.date}>
                    <p className="stamp text-muted-foreground">{prettyDate(s.date)}</p>
                    <ul className="num text-sm">
                      {s.rows.map((r, i) => (
                        <li key={i} className="flex justify-between gap-2 border-b border-dashed py-1 last:border-0">
                          <span className="truncate">{r.name}</span>
                          <span className="shrink-0">
                            {r.swapTo ? (
                              <>→ {r.swapTo}</>
                            ) : r.reps ? (
                              <>
                                {r.before} sets → <span className="text-volt">{r.reps}</span>
                              </>
                            ) : (
                              <>
                                {r.before} → <span className={r.after === 0 ? 'text-danger' : 'text-volt'}>{r.after === 0 ? 'removed' : `${r.after} sets`}</span>
                              </>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {!decided && (
        <div className="grid grid-cols-2 gap-2 border-t p-3">
          <Button
            variant="outline"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await rejectProposal(p.id);
                if (!r.ok) {
                  toast.error(r.error);
                  return;
                }
                toast('Proposal rejected. Your plan is unchanged.');
                router.refresh();
              })
            }
          >
            <X /> Reject
          </Button>
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await acceptProposal(p.id);
                if (!r.ok) toast.error(r.error);
                else {
                  toast.success('Applied', { description: r.summary?.join(' ') });
                  router.refresh();
                }
              })
            }
          >
            <Check /> {pending ? 'Applying…' : 'Accept'}
          </Button>
        </div>
      )}
    </article>
  );
}
