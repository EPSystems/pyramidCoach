// complete_onboarding() against the local Supabase stack (supabase start + migrations applied).
// Skipped when the stack is unreachable or the function is not deployed yet.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildOnboardingWrite } from '@/lib/onboarding/derive';
import { OnboardingInput } from '@/lib/schemas/onboarding';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
let ready = false;
beforeAll(async () => {
  try {
    if (!(await fetch(`${URL}/auth/v1/health`, { headers: { apikey: ANON }, signal: AbortSignal.timeout(5000) })).ok) return;
    // PGRST202 = function not found (migration not applied to this stack yet).
    const { error } = await admin.rpc('complete_onboarding', { p: {} });
    ready = error?.code !== 'PGRST202';
  } catch {
    ready = false;
  }
}, 20_000);

async function freshUser(tag: string): Promise<{ c: SupabaseClient; id: string }> {
  const email = `onb-${tag}-${Date.now()}@test.local`;
  const password = 'pw-onb-123456';
  const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: e2 } = await c.auth.signInWithPassword({ email, password });
  if (e2) throw e2;
  return { c, id: (await c.auth.getUser()).data.user!.id };
}

const input = (over: Record<string, unknown> = {}) =>
  OnboardingInput.parse({
    displayName: 'RPC',
    sex: 'male',
    bodyweightKg: 80,
    units: 'kg',
    timezone: 'Europe/Sofia',
    goal: 'lean_gain',
    status: 'intermediate',
    trainedLastMonth: true,
    sports: [{ sportId: 'custom-1', weekdays: [6], intensity: 'hard', minutes: 60 }],
    customSports: [{ tempId: 'custom-1', name: 'Padel', lower: 2, upper: 1, impact: 1, conditioning: 2, muscles: ['quads'] }],
    priority: 'balanced',
    availableDays: [1, 3, 5],
    sessionMinutes: 60,
    equipment: ['barbell', 'dumbbell'],
    injuries: [{ muscleId: 'hamstrings', label: 'Ham', severity: 'pain', status: 'rehab', avoidSlugs: ['good-morning'] }],
    lifestyle: 'active',
    seeds: { squat: { load: 100, reps: 5 } },
    ...over,
  });

describe('complete_onboarding RPC', () => {
  it('writes everything, replaces on retry, and refuses once onboarded', async (ctx) => {
    if (!ready) ctx.skip();
    const { c, id } = await freshUser('rpc');
    const first = buildOnboardingWrite(input(), '2026-10-27', () => crypto.randomUUID());
    expect((await c.rpc('complete_onboarding', { p: first })).error).toBeNull();

    // Retry (e.g. plan build failed): previous sports, custom sports and injuries are replaced, not duplicated.
    const second = buildOnboardingWrite(input(), '2026-10-27', () => crypto.randomUUID());
    expect((await c.rpc('complete_onboarding', { p: second })).error).toBeNull();
    const { data: us } = await c.from('user_sports').select('sport_id').eq('user_id', id);
    expect(us!.map((r) => r.sport_id)).toEqual([second.custom_sports[0].id]);
    const { data: own } = await c.from('sports').select('id').eq('owner_user_id', id);
    expect(own).toHaveLength(1);
    const { data: inj } = await c.from('injuries').select('status, avoid_exercise_ids').eq('user_id', id);
    expect(inj).toHaveLength(1);
    expect(inj![0].status).toBe('rehab');
    expect(inj![0].avoid_exercise_ids).toHaveLength(1);
    const { data: st } = await c.from('user_settings').select('e1rm_seeds').eq('user_id', id).single();
    expect(st!.e1rm_seeds).toEqual({ squat: 112.5 });

    // A failing statement rolls the whole call back: bad muscle id on the injury → nothing changes.
    const bad = buildOnboardingWrite(input({ displayName: 'Changed' }), '2026-10-27', () => crypto.randomUUID());
    bad.injuries[0].muscle_id = 'not-a-muscle';
    expect((await c.rpc('complete_onboarding', { p: bad })).error).not.toBeNull();
    const { data: prof } = await c.from('profiles').select('display_name').eq('user_id', id).single();
    expect(prof!.display_name).toBe('RPC');

    await c.from('profiles').update({ onboarded_at: new Date().toISOString() }).eq('user_id', id);
    const { error } = await c.rpc('complete_onboarding', { p: second });
    expect(error?.hint).toBe('already_onboarded');
  });
});
