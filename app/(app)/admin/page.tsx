import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireOnboarded } from '@/lib/server/context';
import { PageHeader } from '@/components/app/bits';
import { prettyDate } from '@/lib/utils/dates';
import { AdminClient } from './client';

export const metadata: Metadata = { title: 'Admin' };

export default async function AdminPage() {
  const ctx = await requireOnboarded();
  if (!ctx.isOwner) notFound();
  const { supabase } = ctx;
  const [{ data: users }, { data: rules }, { data: sports }, { data: exercises }] = await Promise.all([
    supabase.rpc('admin_list_users'),
    supabase.from('rule_sources').select('*').order('id'),
    supabase.from('sports').select('id, name, lower_body_load, upper_body_load, eccentric_impact, conditioning').is('owner_user_id', null).order('name'),
    supabase.from('exercises').select('id, name, cues, mistakes').is('owner_user_id', null).order('name'),
  ]);
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader kicker="Owner" title="Admin" />
      <div className="space-y-4 px-4 sm:px-6 lg:px-8">
        <AdminClient
          users={(users ?? []).map((u) => ({ email: u.email ?? '', name: u.display_name ?? '', role: u.role, joined: u.joined ? prettyDate(u.joined.slice(0, 10)) : '-', lastActive: u.last_active ? prettyDate(u.last_active.slice(0, 10)) : '-', onboarded: u.onboarded }))}
          exercises={(exercises ?? []).map((e) => ({ id: e.id, name: e.name, cues: e.cues, mistakes: e.mistakes }))}
        />
        <section className="bg-card rounded-2xl border p-5">
          <h2 className="font-display text-2xl font-bold uppercase">Sport catalog</h2>
          <table className="num mt-2 w-full text-sm">
            <thead className="text-muted-foreground text-left text-xs">
              <tr>
                <th className="py-1 font-medium">Sport</th>
                <th className="font-medium">Legs</th>
                <th className="font-medium">Upper</th>
                <th className="font-medium">Impact</th>
                <th className="font-medium">Lungs</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {(sports ?? []).map((s) => (
                <tr key={s.id}>
                  <td className="py-1.5">{s.name}</td>
                  <td>{s.lower_body_load}</td>
                  <td>{s.upper_body_load}</td>
                  <td>{s.eccentric_impact}</td>
                  <td>{s.conditioning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="bg-card rounded-2xl border p-5">
          <h2 className="font-display text-2xl font-bold uppercase">Rule sources ({rules?.length})</h2>
          <ul className="mt-2 max-h-96 divide-y overflow-y-auto text-sm">
            {(rules ?? []).map((r) => (
              <li key={r.id} className="grid grid-cols-[6rem_1fr] gap-2 py-1.5">
                <span className="stamp">
                  {r.id}
                  <span className="text-muted-foreground block">
                    {r.source}
                    {r.page ? ` p.${r.page}` : ''}
                  </span>
                </span>
                <span className="text-muted-foreground">{r.summary}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
