import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
const getVersion = vi.fn();
vi.mock('@/lib/config/client', () => ({ configClient: { getVersion: () => getVersion() } }));
const copyText = vi.fn().mockResolvedValue(true);
vi.mock('@/lib/clipboard', () => ({ copyText: (v: string) => copyText(v) }));

import { AppVersion } from './AppVersion';

function renderIt() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><AppVersion /></QueryClientProvider>);
}

describe('AppVersion (#696)', () => {
  beforeEach(() => { getVersion.mockReset(); copyText.mockClear(); });

  it('shows the running version and copies it', async () => {
    getVersion.mockResolvedValue({ version: '2026.11.2' });
    renderIt();
    expect(await screen.findByText('2026.11.2')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'actions.copy' }));
    await waitFor(() => expect(copyText).toHaveBeenCalledWith('2026.11.2'));
  });

  it('shows a fallback text, not an endless skeleton, when the request fails', async () => {
    getVersion.mockRejectedValue(new Error('network'));
    renderIt();
    expect(await screen.findByText('profile.version.unavailable')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'actions.copy' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
