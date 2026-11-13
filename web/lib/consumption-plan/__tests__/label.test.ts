import { beforeAll, describe, expect, it } from 'vitest';
import { frenchT } from '@/lib/products/__tests__/i18n';
import { consumeLabel } from '../label';
import type { ConsumptionSuggestion } from '../types';

// #471 (FEAT-105 c3, ux-ui.md §10.4.2): the plan proposes to finish an opened bottle first.

let t: Awaited<ReturnType<typeof frenchT>>;
beforeAll(async () => { t = await frenchT(); });

const suggestion = (over: Partial<ConsumptionSuggestion>): ConsumptionSuggestion => ({
  id: 'b1', productId: 'p1', name: 'Cuvée X', producer: 'Domaine', category: 'wine', vintage: 2020, photoUrl: null,
  cellarId: null, alertStatus: 'peak', isOpened: false, fillLevel: null, reason: 'peak_window', ...over,
} as ConsumptionSuggestion);

describe('consumeLabel', () => {
  it('a wine with an opened bottle at 60 %: "Finir l\'entamée (60 %)"', () => {
    expect(consumeLabel(suggestion({ isOpened: true, fillLevel: 60 }), t)).toBe("Finir l'entamée (60 %)");
  });

  it('an opened box of cigars: "Finir la boîte entamée (10 restants)"', () => {
    expect(consumeLabel(suggestion({ category: 'cigar', isOpened: true, cigarsLeft: 10 }), t)).toBe('Finir la boîte entamée (10 restants)');
  });

  it('a full wine: "Consommer"; an opened one without a level: "Finir l\'entamée"', () => {
    expect(consumeLabel(suggestion({}), t)).toBe('Consommer');
    expect(consumeLabel(suggestion({ isOpened: true, fillLevel: null }), t)).toBe("Finir l'entamée");
  });
});
