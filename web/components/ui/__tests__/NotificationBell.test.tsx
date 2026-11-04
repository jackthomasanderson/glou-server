import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NotificationBell } from '../NotificationBell';
import { product, unit, openedBottle } from '@/lib/products/__tests__/factories';
import type { Product } from '@/lib/products/types';

// #471 (W4): the bell lists reminders by wine, as its badge counts them: a
// wine of three groups is one reminder, a wine with nothing left is none.

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/hooks/useHasMounted', () => ({ useHasMounted: () => true }));
vi.mock('@/hooks/useAlerts', () => ({ useAlerts: () => ({ data: [] }), useToggleAlertPause: () => ({ mutate: vi.fn(), isPending: false }) }));
vi.mock('@/hooks/useSidebarCounts', () => ({ useSidebarCounts: () => ({ data: { remindersToday: 1 } }) }));
const updateProduct = vi.fn();
let products: Product[] = [];
vi.mock('@/hooks/useProducts', () => ({
  useProducts: () => ({ data: products }),
  useUpdateProduct: () => ({ mutate: updateProduct, isPending: false }),
}));

const due = '2000-01-01T00:00:00.000Z';

beforeEach(() => {
  updateProduct.mockReset();
  products = [];
});

function open() {
  render(<NotificationBell />);
  fireEvent.click(screen.getByRole('button', { name: 'inventory.alerts.title' }));
}

describe('NotificationBell — reminders by wine (W4)', () => {
  it('lists a wine with three groups once, and marks the wine itself as done', async () => {
    products = [product({
      id: 'w1', name: 'Cuvée X', reminderDate: due,
      items: [unit({ quantity: 4 }), unit({ quantity: 2, cellarId: 'a' }), openedBottle(60)],
    })];
    open();
    expect(await screen.findAllByText('Cuvée X')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /inventory.alerts.reminderDone/ }));
    expect(updateProduct).toHaveBeenCalledWith({ id: 'w1', patch: { reminderDate: null } });
  });

  it('does not list a wine with nothing left in stock, nor a reminder in the future', async () => {
    products = [
      product({ id: 'gone', name: 'Bu', reminderDate: due, items: [unit({ isOpened: true, fillLevel: 0 })] }),
      product({ id: 'later', name: 'Plus tard', reminderDate: '2999-01-01T00:00:00.000Z' }),
    ];
    open();
    expect(await screen.findByText('inventory.noNotifications')).toBeInTheDocument();
  });
});
