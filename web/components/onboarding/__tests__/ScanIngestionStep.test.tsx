import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// #574: the scan step was the scanner alone. Closing it skipped straight to the
// summary, and behind it the wizard card stayed blank, with no way back to the
// choice of method. The step now has the same shape as manual entry.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) => (o?.count !== undefined ? `${k}|${o.count}` : k),
  }),
}));

let scanFlowProps: { open: boolean; defaultCellarId?: string | null; onItemCommitted?: () => void } | undefined;
vi.mock('@/components/inventory/ScanFlow', () => ({
  ScanFlow: (props: { open: boolean; onClose: () => void; defaultCellarId?: string | null; onItemCommitted?: () => void }) => {
    scanFlowProps = props;
    return props.open ? (
      <div role="dialog" aria-label="scanner">
        <button type="button" onClick={props.onClose}>close scanner</button>
      </div>
    ) : null;
  },
}));

import { ScanIngestionStep } from '../steps/ScanIngestionStep';

const onItemAdded = vi.fn();
const onDone = vi.fn();
const onBack = vi.fn();

function renderStep(itemsAdded = 0) {
  render(
    <ScanIngestionStep
      cellarId="cellar-1"
      itemsAdded={itemsAdded}
      onItemAdded={onItemAdded}
      onDone={onDone}
      onBack={onBack}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  scanFlowProps = undefined;
});

describe('ScanIngestionStep (#574)', () => {
  it('offers a way back to the choice of method', () => {
    renderStep();
    expect(screen.getByText('onboarding.scan.title')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'onboarding.back' }));
    expect(onBack).toHaveBeenCalledOnce();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('opens the scanner on demand, and closing it comes back to the step', () => {
    renderStep();
    expect(screen.queryByRole('dialog', { name: 'scanner' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'scan.launchButton' }));
    expect(screen.getByRole('dialog', { name: 'scanner' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'close scanner' }));
    expect(screen.queryByRole('dialog', { name: 'scanner' })).toBeNull();
    expect(screen.getByText('onboarding.scan.title')).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('files scanned items in the wizard cellar and counts them', () => {
    renderStep();
    expect(scanFlowProps?.defaultCellarId).toBe('cellar-1');
    scanFlowProps?.onItemCommitted?.();
    expect(onItemAdded).toHaveBeenCalledOnce();
  });

  it('shows how many items were added so far, then continues to the summary', () => {
    renderStep(2);
    expect(screen.getByText('onboarding.scan.itemsAdded|2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'onboarding.scan.doneButton' }));
    expect(onDone).toHaveBeenCalledOnce();
  });
});
