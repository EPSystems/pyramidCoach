'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { createLogger, errInfo } from '@/lib/log';

const log = createLogger('error-boundary/app');

// retry() re-fetches and re-renders the segment (unlike reset(), which only re-renders on the client), so it can recover
// from a transient server component error (a failed Supabase read, say).
export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    log.error('render error', { err: errInfo(error) });
  }, [error]);
  const message = error instanceof Error && error.message ? error.message : 'An unexpected error occurred.';
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <p className="stamp text-muted-foreground">Something went wrong</p>
      <h1 className="font-display mt-2 text-4xl font-extrabold uppercase">Missed rep</h1>
      <p className="text-muted-foreground mt-2 text-sm">{message}</p>
      <Button className="mt-6" onClick={() => retry()}>
        Try again
      </Button>
    </div>
  );
}
