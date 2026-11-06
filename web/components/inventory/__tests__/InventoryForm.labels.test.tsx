import { beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import i18next from 'i18next';
import fr from '../../../public/locales/fr/common.json';
import en from '../../../public/locales/en/common.json';
import type { InventoryCategory, InventoryItem } from '@/lib/inventory/types';
import { HALF_FIELD_LABEL_MAX } from '@/lib/inventory/fieldSpan';

// #867, recette n°5 ter of #847: in the form's two- and four-column grids
// (about 160 px a column), a long label ("Rappel de consommation", "Degré
// d'alcool (%)") wrapped onto two lines and ran over the value or above the
// field's frame. Every field of those grids whose label is long, in French
// and in English, must take two columns.

type T = (key: string, options?: Record<string, unknown>) => string;
const translators: Record<'fr' | 'en', T> = {} as Record<'fr' | 'en', T>;
beforeAll(async () => {
  for (const [lng, bundle] of [['fr', fr], ['en', en]] as const) {
    const instance = i18next.createInstance();
    await instance.init({ lng, resources: { [lng]: { common: bundle } }, defaultNS: 'common', interpolation: { escapeValue: false } });
    translators[lng] = (key, options) => instance.t(key, options) as string;
  }
});

vi.mock('@/hooks/useCellars', () => ({ useCellars: () => ({ data: [{ id: 'garage', name: 'Garage' }] }) }));
vi.mock('@/hooks/useCollections', () => ({ useCollections: () => ({ data: [] }) }));
vi.mock('@/hooks/useKnownWine', () => ({ useKnownWine: () => [] }));
// Expert mode on: its fields ("Date de mise en fût / d'embouteillage du lot") are drawn too.
vi.mock('@/hooks/useExpertMode', () => ({ useExpertMode: () => true }));
vi.mock('@/hooks/useIsMobile', () => ({ useIsMobile: () => false }));
vi.mock('@/lib/toast', () => ({ notifyError: vi.fn() }));
vi.mock('@/lib/search/client', () => ({ searchClient: { searchImages: vi.fn(async () => []), saveImageFromUrl: vi.fn() } }));
vi.mock('../ItemImageSection', () => ({ ItemImageSection: () => null }));
vi.mock('../ProductAutocomplete', () => ({ ProductAutocomplete: () => null }));
vi.mock('../ProducerAutocomplete', () => ({ ProducerAutocomplete: () => null }));

import { InventoryForm } from '../InventoryForm';

const CATEGORIES: InventoryCategory[] = ['wine', 'sparkling', 'spirit', 'cigar'];

/** The grid cell of a label in a two-column grid of the form, if it sits in one. */
function gridCell(label: Element): Element | null {
  for (let el: Element | null = label; el?.parentElement; el = el.parentElement) {
    if (el.parentElement.classList.contains('grid-cols-2')) return el;
  }
  return null;
}

/** Labels of half-width grid fields too long for one column; also returns every label seen. */
function crampedLabels(): { cramped: string[]; seen: string[] } {
  const cramped: string[] = [];
  const seen: string[] = [];
  for (const label of screen.getByRole('dialog').querySelectorAll('label[data-slot="label"]')) {
    const cell = gridCell(label);
    const text = (label.textContent ?? '').trim();
    if (!cell || !text) continue;
    seen.push(text);
    const wide = /(^|\s)(sm:)?col-span-(2|4)(\s|$)/.test(cell.className);
    if (text.length > HALF_FIELD_LABEL_MAX && !wide) cramped.push(text);
  }
  return { cramped, seen };
}

function draw(t: T, category: InventoryCategory, mode: 'new' | 'openedUnit' | 'description') {
  const initialValues: Partial<InventoryItem> | undefined =
    mode === 'new' ? undefined
      : {
        id: mode === 'openedUnit' ? 'u1' : undefined, productId: 'p1', category, name: 'Cuvée X', producer: 'Domaine',
        tags: [], grapeVarieties: [], quantity: 1, isOpened: mode === 'openedUnit', fillLevel: 50,
        cigarsPerBox: category === 'cigar' ? 10 : null, cigarsLeft: category === 'cigar' ? 5 : null,
      };
  render(
    <InventoryForm
      open
      defaultCategory={category}
      initialValues={initialValues}
      descriptionOf={mode === 'description' ? { units: 9, kind: category === 'cigar' ? 'cigar' : 'bottle' } : undefined}
      onSubmit={vi.fn()}
      onClose={() => {}}
      t={t}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: t('actions.showMore') }));
}

describe('InventoryForm — long labels of half-width fields (#867)', () => {
  for (const lng of ['fr', 'en'] as const) {
    for (const category of CATEGORIES) {
      for (const mode of ['new', 'openedUnit', 'description'] as const) {
        it(`${lng} · ${category} · ${mode}: a long label takes two columns`, () => {
          const t = translators[lng];
          draw(t, category, mode);
          const { cramped, seen } = crampedLabels();
          expect(seen.length).toBeGreaterThan(0);
          expect(cramped).toEqual([]);
          cleanup();
        });
      }
    }
  }

  it('reaches the fields of the report: the reminder of a cigar, the alcohol degree of a wine', () => {
    const t = translators.fr;
    draw(t, 'cigar', 'description');
    expect(crampedLabels().seen).toContain('Rappel de consommation');
    cleanup();
    draw(t, 'wine', 'new');
    expect(crampedLabels().seen).toContain("Degré d'alcool (%)");
    cleanup();
  });
});
