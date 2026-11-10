import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithQuery, CONFIG } from '../../__tests__/configTestKit';

// #617: the "Access mode" setting was saved and shown back but changed
// nothing; the card now only holds the public URL, its summary and the check.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));
vi.mock('@/lib/toast', () => ({ notifySuccess: vi.fn(), notifyError: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({
  useMe: () => ({ data: { id: 'a1', isTwoFactorEnabled: false }, refetch: vi.fn() }),
}));
vi.mock('@/components/ui/ResponsiveModal', () => ({ ResponsiveModal: () => null }));
vi.mock('@heroui/react', async () => (await import('../../__tests__/configTestKit')).heroUiMock());

import { PublicUrlCard } from './PublicUrlCard';

describe('PublicUrlCard', () => {
  it('shows the public URL and its summary, but no access mode', () => {
    const { container } = renderWithQuery(<PublicUrlCard config={CONFIG as never} />);
    expect(screen.getByLabelText('adminConfig.network.publicUrl')).toBeTruthy();
    expect(screen.getByText('http://localhost:3000')).toBeTruthy();
    expect(screen.getByText('adminConfig.network.check.button')).toBeTruthy();
    expect(container.textContent).not.toMatch(/accessMode/);
  });
});
