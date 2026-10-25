import Link from 'next/link';
import { PyramidMark } from '@/components/app/logo';

export const LAST_UPDATED = '25 October 2026';

/** Readable prose frame for /privacy and /terms; public whether signed in or not. */
export function LegalShell({ kicker, title, children }: { kicker: string; title: string; children: React.ReactNode }) {
  return (
    <main className="relative z-10 mx-auto min-h-dvh max-w-2xl px-5 py-10">
      <div className="rise space-y-8">
        <Link href="/login" aria-label="Pyramid Coach — sign in" className="inline-block">
          <PyramidMark className="size-12" />
        </Link>
        <div>
          <p className="stamp text-muted-foreground">{kicker}</p>
          <h1 className="font-display mt-2 text-5xl leading-[0.9] font-extrabold uppercase">{title}</h1>
          <p className="text-muted-foreground mt-4 text-sm">Last updated: {LAST_UPDATED}</p>
        </div>
        <div className="space-y-8 text-[0.95rem] leading-relaxed">{children}</div>
        <nav className="border-border text-muted-foreground flex flex-wrap gap-x-4 gap-y-2 border-t pt-6 text-sm">
          <Link href="/login" className="text-foreground font-medium underline-offset-4 hover:underline">
            ← Back to sign in
          </Link>
          <Link href="/terms" className="underline-offset-4 hover:underline">
            Terms
          </Link>
          <Link href="/privacy" className="underline-offset-4 hover:underline">
            Privacy
          </Link>
        </nav>
      </div>
    </main>
  );
}

export function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-2xl leading-tight font-bold uppercase">{title}</h2>
      <div className="text-muted-foreground [&_li]:marker:text-volt [&_strong]:text-foreground [&_a]:text-foreground space-y-3 [&_a]:underline [&_a]:underline-offset-4 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  );
}

/** Operator contact: NEXT_PUBLIC_CONTACT_EMAIL when set, otherwise a neutral fallback with no mailto. */
export function ContactLine() {
  const email = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim();
  if (!email) return <>via the contact details provided in the app</>;
  return (
    <>
      by email at <a href={`mailto:${email}`}>{email}</a>
    </>
  );
}
