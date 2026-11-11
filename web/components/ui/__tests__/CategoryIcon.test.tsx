import { beforeAll, describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { CategoryIcon } from '../CategoryIcon';
import { CATEGORY_VALUES } from '@/lib/inventory/types';
import { frenchT } from '@/lib/products/__tests__/i18n';

describe('CategoryIcon (#622)', () => {
  it('draws a glass for spirits, never a bare letter', () => {
    const { container } = render(<CategoryIcon category="spirit" />);
    expect(container.querySelector('svg.lucide-glass-water')).not.toBeNull();
    expect(container).toHaveTextContent('');
  });

  it('draws one svg per category, hidden from assistive technology, at the asked size', () => {
    for (const category of CATEGORY_VALUES) {
      const { container, unmount } = render(<CategoryIcon category={category} size={40} className="x" />);
      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();
      expect(svg).toHaveAttribute('aria-hidden', 'true');
      expect(svg).toHaveAttribute('width', '40');
      expect(svg).toHaveClass('x');
      unmount();
    }
  });
});

describe('scan review default-location label (#532)', () => {
  let t: Awaited<ReturnType<typeof frenchT>>;
  beforeAll(async () => { t = await frenchT(); });

  it.each([
    ['wine', 'Toujours ranger les vins scannés ici'],
    ['sparkling', 'Toujours ranger les bulles scannées ici'],
    ['spirit', 'Toujours ranger les spiritueux scannés ici'],
    ['cigar', 'Toujours ranger les cigares scannés ici'],
  ])('agrees with the plural of %s', (category, expected) => {
    expect(t('scan.review.setDefaultLocation', { context: category, category: t(`categoriesPlural.${category}`) })).toBe(expected);
  });
});
