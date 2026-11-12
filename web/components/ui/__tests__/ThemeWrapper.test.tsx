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

let mockReady = true;
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: mockI18nLanguage, changeLanguage: mockChangeLanguage },
    ready: mockReady,
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
    document.getElementById('accent-color')?.remove();
    document.documentElement.classList.remove('dark');
    document.documentElement.style.colorScheme = '';
    window.localStorage.clear();
    mockUser = null;
    vi.restoreAllMocks();
    mockMounted = true;
    mockChangeLanguage = vi.fn();
    mockI18nLanguage = 'en';
    mockReady = true;
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

  it('keeps the placeholder until the translations have loaded (#495)', () => {
    mockReady = false;
    mount(<span>child</span>);
    expect(container.querySelector('[data-testid="app-boot-placeholder"]')).not.toBeNull();
  });

  it('removes the placeholder once mounted', () => {
    mount(<span>content</span>);
    expect(container.querySelector('[data-testid="app-boot-placeholder"]')).toBeNull();
  });

  it('renders its children without crashing', () => {
    mount(<span>Hello</span>);
    expect(container.textContent).toBe('Hello');
  });

  // #648: one stylesheet, a light and a dark value per accent preset.
  const accentCss = () => document.getElementById('accent-color')?.textContent ?? '';

  it("sets the primary colour from the user's accent preset, per theme", () => {
    mockUser = { accentColor: '#047857' }; // emerald
    mount(<span>content</span>);
    // emerald-700 in the light theme, emerald-400 in the dark one.
    expect(accentCss()).toMatch(/:root:not\(\.dark\)\{[^}]*--heroui-primary:163 94% 24%;/);
    expect(accentCss()).toMatch(/:root\.dark\{[^}]*--heroui-primary:158 64% 52%;/);
    expect(accentCss()).toMatch(/:root\.dark\{[^}]*--heroui-primary-foreground:222 47% 11%;/);
  });

  it('maps an accent stored before #648 to its new preset', () => {
    mockUser = { accentColor: '#10b981' }; // the old emerald
    mount(<span>content</span>);
    expect(accentCss()).toMatch(/:root:not\(\.dark\)\{[^}]*--heroui-primary:163 94% 24%;/);
  });

  it('falls back to the default indigo accent when the user has none or an unknown one', () => {
    mockUser = null;
    mount(<span>content</span>);
    expect(accentCss()).toMatch(/:root:not\(\.dark\)\{[^}]*--heroui-primary:243 75% 59%;/);
    act(() => root.unmount());
    container.remove();
    mockUser = { accentColor: '#ff0000' };
    mount(<span>content</span>);
    expect(accentCss()).toMatch(/:root:not\(\.dark\)\{[^}]*--heroui-primary:243 75% 59%;/);
  });

  it('also sets the primary-50..900 scale of the preset', () => {
    mockUser = { accentColor: '#4f46e5' };
    mount(<span>content</span>);
    for (const stop of ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900']) {
      expect(accentCss()).toContain(`--heroui-primary-${stop}:`);
    }
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

  // #344: logged out (and guests) follow the browser language, FR/EN only.
  it('follows the browser language when nobody is signed in', () => {
    vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['en-GB', 'fr']);
    document.documentElement.lang = 'fr';
    mockUser = null;
    mount(<span>content</span>);
    expect(document.documentElement.lang).toBe('en');
  });

  it('falls back to French for an unsupported browser language when nobody is signed in', () => {
    vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['de-DE']);
    document.documentElement.lang = 'en';
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
