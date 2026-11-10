import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StarRating } from '../StarRating';

// #646: the score is announced as a named radio group; the chosen star is
// exposed with aria-checked and the value is also written as text.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) => (o ? `${k}|${Object.values(o).join(',')}` : k),
  }),
}));

describe('StarRating', () => {
  it('is a named radiogroup of five radios with the chosen one checked', () => {
    render(<StarRating label="Rating" value={4} onChange={() => {}} />);
    expect(screen.getByRole('radiogroup', { name: 'Rating' })).toBeTruthy();
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(5);
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'false', 'false', 'true', 'false']);
    expect(radios[3].getAttribute('aria-label')).toBe('tastings.ratingOption|4');
  });

  it('shows the value as text', () => {
    render(<StarRating label="Rating" value={4} onChange={() => {}} />);
    expect(screen.getByRole('status').textContent).toBe('tastings.ratingValue|4');
  });

  it('says so when there is no score, and checks nothing', () => {
    render(<StarRating label="Rating" value={null} onChange={() => {}} />);
    expect(screen.getByRole('status').textContent).toBe('tastings.ratingNone');
    expect(screen.getAllByRole('radio').every((r) => r.getAttribute('aria-checked') === 'false')).toBe(true);
  });

  it('chooses a star, and clears the score when the chosen star is pressed again', () => {
    const onChange = vi.fn();
    const { rerender } = render(<StarRating label="Rating" value={2} onChange={onChange} />);
    fireEvent.click(screen.getAllByRole('radio')[4]);
    expect(onChange).toHaveBeenLastCalledWith(5);
    fireEvent.click(screen.getAllByRole('radio')[1]);
    expect(onChange).toHaveBeenLastCalledWith(null);
    rerender(<StarRating label="Rating" value={5} onChange={onChange} />);
    expect(screen.getAllByRole('radio')[4].getAttribute('aria-checked')).toBe('true');
  });
});
