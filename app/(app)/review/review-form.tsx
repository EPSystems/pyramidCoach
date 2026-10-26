'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { submitReview } from '@/lib/actions/review';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/app/bits';
import type { ReviewKey } from '@/lib/engine/types';

const QUESTIONS: { key: ReviewKey; q: string }[] = [
  { key: 'dreading_gym', q: 'Dreading the gym?' },
  { key: 'sleep_worse', q: 'Sleep worse than normal?' },
  { key: 'performance_down', q: 'Loads or reps at the same load going down?' },
  { key: 'stress_worse', q: 'Stress worse than normal?' },
  { key: 'aches_worse', q: 'Aches and pains worse than normal?' },
];

export function ReviewForm({ initial, evidence, completed }: { initial: Record<ReviewKey, boolean>; evidence: Record<ReviewKey, string>; completed: boolean }) {
  const [answers, setAnswers] = useState(initial);
  const [pending, start] = useTransition();
  const router = useRouter();
  const yes = Object.values(answers).filter(Boolean).length;
  return (
    <div className="mt-4 space-y-4">
      {QUESTIONS.map(({ key, q }) => (
        <div key={key} className="space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">{q}</p>
            <Segmented
              className="w-36 shrink-0"
              label={q}
              value={answers[key] ? 'y' : 'n'}
              onChange={(v) => setAnswers({ ...answers, [key]: v === 'y' })}
              options={[
                { value: 'n', label: 'No' },
                { value: 'y', label: 'Yes' },
              ]}
            />
          </div>
          <p className="text-muted-foreground text-xs">{evidence[key]}</p>
        </div>
      ))}
      <p className="text-sm">
        <span className="num font-semibold">{yes}</span> of 5 yes {yes >= 2 ? <span className="text-warn">· a deload will be proposed</span> : <span className="text-muted-foreground">· carry on</span>}
      </p>
      <Button
        size="lg"
        className="w-full"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await submitReview(answers);
            if (!r.ok) toast.error(r.error);
            else {
              toast.success(r.created ? `${r.created} new proposal${r.created > 1 ? 's' : ''}` : 'Review saved, no changes needed');
              router.refresh();
            }
          })
        }
      >
        {pending ? 'Checking…' : completed ? 'Re-submit review' : 'Submit review'}
      </Button>
    </div>
  );
}
