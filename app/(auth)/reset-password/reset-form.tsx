'use client';

import { useActionState, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { updatePassword, type AuthState } from '@/lib/actions/auth';
import { Button } from '@/components/ui/button';
import { NewPasswordFields } from '@/components/app/auth/new-password-fields';

export function ResetForm() {
  const [resetKey, setResetKey] = useState(0);
  const [state, action, pending] = useActionState<AuthState, FormData>(updatePassword, {});
  return (
    // React resets the form after each submit; remount the password fields so their live hint resets too.
    <form action={action} onReset={() => setResetKey((k) => k + 1)} className="space-y-4" noValidate>
      <NewPasswordFields key={resetKey} errors={state.fieldErrors} />
      {state.error && (
        <p className="text-danger text-sm" role="alert">
          {state.error}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? 'Saving…' : 'Update password'} <ArrowRight />
      </Button>
    </form>
  );
}
