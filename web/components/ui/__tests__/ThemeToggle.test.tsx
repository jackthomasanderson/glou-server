import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ComponentProps, ReactNode } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeModeProvider } from '@/hooks/useThemeMode';
import { ThemeToggle } from '../ThemeToggle';
import { THEME_STORAGE_KEY } from '@/lib/theme-mode';

// ISSUE_112 — the sidebar light/dark switch required by ux-ui.md §3.1.

let mockUser: { theme?: string } | null = null;
const savePreferences = vi.fn();

vi.mock('@/hooks/useAuth', () => ({
  useMe: () => ({ data: mockUser }),
  useUpdatePreferences: () => ({ mutate: savePreferences }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// HeroUI's real Button/Tooltip drag in react-aria internals jsdom doesn't
// implement; these passthroughs keep the test on this component's own
// behaviour (accessible name, pressed state, click handling).
type MockButtonProps = ComponentProps<'button'> & {
  onPress: () => void;
  // HeroUI-only props, dropped so they never reach the DOM node.
  isIconOnly?: boolean;
  variant?: string;
  radius?: string;
  color?: string;
  size?: string;
};

vi.mock('@heroui/react', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => children,
  Button: ({
    children,
    onPress,
    isIconOnly: _isIconOnly,
    variant: _variant,
    radius: _radius,
    color: _color,
    size: _size,
    ...props
  }: MockButtonProps) => (
    <button type="button" onClick={onPress} {...props}>
      {children}
    </button>
  ),
}));

function mount() {
  return render(
    <ThemeModeProvider>
      <ThemeToggle />
    </ThemeModeProvider>,
  );
}

describe('ThemeToggle', () => {
  beforeEach(() => {
    savePreferences.mockClear();
    mockUser = null;
    window.localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  afterEach(() => {
    document.documentElement.classList.remove('dark');
    document.documentElement.style.colorScheme = '';
  });

  it('exposes a focusable button with an accessible name and pressed state', () => {
    mount();
    const button = screen.getByRole('button', { name: 'theme.switchToDark' });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('aria-pressed', 'false');
    button.focus();
    expect(document.activeElement).toBe(button);
  });

  it('switches to dark mode, persists the choice and announces the new state', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'theme.switchToDark' }));

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(screen.getByRole('button', { name: 'theme.switchToLight' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('status')).toHaveTextContent('theme.activeDark');
  });

  it('switches back to light mode', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    mount();
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'theme.switchToLight' }));
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });

  it('follows prefers-color-scheme when no choice was ever made', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn().mockReturnValue({
        matches: true,
        media: '(prefers-color-scheme: dark)',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
    try {
      mount();
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    } finally {
      Reflect.deleteProperty(window, 'matchMedia');
    }
  });

  it('does not hit the account endpoint when nobody is signed in', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'theme.switchToDark' }));
    expect(savePreferences).not.toHaveBeenCalled();
  });

  it('persists the choice to the account when signed in', () => {
    mockUser = { theme: 'LIGHT' };
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'theme.switchToDark' }));
    expect(savePreferences).toHaveBeenCalledWith({ theme: 'DARK' });
  });
});
