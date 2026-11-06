import { describe, it, expect } from 'vitest';
import { toast } from '@heroui/theme';
import { TOAST_PROPS } from '@/lib/toast';

/**
 * Recette n°5 ter of #847: beside a drawer (bottom-right), a message leaving
 * slid sideways by its own width, over the drawer's « Ajouter des
 * bouteilles » and « Modifier », and caught a click meant for them. The
 * classes HeroUI ends up with once ours are merged into its own.
 */
const classes = toast({}).base({ class: TOAST_PROPS.classNames.base }).split(/\s+/);
const leaving = (rest: string) => `data-[toast-exiting=true]:${rest}`;

describe('a message leaving (TOAST_PROPS)', () => {
  it('beside a drawer, leaves downwards in its column, never sideways over the drawer', () => {
    expect(classes).not.toContain(leaving('data-[placement=bottom-right]:translate-x-full'));
    expect(classes).toContain(leaving('data-[placement=bottom-right]:translate-x-0'));
    expect(classes).toContain(leaving('data-[placement=bottom-right]:translate-y-full'));
  });

  it('lets every click through, its hover margins included', () => {
    for (const part of ['', 'before:', 'after:']) expect(classes).toContain(leaving(`${part}pointer-events-none`));
  });

  it('keeps the other sides as HeroUI made them (top-right without a drawer)', () => {
    expect(classes).toContain(leaving('data-[placement=top-right]:translate-x-full'));
    expect(classes).toContain(leaving('opacity-0'));
  });
});
