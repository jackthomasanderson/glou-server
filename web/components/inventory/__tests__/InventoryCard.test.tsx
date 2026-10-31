import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InventoryCard } from '../InventoryCard';
import { describeStock } from '@/lib/products/stock';
import type { Product } from '@/lib/products/types';
import { openedBottle, product, unit } from '@/lib/products/__tests__/factories';
import { frenchT } from '@/lib/products/__tests__/i18n';

// #471 — ux-ui.md §10.2 (a wine's card), §10.5 ("Plus en cave"), §10.13.

let t: Awaited<ReturnType<typeof frenchT>>;
beforeAll(async () => { t = await frenchT(); });

function card(p: Product, extra: Partial<React.ComponentProps<typeof InventoryCard>> = {}) {
  return render(
    <InventoryCard
      item={p}
      stock={describeStock(p, t, { formatDate: () => '12 oct. 2026' })}
      categoryLabel="Vin"
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      onView={vi.fn()}
      t={t}
      {...extra}
    />,
  );
}

// The parts are laid out with a gap: read them as they show, one after the other.
const stockLine = () => {
  const line = screen.queryByTestId('family-stock-line');
  // A number is tied to its word by a no-break space.
  return line ? Array.from(line.querySelectorAll('[aria-hidden="true"]'), (part) => part.textContent).join(' ').replace(/\u00a0/g, ' ') : null;
};
const badge = () => screen.queryByTestId('family-card-badge')?.textContent ?? null;

describe('InventoryCard — one card per wine', () => {
  it('a single full bottle: counter "1", no stock line', () => {
    card(product({ items: [unit()] }));
    expect(badge()).toBe('1');
    expect(stockLine()).toBeNull();
    expect(screen.getByRole('button', { name: 'Cuvée X 2020 — Vin, 1 bouteille' })).toBeInTheDocument();
  });

  it('a single opened bottle: its level on the counter, the opened accent', () => {
    card(product({ items: [openedBottle(60)] }));
    expect(badge()).toBe('60 %');
    expect(stockLine()).toBe('1 entamée (60 %)');
    expect(screen.getByText('Entamée')).toBeInTheDocument();
  });

  it('full and opened bottles, read as a sentence', () => {
    card(product({ items: [unit({ quantity: 5 }), openedBottle(60)] }));
    expect(badge()).toBe('6');
    expect(stockLine()).toBe('5 pleines · 1 entamée (60 %)');
    expect(screen.getByRole('button', { name: 'Cuvée X 2020 — Vin, 5 bouteilles pleines, 1 entamée à 60 %' })).toBeInTheDocument();
  });

  it('a number never ends a line: it is tied to its word', () => {
    card(product({ items: [unit({ quantity: 500 }), openedBottle(60)] }));
    const parts = Array.from(screen.getByTestId('family-stock-line').querySelectorAll('[aria-hidden="true"]'), (p) => p.textContent);
    expect(parts).toEqual(['500\u00a0pleines', '· 1\u00a0entamée (60\u00a0%)']);
  });

  it('several opened bottles show their number', () => {
    card(product({ items: [unit({ quantity: 5 }), openedBottle(60), openedBottle(20)] }));
    expect(stockLine()).toBe('5 pleines · 2 entamées');
  });

  it('a magnum stays on the same card', () => {
    card(product({ items: [unit({ quantity: 4 }), unit({ bottleSize: 'Magnum' })] }));
    expect(stockLine()).toBe('5 bouteilles dont 1 magnum');
  });

  it('cigars: boxes and singles, counter in cigars', () => {
    card(product({
      category: 'cigar',
      items: [unit({ quantity: 3, cigarsPerBox: 25 }), unit({ isOpened: true, cigarsPerBox: 25, cigarsLeft: 10 }), unit({ quantity: 4 })],
    }));
    expect(badge()).toBe('89');
    expect(stockLine()).toBe("3 boîtes fermées · 1 entamée · 4 à l'unité");
    expect(screen.getByText('Boîte entamée')).toBeInTheDocument();
  });

  it('"Plus en cave": faded, "Plus de bouteille" with its last date, no counter', () => {
    const { container } = card(product({ items: [], lastActivityAt: '2026-10-12T10:00:00.000Z' }));
    expect(badge()).toBeNull();
    expect(stockLine()).toBe('Plus de bouteille · Dernière fois le 12 oct. 2026');
    expect(container.querySelector('[style*="grayscale"]')).not.toBeNull();
  });

  it('a cigar with nothing left: "Plus de cigare"', () => {
    card(product({ category: 'cigar', items: [] }));
    expect(stockLine()).toBe('Plus de cigare');
  });

  it('a long name is kept whole for the focus tooltip, clamped to two lines', () => {
    const name = 'Château au nom vraiment très long, Grand Cru Classé, Cuvée Prestige Vieilles Vignes';
    card(product({ name }));
    const open = screen.getByRole('button', { name: new RegExp(`^${name}`) });
    expect(open.getAttribute('title')).toBe(name);
    const clamped = open.querySelector('.line-clamp-2');
    expect(clamped?.textContent).toBe(name);
    // Whole again when the name has the keyboard focus.
    expect(clamped?.className).toContain('group-focus-visible:line-clamp-none');
  });

  it('without a bottle record to open, offers neither edit nor open, only the trash', () => {
    card(product({ items: [] }), { onEdit: undefined, onView: undefined });
    expect(screen.queryByRole('button', { name: 'Modifier' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Mettre à la corbeille' })).toBeInTheDocument();
  });

  it('in selection mode, the checkbox names the wine', () => {
    card(product({ items: [unit()] }), { onView: undefined, onSelectToggle: vi.fn() });
    expect(screen.getByRole('checkbox', { name: 'Sélectionner Cuvée X 2020' })).toBeInTheDocument();
  });
});
