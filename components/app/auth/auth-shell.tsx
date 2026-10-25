import Link from 'next/link';
import { PyramidMark } from '@/components/app/logo';

/** Shared frame for every signed-out screen: mark, content, disclaimer footer. */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative z-10 mx-auto flex min-h-dvh max-w-md flex-col justify-between px-5 py-10">
      <div className="rise space-y-8">
        <Link href="/login" aria-label="Pyramid Coach — sign in" className="inline-block">
          <PyramidMark className="size-14" />
        </Link>
        {children}
      </div>
      <p className="text-muted-foreground mt-10 text-xs leading-relaxed">
        General training and nutrition guidance — not a substitute for a doctor or physiotherapist.
      </p>
    </main>
  );
}

export function AuthHeading({ kicker, title, children }: { kicker: string; title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div>
      <p className="stamp text-muted-foreground">{kicker}</p>
      <h1 className="font-display mt-2 text-5xl leading-[0.9] font-extrabold uppercase">{title}</h1>
      {children && <div className="text-muted-foreground mt-4 max-w-xs text-[0.95rem] leading-relaxed">{children}</div>}
    </div>
  );
}

export function OrDivider() {
  return (
    <div className="flex items-center gap-3" role="separator" aria-label="or">
      <span className="bg-border h-px flex-1" />
      <span className="stamp text-muted-foreground">or</span>
      <span className="bg-border h-px flex-1" />
    </div>
  );
}

/** Small inline error under a field; pair `id` with the input's aria-describedby. */
export function FieldError({ id, children }: { id: string; children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p id={id} className="text-danger text-sm">
      {children}
    </p>
  );
}
