'use client';

import { useActionState } from 'react';
import { ArrowRight, MailCheck } from 'lucide-react';
import { sendMagicLink, type LoginState } from '@/lib/actions/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function LoginForm({ linkError }: { linkError?: boolean }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(sendMagicLink, {});
  if (state.ok) {
    return (
      <div className="bg-card rounded-2xl border p-5" role="status">
        <MailCheck className="text-volt size-7" />
        <p className="font-display mt-3 text-2xl font-bold uppercase">Check your inbox</p>
        <p className="text-muted-foreground mt-1 text-sm">
          We sent a sign-in link to <span className="text-foreground font-medium">{state.email}</span>. Open it on this device.
        </p>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-3">
      <Label htmlFor="email" className="stamp text-muted-foreground">
        Email
      </Label>
      <Input id="email" name="email" type="email" autoComplete="email" required placeholder="you@example.com" defaultValue={state.email} className="h-12 text-base" />
      {(state.error || linkError) && (
        <p className="text-danger text-sm" role="alert">
          {state.error ?? 'That link expired or was already used. Request a new one.'}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? 'Sending…' : 'Email me a sign-in link'} <ArrowRight />
      </Button>
    </form>
  );
}
