import { BottomNav, Sidebar } from '@/components/app/nav';
import { OfflineBanner } from '@/components/app/offline-banner';
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
      <Sidebar proposals={count ?? 0} isOwner={ctx.isOwner} />
      <main className="min-w-0 flex-1 pb-24 lg:pb-10">
        <OfflineBanner />
        {children}
      </main>
      <BottomNav proposals={count ?? 0} isOwner={ctx.isOwner} />
    </div>
  );
}
