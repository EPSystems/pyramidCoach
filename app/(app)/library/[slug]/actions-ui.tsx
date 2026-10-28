'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Repeat, ThumbsDown, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { deleteCustomExercise, toggleDislike, type DislikeInPlan } from '@/lib/actions/library';
import { swapExercise } from '@/lib/actions/training';
import { Button } from '@/components/ui/button';

export function ExerciseActions({ exerciseId, disliked, custom }: { exerciseId: string; disliked: boolean; custom: boolean }) {
  const [d, setD] = useState(disliked);
  const [inPlan, setInPlan] = useState<DislikeInPlan | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  // Reuses the logger's block-wide swap: every future planned use of the exercise is replaced.
  const swap = (plan: DislikeInPlan, toId: string, toName: string) =>
    start(async () => {
      const r = await swapExercise(plan.plannedExerciseId, toId, 'block');
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setInPlan(null);
      toast.success(`Swapped for ${toName} in your plan`);
      router.refresh();
    });

  return (
    <div className="space-y-2">
      <Button
        variant={d ? 'secondary' : 'outline'}
        className="w-full"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await toggleDislike(exerciseId);
            if (!r.ok) {
              toast.error(r.error);
              return;
            }
            setD(r.disliked);
            setInPlan(r.inPlan ?? null);
            toast(r.disliked ? 'Won’t be picked in future plans' : 'Back in the pool');
          })
        }
      >
        <ThumbsDown /> {d ? 'Disliked (undo)' : 'I don’t like this one'}
      </Button>
      {inPlan ? (
        <div className="bg-card space-y-2 rounded-xl border p-3" role="status">
          <p className="text-sm">
            It’s still in {inPlan.sessions} upcoming session{inPlan.sessions === 1 ? '' : 's'}.{' '}
            {inPlan.options.length ? 'Swap it now?' : 'No substitute fits your equipment; swap it in the session instead.'}
          </p>
          {inPlan.options.map((o) => (
            <Button key={o.id} variant="outline" size="sm" className="w-full justify-start" disabled={pending} onClick={() => swap(inPlan, o.id, o.name)}>
              <Repeat /> {o.name}
            </Button>
          ))}
          <Button variant="ghost" size="sm" className="w-full" disabled={pending} onClick={() => setInPlan(null)}>
            Keep it for now
          </Button>
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">Disliked exercises are skipped when plans are built (T-SEL-04); if one is in your current plan you can swap it out.</p>
      )}
      {custom && (
        <Button
          variant="destructive"
          className="w-full"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await deleteCustomExercise(exerciseId);
              if (!r.ok) toast.error(r.error);
              else router.push('/library');
            })
          }
        >
          <Trash2 /> Delete custom exercise
        </Button>
      )}
    </div>
  );
}
