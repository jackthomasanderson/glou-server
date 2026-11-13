import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { frenchT } from '@/lib/products/__tests__/i18n';
import type { StockMovementView } from '@shared/stock-movement';
import type { Wire } from '@shared/wire';

// #848 (FEAT-110): a wine's movement journal in its drawer — newest first,
// date, member or guest, movement, line and difference.

let t: Awaited<ReturnType<typeof frenchT>>;
beforeAll(async () => { t = await frenchT(); });

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, options?: Record<string, unknown>) => t(key, options), i18n: { language: 'fr' } }),
}));
vi.mock('@/hooks/useHasMounted', () => ({ useHasMounted: () => true }));

import { FamilyMovements } from '../FamilyMovements';

type Movement = Wire<StockMovementView>;
const garage = { id: 'garage', name: 'Garage' };
const kitchen = { id: 'kitchen', name: 'Cuisine' };
const marie = { kind: 'member', name: 'Marie' } as const;
let next = 100;
const movement = (over: Partial<Movement>): Movement => ({
  id: String(next--), kind: 'ADDED', delta: 0, count: 1, author: marie, itemId: 'g', cellar: garage,
  createdAt: '2026-11-12T10:00:00.000Z', ...over,
} as Movement);

function renderJournal(movements: Movement[] | undefined, extra: { isError?: boolean; kind?: 'bottle' | 'cigar' } = {}) {
  return render(<FamilyMovements movements={movements} isError={extra.isError} nounOf={() => (extra.kind === 'cigar' ? 'cigar' : 'bottle')} kind={extra.kind ?? 'bottle'} />);
}

const lines = () => within(screen.getByTestId('family-movements')).getAllByRole('listitem');

describe('FamilyMovements', () => {
  // FEAT-110 criterion 1, newest first as the API answers.
  it('tells the added, moved, opened and corrected bottles, then a new price of part of a line, with author and difference', () => {
    renderJournal([
      movement({ kind: 'PRICE_CHANGED', count: 2, fromPrice: 20, toPrice: 25 }),
      movement({ kind: 'CORRECTED', delta: -1, count: 1, from: 4, to: 3, reason: 'written_off' }),
      movement({ kind: 'OPENED', count: 1, cellar: kitchen, itemId: 'o' }),
      movement({ kind: 'MOVED', count: 2, fromCellar: garage, toCellar: kitchen }),
      movement({ kind: 'ADDED', delta: 6, count: 6 }),
    ]);

    const text = lines().map((line) => line.textContent);
    expect(text[0]).toContain('Prix de 2 bouteilles : 20');
    expect(text[0]).toContain('25');
    expect(text[1]).toContain('Nombre corrigé : 4 → 3 (cassée, offerte ou perdue) · Garage');
    expect(text[1]).toContain('−1');
    expect(text[2]).toContain('1 bouteille ouverte · Cuisine');
    // The spec: from which cellar to which (review of #982).
    expect(text[3]).toContain('2 bouteilles déplacées de Garage vers Cuisine');
    expect(text[4]).toContain('6 bouteilles ajoutées · Garage');
    expect(text[4]).toContain('+6');
    expect(text.every((line) => line?.includes('Marie'))).toBe(true);
    // Announced with its meaning, the visible sign hidden from screen readers (review of #982).
    expect(within(lines()[4]).getByText('Écart : +6')).toHaveClass('sr-only');
    expect(within(lines()[4]).getByText('+6')).toHaveAttribute('aria-hidden', 'true');
  });

  // FEAT-110 criterion 2.
  it('names the guest who drank a bottle', () => {
    renderJournal([movement({ kind: 'CONSUMED', delta: -1, author: { kind: 'guest', name: 'Paul' } })]);

    expect(lines()[0]).toHaveTextContent('Paul (invité)');
    expect(lines()[0]).toHaveTextContent('1 bouteille bue');
  });

  // FEAT-110 criterion 4: the update's line, no author.
  it('starts with the update\'s line, without author or difference', () => {
    renderJournal([movement({ kind: 'INITIAL', delta: 9, count: 9, author: { kind: 'none' }, itemId: null, cellar: null })]);

    expect(lines()[0].textContent).toContain('Mise à jour : 9 en cave');
    expect(lines()[0].textContent).not.toContain('+9');
    expect(lines()[0].textContent).not.toContain('Marie');
  });

  // #661: an account deleted since is never shown by its former name.
  it('shows a deleted member as such, and a deleted cellar without its name', () => {
    renderJournal([movement({ kind: 'ADDED', delta: 1, author: { kind: 'deletedMember' }, cellar: { id: 'old', name: null } })]);

    expect(lines()[0]).toHaveTextContent('Membre supprimé');
    expect(lines()[0]).toHaveTextContent('cave supprimée');
  });

  it('counts smoked cigars in cigars', () => {
    renderJournal([movement({ kind: 'CONSUMED', delta: -3, count: 3 })], { kind: 'cigar' });

    expect(lines()[0]).toHaveTextContent('3 cigares fumés');
  });

  it('shows the ten most recent, then all of them on demand', () => {
    renderJournal(Array.from({ length: 12 }, () => movement({ kind: 'ADDED', delta: 1 })));

    expect(lines()).toHaveLength(10);
    fireEvent.click(screen.getByRole('button', { name: 'Voir les 12 mouvements' }));
    expect(lines()).toHaveLength(12);
  });

  it('says in one line when the journal cannot be read, and nothing while it loads', () => {
    const { container, rerender } = renderJournal(undefined);
    expect(container).toBeEmptyDOMElement();

    rerender(<FamilyMovements movements={undefined} isError nounOf={() => 'bottle'} kind="bottle" />);
    expect(screen.getByText('Les mouvements n\'ont pas pu être chargés.')).toBeInTheDocument();
  });
});
