import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, fireEvent, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { notifySuccess } from '@/lib/toast';
import { renderWithQuery, stubFetch, CONFIG, type Answer } from './configTestKit';

// #759: seven different "Save" buttons, nothing showing that a tab held
// unsaved values, and those values lost without a word when the page was
// left or reloaded.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));
vi.mock('@/hooks/useHasMounted', () => ({ useHasMounted: () => true }));
vi.mock('@/hooks/useScan', () => ({ useScanStatus: () => ({ data: undefined }) }));
vi.mock('@/lib/toast', () => ({ notifySuccess: vi.fn(), notifyError: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useMe: () => ({ data: { id: 'a1', isTwoFactorEnabled: false }, refetch: () => {} }) }));
vi.mock('@/components/ui/ResponsiveModal', () => ({
  ResponsiveModal: ({ isOpen, children }: { isOpen?: boolean; children?: ReactNode }) =>
    isOpen ? <div role="dialog">{children}</div> : null,
}));
vi.mock('@heroui/react', async () => (await import('./configTestKit')).heroUiMock());

import { SystemConfigSection } from '../SystemConfigSection';

const ok = (data: unknown): Answer => ({ status: 200, body: { data } });

async function card(title: string) {
  return (await screen.findByRole('heading', { name: title })).closest('section')!;
}
/** The title of the tab named `key` (the test HeroUI renders it as a span). */
const tabTitle = (key: string) => screen.getByText(`adminConfig.tabs.${key}`).closest('span')!;

const unload = () => {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event;
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('SystemConfigSection — saving and unsaved changes (#759)', () => {
  it('has one "Save" wording for every card that saves settings', async () => {
    stubFetch({ '/admin/config': ok(CONFIG) });
    renderWithQuery(<SystemConfigSection />);
    await card('adminConfig.cards.email');
    const saves = screen.getAllByRole('button').filter((b) => /\.save$/.test(b.textContent ?? ''));
    expect(saves.map((b) => b.textContent)).toEqual(Array(6).fill('adminConfig.save'));
  });

  it('marks an edited card and its tab, and only them, until the value is back', async () => {
    stubFetch({ '/admin/config': ok(CONFIG) });
    renderWithQuery(<SystemConfigSection />);
    const retention = await card('adminConfig.cards.retention');
    expect(within(retention).getByRole('button', { name: 'adminConfig.save' })).toBeDisabled();

    fireEvent.change(within(retention).getByLabelText('adminConfig.retention.fields.logRetentionDays'), { target: { value: '365' } });

    expect(within(retention).getByText('adminConfig.unsaved')).toBeInTheDocument();
    expect(within(retention).getByRole('button', { name: 'adminConfig.save' })).toBeEnabled();
    expect(within(tabTitle('data')).getByRole('img', { name: 'adminConfig.unsaved' })).toBeInTheDocument();
    for (const other of ['notifications', 'access', 'system']) {
      expect(within(tabTitle(other)).queryByRole('img', { name: 'adminConfig.unsaved' })).toBeNull();
    }

    fireEvent.change(within(retention).getByLabelText('adminConfig.retention.fields.logRetentionDays'), { target: { value: '90' } });

    expect(within(retention).queryByText('adminConfig.unsaved')).toBeNull();
    expect(within(tabTitle('data')).queryByRole('img', { name: 'adminConfig.unsaved' })).toBeNull();
  });

  it('clears the marks once the card is saved', async () => {
    stubFetch({ '/admin/config': ok(CONFIG), 'PUT /admin/config/retention': ok({ ...CONFIG, logRetentionDays: 365 }) });
    renderWithQuery(<SystemConfigSection />);
    const retention = await card('adminConfig.cards.retention');
    fireEvent.change(within(retention).getByLabelText('adminConfig.retention.fields.logRetentionDays'), { target: { value: '365' } });
    fireEvent.click(within(retention).getByRole('button', { name: 'adminConfig.save' }));

    await vi.waitFor(() => expect(notifySuccess).toHaveBeenCalledWith('adminConfig.retention.saved'));
    await vi.waitFor(() => expect(within(retention).queryByText('adminConfig.unsaved')).toBeNull());
    expect(within(retention).getByLabelText('adminConfig.retention.fields.logRetentionDays')).toHaveValue('365');
    expect(within(tabTitle('data')).queryByRole('img', { name: 'adminConfig.unsaved' })).toBeNull();
  });

  it('asks before the page is left or reloaded while a card holds unsaved changes', async () => {
    stubFetch({ '/admin/config': ok(CONFIG) });
    renderWithQuery(<SystemConfigSection />);
    const signUp = await card('adminConfig.registration.title');
    expect(unload().defaultPrevented).toBe(false);

    fireEvent.click(within(signUp).getByRole('switch'));

    expect(unload().defaultPrevented).toBe(true);
  });

  it('keeps the tabs not shown mounted, so switching tabs keeps what was typed', async () => {
    stubFetch({ '/admin/config': ok(CONFIG) });
    renderWithQuery(<SystemConfigSection />);
    await card('adminConfig.cards.email');
    expect(screen.getByTestId('config-tabs')).toHaveAttribute('data-keeps-inactive-panels', 'true');
  });
});
