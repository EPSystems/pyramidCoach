'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ChevronRight, Search, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  const [showFilters, setShowFilters] = useState(false);
  const active = [muscle, pattern, category, equipment].filter((v) => v !== 'all').length;
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
  const clear = () => {
    setQ('');
    setMuscle('all');
    setPattern('all');
    setCategory('all');
    setEquipment('all');
  };
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="text-muted-foreground absolute top-3.5 left-3 size-4" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search names, cues, muscles" className="h-11 pl-9" aria-label="Search exercises" />
        </div>
        <CustomExerciseDialog options={options} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm" role="status">
          {list.length} {list.length === 1 ? 'exercise' : 'exercises'}
        </p>
        <Button variant="ghost" aria-expanded={showFilters} onClick={() => setShowFilters(!showFilters)}>
          <SlidersHorizontal /> Filter{active > 0 && ` (${active})`}
        </Button>
      </div>
      {showFilters && (
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <FilterSelect label="Muscle" value={muscle} onChange={setMuscle} options={ALL_MUSCLES.map((m) => ({ value: m, label: MUSCLE_SHORT[m] }))} />
          <FilterSelect label="Pattern" value={pattern} onChange={setPattern} options={PATTERN_SEEDS.map((p) => ({ value: p.id, label: p.name }))} />
          <FilterSelect label="Category" all="All categories" value={category} onChange={setCategory} options={Object.entries(CATEGORY_LABEL).map(([value, label]) => ({ value, label }))} />
          <FilterSelect label="Equipment" all="All equipment" value={equipment} onChange={setEquipment} options={EQ.map((e) => ({ value: e, label: e[0].toUpperCase() + e.slice(1) }))} />
        </div>
      )}
      {list.length === 0 ? (
        <div className="bg-card rounded-2xl border p-8 text-center">
          <p className="font-semibold">No exercises match</p>
          <Button variant="outline" className="mt-3" onClick={clear}>
            Clear search and filters
          </Button>
        </div>
      ) : (
        <ul className="bg-card divide-y overflow-hidden rounded-2xl border lg:grid lg:grid-cols-2 lg:divide-y-0">
          {list.map((e) => (
            <li key={e.id} className="lg:border-b">
              <Link href={`/library/${e.slug}`} className="hover:bg-muted/50 flex min-h-16 items-center gap-3 px-4 py-2.5 transition-colors">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {e.name}
                    {e.custom && <span className="text-muted-foreground ml-2 text-sm font-normal">Custom</span>}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {[...e.primary, ...e.secondary].slice(0, 3).map((m) => MUSCLE_SHORT[m]).join(', ')} · {CATEGORY_LABEL[e.category]}
                  </p>
                </div>
                <ChevronRight className="text-muted-foreground size-5 shrink-0" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterSelect({ label, all, value, onChange, options }: { label: string; all?: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-11! w-full" aria-label={label}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        <SelectItem value="all">{all ?? `All ${label.toLowerCase()}s`}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
