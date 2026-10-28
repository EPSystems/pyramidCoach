'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ALL_MUSCLES, type Category, type Equipment, type MuscleId, type Pattern } from '@/lib/engine/types';
import { MUSCLE_SHORT, PATTERN_SEEDS } from '@/lib/knowledge/muscles';
import { CATEGORY_LABEL } from '@/lib/knowledge/labels';
import { CustomExerciseDialog } from './exercise-form';

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
  /** Lower-cased name, cues and muscle names: what the search box matches. */
  search: string;
}

const EQ: Equipment[] = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'band', 'sled'];

export function LibraryBrowser({ exercises }: { exercises: LibItem[] }) {
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState<string>('all');
  const [pattern, setPattern] = useState<string>('all');
  const [category, setCategory] = useState<string>('all');
  const [equipment, setEquipment] = useState<string>('all');
  const list = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return exercises.filter(
        (e) =>
          words.every((w) => e.search.includes(w)) &&
          (muscle === 'all' || e.primary.includes(muscle as MuscleId) || e.secondary.includes(muscle as MuscleId)) &&
          (pattern === 'all' || e.pattern === pattern) &&
          (category === 'all' || e.category === category) &&
          (equipment === 'all' || e.equipment.includes(equipment as Equipment)),
      );
  }, [exercises, q, muscle, pattern, category, equipment]);
  const options = useMemo(() => exercises.map((e) => ({ slug: e.slug, name: e.name })), [exercises]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="text-muted-foreground absolute top-3.5 left-3 size-4" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search names, cues, muscles" className="h-11 pl-9" aria-label="Search exercises" />
        </div>
        <FilterSelect label="Muscle" value={muscle} onChange={setMuscle} options={ALL_MUSCLES.map((m) => ({ value: m, label: MUSCLE_SHORT[m] }))} />
        <FilterSelect label="Pattern" value={pattern} onChange={setPattern} options={PATTERN_SEEDS.map((p) => ({ value: p.id, label: p.name }))} />
        <FilterSelect label="Category" value={category} onChange={setCategory} options={Object.entries(CATEGORY_LABEL).map(([value, label]) => ({ value, label }))} />
        <FilterSelect label="Equipment" value={equipment} onChange={setEquipment} options={EQ.map((e) => ({ value: e, label: e[0].toUpperCase() + e.slice(1) }))} />
        <CustomExerciseDialog options={options} />
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
