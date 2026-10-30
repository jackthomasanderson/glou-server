import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

// #669 — GET /api/admin/backups/health answered without the `data` envelope the
// web client unwraps, the resulting error was swallowed, and the "backups folder
// not writable" banner could never show. Only fetch is stubbed here: the real
// config client and response handling run, fed with the API's actual answer.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));
vi.mock('@/hooks/useHasMounted', () => ({ useHasMounted: () => true }));
vi.mock('@/hooks/useScan', () => ({ useScanStatus: () => ({ data: undefined }) }));
// Closed modals render nothing, like HeroUI's.
vi.mock('@/components/ui/ResponsiveModal', () => ({
  ResponsiveModal: ({ isOpen, children }: { isOpen?: boolean; children?: ReactNode }) =>
    isOpen ? <div role="dialog">{children}</div> : null,
}));
// Every tab's content is rendered at once, so the Backups tab needs no click.
vi.mock('@heroui/react', () => {
  const Box = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    Button: ({ children, onPress }: { children?: ReactNode; onPress?: () => void }) => (
      <button type="button" onClick={onPress}>{children}</button>
    ),
    Input: ({ label }: { label?: string }) => <input aria-label={label} />,
    Switch: ({ children }: { children?: ReactNode }) => <label>{children}</label>,
    Chip: Box,
    Skeleton: Box,
    Tabs: Box,
    Tab: ({ title, children }: { title?: ReactNode; children?: ReactNode }) => <section>{title}{children}</section>,
    Select: ({ label }: { label?: ReactNode }) => <div>{label}</div>,
    SelectItem: () => null,
    ModalContent: ({ children }: { children?: ReactNode | ((onClose: () => void) => ReactNode) }) => (
      <>{typeof children === 'function' ? children(() => {}) : children}</>
    ),
    ModalHeader: Box,
    ModalBody: Box,
    ModalFooter: Box,
  };
});

import { SystemConfigSection } from '../SystemConfigSection';

/** Answers the health route with `health`, every other admin call with a 500 (ignored by the page). */
function stubApi(health: { status: number; body: unknown }) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const { status, body } = String(input).endsWith('/api/admin/backups/health')
      ? health
      : { status: 500, body: { error: 'INTERNAL_SERVER_ERROR' } };
    return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
  }));
}

/** Waits for the page to leave its loading skeleton. */
const loaded = () => screen.findByText('adminConfig.backup.runNow.title');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SystemConfigSection — backups folder health (#669)', () => {
  it('shows the warning banner when the API cannot write to the backups folder', async () => {
    stubApi({ status: 200, body: { data: { directoryWritable: false } } });
    render(<SystemConfigSection />);

    const banner = await screen.findByText('adminConfig.backup.dirNotWritable');
    expect(banner.closest('[role="alert"]')).not.toBeNull();
    expect(screen.queryByText('adminConfig.backup.dirCheckFailed')).toBeNull();
  });

  it('shows no banner when the folder is writable', async () => {
    stubApi({ status: 200, body: { data: { directoryWritable: true } } });
    render(<SystemConfigSection />);
    await loaded();
    // let the health call settle
    await new Promise((r) => setTimeout(r, 20));

    expect(screen.queryByText('adminConfig.backup.dirNotWritable')).toBeNull();
    expect(screen.queryByText('adminConfig.backup.dirCheckFailed')).toBeNull();
  });

  it('says so when the check itself fails, instead of staying silent', async () => {
    stubApi({ status: 500, body: { error: 'INTERNAL_SERVER_ERROR' } });
    render(<SystemConfigSection />);

    const banner = await screen.findByText('adminConfig.backup.dirCheckFailed');
    expect(banner.closest('[role="alert"]')).not.toBeNull();
    expect(screen.queryByText('adminConfig.backup.dirNotWritable')).toBeNull();
  });

  it('does not silently ignore an answer without the data envelope (the shape before the fix)', async () => {
    stubApi({ status: 200, body: { directoryWritable: false } });
    render(<SystemConfigSection />);

    expect(await screen.findByText('adminConfig.backup.dirCheckFailed')).toBeInTheDocument();
  });
});
