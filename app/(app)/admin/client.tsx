'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { UserX } from 'lucide-react';
import { toast } from 'sonner';
import { removeUser, updateGlobalExercise } from '@/lib/actions/admin';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function AdminClient({
  users,
  exercises,
}: {
  users: { email: string; name: string; role: string; joined: string; lastActive: string; onboarded: boolean }[];
  exercises: { id: string; name: string; cues: string[]; mistakes: string[] }[];
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const [exId, setExId] = useState(exercises[0]?.id ?? '');
  const ex = exercises.find((e) => e.id === exId);
  const [cues, setCues] = useState(ex?.cues.join('\n') ?? '');
  const [mistakes, setMistakes] = useState(ex?.mistakes.join('\n') ?? '');

  return (
    <>
      <section className="bg-card rounded-2xl border p-5">
        <h2 className="font-display text-2xl font-bold uppercase">Users ({users.length})</h2>
        <p className="text-muted-foreground text-xs">Names and activity only; training and health data stay private to each user.</p>
        <ul className="mt-3 divide-y text-sm">
          {users.map((u) => (
            <li key={u.email} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {u.name} {u.role === 'owner' && <span className="stamp text-volt ml-1">owner</span>}
                </p>
                <p className="text-muted-foreground truncate text-xs">
                  {u.email} · joined {u.joined} · active {u.lastActive}
                  {!u.onboarded && ' · not onboarded'}
                </p>
              </div>
              {u.role !== 'owner' && (
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={pending}
                  onClick={() => {
                    if (!window.confirm(`Remove ${u.email}? This deletes their account and data.`)) return;
                    start(async () => {
                      const r = await removeUser(u.email);
                      if (!r.ok) toast.error(r.error);
                      else router.refresh();
                    });
                  }}
                >
                  <UserX /> Remove user
                </Button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="bg-card space-y-3 rounded-2xl border p-5">
        <h2 className="font-display text-2xl font-bold uppercase">Edit exercise text</h2>
        <Select
          value={exId}
          onValueChange={(v) => {
            setExId(v);
            const e = exercises.find((x) => x.id === v);
            setCues(e?.cues.join('\n') ?? '');
            setMistakes(e?.mistakes.join('\n') ?? '');
          }}
        >
          <SelectTrigger className="h-11! w-full" aria-label="Exercise">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {exercises.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Textarea rows={5} value={cues} onChange={(e) => setCues(e.target.value)} aria-label="Cues, one per line" />
        <Textarea rows={2} value={mistakes} onChange={(e) => setMistakes(e.target.value)} aria-label="Mistakes, one per line" />
        <p className="text-muted-foreground text-xs">Write in your own words. Never paste text from the books.</p>
        <Button
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await updateGlobalExercise({ id: exId, cues: cues.split('\n').map((s) => s.trim()).filter(Boolean), mistakes: mistakes.split('\n').map((s) => s.trim()).filter(Boolean) });
              if (!r.ok) toast.error(r.error);
              else toast.success('Saved');
            })
          }
        >
          Save
        </Button>
      </section>
    </>
  );
}
