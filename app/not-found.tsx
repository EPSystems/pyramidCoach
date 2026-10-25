import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="relative z-10 mx-auto max-w-md px-4 py-24 text-center">
      <p className="stamp text-muted-foreground">404</p>
      <h1 className="font-display mt-2 text-5xl font-extrabold uppercase">Not found</h1>
      <Button asChild className="mt-6">
        <Link href="/today">Back to Today</Link>
      </Button>
    </main>
  );
}
