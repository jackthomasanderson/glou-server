import React, { type ReactNode, type ReactElement } from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';

/**
 * Shared by the System configuration tests: a light stand-in for HeroUI
 * where every tab's content is rendered at once (no tab needs a click), and
 * a render inside a fresh React Query client that does not retry.
 * Used as `vi.mock('@heroui/react', async () => (await import('./configTestKit')).heroUiMock())`.
 */
export function heroUiMock() {
  const Box = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    Button: ({ children, onPress, isDisabled, isLoading, 'aria-label': ariaLabel }: { children?: ReactNode; onPress?: () => void; isDisabled?: boolean; isLoading?: boolean; 'aria-label'?: string }) => (
      <button type="button" aria-label={ariaLabel} aria-busy={isLoading || undefined} onClick={onPress} disabled={isDisabled}>{children}</button>
    ),
    Input: ({ label, placeholder, value, onValueChange }: { label?: string; placeholder?: string; value?: string; onValueChange?: (v: string) => void }) => (
      <input aria-label={label ?? placeholder} value={value ?? ''} onChange={(e) => onValueChange?.(e.target.value)} />
    ),
    Switch: ({ children, isSelected, isDisabled, onValueChange, 'aria-label': ariaLabel }: { children?: ReactNode; isSelected?: boolean; isDisabled?: boolean; onValueChange?: (v: boolean) => void; 'aria-label'?: string }) => (
      <label><input type="checkbox" role="switch" aria-label={ariaLabel} checked={!!isSelected} disabled={isDisabled} onChange={(e) => onValueChange?.(e.target.checked)} />{children}</label>
    ),
    Chip: Box,
    Skeleton: Box,
    Card: Box,
    CardBody: Box,
    // Says whether the real Tabs would keep the panels of the tabs not shown.
    Tabs: ({ children, destroyInactiveTabPanel }: { children?: ReactNode; destroyInactiveTabPanel?: boolean }) => (
      <div data-testid="config-tabs" data-keeps-inactive-panels={String(destroyInactiveTabPanel === false)}>{children}</div>
    ),
    Tab: ({ title, children }: { title?: ReactNode; children?: ReactNode }) => <section>{title}{children}</section>,
    // A native <select> built from the SelectItem children, so a test can choose an option.
    Select: ({ label, description, children, selectedKeys, onSelectionChange }: { label?: ReactNode; description?: ReactNode; children?: ReactNode; selectedKeys?: Iterable<string>; onSelectionChange?: (keys: Set<string>) => void }) => {
      const items = React.Children.toArray(children) as ReactElement[];
      const key = (item: ReactElement) => String(item.key).replace(/^\.\$/, '');
      return (
        <div>{label}
          {items.length > 0 && (
            <select aria-label={typeof label === 'string' ? label : undefined} value={Array.from(selectedKeys ?? [])[0]} onChange={(e) => onSelectionChange?.(new Set([e.target.value]))}>
              {items.map((item) => <option key={key(item)} value={key(item)}>{(item.props as { children?: ReactNode }).children}</option>)}
            </select>
          )}
          {description}
        </div>
      );
    },
    SelectItem: () => null,
    ModalContent: ({ children }: { children?: ReactNode | ((onClose: () => void) => ReactNode) }) => (
      <>{typeof children === 'function' ? children(() => {}) : children}</>
    ),
    ModalHeader: Box,
    ModalBody: Box,
    ModalFooter: Box,
  };
}

export function renderWithQuery(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return { queryClient, ...render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>) };
}

export type Answer = { status: number; body: unknown };

/** A fetch answering by "METHOD path" (GET by default), then a 500 for anything else. */
export function stubFetch(routes: Record<string, Answer | (() => Answer)>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace(/^.*\/api/, '');
    const method = init?.method ?? 'GET';
    const route = routes[`${method} ${path}`] ?? (method === 'GET' ? routes[path] : undefined);
    const answer: Answer = typeof route === 'function' ? route() : route ?? { status: 500, body: { error: 'INTERNAL_SERVER_ERROR' } };
    return {
      ok: answer.status >= 200 && answer.status < 300,
      status: answer.status,
      headers: new Headers(),
      json: async () => answer.body,
      blob: async () => new Blob(['dump']),
    } as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** The JSON bodies sent to `path` with a non-GET method. */
export function sentTo(fetchMock: ReturnType<typeof stubFetch>, path: string) {
  return fetchMock.mock.calls
    .filter(([u, init]) => String(u).endsWith(`/api${path}`) && init?.method && init.method !== 'GET')
    .map(([, init]) => JSON.parse(String(init!.body)));
}

export const CONFIG = {
  smtpEnabled: true, smtpHost: 'mail.home', smtpPort: 587, smtpUser: null, smtpPassMasked: null, smtpFrom: null, smtpSecure: true,
  gotifyEnabled: false, gotifyUrl: null, gotifyTokenMasked: null,
  logRetentionDays: 90, sessionRetentionDays: 30, guestShareRetentionDays: 30,
  publicUrl: null, effectivePublicUrl: 'http://localhost:3000',
  registrationOpen: false, backupEnabled: true, backupRetentionDays: 7, backupHour: 3, timeZone: 'UTC',
  updatedAt: null, updatedBy: null,
};
