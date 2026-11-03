'use client';

import Link from 'next/link';
import { ChevronLeft, HelpCircle, Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { RULES, ruleSourceLabel } from '@/lib/knowledge/rules';
import { whyText } from '@/lib/knowledge/explanations';

/** "Why?" chip: rule IDs, one-sentence reason, and source (Section 8). */
export function Why({ ruleIds, className, label = 'Why?' }: { ruleIds: string[]; className?: string; label?: string }) {
  const ids = [...new Set(ruleIds)].filter((id) => RULES[id]);
  if (!ids.length) return null;
  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          'hit-44 text-muted-foreground hover:text-foreground inline-flex h-7 items-center gap-1 rounded-full border px-2 text-xs font-medium transition-colors',
          className,
        )}
        aria-label={`Why? Rules ${ids.join(', ')}`}
      >
        <HelpCircle className="size-3.5" />
        {label}
      </PopoverTrigger>
      <PopoverContent className="w-[min(22rem,calc(100vw-2rem))] p-0" align="start">
        <ul className="divide-y">
          {ids.map((id) => (
            <li key={id} className="space-y-1 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="rule-id bg-accent text-accent-foreground rounded px-1.5 py-0.5">{id}</span>
                <span className={cn('text-xs', RULES[id].source === 'GEN' || RULES[id].source === 'APP' ? 'text-warn' : 'text-muted-foreground')}>
                  {ruleSourceLabel(id)}
                </span>
              </div>
              <p className="text-sm leading-snug">{whyText(id)}</p>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

export function Stepper({
  value,
  onChange,
  step = 1,
  min = 0,
  max = 9999,
  format,
  label,
  className,
  size = 'md',
}: {
  value: number | null;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  format?: (v: number | null) => string;
  label: string;
  className?: string;
  size?: 'md' | 'lg';
}) {
  const v = value ?? 0;
  const round = (x: number) => Math.round(x * 1000) / 1000;
  const btn = cn('grid shrink-0 place-items-center rounded-lg bg-muted active:bg-accent transition-colors', size === 'lg' ? 'size-12' : 'size-11');
  return (
    <div className={cn('flex items-center gap-1', className)} role="group" aria-label={label}>
      <button type="button" className={btn} onClick={() => onChange(Math.max(min, round(v - step)))} aria-label={`Decrease ${label}`}>
        <Minus className="size-4" />
      </button>
      <output className={cn('num min-w-[3.5rem] text-center font-semibold', size === 'lg' ? 'text-xl' : 'text-lg')} aria-live="polite" aria-label={label}>
        {format ? format(value) : value ?? '-'}
      </output>
      <button type="button" className={btn} onClick={() => onChange(Math.min(max, round((value ?? min) + (value == null ? 0 : step))))} aria-label={`Increase ${label}`}>
        <Plus className="size-4" />
      </button>
    </div>
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: { value: T; label: React.ReactNode }[];
  value: T | null;
  onChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  // One tab stop for the group; the arrow keys move between options, as with native radio buttons.
  const current = options.findIndex((o) => o.value === value);
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = (Math.max(current, 0) + dir + options.length) % options.length;
    onChange(options[next].value);
    (e.currentTarget.children[next] as HTMLElement | undefined)?.focus();
  };
  return (
    <div className={cn('bg-muted/70 flex gap-1 rounded-xl p-1', className)} role="radiogroup" aria-label={label} onKeyDown={onKeyDown}>
      {options.map((o, i) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          tabIndex={i === Math.max(current, 0) ? 0 : -1}
          onClick={() => onChange(o.value)}
          className={cn(
            'num h-11 min-w-0 flex-1 rounded-lg px-2 text-sm font-semibold transition-all',
            value === o.value ? 'bg-volt text-volt-ink shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chip({ active, onClick, children, className }: { active: boolean; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors',
        active ? 'border-volt bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground',
        className,
      )}
    >
      {children}
    </button>
  );
}

/** `back`: the parent screen, for pages outside the tabs (phone only; the sidebar is always there on desktop). */
export function PageHeader({ kicker, title, children, className, back }: { kicker?: React.ReactNode; title: React.ReactNode; children?: React.ReactNode; className?: string; back?: { href: string; label: string } }) {
  return (
    <header className={cn('flex flex-wrap items-end justify-between gap-3 px-4 pt-6 pb-4 sm:px-6 lg:px-8 lg:pt-8', back && 'pt-1', className)}>
      {back && (
        <Link href={back.href} className="text-muted-foreground -ml-1.5 inline-flex h-11 basis-full items-center gap-0.5 text-[0.95rem] font-medium lg:hidden">
          <ChevronLeft className="size-5" /> {back.label}
        </Link>
      )}
      <div className="min-w-0">
        {kicker && <p className="stamp text-muted-foreground">{kicker}</p>}
        <h1 className="font-display mt-1 text-4xl leading-none font-extrabold uppercase sm:text-5xl">{title}</h1>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}

/** Block progress as stacked pyramid tiers: one tier per week, current week lit. */
export function PyramidMeter({ weeks, current, marks = {} }: { weeks: number; current: number; marks?: Record<number, 'intro' | 'deload'> }) {
  return (
    <div className="flex flex-col items-center gap-[3px]" aria-label={`Week ${current + 1} of ${weeks}`} role="img">
      {Array.from({ length: weeks }, (_, i) => weeks - 1 - i).map((w) => {
        const width = 30 + (70 * (weeks - 1 - w)) / Math.max(1, weeks - 1);
        return (
          <div
            key={w}
            style={{ width: `${width}%` }}
            className={cn(
              'h-[7px] rounded-[2px] transition-colors',
              w < current ? 'bg-volt/45' : w === current ? 'bg-volt' : 'bg-muted-foreground/20',
              marks[w] === 'deload' && 'bg-warn/70',
              marks[w] === 'intro' && w !== current && 'outline-volt/60 outline outline-1',
            )}
          />
        );
      })}
    </div>
  );
}

export function Stat({ label, value, sub, className }: { label: string; value: React.ReactNode; sub?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <p className="stamp text-muted-foreground">{label}</p>
      <p className="font-display num mt-0.5 text-3xl leading-none font-bold">{value}</p>
      {sub && <p className="text-muted-foreground mt-1 text-xs">{sub}</p>}
    </div>
  );
}
