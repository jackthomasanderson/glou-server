import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { InventoryItem } from '@/lib/inventory/types';

// #657: "Save as preset" keeps Save clickable; with the name empty, a click
// shows the field in red with the required message and saves nothing.

const savePreset = vi.fn();
vi.mock('@/hooks/useCellars', () => ({ useCellars: () => ({ data: [] }) }));
vi.mock('@/hooks/useBulkPresets', () => ({
  useBulkPresets: () => ({ data: [] }),
  useCreateBulkPreset: () => ({ mutate: savePreset, isPending: false }),
  useDeleteBulkPreset: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/components/offline/OfflineBlockedButton', () => ({
  useOfflineBlocked: () => false,
  OfflineBlockedButton: ({ children }: { children?: ReactNode }) => <button type="button">{children}</button>,
}));
vi.mock('@/components/ui/FilterControls', () => ({ FilterChip: () => null }));
vi.mock('@/components/ui/ResponsiveModal', () => ({
  ResponsiveModal: ({ isOpen, children }: { isOpen?: boolean; children?: ReactNode }) =>
    isOpen ? <div role="dialog">{children}</div> : null,
}));

// The modal parts are plain wrappers: the dialog itself is mocked above.
vi.mock('@heroui/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@heroui/react')>()),
  ModalContent: ({ children }: { children?: ReactNode | ((onClose: () => void) => ReactNode) }) => (
    <>{typeof children === 'function' ? children(() => {}) : children}</>
  ),
  ModalHeader: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ModalBody: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ModalFooter: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

import { BulkActionDialog } from '../BulkActionDialog';

const t = (key: string) => key;

describe('BulkActionDialog — save preset without a name (#657)', () => {
  it('keeps Save clickable and shows the required-field error', async () => {
    const item = { id: 'b1', tags: [], cellarId: null, isOpened: false, fillLevel: 100 } as unknown as InventoryItem;
    render(<BulkActionDialog open onClose={() => {}} selectedItems={[item]} onApply={() => {}} t={t} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'inventory.fields.tags' }));
    fireEvent.click(screen.getByRole('button', { name: 'bulk.savePreset' }));
    const save = screen.getByRole('button', { name: 'actions.save' });
    expect(save).not.toBeDisabled();

    fireEvent.click(save);

    await waitFor(() => expect(screen.getByText('inventory.validation.required')).toBeTruthy());
    expect(screen.getByRole('textbox', { name: /bulk.presetName/ })).toHaveAttribute('aria-invalid', 'true');
    expect(savePreset).not.toHaveBeenCalled();
  });
});
