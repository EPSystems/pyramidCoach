import type { Metadata } from 'next';
import { ResetForm } from './reset-form';
import { AuthHeading, AuthShell } from '@/components/app/auth/auth-shell';

export const metadata: Metadata = { title: 'Set a new password' };

/** Reached through the recovery link (/callback → recovery session); proxy.ts keeps it session-only. */
export default function ResetPasswordPage() {
  return (
    <AuthShell>
      <AuthHeading kicker="Account" title="New password">
        Choose a new password for your account.
      </AuthHeading>
      <ResetForm />
    </AuthShell>
  );
}
