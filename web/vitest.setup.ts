// Registers @testing-library/jest-dom's custom matchers (toBeInTheDocument,
// toHaveTextContent, …) on Vitest's `expect`, and installs an automatic
// cleanup() after each test so mounted components don't leak between tests.
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup();
});

// HeroUI's <Tooltip> always mounts a framer-motion <LazyMotion> whose features
// come from a dynamic import (`import('@heroui/dom-animation')`), even while the
// tooltip is closed. That import can settle after a test file has finished and
// jsdom is torn down; its setState then throws "window is not defined", which
// Vitest reports as an unhandled error and fails the run although every test
// passed (seen on CI, never locally). Tests never assert on the tooltip bubble,
// so it is replaced by its trigger. A test file that mocks '@heroui/react'
// itself overrides this.
vi.mock('@heroui/react', async (importActual) => {
  const actual = await importActual<typeof import('@heroui/react')>();
  return {
    ...actual,
    Tooltip: ({ children }: { children?: unknown }) => children,
  };
});
