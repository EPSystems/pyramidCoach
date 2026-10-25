import type { Category } from '@/lib/engine/types';

export const CATEGORY_LABEL: Record<Category, string> = {
  lower_free_compound: 'Lower · free weight',
  lower_machine_compound: 'Lower · machine/unilateral',
  upper_free_press: 'Upper · free press',
  upper_machine_press: 'Upper · machine press',
  pulling_compound: 'Pulling',
  isolation: 'Isolation',
};
