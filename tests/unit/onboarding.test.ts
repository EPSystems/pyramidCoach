import { describe, expect, it } from 'vitest';
import { buildOnboardingWrite, e1rmSeeds, seedsToKg, selectedCustomSports } from '@/lib/onboarding/derive';
import { OWNER_PREFILL, prefillFor } from '@/lib/onboarding/owner-prefill';
import { BirthYear, BodyweightKg, HeightCm, OnboardingInput, SportMinutes, fieldError, type OnboardingPayload } from '@/lib/schemas/onboarding';
import { cmFromFtIn, ftInFromCm } from '@/lib/utils/units';

const base: OnboardingPayload = {
  displayName: 'Test',
  sex: 'female',
  bodyweightKg: 60,
  units: 'lb',
  timezone: 'Europe/Sofia',
  goal: 'lean_gain',
  status: 'intermediate',
  trainedLastMonth: true,
  sports: [],
  priority: 'balanced',
  availableDays: [3, 1, 1, 5],
  sessionMinutes: 60,
  equipment: ['barbell'],
  injuries: [],
  lifestyle: 'active',
};

describe('seedsToKg', () => {
  it('converts lb loads to kg and keeps reps', () => {
    expect(seedsToKg({ squat: { load: 225, reps: 5 } }, 'lb')).toEqual({ squat: { load: 102.06, reps: 5 } });
  });
  it('leaves kg alone and drops empty lifts', () => {
    expect(seedsToKg({ squat: { load: 100, reps: 3 }, bench: { load: 0, reps: 5 }, ohp: { load: 40, reps: 0 }, deadlift: null }, 'kg')).toEqual({ squat: { load: 100, reps: 3 } });
  });
});

describe('selectedCustomSports', () => {
  it('keeps only custom sports that are still selected', () => {
    const c = (tempId: string) => ({ tempId, name: tempId, lower: 1, upper: 1, impact: 1, conditioning: 1, muscles: [] });
    expect(selectedCustomSports([c('a'), c('b')], [{ sportId: 'b' }, { sportId: 'football' }]).map((x) => x.tempId)).toEqual(['b']);
  });
});

describe('height', () => {
  it('ft/in ↔ cm', () => {
    expect(cmFromFtIn(5, 9)).toBe(175.3);
    expect(cmFromFtIn(6, 0)).toBe(182.9);
    expect(ftInFromCm(175.3)).toEqual({ ft: 5, in: 9 });
    expect(ftInFromCm(182)).toEqual({ ft: 6, in: 0 }); // 71.65 in rounds to 72
  });
});

describe('field validation (shared with the server)', () => {
  it('reports the same limits the server applies', () => {
    expect(fieldError(BirthYear, 1990)).toBeNull();
    expect(fieldError(BirthYear, 2020)).toBe('Birth year must be between 1920 and 2015.');
    expect(fieldError(BirthYear, Number('abc'))).toBe('Enter a number.');
    expect(fieldError(SportMinutes, 5)).toBe('Minutes must be between 10 and 300.');
    expect(fieldError(SportMinutes, 90)).toBeNull();
    expect(fieldError(HeightCm, 250)).toBe('Height must be between 120 and 230 cm.');
    expect(fieldError(BodyweightKg, 30)).toBe('Bodyweight must be between 35 and 250 kg.');
    const bad = OnboardingInput.safeParse({ ...base, birthYear: 2020 });
    expect(bad.success).toBe(false);
    expect(bad.error!.issues[0].message).toBe('Birth year must be between 1920 and 2015.');
  });
});

describe('buildOnboardingWrite', () => {
  it('maps custom sports to new ids, drops unselected ones, and stores kg e1RM seeds', () => {
    const d = OnboardingInput.parse({
      ...base,
      sports: [{ sportId: 'custom-1', weekdays: [6, 2, 2], intensity: 'hard', minutes: 60 }],
      customSports: [
        { tempId: 'custom-1', name: 'Padel', lower: 2, upper: 2, impact: 1, conditioning: 2, muscles: ['quads'] },
        { tempId: 'custom-2', name: 'Removed', lower: 0, upper: 0, impact: 0, conditioning: 0, muscles: [] },
      ],
      injuries: [{ muscleId: 'hamstrings', label: 'Ham', severity: 'pain', status: 'rehab', note: '  ', avoidSlugs: ['good-morning', 'good-morning'] }],
      seeds: seedsToKg({ squat: { load: 225, reps: 5 } }, 'lb'),
    });
    let n = 0;
    const w = buildOnboardingWrite(d, '2026-10-27', () => `id-${++n}`);
    expect(w.custom_sports).toHaveLength(1);
    expect(w.custom_sports[0]).toMatchObject({ id: 'id-1', name: 'Padel', lower_body_load: 2 });
    expect(w.sports).toEqual([{ sport_id: 'id-1', weekdays: [2, 6], intensity: 'hard', minutes: 60, time_of_day: null }]);
    expect(w.settings.available_days).toEqual([1, 3, 5]);
    expect(w.settings.priority).toBe('balanced');
    // 102.06 kg × 5 → 102.06 × 36 / 32 = 114.8 kg (not the 253 "kg" a raw 225 would give).
    expect(w.settings.e1rm_seeds).toEqual({ squat: 114.8 });
    expect(w.injuries).toEqual([{ muscle_id: 'hamstrings', label: 'Ham', severity: 'pain', status: 'rehab', rehab_note: null, avoid_slugs: ['good-morning'] }]);
    expect(w.profile).toMatchObject({ sex: 'female', units: 'lb', birth_year: null, height_cm: null });
  });
  it('forces priority: sport for sport support, lifting with no sports', () => {
    const noSports = buildOnboardingWrite(OnboardingInput.parse(base), '2026-10-27', () => 'x');
    expect(noSports.settings.priority).toBe('lifting');
    const sport = buildOnboardingWrite(OnboardingInput.parse({ ...base, goal: 'sport_support' }), '2026-10-27', () => 'x');
    expect(sport.settings.priority).toBe('sport');
  });
  it('e1rmSeeds skips sets above 12 effective reps', () => {
    expect(e1rmSeeds({ bench: { load: 90, reps: 2 } })).toEqual({ bench: 92.6 });
  });
});

describe('owner prefill', () => {
  it('only the owner gets it, and it includes sex', () => {
    expect(prefillFor('member')).toBeUndefined();
    expect(prefillFor(null)).toBeUndefined();
    expect(prefillFor('owner')).toBe(OWNER_PREFILL);
    expect(OWNER_PREFILL.sex).toBeDefined();
  });
});
