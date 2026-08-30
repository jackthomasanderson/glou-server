// Registers @testing-library/jest-dom's custom matchers (toBeInTheDocument,
// toHaveTextContent, …) on Vitest's `expect`, and installs an automatic
// cleanup() after each test so mounted components don't leak between tests.
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
