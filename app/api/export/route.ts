import { createClient } from '@/lib/supabase/server';
import { fetchAllPages } from '@/lib/server/queries';
import { createLogger } from '@/lib/log';

const log = createLogger('api/export');

export const dynamic = 'force-dynamic';

// Each table with the columns that give its rows a total order, so paging past the 1000-row cap is stable.
const TABLES = {
  profiles: ['user_id'],
  user_settings: ['user_id'],
  user_sports: ['id'],
  injuries: ['id'],
  blocks: ['id'],
  weekly_targets: ['block_id', 'week_index', 'muscle_id'],
  planned_sessions: ['id'],
  planned_exercises: ['id'],
  logged_sets: ['id'],
  sport_logs: ['id'],
  checkins: ['day'],
  weekly_reviews: ['week_start'],
  nutrition_settings: ['user_id'],
  nutrition_targets: ['id'],
  proposals: ['id'],
} as const;

type Row = Record<string, unknown>;
type Supa = Awaited<ReturnType<typeof createClient>>;

/** CSV exports (`?format=csv&type=…`). Each lists its columns and how to read a row; `sets` is the default. */
const CSV: Record<string, { file: string; columns: string[]; select: string; table: keyof typeof TABLES; order: string[]; filter?: string; row: (r: Row) => unknown[] }> = {
  sets: {
    file: 'sets',
    table: 'logged_sets',
    select: 'id, performed_on, set_index, load_kg, reps, rir, is_warmup, exercises(name)',
    order: ['performed_on', 'id'],
    columns: ['date', 'exercise', 'set', 'load_kg', 'reps', 'rir', 'warmup'],
    row: (r) => [r.performed_on, (r.exercises as { name: string } | null)?.name, Number(r.set_index) + 1, r.load_kg, r.reps, r.rir, r.is_warmup],
  },
  weighins: {
    file: 'weigh-ins',
    table: 'checkins',
    select: 'day, bodyweight_kg',
    order: ['day'],
    filter: 'bodyweight_kg',
    columns: ['date', 'bodyweight_kg'],
    row: (r) => [r.day, r.bodyweight_kg],
  },
  checkins: {
    file: 'check-ins',
    table: 'checkins',
    select: 'day, sleep_hours, energy, stress, soreness, bodyweight_kg, note',
    order: ['day'],
    columns: ['date', 'sleep_hours', 'energy', 'stress', 'soreness', 'bodyweight_kg', 'note'],
    // Soreness is a muscle → sore/pain map; flatten it to "muscle:level" pairs.
    row: (r) => [r.day, r.sleep_hours, r.energy, r.stress, Object.entries((r.soreness as Record<string, string>) ?? {}).map(([m, v]) => `${m}:${v}`).join(' '), r.bodyweight_kg, r.note],
  },
  nutrition: {
    file: 'nutrition-targets',
    table: 'nutrition_targets',
    select: 'effective_from, created_at, kcal, kcal_low, kcal_high, protein_g, fat_g, fat_min_g, carbs_g, carbs_min_g, sport_kcal_per_day, maintenance_kcal, bodyweight_kg, reason, id',
    order: ['created_at', 'id'],
    columns: ['effective_from', 'created_at', 'kcal', 'kcal_low', 'kcal_high', 'protein_g', 'fat_g', 'fat_min_g', 'carbs_g', 'carbs_min_g', 'sport_kcal_per_day', 'maintenance_kcal', 'bodyweight_kg', 'reason'],
    row: (r) => [r.effective_from, r.created_at, r.kcal, r.kcal_low, r.kcal_high, r.protein_g, r.fat_g, r.fat_min_g, r.carbs_g, r.carbs_min_g, r.sport_kcal_per_day, r.maintenance_kcal, r.bodyweight_kg, r.reason],
  },
};

function exportFailed(tables: string[]) {
  log.error('export incomplete, returning 500', { failedTables: tables.join(',') });
  return Response.json({ error: 'Export failed: some of your data could not be loaded. Please try again.', failed_tables: tables }, { status: 500 });
}

/** All of the caller's rows of one table, every page. Table names come from the fixed lists above. */
function readAll(supabase: Supa, table: keyof typeof TABLES, userId: string, opts: { select?: string; order?: readonly string[]; notNull?: string } = {}) {
  return fetchAllPages<Row>(
    `select ${table}`,
    (from, to) => {
      let q = supabase.from(table).select(opts.select ?? '*').eq('user_id', userId);
      if (opts.notNull) q = q.not(opts.notNull, 'is', null);
      for (const c of opts.order ?? TABLES[table]) q = q.order(c);
      return q.range(from, to) as unknown as PromiseLike<{ data: Row[] | null; error: { message: string } | null }>;
    },
    { userId },
  );
}

/** Data export of the caller's own rows (Section 10). RLS guarantees only their data is returned. */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const params = new URL(request.url).searchParams;
  const format = params.get('format') ?? 'json';
  log.debug('export', { userId: user.id, format, type: params.get('type') });

  if (format === 'csv') {
    const spec = CSV[params.get('type') ?? 'sets'];
    if (!spec) return Response.json({ error: `Unknown export type. Use one of: ${Object.keys(CSV).join(', ')}.` }, { status: 400 });
    const { data, error } = await readAll(supabase, spec.table, user.id, { select: spec.select, order: spec.order, notNull: spec.filter });
    if (error) return exportFailed([spec.table]);
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [spec.columns.join(','), ...data.map((r) => spec.row(r).map(esc).join(','))];
    return new Response(lines.join('\n'), {
      headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="pyramid-coach-${spec.file}.csv"` },
    });
  }

  const out: Record<string, unknown> = { exported_at: new Date().toISOString(), user: { id: user.id, email: user.email } };
  // A partial export must not look complete, so any failed table fails the whole request.
  const failed: string[] = [];
  for (const t of Object.keys(TABLES) as (keyof typeof TABLES)[]) {
    const { data, error } = await readAll(supabase, t, user.id);
    if (error) failed.push(t);
    out[t] = data;
  }
  const { data: custom, error: customErr } = log.db('select exercises (custom)', await supabase.from('exercises').select('*').eq('owner_user_id', user.id), { userId: user.id });
  if (customErr) failed.push('exercises');
  out.custom_exercises = custom ?? [];
  if (failed.length) return exportFailed(failed);
  return new Response(JSON.stringify(out, null, 2), {
    headers: { 'content-type': 'application/json', 'content-disposition': 'attachment; filename="pyramid-coach-export.json"' },
  });
}
