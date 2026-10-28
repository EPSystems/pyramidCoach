'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, BookOpen, CalendarDays, ClipboardCheck, Dumbbell, LayoutGrid, Salad, Settings, Shield, Sparkles, TrendingUp, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Wordmark } from './logo';
import { useState } from 'react';

const MAIN = [
  { href: '/today', label: 'Today', icon: Dumbbell },
  { href: '/week', label: 'Week', icon: CalendarDays },
  { href: '/body', label: 'Body', icon: User },
  { href: '/progress', label: 'Progress', icon: TrendingUp },
];
const MORE = [
  { href: '/review', label: 'Review', icon: ClipboardCheck, badge: true },
  { href: '/nutrition', label: 'Nutrition', icon: Salad },
  { href: '/generate', label: 'Generate', icon: Sparkles },
  { href: '/library', label: 'Library', icon: BookOpen },
  { href: '/checkin', label: 'Check-in', icon: Activity },
  { href: '/settings', label: 'Settings', icon: Settings },
];

function Badge({ n }: { n: number }) {
  if (!n) return null;
  return <span className="bg-volt text-volt-ink num ml-auto grid min-w-5 place-items-center rounded-full px-1.5 text-[0.7rem] font-bold">{n}</span>;
}

export function Sidebar({ proposals, showAdmin }: { proposals: number; showAdmin: boolean }) {
  const path = usePathname();
  const items = [...MAIN, ...MORE, ...(showAdmin ? [{ href: '/admin', label: 'Admin', icon: Shield }] : [])];
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

export function BottomNav({ proposals, showAdmin }: { proposals: number; showAdmin: boolean }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const moreActive = [...MORE, { href: '/admin' }].some((m) => path.startsWith(m.href));
  return (
    <nav className="bg-background/85 pb-safe fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur-lg lg:hidden" aria-label="Main">
      <div className="mx-auto grid max-w-lg grid-cols-5">
        {MAIN.map((it) => {
          const active = path.startsWith(it.href);
          const Icon = it.icon;
          return (
            <Link key={it.href} href={it.href} aria-current={active ? 'page' : undefined} className="relative flex h-16 flex-col items-center justify-center gap-1 text-[0.7rem] font-medium">
              {active && <span className="bg-volt absolute top-0 h-0.5 w-8 rounded-full" />}
              <Icon className={cn('size-5', active ? 'text-volt' : 'text-muted-foreground')} />
              <span className={active ? 'text-foreground' : 'text-muted-foreground'}>{it.label}</span>
            </Link>
          );
        })}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger className="relative flex h-16 flex-col items-center justify-center gap-1 text-[0.7rem] font-medium" aria-label="More">
            {moreActive && <span className="bg-volt absolute top-0 h-0.5 w-8 rounded-full" />}
            <LayoutGrid className={cn('size-5', moreActive ? 'text-volt' : 'text-muted-foreground')} />
            <span className={moreActive ? 'text-foreground' : 'text-muted-foreground'}>More</span>
            {proposals > 0 && <span className="bg-volt absolute top-3 right-[30%] size-2 rounded-full" />}
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-3xl pb-8">
            <SheetHeader>
              <SheetTitle className="font-display text-2xl uppercase">More</SheetTitle>
            </SheetHeader>
            <div className="grid grid-cols-3 gap-2 px-4">
              {[...MORE, ...(showAdmin ? [{ href: '/admin', label: 'Admin', icon: Shield }] : [])].map((it) => {
                const Icon = it.icon;
                return (
                  <Link
                    key={it.href}
                    href={it.href}
                    onClick={() => setOpen(false)}
                    className="bg-muted/60 hover:bg-muted relative flex h-20 flex-col items-center justify-center gap-1.5 rounded-xl text-sm font-medium"
                  >
                    <Icon className="text-volt size-5" />
                    {it.label}
                    {'badge' in it && it.badge && proposals > 0 ? (
                      <span className="bg-volt text-volt-ink num absolute top-2 right-2 grid min-w-5 place-items-center rounded-full px-1 text-[0.65rem] font-bold">{proposals}</span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}
