import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Tooltip } from '@heroui/react';

// Guards vitest.setup.ts: a real HeroUI Tooltip mounts a framer-motion LazyMotion
// whose async import can outlive the test file and fail the CI run after the fact
// ("window is not defined"), without adding any DOM we could assert on.
describe('Tooltip in tests', () => {
  it('is the plain passthrough from vitest.setup.ts, not the real component', () => {
    // HeroUI components are React.forwardRef objects; the passthrough is a function.
    expect(typeof Tooltip).toBe('function');
  });

  it('renders only its trigger', () => {
    const { container } = render(
      <Tooltip content="bubble"><button>trigger</button></Tooltip>,
    );
    expect(container.innerHTML).toBe('<button>trigger</button>');
  });
});
