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

vi.mock('@/hooks/useAuth', () => ({
  useMe: () => ({ data: mockUser }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}));

vi.mock('@/hooks/useHasMounted', () => ({
  useHasMounted: () => true,
}));

// HeroUIProvider pulls in react-aria's overlay/focus-scope internals, which
// assume browser APIs jsdom doesn't implement (ResizeObserver, etc.).
// Mocked to a passthrough so this test exercises ThemeWrapper's own effects
// (the actual regression surface — accent color / theme class handling),
// not HeroUI's internals.
vi.mock('@heroui/react', () => ({
  HeroUIProvider: ({ children }: { children: ReactNode }) => children,
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
    mockUser = null;
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
});
