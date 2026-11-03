'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, Download, LogOut, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { deleteAccount, deleteInjury, deleteSport, regenerateNow, saveInjury, saveSport, toggleSport, updateProfile, updateTheme, updateTraining } from '@/lib/actions/settings';
import { signOut } from '@/lib/actions/auth';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Chip, DAY_NAMES, DayPicker, Disclosure, Group, Row, Segmented, Why } from '@/components/app/bits';
import { useTheme, type ThemePref } from '@/components/providers';
import { ALL_MUSCLES, TRACKED_MUSCLES, type Equipment, type MainLift, type MuscleId, type SportIntensity, type TrackedMuscle } from '@/lib/engine/types';
import { MUSCLE_SHORT } from '@/lib/knowledge/muscles';
import { cn } from '@/lib/utils';
import { fromDisplay, toDisplay } from '@/lib/utils/units';

type Goal = 'lean_gain' | 'recomp' | 'strength' | 'fat_loss' | 'sport_support';
interface Training {
  goal: Goal;
  priority: 'lifting' | 'balanced' | 'sport';
  status: 'novice' | 'intermediate' | 'advanced';
  availableDays: number[];
  sessionMinutes: 30 | 45 | 60 | 75 | 90 | 120;
  maxLiftDays: number | null;
  splitStyle: 'default' | 'alternative';
  liftingTime: 'morning' | 'midday' | 'evening' | null;
  repVariation: 'within_session' | 'between_session' | 'alternating_week';
  equipment: Equipment[];
  increments: { barbell: number; dumbbell: number; machine: number; cable: number };
  specialization: TrackedMuscle[];
  strengthLifts: MainLift[];
  testDate: string | null;
}
interface Profile {
  displayName: string;
  sex: 'male' | 'female' | null;
  heightCm: number | null;
  bodyFatPct: number | null;
  units: 'kg' | 'lb';
  timezone: string;
  hideBodyweight: boolean;
  lifestyle: 'sedentary' | 'lightly_active' | 'active' | 'very_active';
}
interface US {
  id?: string;
  sportId: string;
  name: string;
  weekdays: number[];
  intensity: SportIntensity;
  minutes: number;
  timeOfDay: 'morning' | 'midday' | 'evening' | null;
  active: boolean;
}
interface Inj {
  id?: string;
  muscleId: MuscleId;
  label: string;
  severity: 'niggle' | 'pain' | 'injury';
  status: 'active' | 'rehab' | 'resolved';
  note: string | null;
  avoidExerciseIds: string[];
}

const EQ: Equipment[] = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'band', 'sled'];
const INC_KEYS = ['barbell', 'dumbbell', 'machine', 'cable'] as const;
type IncKey = (typeof INC_KEYS)[number];

const EXPORTS = [
  { href: '/api/export?format=json', label: 'Everything (JSON)' },
  { href: '/api/export?format=csv&type=sets', label: 'Logged sets (CSV)' },
  { href: '/api/export?format=csv&type=weighins', label: 'Weigh-ins (CSV)' },
  { href: '/api/export?format=csv&type=checkins', label: 'Check-ins (CSV)' },
  { href: '/api/export?format=csv&type=nutrition', label: 'Nutrition targets (CSV)' },
];
const ROW_BUTTON = 'hover:bg-muted/50 flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left text-[0.95rem] font-medium transition-colors';
/** A label above a control inside an editing sheet. */
function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">{label}</p>
      {children}
      {hint && <div className="text-muted-foreground text-sm">{hint}</div>}
    </div>
  );
}

export function SettingsForms({ training, profile, userSports, catalog, injuries, exercises }: { training: Training; profile: Profile; userSports: US[]; catalog: { id: string; name: string; defaultMinutes: number }[]; injuries: Inj[]; exercises: { id: string; name: string }[] }) {
  const [t, setT] = useState(training);
  const [p, setP] = useState(profile);
  const [pending, start] = useTransition();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  // Weight jumps are stored in kg but shown and typed in the saved units; drafts keep half-typed input like "2.".
  const incUnits = profile.units;
  const [incText, setIncText] = useState(() => Object.fromEntries(INC_KEYS.map((k) => [k, String(toDisplay(training.increments[k], incUnits) ?? '')])) as Record<IncKey, string>);
  const dirtyT = JSON.stringify(t) !== JSON.stringify(training);
  const dirtyP = JSON.stringify(p) !== JSON.stringify(profile);
  const tz = typeof Intl !== 'undefined' ? Intl.supportedValuesOf?.('timeZone') ?? [p.timezone] : [p.timezone];

  const discard = () => {
    setT(training);
    setP(profile);
    setIncText(Object.fromEntries(INC_KEYS.map((k) => [k, String(toDisplay(training.increments[k], incUnits) ?? '')])) as Record<IncKey, string>);
  };
  const saveChanges = () => {
    const sex = p.sex;
    if (dirtyP && !sex) {
      toast.error('Choose Male or Female for Sex.');
      return;
    }
    start(async () => {
      if (dirtyP) {
        const r = await updateProfile({ ...p, sex: sex! });
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
      }
      if (dirtyT) {
        const r = await updateTraining(t);
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
      }
      toast.success(dirtyT ? 'Saved. Future sessions regenerated' : 'Profile saved');
      router.refresh();
    });
  };

  return (
    <div className="space-y-6 pb-24">
      <Group title="Your plan" why={['T-SCH-01', 'T-PRI-01', 'T-STA-01']}>
        <Row label="Goal" inline>
          <Select value={t.goal} onValueChange={(v) => setT({ ...t, goal: v as Goal })}>
            <SelectTrigger className="h-11! w-44" aria-label="Goal">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="lean_gain">Lean muscle gain</SelectItem>
              <SelectItem value="recomp">Recomp</SelectItem>
              <SelectItem value="strength">Strength</SelectItem>
              <SelectItem value="fat_loss">Fat loss</SelectItem>
              <SelectItem value="sport_support">Support my sport</SelectItem>
            </SelectContent>
          </Select>
        </Row>
        {t.goal !== 'sport_support' && (
          <Row label="What comes first?">
            <Segmented label="Priority" value={t.priority} onChange={(v) => setT({ ...t, priority: v })} options={[{ value: 'lifting', label: 'Lifting' }, { value: 'balanced', label: 'Balanced' }, { value: 'sport', label: 'Sport' }]} />
          </Row>
        )}
        <Row label="Training status">
          <Segmented label="Status" value={t.status} onChange={(v) => setT({ ...t, status: v })} options={[{ value: 'novice', label: 'Novice' }, { value: 'intermediate', label: 'Intermediate' }, { value: 'advanced', label: 'Advanced' }]} />
        </Row>
        {t.goal === 'strength' && (
          <>
            <Row label="Main lifts">
              <div className="flex flex-wrap gap-1.5">
                {(['squat', 'bench', 'deadlift', 'ohp'] as MainLift[]).map((l) => (
                  <Chip key={l} className="px-3 capitalize" active={t.strengthLifts.includes(l)} onClick={() => setT({ ...t, strengthLifts: t.strengthLifts.includes(l) ? t.strengthLifts.filter((x) => x !== l) : [...t.strengthLifts, l] })}>
                    {l === 'ohp' ? 'Overhead press' : l}
                  </Chip>
                ))}
              </div>
            </Row>
            <Row label="Test or meet date" hint={<>Optional. Adds a peak phase before the date. <Why ruleIds={['T-STR-04']} /></>}>
              <Input type="date" value={t.testDate ?? ''} onChange={(e) => setT({ ...t, testDate: e.target.value || null })} className="h-11 w-full sm:w-48" />
            </Row>
          </>
        )}
      </Group>

      <Group title="Schedule">
        <Row label="Days you could lift">
          <DayPicker label="Days you could lift" value={t.availableDays} onChange={(v) => setT({ ...t, availableDays: v })} />
        </Row>
        <Row label="Session length (minutes)">
          <Segmented label="Session minutes" value={t.sessionMinutes} onChange={(v) => setT({ ...t, sessionMinutes: v })} options={[30, 45, 60, 75, 90, 120].map((m) => ({ value: m as 30, label: m }))} />
        </Row>
        <Row label="Most lifting days a week">
          <Segmented label="Max lift days" value={t.maxLiftDays ?? 0} onChange={(v) => setT({ ...t, maxLiftDays: v === 0 ? null : v })} options={[{ value: 0, label: 'Any' }, ...[2, 3, 4, 5, 6].map((n) => ({ value: n, label: n }))]} />
        </Row>
        <Row label="Usual lifting time" hint={<>Sports go after lifting or a few hours apart when possible. <Why ruleIds={['T-SCH-03']} /></>}>
          <Segmented
            label="Lifting time"
            value={t.liftingTime ?? 'any'}
            onChange={(v) => setT({ ...t, liftingTime: v === 'any' ? null : v })}
            options={[{ value: 'any', label: 'Varies' }, { value: 'morning', label: 'Morning' }, { value: 'midday', label: 'Midday' }, { value: 'evening', label: 'Evening' }]}
          />
        </Row>
      </Group>

      <Group title="Equipment">
        <Row label="What you have">
          <div className="flex flex-wrap gap-1.5">
            {EQ.map((e) => (
              <Chip key={e} className="px-3 capitalize" active={t.equipment.includes(e)} onClick={() => setT({ ...t, equipment: t.equipment.includes(e) ? t.equipment.filter((x) => x !== e) : [...t.equipment, e] })}>
                {e}
              </Chip>
            ))}
          </div>
        </Row>
        <Row label={`Smallest weight jumps (${incUnits})`}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {INC_KEYS.map((k) => (
              <label key={k} className="text-muted-foreground space-y-1 text-sm capitalize">
                {k}
                <Input
                  inputMode="decimal"
                  value={incText[k]}
                  onChange={(e) => {
                    setIncText({ ...incText, [k]: e.target.value });
                    setT({ ...t, increments: { ...t.increments, [k]: fromDisplay(Number(e.target.value) || 0, incUnits) } });
                  }}
                  className="num text-foreground h-11"
                />
              </label>
            ))}
          </div>
        </Row>
      </Group>

      <Group title="Fine-tuning" footer="Changes replace future sessions from today. Your moves, skips and swaps are kept, and your logged history is never touched.">
        <Disclosure summary="Split and rep ranges">
          <div className="space-y-4">
            <Field label="Split style" hint="Alternative: Upper/Lower → Pyramid alternating (4 days), Full Push / Full Pull for 3, 5 and 6 days.">
              <Segmented label="Split style" value={t.splitStyle} onChange={(v) => setT({ ...t, splitStyle: v })} options={[{ value: 'default', label: 'Default' }, { value: 'alternative', label: 'Alternative' }]} />
            </Field>
            <Field label="Rep-range variation" hint={<>How heavier and lighter rep ranges rotate. <Why ruleIds={['T-INT-04']} /></>}>
              <Segmented label="Rep variation" value={t.repVariation} onChange={(v) => setT({ ...t, repVariation: v })} options={[{ value: 'within_session', label: 'In session' }, { value: 'between_session', label: 'A/B days' }, { value: 'alternating_week', label: 'A/B weeks' }]} />
            </Field>
            {t.status === 'advanced' && (
              <Field label="Specialise (up to 2 muscles)" hint={<>Raised about 50% for 8–12 weeks while the rest drop. <Why ruleIds={['T-VOL-08']} /></>}>
                <div className="flex flex-wrap gap-1.5">
                  {TRACKED_MUSCLES.map((m) => (
                    <Chip
                      key={m}
                      className="px-3"
                      active={t.specialization.includes(m)}
                      onClick={() => setT({ ...t, specialization: t.specialization.includes(m) ? t.specialization.filter((x) => x !== m) : [...t.specialization, m].slice(-2) })}
                    >
                      {MUSCLE_SHORT[m]}
                    </Chip>
                  ))}
                </div>
              </Field>
            )}
          </div>
        </Disclosure>
        <button
          type="button"
          className={ROW_BUTTON}
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await regenerateNow();
              if (!r.ok) {
                toast.error(r.error);
                return;
              }
              toast.success('Plan regenerated from today');
              router.refresh();
            })
          }
        >
          <RefreshCw className="text-muted-foreground size-5" aria-hidden /> Regenerate plan
        </button>
      </Group>

      <SportsEditor userSports={userSports} catalog={catalog} />
      <InjuriesEditor injuries={injuries} exercises={exercises} />

      <Group title="About you">
        <Row label="Name">
          <Input value={p.displayName} onChange={(e) => setP({ ...p, displayName: e.target.value })} className="h-11" aria-label="Name" />
        </Row>
        <Row label="Sex" hint={p.sex ? undefined : <span className="text-danger">Choose Male or Female to save your profile.</span>}>
          <Segmented label="Sex" value={p.sex} onChange={(v) => setP({ ...p, sex: v })} options={[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }]} />
        </Row>
        <Row label="Height (cm)" inline>
          <Input inputMode="decimal" value={p.heightCm ?? ''} onChange={(e) => setP({ ...p, heightCm: e.target.value ? Number(e.target.value) : null })} className="num h-11 w-24 text-right" aria-label="Height in centimetres" />
        </Row>
        <Row label="Body fat %" hint="Optional" inline>
          <Input inputMode="decimal" value={p.bodyFatPct ?? ''} onChange={(e) => setP({ ...p, bodyFatPct: e.target.value ? Number(e.target.value) : null })} className="num h-11 w-24 text-right" aria-label="Body fat percent" />
        </Row>
        <Row label="Daily activity" hint={<>Outside lifting and sport. <Why ruleIds={['N-MNT-02', 'N-MNT-04']} /></>} inline>
          <Select value={p.lifestyle} onValueChange={(v) => setP({ ...p, lifestyle: v as Profile['lifestyle'] })}>
            <SelectTrigger className="h-11! w-40" aria-label="Lifestyle">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sedentary">Sedentary</SelectItem>
              <SelectItem value="lightly_active">Lightly active</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="very_active">Very active</SelectItem>
            </SelectContent>
          </Select>
        </Row>
      </Group>

      <Group title="Display">
        <Row label="Units" inline>
          <Segmented className="w-32" label="Units" value={p.units} onChange={(v) => setP({ ...p, units: v })} options={[{ value: 'kg', label: 'kg' }, { value: 'lb', label: 'lb' }]} />
        </Row>
        <Row label="Appearance">
          <Segmented label="Theme" value={theme} onChange={(v: ThemePref) => {
              // Applies at once (and caches locally); saving to the profile carries it to other devices.
              setTheme(v);
              void updateTheme(v).then((r) => !r.ok && toast.error('Theme applied here, but could not be saved to your account.'));
            }} options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
        </Row>
        <Row label="Time zone">
          <Select value={p.timezone} onValueChange={(v) => setP({ ...p, timezone: v })}>
            <SelectTrigger className="h-11! w-full" aria-label="Timezone">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {tz.map((z) => (
                <SelectItem key={z} value={z}>
                  {z}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <label className="flex min-h-14 cursor-pointer items-center justify-between gap-4 px-4 py-2">
          <span className="min-w-0">
            <span className="block text-[0.95rem] font-medium">Hide bodyweight numbers</span>
            <span className="text-muted-foreground block text-sm">Show only the trend direction.</span>
          </span>
          <Switch checked={p.hideBodyweight} onCheckedChange={(v) => setP({ ...p, hideBodyweight: v })} />
        </label>
      </Group>

      <Group id="data" title="Your data" footer="Your data is visible only to you; not even the app owner can see your training or health data.">
        <Disclosure summary="Export your data">
          <ul className="-mx-4 -mb-4 divide-y border-t">
            {EXPORTS.map((e) => (
              <li key={e.href}>
                <a href={e.href} className={ROW_BUTTON}>
                  <Download className="text-muted-foreground size-5" aria-hidden /> {e.label}
                </a>
              </li>
            ))}
          </ul>
        </Disclosure>
      </Group>

      <Group title="Account" footer="This app gives general training and nutrition guidance. It is not a substitute for a doctor or physiotherapist.">
        <form action={signOut}>
          <button type="submit" className={ROW_BUTTON}>
            <LogOut className="text-muted-foreground size-5" aria-hidden /> Sign out
          </button>
        </form>
        <DeleteAccount />
      </Group>

      {(dirtyT || dirtyP) && (
        <div className="bar-material pointer-events-auto fixed inset-x-0 bottom-[calc(4rem+1px+env(safe-area-inset-bottom))] z-30 border-t lg:bottom-0 lg:left-60" role="status">
          <div className="mx-auto flex max-w-4xl items-center gap-2 px-4 py-2 sm:px-6 lg:px-8">
            <Button variant="ghost" disabled={pending} onClick={discard}>
              Discard
            </Button>
            <Button className="flex-1" disabled={pending} onClick={saveChanges}>
              {pending ? 'Saving…' : dirtyT ? 'Save and update plan' : 'Save changes'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function SportsEditor({ userSports, catalog }: { userSports: US[]; catalog: { id: string; name: string; defaultMinutes: number }[] }) {
  const [editing, setEditing] = useState<US | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const done = (msg: string) => {
    toast.success(msg, { description: 'Week regenerated and sport calories updated.' });
    setEditing(null);
    router.refresh();
  };
  return (
    <Group title="Sports" why={['S-01', 'S-02', 'S-03', 'N-SPT-03']} footer={userSports.length ? undefined : 'Add a sport and lifting is scheduled around it.'}>
      {userSports.map((s) => (
        <div key={s.id} className="flex items-center gap-1 pr-4">
          <button type="button" onClick={() => setEditing(s)} className="hover:bg-muted/50 flex min-h-14 min-w-0 flex-1 items-center gap-2 py-2 pl-4 text-left transition-colors" aria-label={`Edit ${s.name}`}>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{s.name}</span>
              <span className="text-muted-foreground block text-sm">
                {s.weekdays.map((d) => DAY_NAMES[d - 1]).join(', ')} · <span className="capitalize">{s.intensity}</span> · {s.minutes} min
              </span>
            </span>
            <ChevronRight className="text-muted-foreground size-5 shrink-0" aria-hidden />
          </button>
          <Switch
            className="ml-2"
            checked={s.active}
            aria-label={`${s.name} active`}
            disabled={pending}
            onCheckedChange={(v) =>
              start(async () => {
                const r = await toggleSport(s.id!, v);
                if (!r.ok) toast.error(r.error);
                else done(v ? `${s.name} on` : `${s.name} off`);
              })
            }
          />
        </div>
      ))}
      <button type="button" className={ROW_BUTTON} onClick={() => setEditing({ sportId: catalog[0]?.id ?? 'football', name: catalog[0]?.name ?? '', weekdays: [], intensity: 'moderate', minutes: catalog[0]?.defaultMinutes ?? 60, timeOfDay: null, active: true })}>
        <Plus className="text-muted-foreground size-5" aria-hidden /> Add sport
      </button>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          {editing && (
            <>
              <DialogHeader>
                <DialogTitle>{editing.id ? editing.name : 'Add sport'}</DialogTitle>
                <DialogDescription>Your week is rebuilt around this when you save.</DialogDescription>
              </DialogHeader>
              {!editing.id && (
                <Field label="Sport">
                  <Select value={editing.sportId} onValueChange={(v) => setEditing({ ...editing, sportId: v, minutes: catalog.find((c) => c.id === v)?.defaultMinutes ?? 60 })}>
                    <SelectTrigger className="h-11! w-full" aria-label="Sport">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {catalog.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
              <Field label="Days">
                <DayPicker label="Sport days" value={editing.weekdays} onChange={(v) => setEditing({ ...editing, weekdays: v })} />
              </Field>
              <Field label="Intensity">
                <Segmented label="Intensity" value={editing.intensity} onChange={(v) => setEditing({ ...editing, intensity: v })} options={[{ value: 'light', label: 'Light' }, { value: 'moderate', label: 'Moderate' }, { value: 'hard', label: 'Hard' }, { value: 'match', label: 'Match' }]} />
              </Field>
              <Field label="Minutes">
                <Input inputMode="numeric" value={editing.minutes} onChange={(e) => setEditing({ ...editing, minutes: Number(e.target.value) || 0 })} className="num h-11" aria-label="Minutes" />
              </Field>
              <Field label="Time of day">
                <Segmented label="Time of day" value={editing.timeOfDay} onChange={(v) => setEditing({ ...editing, timeOfDay: v })} options={[{ value: 'morning', label: 'Morning' }, { value: 'midday', label: 'Midday' }, { value: 'evening', label: 'Evening' }]} />
              </Field>
              <Button
                size="lg"
                disabled={pending || !editing.weekdays.length}
                onClick={() =>
                  start(async () => {
                    const r = await saveSport({ id: editing.id, sportId: editing.sportId, weekdays: editing.weekdays, intensity: editing.intensity, minutes: editing.minutes, timeOfDay: editing.timeOfDay, active: editing.active });
                    if (!r.ok) toast.error(r.error);
                    else done('Sport saved');
                  })
                }
              >
                Save sport
              </Button>
              {editing.id && (
                <Button
                  variant="destructive"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await deleteSport(editing.id!);
                      if (!r.ok) {
                        toast.error(r.error);
                        return;
                      }
                      done('Sport removed');
                    })
                  }
                >
                  <Trash2 /> Remove sport
                </Button>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </Group>
  );
}

function InjuriesEditor({ injuries, exercises }: { injuries: Inj[]; exercises: { id: string; name: string }[] }) {
  const [editing, setEditing] = useState<Inj | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const [q, setQ] = useState('');
  return (
    <Group title="Injuries and niggles" why={['T-SEL-08']}>
      {injuries.map((i) => (
        <button key={i.id} type="button" onClick={() => setEditing(i)} className="hover:bg-muted/50 flex min-h-14 w-full items-center gap-2 px-4 py-2 text-left transition-colors">
          <span className="min-w-0 flex-1">
            <span className={cn('block font-medium', i.status === 'resolved' && 'text-muted-foreground')}>{i.label}</span>
            <span className="text-muted-foreground block text-sm">
              {MUSCLE_SHORT[i.muscleId]} · <span className="capitalize">{i.severity}</span> · <span className={i.status === 'active' ? 'text-danger capitalize' : 'capitalize'}>{i.status}</span>
              {i.avoidExerciseIds.length > 0 && ` · avoiding ${i.avoidExerciseIds.length} exercise${i.avoidExerciseIds.length > 1 ? 's' : ''}`}
            </span>
            {i.note && <span className="text-muted-foreground mt-0.5 block text-sm">{i.note}</span>}
          </span>
          <ChevronRight className="text-muted-foreground size-5 shrink-0" aria-hidden />
        </button>
      ))}
      <button type="button" className={ROW_BUTTON} onClick={() => setEditing({ muscleId: 'hamstrings', label: '', severity: 'niggle', status: 'active', note: '', avoidExerciseIds: [] })}>
        <Plus className="text-muted-foreground size-5" aria-hidden /> Add injury
      </button>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          {editing && (
            <>
              <DialogHeader>
                <DialogTitle>{editing.id ? editing.label : 'Add injury'}</DialogTitle>
                <DialogDescription>Exercise selection works around this from your next plan update.</DialogDescription>
              </DialogHeader>
              <Field label="Area">
                <Select value={editing.muscleId} onValueChange={(v) => setEditing({ ...editing, muscleId: v as MuscleId })}>
                  <SelectTrigger className="h-11! w-full" aria-label="Area">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {ALL_MUSCLES.map((m) => (
                      <SelectItem key={m} value={m}>
                        {MUSCLE_SHORT[m]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Name">
                <Input placeholder="For example, left hamstring strain" value={editing.label} onChange={(e) => setEditing({ ...editing, label: e.target.value })} className="h-11" aria-label="Injury name" />
              </Field>
              <Field label="Severity">
                <Segmented label="Severity" value={editing.severity} onChange={(v) => setEditing({ ...editing, severity: v })} options={[{ value: 'niggle', label: 'Niggle' }, { value: 'pain', label: 'Pain' }, { value: 'injury', label: 'Injury' }]} />
              </Field>
              <Field label="Status">
                <Segmented label="Status" value={editing.status} onChange={(v) => setEditing({ ...editing, status: v })} options={[{ value: 'active', label: 'Active' }, { value: 'rehab', label: 'Rehab' }, { value: 'resolved', label: 'Resolved' }]} />
              </Field>
              <Field label="Rehab note">
                <Textarea placeholder="Your own note, such as a physio protocol" value={editing.note ?? ''} onChange={(e) => setEditing({ ...editing, note: e.target.value })} aria-label="Rehab note" />
              </Field>
              <Field label="Exercises to avoid">
                <Input placeholder="Search exercises" value={q} onChange={(e) => setQ(e.target.value)} className="h-11" aria-label="Search exercises to avoid" />
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {exercises
                    .filter((e) => editing.avoidExerciseIds.includes(e.id) || (q && e.name.toLowerCase().includes(q.toLowerCase())))
                    .slice(0, 30)
                    .map((e) => (
                      <Chip
                        key={e.id}
                        className="px-3"
                        active={editing.avoidExerciseIds.includes(e.id)}
                        onClick={() => setEditing({ ...editing, avoidExerciseIds: editing.avoidExerciseIds.includes(e.id) ? editing.avoidExerciseIds.filter((x) => x !== e.id) : [...editing.avoidExerciseIds, e.id] })}
                      >
                        {e.name}
                      </Chip>
                    ))}
                </div>
              </Field>
              {editing.severity !== 'niggle' && (
                <p className="text-warn text-sm">Persistent or reproducible pain? See a physio or sports doctor. Radiating pain, bruising, dizziness or nausea: stop and get checked.</p>
              )}
              <Button
                size="lg"
                disabled={pending || editing.label.trim().length < 2}
                onClick={() =>
                  start(async () => {
                    const r = await saveInjury({ ...editing, note: editing.note || null });
                    if (!r.ok) toast.error(r.error);
                    else {
                      toast.success('Saved. Exercise selection updated');
                      setEditing(null);
                      router.refresh();
                    }
                  })
                }
              >
                Save
              </Button>
              {editing.id && (
                <Button
                  variant="destructive"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await deleteInjury(editing.id!);
                      if (!r.ok) {
                        toast.error(r.error);
                        return;
                      }
                      setEditing(null);
                      router.refresh();
                    })
                  }
                >
                  <Trash2 /> Delete injury
                </Button>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </Group>
  );
}

function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [pending, start] = useTransition();
  return (
    <>
      <button type="button" className={cn(ROW_BUTTON, 'text-danger')} onClick={() => setOpen(true)}>
        <Trash2 className="size-5" aria-hidden /> Delete account
      </button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setText('');
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>This permanently deletes your account and all your data. It can’t be undone. Type DELETE to confirm.</DialogDescription>
          </DialogHeader>
          <Input value={text} onChange={(e) => setText(e.target.value)} className="h-11" aria-label="Type DELETE to confirm" autoComplete="off" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={text !== 'DELETE' || pending}
              onClick={() =>
                start(async () => {
                  const r = await deleteAccount(text);
                  if (r && !r.ok) toast.error(r.error);
                })
              }
            >
              Delete forever
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
