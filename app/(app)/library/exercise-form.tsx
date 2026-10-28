'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { createCustomExercise, updateCustomExercise } from '@/lib/actions/library';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Chip } from '@/components/app/bits';
import { ALL_MUSCLES, type Category, type Equipment, type MainLift, type MuscleId, type Pattern } from '@/lib/engine/types';
import { MUSCLE_SHORT, PATTERN_SEEDS } from '@/lib/knowledge/muscles';
import { CATEGORY_LABEL } from '@/lib/knowledge/labels';

const EQ: Equipment[] = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'band', 'sled'];
const MAIN_LABEL: Record<MainLift, string> = { squat: 'Squat', bench: 'Bench press', deadlift: 'Deadlift', ohp: 'Overhead press' };
const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

/** Muscles and flags: shared by custom exercises and the owner's edits of global ones. */
export interface Traits {
  primary: MuscleId[];
  secondary: MuscleId[];
  long: boolean;
  axial: boolean;
  impact: boolean;
  unilateral: boolean;
  /** Text input value in kg; empty = equipment default. */
  increment: string;
}

export interface ExerciseDraft extends Traits {
  name: string;
  pattern: Pattern;
  category: Category;
  equipment: Equipment[];
  main: MainLift | null;
  cues: string;
  mistakes: string;
  substitutions: string[];
}

export const EMPTY_DRAFT: ExerciseDraft = {
  name: '',
  pattern: 'isolation',
  category: 'isolation',
  equipment: ['machine'],
  primary: [],
  secondary: [],
  long: false,
  axial: false,
  impact: false,
  unilateral: false,
  increment: '',
  main: null,
  cues: '',
  mistakes: '',
  substitutions: [],
};

/** "" → null; anything else must be a positive number (kg). */
export function parseIncrement(s: string): number | null | undefined {
  if (!s.trim()) return null;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) && n > 0 && n <= 20 ? n : undefined;
}

const FLAGS: { key: 'long' | 'axial' | 'impact' | 'unilateral'; label: string; title: string }[] = [
  { key: 'long', label: 'Long-length', title: 'Loads the muscle at long length (preferred, T-SEL-03)' },
  { key: 'axial', label: 'Spine-loading', title: 'Loads the spine (avoided near back pain and in sport-first plans)' },
  { key: 'impact', label: 'Impact', title: 'Jumping or landing impact for the legs' },
  { key: 'unilateral', label: 'One side at a time', title: 'Unilateral' },
];

export function TraitFields({ value, onChange, incrementHint }: { value: Traits; onChange: (t: Traits) => void; incrementHint?: string }) {
  return (
    <>
      {(['primary', 'secondary'] as const).map((role) => (
        <div key={role}>
          <p className="mb-1 text-sm font-medium capitalize">{role} muscles</p>
          <div className="flex flex-wrap gap-1.5">
            {ALL_MUSCLES.map((m) => (
              <Chip key={m} className="h-9 px-3" active={value[role].includes(m)} onClick={() => onChange({ ...value, [role]: toggle(value[role], m) })}>
                {MUSCLE_SHORT[m]}
              </Chip>
            ))}
          </div>
        </div>
      ))}
      <div>
        <p className="mb-1 text-sm font-medium">Traits</p>
        <div className="flex flex-wrap gap-1.5">
          {FLAGS.map((f) => (
            <Chip key={f.key} className="h-9 px-3" active={value[f.key]} onClick={() => onChange({ ...value, [f.key]: !value[f.key] })}>
              <span title={f.title}>{f.label}</span>
            </Chip>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor="ex-increment" className="text-sm font-medium">
          Load step (kg)
        </label>
        <Input id="ex-increment" inputMode="decimal" value={value.increment} onChange={(e) => onChange({ ...value, increment: e.target.value })} placeholder="default" className="num h-11 w-24" />
        <span className="text-muted-foreground text-xs">{incrementHint ?? 'Empty = your equipment setting.'}</span>
      </div>
    </>
  );
}

/** Create (no `exerciseId`) or edit a custom exercise. */
export function CustomExerciseDialog({ exerciseId, initial, options }: { exerciseId?: string; initial?: ExerciseDraft; options: { slug: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [d, setD] = useState<ExerciseDraft>(initial ?? EMPTY_DRAFT);
  const [pending, start] = useTransition();
  const router = useRouter();
  const set = (patch: Partial<ExerciseDraft>) => setD((x) => ({ ...x, ...patch }));
  const increment = parseIncrement(d.increment);
  const subOptions = options.filter((o) => !d.substitutions.includes(o.slug));
  const nameOf = (slug: string) => options.find((o) => o.slug === slug)?.name ?? slug;

  const submit = () =>
    start(async () => {
      const payload = { ...d, increment: increment ?? null };
      const r = exerciseId ? await updateCustomExercise(exerciseId, payload) : await createCustomExercise(payload);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(exerciseId ? 'Exercise updated' : 'Exercise added');
      setOpen(false);
      if (exerciseId) router.refresh();
      else router.push(`/library/${r.slug}`);
    });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setD(initial ?? EMPTY_DRAFT);
      }}
    >
      <DialogTrigger asChild>
        {exerciseId ? (
          <Button variant="outline" className="w-full">
            <Pencil /> Edit exercise
          </Button>
        ) : (
          <Button className="h-11">
            <Plus /> Custom
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl uppercase">{exerciseId ? 'Edit exercise' : 'Custom exercise'}</DialogTitle>
          <DialogDescription>Visible only to you. Muscles decide how sets are counted (1.0 primary, 0.5 secondary).</DialogDescription>
        </DialogHeader>
        <Input value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="Name" className="h-11" aria-label="Name" />
        <div className="grid grid-cols-2 gap-2">
          <Select value={d.pattern} onValueChange={(v) => set({ pattern: v as Pattern })}>
            <SelectTrigger className="h-11! w-full" aria-label="Pattern">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PATTERN_SEEDS.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={d.category} onValueChange={(v) => set({ category: v as Category })}>
            <SelectTrigger className="h-11! w-full" aria-label="Category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(CATEGORY_LABEL).map(([v, l]) => (
                <SelectItem key={v} value={v}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <p className="mb-1 text-sm font-medium">Equipment</p>
          <div className="flex flex-wrap gap-1.5">
            {EQ.map((e) => (
              <Chip key={e} className="h-9 px-3 capitalize" active={d.equipment.includes(e)} onClick={() => set({ equipment: toggle(d.equipment, e) })}>
                {e}
              </Chip>
            ))}
          </div>
        </div>
        <TraitFields value={d} onChange={(t) => set(t)} />
        <Select value={d.main ?? 'none'} onValueChange={(v) => set({ main: v === 'none' ? null : (v as MainLift) })}>
          <SelectTrigger className="h-11! w-full" aria-label="Main lift variation">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Not a main-lift variation</SelectItem>
            {Object.entries(MAIN_LABEL).map(([v, l]) => (
              <SelectItem key={v} value={v}>
                Variation of: {l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Textarea value={d.cues} onChange={(e) => set({ cues: e.target.value })} placeholder="Cues, one per line (optional)" aria-label="Cues" />
        <Textarea value={d.mistakes} onChange={(e) => set({ mistakes: e.target.value })} placeholder="Common mistakes, one per line (optional)" aria-label="Common mistakes" rows={2} />
        <div>
          <p className="mb-1 text-sm font-medium">Substitutions</p>
          <div className="flex flex-wrap gap-1.5">
            {d.substitutions.map((slug) => (
              <Chip key={slug} className="h-9 px-3" active onClick={() => set({ substitutions: d.substitutions.filter((x) => x !== slug) })}>
                {nameOf(slug)} <X className="size-3.5" aria-label="Remove" />
              </Chip>
            ))}
          </div>
          {d.substitutions.length < 8 && (
            <Select value="" onValueChange={(v) => set({ substitutions: [...d.substitutions, v] })}>
              <SelectTrigger className="mt-1.5 h-11! w-full" aria-label="Add a substitution">
                <SelectValue placeholder="Add a substitution" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {subOptions.map((o) => (
                  <SelectItem key={o.slug} value={o.slug}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        {increment === undefined && <p className="text-warn text-xs">Load step must be a number between 0 and 20 kg.</p>}
        <DialogFooter>
          <Button disabled={pending || d.name.trim().length < 2 || !d.primary.length || !d.equipment.length || increment === undefined} onClick={submit}>
            {exerciseId ? 'Save changes' : 'Save exercise'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
