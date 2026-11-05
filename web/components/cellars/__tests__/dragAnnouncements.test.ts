import { beforeAll, describe, expect, it, vi } from 'vitest';
import { frenchT } from '@/lib/products/__tests__/i18n';

vi.mock('@/hooks/useCellars', () => ({
  useAssignSlot: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRemoveSlot: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/lib/api', () => ({ client: { patch: vi.fn(), post: vi.fn() } }));
vi.mock('@/lib/toast', () => ({ notifyError: vi.fn(), notifySuccess: vi.fn() }));

import { dragAnnouncements } from '../CellarGridPlan';

let t: Awaited<ReturnType<typeof frenchT>>;
beforeAll(async () => { t = await frenchT(); });

// Review of #828: « Robusto déposée » — French agrees with the thing moved.
const moved = (category: string, name: string) => ({ data: { current: { item: { name, category }, fromCol: 1, fromRow: 2 } } });
const slot = { data: { current: { col: 3, row: 4 } } };

describe('dragAnnouncements', () => {
  it('a bottle is « saisie » and « déposée », a cigar « saisi » and « déposé »', () => {
    const say = dragAnnouncements(t);
    type Event = Parameters<NonNullable<typeof say.onDragEnd>>[0];
    const bottle = moved('wine', 'Cuvée X') as unknown as Event['active'];
    const cigar = moved('cigar', 'Robusto') as unknown as Event['active'];
    const over = slot as unknown as Event['over'];
    expect(say.onDragStart({ active: bottle } as Event)).toBe('Cuvée X saisie depuis la colonne 1, rangée 2.');
    expect(say.onDragStart({ active: cigar } as Event)).toBe('Robusto saisi depuis la colonne 1, rangée 2.');
    expect(say.onDragEnd({ active: bottle, over } as Event)).toBe('Cuvée X déposée en colonne 3, rangée 4.');
    expect(say.onDragEnd({ active: cigar, over } as Event)).toBe('Robusto déposé en colonne 3, rangée 4.');
  });
});

// FEAT-93: a cell is dropped on another cell — empty, held by another copy (a
// swap of the two cells), or its own (nothing moves).
describe('dragAnnouncements onto a held cell (FEAT-93)', () => {
  const say = () => dragAnnouncements(t);
  type Event = Parameters<NonNullable<ReturnType<typeof dragAnnouncements>['onDragEnd']>>[0];
  const cell = (slotId: string, name: string, category = 'wine') => ({ name, category, slotId });
  const active = { data: { current: { item: cell('a', 'Cuvée X'), fromCol: 1, fromRow: 2 } } } as unknown as Event['active'];
  const cigar = { data: { current: { item: cell('c', 'Robusto', 'cigar'), fromCol: 1, fromRow: 2 } } } as unknown as Event['active'];
  const held = { data: { current: { col: 3, row: 4, item: cell('b', 'Cuvée Y') } } } as unknown as Event['over'];
  const own = { data: { current: { col: 1, row: 2, item: cell('a', 'Cuvée X') } } } as unknown as Event['over'];

  it('over a held cell, it says who holds it', () => {
    expect(say().onDragOver?.({ active, over: held } as Event)).toBe('Cuvée X est au-dessus de la colonne 3, rangée 4, occupée par Cuvée Y.');
  });

  it('dropped on a held cell, the two swap', () => {
    expect(say().onDragEnd({ active, over: held } as Event)).toMatch(/^Cuvée X échangée avec Cuvée Y\s: colonne 3, rangée 4\.$/);
    expect(say().onDragEnd({ active: cigar, over: held } as Event)).toMatch(/^Robusto échangé avec Cuvée Y\s: colonne 3, rangée 4\.$/);
  });

  it('dropped back on its own cell, nothing moved', () => {
    expect(say().onDragEnd({ active, over: own } as Event)).toBe('Déplacement annulé. Cuvée X reste en place.');
  });
});
