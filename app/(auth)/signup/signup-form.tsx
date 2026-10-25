'use client';

import { useActionState, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { signUp, type AuthState } from '@/lib/actions/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FieldError } from '@/components/app/auth/auth-shell';
import { NewPasswordFields } from '@/components/app/auth/new-password-fields';

export function SignupForm() {
  const [resetKey, setResetKey] = useState(0);
  const [state, action, pending] = useActionState<AuthState, FormData>(signUp, {});
  const fe = state.fieldErrors ?? {};
  return (
    // React resets the form after each submit; remount the password fields so their live hint resets too.
    <form action={action} onReset={() => setResetKey((k) => k + 1)} className="space-y-4" noValidate>
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
      <NewPasswordFields key={resetKey} errors={fe} />
      {state.error && (
        <p className="text-danger text-sm" role="alert">
          {state.error}
        </p>
      )}
      <p className="text-muted-foreground text-xs leading-relaxed">
        By creating an account you accept that Pyramid Coach gives general training and nutrition guidance. It is not a substitute for a doctor or physiotherapist.
      </p>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? 'Creating account…' : 'Create account'} <ArrowRight />
      </Button>
    </form>
  );
}
