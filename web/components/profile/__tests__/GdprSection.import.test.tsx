import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';

// #641 (item 4): a file could only be imported from the first-run wizard.
// The profile's data section, next to "Export my cellar (CSV)", imports one too.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) => (o ? [k, ...Object.values(o)].join('|') : k),
    i18n: { language: 'fr' },
  }),
}));
vi.mock('@/hooks/useCsvExport', () => ({ useCsvExport: () => ({ mutate: vi.fn(), isPending: false }) }));
vi.mock('@/hooks/useAuth', () => ({
  useExportData: () => ({ mutate: vi.fn(), isPending: false }),
  useRequestAccountDeletion: () => ({ mutate: vi.fn(), isPending: false }),
  useCancelAccountDeletion: () => ({ mutate: vi.fn(), isPending: false }),
}));
// Closed modals render nothing, like HeroUI's.
vi.mock('@/components/ui/ResponsiveModal', () => ({
  ResponsiveModal: ({ isOpen, children }: { isOpen?: boolean; children?: ReactNode }) =>
    isOpen ? <div role="dialog">{children}</div> : null,
}));
vi.mock('@heroui/react', async (importActual) => {
  const actual = await importActual<typeof import('@heroui/react')>();
  const Box = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return { ...actual, ModalContent: Box, ModalHeader: Box, ModalBody: Box, ModalFooter: Box };
});
const { notifySuccess } = vi.hoisted(() => ({ notifySuccess: vi.fn() }));
vi.mock('@/lib/toast', () => ({ notifySuccess, notifyError: vi.fn() }));
vi.mock('@/components/onboarding/steps/CsvImportStep', () => ({
  CsvImportStep: ({ cellarId, onImported, onBack, backLabel }: {
    cellarId: string | null; onImported: (result: unknown) => void; onBack: () => void; backLabel?: string;
  }) => (
    <div data-testid="csv-import">
      <p>{`cellar ${cellarId}`}</p>
      <button type="button" onClick={() => onImported({
        bottles: 12, wines: 3, cigars: 0, cigarReferences: 0, skippedLines: 0, staleLines: 0, createdCellars: [],
      })}>import</button>
      <button type="button" onClick={onBack}>{backLabel}</button>
    </div>
  ),
}));

import { GdprSection } from '../GdprSection';

const user = { id: 'u1', deletionRequestedAt: null } as never;

describe('GdprSection — "Importer un fichier" (#641)', () => {
  it('opens the file import outside the wizard, without a cellar imposed', () => {
    render(<GdprSection user={user} />);
    fireEvent.click(screen.getByRole('button', { name: 'gdpr.importButton' }));
    expect(screen.getByTestId('csv-import')).toBeInTheDocument();
    expect(screen.getByText('cellar null')).toBeInTheDocument();
  });

  it('says what was imported and closes', () => {
    render(<GdprSection user={user} />);
    fireEvent.click(screen.getByRole('button', { name: 'gdpr.importButton' }));
    fireEvent.click(screen.getByRole('button', { name: 'import' }));
    expect(notifySuccess).toHaveBeenCalledWith('onboarding.summary.imported', {
      what: 'onboarding.summary.bottles|12 · onboarding.summary.wines|3',
    });
    expect(screen.queryByTestId('csv-import')).toBeNull();
  });

  it('"Annuler" closes it', () => {
    render(<GdprSection user={user} />);
    fireEvent.click(screen.getByRole('button', { name: 'gdpr.importButton' }));
    fireEvent.click(screen.getByRole('button', { name: 'actions.cancel' }));
    expect(screen.queryByTestId('csv-import')).toBeNull();
  });
});
