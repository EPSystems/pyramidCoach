'use client';

import { useActionState } from 'react';
import { ArrowRight, MailCheck } from 'lucide-react';
import { requestPasswordReset, type AuthState } from '@/lib/actions/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FieldError } from '@/components/app/auth/auth-shell';

export function ForgotForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(requestPasswordReset, {});
  if (state.ok) {
    return (
      <div className="bg-card rounded-2xl border p-5" role="status">
        <MailCheck className="text-volt size-7" aria-hidden />
        <p className="font-display mt-3 text-2xl font-bold uppercase">Check your inbox</p>
        <p className="text-muted-foreground mt-1 text-sm">
          If an account exists for {state.email ? <span className="text-foreground font-medium">{state.email}</span> : 'that email'}, we sent a link to reset your password.
        </p>
      </div>
    );
  }
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="email" className="stamp text-muted-foreground">
          Email
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          placeholder="you@example.com"
          defaultValue={state.email}
          aria-invalid={!!fe.email || undefined}
          aria-describedby={fe.email ? 'email-error' : undefined}
          className="h-12 text-base"
        />
        <FieldError id="email-error">{fe.email}</FieldError>
      </div>
      {state.error && (
        <p className="text-danger text-sm" role="alert">
          {state.error}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? 'Sending…' : 'Send reset link'} <ArrowRight />
      </Button>
    </form>
  );
}
