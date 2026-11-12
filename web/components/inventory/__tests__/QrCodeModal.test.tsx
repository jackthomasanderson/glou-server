import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';

// #625: the browser draws the QR code; it encodes the instance's public
// address when one is configured, its own address (plus a warning on
// localhost) otherwise.

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
const getVersion = vi.fn();
vi.mock('@/lib/config/client', () => ({ configClient: { getVersion: () => getVersion() } }));
vi.mock('qrcode.react', () => ({
  QRCodeCanvas: ({ value }: { value: string }) => <div data-testid="qr" data-value={value} />,
}));
vi.mock('@/components/ui/ResponsiveModal', () => ({
  ResponsiveModal: ({ isOpen, children }: { isOpen?: boolean; children?: ReactNode }) =>
    isOpen ? <div role="dialog">{children}</div> : null,
}));
vi.mock('@heroui/react', async (importOriginal) => {
  const Box = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    ...(await importOriginal<typeof import('@heroui/react')>()),
    ModalContent: Box,
    ModalHeader: Box,
    ModalBody: Box,
    ModalFooter: Box,
  };
});

import { QrCodeModal } from '../QrCodeModal';

function renderIt() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <QrCodeModal isOpen onClose={() => {}} itemId="b1" itemName="Château Test" />
    </QueryClientProvider>,
  );
}

describe('QrCodeModal (#625)', () => {
  beforeEach(() => { getVersion.mockReset(); });
  afterEach(() => { onlineManager.setOnline(true); });

  it('encodes the configured public address, with no localhost warning', async () => {
    getVersion.mockResolvedValue({ version: '1', publicUrl: 'https://cave.example.org/' });
    renderIt();
    const qr = await screen.findByTestId('qr');
    expect(qr.getAttribute('data-value')).toBe('https://cave.example.org/bottles?scan=b1');
    expect(screen.getByText('https://cave.example.org/bottles?scan=b1')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('falls back to the current address and warns on localhost when none is configured', async () => {
    getVersion.mockResolvedValue({ version: '1', publicUrl: null });
    renderIt();
    const qr = await screen.findByTestId('qr');
    expect(qr.getAttribute('data-value')).toBe(`${window.location.origin}/bottles?scan=b1`);
    expect(screen.getByRole('alert').textContent).toBe('qr.localhostWarning');
  });

  it('offline, still shows the QR code with the current address', async () => {
    onlineManager.setOnline(false);
    getVersion.mockRejectedValue(new Error('offline'));
    renderIt();
    const qr = await screen.findByTestId('qr', {}, { timeout: 4000 });
    expect(qr.getAttribute('data-value')).toBe(`${window.location.origin}/bottles?scan=b1`);
  });

  it('falls back to the current address when the server cannot be reached', async () => {
    getVersion.mockRejectedValue(new Error('offline'));
    renderIt();
    // One retry (about a second) before falling back.
    const qr = await screen.findByTestId('qr', {}, { timeout: 4000 });
    expect(qr.getAttribute('data-value')).toBe(`${window.location.origin}/bottles?scan=b1`);
  });
});
