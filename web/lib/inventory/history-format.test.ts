import { describe, it, expect } from 'vitest';
import { formatHistoryValue, historyFieldLabel } from './history-format';

const t = (key: string, options?: Record<string, unknown>) =>
  ({
    'inventory.fields.cellarId': 'Cellar',
    'traceability.booleanTrue': 'Yes',
    'traceability.booleanFalse': 'No',
    'actions.none': 'None',
    'categories.spirit': 'Spirit',
  } as Record<string, string>)[key] ?? (options?.defaultValue as string) ?? key;

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
