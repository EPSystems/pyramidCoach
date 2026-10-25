'use client';

import { Button } from '@/components/ui/button';

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <p className="stamp text-muted-foreground">Something went wrong</p>
      <h1 className="font-display mt-2 text-4xl font-extrabold uppercase">Missed rep</h1>
      <p className="text-muted-foreground mt-2 text-sm">{error.message || 'An unexpected error occurred.'}</p>
      <Button className="mt-6" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
