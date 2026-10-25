import type { Metadata } from 'next';
import Link from 'next/link';
import { SignupForm } from './signup-form';
import { AuthHeading, AuthShell, OrDivider } from '@/components/app/auth/auth-shell';
import { GoogleButton } from '@/components/app/auth/google-button';

export const metadata: Metadata = { title: 'Create account' };

export default async function SignupPage({ searchParams }: PageProps<'/signup'>) {
  const sp = await searchParams;
  const next = typeof sp.next === 'string' ? sp.next : undefined;
  return (
    <AuthShell>
      <AuthHeading
        kicker="Free · v1"
        title={
          <>
            Start <span className="text-volt">training</span>
          </>
        }
      >
        Create an account and get a plan built from your goals, schedule and equipment.
      </AuthHeading>
      <div className="space-y-5">
        <GoogleButton next={next} />
        <OrDivider />
        <SignupForm />
        <p className="text-muted-foreground text-xs leading-relaxed">
          By creating an account you agree to the{' '}
          <Link href="/terms" className="text-foreground underline underline-offset-4">
            Terms
          </Link>{' '}
          and{' '}
          <Link href="/privacy" className="text-foreground underline underline-offset-4">
            Privacy policy
          </Link>
          .
        </p>
        <p className="text-muted-foreground text-sm">
          Already have an account?{' '}
          <Link href={next ? `/login?next=${encodeURIComponent(next)}` : '/login'} className="text-foreground font-medium underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
