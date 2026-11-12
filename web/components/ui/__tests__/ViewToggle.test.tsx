import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ViewToggle } from '../ViewToggle';
import { PageSizeToggle } from '../PageSizeToggle';

// #646: the selected view / page size is exposed with aria-pressed, not only by colour.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string, o?: { count?: number }) => (o?.count !== undefined ? `${k}|${o.count}` : k) }),
}));

describe('ViewToggle', () => {
  it('marks only the current view as pressed', () => {
    render(<ViewToggle value="list" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'view.grid' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: 'view.list' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('reports the chosen view', () => {
    const onChange = vi.fn();
    render(<ViewToggle value="list" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'view.grid' }));
    expect(onChange).toHaveBeenCalledWith('grid');
  });
});

describe('PageSizeToggle', () => {
  it('marks only the current page size as pressed', () => {
    render(<PageSizeToggle value={50} onChange={() => {}} />);
    const pressed = screen.getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') === 'true');
    expect(pressed).toHaveLength(1);
    expect(pressed[0].getAttribute('aria-label')).toBe('inventory.perPage|50');
  });
});

// #938: the selected option is not told by colour alone (WCAG 1.4.1).
describe('selected option cue beyond colour', () => {
  it('underlines and bolds only the current view', () => {
    render(<ViewToggle value="list" onChange={() => {}} />);
    const list = screen.getByRole('button', { name: 'view.list' });
    const grid = screen.getByRole('button', { name: 'view.grid' });
    expect(list.className).toContain('border-primary');
    expect(list.className).toContain('font-semibold');
    expect(grid.className).not.toContain('border-primary');
    expect(grid.className).not.toContain('font-semibold');
  });

  it('underlines and bolds only the current page size', () => {
    render(<PageSizeToggle value={50} onChange={() => {}} />);
    const marked = screen.getAllByRole('button').filter((b) => b.className.includes('border-primary'));
    expect(marked).toHaveLength(1);
    expect(marked[0].getAttribute('aria-pressed')).toBe('true');
    expect(marked[0].className).toContain('font-semibold');
  });
});
