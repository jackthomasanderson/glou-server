import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { frenchT } from '@/lib/products/__tests__/i18n';

// #471 (V): the bulk actions are written at once, never queued (FEAT-108,
// ux-ui.md §10.8): offline, the menu lists them disabled with the reason.

let t: Awaited<ReturnType<typeof frenchT>>;
beforeAll(async () => { t = await frenchT(); });

const connectivity = vi.hoisted(() => ({ online: true as boolean | null }));
vi.mock('@/hooks/useConnectivity', () => ({ useConnectivity: () => connectivity.online }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));

import { InventoryBulkBar } from '../InventoryBulkBar';

function draw() {
  return render(
    <InventoryBulkBar
      t={(key, options) => t(key, options)}
      bulkMode
      selectedIds={new Set(['a'])}
      isBulkDialogOpen={false}
      onOpenDialog={vi.fn()}
      onCloseDialog={vi.fn()}
      onApply={vi.fn()}
      isSubmitting={false}
      onWinesAction={vi.fn()}
    />,
  );
}

describe('InventoryBulkBar offline (FEAT-108)', () => {
  it('online: the actions are available', async () => {
    connectivity.online = true;
    draw();
    fireEvent.click(screen.getByTestId('bulk-actions-menu'));
    await waitFor(() => expect(screen.getAllByRole('menuitem').length).toBeGreaterThan(0));
    for (const item of screen.getAllByRole('menuitem')) expect(item).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('offline: the menu opens, every action is disabled and says "Disponible au retour de la connexion"', async () => {
    connectivity.online = false;
    draw();
    fireEvent.click(screen.getByTestId('bulk-actions-menu'));
    await waitFor(() => expect(screen.getAllByRole('menuitem').length).toBe(4));
    for (const item of screen.getAllByRole('menuitem')) {
      expect(item).toHaveAttribute('aria-disabled', 'true');
      expect(item).toHaveTextContent('Disponible au retour de la connexion');
    }
  });
});
