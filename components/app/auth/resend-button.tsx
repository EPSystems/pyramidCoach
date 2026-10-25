'use client';

import { useActionState, useEffect, useState } from 'react';
import { RotateCw } from 'lucide-react';
import { resendConfirmation, type AuthState } from '@/lib/actions/auth';
import { Button } from '@/components/ui/button';

const COOLDOWN_S = 60;

/** Resends the sign-up confirmation email, with a 60 s cooldown after each send (AUTH_PLAN §3.1.5). */
export function ResendButton({ email, coolingDown = false }: { email: string; coolingDown?: boolean }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(resendConfirmation, {});
  const [remaining, setRemaining] = useState(coolingDown ? COOLDOWN_S : 0);

  useEffect(() => {
    if (remaining <= 0) return;
    const t = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(t);
  }, [remaining]);

  return (
    <form action={action} onSubmit={() => setRemaining(COOLDOWN_S)} className="space-y-2">
      <input type="hidden" name="email" value={email} />
      <Button type="submit" variant="outline" className="w-full" disabled={pending || remaining > 0}>
        <RotateCw />
        {pending ? 'Sending…' : remaining > 0 ? `Resend email in ${remaining}s` : 'Resend email'}
      </Button>
      <p className="text-sm" role="status" aria-live="polite">
        {state.ok && !pending && <span className="text-muted-foreground">Sent — check your inbox.</span>}
        {state.error && !pending && <span className="text-danger">{state.error}</span>}
      </p>
    </form>
  );
}
