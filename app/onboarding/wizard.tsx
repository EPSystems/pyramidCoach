'use client';

import { useMemo, useState, useTransition } from 'react';
import { ArrowLeft, ArrowRight, Check, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { completeOnboarding } from '@/lib/actions/onboarding';
import type { OnboardingPayload } from '@/lib/schemas/onboarding';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { BodyMap } from '@/components/app/body-map';
import { Chip, Segmented, Why } from '@/components/app/bits';
import { PyramidMark } from '@/components/app/logo';
import { cn } from '@/lib/utils';
import type { Equipment, MuscleId } from '@/lib/engine/types';
import { MUSCLE_SHORT } from '@/lib/knowledge/muscles';
import { fromDisplay } from '@/lib/utils/units';

type Goal = OnboardingPayload['goal'];
type Sport = OnboardingPayload['sports'][number];
type Injury = OnboardingPayload['injuries'][number];
type Custom = NonNullable<OnboardingPayload['customSports']>[number];

export interface Prefill {
  displayName?: string;
  heightCm?: number;
  bodyweightKg?: number;
  bodyFatPct?: number;
  goal?: Goal;
  status?: 'novice' | 'intermediate' | 'advanced';
  priority?: 'lifting' | 'balanced' | 'sport';
  sports?: Sport[];
  availableDays?: number[];
  sessionMinutes?: 30 | 45 | 60 | 75 | 90 | 120;
  maxLiftDays?: number;
  equipmentPreset?: Preset;
  injuries?: Injury[];
  seeds?: OnboardingPayload['seeds'];
}

type Preset = 'full' | 'dumbbells' | 'bodyweight' | 'custom';
const PRESETS: Record<Exclude<Preset, 'custom'>, Equipment[]> = {
  full: ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'band', 'sled'],
  dumbbells: ['dumbbell', 'bodyweight', 'band'],
  bodyweight: ['bodyweight', 'band'],
};
const ALL_EQ: Equipment[] = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'band', 'sled'];
const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const GOALS: { id: Goal; title: string; line: string }[] = [
  { id: 'lean_gain', title: 'Lean muscle gain', line: 'Build muscle in a small calorie surplus.' },
  { id: 'recomp', title: 'Recomp', line: 'Build muscle and lose a little fat at maintenance.' },
  { id: 'strength', title: 'Strength', line: 'Get stronger on squat, bench and deadlift.' },
  { id: 'fat_loss', title: 'Fat loss', line: 'Lose fat while keeping your muscle.' },
  { id: 'sport_support', title: 'Support my sport', line: 'Lift just enough to be robust and powerful for your sport.' },
];
const STATUSES = [
  { id: 'novice' as const, title: 'Novice', line: 'I add weight or reps almost every time I repeat a lift.' },
  { id: 'intermediate' as const, title: 'Intermediate', line: 'Reps go up week to week; heavy lifts creep up month to month.' },
  { id: 'advanced' as const, title: 'Advanced', line: 'A rep or two a month on lighter work; heavy lifts move even slower.' },
];
const LIFESTYLES = [
  { id: 'sedentary' as const, title: 'Sedentary', line: 'Desk job, little walking (< 5k steps).' },
  { id: 'lightly_active' as const, title: 'Lightly active', line: 'Some walking, on your feet part of the day (5–8k steps).' },
  { id: 'active' as const, title: 'Active', line: 'On your feet most of the day (8–12k steps).' },
  { id: 'very_active' as const, title: 'Very active', line: 'Physical job or 12k+ steps daily.' },
];
const STEPS = ['About you', 'Goal', 'Experience', 'Sports', 'Availability', 'Equipment & injuries', 'Lifestyle'];

function Card({ active, onClick, title, line }: { active: boolean; onClick: () => void; title: string; line: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'relative w-full rounded-2xl border p-4 text-left transition-all',
        active ? 'border-volt bg-accent/60 shadow-[0_0_0_1px_var(--volt)]' : 'bg-card hover:border-foreground/30',
      )}
    >
      <span className="font-display block text-xl font-bold uppercase">{title}</span>
      <span className="text-muted-foreground mt-0.5 block text-sm">{line}</span>
      {active && <Check className="text-volt absolute top-4 right-4 size-5" />}
    </button>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="stamp text-muted-foreground">{label}</Label>
      {children}
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  );
}

const num = (v: string) => (v.trim() === '' ? null : Number(v));

export function OnboardingWizard({ sports, prefill, email }: { sports: { id: string; name: string; defaultMinutes: number; notes: string | null; custom: boolean }[]; prefill?: Prefill; email: string }) {
  const [step, setStep] = useState(0);
  const [pending, start] = useTransition();
  const p = prefill ?? {};

  // 1 About
  const [name, setName] = useState(p.displayName ?? email.split('@')[0] ?? '');
  const [sex, setSex] = useState<OnboardingPayload['sex'] | null>(null);
  const [birthYear, setBirthYear] = useState('');
  const [units, setUnits] = useState<'kg' | 'lb'>('kg');
  const [height, setHeight] = useState(p.heightCm ? String(p.heightCm) : '');
  const [weight, setWeight] = useState(p.bodyweightKg ? String(p.bodyweightKg) : '');
  const [bf, setBf] = useState(p.bodyFatPct ? String(p.bodyFatPct) : '');
  // 2 Goal
  const [goal, setGoal] = useState<Goal | null>(p.goal ?? null);
  // 3 Experience
  const [status, setStatus] = useState<'novice' | 'intermediate' | 'advanced' | null>(p.status ?? null);
  const [unsure, setUnsure] = useState(false);
  const [years, setYears] = useState<number | null>(null);
  const [trainedLastMonth, setTrainedLastMonth] = useState(true);
  const [seeds, setSeeds] = useState<NonNullable<OnboardingPayload['seeds']>>(p.seeds ?? {});
  // 4 Sports
  const [userSports, setUserSports] = useState<Sport[]>(p.sports ?? []);
  const [customs, setCustoms] = useState<Custom[]>([]);
  const [priority, setPriority] = useState<'lifting' | 'balanced' | 'sport'>(p.priority ?? 'balanced');
  // 5 Availability
  const [days, setDays] = useState<number[]>(p.availableDays ?? [1, 2, 3, 4, 5, 6]);
  const [minutes, setMinutes] = useState<30 | 45 | 60 | 75 | 90 | 120>(p.sessionMinutes ?? 60);
  const [maxDays, setMaxDays] = useState<number | null>(p.maxLiftDays ?? null);
  // 6 Equipment & injuries
  const [preset, setPreset] = useState<Preset>(p.equipmentPreset ?? 'full');
  const [equipment, setEquipment] = useState<Equipment[]>(PRESETS.full);
  const [injuries, setInjuries] = useState<Injury[]>(p.injuries ?? []);
  const [injMuscle, setInjMuscle] = useState<MuscleId | null>(null);
  // 7 Lifestyle
  const [lifestyle, setLifestyle] = useState<OnboardingPayload['lifestyle'] | null>(null);

  const allSports = useMemo(() => [...sports, ...customs.map((c) => ({ id: c.tempId, name: c.name, defaultMinutes: 60, notes: 'Custom sport', custom: true }))], [sports, customs]);
  const effectiveStatus = unsure ? (years == null ? null : years < 1 ? 'novice' : 'intermediate') : status;
  const hasSport = userSports.length > 0;

  const valid = [
    name.trim().length > 0 && !!sex && Number(weight) > 0,
    !!goal,
    !!effectiveStatus,
    userSports.every((s) => s.weekdays.length > 0),
    days.length >= 1,
    preset !== 'custom' || equipment.length > 0,
    !!lifestyle,
  ];

  function toggleSport(id: string) {
    const exists = userSports.find((s) => s.sportId === id);
    if (exists) setUserSports(userSports.filter((s) => s.sportId !== id));
    else setUserSports([...userSports, { sportId: id, weekdays: [], intensity: 'hard', minutes: allSports.find((s) => s.id === id)?.defaultMinutes ?? 60 }]);
  }
  function patchSport(id: string, patch: Partial<Sport>) {
    setUserSports(userSports.map((s) => (s.sportId === id ? { ...s, ...patch } : s)));
  }

  function finish() {
    const wKg = fromDisplay(Number(weight), units);
    const payload: OnboardingPayload = {
      displayName: name.trim(),
      sex: sex!,
      birthYear: num(birthYear),
      heightCm: num(height),
      bodyweightKg: wKg,
      bodyFatPct: num(bf),
      units,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Sofia',
      goal: goal!,
      status: effectiveStatus!,
      trainedLastMonth,
      sports: userSports,
      customSports: customs,
      priority: goal === 'sport_support' ? 'sport' : priority,
      availableDays: days,
      sessionMinutes: minutes,
      maxLiftDays: maxDays,
      equipment: preset === 'custom' ? equipment : PRESETS[preset],
      injuries,
      lifestyle: lifestyle!,
      seeds: Object.fromEntries(Object.entries(seeds).filter(([, v]) => v && v.load > 0 && v.reps > 0)),
    };
    start(async () => {
      const res = await completeOnboarding(payload);
      if (res?.error) toast.error(res.error);
    });
  }

  return (
    <main className="relative z-10 mx-auto flex min-h-dvh max-w-xl flex-col px-4 pt-6 pb-28 sm:px-6">
      <div className="flex items-center gap-3">
        <PyramidMark lit={Math.ceil(((step + 1) / STEPS.length) * 3)} />
        <div className="min-w-0 flex-1">
          <p className="stamp text-muted-foreground">
            Step {step + 1} of {STEPS.length}
          </p>
          <div className="bg-muted mt-1.5 h-1.5 overflow-hidden rounded-full" role="progressbar" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={step + 1}>
            <div className="bg-volt h-full rounded-full transition-all duration-500" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
          </div>
        </div>
      </div>
      <h1 className="font-display mt-6 text-5xl leading-none font-extrabold uppercase">{STEPS[step]}</h1>

      <section className="rise mt-6 space-y-5" key={step}>
        {step === 0 && (
          <>
            {prefill && <p className="bg-accent/50 text-accent-foreground rounded-xl p-3 text-sm">Your profile was imported. Check each step and confirm.</p>}
            <Field label="Name">
              <Input value={name} onChange={(e) => setName(e.target.value)} className="h-12 text-base" />
            </Field>
            <Field label="Sex (used for body-fat thresholds)">
              <Segmented label="Sex" value={sex} onChange={setSex} options={[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }]} />
            </Field>
            <Field label="Units">
              <Segmented label="Units" value={units} onChange={setUnits} options={[{ value: 'kg', label: 'kg' }, { value: 'lb', label: 'lb' }]} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={`Bodyweight (${units})`}>
                <Input inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} className="num h-12 text-base" placeholder="72" />
              </Field>
              <Field label="Height (cm)">
                <Input inputMode="decimal" value={height} onChange={(e) => setHeight(e.target.value)} className="num h-12 text-base" placeholder="175" />
              </Field>
              <Field label="Birth year">
                <Input inputMode="numeric" value={birthYear} onChange={(e) => setBirthYear(e.target.value)} className="num h-12 text-base" placeholder="1995" />
              </Field>
              <Field label="Body fat % (optional)">
                <Input inputMode="decimal" value={bf} onChange={(e) => setBf(e.target.value)} className="num h-12 text-base" placeholder="skip" />
              </Field>
            </div>
            <p className="text-muted-foreground text-xs">This app gives general training and nutrition guidance. It is not a substitute for a doctor or physiotherapist.</p>
          </>
        )}

        {step === 1 && (
          <div className="space-y-3">
            {GOALS.map((g) => (
              <Card key={g.id} active={goal === g.id} onClick={() => setGoal(g.id)} title={g.title} line={g.line} />
            ))}
            {goal === 'recomp' && <p className="text-muted-foreground text-sm">Good news: muscle can be built at maintenance, especially if your training just got better. <Why ruleIds={['N-PHS-03']} /></p>}
          </div>
        )}

        {step === 2 && (
          <>
            <p className="text-muted-foreground text-sm">
              Status is about how fast you progress, not years or strength. <Why ruleIds={['T-STA-01', 'T-STA-02']} />
            </p>
            <div className="space-y-3">
              {STATUSES.map((s) => (
                <Card key={s.id} active={!unsure && status === s.id} onClick={() => { setStatus(s.id); setUnsure(false); }} title={s.title} line={s.line} />
              ))}
              <Card active={unsure} onClick={() => setUnsure(true)} title="Not sure" line="Answer one question instead." />
            </div>
            {unsure && (
              <Field label="How long have you trained consistently?">
                <Segmented label="Years trained" value={years} onChange={setYears} options={[{ value: 0.5, label: '< 1 yr' }, { value: 3, label: '1–5 yrs' }, { value: 6, label: '5+ yrs' }]} />
              </Field>
            )}
            <Field label="Trained regularly in the last month?" hint="After time off your first week is an easier intro week.">
              <Segmented label="Trained last month" value={trainedLastMonth ? 'y' : 'n'} onChange={(v) => setTrainedLastMonth(v === 'y')} options={[{ value: 'y', label: 'Yes' }, { value: 'n', label: 'No' }]} />
            </Field>
            <details className="bg-card rounded-xl border p-3" open={goal === 'strength' || !!prefill?.seeds}>
              <summary className="cursor-pointer text-sm font-medium">Recent best sets (optional): seeds your starting weights</summary>
              <div className="mt-3 space-y-2">
                {(['squat', 'bench', 'deadlift', 'ohp'] as const).map((lift) => (
                  <div key={lift} className="grid grid-cols-[6rem_1fr_auto_1fr] items-center gap-2">
                    <span className="text-sm capitalize">{lift === 'ohp' ? 'OHP' : lift}</span>
                    <Input inputMode="decimal" aria-label={`${lift} load`} placeholder={units} value={seeds[lift]?.load ?? ''} onChange={(e) => setSeeds({ ...seeds, [lift]: { load: Number(e.target.value) || 0, reps: seeds[lift]?.reps ?? 5 } })} className="num h-11" />
                    <span className="text-muted-foreground text-sm">×</span>
                    <Input inputMode="numeric" aria-label={`${lift} reps`} placeholder="reps" value={seeds[lift]?.reps ?? ''} onChange={(e) => setSeeds({ ...seeds, [lift]: { load: seeds[lift]?.load ?? 0, reps: Number(e.target.value) || 0 } })} className="num h-11" />
                  </div>
                ))}
              </div>
            </details>
          </>
        )}

        {step === 3 && (
          <>
            <div className="flex flex-wrap gap-2">
              {allSports.map((s) => (
                <Chip key={s.id} active={!!userSports.find((u) => u.sportId === s.id)} onClick={() => toggleSport(s.id)}>
                  {s.name}
                </Chip>
              ))}
              <CustomSportButton onAdd={(c) => { setCustoms([...customs, c]); setUserSports([...userSports, { sportId: c.tempId, weekdays: [], intensity: 'moderate', minutes: 60 }]); }} />
            </div>
            {userSports.map((us) => {
              const meta = allSports.find((s) => s.id === us.sportId);
              return (
                <div key={us.sportId} className="bg-card space-y-3 rounded-2xl border p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-display text-2xl font-bold uppercase">{meta?.name}</p>
                    <button type="button" aria-label="Remove sport" onClick={() => toggleSport(us.sportId)} className="text-muted-foreground grid size-9 place-items-center">
                      <X className="size-4" />
                    </button>
                  </div>
                  {meta?.notes && <p className="text-muted-foreground text-xs">{meta.notes}</p>}
                  <Field label="Days">
                    <div className="grid grid-cols-7 gap-1">
                      {DAYS.map((d, i) => (
                        <button
                          key={i}
                          type="button"
                          aria-pressed={us.weekdays.includes(i + 1)}
                          aria-label={DAY_NAMES[i]}
                          onClick={() => patchSport(us.sportId, { weekdays: us.weekdays.includes(i + 1) ? us.weekdays.filter((x) => x !== i + 1) : [...us.weekdays, i + 1] })}
                          className={cn('h-11 rounded-lg text-sm font-semibold', us.weekdays.includes(i + 1) ? 'bg-volt text-volt-ink' : 'bg-muted text-muted-foreground')}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                  </Field>
                  <Field label="Intensity">
                    <Segmented label="Intensity" value={us.intensity} onChange={(v) => patchSport(us.sportId, { intensity: v })} options={[{ value: 'light', label: 'Light' }, { value: 'moderate', label: 'Moderate' }, { value: 'hard', label: 'Hard' }, { value: 'match', label: 'Match' }]} />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Minutes">
                      <Input inputMode="numeric" value={us.minutes} onChange={(e) => patchSport(us.sportId, { minutes: Number(e.target.value) || 0 })} className="num h-11" />
                    </Field>
                    <Field label="Time of day">
                      <Segmented label="Time of day" value={us.timeOfDay ?? null} onChange={(v) => patchSport(us.sportId, { timeOfDay: v })} options={[{ value: 'morning', label: 'AM' }, { value: 'midday', label: 'Mid' }, { value: 'evening', label: 'PM' }]} />
                    </Field>
                  </div>
                </div>
              );
            })}
            {hasSport && goal !== 'sport_support' && (
              <Field label="What comes first?">
                <Segmented label="Priority" value={priority} onChange={setPriority} options={[{ value: 'lifting', label: 'Lifting' }, { value: 'balanced', label: 'Balanced' }, { value: 'sport', label: 'My sport' }]} />
                <p className="text-muted-foreground text-xs">
                  When both matter, one has to lead. <Why ruleIds={['T-PRI-01', 'S-02']} />
                </p>
              </Field>
            )}
            {!hasSport && <p className="text-muted-foreground text-sm">No sports? Skip this step.</p>}
          </>
        )}

        {step === 4 && (
          <>
            <Field label="Which days could you lift?" hint="The app picks how many and which ones, around your sports.">
              <div className="grid grid-cols-7 gap-1">
                {DAYS.map((d, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-pressed={days.includes(i + 1)}
                    aria-label={DAY_NAMES[i]}
                    onClick={() => setDays(days.includes(i + 1) ? days.filter((x) => x !== i + 1) : [...days, i + 1])}
                    className={cn('h-12 rounded-lg font-semibold', days.includes(i + 1) ? 'bg-volt text-volt-ink' : 'bg-muted text-muted-foreground')}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Session length (minutes)">
              <Segmented label="Session minutes" value={minutes} onChange={setMinutes} options={[30, 45, 60, 75, 90, 120].map((m) => ({ value: m as 30, label: m }))} />
            </Field>
            <Field label="No more than … lifting days (optional)">
              <Segmented label="Max lift days" value={maxDays} onChange={(v) => setMaxDays(v === 0 ? null : v)} options={[{ value: 0, label: 'Any' }, ...[2, 3, 4, 5, 6].map((n) => ({ value: n, label: n }))]} />
            </Field>
          </>
        )}

        {step === 5 && (
          <>
            <Field label="Equipment">
              <Segmented
                label="Equipment preset"
                value={preset}
                onChange={(v) => { setPreset(v); if (v !== 'custom') setEquipment(PRESETS[v]); }}
                options={[{ value: 'full', label: 'Full gym' }, { value: 'dumbbells', label: 'Dumbbells' }, { value: 'bodyweight', label: 'Bodyweight' }, { value: 'custom', label: 'Custom' }]}
              />
            </Field>
            {preset === 'custom' && (
              <div className="flex flex-wrap gap-2">
                {ALL_EQ.map((e) => (
                  <Chip key={e} active={equipment.includes(e)} onClick={() => setEquipment(equipment.includes(e) ? equipment.filter((x) => x !== e) : [...equipment, e])}>
                    <span className="capitalize">{e}</span>
                  </Chip>
                ))}
              </div>
            )}
            <Field label="Anything hurting or in rehab?" hint="Tap the area on the body map.">
              <BodyMap side="both" selected={injMuscle} onSelect={setInjMuscle} styles={Object.fromEntries(injuries.map((i) => [i.muscleId, { fill: 'color-mix(in oklch, var(--danger) 45%, var(--card))', dashed: true, label: i.severity }]))} className="mx-auto max-w-sm" />
            </Field>
            {injMuscle && !injuries.find((i) => i.muscleId === injMuscle) && (
              <div className="bg-card space-y-3 rounded-2xl border p-4">
                <p className="font-display text-2xl font-bold uppercase">{MUSCLE_SHORT[injMuscle]}</p>
                <Segmented
                  label="Severity"
                  value={null as Injury['severity'] | null}
                  onChange={(sev) => {
                    setInjuries([...injuries, { muscleId: injMuscle, label: `${MUSCLE_SHORT[injMuscle]} ${sev}`, severity: sev, status: 'active', note: '', avoidSlugs: [] }]);
                    setInjMuscle(null);
                  }}
                  options={[{ value: 'niggle' as const, label: 'Niggle' }, { value: 'pain' as const, label: 'Pain' }, { value: 'injury' as const, label: 'Injury' }]}
                />
              </div>
            )}
            {injuries.map((inj, idx) => (
              <div key={inj.muscleId} className="bg-card space-y-2 rounded-2xl border p-4">
                <div className="flex items-center justify-between">
                  <p className="font-medium">
                    {inj.label} <span className="stamp text-danger ml-1">{inj.severity}</span>
                  </p>
                  <button type="button" aria-label="Remove" className="text-muted-foreground grid size-9 place-items-center" onClick={() => setInjuries(injuries.filter((_, i) => i !== idx))}>
                    <X className="size-4" />
                  </button>
                </div>
                <Textarea placeholder="Optional note (e.g. your physio’s protocol)" value={inj.note ?? ''} onChange={(e) => setInjuries(injuries.map((x, i) => (i === idx ? { ...x, note: e.target.value } : x)))} />
                {inj.severity !== 'niggle' && <p className="text-muted-foreground text-xs">Heavy spinal and impact exercises for this area are removed automatically. If pain is persistent or reproducible, see a physio. <Why ruleIds={['T-SEL-08']} /></p>}
              </div>
            ))}
          </>
        )}

        {step === 6 && (
          <>
            <p className="text-muted-foreground text-sm">
              Outside lifting and sports; those are counted separately. <Why ruleIds={['N-MNT-02', 'N-MNT-04']} />
            </p>
            <div className="space-y-3">
              {LIFESTYLES.map((l) => (
                <Card key={l.id} active={lifestyle === l.id} onClick={() => setLifestyle(l.id)} title={l.title} line={l.line} />
              ))}
            </div>
            <p className="text-muted-foreground text-xs">Your starting calories are an estimate; your weight trend fine-tunes them over the first weeks. <Why ruleIds={['N-MNT-03']} /></p>
          </>
        )}
      </section>

      <div className="bg-background/90 pb-safe fixed inset-x-0 bottom-0 z-20 border-t backdrop-blur">
        <div className="mx-auto flex max-w-xl gap-3 px-4 py-3">
          <Button variant="outline" size="lg" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0 || pending} aria-label="Back">
            <ArrowLeft />
          </Button>
          {step < STEPS.length - 1 ? (
            <Button size="lg" className="flex-1" disabled={!valid[step]} onClick={() => setStep(step + 1)}>
              Continue <ArrowRight />
            </Button>
          ) : (
            <Button size="lg" className="flex-1" disabled={!valid.every(Boolean) || pending} onClick={finish}>
              {pending ? 'Building your plan…' : 'Build my plan'} <Check />
            </Button>
          )}
        </div>
      </div>
    </main>
  );
}

function CustomSportButton({ onAdd }: { onAdd: (c: Custom) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [scores, setScores] = useState({ lower: 2, upper: 1, impact: 1, conditioning: 2 });
  const [muscles, setMuscles] = useState<MuscleId[]>([]);
  if (!open)
    return (
      <Chip active={false} onClick={() => setOpen(true)}>
        <Plus className="size-4" /> Custom
      </Chip>
    );
  const q: [keyof typeof scores, string][] = [
    ['lower', 'How hard on your legs?'],
    ['upper', 'Arms and shoulders?'],
    ['impact', 'Jumping / landing?'],
    ['conditioning', 'Lungs?'],
  ];
  return (
    <div className="bg-card w-full space-y-3 rounded-2xl border p-4">
      <Input placeholder="Sport name" value={name} onChange={(e) => setName(e.target.value)} className="h-11" />
      {q.map(([k, label]) => (
        <div key={k} className="space-y-1">
          <p className="text-sm">{label}</p>
          <Segmented label={label} value={scores[k]} onChange={(v) => setScores({ ...scores, [k]: v })} options={[0, 1, 2, 3].map((n) => ({ value: n, label: ['None', 'Low', 'Med', 'High'][n] }))} />
        </div>
      ))}
      <p className="text-sm">Muscles it works hardest</p>
      <div className="flex flex-wrap gap-1.5">
        {(['quads', 'hamstrings', 'glutes', 'calves', 'chest', 'back', 'front_delts', 'side_delts', 'triceps', 'biceps'] as MuscleId[]).map((m) => (
          <Chip key={m} className="h-9 px-3" active={muscles.includes(m)} onClick={() => setMuscles(muscles.includes(m) ? muscles.filter((x) => x !== m) : [...muscles, m])}>
            {MUSCLE_SHORT[m]}
          </Chip>
        ))}
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button
          disabled={name.trim().length < 2}
          onClick={() => {
            onAdd({ tempId: `custom-${Date.now()}`, name: name.trim(), ...scores, muscles });
            setOpen(false);
            setName('');
          }}
        >
          Add sport
        </Button>
      </div>
    </div>
  );
}
