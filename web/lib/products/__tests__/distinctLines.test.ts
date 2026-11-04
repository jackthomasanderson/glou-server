import { beforeAll, describe, expect, it } from 'vitest';
import { distinctLineLabels } from '../distinctLines';
import type { LineContext } from '../lines';
import { unit } from './factories';
import { frenchT } from './i18n';

// Recette #471 (lot RB, point 4): two lines of « Quelles bouteilles ? » that
// read the same are told apart — only those, and by what really differs.

let ctx: LineContext;
beforeAll(async () => {
  ctx = {
    kind: 'bottle',
    t: await frenchT(),
    cellarName: (id) => ({ garage: 'Garage' } as Record<string, string>)[id],
    formatPrice: (value) => `${value} €`,
    formatMonth: (day) => day.slice(0, 7),
    formatDate: (iso) => iso.slice(0, 10),
  };
});

describe('distinctLineLabels', () => {
  it('leaves lines that already differ as they are', () => {
    const labels = distinctLineLabels([
      unit({ id: 'a', cellarId: 'garage', purchasePrice: 20 }),
      unit({ id: 'b', cellarId: 'garage', purchasePrice: 30 }),
    ], ctx);
    expect(labels.get('a')).toBe('×1 · Garage · 20 € / bouteille');
    expect(labels.get('b')).not.toMatch(/achat|ajout|ligne/);
  });

  it('adds the purchase day when it tells them apart, never shifted by the time zone', () => {
    const labels = distinctLineLabels([
      unit({ id: 'a', cellarId: 'garage', purchasedAt: '2026-11-03', createdAt: '2026-11-04T08:00:00.000Z' }),
      unit({ id: 'b', cellarId: 'garage', purchasedAt: '2026-11-04', createdAt: '2026-11-04T08:00:00.000Z' }),
      unit({ id: 'c', cellarId: 'garage', purchasePrice: 9 }),
    ], { ...ctx, formatMonth: () => 'nov. 2026' });
    expect(labels.get('a')).toBe('×1 · Garage · nov. 2026 · achat du 2026-11-03');
    expect(labels.get('b')).toBe('×1 · Garage · nov. 2026 · achat du 2026-11-04');
    expect(labels.get('c')).not.toMatch(/achat/);
  });

  it('else the day each line was added, else its rank', () => {
    const added = distinctLineLabels([
      unit({ id: 'a', cellarId: 'garage', createdAt: '2026-11-03T10:00:00.000Z' }),
      unit({ id: 'b', cellarId: 'garage', createdAt: '2026-11-04T10:00:00.000Z' }),
    ], ctx);
    expect([added.get('a'), added.get('b')]).toEqual(['×1 · Garage · ajout du 2026-11-03', '×1 · Garage · ajout du 2026-11-04']);

    const same = distinctLineLabels([
      unit({ id: 'a', cellarId: 'garage', createdAt: '2026-11-04T10:00:00.000Z' }),
      unit({ id: 'b', cellarId: 'garage', createdAt: '2026-11-04T11:00:00.000Z' }),
    ], ctx);
    expect([same.get('a'), same.get('b')]).toEqual(['×1 · Garage · ligne 1', '×1 · Garage · ligne 2']);
  });
});
