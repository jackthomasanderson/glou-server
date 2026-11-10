import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, fireEvent, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { notifyError, notifySuccess } from '@/lib/toast';
import { renderWithQuery, stubFetch, sentTo, CONFIG, type Answer } from './configTestKit';

// #758: email and Gotify were switched on in two tabs that saved separately,
// so saving one could put back what the other had just changed; tests ran on
// the saved settings whatever the screen showed, and a refusal read "Network
// error". Each channel now has one card: its only switch, its settings, its
// test, and its saved state.

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
import { portForSecurity } from '../config/notifications/EmailChannelCard';

const ok = (data: unknown): Answer => ({ status: 200, body: { data } });

async function card(title: string) {
  return (await screen.findByRole('heading', { name: title })).closest('section')!;
}

/** The step-up dialog (#890), confirmed with the admin's password. */
function confirmStepUp() {
  fireEvent.change(screen.getByLabelText('admin.users.stepUpPassword'), { target: { value: 'pw' } });
  fireEvent.click(screen.getByRole('button', { name: 'actions.confirm' }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('SystemConfigSection — one card per notification channel (#758)', () => {
  it('has exactly one on/off switch per channel', async () => {
    stubFetch({ '/admin/config': ok(CONFIG) });
    renderWithQuery(<SystemConfigSection />);
    await card('adminConfig.cards.email');
    for (const name of ['adminConfig.notifPolicy.inApp', 'adminConfig.smtp.enabled', 'adminConfig.gotify.enabled']) {
      expect(screen.getAllByRole('switch', { name })).toHaveLength(1);
    }
    expect(within(await card('adminConfig.cards.gotify')).getByRole('switch', { name: 'adminConfig.gotify.enabled' })).toBeInTheDocument();
    expect(within(await card('adminConfig.cards.email')).getByRole('switch', { name: 'adminConfig.smtp.enabled' })).toBeInTheDocument();
  });

  it('never brings back a channel switched off in its card when another card is saved', async () => {
    const emailOff = { ...CONFIG, smtpEnabled: false };
    const fetchMock = stubFetch({
      '/admin/config': ok(CONFIG),
      'PUT /admin/config/smtp': ok(emailOff),
      'PUT /admin/config/notifications': ok({ ...emailOff, inAppEnabled: false }),
    });
    renderWithQuery(<SystemConfigSection />);
    const email = await card('adminConfig.cards.email');
    fireEvent.click(within(email).getByRole('switch', { name: 'adminConfig.smtp.enabled' }));
    fireEvent.click(within(email).getByRole('button', { name: 'adminConfig.save' }));
    confirmStepUp();
    await vi.waitFor(() => expect(notifySuccess).toHaveBeenCalledWith('adminConfig.smtp.saved'));

    const inApp = await card('adminConfig.cards.inApp');
    fireEvent.click(within(inApp).getByRole('switch', { name: 'adminConfig.notifPolicy.inApp' }));
    fireEvent.click(within(inApp).getByRole('button', { name: 'adminConfig.save' }));
    confirmStepUp();

    // Only its own switch: a stale copy of another one can never overwrite it.
    await vi.waitFor(() => expect(sentTo(fetchMock, '/admin/config/notifications')).toEqual([
      { inAppEnabled: false, password: 'pw' },
    ]));
  });

  it('saves Gotify with its own switch, URL and token', async () => {
    const fetchMock = stubFetch({ '/admin/config': ok(CONFIG), 'PUT /admin/config/gotify': ok({ ...CONFIG, gotifyEnabled: true, gotifyUrl: 'https://gotify.example.com', gotifyTokenMasked: '••••' }) });
    renderWithQuery(<SystemConfigSection />);
    const gotify = await card('adminConfig.cards.gotify');
    fireEvent.change(within(gotify).getByLabelText('adminConfig.gotify.url'), { target: { value: 'https://gotify.example.com' } });
    fireEvent.change(within(gotify).getByLabelText('adminConfig.gotify.token'), { target: { value: 'APP-TOKEN' } });
    fireEvent.click(within(gotify).getByRole('switch', { name: 'adminConfig.gotify.enabled' }));
    fireEvent.click(within(gotify).getByRole('button', { name: 'adminConfig.save' }));
    confirmStepUp();

    await vi.waitFor(() => expect(sentTo(fetchMock, '/admin/config/gotify')).toEqual([
      expect.objectContaining({ gotifyEnabled: true, gotifyUrl: 'https://gotify.example.com', gotifyToken: 'APP-TOKEN' }),
    ]));
  });

  // #767: every member's Gotify notification goes to this server.
  it('cannot switch Gotify on until its URL and token are filled in', async () => {
    stubFetch({ '/admin/config': ok(CONFIG) });
    renderWithQuery(<SystemConfigSection />);
    const gotify = await card('adminConfig.cards.gotify');
    const toggle = () => within(gotify).getByRole('switch', { name: 'adminConfig.gotify.enabled' });

    expect(toggle()).toBeDisabled();
    expect(within(gotify).getByText('adminConfig.gotify.needsUrlAndToken')).toBeInTheDocument();
    fireEvent.change(within(gotify).getByLabelText('adminConfig.gotify.url'), { target: { value: 'https://gotify.example.com' } });
    expect(toggle()).toBeDisabled();
    fireEvent.change(within(gotify).getByLabelText('adminConfig.gotify.token'), { target: { value: 'APP-TOKEN' } });
    expect(toggle()).toBeEnabled();
  });

  it('can always switch Gotify off', async () => {
    stubFetch({ '/admin/config': ok({ ...CONFIG, gotifyEnabled: true, gotifyUrl: null, gotifyTokenMasked: null }) });
    renderWithQuery(<SystemConfigSection />);
    const gotify = await card('adminConfig.cards.gotify');

    expect(within(gotify).getByRole('switch', { name: 'adminConfig.gotify.enabled' })).toBeEnabled();
  });

  it('says in words that Gotify was refused for lack of URL or token', async () => {
    stubFetch({ '/admin/config': ok({ ...CONFIG, gotifyUrl: 'https://g.example.com', gotifyTokenMasked: '••••' }), 'PUT /admin/config/gotify': { status: 400, body: { error: 'GOTIFY_INCOMPLETE' } } });
    renderWithQuery(<SystemConfigSection />);
    const gotify = await card('adminConfig.cards.gotify');
    fireEvent.click(within(gotify).getByRole('switch', { name: 'adminConfig.gotify.enabled' }));
    fireEvent.click(within(gotify).getByRole('button', { name: 'adminConfig.save' }));
    confirmStepUp();

    await vi.waitFor(() => expect(notifyError).toHaveBeenCalledWith('adminConfig.errors.GOTIFY_INCOMPLETE'));
  });

  it('does not test settings that differ from the saved ones', async () => {
    stubFetch({ '/admin/config': ok(CONFIG) });
    renderWithQuery(<SystemConfigSection />);
    const email = await card('adminConfig.cards.email');
    expect(within(email).getByRole('button', { name: 'adminConfig.smtp.test' })).toBeEnabled();

    fireEvent.change(within(email).getByLabelText('adminConfig.smtp.host'), { target: { value: 'smtp.other' } });

    expect(within(email).getByRole('button', { name: 'adminConfig.smtp.test' })).toBeDisabled();
    expect(within(email).getByText('adminConfig.testUsesSaved')).toBeInTheDocument();
    const gotify = await card('adminConfig.cards.gotify');
    fireEvent.change(within(gotify).getByLabelText('adminConfig.gotify.url'), { target: { value: 'https://gotify.example.com' } });
    expect(within(gotify).getByRole('button', { name: 'adminConfig.gotify.test' })).toBeDisabled();
  });

  it('says in words that a Gotify test was refused because the channel is off', async () => {
    stubFetch({ '/admin/config': ok(CONFIG), 'POST /admin/config/test/gotify': { status: 400, body: { error: 'GOTIFY_NOT_CONFIGURED' } } });
    renderWithQuery(<SystemConfigSection />);
    fireEvent.click(within(await card('adminConfig.cards.gotify')).getByRole('button', { name: 'adminConfig.gotify.test' }));
    confirmStepUp();

    await vi.waitFor(() => expect(notifyError).toHaveBeenCalledWith('adminConfig.errors.GOTIFY_NOT_CONFIGURED'));
  });

  it('says in words that an email test was refused because the channel is off', async () => {
    stubFetch({ '/admin/config': ok(CONFIG), 'POST /admin/config/test/smtp': ok({ success: false, error: 'SMTP_NOT_CONFIGURED' }) });
    renderWithQuery(<SystemConfigSection />);
    fireEvent.click(within(await card('adminConfig.cards.email')).getByRole('button', { name: 'adminConfig.smtp.test' }));
    confirmStepUp();

    await vi.waitFor(() => expect(notifyError).toHaveBeenCalledWith('adminConfig.errors.SMTP_NOT_CONFIGURED'));
  });

  it.each([
    [{ smtpEnabled: true, smtpHost: 'mail.home' }, 'adminConfig.cards.email', 'adminConfig.channelStatus.active'],
    [{ smtpEnabled: false, smtpHost: 'mail.home' }, 'adminConfig.cards.email', 'adminConfig.channelStatus.configuredOff'],
    [{ smtpEnabled: true, smtpHost: null }, 'adminConfig.cards.email', 'adminConfig.channelStatus.notConfigured'],
    [{ gotifyEnabled: true, gotifyUrl: 'https://g.example.com', gotifyTokenMasked: '••••' }, 'adminConfig.cards.gotify', 'adminConfig.channelStatus.active'],
    [{ gotifyEnabled: false, gotifyUrl: 'https://g.example.com', gotifyTokenMasked: '••••' }, 'adminConfig.cards.gotify', 'adminConfig.channelStatus.configuredOff'],
    [{ gotifyEnabled: true, gotifyUrl: 'https://g.example.com', gotifyTokenMasked: null }, 'adminConfig.cards.gotify', 'adminConfig.channelStatus.notConfigured'],
    [{ gotifyEnabled: false, gotifyUrl: null }, 'adminConfig.cards.gotify', 'adminConfig.channelStatus.notConfigured'],
    [{ inAppEnabled: false }, 'adminConfig.cards.inApp', 'adminConfig.channelStatus.off'],
  ])('with %o, the %s card says %s', async (saved, title, status) => {
    stubFetch({ '/admin/config': ok({ ...CONFIG, ...saved }) });
    renderWithQuery(<SystemConfigSection />);
    expect(within(await card(title)).getByText(status)).toBeInTheDocument();
  });
});

describe('SystemConfigSection — each test button has its own progress (#759)', () => {
  it('shows only the clicked email test as running, and blocks the other meanwhile', async () => {
    let answer: (a: Answer) => void = () => {};
    stubFetch({ '/admin/config': ok(CONFIG), 'POST /admin/config/test/smtp': () => ok({ success: true }) });
    // The connection test hangs until released.
    const fetchMock = vi.mocked(fetch);
    const base = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input, init) => {
      if (String(input).endsWith('/admin/config/test/smtp')) {
        const a = await new Promise<Answer>((resolve) => { answer = resolve; });
        return { ok: true, status: 200, headers: new Headers(), json: async () => a.body } as Response;
      }
      return base(input, init);
    });
    renderWithQuery(<SystemConfigSection />);
    const email = await card('adminConfig.cards.email');
    fireEvent.change(within(email).getByLabelText('adminConfig.smtp.testRecipient'), { target: { value: 'me@example.com' } });
    fireEvent.click(within(email).getByRole('button', { name: 'adminConfig.smtp.test' }));
    confirmStepUp();

    await vi.waitFor(() => expect(within(email).getByRole('button', { name: 'adminConfig.smtp.test' })).toHaveAttribute('aria-busy', 'true'));
    const sendTest = within(email).getAllByRole('button', { name: 'adminConfig.smtp.sendTest' })[0];
    expect(sendTest).not.toHaveAttribute('aria-busy');
    expect(sendTest).toBeDisabled();

    answer(ok({ success: true }));
    await vi.waitFor(() => expect(notifySuccess).toHaveBeenCalledWith('adminConfig.smtp.testSuccess'));
  });
});

describe('SystemConfigSection — email card wording and security (#763, #764)', () => {
  it('labels the test recipient field apart from its button', async () => {
    stubFetch({ '/admin/config': ok(CONFIG) });
    renderWithQuery(<SystemConfigSection />);
    const email = await card('adminConfig.cards.email');
    expect(within(email).getByLabelText('adminConfig.smtp.testRecipient')).toBeInTheDocument();
    expect(within(email).getByRole('button', { name: 'adminConfig.smtp.sendTest' })).toBeInTheDocument();
  });

  it('moves the port with the security mode only while it is a default', () => {
    expect(portForSecurity('587', true)).toBe('465');
    expect(portForSecurity('', true)).toBe('465');
    expect(portForSecurity('465', false)).toBe('587');
    expect(portForSecurity('', false)).toBe('587');
    expect(portForSecurity('2525', true)).toBe('2525');
    expect(portForSecurity('2525', false)).toBe('2525');
    expect(portForSecurity('587', false)).toBe('587');
  });

  it('warns when the saved port and security do not match, and not otherwise', async () => {
    // The fixture is the old default: port 587 with TLS (implicit).
    stubFetch({ '/admin/config': ok(CONFIG) });
    renderWithQuery(<SystemConfigSection />);
    const email = await card('adminConfig.cards.email');
    expect(within(email).getByText('adminConfig.smtp.mismatch.tlsOn587')).toBeInTheDocument();
    fireEvent.change(within(email).getByLabelText('adminConfig.smtp.secure'), { target: { value: 'starttls' } });
    expect(within(email).queryByText(/adminConfig\.smtp\.mismatch/)).toBeNull();
    fireEvent.change(within(email).getByLabelText('adminConfig.smtp.port'), { target: { value: '465' } });
    expect(within(email).getByText('adminConfig.smtp.mismatch.starttlsOn465')).toBeInTheDocument();
  });

  it('choosing TLS moves the default port to 465 and saves smtpSecure true', async () => {
    const saved = { ...CONFIG, smtpSecure: true, smtpPort: 465 };
    const fetchMock = stubFetch({ '/admin/config': ok({ ...CONFIG, smtpSecure: false }), 'PUT /admin/config/smtp': ok(saved) });
    renderWithQuery(<SystemConfigSection />);
    const email = await card('adminConfig.cards.email');
    const security = within(email).getByLabelText('adminConfig.smtp.secure') as HTMLSelectElement;
    expect(security.value).toBe('starttls');
    fireEvent.change(security, { target: { value: 'tls' } });
    expect(within(email).getByLabelText('adminConfig.smtp.port')).toHaveValue('465');
    fireEvent.click(within(email).getByRole('button', { name: 'adminConfig.save' }));
    confirmStepUp();
    await vi.waitFor(() => expect(notifySuccess).toHaveBeenCalledWith('adminConfig.smtp.saved'));
    expect(sentTo(fetchMock, '/admin/config/smtp')[0]).toEqual(expect.objectContaining({ smtpSecure: true, smtpPort: 465 }));
  });
});
