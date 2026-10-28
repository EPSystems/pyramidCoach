'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, ShieldOff, UserX } from 'lucide-react';
import { toast } from 'sonner';
import { removeUser, setUserRole, updateGlobalExercise } from '@/lib/actions/admin';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { parseIncrement, TraitFields, type Traits } from '../library/exercise-form';

export function AdminClient({
  isOwner,
  usersError,
  users,
  exercises,
}: {
  isOwner: boolean;
  usersError: string | null;
  users: { id: string; email: string; name: string; role: string; joined: string; lastActive: string; onboarded: boolean }[];
  exercises: { id: string; name: string; cues: string[]; mistakes: string[]; traits: Traits }[];
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const [exId, setExId] = useState(exercises[0]?.id ?? '');
  const ex = exercises.find((e) => e.id === exId);
  const [cues, setCues] = useState(ex?.cues.join('\n') ?? '');
  const [mistakes, setMistakes] = useState(ex?.mistakes.join('\n') ?? '');
  const [traits, setTraits] = useState<Traits | null>(ex?.traits ?? null);
  const increment = traits ? parseIncrement(traits.increment) : null;

  return (
    <>
      <section className="bg-card rounded-2xl border p-5">
        <h2 className="font-display text-2xl font-bold uppercase">Users ({users.length})</h2>
        <p className="text-muted-foreground text-xs">Names and activity only; training and health data stay private to each user.</p>
        {usersError && (
          <p className="border-danger/40 text-danger mt-3 rounded-xl border px-4 py-3 text-sm" role="alert">
            {usersError}
          </p>
        )}
        <ul className="mt-3 divide-y text-sm">
          {users.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {u.name} {u.role !== 'member' && <span className="stamp text-volt ml-1">{u.role}</span>}
                </p>
                <p className="text-muted-foreground truncate text-xs">
                  {u.email} · joined {u.joined} · active {u.lastActive}
                  {!u.onboarded && ' · not onboarded'}
                </p>
              </div>
              {isOwner && u.role !== 'owner' && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => {
                    const role = u.role === 'admin' ? 'member' : 'admin';
                    if (!window.confirm(role === 'admin' ? `Make ${u.email} an admin? They can open Admin and edit exercise text.` : `Remove admin from ${u.email}?`)) return;
                    start(async () => {
                      const r = await setUserRole({ userId: u.id, role });
                      if (!r.ok) toast.error(r.error);
                      else router.refresh();
                    });
                  }}
                >
                  {u.role === 'admin' ? (
                    <>
                      <ShieldOff /> Remove admin
                    </>
                  ) : (
                    <>
                      <ShieldCheck /> Make admin
                    </>
                  )}
                </Button>
              )}
              {isOwner && u.role !== 'owner' && (
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
        <h2 className="font-display text-2xl font-bold uppercase">Edit exercise</h2>
        <Select
          value={exId}
          onValueChange={(v) => {
            setExId(v);
            const e = exercises.find((x) => x.id === v);
            setCues(e?.cues.join('\n') ?? '');
            setMistakes(e?.mistakes.join('\n') ?? '');
            setTraits(e?.traits ?? null);
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
        {traits && <TraitFields value={traits} onChange={setTraits} incrementHint="Empty = each user's equipment setting." />}
        <p className="text-muted-foreground text-xs">Changes reach every user&apos;s next plan. Copy them into lib/knowledge/exercises.ts too, or a re-seed restores the old values.</p>
        <Button
          disabled={pending || increment === undefined || (traits != null && !traits.primary.length)}
          onClick={() =>
            start(async () => {
              const r = await updateGlobalExercise({
                id: exId,
                cues: cues.split('\n').map((s) => s.trim()).filter(Boolean),
                mistakes: mistakes.split('\n').map((s) => s.trim()).filter(Boolean),
                traits: traits ? { ...traits, increment: increment ?? null } : undefined,
              });
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
