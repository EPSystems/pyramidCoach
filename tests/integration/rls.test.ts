// RLS + open sign-up integration tests against the local Supabase stack (supabase start).
// Skipped automatically when the local stack is not reachable.
import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';

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

async function userClient(email: string, password: string) {
  const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error && !/already/i.test(error.message)) throw error;
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: e2 } = await c.auth.signInWithPassword({ email, password });
  if (e2) throw e2;
  const { data } = await c.auth.getUser();
  return { c, id: data.user!.id, email };
}

/** Signs in as the app_config owner, creating (or resetting the password of) that user in the local stack. */
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
  return userClient(email, password);
}

describe('RLS isolation (Section 5.3)', () => {
  it('a second user cannot read or write the first user’s logged sets', async (ctx) => {
    if (!reachable) ctx.skip();
    const a = await userClient(`a-${stamp}@test.local`, 'pw-a-123456');
    const b = await userClient(`b-${stamp}@test.local`, 'pw-b-123456');
    const { data: ex } = await a.c.from('exercises').select('id').eq('slug', 'bench-press').single();
    const { error } = await a.c
      .from('logged_sets')
      .insert({ user_id: a.id, exercise_id: ex!.id, performed_on: '2026-10-20', set_index: 0, load_kg: 80, reps: 8, rir: 2 });
    expect(error).toBeNull();
    const { data: own } = await a.c.from('logged_sets').select('*');
    expect(own!.length).toBeGreaterThan(0);
    const { data: other } = await b.c.from('logged_sets').select('*').eq('user_id', a.id);
    expect(other).toEqual([]);
    const { error: writeErr } = await b.c.from('logged_sets').insert({ user_id: a.id, exercise_id: ex!.id, performed_on: '2026-10-20', set_index: 1, reps: 5 });
    expect(writeErr).not.toBeNull();
    // Members cannot promote themselves or use owner functions.
    await b.c.from('profiles').update({ role: 'owner' }).eq('user_id', b.id);
    const { data: prof } = await admin.from('profiles').select('role').eq('user_id', b.id).single();
    expect(prof!.role).toBe('member');
    const { error: adminErr } = await b.c.rpc('admin_list_users');
    expect(adminErr).not.toBeNull();
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

async function profileOf(id: string) {
  const { data } = await admin.from('profiles').select('role, display_name').eq('user_id', id).maybeSingle();
  return data;
}

describe('Open sign-up (AUTH_PLAN §5.2)', () => {
  it('creates the profile only once the email is confirmed', async (ctx) => {
    if (!reachable) ctx.skip();
    const { data, error } = await admin.auth.admin.createUser({ email: `unconfirmed-${stamp}@test.local`, password: 'pw-u-123456', email_confirm: false });
    expect(error).toBeNull();
    const id = data.user!.id;
    expect(await profileOf(id)).toBeNull();
    const { error: e2 } = await admin.auth.admin.updateUserById(id, { email_confirm: true });
    expect(e2).toBeNull();
    expect(await profileOf(id)).toEqual({ role: 'member', display_name: `unconfirmed-${stamp}` });
  });

  it('uses full_name from the provider for display_name', async (ctx) => {
    if (!reachable) ctx.skip();
    const { data } = await admin.auth.admin.createUser({
      email: `google-${stamp}@test.local`,
      email_confirm: true,
      user_metadata: { full_name: 'Grace Hopper' },
    });
    expect((await profileOf(data.user!.id))?.display_name).toBe('Grace Hopper');
  });

  it('gives the app_config owner email the owner role', async (ctx) => {
    if (!reachable) ctx.skip();
    const owner = await ownerClient();
    expect((await profileOf(owner.id))?.role).toBe('owner');
  });

  it('invite objects are gone and trigger functions are not callable', async (ctx) => {
    if (!reachable) ctx.skip();
    const anon = createClient(URL, ANON, { auth: { persistSession: false } });
    const m = await userClient(`d-${stamp}@test.local`, 'pw-d-123456');
    for (const c of [anon, m.c]) {
      expect((await c.rpc('handle_new_user')).error).not.toBeNull();
      expect((await c.rpc('is_invited', { p_email: 'x@test.local' })).error).not.toBeNull();
    }
    expect((await admin.from('invites').select('*')).error).not.toBeNull();
    expect((await admin.rpc('admin_revoke_user', { p_email: 'x@test.local' })).error).not.toBeNull();
  });

  it('admin_remove_user is owner-only and cannot remove the owner', async (ctx) => {
    if (!reachable) ctx.skip();
    const owner = await ownerClient();
    const victim = await userClient(`e-${stamp}@test.local`, 'pw-e-123456');
    const member = await userClient(`f-${stamp}@test.local`, 'pw-f-123456');
    expect((await member.c.rpc('admin_remove_user', { p_email: victim.email })).error).not.toBeNull();
    const anon = createClient(URL, ANON, { auth: { persistSession: false } });
    expect((await anon.rpc('admin_remove_user', { p_email: victim.email })).error).not.toBeNull();
    expect((await owner.c.rpc('admin_remove_user', { p_email: owner.email })).error?.message).toMatch(/cannot remove the owner/);
    expect((await owner.c.rpc('admin_remove_user', { p_email: victim.email })).error).toBeNull();
    expect((await admin.auth.admin.getUserById(victim.id)).data.user).toBeNull();
    expect(await profileOf(victim.id)).toBeNull();
  });
});
