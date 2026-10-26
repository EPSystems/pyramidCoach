import { createClient } from '@/lib/supabase/server';
import { createLogger } from '@/lib/log';

const log = createLogger('api/export');

export const dynamic = 'force-dynamic';

const TABLES = [
  'profiles',
  'user_settings',
  'user_sports',
  'injuries',
  'blocks',
  'weekly_targets',
  'planned_sessions',
  'planned_exercises',
  'logged_sets',
  'sport_logs',
  'checkins',
  'weekly_reviews',
  'nutrition_settings',
  'nutrition_targets',
  'proposals',
] as const;

function exportFailed(tables: string[]) {
  log.error('export incomplete, returning 500', { failedTables: tables.join(',') });
  return Response.json({ error: 'Export failed: some of your data could not be loaded. Please try again.', failed_tables: tables }, { status: 500 });
}

/** Data export of the caller's own rows (Section 10). RLS guarantees only their data is returned. */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const format = new URL(request.url).searchParams.get('format') ?? 'json';
  log.debug('export', { userId: user.id, format });

  if (format === 'csv') {
    const { data, error } = log.db(
      'select logged_sets (csv)',
      await supabase.from('logged_sets').select('performed_on, set_index, load_kg, reps, rir, is_warmup, exercises(name)').eq('user_id', user.id).order('performed_on'),
      { userId: user.id },
    );
    if (error) return exportFailed(['logged_sets']);
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = ['date,exercise,set,load_kg,reps,rir,warmup', ...(data ?? []).map((r) => [r.performed_on, (r.exercises as { name: string } | null)?.name, r.set_index + 1, r.load_kg, r.reps, r.rir, r.is_warmup].map(esc).join(','))];
    return new Response(lines.join('\n'), {
      headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="pyramid-coach-sets.csv"' },
    });
  }

  const out: Record<string, unknown> = { exported_at: new Date().toISOString(), user: { id: user.id, email: user.email } };
  // A partial export must not look complete, so any failed table fails the whole request.
  const failed: string[] = [];
  for (const t of TABLES) {
    const { data, error } = log.db(`select ${t}`, await supabase.from(t).select('*').eq('user_id', user.id), { userId: user.id });
    if (error) failed.push(t);
    out[t] = data ?? [];
  }
  const { data: custom, error: customErr } = log.db('select exercises (custom)', await supabase.from('exercises').select('*').eq('owner_user_id', user.id), { userId: user.id });
  if (customErr) failed.push('exercises');
  out.custom_exercises = custom ?? [];
  if (failed.length) return exportFailed(failed);
  return new Response(JSON.stringify(out, null, 2), {
    headers: { 'content-type': 'application/json', 'content-disposition': 'attachment; filename="pyramid-coach-export.json"' },
  });
}
