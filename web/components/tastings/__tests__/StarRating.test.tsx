import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StarRating } from '../StarRating';

// #646: the score is announced as a named radio group; the chosen star is
// exposed with aria-checked and the value is also written as text.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) => (o ? `${k}|${Object.values(o).join(",")}` : k),
  }),
}));

describe('StarRating', () => {
  it('is a named radiogroup of five radios with the chosen one checked', () => {
    render(<><span id="lbl">Rating</span><StarRating labelId="lbl" value={4} onChange={() => {}} /></>);
    expect(screen.getByRole('radiogroup', { name: 'Rating' })).toBeTruthy();
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(5);
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'false', 'false', 'true', 'false']);
    expect(radios[3].getAttribute('aria-label')).toBe('tastings.ratingOption|4');
  });

  it('shows the value as text', () => {
    render(<><span id="lbl">Rating</span><StarRating labelId="lbl" value={4} onChange={() => {}} /></>);
    expect(screen.getByRole('status').textContent).toBe('tastings.ratingValue|4');
  });

  it('says so when there is no score, and checks nothing', () => {
    render(<><span id="lbl">Rating</span><StarRating labelId="lbl" value={null} onChange={() => {}} /></>);
    expect(screen.getByRole('status').textContent).toBe('tastings.ratingNone');
    expect(screen.getAllByRole('radio').every((r) => r.getAttribute('aria-checked') === 'false')).toBe(true);
  });

  it('chooses a star; pressing the chosen star keeps it', () => {
    const onChange = vi.fn();
    render(<><span id="lbl">Rating</span><StarRating labelId="lbl" value={2} onChange={onChange} /></>);
    fireEvent.click(screen.getAllByRole('radio')[4]);
    expect(onChange).toHaveBeenLastCalledWith(5);
    fireEvent.click(screen.getAllByRole('radio')[1]);
    expect(onChange).toHaveBeenLastCalledWith(2);
  });

  it('clears the score only with the explicit button, shown only when a score is set', () => {
    const onChange = vi.fn();
    const { rerender } = render(<><span id="lbl">Rating</span><StarRating labelId="lbl" value={null} onChange={onChange} /></>);
    expect(screen.queryByRole('button', { name: 'tastings.ratingClear' })).toBeNull();
    rerender(<><span id="lbl">Rating</span><StarRating labelId="lbl" value={3} onChange={onChange} /></>);
    fireEvent.click(screen.getByRole('button', { name: 'tastings.ratingClear' }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('has a single tab stop: the chosen star, or the first when none', () => {
    const { rerender } = render(<><span id="lbl">Rating</span><StarRating labelId="lbl" value={null} onChange={() => {}} /></>);
    const stops = () => screen.getAllByRole('radio').map((r) => r.getAttribute('tabindex'));
    expect(stops()).toEqual(['0', '-1', '-1', '-1', '-1']);
    rerender(<><span id="lbl">Rating</span><StarRating labelId="lbl" value={4} onChange={() => {}} /></>);
    expect(stops()).toEqual(['-1', '-1', '-1', '0', '-1']);
  });

  it('arrow keys, Home and End move and choose, wrapping round, and focus follows', () => {
    const onChange = vi.fn();
    const { rerender } = render(<><span id="lbl">Rating</span><StarRating labelId="lbl" value={4} onChange={onChange} /></>);
    const group = screen.getByRole('radiogroup');
    const press = (key: string) => fireEvent.keyDown(group, { key });
    press('ArrowRight'); expect(onChange).toHaveBeenLastCalledWith(5);
    expect(document.activeElement).toBe(screen.getAllByRole('radio')[4]);
    press('ArrowDown'); expect(onChange).toHaveBeenLastCalledWith(5);
    press('ArrowLeft'); expect(onChange).toHaveBeenLastCalledWith(3);
    press('ArrowUp'); expect(onChange).toHaveBeenLastCalledWith(3);
    press('Home'); expect(onChange).toHaveBeenLastCalledWith(1);
    press('End'); expect(onChange).toHaveBeenLastCalledWith(5);
    rerender(<><span id="lbl">Rating</span><StarRating labelId="lbl" value={5} onChange={onChange} /></>);
    press('ArrowRight'); expect(onChange).toHaveBeenLastCalledWith(1);
    rerender(<><span id="lbl">Rating</span><StarRating labelId="lbl" value={1} onChange={onChange} /></>);
    press('ArrowLeft'); expect(onChange).toHaveBeenLastCalledWith(5);
  });

  it('arrow keys on an unrated group start at the first star', () => {
    const onChange = vi.fn();
    render(<><span id="lbl">Rating</span><StarRating labelId="lbl" value={null} onChange={onChange} /></>);
    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith(1);
  });
});
