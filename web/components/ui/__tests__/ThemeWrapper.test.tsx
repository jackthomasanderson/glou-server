import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { ThemeWrapper } from '../ThemeWrapper';

vi.mock('@/hooks/useAuth', () => ({
  useMe: () => ({ data: null }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: {
      language: 'en',
      changeLanguage: vi.fn(),
    },
  }),
}));

const { useHasMounted } = vi.hoisted(() => ({
  useHasMounted: vi.fn(() => true),
}));
vi.mock('@/hooks/useHasMounted', () => ({ useHasMounted }));

describe('ThemeWrapper', () => {
  it('renders children without crashing', () => {
    const element = React.createElement(ThemeWrapper, {}, 'Hello');

    expect(element).toBeDefined();
  });

  it('returns a valid React element with children text', () => {
    const element = React.createElement(ThemeWrapper, {}, 'Hello World');

    expect(element.type).toBe(ThemeWrapper);
    expect(element.props.children).toBe('Hello World');
  });
});