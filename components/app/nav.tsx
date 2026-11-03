'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, BookOpen, CalendarDays, ClipboardCheck, Dumbbell, PersonStanding, Salad, Settings, Shield, Sparkles, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Wordmark } from './logo';

const TABS = [
  { href: '/today', label: 'Today', icon: Dumbbell },
  { href: '/week', label: 'Week', icon: CalendarDays },
  { href: '/body', label: 'Body', icon: PersonStanding },
  { href: '/progress', label: 'Progress', icon: TrendingUp },
  { href: '/nutrition', label: 'Nutrition', icon: Salad },
];
// Sidebar only. On a phone these open from Today, which stays the selected tab while they're on screen.
const SECONDARY = [
  { href: '/review', label: 'Review', icon: ClipboardCheck, badge: true },
  { href: '/generate', label: 'Generate', icon: Sparkles },
  { href: '/library', label: 'Library', icon: BookOpen },
  { href: '/checkin', label: 'Check-in', icon: Activity },
  { href: '/settings', label: 'Settings', icon: Settings },
];

function Badge({ n }: { n: number }) {
  if (!n) return null;
  return <span className="bg-volt text-volt-ink num ml-auto grid min-w-5 place-items-center rounded-full px-1.5 text-xs font-bold">{n}</span>;
}

export function Sidebar({ proposals, showAdmin }: { proposals: number; showAdmin: boolean }) {
  const path = usePathname();
  const items = [...TABS, ...SECONDARY, ...(showAdmin ? [{ href: '/admin', label: 'Admin', icon: Shield }] : [])];
  return (
    <aside className="bg-card/60 sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r px-3 py-5 backdrop-blur lg:flex">
      <Link href="/today" className="px-2">
        <Wordmark />
      </Link>
      <nav className="mt-8 flex flex-col gap-1" aria-label="Main">
        {items.map((it) => {
          const active = path.startsWith(it.href);
          const Icon = it.icon;
          return (
            <Link
              key={it.href}
              href={it.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex h-11 items-center gap-3 rounded-lg px-3 text-[0.95rem] font-medium transition-colors',
                active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Icon className="size-[1.15rem]" />
              {it.label}
              {'badge' in it && it.badge ? <Badge n={proposals} /> : null}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

export function BottomNav({ proposals }: { proposals: number }) {
  const path = usePathname();
  // A session is a focused, self-contained task with its own Back and Finish, so the tab bar steps aside.
  if (path.startsWith('/session/')) return null;
  const inTab = TABS.some((t) => path.startsWith(t.href));
  return (
    <nav className="bar-material pb-safe fixed inset-x-0 bottom-0 z-40 border-t lg:hidden" aria-label="Main">
      <div className="mx-auto grid max-w-lg grid-cols-5">
        {TABS.map((it) => {
          const active = path.startsWith(it.href) || (!inTab && it.href === '/today');
          const Icon = it.icon;
          const badge = it.href === '/today' ? proposals : 0;
          return (
            <Link
              key={it.href}
              href={it.href}
              aria-current={active ? 'page' : undefined}
              aria-label={badge ? `${it.label}, ${badge} proposal${badge > 1 ? 's' : ''} waiting` : undefined}
              className="relative flex min-h-16 flex-col items-center justify-center gap-1 py-1 text-xs font-medium"
            >
              {active && <span className="bg-volt absolute top-0 h-0.5 w-8 rounded-full" />}
              <span className="relative">
                <Icon className={cn('size-6', active ? 'text-volt' : 'text-muted-foreground')} strokeWidth={active ? 2.5 : 2} />
                {badge > 0 && <span className="bg-volt text-volt-ink num absolute -top-1 -right-2.5 grid h-4.5 min-w-4.5 place-items-center rounded-full px-1 text-xs leading-none font-bold">{badge}</span>}
              </span>
              <span className={active ? 'text-foreground' : 'text-muted-foreground'}>{it.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
