import { describe, expect, it } from 'vitest';
import { guestCanTouch, guestFamilies, guestOpenableGroups, toProductItem } from '../guestFamilies';
import type { GuestItem } from '../types';

// #471 (FEAT-109, ux-ui.md §10.9): the showcase by wine, and what a guest may take a copy from.

const T = '2026-10-02T00:00:00.000Z';
const copy = (over: Partial<GuestItem> & { id: string }): GuestItem => ({
  productId: 'p1', name: 'Talbot', producer: 'Château Talbot', category: 'wine', vintage: 2018,
  quantity: 1, isOpened: false, fillLevel: null, cellarId: 'garage', createdAt: T, updatedAt: T, ...over,
});

describe('guestFamilies', () => {
  it('shows one card per wine, its copies under it', () => {
    const families = guestFamilies([
      copy({ id: 'g', quantity: 6 }),
      copy({ id: 'other', productId: 'p2', name: 'Lynch' }),
      copy({ id: 'sub', isOpened: true, fillLevel: 60 }),
    ]);
    expect(families.map((family) => [family.productId, family.items.map((item) => item.id)])).toEqual([
      ['p1', ['g', 'sub']],
      ['p2', ['other']],
    ]);
    expect(families[0]).toMatchObject({ name: 'Talbot', vintage: 2018, kind: 'bottle' });
  });

  it('values the copies in stock (estimated value, else purchase price), none when the share hides prices', () => {
    const [priced] = guestFamilies([copy({ id: 'g', quantity: 6, purchasePrice: 20 }), copy({ id: 's', isOpened: true, fillLevel: 50, estimatedValue: 30 })]);
    expect(priced.value).toBe(6 * 20 + 30);
    const [hidden] = guestFamilies([copy({ id: 'g', quantity: 6 })]);
    expect(hidden.value).toBeNull();
  });

  it('reads the purchase day as a day, never a local Date (D6)', () => {
    expect(toProductItem(copy({ id: 'g', purchasedAt: '2026-01-15T00:00:00.000Z' })).purchasedAt).toBe('2026-01-15');
  });
});

describe('what a guest may take a copy from (FEAT-109)', () => {
  const WRITE = ['garage'];
  const [family] = guestFamilies([
    copy({ id: 'garage6', quantity: 6 }),
    copy({ id: 'kitchen2', quantity: 2, cellarId: 'kitchen' }),
    copy({ id: 'opened', isOpened: true, fillLevel: 60 }),
    copy({ id: 'openedRead', isOpened: true, fillLevel: 40, cellarId: 'kitchen' }),
  ]);

  it('offers only the full lines of the cellars shared with write access', () => {
    expect(guestOpenableGroups(family, WRITE).map((line) => line.id)).toEqual(['garage6']);
    expect(guestOpenableGroups(family, [])).toEqual([]);
  });

  it('lets the guest set the level of an opened bottle of those cellars only, never of a group', () => {
    const byId = (id: string) => family.items.find((item) => item.id === id)!;
    expect(guestCanTouch(byId('opened'), WRITE)).toBe(true);
    expect(guestCanTouch(byId('openedRead'), WRITE)).toBe(false);
    expect(guestCanTouch(byId('garage6'), WRITE)).toBe(false);
  });
});
