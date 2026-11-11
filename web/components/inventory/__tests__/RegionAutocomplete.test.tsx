import { beforeAll, describe, expect, it, vi } from 'vitest';
import React, { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { frenchT } from '@/lib/products/__tests__/i18n';
import { product } from '@/lib/products/__tests__/factories';

// #961: the Region field suggests what the Analytics map can place and the
// regions already used in the cellar, and says — without blocking — when the
// typed region cannot be placed.

let t: Awaited<ReturnType<typeof frenchT>>;
beforeAll(async () => { t = await frenchT(); });

const cellar = [
  product({ id: 'a', region: 'Terroir Imaginaire' }),
  product({ id: 'b', region: 'bordeaux ' }),
  product({ id: 'c', region: 'Terroir Imaginaire' }),
];
vi.mock('@/hooks/useProducts', () => ({ useProducts: () => ({ data: cellar }) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, opts?: Record<string, unknown>) => t(key, opts) }) }));

import { RegionAutocomplete } from '../RegionAutocomplete';

function Field({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <RegionAutocomplete value={value} onChange={setValue} label="Région" />
      <output data-testid="value">{value}</output>
    </>
  );
}

const input = () => screen.getByRole('combobox', { name: 'Région' });
const options = () => screen.queryAllByRole('option').map((o) => o.textContent);

describe('RegionAutocomplete', () => {
  it('suggests the names the map can place, accents and hyphens aside', () => {
    render(<Field />);
    fireEvent.change(input(), { target: { value: 'nouvelle aq' } });
    expect(options()).toContain('Nouvelle-Aquitaine');
    fireEvent.click(screen.getByRole('option', { name: 'Nouvelle-Aquitaine' }));
    expect(screen.getByTestId('value')).toHaveTextContent('Nouvelle-Aquitaine');
  });

  it('suggests the regions of the cellar first, once each, flagging the one the map cannot place', () => {
    render(<Field />);
    act(() => input().focus());
    // Empty field: the regions already used, a known one under the map's name.
    expect(options()).toEqual(['Terroir ImaginairePas sur la carte', 'Bordeaux']);

    fireEvent.change(input(), { target: { value: 'bord' } });
    expect(options()).toEqual(['Bordeaux']);
  });

  it('says what the field is for, and warns without blocking when the region cannot be placed', () => {
    const { rerender } = render(<Field initial="Bordeaux" />);
    expect(input()).toHaveAccessibleDescription('Sert à placer la bouteille sur la carte des Analyses.');

    rerender(<Field initial="Terroir Imaginaire" key="unknown" />);
    expect(input()).toHaveAccessibleDescription(/^Non reconnue : cette bouteille n'apparaîtra pas sur la carte des Analyses/);
    expect(input()).not.toHaveAttribute('aria-invalid', 'true');
  });
});
