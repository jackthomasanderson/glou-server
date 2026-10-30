import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { InventoryItem } from '@/lib/inventory/types';

// #705 — Select → tick a bottle → Bulk actions → tick "Tags" → Cancel → leave
// selection mode crashed the page: the dialog stays mounted while closed, kept
// "Tags" ticked and rebuilt its preview over an empty selection.

vi.mock('@/hooks/useCellars', () => ({ useCellars: () => ({ data: [] }) }));
vi.mock('@/hooks/useBulkPresets', () => ({
  useBulkPresets: () => ({ data: [] }),
  useCreateBulkPreset: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteBulkPreset: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/components/ui/FilterControls', () => ({ FilterChip: () => null }));
// Closed modals render nothing, like HeroUI's.
vi.mock('@/components/ui/ResponsiveModal', () => ({
  ResponsiveModal: ({ isOpen, children }: { isOpen?: boolean; children?: ReactNode }) =>
    isOpen ? <div role="dialog">{children}</div> : null,
}));
vi.mock('@heroui/react', () => ({
  Button: ({ children, onPress, isDisabled }: { children?: ReactNode; onPress?: () => void; isDisabled?: boolean }) => (
    <button type="button" onClick={onPress} disabled={isDisabled}>{children}</button>
  ),
  Checkbox: ({ children, isSelected, onValueChange }: {
    children?: ReactNode; isSelected?: boolean; onValueChange?: (v: boolean) => void;
  }) => (
    <label>
      <input type="checkbox" checked={!!isSelected} onChange={(e) => onValueChange?.(e.target.checked)} />
      {children}
    </label>
  ),
  Chip: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  Divider: () => <hr />,
  Input: ({ 'aria-label': ariaLabel, label }: { 'aria-label'?: string; label?: string }) => (
    <input aria-label={ariaLabel ?? label} />
  ),
  Select: () => null,
  SelectItem: () => null,
  ModalContent: ({ children }: { children?: ReactNode | ((onClose: () => void) => ReactNode) }) => (
    <>{typeof children === 'function' ? children(() => {}) : children}</>
  ),
  ModalHeader: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ModalBody: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ModalFooter: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

import { BulkActionDialog } from '../BulkActionDialog';

const t = (key: string) => key;

function bottle(id: string, tags: string[] | null): InventoryItem {
  return { id, tags, cellarId: null, isOpened: false, fillLevel: 100 } as unknown as InventoryItem;
}

function dialog(open: boolean, selectedItems: InventoryItem[]) {
  return (
    <BulkActionDialog open={open} onClose={() => {}} selectedItems={selectedItems} onApply={() => {}} t={t} />
  );
}

const tagsCheckbox = () => screen.getByRole('checkbox', { name: 'inventory.fields.tags' }) as HTMLInputElement;

describe('BulkActionDialog (#705)', () => {
  it('survives a cancel with "Tags" ticked followed by an emptied selection', () => {
    const selection = [bottle('b1', ['rouge', 'garde'])];
    const { rerender } = render(dialog(true, selection));
    fireEvent.click(tagsCheckbox());
    expect(tagsCheckbox().checked).toBe(true);
    expect(screen.getByText('garde, rouge')).toBeInTheDocument();

    // Cancel, then leave selection mode: the selection empties while closed.
    rerender(dialog(false, selection));
    expect(() => rerender(dialog(false, []))).not.toThrow();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('starts blank again when reopened after a cancel', () => {
    const selection = [bottle('b1', ['rouge'])];
    const { rerender } = render(dialog(true, selection));
    fireEvent.click(tagsCheckbox());
    expect(tagsCheckbox().checked).toBe(true);

    rerender(dialog(false, selection));
    rerender(dialog(true, selection));
    expect(tagsCheckbox().checked).toBe(false);
    expect(screen.queryByText('bulk.preview')).toBeNull();
  });

  it('previews tags of bottles that have none recorded (null) as empty', () => {
    render(dialog(true, [bottle('b1', null), bottle('b2', null)]));
    fireEvent.click(tagsCheckbox());
    const preview = screen.getByText('bulk.preview').parentElement as HTMLElement;
    // Before and after are both empty: no tags, and none typed yet.
    expect(within(preview).getAllByText(/status\.empty/)).toHaveLength(2);
  });

  it('shows mixed tags when the selected bottles differ, null counting as empty', () => {
    render(dialog(true, [bottle('b1', null), bottle('b2', ['rouge'])]));
    fireEvent.click(tagsCheckbox());
    expect(screen.getByText('bulk.mixed')).toBeInTheDocument();
  });
});
