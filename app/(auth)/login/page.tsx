import type { Metadata } from 'next';
import { LoginForm } from './login-form';
import { PyramidMark } from '@/components/app/logo';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const sp = await searchParams;
  return (
    <main className="relative z-10 mx-auto flex min-h-dvh max-w-md flex-col justify-between px-5 py-10">
      <div className="rise space-y-8">
        <PyramidMark className="size-14" />
        <div>
          <p className="stamp text-muted-foreground">Invite only · v1</p>
          <h1 className="font-display mt-2 text-6xl leading-[0.85] font-extrabold uppercase">
            Pyramid
            <br />
            <span className="text-volt">Coach</span>
          </h1>
          <p className="text-muted-foreground mt-4 max-w-xs text-[0.95rem] leading-relaxed">
            A training plan that writes itself from evidence-based rules, runs your sessions at the gym, and adapts every week.
          </p>
        </div>
        <LoginForm linkError={sp.error === 'link'} />
      </div>
      <p className="text-muted-foreground mt-10 text-xs leading-relaxed">
        General training and nutrition guidance — not a substitute for a doctor or physiotherapist.
      </p>
    </main>
  );
}
