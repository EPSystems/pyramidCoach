import { BottomNav, Sidebar } from '@/components/app/nav';
import { ThemeSync } from '@/components/app/theme-sync';
import type { ThemePref } from '@/components/providers';
import { requireOnboarded } from '@/lib/server/context';
import { expireProposals } from '@/lib/server/proposals';

export default async function AppLayout({ children }: LayoutProps<'/'>) {
  const ctx = await requireOnboarded();
  // Run in parallel: the count applies the same cutoff as expireProposals (expires_on < today), so it never counts what is being expired.
  const [, { count }] = await Promise.all([
    expireProposals(ctx.supabase, ctx.user.id, ctx.today),
    ctx.supabase
      .from('proposals')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', ctx.user.id)
      .eq('status', 'pending')
      .or(`expires_on.is.null,expires_on.gte.${ctx.today}`),
  ]);
  return (
    <div className="relative z-10 flex min-h-dvh">
      <ThemeSync theme={(ctx.profile.theme as ThemePref | null) ?? null} />
      <Sidebar proposals={count ?? 0} showAdmin={ctx.isAdmin} />
      <main className="min-w-0 flex-1 pb-24 lg:pb-10">{children}</main>
      <BottomNav proposals={count ?? 0} showAdmin={ctx.isAdmin} />
    </div>
  );
}
