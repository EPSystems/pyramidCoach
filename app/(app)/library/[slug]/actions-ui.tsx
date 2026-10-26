'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ThumbsDown, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { deleteCustomExercise, toggleDislike } from '@/lib/actions/library';
import { Button } from '@/components/ui/button';

export function ExerciseActions({ exerciseId, disliked, custom }: { exerciseId: string; disliked: boolean; custom: boolean }) {
  const [d, setD] = useState(disliked);
  const [pending, start] = useTransition();
  const router = useRouter();
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
            toast(r.disliked ? 'Won’t be picked in future plans' : 'Back in the pool');
          })
        }
      >
        <ThumbsDown /> {d ? 'Disliked (undo)' : 'I don’t like this one'}
      </Button>
      <p className="text-muted-foreground text-xs">Disliked exercises are skipped when your next plan is built (T-SEL-04).</p>
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
