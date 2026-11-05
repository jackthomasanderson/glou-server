import { beforeAll, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InventoryStatsLine } from '../InventoryStatsLine';
import type { Product } from '@/lib/products/types';
import { product, unit } from '@/lib/products/__tests__/factories';
import { frenchT } from '@/lib/products/__tests__/i18n';

// #471 (FEAT-96 c2, ux-ui.md §10.6, decisions 50 and 56): the statistics line
// names the units in stock, then the families, in the words of the page.

let t: Awaited<ReturnType<typeof frenchT>>;
beforeAll(async () => { t = await frenchT(); });

let seq = 0;
/** `families` wines of `category` holding `bottles` bottles in all (the first one carries the rest). */
function wines(category: 'wine' | 'sparkling' | 'spirit', families: number, bottles: number): Product[] {
  return Array.from({ length: families }, (_, index) => {
    seq += 1;
    const quantity = index === 0 ? bottles - (families - 1) : 1;
    return product({ id: `${category}${seq}`, category, items: [unit({ quantity })] });
  });
}

function cigars(): Product[] {
  // 89 cigars in 12 references: 3 closed boxes of 25, an opened box with 3 left, and 10 singles of 10 references.
  const boxes = product({
    id: 'c-boxes', category: 'cigar',
    items: [unit({ quantity: 3, cigarsPerBox: 25 }), unit({ isOpened: true, fillLevel: null, cigarsPerBox: 25, cigarsLeft: 3 })],
  });
  const singles = Array.from({ length: 10 }, (_, i) => product({ id: `c${i}`, category: 'cigar', items: [unit({ quantity: 1 })] }));
  const eleventh = product({ id: 'c-last', category: 'cigar', items: [unit({ quantity: 1 })] });
  return [boxes, ...singles, eleventh];
}

function headline(products: Product[], isCigarPage = false) {
  const { container } = render(<InventoryStatsLine products={products} goneCount={0} isCigarPage={isCigarPage} t={t} />);
  return { text: screen.getByTestId('inventory-stats-headline').textContent, container };
}

describe('InventoryStatsLine — the words of each page', () => {
  it('Wines: "142 bouteilles · 58 vins"', () => {
    expect(headline(wines('wine', 58, 142)).text).toBe('142 bouteilles · 58 vins');
  });

  it('Sparkling: "34 bouteilles · 12 cuvées"', () => {
    expect(headline(wines('sparkling', 12, 34)).text).toBe('34 bouteilles · 12 cuvées');
  });

  it('Spirits: "23 bouteilles · 17 spiritueux"', () => {
    expect(headline(wines('spirit', 17, 23)).text).toBe('23 bouteilles · 17 spiritueux');
  });

  it('Cigars: "89 cigares · 12 références"', () => {
    expect(headline(cigars(), true).text).toBe('89 cigares · 12 références');
  });

  it('a page of one wine says "1 bouteille · 1 vin"', () => {
    expect(headline(wines('wine', 1, 1)).text).toBe('1 bouteille · 1 vin');
  });

  it('wines and spirits together use a neutral word for the second figure', () => {
    expect(headline([...wines('wine', 2, 5), ...wines('spirit', 1, 1)]).text).toBe('6 bouteilles · 3 références');
  });

  it('does not count a family with nothing left in stock', () => {
    const drunk = product({ id: 'gone', items: [unit({ isOpened: true, fillLevel: 0 })] });
    expect(headline([...wines('wine', 2, 3), drunk]).text).toBe('3 bouteilles · 2 vins');
  });

  it('names the full and opened ones, never "actifs" nor "Total stock"', () => {
    const opened = product({ id: 'o', items: [unit({ quantity: 2 }), unit({ isOpened: true, fillLevel: 60 })] });
    const { container } = render(<InventoryStatsLine products={[opened]} goneCount={1} isCigarPage={false} t={t} />);
    const text = container.textContent ?? '';
    expect(text).toContain('3 bouteilles · 1 vin');
    expect(text).toContain('Pleines');
    expect(text).toContain('Entamées');
    expect(text).not.toMatch(/actif|Total stock|Stock plein/i);
  });

  it('cigars name intact cigars and the cigars left in opened boxes', () => {
    const { container } = render(<InventoryStatsLine products={cigars()} goneCount={0} isCigarPage t={t} />);
    expect(container.textContent).toContain('Intacts');
    expect(container.textContent).toContain('Cigares entamés');
  });
});

describe('InventoryStatsLine — nothing in stock', () => {
  it('keeps the word of the page: "0 bouteille · 0 cuvée" on Sparkling, not "0 vin"', () => {
    const { container } = render(<InventoryStatsLine products={[]} goneCount={2} isCigarPage={false} pageCategories={['sparkling']} t={t} />);
    expect(container.textContent).toContain('0 bouteille · 0 cuvée');
  });
});
