import { describe, expect, it } from 'vitest';
import { parseTags } from '../tags';

// #708: the wine's tags, typed comma-separated in its form.
describe('parseTags', () => {
  it('splits on commas, trims, drops empty parts', () => {
    expect(parseTags('Cadeau,  Garde , ,')).toEqual(['Cadeau', 'Garde']);
  });

  it('drops doubles whatever their case, keeping the first spelling', () => {
    expect(parseTags('Cadeau, cadeau, GARDE, Garde')).toEqual(['Cadeau', 'GARDE']);
  });

  it('keeps a tag already holding a comma whole (set in bulk), as long as it is left as is', () => {
    const known = ['Rouge, léger', 'Cadeau'];
    expect(parseTags('Rouge, léger, Cadeau, Neuf', known)).toEqual(['Rouge, léger', 'Cadeau', 'Neuf']);
    // Edited, it is split like any text typed.
    expect(parseTags('Rouge, lourd, Cadeau', known)).toEqual(['Rouge', 'lourd', 'Cadeau']);
  });
});
