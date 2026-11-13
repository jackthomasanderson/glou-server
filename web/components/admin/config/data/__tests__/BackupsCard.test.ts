import { describe, expect, it } from 'vitest';
import { formatBytes } from '../BackupsCard';

// #700: a backup size reads "1,5 MB" in French.
describe('formatBytes', () => {
  it('uses the decimal separator of the language', () => {
    expect(formatBytes(1.5 * 1024 * 1024, 'fr')).toBe('1,5 MB');
    expect(formatBytes(1.5 * 1024 * 1024, 'en')).toBe('1.5 MB');
    expect(formatBytes(null, 'fr')).toBe('—');
  });
});
