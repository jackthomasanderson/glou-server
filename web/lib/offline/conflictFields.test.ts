import { describe, it, expect } from 'vitest';
import { conflictingFields } from './conflictFields';

// #585: the conflict dialog listed every key of the queued change (~50 rows
// for a change made in the edit form), technical ones included.

const server = {
  id: 'A',
  userId: 'u1',
  name: 'Château Test',
  region: 'Bordeaux',
  cellarId: 'c-up',
  quantity: 6,
  fillLevel: 100,
  purchaseDate: '2026-03-12T00:00:00.000Z',
  purchasePrice: 24.5,
  tags: ['rouge'],
  notes: null,
  createdAt: '2026-03-12T10:00:00.000Z',
  updatedAt: '2026-04-01T10:00:00.000Z',
  collections: [{ id: 'k1', name: 'Garde', color: 'red' }],
  fieldSources: { region: 'manual' },
};

describe('conflictingFields (#585)', () => {
  it('keeps only the fields that really differ from the server', () => {
    // A whole record sent by the edit form: only the region and the cellar changed.
    const patch = {
      ...server,
      region: 'Loire',
      cellarId: 'c-down',
      updatedAt: '2026-03-30T10:00:00.000Z',
      notes: '',
      purchaseDate: '2026-03-12',
      purchasePrice: '24.5',
      collections: [{ id: 'k2', name: 'Autre', color: 'blue' }],
      fieldSources: { region: 'scan' },
    };
    expect(conflictingFields(patch, server).map((r) => r.path)).toEqual(['region', 'cellarId']);
  });

  it('never lists technical fields', () => {
    const patch = {
      id: 'B', userId: 'u2', createdAt: 'x', updatedAt: 'y', deletedAt: 'z',
      fieldSources: {}, updatedBy: 'u2', collections: [], expectedUpdatedAt: 'w',
    };
    expect(conflictingFields(patch, server)).toEqual([]);
  });

  it('handles the number of bottles', () => {
    expect(conflictingFields({ quantity: 5 }, server)).toEqual([
      { path: 'quantity', field: 'quantity', local: 5, server: 6 },
    ]);
  });

  it('compares a nested group of fields (e.g. a wine shared by a family) field by field', () => {
    const familyServer = { ...server, product: { name: 'Château Test', region: 'Bordeaux' } };
    const patch = { product: { name: 'Château Test', region: 'Loire' } };
    expect(conflictingFields(patch, familyServer)).toEqual([
      { path: 'product.region', field: 'region', local: 'Loire', server: 'Bordeaux' },
    ]);
  });

  it('treats a field the server does not have yet as a difference', () => {
    expect(conflictingFields({ fillLevel: 50 }, undefined)).toEqual([
      { path: 'fillLevel', field: 'fillLevel', local: 50, server: undefined },
    ]);
  });
});
