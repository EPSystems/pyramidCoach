import { describe, expect, it } from 'vitest';
import { fromDisplay, toDisplay } from '@/lib/utils/units';

// Settings stores weight jumps in kg but shows/accepts them in the user's units (DECISIONS 77).
describe('weight jump conversion', () => {
  it('round-trips common lb plate jumps', () => {
    for (const lb of [1, 2.5, 5, 10]) expect(toDisplay(fromDisplay(lb, 'lb'), 'lb')).toBe(lb);
  });
  it('shows stored kg jumps in lb and leaves kg untouched', () => {
    expect(toDisplay(2.5, 'lb')).toBe(5.5);
    expect(toDisplay(2.5, 'kg')).toBe(2.5);
    expect(fromDisplay(2.5, 'kg')).toBe(2.5);
  });
});
