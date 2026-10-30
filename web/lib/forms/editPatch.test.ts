import { describe, it, expect } from 'vitest';
import { buildEditPatch } from './editPatch';

const bottle = {
  id: 'b1',
  updatedAt: '2026-10-01T10:00:00.000Z',
  category: 'wine',
  name: 'Clos de Vougeot',
  producer: 'Domaine X',
  vintage: 2015,
  region: 'Bourgogne',
  purchasePrice: 20,
  isOpened: false,
  fillLevel: 100,
  tags: ['cadeau'],
  notes: null,
  collections: [{ id: 'c1', name: 'Garde' }],
};

describe('buildEditPatch (#572)', () => {
  it('sends only the changed price', () => {
    expect(buildEditPatch(bottle, { ...bottle, purchasePrice: 25 })).toEqual({ purchasePrice: 25 });
  });

  it('sends nothing when nothing changed, or a change was put back', () => {
    expect(buildEditPatch(bottle, { ...bottle })).toEqual({});
    expect(buildEditPatch(bottle, { ...bottle, tags: ['cadeau'], name: 'Clos de Vougeot' })).toEqual({});
  });

  it('does not count an empty value standing for a missing one as a change', () => {
    expect(buildEditPatch(bottle, { ...bottle, notes: '' })).toEqual({});
  });

  it('sends null for a field the user emptied (#726)', () => {
    const out = buildEditPatch(bottle, { ...bottle, vintage: undefined, purchasePrice: 25 });
    expect(out).toEqual({ vintage: null, purchasePrice: 25 });
    // ...and the null survives the JSON the PATCH is sent as.
    expect(JSON.parse(JSON.stringify(out))).toEqual({ vintage: null, purchasePrice: 25 });
  });

  it('keeps a text field the user emptied, and a zero', () => {
    expect(buildEditPatch(bottle, { ...bottle, region: '', fillLevel: 0 })).toEqual({ region: '', fillLevel: 0 });
  });

  it('sends a changed list whole', () => {
    expect(buildEditPatch(bottle, { ...bottle, tags: ['cadeau', 'fête'] })).toEqual({ tags: ['cadeau', 'fête'] });
  });

  it('sends a corrected name (#643)', () => {
    expect(buildEditPatch(bottle, { ...bottle, name: 'Clos de Vougeot Grand Cru' })).toEqual({ name: 'Clos de Vougeot Grand Cru' });
  });
});
