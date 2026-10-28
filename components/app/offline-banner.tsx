'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { CloudOff, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { flushOutbox, onOutboxChange, pendingSets } from '@/lib/offline/outbox';
import { cn } from '@/lib/utils';

const RETRY_MS = 30_000;

const subscribe = (cb: () => void) => {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
};

export function useOnline() {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}

/**
 * Thin status strip at the top of the app: shows when the phone is offline and how many sets are waiting to sync.
 * It also owns syncing: the outbox is flushed on load and whenever the connection comes back.
 */
export function OfflineBanner() {
  const online = useOnline();
  const router = useRouter();
  const [pending, setPending] = useState(0);

  useEffect(() => {
    let alive = true;
    const recount = () => void pendingSets().then((s) => alive && setPending(s.length));
    const flush = async () => {
      if (!navigator.onLine) return;
      const out = await flushOutbox();
      if (out.synced.length) {
        toast.success(`${out.synced.length} offline ${out.synced.length === 1 ? 'set' : 'sets'} synced`);
        router.refresh();
      }
      if (out.failed.length) toast.error(`${out.failed.length} offline ${out.failed.length === 1 ? 'set' : 'sets'} could not be saved`, { description: out.failed[0].error });
    };
    recount();
    void flush();
    const off = onOutboxChange(recount);
    window.addEventListener('online', flush);
    // `online` can fire before the network really works (captive Wi-Fi, one bar); keep retrying while sets wait.
    const retry = setInterval(() => void pendingSets().then((s) => (s.length ? flush() : undefined)), RETRY_MS);
    return () => {
      alive = false;
      off();
      clearInterval(retry);
      window.removeEventListener('online', flush);
    };
  }, [router]);

  if (online && pending === 0) return null;
  return (
    <div
      role="status"
      className={cn('flex items-center justify-center gap-2 px-4 py-1.5 text-xs font-medium', online ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground')}
    >
      {online ? <RefreshCw className="size-3.5 animate-spin" /> : <CloudOff className="size-3.5" />}
      {online
        ? `Syncing ${pending} ${pending === 1 ? 'set' : 'sets'}…`
        : pending
          ? `Offline · ${pending} ${pending === 1 ? 'set' : 'sets'} saved on this phone, will sync when you're back online`
          : "Offline · sets you log are saved on this phone and sync when you're back online"}
    </div>
  );
}
