import type { Metadata } from 'next';
import Link from 'next/link';
import { MailCheck } from 'lucide-react';
import { AuthHeading, AuthShell } from '@/components/app/auth/auth-shell';
import { ResendButton } from '@/components/app/auth/resend-button';

export const metadata: Metadata = { title: 'Confirm your email' };

export default async function CheckEmailPage({ searchParams }: PageProps<'/signup/check-email'>) {
  const sp = await searchParams;
  const email = typeof sp.email === 'string' ? sp.email : undefined;
  return (
    <AuthShell>
      <AuthHeading kicker="Almost there" title="Confirm your email" />
      <div className="bg-card space-y-4 rounded-2xl border p-5" role="status">
        <MailCheck className="text-volt size-7" aria-hidden />
        <p className="text-muted-foreground text-sm">
          We sent a confirmation link to {email ? <span className="text-foreground font-medium">{email}</span> : 'your email address'}. Open it to activate your account.
          It works on any device or browser.
        </p>
        <p className="text-muted-foreground text-xs">Nothing after a few minutes? Check your spam folder.</p>
        {/* An email was just sent, so start in cooldown. */}
        {email && <ResendButton email={email} coolingDown />}
      </div>
      <p className="text-muted-foreground text-sm">
        Already confirmed?{' '}
        <Link href="/login" className="text-foreground font-medium underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  );
}
