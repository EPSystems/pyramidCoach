import type { Metadata } from 'next';
import Link from 'next/link';
import { LoginForm } from './login-form';
import { AuthShell, OrDivider } from '@/components/app/auth/auth-shell';
import { GoogleButton } from '@/components/app/auth/google-button';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const sp = await searchParams;
  const next = typeof sp.next === 'string' ? sp.next : undefined;
  return (
    <AuthShell>
      <div>
        <p className="stamp text-muted-foreground">v1</p>
        <h1 className="font-display mt-2 text-6xl leading-[0.85] font-extrabold uppercase">
          Pyramid
          <br />
          <span className="text-volt">Coach</span>
        </h1>
        <p className="text-muted-foreground mt-4 max-w-xs text-[0.95rem] leading-relaxed">
          A training plan that writes itself from evidence-based rules, runs your sessions at the gym, and adapts every week.
        </p>
      </div>
      <div className="space-y-5">
        {sp.error === 'link' && (
          <p className="border-danger/40 text-danger rounded-xl border px-4 py-3 text-sm" role="alert">
            That link expired or was already used.
          </p>
        )}
        <GoogleButton next={next} />
        <OrDivider />
        <LoginForm next={next} />
        <p className="text-muted-foreground text-sm">
          New here?{' '}
          <Link href={next ? `/signup?next=${encodeURIComponent(next)}` : '/signup'} className="text-foreground font-medium underline-offset-4 hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
