'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { createLogger, errInfo } from '@/lib/log';

const log = createLogger('error-boundary/root');

export default function RootError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    log.error('render error', { err: errInfo(error) });
  }, [error]);
  return (
    <main className="relative z-10 mx-auto max-w-md px-4 py-24 text-center">
      <p className="stamp text-muted-foreground">Something went wrong</p>
      <h1 className="font-display mt-2 text-4xl font-extrabold uppercase">Missed rep</h1>
      <p className="text-muted-foreground mt-2 text-sm">An unexpected error occurred.</p>
      <Button className="mt-6" onClick={retry}>
        Try again
      </Button>
    </main>
  );
}
