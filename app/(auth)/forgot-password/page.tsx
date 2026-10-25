import type { Metadata } from 'next';
import Link from 'next/link';
import { ForgotForm } from './forgot-form';
import { AuthHeading, AuthShell } from '@/components/app/auth/auth-shell';

export const metadata: Metadata = { title: 'Forgot password' };

export default function ForgotPasswordPage() {
  return (
    <AuthShell>
      <AuthHeading kicker="Account" title="Forgot password">
        Enter your email and we’ll send you a link to set a new password.
      </AuthHeading>
      <div className="space-y-5">
        <ForgotForm />
        <p className="text-muted-foreground text-sm">
          Remembered it?{' '}
          <Link href="/login" className="text-foreground font-medium underline-offset-4 hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
