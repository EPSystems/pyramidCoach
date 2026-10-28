'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Download, LogOut, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { deleteAccount, deleteInjury, deleteSport, regenerateNow, saveInjury, saveSport, toggleSport, updateProfile, updateTraining } from '@/lib/actions/settings';
import { signOut } from '@/lib/actions/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Chip, Segmented, Why } from '@/components/app/bits';
import { useTheme, type ThemePref } from '@/components/providers';
import { ALL_MUSCLES, TRACKED_MUSCLES, type Equipment, type MainLift, type MuscleId, type SportIntensity, type TrackedMuscle } from '@/lib/engine/types';
import { MUSCLE_SHORT } from '@/lib/knowledge/muscles';
import { cn } from '@/lib/utils';

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

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const EQ: Equipment[] = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'band', 'sled'];

function Section({ title, children, why }: { title: string; children: React.ReactNode; why?: string[] }) {
  return (
    <section className="bg-card space-y-4 rounded-2xl border p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-display text-2xl font-bold uppercase">{title}</h2>
        {why && <Why ruleIds={why} />}
      </div>
      {children}
    </section>
  );
}
function Row({ label, children, hint }: { label: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">{label}</p>
      {children}
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  );
}
function DayPicker({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  return (
    <div className="grid grid-cols-7 gap-1">
      {DAYS.map((d, i) => (
        <button
          key={i}
          type="button"
          aria-pressed={value.includes(i + 1)}
          aria-label={DAY_NAMES[i]}
          onClick={() => onChange(value.includes(i + 1) ? value.filter((x) => x !== i + 1) : [...value, i + 1])}
          className={cn('h-11 rounded-lg text-sm font-semibold', value.includes(i + 1) ? 'bg-volt text-volt-ink' : 'bg-muted text-muted-foreground')}
        >
          {d}
        </button>
      ))}
    </div>
  );
}

export function SettingsForms({ training, profile, userSports, catalog, injuries, exercises }: { training: Training; profile: Profile; userSports: US[]; catalog: { id: string; name: string; defaultMinutes: number }[]; injuries: Inj[]; exercises: { id: string; name: string }[] }) {
  const [t, setT] = useState(training);
  const [p, setP] = useState(profile);
  const [pending, start] = useTransition();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const dirtyT = JSON.stringify(t) !== JSON.stringify(training);
  const dirtyP = JSON.stringify(p) !== JSON.stringify(profile);
  const tz = typeof Intl !== 'undefined' ? Intl.supportedValuesOf?.('timeZone') ?? [p.timezone] : [p.timezone];

  return (
    <div className="rise space-y-4 pb-10">
      <Section title="Training" why={['T-SCH-01', 'T-PRI-01', 'T-STA-01']}>
        <Row label="Goal">
          <Select value={t.goal} onValueChange={(v) => setT({ ...t, goal: v as Goal })}>
            <SelectTrigger className="h-11! w-full" aria-label="Goal">
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
        <Row label="Days you could lift">
          <DayPicker value={t.availableDays} onChange={(v) => setT({ ...t, availableDays: v })} />
        </Row>
        <Row label="Session length">
          <Segmented label="Session minutes" value={t.sessionMinutes} onChange={(v) => setT({ ...t, sessionMinutes: v })} options={[30, 45, 60, 75, 90, 120].map((m) => ({ value: m as 30, label: m }))} />
        </Row>
        <Row label="Max lifting days">
          <Segmented label="Max lift days" value={t.maxLiftDays ?? 0} onChange={(v) => setT({ ...t, maxLiftDays: v === 0 ? null : v })} options={[{ value: 0, label: 'Any' }, ...[2, 3, 4, 5, 6].map((n) => ({ value: n, label: n }))]} />
        </Row>
        <Row label="Split style" hint="Alternative: Upper/Lower → Pyramid alternating (4 days), Full Push / Full Pull for 3, 5 and 6 days.">
          <Segmented label="Split style" value={t.splitStyle} onChange={(v) => setT({ ...t, splitStyle: v })} options={[{ value: 'default', label: 'Default' }, { value: 'alternative', label: 'Alternative' }]} />
        </Row>
        <Row label="Usual lifting time" hint={<>Sport sessions are placed after lifting or a few hours apart when possible. <Why ruleIds={['T-SCH-03']} /></>}>
          <Segmented
            label="Lifting time"
            value={t.liftingTime ?? 'any'}
            onChange={(v) => setT({ ...t, liftingTime: v === 'any' ? null : v })}
            options={[{ value: 'any', label: 'Varies' }, { value: 'morning', label: 'Morning' }, { value: 'midday', label: 'Midday' }, { value: 'evening', label: 'Evening' }]}
          />
        </Row>
        <Row label="Rep-range variation" hint={<>How heavier and lighter rep ranges rotate. <Why ruleIds={['T-INT-04']} /></>}>
          <Segmented label="Rep variation" value={t.repVariation} onChange={(v) => setT({ ...t, repVariation: v })} options={[{ value: 'within_session', label: 'In session' }, { value: 'between_session', label: 'A/B days' }, { value: 'alternating_week', label: 'A/B weeks' }]} />
        </Row>
        <Row label="Equipment">
          <div className="flex flex-wrap gap-1.5">
            {EQ.map((e) => (
              <Chip key={e} className="h-9 px-3 capitalize" active={t.equipment.includes(e)} onClick={() => setT({ ...t, equipment: t.equipment.includes(e) ? t.equipment.filter((x) => x !== e) : [...t.equipment, e] })}>
                {e}
              </Chip>
            ))}
          </div>
        </Row>
        <Row label="Smallest weight jumps (kg)">
          <div className="grid grid-cols-4 gap-2">
            {(['barbell', 'dumbbell', 'machine', 'cable'] as const).map((k) => (
              <label key={k} className="text-muted-foreground space-y-1 text-xs capitalize">
                {k}
                <Input inputMode="decimal" value={t.increments[k]} onChange={(e) => setT({ ...t, increments: { ...t.increments, [k]: Number(e.target.value) || 0 } })} className="num text-foreground h-11" />
              </label>
            ))}
          </div>
        </Row>
        {t.status === 'advanced' && (
          <Row label="Specialisation (up to 2 muscles)" hint={<>Raised ~50% for 8–12 weeks while the rest drop. <Why ruleIds={['T-VOL-08']} /></>}>
            <div className="flex flex-wrap gap-1.5">
              {TRACKED_MUSCLES.map((m) => (
                <Chip
                  key={m}
                  className="h-9 px-3"
                  active={t.specialization.includes(m)}
                  onClick={() => setT({ ...t, specialization: t.specialization.includes(m) ? t.specialization.filter((x) => x !== m) : [...t.specialization, m].slice(-2) })}
                >
                  {MUSCLE_SHORT[m]}
                </Chip>
              ))}
            </div>
          </Row>
        )}
        {t.goal === 'strength' && (
          <>
            <Row label="Main lifts">
              <div className="flex flex-wrap gap-1.5">
                {(['squat', 'bench', 'deadlift', 'ohp'] as MainLift[]).map((l) => (
                  <Chip key={l} className="h-9 px-3 capitalize" active={t.strengthLifts.includes(l)} onClick={() => setT({ ...t, strengthLifts: t.strengthLifts.includes(l) ? t.strengthLifts.filter((x) => x !== l) : [...t.strengthLifts, l] })}>
                    {l === 'ohp' ? 'OHP' : l}
                  </Chip>
                ))}
              </div>
            </Row>
            <Row label="Test / meet date (optional)" hint={<>Enables a Peak phase before the date. <Why ruleIds={['T-STR-04']} /></>}>
              <Input type="date" value={t.testDate ?? ''} onChange={(e) => setT({ ...t, testDate: e.target.value || null })} className="h-11 w-48" />
            </Row>
          </>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={!dirtyT || pending}
            onClick={() =>
              start(async () => {
                const r = await updateTraining(t);
                if (!r.ok) toast.error(r.error);
                else {
                  toast.success('Saved. Future sessions regenerated');
                  router.refresh();
                }
              })
            }
          >
            Save & regenerate
          </Button>
          <Button
            variant="outline"
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
            <RefreshCw /> Regenerate plan
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">Changes replace future planned sessions from today; your moves, skips and one-off swaps are kept, and your logged history is never touched.</p>
      </Section>

      <SportsEditor userSports={userSports} catalog={catalog} />
      <InjuriesEditor injuries={injuries} exercises={exercises} />

      <Section title="Profile & display">
        <div className="grid gap-3 sm:grid-cols-2">
          <Row label="Name">
            <Input value={p.displayName} onChange={(e) => setP({ ...p, displayName: e.target.value })} className="h-11" />
          </Row>
          <Row label="Sex" hint={p.sex ? undefined : <span className="text-danger">Choose Male or Female to save your profile.</span>}>
            <Segmented label="Sex" value={p.sex} onChange={(v) => setP({ ...p, sex: v })} options={[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }]} />
          </Row>
          <Row label="Height (cm)">
            <Input inputMode="decimal" value={p.heightCm ?? ''} onChange={(e) => setP({ ...p, heightCm: e.target.value ? Number(e.target.value) : null })} className="num h-11" />
          </Row>
          <Row label="Body fat % (optional)">
            <Input inputMode="decimal" value={p.bodyFatPct ?? ''} onChange={(e) => setP({ ...p, bodyFatPct: e.target.value ? Number(e.target.value) : null })} className="num h-11" />
          </Row>
          <Row label="Units">
            <Segmented label="Units" value={p.units} onChange={(v) => setP({ ...p, units: v })} options={[{ value: 'kg', label: 'kg' }, { value: 'lb', label: 'lb' }]} />
          </Row>
          <Row label="Timezone">
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
          <Row label="Lifestyle (outside lifting & sport)" hint={<>Changes your activity factor. <Why ruleIds={['N-MNT-02', 'N-MNT-04']} /></>}>
            <Select value={p.lifestyle} onValueChange={(v) => setP({ ...p, lifestyle: v as Profile['lifestyle'] })}>
              <SelectTrigger className="h-11! w-full" aria-label="Lifestyle">
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
          <Row label="Theme">
            <Segmented label="Theme" value={theme} onChange={(v: ThemePref) => setTheme(v)} options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }, { value: 'system', label: 'System' }]} />
          </Row>
        </div>
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>
            Hide bodyweight numbers <span className="text-muted-foreground">(show only the trend direction)</span>
          </span>
          <Switch checked={p.hideBodyweight} onCheckedChange={(v) => setP({ ...p, hideBodyweight: v })} />
        </label>
        <Button
          disabled={!dirtyP || pending}
          onClick={() => {
            const sex = p.sex;
            if (!sex) {
              toast.error('Choose Male or Female for Sex.');
              return;
            }
            start(async () => {
              const r = await updateProfile({ ...p, sex });
              if (!r.ok) toast.error(r.error);
              else {
                toast.success('Profile saved');
                router.refresh();
              }
            });
          }}
        >
          Save profile
        </Button>
      </Section>

      <Section title="Your data">
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <a href="/api/export?format=json">
              <Download /> Export everything (JSON)
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href="/api/export?format=csv">
              <Download /> Logged sets (CSV)
            </a>
          </Button>
          <form action={signOut}>
            <Button variant="outline" type="submit">
              <LogOut /> Sign out
            </Button>
          </form>
        </div>
        <DeleteAccount />
        <p className="text-muted-foreground text-xs">
          This app gives general training and nutrition guidance. It is not a substitute for a doctor or physiotherapist. Your data is visible only to you; not even the app owner can see your training or health data.
        </p>
      </Section>
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
    <Section title="Sports" why={['S-01', 'S-02', 'S-03', 'N-SPT-03']}>
      <ul className="space-y-2">
        {userSports.map((s) => (
          <li key={s.id} className="bg-muted/50 flex items-center gap-3 rounded-xl p-3">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{s.name}</p>
              <p className="text-muted-foreground text-xs">
                {s.weekdays.map((d) => DAY_NAMES[d - 1]).join(', ')} · {s.intensity} · {s.minutes} min
              </p>
            </div>
            <Switch
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
            <Button size="sm" variant="ghost" onClick={() => setEditing(s)}>
              Edit
            </Button>
          </li>
        ))}
        {!userSports.length && <p className="text-muted-foreground text-sm">No sports. Add one to schedule lifting around it.</p>}
      </ul>
      {!editing && (
        <Button variant="outline" onClick={() => setEditing({ sportId: catalog[0]?.id ?? 'football', name: catalog[0]?.name ?? '', weekdays: [], intensity: 'moderate', minutes: catalog[0]?.defaultMinutes ?? 60, timeOfDay: null, active: true })}>
          <Plus /> Add sport
        </Button>
      )}
      {editing && (
        <div className="space-y-3 rounded-xl border p-4">
          {!editing.id && (
            <Select value={editing.sportId} onValueChange={(v) => setEditing({ ...editing, sportId: v, minutes: catalog.find((c) => c.id === v)?.defaultMinutes ?? 60 })}>
              <SelectTrigger className="h-11! w-full" aria-label="Sport">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {catalog.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <DayPicker value={editing.weekdays} onChange={(v) => setEditing({ ...editing, weekdays: v })} />
          <Segmented label="Intensity" value={editing.intensity} onChange={(v) => setEditing({ ...editing, intensity: v })} options={[{ value: 'light', label: 'Light' }, { value: 'moderate', label: 'Moderate' }, { value: 'hard', label: 'Hard' }, { value: 'match', label: 'Match' }]} />
          <div className="grid grid-cols-2 gap-2">
            <Input inputMode="numeric" value={editing.minutes} onChange={(e) => setEditing({ ...editing, minutes: Number(e.target.value) || 0 })} className="num h-11" aria-label="Minutes" />
            <Segmented label="Time of day" value={editing.timeOfDay} onChange={(v) => setEditing({ ...editing, timeOfDay: v })} options={[{ value: 'morning', label: 'AM' }, { value: 'midday', label: 'Mid' }, { value: 'evening', label: 'PM' }]} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
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
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
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
                <Trash2 /> Remove
              </Button>
            )}
          </div>
        </div>
      )}
    </Section>
  );
}

function InjuriesEditor({ injuries, exercises }: { injuries: Inj[]; exercises: { id: string; name: string }[] }) {
  const [editing, setEditing] = useState<Inj | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const [q, setQ] = useState('');
  return (
    <Section title="Injuries & niggles" why={['T-SEL-08']}>
      <ul className="space-y-2">
        {injuries.map((i) => (
          <li key={i.id} className={cn('flex items-center gap-3 rounded-xl p-3', i.status === 'resolved' ? 'bg-muted/40 opacity-60' : 'bg-danger/10')}>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{i.label}</p>
              <p className="text-muted-foreground text-xs">
                {MUSCLE_SHORT[i.muscleId]} · {i.severity} · {i.status}
                {i.avoidExerciseIds.length > 0 && ` · avoiding ${i.avoidExerciseIds.length} exercise${i.avoidExerciseIds.length > 1 ? 's' : ''}`}
              </p>
              {i.note && <p className="text-muted-foreground mt-1 text-xs italic">{i.note}</p>}
            </div>
            <Button size="sm" variant="ghost" onClick={() => setEditing(i)}>
              Edit
            </Button>
          </li>
        ))}
      </ul>
      {!editing && (
        <Button variant="outline" onClick={() => setEditing({ muscleId: 'hamstrings', label: '', severity: 'niggle', status: 'active', note: '', avoidExerciseIds: [] })}>
          <Plus /> Add injury
        </Button>
      )}
      {editing && (
        <div className="space-y-3 rounded-xl border p-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <Select value={editing.muscleId} onValueChange={(v) => setEditing({ ...editing, muscleId: v as MuscleId })}>
              <SelectTrigger className="h-11! w-full" aria-label="Area">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALL_MUSCLES.map((m) => (
                  <SelectItem key={m} value={m}>
                    {MUSCLE_SHORT[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input placeholder="Label, e.g. Left hamstring strain" value={editing.label} onChange={(e) => setEditing({ ...editing, label: e.target.value })} className="h-11" />
          </div>
          <Segmented label="Severity" value={editing.severity} onChange={(v) => setEditing({ ...editing, severity: v })} options={[{ value: 'niggle', label: 'Niggle' }, { value: 'pain', label: 'Pain' }, { value: 'injury', label: 'Injury' }]} />
          <Segmented label="Status" value={editing.status} onChange={(v) => setEditing({ ...editing, status: v })} options={[{ value: 'active', label: 'Active' }, { value: 'rehab', label: 'Rehab' }, { value: 'resolved', label: 'Resolved' }]} />
          <Textarea placeholder="Rehab note (your own, e.g. physio protocol)" value={editing.note ?? ''} onChange={(e) => setEditing({ ...editing, note: e.target.value })} />
          <div>
            <p className="mb-1 text-sm font-medium">Avoid these exercises</p>
            <Input placeholder="Search exercises" value={q} onChange={(e) => setQ(e.target.value)} className="mb-2 h-10" />
            <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
              {exercises
                .filter((e) => editing.avoidExerciseIds.includes(e.id) || (q && e.name.toLowerCase().includes(q.toLowerCase())))
                .slice(0, 30)
                .map((e) => (
                  <Chip
                    key={e.id}
                    className="h-9 px-3"
                    active={editing.avoidExerciseIds.includes(e.id)}
                    onClick={() => setEditing({ ...editing, avoidExerciseIds: editing.avoidExerciseIds.includes(e.id) ? editing.avoidExerciseIds.filter((x) => x !== e.id) : [...editing.avoidExerciseIds, e.id] })}
                  >
                    {e.name}
                  </Chip>
                ))}
            </div>
          </div>
          {editing.severity !== 'niggle' && (
            <p className="text-warn text-xs">Persistent or reproducible pain? See a physio or sports doctor. Radiating pain, bruising, dizziness or nausea: stop and get checked.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
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
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
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
                <Trash2 /> Delete
              </Button>
            )}
          </div>
        </div>
      )}
    </Section>
  );
}

function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [pending, start] = useTransition();
  if (!open)
    return (
      <Button variant="destructive" onClick={() => setOpen(true)}>
        <Trash2 /> Delete my account
      </Button>
    );
  return (
    <div className="border-danger/40 space-y-2 rounded-xl border p-3">
      <p className="text-sm">This permanently deletes your account and every row of your data. Type DELETE to confirm.</p>
      <div className="flex gap-2">
        <Input value={text} onChange={(e) => setText(e.target.value)} className="h-11 w-40" aria-label="Type DELETE to confirm" />
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
        <Button variant="outline" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
