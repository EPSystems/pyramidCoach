'use client';

import { useState } from 'react';
import { Check, Circle } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { FieldError } from './auth-shell';
import { PasswordInput } from './password-input';

type Errors = { password?: string; confirmPassword?: string };

/** Password + confirm with a live hint for the rule the server enforces: ≥ 8 chars, letters and digits (AUTH_PLAN §3.2). */
export function NewPasswordFields({ errors = {} }: { errors?: Errors }) {
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const rules = [
    { ok: pw.length >= 8, label: 'At least 8 characters' },
    { ok: /[a-z]/i.test(pw) && /\d/.test(pw), label: 'Letters and digits' },
  ];
  const mismatch = confirm.length > 0 && confirm !== pw;
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="password" className="stamp text-muted-foreground">
          Password
        </Label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          required
          minLength={8}
          onChange={(e) => setPw(e.target.value)}
          aria-invalid={!!errors.password || undefined}
          aria-describedby={errors.password ? 'password-hint password-error' : 'password-hint'}
        />
        <ul id="password-hint" className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {rules.map((r) => (
            <li key={r.label} className={cn('flex items-center gap-1', r.ok ? 'text-volt' : 'text-muted-foreground')}>
              {r.ok ? <Check className="size-3.5" aria-hidden /> : <Circle className="size-3" aria-hidden />}
              {r.label}
            </li>
          ))}
        </ul>
        <FieldError id="password-error">{errors.password}</FieldError>
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirmPassword" className="stamp text-muted-foreground">
          Confirm password
        </Label>
        <PasswordInput
          id="confirmPassword"
          name="confirmPassword"
          autoComplete="new-password"
          required
          onChange={(e) => setConfirm(e.target.value)}
          aria-invalid={!!errors.confirmPassword || mismatch || undefined}
          aria-describedby={errors.confirmPassword || mismatch ? 'confirmPassword-error' : undefined}
        />
        <FieldError id="confirmPassword-error">{errors.confirmPassword ?? (mismatch ? 'Passwords don’t match' : undefined)}</FieldError>
      </div>
    </>
  );
}
