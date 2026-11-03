import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="relative z-10 mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="font-display text-5xl font-extrabold uppercase">Page not found</h1>
      <p className="text-muted-foreground mt-2 text-sm">This link may be out of date. Your training is safe on Today.</p>
      <Button asChild className="mt-6">
        <Link href="/today">Go to Today</Link>
      </Button>
    </main>
  );
}
