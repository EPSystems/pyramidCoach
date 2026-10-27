// Account lifecycle against the local Supabase stack (supabase start): deleting a user leaves no rows behind,
// owner-only role management, and the unconfirmed-account purge. Skipped when the stack is not reachable.
import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it, vi } from 'vitest';

// Each test creates and signs in several users; the shared local stack can be slow.
vi.setConfig({ testTimeout: 30_000 });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

let reachable = false;
beforeAll(async () => {
  try {
    reachable = (await fetch(`${URL}/auth/v1/health`, { headers: { apikey: ANON } })).ok;
  } catch {
    reachable = false;
  }
});

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const stamp = Date.now();

async function userClient(email: string, password = 'pw-acct-123456') {
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: e2 } = await c.auth.signInWithPassword({ email, password });
  if (e2) throw e2;
  return { c, id: created.user.id, email };
}

async function ownerClient() {
  const { data: cfg } = await admin.from('app_config').select('value').eq('key', 'owner_email').single();
  const email = cfg!.value as string;
  const password = 'pw-owner-123456';
  const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) {
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const existing = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (!existing) throw error;
    await admin.auth.admin.updateUserById(existing.id, { password });
  }
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data, error: e2 } = await c.auth.signInWithPassword({ email, password });
  if (e2) throw e2;
  return { c, id: data.user.id, email };
}

const ok = <T extends { error: unknown }>(res: T) => {
  expect(res.error).toBeNull();
  return res;
};

/** One row in every table that references auth.users. Keep in step with new user tables (the test below insists). */
async function seedEverything(uid: string) {
  const { data: bench } = await admin.from('exercises').select('id').eq('slug', 'bench-press').single();
  const sportId = `test-sport-${stamp}`;
  const exSlug = `test-ex-${stamp}`;
  ok(await admin.from('user_settings').insert({ user_id: uid, goal: 'lean_gain', training_status: 'novice', available_days: [1, 3, 5] }));
  ok(await admin.from('sports').insert({ id: sportId, name: 'Test sport', lower_body_load: 1, upper_body_load: 1, eccentric_impact: 1, conditioning: 1, muscles_stressed: [], default_minutes: 60, owner_user_id: uid }));
  const { data: ex } = ok(await admin.from('exercises').insert({ slug: exSlug, name: 'Test exercise', category: 'isolation', equipment: ['dumbbell'], owner_user_id: uid }).select('id').single());
  ok(await admin.from('user_sports').insert({ user_id: uid, sport_id: sportId, weekdays: [6], intensity: 'moderate', minutes: 60 }));
  ok(await admin.from('injuries').insert({ user_id: uid, label: 'Test niggle', severity: 'niggle', started_on: '2026-10-20' }));
  const { data: block } = ok(
    await admin.from('blocks').insert({ user_id: uid, kind: 'hypertrophy', starts_on: '2026-10-19', weeks: 6, split_key: 'test', engine_version: 'test', inputs_snapshot: {} }).select('id').single(),
  );
  ok(await admin.from('weekly_targets').insert({ block_id: block!.id, user_id: uid, week_index: 0, muscle_id: 'chest', target_sets: 10 }));
  const { data: session } = ok(
    await admin.from('planned_sessions').insert({ user_id: uid, block_id: block!.id, week_index: 0, scheduled_on: '2026-10-20', template_key: 't', title: 'Test', order_in_week: 0 }).select('id').single(),
  );
  // The user's own custom exercise is referenced (no-action FK) by their planned/logged rows: the cascade must still go through.
  const { data: pe } = ok(
    await admin
      .from('planned_exercises')
      .insert({ session_id: session!.id, user_id: uid, exercise_id: ex!.id, position: 0, sets: 3, rep_min: 8, rep_max: 12, rir_min: 1, rir_max: 3, rest_seconds: 90 })
      .select('id')
      .single(),
  );
  ok(await admin.from('logged_sets').insert({ user_id: uid, session_id: session!.id, planned_exercise_id: pe!.id, exercise_id: ex!.id, performed_on: '2026-10-20', set_index: 0, reps: 10 }));
  ok(await admin.from('logged_sets').insert({ user_id: uid, exercise_id: bench!.id, performed_on: '2026-10-20', set_index: 0, reps: 5 }));
  ok(await admin.from('sport_logs').insert({ user_id: uid, sport_id: sportId, performed_on: '2026-10-20', minutes: 60 }));
  ok(await admin.from('checkins').insert({ user_id: uid, day: '2026-10-20' }));
  ok(await admin.from('weekly_reviews').insert({ user_id: uid, week_start: '2026-10-19' }));
  ok(await admin.from('nutrition_settings').insert({ user_id: uid, phase: 'gain', activity_multiplier: 1.5, maintenance_kcal: 2500, target_rate_pct: 0.25, phase_started_on: '2026-10-19' }));
  ok(
    await admin
      .from('nutrition_targets')
      .insert({ user_id: uid, effective_from: '2026-10-19', kcal: 2700, kcal_low: 2600, kcal_high: 2800, protein_g: 160, fat_min_g: 50, fat_g: 70, carbs_min_g: 200, carbs_g: 300, reason: 'test' }),
  );
  ok(await admin.from('proposals').insert({ user_id: uid, kind: 'standard_deload', title: 'Test', rationale: 'Test', rule_ids: [], payload: {} }));
}

describe('Account deletion cascades (DECISIONS 39)', () => {
  it('every foreign key to auth.users cascades (or nulls out)', async (ctx) => {
    if (!reachable) ctx.skip();
    const { data, error } = await admin.rpc('auth_user_fk_report');
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(10);
    expect(data!.filter((r: { on_delete: string }) => r.on_delete !== 'c' && r.on_delete !== 'n')).toEqual([]);
  });

  it('deleting a user with rows in every user table leaves zero rows', async (ctx) => {
    if (!reachable) ctx.skip();
    const u = await userClient(`cascade-${stamp}@test.local`);
    await seedEverything(u.id);
    const { data: fks } = await admin.rpc('auth_user_fk_report');
    const count = async (table: string, column: string) =>
      (await admin.from(table.replace(/^public\./, '')).select('*', { count: 'exact', head: true }).eq(column, u.id)).count ?? 0;
    // Every table that references auth.users got a row, so a new user table without seed data fails here.
    const empty: string[] = [];
    for (const fk of fks!) if ((await count(fk.table_name, fk.column_name)) === 0) empty.push(`${fk.table_name}.${fk.column_name}`);
    expect(empty).toEqual([]);

    ok(await admin.auth.admin.deleteUser(u.id));
    const left: string[] = [];
    for (const fk of fks!) {
      const n = await count(fk.table_name, fk.column_name);
      if (n) left.push(`${fk.table_name}.${fk.column_name}: ${n}`);
    }
    expect(left).toEqual([]);
  });
});

describe('Role management (DECISIONS 37)', () => {
  it('only the owner promotes and demotes admins; the owner role cannot change', async (ctx) => {
    if (!reachable) ctx.skip();
    const owner = await ownerClient();
    const m = await userClient(`role-m-${stamp}@test.local`);
    const n = await userClient(`role-n-${stamp}@test.local`);
    const role = async (id: string) => (await admin.from('profiles').select('role').eq('user_id', id).single()).data?.role;

    // Members can't call it, on others or themselves.
    expect((await m.c.rpc('admin_set_role', { p_user_id: m.id, p_role: 'admin' })).error).not.toBeNull();
    expect((await m.c.rpc('is_admin')).data).toBe(false);

    ok(await owner.c.rpc('admin_set_role', { p_user_id: m.id, p_role: 'admin' }));
    expect(await role(m.id)).toBe('admin');
    expect((await m.c.rpc('is_admin')).data).toBe(true);
    // Admins see the user list but can't hand out roles or remove users.
    expect((await m.c.rpc('admin_list_users')).error).toBeNull();
    expect((await m.c.rpc('admin_set_role', { p_user_id: n.id, p_role: 'admin' })).error).not.toBeNull();
    expect((await m.c.rpc('admin_remove_user', { p_email: n.email })).error).not.toBeNull();
    // ...and can't promote themselves to owner through the profile either.
    await m.c.from('profiles').update({ role: 'owner' }).eq('user_id', m.id);
    expect(await role(m.id)).toBe('admin');

    expect((await owner.c.rpc('admin_set_role', { p_user_id: owner.id, p_role: 'member' })).error?.message).toMatch(/owner role/);
    expect((await owner.c.rpc('admin_set_role', { p_user_id: n.id, p_role: 'owner' })).error).not.toBeNull();
    expect(await role(owner.id)).toBe('owner');

    ok(await owner.c.rpc('admin_set_role', { p_user_id: m.id, p_role: 'member' }));
    expect(await role(m.id)).toBe('member');
    expect((await m.c.rpc('admin_list_users')).error).not.toBeNull();
  });
});

describe('Unconfirmed-account purge (AUTH_PLAN §6 question 3)', () => {
  it('is not callable from the browser and keeps fresh or confirmed accounts', async (ctx) => {
    if (!reachable) ctx.skip();
    const anon = createClient(URL, ANON, { auth: { persistSession: false } });
    const m = await userClient(`purge-m-${stamp}@test.local`);
    for (const c of [anon, m.c]) expect((await c.rpc('purge_unconfirmed_users')).error).not.toBeNull();
    const { data: fresh } = await admin.auth.admin.createUser({ email: `purge-u-${stamp}@test.local`, password: 'pw-u-123456', email_confirm: false });
    expect((await admin.rpc('purge_unconfirmed_users', { p_older_than: '1 hour' })).error?.message).toMatch(/at least 1 day/);
    ok(await admin.rpc('purge_unconfirmed_users'));
    expect((await admin.auth.admin.getUserById(fresh.user!.id)).data.user).not.toBeNull();
    expect((await admin.auth.admin.getUserById(m.id)).data.user).not.toBeNull();
  });
});
