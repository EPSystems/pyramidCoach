'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, UserX } from 'lucide-react';
import { toast } from 'sonner';
import { createInvite, revokeAccess, updateGlobalExercise } from '@/lib/actions/admin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function AdminClient({
  users,
  invites,
  exercises,
}: {
  users: { email: string; name: string; role: string; joined: string; lastActive: string; onboarded: boolean }[];
  invites: { email: string; accepted: boolean; revoked: boolean; created: string }[];
  exercises: { id: string; name: string; cues: string[]; mistakes: string[] }[];
}) {
  const [email, setEmail] = useState('');
  const [pending, start] = useTransition();
  const router = useRouter();
  const [exId, setExId] = useState(exercises[0]?.id ?? '');
  const ex = exercises.find((e) => e.id === exId);
  const [cues, setCues] = useState(ex?.cues.join('\n') ?? '');
  const [mistakes, setMistakes] = useState(ex?.mistakes.join('\n') ?? '');

  return (
    <>
      <section className="bg-card rounded-2xl border p-5">
        <h2 className="font-display text-2xl font-bold uppercase">Invite</h2>
        <form
          className="mt-3 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await createInvite(email);
              if (!r.ok) toast.error(r.error);
              else {
                toast.success(`Invite sent to ${email}`);
                setEmail('');
                router.refresh();
              }
            });
          }}
        >
          <Input type="email" required placeholder="friend@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 min-w-60 flex-1" aria-label="Email to invite" />
          <Button type="submit" disabled={pending}>
            <Mail /> Send invite
          </Button>
        </form>
        <ul className="mt-4 divide-y text-sm">
          {invites.map((i) => (
            <li key={i.email} className="flex items-center justify-between gap-2 py-2">
              <span className="truncate">{i.email}</span>
              <span className="text-muted-foreground text-xs">{i.revoked ? 'revoked' : i.accepted ? 'joined' : `invited ${i.created}`}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="bg-card rounded-2xl border p-5">
        <h2 className="font-display text-2xl font-bold uppercase">Users ({users.length})</h2>
        <p className="text-muted-foreground text-xs">Names and activity only — training and health data stay private to each user.</p>
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
                    if (!window.confirm(`Revoke ${u.email}? This deletes their account and data.`)) return;
                    start(async () => {
                      const r = await revokeAccess(u.email);
                      if (!r.ok) toast.error(r.error);
                      else router.refresh();
                    });
                  }}
                >
                  <UserX /> Revoke
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
        <p className="text-muted-foreground text-xs">Write in your own words — never paste text from the books.</p>
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
