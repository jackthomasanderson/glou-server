import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FilterChip } from '../FilterControls';

// #835: a long cellar name pushed its chip out of the 200 px filter panel.
describe('FilterChip long labels (#835)', () => {
  const name = 'Cave de la maison de campagne de mes grands-parents en Bourgogne';

  it('is at most as wide as its row and cuts the label', () => {
    render(<FilterChip selected={false} onPress={() => {}}>{name}</FilterChip>);
    const button = screen.getByRole('button');
    expect(button.className).toContain('max-w-full');
    const label = screen.getByText(name);
    expect(label.closest('[class*="truncate"]')).not.toBeNull();
  });

  it('keeps the full name reachable', () => {
    render(<FilterChip selected={false} onPress={() => {}}>{name}</FilterChip>);
    expect(screen.getByRole('button').getAttribute('title')).toBe(name);
  });

  it('adds no title for a non-text label', () => {
    render(<FilterChip selected onPress={() => {}}><span>12</span></FilterChip>);
    expect(screen.getByRole('button').hasAttribute('title')).toBe(false);
  });
});
