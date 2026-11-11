import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import { GardeHistogram } from '../GardeHistogram';

vi.mock('@/hooks/useThemeMode', () => ({ useThemeMode: () => ({ isDark: false }) }));

const t = (key: string) => key;
const year = new Date().getFullYear();
const data = [year - 1, year, year + 1, year + 2].map((y, i) => ({ year: y, count: i + 1 }));

// #655: the table of values is the text alternative to the chart; on a phone it
// stayed `sr-only` while its toggle was visible, and the year labels were pale.
describe('GardeHistogram text alternative and labels (#655)', () => {
  it('shows the year → count table at every width (no sr-only, no md: reveal)', () => {
    const { container } = render(<GardeHistogram data={data} t={t} />);
    const table = container.querySelector('details table')!;
    expect(table.className).not.toMatch(/sr-only|md:/);
    expect(table.querySelectorAll('tbody tr')).toHaveLength(4);
  });

  it('colours the year labels from the theme, not from hard-coded rgba values', () => {
    const { container } = render(<GardeHistogram data={data} t={t} />);
    const labels = [...container.querySelectorAll('svg text')];
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) expect(label.getAttribute('fill')).toBe('currentColor');
    expect(labels.some((l) => l.getAttribute('class')?.includes('text-warning-700'))).toBe(true);
    const source = fs.readFileSync(path.join(__dirname, '..', 'GardeHistogram.tsx'), 'utf8');
    expect(source).not.toMatch(/rgba\(0,\s*0,\s*0/);
  });
});
