'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { signIn, type AuthState } from '@/lib/actions/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FieldError } from '@/components/app/auth/auth-shell';
import { PasswordInput } from '@/components/app/auth/password-input';
import { ResendButton } from '@/components/app/auth/resend-button';

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(signIn, {});
  const fe = state.fieldErrors ?? {};
  const unconfirmed = state.code === 'email_not_confirmed';
  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4" noValidate>
        {next && <input type="hidden" name="next" value={next} />}
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
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password" className="stamp text-muted-foreground">
              Password
            </Label>
            <Link href="/forgot-password" className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline">
              Forgot password?
            </Link>
          </div>
          <PasswordInput
            id="password"
            name="password"
            autoComplete="current-password"
            required
            aria-invalid={!!fe.password || undefined}
            aria-describedby={fe.password ? 'password-error' : undefined}
          />
          <FieldError id="password-error">{fe.password}</FieldError>
        </div>
        {state.error && !unconfirmed && (
          <p className="text-danger text-sm" role="alert">
            {state.error}
          </p>
        )}
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? 'Signing in…' : 'Sign in'} <ArrowRight />
        </Button>
      </form>
      {unconfirmed && state.email && (
        <div className="bg-card space-y-3 rounded-2xl border p-5" role="alert">
          <p className="font-display text-2xl font-bold uppercase">Confirm your email first</p>
          <p className="text-muted-foreground text-sm">
            We sent a confirmation link to <span className="text-foreground font-medium">{state.email}</span>. Open it, then sign in.
          </p>
          <ResendButton email={state.email} />
        </div>
      )}
    </div>
  );
}
