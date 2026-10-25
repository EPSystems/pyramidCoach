import type { Metadata } from 'next';
import { requireOnboarded } from '@/lib/server/context';
import { PageHeader } from '@/components/app/bits';
import { CheckinCard } from '@/components/app/checkin-card';
import type { MuscleId } from '@/lib/engine/types';
import { prettyDate } from '@/lib/utils/dates';

export const metadata: Metadata = { title: 'Check-in' };

export default async function CheckinPage() {
  const ctx = await requireOnboarded();
  const { supabase, user, today } = ctx;
  const [{ data: c }, { data: prev }, { data: recent }] = await Promise.all([
    supabase.from('checkins').select('*').eq('user_id', user.id).eq('day', today).maybeSingle(),
    supabase.from('checkins').select('sleep_hours').eq('user_id', user.id).lt('day', today).not('sleep_hours', 'is', null).order('day', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('checkins').select('*').eq('user_id', user.id).lt('day', today).order('day', { ascending: false }).limit(7),
  ]);
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader kicker={prettyDate(today)} title="Check-in" />
      <div className="space-y-4 px-4 sm:px-6">
        <section className="bg-card rounded-2xl border p-5">
          <CheckinCard
            units={ctx.units}
            hideWeight={!!ctx.profile.hide_bodyweight}
            initial={{
              sleepHours: c?.sleep_hours ?? prev?.sleep_hours ?? null,
              energy: c?.energy ?? null,
              stress: c?.stress ?? null,
              soreness: (c?.soreness as Partial<Record<MuscleId, 'sore' | 'pain'>>) ?? {},
              bodyweightKg: c?.bodyweight_kg ?? null,
            }}
          />
        </section>
        {(recent?.length ?? 0) > 0 && (
          <section className="bg-card rounded-2xl border p-5">
            <h2 className="font-display text-xl font-bold uppercase">Last 7 days</h2>
            <table className="num mt-2 w-full text-sm">
              <thead className="text-muted-foreground text-left text-xs">
                <tr>
                  <th className="py-1 font-medium">Day</th>
                  <th className="font-medium">Sleep</th>
                  <th className="font-medium">Energy</th>
                  <th className="font-medium">Stress</th>
                  <th className="font-medium">Sore</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {recent!.map((r) => (
                  <tr key={r.day}>
                    <td className="py-1.5">{prettyDate(r.day)}</td>
                    <td>{r.sleep_hours ?? '—'}</td>
                    <td>{r.energy ?? '—'}</td>
                    <td>{r.stress ?? '—'}</td>
                    <td>{Object.keys((r.soreness as object) ?? {}).length || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </div>
  );
}
