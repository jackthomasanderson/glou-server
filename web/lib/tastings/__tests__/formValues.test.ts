import { describe, it, expect } from 'vitest';
import { blankTastingValues, tastingToFormValues } from '../formValues';
import type { TastingNote } from '../types';

const expertTasting: TastingNote = {
  id: 'note-1',
  userId: 'user-1',
  itemId: 'item-1',
  tastedAt: '2026-10-20T00:00:00.000Z',
  context: 'amis',
  rating: 4,
  readiness: 'PERFECT',
  notes: 'Long and silky',
  foodPairing: 'Lamb',
  photoUrl: null,
  robe: 'Deep ruby',
  nez: 'Blackcurrant, cedar',
  bouche: 'Firm, fresh',
  tanin: 4,
  acidite: 3,
  longueurBouche: 12,
  createdAt: '2026-10-20T20:00:00.000Z',
  updatedAt: '2026-10-20T20:00:00.000Z',
};

describe('tastingToFormValues (#642)', () => {
  it('keeps the perceived maturity and the whole expert grid', () => {
    expect(tastingToFormValues(expertTasting)).toEqual({
      itemId: 'item-1',
      tastedAt: '2026-10-20',
      context: 'amis',
      rating: 4,
      readiness: 'PERFECT',
      notes: 'Long and silky',
      foodPairing: 'Lamb',
      photoUrl: null,
      robe: 'Deep ruby',
      nez: 'Blackcurrant, cedar',
      bouche: 'Firm, fresh',
      tanin: 4,
      acidite: 3,
      longueurBouche: 12,
    });
  });

  it('fills every field a new tasting starts with', () => {
    const blankKeys = Object.keys(blankTastingValues('item-1')).sort();
    const editKeys = Object.keys(tastingToFormValues(expertTasting));
    for (const key of blankKeys) expect(editKeys).toContain(key);
  });

  it('turns missing values into the empty values of the form', () => {
    const bare: TastingNote = {
      id: 'note-2',
      userId: 'user-1',
      tastedAt: '2026-10-21T00:00:00.000Z',
      createdAt: '2026-10-21T20:00:00.000Z',
      updatedAt: '2026-10-21T20:00:00.000Z',
    };
    expect(tastingToFormValues(bare)).toEqual({
      itemId: undefined,
      tastedAt: '2026-10-21',
      context: '',
      rating: null,
      readiness: null,
      notes: '',
      foodPairing: '',
      photoUrl: null,
      robe: null,
      nez: null,
      bouche: null,
      tanin: null,
      acidite: null,
      longueurBouche: null,
    });
  });
});
