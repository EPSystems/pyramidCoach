import { BottomNav, Sidebar } from '@/components/app/nav';
import { requireOnboarded } from '@/lib/server/context';
import { expireProposals } from '@/lib/server/proposals';

export default async function AppLayout({ children }: LayoutProps<'/'>) {
  const ctx = await requireOnboarded();
  await expireProposals(ctx.supabase, ctx.user.id, ctx.today);
  const { count } = await ctx.supabase.from('proposals').select('id', { count: 'exact', head: true }).eq('user_id', ctx.user.id).eq('status', 'pending');
  return (
    <div className="relative z-10 flex min-h-dvh">
      <Sidebar proposals={count ?? 0} isOwner={ctx.isOwner} />
      <main className="min-w-0 flex-1 pb-24 lg:pb-10">{children}</main>
      <BottomNav proposals={count ?? 0} isOwner={ctx.isOwner} />
    </div>
  );
}
