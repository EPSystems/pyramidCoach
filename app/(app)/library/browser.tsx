'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { createCustomExercise } from '@/lib/actions/library';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Chip } from '@/components/app/bits';
import { ALL_MUSCLES, type Category, type Equipment, type MuscleId, type Pattern } from '@/lib/engine/types';
import { MUSCLE_SHORT, PATTERN_SEEDS } from '@/lib/knowledge/muscles';
import { CATEGORY_LABEL } from '@/lib/knowledge/labels';

export interface LibItem {
  id: string;
  slug: string;
  name: string;
  pattern: Pattern;
  category: Category;
  equipment: Equipment[];
  primary: MuscleId[];
  secondary: MuscleId[];
  long: boolean;
  custom: boolean;
}

const EQ: Equipment[] = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'band', 'sled'];

export function LibraryBrowser({ exercises }: { exercises: LibItem[] }) {
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState<string>('all');
  const [pattern, setPattern] = useState<string>('all');
  const [category, setCategory] = useState<string>('all');
  const [equipment, setEquipment] = useState<string>('all');
  const list = useMemo(
    () =>
      exercises.filter(
        (e) =>
          e.name.toLowerCase().includes(q.toLowerCase()) &&
          (muscle === 'all' || e.primary.includes(muscle as MuscleId) || e.secondary.includes(muscle as MuscleId)) &&
          (pattern === 'all' || e.pattern === pattern) &&
          (category === 'all' || e.category === category) &&
          (equipment === 'all' || e.equipment.includes(equipment as Equipment)),
      ),
    [exercises, q, muscle, pattern, category, equipment],
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="text-muted-foreground absolute top-3.5 left-3 size-4" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search exercises" className="h-11 pl-9" aria-label="Search exercises" />
        </div>
        <FilterSelect label="Muscle" value={muscle} onChange={setMuscle} options={ALL_MUSCLES.map((m) => ({ value: m, label: MUSCLE_SHORT[m] }))} />
        <FilterSelect label="Pattern" value={pattern} onChange={setPattern} options={PATTERN_SEEDS.map((p) => ({ value: p.id, label: p.name }))} />
        <FilterSelect label="Category" value={category} onChange={setCategory} options={Object.entries(CATEGORY_LABEL).map(([value, label]) => ({ value, label }))} />
        <FilterSelect label="Equipment" value={equipment} onChange={setEquipment} options={EQ.map((e) => ({ value: e, label: e[0].toUpperCase() + e.slice(1) }))} />
        <CustomExerciseDialog />
      </div>
      <p className="text-muted-foreground text-sm">{list.length} shown</p>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((e) => (
          <li key={e.id}>
            <Link href={`/library/${e.slug}`} className="bg-card hover:border-foreground/30 block h-full rounded-xl border p-3 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold">{e.name}</p>
                <div className="flex shrink-0 gap-1">
                  {e.long && <span className="stamp bg-accent text-accent-foreground rounded px-1">long</span>}
                  {e.custom && <span className="stamp bg-muted rounded px-1">custom</span>}
                </div>
              </div>
              <p className="text-muted-foreground mt-0.5 text-xs">{CATEGORY_LABEL[e.category]}</p>
              <p className="mt-2 text-xs">
                {e.primary.map((m) => (
                  <span key={m} className="bg-volt/15 mr-1 inline-block rounded px-1.5 py-0.5">
                    {MUSCLE_SHORT[m]}
                  </span>
                ))}
                {e.secondary.map((m) => (
                  <span key={m} className="text-muted-foreground mr-1 inline-block rounded border px-1.5 py-0.5">
                    {MUSCLE_SHORT[m]}
                  </span>
                ))}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-11! w-40" aria-label={label}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All {label.toLowerCase()}s</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function CustomExerciseDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [pattern, setPattern] = useState<Pattern>('isolation');
  const [category, setCategory] = useState<Category>('isolation');
  const [equipment, setEquipment] = useState<Equipment[]>(['machine']);
  const [primary, setPrimary] = useState<MuscleId[]>([]);
  const [secondary, setSecondary] = useState<MuscleId[]>([]);
  const [cues, setCues] = useState('');
  const [pending, start] = useTransition();
  const router = useRouter();
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="h-11">
          <Plus /> Custom
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl uppercase">Custom exercise</DialogTitle>
          <DialogDescription>Visible only to you. Muscles decide how sets are counted (1.0 primary, 0.5 secondary).</DialogDescription>
        </DialogHeader>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="h-11" />
        <div className="grid grid-cols-2 gap-2">
          <Select value={pattern} onValueChange={(v) => setPattern(v as Pattern)}>
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
          <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
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
              <Chip key={e} className="h-9 px-3 capitalize" active={equipment.includes(e)} onClick={() => setEquipment(toggle(equipment, e))}>
                {e}
              </Chip>
            ))}
          </div>
        </div>
        {(['primary', 'secondary'] as const).map((role) => (
          <div key={role}>
            <p className="mb-1 text-sm font-medium capitalize">{role} muscles</p>
            <div className="flex flex-wrap gap-1.5">
              {ALL_MUSCLES.map((m) => (
                <Chip
                  key={m}
                  className="h-9 px-3"
                  active={(role === 'primary' ? primary : secondary).includes(m)}
                  onClick={() => (role === 'primary' ? setPrimary(toggle(primary, m)) : setSecondary(toggle(secondary, m)))}
                >
                  {MUSCLE_SHORT[m]}
                </Chip>
              ))}
            </div>
          </div>
        ))}
        <Textarea value={cues} onChange={(e) => setCues(e.target.value)} placeholder="Cues, one per line (optional)" />
        <DialogFooter>
          <Button
            disabled={pending || name.trim().length < 2 || !primary.length || !equipment.length}
            onClick={() =>
              start(async () => {
                const r = await createCustomExercise({ name, pattern, category, equipment, primary, secondary, cues });
                if (!r.ok) toast.error(r.error);
                else {
                  toast.success('Exercise added');
                  setOpen(false);
                  router.push(`/library/${r.slug}`);
                }
              })
            }
          >
            Save exercise
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
