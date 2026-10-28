import 'server-only';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { createClient, type Supa } from '@/lib/supabase/server';
import type { Tables } from '@/lib/db/database.types';
import type {
  Equipment,
  ExerciseDef,
  Injury,
  LoggedSet,
  MainLift,
  MuscleId,
  SlotTag,
  UserSport,
} from '@/lib/engine/types';
import { todayIn } from '@/lib/utils/dates';
import type { Units } from '@/lib/utils/units';
import { createLogger } from '@/lib/log';

const log = createLogger('server/context');

export type ExerciseRow = Tables<'exercises'> & { exercise_muscles: { muscle_id: string | null; role: string }[] };

export function mapExercise(row: ExerciseRow): ExerciseDef {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    pattern: (row.pattern_id ?? 'isolation') as ExerciseDef['pattern'],
    category: row.category as ExerciseDef['category'],
    equipment: row.equipment as Equipment[],
    isMainLift: !!row.is_main_lift,
    mainLiftKey: (row.main_lift_key as MainLift | null) ?? null,
    longLengthBias: !!row.long_length_bias,
    unilateral: !!row.unilateral,
    axialLoad: !!row.axial_load,
    impactLowerBody: !!row.impact_lower_body,
    defaultIncrementKg: row.default_increment_kg,
    muscles: row.exercise_muscles
      .filter((m) => m.muscle_id)
      .map((m) => ({ muscle: m.muscle_id as MuscleId, role: m.role as 'primary' | 'secondary' })),
    substitutions: row.substitutions,
    slotTags: row.slot_tags as SlotTag[],
    popularity: row.popularity,
    custom: !!row.owner_user_id,
  };
}

export type SportRow = Tables<'user_sports'> & { sports: Tables<'sports'> | null };

export function mapUserSport(r: SportRow): UserSport {
  const s = r.sports!;
  return {
    sportId: r.sport_id,
    name: s.name,
    lowerBodyLoad: s.lower_body_load,
    upperBodyLoad: s.upper_body_load,
    eccentricImpact: s.eccentric_impact,
    conditioning: s.conditioning,
    musclesStressed: s.muscles_stressed as MuscleId[],
    weekdays: r.weekdays,
    intensity: r.intensity as UserSport['intensity'],
    minutes: r.minutes,
    timeOfDay: (r.time_of_day as UserSport['timeOfDay']) ?? null,
  };
}

export function mapInjury(r: Tables<'injuries'>): Injury {
  return {
    id: r.id,
    muscleId: (r.muscle_id as MuscleId | null) ?? null,
    label: r.label,
    severity: r.severity as Injury['severity'],
    status: r.status as Injury['status'],
    avoidExerciseIds: r.avoid_exercise_ids,
  };
}

export function mapSet(r: Tables<'logged_sets'>): LoggedSet {
  return {
    exerciseId: r.exercise_id,
    performedOn: r.performed_on,
    setIndex: r.set_index,
    loadKg: r.load_kg,
    reps: r.reps,
    rir: r.rir,
    isWarmup: r.is_warmup,
    sessionId: r.session_id,
    loggedAt: r.created_at,
  };
}

/**
 * Auth gate for server components and actions. getClaims() verifies the JWT signature locally
 * (asymmetric keys, JWKS cached), so this costs no auth round-trip; the proxy still runs
 * getUser() against the auth server on every request, which catches revoked sessions.
 */
export const requireUser = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (!data?.claims.sub) {
    // The proxy should have bounced signed-out users already, so landing here usually means a bad or expired JWT.
    if (error) log.warn('getClaims failed, redirecting to /login', { err: error });
    else log.debug('no session claims, redirecting to /login');
    redirect('/login');
  }
  const user = { id: data.claims.sub, email: data.claims.email };
  return { supabase, user };
});

export async function loadExercises(supabase: Supa): Promise<ExerciseDef[]> {
  const { data, error } = await supabase.from('exercises').select('*, exercise_muscles(muscle_id, role)').order('popularity');
  if (error) {
    log.error('select exercises failed', { err: error });
    throw error;
  }
  return (data as ExerciseRow[]).map(mapExercise);
}

/** Everything a page usually needs about the current user. Cached per request. */
export const getUserContext = cache(async () => {
  const { supabase, user } = await requireUser();
  const [profileRes, settingsRes, sportsRes, injuriesRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle(),
    supabase.from('user_settings').select('*').eq('user_id', user.id).maybeSingle(),
    supabase.from('user_sports').select('*, sports(*)').eq('user_id', user.id).order('created_at'),
    supabase.from('injuries').select('*').eq('user_id', user.id).order('started_on'),
  ]);
  // maybeSingle() returns data: null with no error for a missing row, so an error here is a real failure.
  // Throw it to the error boundary: treating it as "no profile" would send an onboarded user back to /onboarding.
  if (log.db('select profiles', profileRes, { userId: user.id }).error) throw profileRes.error;
  if (log.db('select user_settings', settingsRes, { userId: user.id }).error) throw settingsRes.error;
  log.db('select user_sports', sportsRes, { userId: user.id });
  log.db('select injuries', injuriesRes, { userId: user.id });
  const profile = profileRes.data;
  const tz = profile?.timezone ?? 'Europe/Sofia';
  const sportRows = (sportsRes.data ?? []) as SportRow[];
  return {
    supabase,
    user,
    profile,
    settings: settingsRes.data,
    sportRows,
    sports: sportRows.filter((s) => s.active && s.sports).map(mapUserSport),
    injuryRows: injuriesRes.data ?? [],
    injuries: (injuriesRes.data ?? []).filter((i) => i.status !== 'resolved').map(mapInjury),
    today: todayIn(tz),
    units: (profile?.units ?? 'kg') as Units,
    isOwner: profile?.role === 'owner',
    // Owner-appointed admins open /admin too; role changes and removing users stay owner-only (DECISIONS 37).
    isAdmin: profile?.role === 'owner' || profile?.role === 'admin',
  };
});

/** Pages inside the app require a finished onboarding. */
export async function requireOnboarded() {
  const ctx = await getUserContext();
  if (!ctx.profile?.onboarded_at || !ctx.settings) {
    log.debug('not onboarded, redirecting to /onboarding', { userId: ctx.user.id, hasProfile: !!ctx.profile, hasSettings: !!ctx.settings });
    redirect('/onboarding');
  }
  return { ...ctx, settings: ctx.settings!, profile: ctx.profile! };
}

export type UserContext = Awaited<ReturnType<typeof requireOnboarded>>;
