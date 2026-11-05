import { describe, it, expect } from 'vitest';
import { formatHistoryValue, formatSlotChange, historyFieldLabel } from './history-format';

const t = (key: string, options?: Record<string, unknown>) =>
  ({
    'inventory.fields.cellarId': 'Cellar',
    'traceability.booleanTrue': 'Yes',
    'traceability.booleanFalse': 'No',
    'actions.none': 'None',
    'categories.spirit': 'Spirit',
    'history.fields.slot': 'Case',
    'history.slotNone': 'aucune',
  } as Record<string, string>)[key]
    ?? (key === 'cellars.grid.cellShort' ? `C${options?.col}·R${options?.row}` : undefined)
    ?? (key === 'history.slotChange' ? `Case ${options?.from} → ${options?.to}` : undefined) ?? (options?.defaultValue as string) ?? key;

describe('item history formatting (#508)', () => {
  it('uses the translated field label', () => {
    expect(historyFieldLabel('cellarId', t)).toBe('Cellar');
    expect(historyFieldLabel('someNewField', t)).toBe('Some New Field');
  });

  it('shows the cellar name instead of its id', () => {
    const cellarName = (id: string) => (id === 'c1' ? 'Cave du bas' : undefined);
    expect(formatHistoryValue('cellarId', 'c1', t, { cellarName })).toBe('Cave du bas');
    expect(formatHistoryValue('cellarId', 'gone', t, { cellarName })).toBe('—');
  });

  it('renders booleans, empties, categories and levels for people', () => {
    expect(formatHistoryValue('isOpened', true, t)).toBe('Yes');
    expect(formatHistoryValue('notes', null, t)).toBe('None');
    expect(formatHistoryValue('category', 'spirit', t)).toBe('Spirit');
    expect(formatHistoryValue('fillLevel', 50, t)).toBe('50%');
    expect(formatHistoryValue('slotColumn', 3, t)).toBe('3');
  });

  it('formats amounts in the user language', () => {
    expect(formatHistoryValue('purchasePrice', 42, t, { lang: 'en' })).toContain('42');
    expect(formatHistoryValue('purchasePrice', 42, t, { lang: 'en' })).toContain('€');
  });

  it('names the records of a list instead of printing "[object Object]" (#585)', () => {
    expect(formatHistoryValue('collections', [{ id: 'k1', name: 'Garde' }, { id: 'k2', name: 'Fêtes' }], t)).toBe('Garde, Fêtes');
    expect(formatHistoryValue('tags', ['rouge', 'garde'], t)).toBe('rouge, garde');
  });
});

describe('a purchase day in the history (#471, D6)', () => {
  it('is the day itself west of UTC, never the day before', () => {
    const tz = process.env.TZ;
    process.env.TZ = 'America/New_York';
    try {
      expect(formatHistoryValue('purchasedAt', '2026-03-01T00:00:00.000Z', t, { lang: 'fr' })).toBe('01/03/2026');
      expect(formatHistoryValue('purchasedAt', '2026-03-01', t, { lang: 'fr' })).toBe('01/03/2026');
    } finally {
      process.env.TZ = tz;
    }
  });
});

// FEAT-93 (#847, lot S4): the cells of the plan in the history — no more raw JSON.
describe('cells of the plan in the history (FEAT-93)', () => {
  it('says a cell placed, freed or moved', () => {
    expect(historyFieldLabel('slot', t)).toBe('Case');
    expect(formatSlotChange({ column: 2, row: 3 }, null, t)).toBe('Case C2·R3 → aucune');
    expect(formatSlotChange(null, { column: 1, row: 1 }, t)).toBe('Case aucune → C1·R1');
    expect(formatSlotChange({ column: 1, row: 1 }, { column: 2, row: 1 }, t)).toBe('Case C1·R1 → C2·R1');
    expect(formatHistoryValue('slot', { column: 4, row: 2 }, t)).toBe('C4·R2');
    expect(formatHistoryValue('slot', null, t)).toBe('aucune');
  });

  it('still reads the coordinates written before (slotColumn, slotRow)', () => {
    expect(formatHistoryValue('slotRow', 2, t)).toBe('2');
  });
});
