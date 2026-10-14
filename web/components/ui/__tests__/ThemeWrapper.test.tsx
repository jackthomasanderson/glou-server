import { describe, it, expect, vi, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ThemeWrapper } from '../ThemeWrapper';

// ─── GitHub issue #9 ────────────────────────────────────────────────────────
// A real component smoke test: this actually mounts ThemeWrapper into a jsdom
// document via react-dom and asserts on the resulting DOM, instead of just
// constructing a React element descriptor and reading its own props back
// (which is what PR #12 did — it never called render() at all and would pass
// even if the component threw during render).
//
// No @testing-library/react here on purpose: react-dom/client + act() is
// enough for a mount/unmount smoke test and avoids a second new dependency
// beyond jsdom.

let mockUser: { accentColor?: string; theme?: string; language?: string } | null = null;
let mockChangeLanguage = vi.fn();
let mockI18nLanguage = 'en';

vi.mock('@/hooks/useAuth', () => ({
  useMe: () => ({ data: mockUser }),
  // ISSUE_112: ThemeModeProvider persists an explicit toggle to the account.
  useUpdatePreferences: () => ({ mutate: vi.fn() }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: mockI18nLanguage, changeLanguage: mockChangeLanguage },
  }),
}));

let mockMounted = true;
vi.mock('@/hooks/useHasMounted', () => ({
  useHasMounted: () => mockMounted,
}));

// HeroUIProvider pulls in react-aria's overlay/focus-scope internals, which
// assume browser APIs jsdom doesn't implement (ResizeObserver, etc.).
// Mocked to a passthrough so this test exercises ThemeWrapper's own effects
// (the actual regression surface — accent color / theme class handling),
// not HeroUI's internals.
let lastHeroUIProps: Record<string, unknown> = {};
vi.mock('@heroui/react', () => ({
  HeroUIProvider: ({ children, ...props }: { children: ReactNode } & Record<string, unknown>) => {
    lastHeroUIProps = props;
    return children;
  },
}));

describe('ThemeWrapper', () => {
  let container: HTMLDivElement;
  let root: Root;

  function mount(children: ReactNode) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(<ThemeWrapper>{children}</ThemeWrapper>);
    });
  }

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.documentElement.style.cssText = '';
    document.documentElement.classList.remove('dark');
    document.documentElement.style.colorScheme = '';
    window.localStorage.clear();
    mockUser = null;
    mockMounted = true;
    mockChangeLanguage = vi.fn();
    mockI18nLanguage = 'en';
    document.documentElement.lang = '';
    lastHeroUIProps = {};
  });

  it('shows a visible placeholder, not a blank screen, until mounted (#210)', () => {
    mockMounted = false;
    mount(<span>content</span>);
    const placeholder = container.querySelector('[data-testid="app-boot-placeholder"]');
    expect(placeholder).not.toBeNull();
    expect(placeholder?.closest('.invisible')).toBeNull();
  });

  it('removes the placeholder once mounted', () => {
    mount(<span>content</span>);
    expect(container.querySelector('[data-testid="app-boot-placeholder"]')).toBeNull();
  });

  it('renders its children without crashing', () => {
    mount(<span>Hello</span>);
    expect(container.textContent).toBe('Hello');
  });

  it("sets --heroui-primary from the user's accent color", () => {
    mockUser = { accentColor: '#ff0000' };
    mount(<span>content</span>);
    const value = document.documentElement.style.getPropertyValue('--heroui-primary').trim();
    expect(value).toBe('0 100% 50%');
  });

  it('falls back to the default indigo accent (#6366f1) when the user has none', () => {
    mockUser = null;
    mount(<span>content</span>);
    const value = document.documentElement.style.getPropertyValue('--heroui-primary').trim();
    expect(value).toBe('239 84% 67%');
  });

  it('also derives the primary-50..900 shade scale from the accent color', () => {
    mockUser = { accentColor: '#ff0000' };
    mount(<span>content</span>);
    const shade700 = document.documentElement.style.getPropertyValue('--heroui-primary-700').trim();
    expect(shade700).not.toBe('');
    expect(shade700.startsWith('0 ')).toBe(true); // same hue, different lightness
  });

  it('adds the dark class to <html> when the user theme is dark', () => {
    mockUser = { theme: 'DARK' };
    mount(<span>content</span>);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('does not add the dark class when the user theme is light', () => {
    mockUser = { theme: 'LIGHT' };
    mount(<span>content</span>);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  // ISSUE_079: the server-rendered <html> is hardcoded lang="fr" — this is
  // the one place a real user's preference ever gets to correct it.
  it("syncs <html lang> to the user's language preference", () => {
    mockUser = { language: 'EN' };
    mount(<span>content</span>);
    expect(document.documentElement.lang).toBe('en');
  });

  it('does not touch <html lang> when the user has no language preference', () => {
    document.documentElement.lang = 'fr';
    mockUser = null;
    mount(<span>content</span>);
    expect(document.documentElement.lang).toBe('fr');
  });

  // ISSUE_080: prefers-reduced-motion must actually reach HeroUIProvider.
  it('passes disableAnimation to HeroUIProvider when prefers-reduced-motion is set', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: (query: string) => ({
        matches: query.includes('prefers-reduced-motion'),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
    mount(<span>content</span>);
    expect(lastHeroUIProps.disableAnimation).toBe(true);
    Reflect.deleteProperty(window, 'matchMedia');
  });

  it('does not disable animation when prefers-reduced-motion is not set', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
    mount(<span>content</span>);
    expect(lastHeroUIProps.disableAnimation).toBe(false);
    Reflect.deleteProperty(window, 'matchMedia');
  });
});
