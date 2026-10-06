import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// #198 — the result list only reacted to `mousedown` and closed 150 ms after the
// input blurred: with a keyboard you could neither reach a result nor activate it.
// The real HeroUI <Input> is used on purpose: what matters is that the combobox
// attributes and key handlers reach the actual <input> element.

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: { count?: number }) => (o?.count !== undefined ? `${k}:${o.count}` : k),
  }),
}));
vi.mock('@/hooks/useInventory', () => ({
  useInventory: () => ({
    data: [
      { id: 'i1', name: 'Pétrus', producer: 'Château Pétrus', vintage: 2015, category: 'wine', region: 'Pomerol' },
      { id: 'i2', name: 'Petit Verdot', producer: 'Domaine X', vintage: 2019, category: 'wine', region: '' },
    ],
  }),
}));
vi.mock('@/hooks/useCellars', () => ({
  useCellars: () => ({ data: [{ id: 'c1', name: 'Cave Pétrus', description: 'Sous-sol' }] }),
}));

import { GlobalSearch, MobileSearch } from '../GlobalSearch';

function typeQuery(input: HTMLElement, value: string) {
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value } });
}

describe('GlobalSearch keyboard support (#198)', () => {
  beforeEach(() => push.mockReset());

  it('exposes the combobox pattern on the real input', () => {
    render(<GlobalSearch />);
    const input = screen.getByRole('combobox');
    expect(input.tagName).toBe('INPUT');
    expect(input.getAttribute('aria-autocomplete')).toBe('list');
    expect(input.getAttribute('aria-expanded')).toBe('false');
    typeQuery(input, 'pet');
    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(input.getAttribute('aria-controls')).toBe(screen.getByRole('listbox').id);
  });

  it('announces how many results there are', () => {
    render(<GlobalSearch />);
    typeQuery(screen.getByRole('combobox'), 'pet');
    expect(screen.getByRole('status').textContent).toBe('nav.searchResultsCount:3');
  });

  it('moves through the results with the arrow keys and wraps around', () => {
    render(<GlobalSearch />);
    const input = screen.getByRole('combobox');
    typeQuery(input, 'pet');
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(3);

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.getAttribute('aria-activedescendant')).toBe(options[0].id);
    expect(options[0].getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.getAttribute('aria-activedescendant')).toBe(options[1].id);
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(input.getAttribute('aria-activedescendant')).toBe(options[2].id); // wrapped to the last
    fireEvent.keyDown(input, { key: 'Home' });
    expect(input.getAttribute('aria-activedescendant')).toBe(options[0].id);
    fireEvent.keyDown(input, { key: 'End' });
    expect(input.getAttribute('aria-activedescendant')).toBe(options[2].id);
  });

  it('opens the bottle on Enter', () => {
    render(<GlobalSearch />);
    const input = screen.getByRole('combobox');
    typeQuery(input, 'pet');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(push).toHaveBeenCalledWith('/bottles?q=P%C3%A9trus');
  });

  it('opens the cellar when a cellar result is chosen', () => {
    render(<GlobalSearch />);
    const input = screen.getByRole('combobox');
    typeQuery(input, 'pet');
    fireEvent.keyDown(input, { key: 'End' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(push).toHaveBeenCalledWith('/cellars');
  });

  it('does not hijack Enter when no result is highlighted', () => {
    render(<GlobalSearch />);
    const input = screen.getByRole('combobox');
    typeQuery(input, 'pet');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(push).not.toHaveBeenCalled();
  });

  it('closes the list on Escape', () => {
    render(<GlobalSearch />);
    const input = screen.getByRole('combobox');
    typeQuery(input, 'pet');
    expect(screen.getByRole('listbox')).toBeTruthy();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('closes the list as soon as focus leaves, with no delay', () => {
    render(<GlobalSearch />);
    const input = screen.getByRole('combobox');
    typeQuery(input, 'pet');
    expect(screen.getByRole('listbox')).toBeTruthy();
    fireEvent.blur(input);
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('reopens the list with the arrow keys after it was dismissed', () => {
    render(<GlobalSearch />);
    const input = screen.getByRole('combobox');
    typeQuery(input, 'pet');
    fireEvent.blur(input);
    expect(screen.queryByRole('listbox')).toBeNull();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getByRole('listbox')).toBeTruthy();
  });

  it('keeps focus in the input when a row is pressed, and selects it on click', () => {
    render(<GlobalSearch />);
    const input = screen.getByRole('combobox');
    typeQuery(input, 'pet');
    const row = screen.getAllByRole('option')[1];
    const notPrevented = fireEvent.mouseDown(row);
    expect(notPrevented).toBe(false); // preventDefault() => the input is not blurred
    fireEvent.click(row);
    expect(push).toHaveBeenCalledWith('/bottles?q=Petit%20Verdot');
  });
});

describe('MobileSearch keyboard support (#198)', () => {
  beforeEach(() => push.mockReset());

  it('selects with Enter and closes the overlay', () => {
    const onClose = vi.fn();
    render(<MobileSearch isOpen onClose={onClose} />);
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'pet' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(push).toHaveBeenCalledWith('/bottles?q=P%C3%A9trus');
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on Escape even when there is no result', () => {
    const onClose = vi.fn();
    render(<MobileSearch isOpen onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
