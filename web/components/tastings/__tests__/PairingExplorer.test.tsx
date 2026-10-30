import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { InventoryItem } from '@/lib/inventory/types';

// #703 — bottles store their colour in English ('red', 'white') but the
// pairing catalog was keyed in French, so no red or white wine was ever
// suggested for a dish.

function bottle(id: string, name: string, color: string): InventoryItem {
  return {
    id, name, producer: 'Domaine Test', category: 'wine', color,
    deletedAt: null, alertStatus: 'none', isOpened: false,
  } as unknown as InventoryItem;
}

const inventory = [
  bottle('r1', 'Pauillac', 'red'),
  bottle('w1', 'Chablis', 'white'),
];

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'fr' } }),
}));
vi.mock('@/hooks/useInventory', () => ({
  useInventory: () => ({ data: inventory, isLoading: false, isError: false, refetch: vi.fn(), isRefetching: false }),
}));
vi.mock('../TastingForm', () => ({ TastingForm: () => null }));
vi.mock('@/components/ui/ErrorState', () => ({ ErrorState: () => null }));
vi.mock('@heroui/react', () => ({
  Avatar: () => null,
  Button: ({ children, onPress }: { children?: ReactNode; onPress?: () => void }) => (
    <button type="button" onClick={onPress}>{children}</button>
  ),
  Card: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  CardBody: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Chip: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  Input: ({ label, value, onValueChange }: { label?: string; value?: string; onValueChange?: (v: string) => void }) => (
    <input aria-label={label} value={value} onChange={(e) => onValueChange?.(e.target.value)} />
  ),
  Skeleton: () => null,
}));

import { PairingExplorer } from '../PairingExplorer';

function search(query: string) {
  render(<PairingExplorer />);
  fireEvent.change(screen.getByLabelText('tastings.pairing.searchLabel'), { target: { value: query } });
}

describe('PairingExplorer wine colours (#703)', () => {
  it.each(['Viande', 'agneau'])('lists the red wine in stock for "%s"', (query) => {
    search(query);
    expect(screen.getByText('Pauillac — Domaine Test')).toBeInTheDocument();
    expect(screen.queryByText('Chablis — Domaine Test')).toBeNull();
  });

  it('lists the white wine in stock for "poisson"', () => {
    search('poisson');
    expect(screen.getByText('Chablis — Domaine Test')).toBeInTheDocument();
    expect(screen.queryByText('Pauillac — Domaine Test')).toBeNull();
  });
});
