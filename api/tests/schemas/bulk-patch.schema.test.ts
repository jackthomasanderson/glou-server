import { describe, it, expect } from 'vitest';
import { bulkUpdateSchema } from '../../src/schemas/inventory.schema';
import { bulkPresetCreateSchema } from '../../src/schemas/bulk-preset.schema';

// #471 (FEAT-111, D18, QP6): a state is never written in bulk — on a group it
// would open one bottle of each, silently. "Marquer comme bus" is the only
// bulk write of a state; a bulk edit and a saved preset refuse one.

const ID = '11111111-1111-4111-8111-111111111111';

describe('bulk edit and presets: no state (D18)', () => {
  it.each([
    ['opened', { isOpened: true }],
    ['a level', { fillLevel: 100 }],
    ['an opening date', { openedAt: '2026-10-01' }],
    ['cigars left', { cigarsLeft: 3 }],
    ['a cigar smoked', { smokeOne: true }],
    ['what to do with tastings', { keepTastings: true }],
  ])('refuses %s, in a bulk edit and in a preset', (_what, patch) => {
    expect(bulkUpdateSchema.safeParse({ ids: [ID], patch }).success).toBe(false);
    const preset = bulkPresetCreateSchema.safeParse({ name: 'Ouvert', payload: patch });
    expect(preset.success).toBe(false);
    expect(preset.error?.issues.map((issue) => issue.message)).toContain('STATE_NOT_IN_BULK');
  });

  it('keeps the cellar, the tags and the other fields', () => {
    expect(bulkUpdateSchema.parse({ ids: [ID], patch: { cellarId: 'c1', tags: ['fête'] } }).patch).toMatchObject({ cellarId: 'c1', tags: ['fête'] });
    expect(bulkPresetCreateSchema.parse({ name: 'Cuisine', payload: { cellarId: 'c1' } }).payload).toMatchObject({ cellarId: 'c1' });
  });
});
