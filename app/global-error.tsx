'use client';

import { useEffect } from 'react';
import { createLogger, errInfo } from '@/lib/log';

const log = createLogger('error-boundary/global');

// Replaces the root layout, so no globals.css or Button here: plain inline styles that read in light and dark.
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    log.error('root layout error', { err: errInfo(error) });
  }, [error]);
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', textAlign: 'center', padding: '96px 16px', colorScheme: 'light dark' }}>
        <title>Something went wrong</title>
        <h1 style={{ fontSize: 28, fontWeight: 800, textTransform: 'uppercase' }}>Something went wrong</h1>
        <p style={{ opacity: 0.7 }}>An unexpected error occurred.</p>
        <button onClick={retry} style={{ marginTop: 24, padding: '10px 20px', fontWeight: 600, cursor: 'pointer' }}>
          Try again
        </button>
      </body>
    </html>
  );
}
