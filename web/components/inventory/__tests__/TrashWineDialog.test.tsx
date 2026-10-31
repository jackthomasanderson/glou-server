import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { openedBottle, product, unit } from '@/lib/products/__tests__/factories';
import { frenchT } from '@/lib/products/__tests__/i18n';

// #471 §10.4.7: a wine goes to the trash with all its bottles only once
// confirmed with the total; its tastings go when the trash is emptied (QP7).

const detail = vi.hoisted(() => ({ tastings: [] as unknown[], id: 'p1' }));
vi.mock('@/hooks/useProducts', () => ({ useProductDetail: () => ({ data: detail }) }));
vi.mock('@/components/ui/ResponsiveModal', () => ({
  ResponsiveModal: ({ isOpen, children }: { isOpen?: boolean; children?: ReactNode }) =>
    isOpen ? <div role="dialog">{children}</div> : null,
}));
vi.mock('@heroui/react', () => ({
  Button: ({ children, onPress, isDisabled }: { children?: ReactNode; onPress?: () => void; isDisabled?: boolean }) => (
    <button type="button" onClick={onPress} disabled={isDisabled}>{children}</button>
  ),
  ModalContent: ({ children }: { children?: ReactNode | ((onClose: () => void) => ReactNode) }) => (
    <>{typeof children === 'function' ? children(() => {}) : children}</>
  ),
  ModalHeader: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ModalBody: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  ModalFooter: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

import { TrashWineDialog } from '../TrashWineDialog';

let t: Awaited<ReturnType<typeof frenchT>>;
beforeAll(async () => { t = await frenchT(); });

describe('TrashWineDialog', () => {
  it('asks with the wine and its total, and trashes only on confirmation', () => {
    detail.tastings = [];
    const onConfirm = vi.fn();
    const wine = product({ items: [unit({ quantity: 8 }), openedBottle(60)] });
    render(<TrashWineDialog product={wine} onConfirm={onConfirm} onClose={vi.fn()} isPending={false} t={t} />);
    expect(screen.getByTestId('trash-wine-question').textContent).toBe('Mettre Cuvée X 2020 et ses 9 bouteilles à la corbeille ?');
    expect(screen.queryByRole('note')).toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Mettre à la corbeille' }));
    expect(onConfirm).toHaveBeenCalledWith(wine);
  });

  it('warns that its tastings will be erased when the trash is emptied', () => {
    detail.tastings = [{}, {}];
    render(<TrashWineDialog product={product({ items: [] })} onConfirm={vi.fn()} onClose={vi.fn()} isPending={false} t={t} />);
    expect(screen.getByTestId('trash-wine-question').textContent).toBe('Mettre Cuvée X 2020 à la corbeille ?');
    expect(screen.getByRole('note').textContent).toBe('Ses 2 dégustations seront effacées quand la corbeille sera vidée.');
  });

  it('counts cigars for a cigar', () => {
    detail.tastings = [];
    render(
      <TrashWineDialog
        product={product({ category: 'cigar', vintage: null, name: 'Robusto', items: [unit({ quantity: 2, cigarsPerBox: 25 })] })}
        onConfirm={vi.fn()} onClose={vi.fn()} isPending={false} t={t}
      />,
    );
    expect(screen.getByTestId('trash-wine-question').textContent).toBe('Mettre Robusto et ses 50 cigares à la corbeille ?');
  });
});
