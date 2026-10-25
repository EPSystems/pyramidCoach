'use client';

import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { prettyDate } from '@/lib/utils/dates';

const AXIS = { stroke: 'var(--muted-foreground)', fontSize: 11, tickLine: false, axisLine: false } as const;
const GRID = <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />;

function TipBox({ title, rows }: { title: string; rows: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="bg-popover text-popover-foreground rounded-lg border px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="num flex items-center gap-2">
          {r.color && <span className="size-2 rounded-full" style={{ background: r.color }} />}
          <span className="text-muted-foreground">{r.label}</span>
          <span className="ml-auto font-semibold">{r.value}</span>
        </p>
      ))}
    </div>
  );
}

/** Single-series trend (e1RM per lift, first-set trend). Title names the series, so no legend. */
export function TrendLine({ data, unit, baseline, height = 160, label }: { data: { x: string; y: number }[]; unit: string; baseline?: number | null; height?: number; label: string }) {
  if (!data.length) return <p className="text-muted-foreground py-8 text-center text-sm">No data yet.</p>;
  return (
    <div style={{ height }} role="img" aria-label={`${label} trend`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          {GRID}
          <XAxis dataKey="x" {...AXIS} tickFormatter={(v: string) => prettyDate(v, { weekday: false })} minTickGap={24} />
          <YAxis {...AXIS} domain={['auto', 'auto']} width={44} />
          {baseline != null && <ReferenceLine y={baseline} stroke="var(--muted-foreground)" strokeDasharray="4 4" label={{ value: 'baseline', fill: 'var(--muted-foreground)', fontSize: 10, position: 'insideBottomLeft' }} />}
          <Tooltip
            cursor={{ stroke: 'var(--muted-foreground)', strokeDasharray: '3 3' }}
            content={({ active, payload }) =>
              active && payload?.length ? <TipBox title={prettyDate(String(payload[0].payload.x))} rows={[{ label, value: `${payload[0].value} ${unit}`, color: 'var(--chart-1)' }]} /> : null
            }
          />
          <Line type="monotone" dataKey="y" stroke="var(--chart-1)" strokeWidth={2} dot={{ r: 3, fill: 'var(--chart-1)', strokeWidth: 0 }} activeDot={{ r: 5, stroke: 'var(--card)', strokeWidth: 2 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** One muscle's weekly sets with its target band (small multiples share `max`). */
export function VolumeMini({ data, target, max, label }: { data: { week: string; sets: number }[]; target: number | null; max: number; label: string }) {
  return (
    <div className="h-24" role="img" aria-label={`${label} weekly sets`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 2, bottom: 0, left: 2 }} barCategoryGap={3}>
          <YAxis hide domain={[0, max]} />
          <XAxis dataKey="week" hide />
          {target != null && <ReferenceArea y1={Math.max(0, target - 1)} y2={target + 1} fill="var(--chart-1)" fillOpacity={0.14} stroke="none" />}
          <Tooltip
            cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <TipBox title={`Week of ${prettyDate(String(payload[0].payload.week))}`} rows={[{ label: 'Sets', value: String(payload[0].value) }, ...(target != null ? [{ label: 'Target', value: `${target - 1}–${target + 1}` }] : [])]} />
              ) : null
            }
          />
          <Bar dataKey="sets" fill="var(--chart-1)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface BwPoint {
  day: string;
  kg?: number | null;
  weekly?: number | null;
  running?: number | null;
  corridor?: [number, number] | null;
}

/** Bodyweight: daily points (muted), weekly averages and 14-day running average, optional target corridor. */
export function BodyweightChart({ data, unit, hideNumbers }: { data: BwPoint[]; unit: string; hideNumbers?: boolean }) {
  if (!data.length) return <p className="text-muted-foreground py-8 text-center text-sm">Log a morning weigh-in to start your trend.</p>;
  return (
    <div>
      <div className="h-56" role="img" aria-label="Bodyweight trend">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
            {GRID}
            <XAxis dataKey="day" {...AXIS} tickFormatter={(v: string) => prettyDate(v, { weekday: false })} minTickGap={28} />
            <YAxis {...AXIS} domain={['dataMin - 0.5', 'dataMax + 0.5']} width={44} hide={hideNumbers} tickFormatter={(v: number) => v.toFixed(1)} />
            <Tooltip
              cursor={{ stroke: 'var(--muted-foreground)', strokeDasharray: '3 3' }}
              content={({ active, payload }) => {
                if (!active || !payload?.length || hideNumbers) return null;
                const p = payload[0].payload as BwPoint;
                return (
                  <TipBox
                    title={prettyDate(p.day)}
                    rows={[
                      ...(p.kg != null ? [{ label: 'Weigh-in', value: `${p.kg} ${unit}` }] : []),
                      ...(p.weekly != null ? [{ label: 'Weekly avg', value: `${p.weekly} ${unit}`, color: 'var(--chart-1)' }] : []),
                      ...(p.running != null ? [{ label: '14-day avg', value: `${p.running} ${unit}`, color: 'var(--chart-2)' }] : []),
                    ]}
                  />
                );
              }}
            />
            <Area dataKey="corridor" stroke="none" fill="var(--chart-1)" fillOpacity={0.1} isAnimationActive={false} connectNulls />
            <Scatter dataKey="kg" fill="var(--muted-foreground)" fillOpacity={0.55} isAnimationActive={false} />
            <Line type="monotone" dataKey="running" stroke="var(--chart-2)" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
            <Line type="stepAfter" dataKey="weekly" stroke="var(--chart-1)" strokeWidth={2} dot={{ r: 4, fill: 'var(--chart-1)', stroke: 'var(--card)', strokeWidth: 2 }} connectNulls isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <ul className="text-muted-foreground mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Legend">
        <li className="flex items-center gap-1.5">
          <span className="bg-muted-foreground/60 size-2 rounded-full" /> Daily weigh-in
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded" style={{ background: 'var(--chart-1)' }} /> Weekly average
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded" style={{ background: 'var(--chart-2)' }} /> 14-day running average
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm" style={{ background: 'color-mix(in oklch, var(--chart-1) 18%, transparent)' }} /> Target rate corridor
        </li>
      </ul>
    </div>
  );
}

/** Sessions done vs planned per week. */
export function AdherenceBars({ data }: { data: { week: string; done: number; planned: number }[] }) {
  return (
    <div>
      <div className="h-40" role="img" aria-label="Sessions done versus planned per week">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -24 }} barGap={-14} barCategoryGap="30%">
            {GRID}
            <XAxis dataKey="week" {...AXIS} tickFormatter={(v: string) => prettyDate(v, { weekday: false })} />
            <YAxis {...AXIS} allowDecimals={false} width={36} />
            <Tooltip
              cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <TipBox
                    title={`Week of ${prettyDate(String(payload[0].payload.week))}`}
                    rows={[
                      { label: 'Done', value: String(payload[0].payload.done), color: 'var(--chart-1)' },
                      { label: 'Planned', value: String(payload[0].payload.planned) },
                    ]}
                  />
                ) : null
              }
            />
            <Bar dataKey="planned" fill="var(--muted)" radius={[4, 4, 0, 0]} barSize={14} isAnimationActive={false} />
            <Bar dataKey="done" fill="var(--chart-1)" radius={[4, 4, 0, 0]} barSize={14} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ul className="text-muted-foreground mt-1 flex gap-4 text-xs" aria-label="Legend">
        <li className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm" style={{ background: 'var(--chart-1)' }} /> Done
        </li>
        <li className="flex items-center gap-1.5">
          <span className="bg-muted size-3 rounded-sm border" /> Planned
        </li>
      </ul>
    </div>
  );
}
