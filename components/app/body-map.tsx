'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { MuscleId } from '@/lib/engine/types';
import { MUSCLE_SHORT } from '@/lib/knowledge/muscles';
import { BACK, BACK_LINES, FRONT, FRONT_LINES, KNEES_FRONT, MIR, OUTLINE } from './body-geometry';

export interface MuscleStyle {
  fill?: string; // CSS colour
  dashed?: boolean; // injured / rehab (Section 8.5)
  label?: string; // aria/tooltip text
}

interface Props {
  styles?: Partial<Record<MuscleId, MuscleStyle>>;
  selected?: MuscleId | null;
  onSelect?: (m: MuscleId) => void;
  side?: 'front' | 'back' | 'both';
  className?: string;
  interactive?: boolean;
  defaultFill?: string;
}

function Figure({ view, styles, selected, onSelect, interactive, defaultFill }: Omit<Props, 'side' | 'className'> & { view: 'front' | 'back' }) {
  const regions = view === 'front' ? FRONT : BACK;
  const lines = view === 'front' ? FRONT_LINES : BACK_LINES;
  const base = defaultFill ?? 'color-mix(in oklch, var(--foreground) 9%, var(--card))';
  const seen = new Set<string>();
  return (
    <svg viewBox="0 0 220 470" className="h-full w-full" role="group" aria-label={`${view === 'front' ? 'Front' : 'Back'} of body`}>
      <g transform="translate(10,0)">
        <path d={`${OUTLINE} Z`} fill="color-mix(in oklch, var(--foreground) 4%, var(--card))" />
        <path d={`${OUTLINE} Z`} transform={MIR} fill="color-mix(in oklch, var(--foreground) 4%, var(--card))" />
        {regions.map(([m, d], i) => {
          const st = m ? styles?.[m] : undefined;
          const isSel = m && selected === m;
          const fill = m ? (st?.fill ?? base) : 'color-mix(in oklch, var(--foreground) 6%, var(--card))';
          // Only the first path of a muscle is focusable; the rest share the same handler.
          const focusable = !!m && interactive && !seen.has(m);
          if (m) seen.add(m);
          const common = {
            d,
            fill,
            stroke: isSel ? 'var(--volt)' : st?.dashed ? 'var(--danger)' : 'var(--background)',
            strokeWidth: isSel ? 1.8 : st?.dashed ? 1.4 : 0.8,
            strokeDasharray: st?.dashed ? '3 2' : undefined,
            className: cn(m && interactive && 'cursor-pointer transition-[fill,opacity] hover:opacity-80'),
          };
          const handlers =
            m && interactive
              ? {
                  onClick: () => onSelect?.(m),
                  onKeyDown: (e: React.KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelect?.(m);
                    }
                  },
                }
              : {};
          return (
            <g key={i}>
              <path
                {...common}
                {...handlers}
                role={focusable ? 'button' : undefined}
                tabIndex={focusable ? 0 : undefined}
                aria-label={focusable ? `${MUSCLE_SHORT[m!]}${st?.label ? `: ${st.label}` : ''}` : undefined}
                aria-pressed={focusable ? !!isSel : undefined}
              >
                {m && <title>{`${MUSCLE_SHORT[m]}${st?.label ? ` — ${st.label}` : ''}`}</title>}
              </path>
              <path {...common} {...handlers} transform={MIR} aria-hidden />
            </g>
          );
        })}
        {view === 'front' &&
          KNEES_FRONT.map(([cx, cy, rx, ry], i) => (
            <g key={`k${i}`} fill="color-mix(in oklch, var(--foreground) 10%, var(--card))" pointerEvents="none">
              <ellipse cx={cx} cy={cy} rx={rx} ry={ry} />
              <ellipse cx={cx} cy={cy} rx={rx} ry={ry} transform={MIR} />
            </g>
          ))}
        <g fill="none" stroke="color-mix(in oklch, var(--foreground) 18%, transparent)" strokeWidth={0.7} pointerEvents="none">
          {lines.map((d, i) => (
            <g key={i}>
              <path d={d} />
              <path d={d} transform={MIR} />
            </g>
          ))}
          <path d={OUTLINE} stroke="color-mix(in oklch, var(--foreground) 30%, transparent)" />
          <path d={OUTLINE} transform={MIR} stroke="color-mix(in oklch, var(--foreground) 30%, transparent)" />
        </g>
      </g>
    </svg>
  );
}

export function BodyMap({ side = 'both', className, interactive = true, ...rest }: Props) {
  const [view, setView] = useState<'front' | 'back'>('front');
  if (side === 'both') {
    return (
      <div className={cn('grid grid-cols-2 gap-2', className)}>
        <div>
          <Figure view="front" interactive={interactive} {...rest} />
          <p className="stamp text-muted-foreground text-center">Front</p>
        </div>
        <div>
          <Figure view="back" interactive={interactive} {...rest} />
          <p className="stamp text-muted-foreground text-center">Back</p>
        </div>
      </div>
    );
  }
  return (
    <div className={className}>
      <div className="mb-2 flex justify-center">
        <div className="bg-muted inline-flex rounded-lg p-1" role="tablist" aria-label="Body side">
          {(['front', 'back'] as const).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={cn('h-9 rounded-md px-4 text-sm font-medium capitalize', view === v ? 'bg-background shadow-sm' : 'text-muted-foreground')}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
      <Figure view={view} interactive={interactive} {...rest} />
    </div>
  );
}
