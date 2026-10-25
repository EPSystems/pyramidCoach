import { cn } from '@/lib/utils';

/** Three stacked tiers — the pyramid of priorities, read bottom-up. */
export function PyramidMark({ className, lit = 3 }: { className?: string; lit?: number }) {
  const tiers = [
    { x: 2, w: 28, y: 22 },
    { x: 7, w: 18, y: 14 },
    { x: 12, w: 8, y: 6 },
  ];
  return (
    <svg viewBox="0 0 32 30" className={cn('size-7', className)} aria-hidden>
      {tiers.map((t, i) => (
        <rect
          key={i}
          x={t.x}
          y={t.y}
          width={t.w}
          height={6}
          rx={1.2}
          className={i < lit ? 'fill-volt' : 'fill-muted-foreground/30'}
        />
      ))}
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2', className)}>
      <PyramidMark />
      <span className="font-display text-xl leading-none font-extrabold tracking-wide uppercase">
        Pyramid<span className="text-volt">Coach</span>
      </span>
    </span>
  );
}
