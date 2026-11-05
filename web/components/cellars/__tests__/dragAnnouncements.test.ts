import { beforeAll, describe, expect, it, vi } from 'vitest';
import { frenchT } from '@/lib/products/__tests__/i18n';

vi.mock('@/hooks/useCellars', () => ({ useAssignSlot: () => ({ mutateAsync: vi.fn(), isPending: false }) }));
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
