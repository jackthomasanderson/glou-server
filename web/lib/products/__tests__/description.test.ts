import { describe, expect, it } from 'vitest';
import { descriptionPatch, descriptionValues } from '../description';
import { product, unit } from './factories';

// #471 (FEAT-92 c4): the description form of a wine never writes a bottle's field.

describe('descriptionValues / descriptionPatch', () => {
  it('the form opens with the wine\'s description and collections, none of its bottles\' fields', () => {
    const values = descriptionValues(product({ region: 'Bordeaux', items: [unit({ purchasePrice: 20, cellarId: 'garage' })] }));
    expect(values).toMatchObject({ id: 'p1', name: 'Cuvée X', region: 'Bordeaux', collections: [] });
    expect(values).not.toHaveProperty('purchasePrice');
    expect(values).not.toHaveProperty('cellarId');
    expect(values).not.toHaveProperty('items');
  });

  it('sends only the description: bottle fields and derived fields are dropped', () => {
    expect(descriptionPatch({ region: 'Médoc', reminderDate: null, purchasePrice: 25, cellarId: 'x', quantity: 3, isOpened: true, alertStatus: 'past' }))
      .toEqual({ region: 'Médoc', reminderDate: null });
  });
});

// Follow-up of #802: the written fields are the shared list the API checks, not a copy.
describe('descriptionPatch follows the shared restorable list', () => {
  it('never sends consumptionPostponedUntil, which the API refuses on a description patch', () => {
    expect(descriptionPatch({ consumptionPostponedUntil: '2027-01-01T00:00:00.000Z', region: 'Médoc' } as never))
      .toEqual({ region: 'Médoc' });
  });
});
