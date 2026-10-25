// RLS + invite-only integration tests against the local Supabase stack (supabase start).
// Skipped automatically when the local stack is not reachable.
import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

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

async function userClient(email: string, password: string) {
  await admin.from('invites').upsert({ email });
  const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error && !/already/i.test(error.message)) throw error;
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: e2 } = await c.auth.signInWithPassword({ email, password });
  if (e2) throw e2;
  const { data } = await c.auth.getUser();
  return { c, id: data.user!.id };
}

describe('RLS isolation (Section 5.3)', () => {
  it('a second user cannot read or write the first user’s logged sets', async (ctx) => {
    if (!reachable) ctx.skip();
    const a = await userClient(`a-${stamp}@test.local`, 'pw-a-123456');
    const b = await userClient(`b-${stamp}@test.local`, 'pw-b-123456');
    const { data: ex } = await a.c.from('exercises').select('id').eq('slug', 'bench-press').single();
    const { error } = await a.c.from('logged_sets').insert({ user_id: a.id, exercise_id: ex!.id, performed_on: '2026-10-20', set_index: 0, load_kg: 80, reps: 8, rir: 2 });
    expect(error).toBeNull();
    const { data: own } = await a.c.from('logged_sets').select('*');
    expect(own!.length).toBeGreaterThan(0);
    const { data: other } = await b.c.from('logged_sets').select('*').eq('user_id', a.id);
    expect(other).toEqual([]);
    const { error: writeErr } = await b.c.from('logged_sets').insert({ user_id: a.id, exercise_id: ex!.id, performed_on: '2026-10-20', set_index: 1, reps: 5 });
    expect(writeErr).not.toBeNull();
    // Members cannot promote themselves or read invites.
    const { data: inv } = await b.c.from('invites').select('*');
    expect(inv).toEqual([]);
    await b.c.from('profiles').update({ role: 'owner' }).eq('user_id', b.id);
    const { data: prof } = await admin.from('profiles').select('role').eq('user_id', b.id).single();
    expect(prof!.role).toBe('member');
    const { error: adminErr } = await b.c.rpc('admin_list_users');
    expect(adminErr).not.toBeNull();
  });

  it('an email without an invite cannot sign up', async (ctx) => {
    if (!reachable) ctx.skip();
    const { error } = await admin.auth.admin.createUser({ email: `stranger-${stamp}@test.local`, password: 'x-123456', email_confirm: true });
    expect(error).not.toBeNull();
    const anon = createClient(URL, ANON, { auth: { persistSession: false } });
    const { data } = await anon.rpc('is_invited', { p_email: `stranger-${stamp}@test.local` });
    expect(data).toBe(false);
  });

  it('seeds are present and readable by members', async (ctx) => {
    if (!reachable) ctx.skip();
    const a = await userClient(`c-${stamp}@test.local`, 'pw-c-123456');
    const { count } = await a.c.from('exercises').select('id', { count: 'exact', head: true });
    expect(count).toBeGreaterThanOrEqual(60);
    const { count: rules } = await a.c.from('rule_sources').select('id', { count: 'exact', head: true });
    expect(rules).toBeGreaterThanOrEqual(90);
  });
});
