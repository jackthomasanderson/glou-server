import { describe, it, expect } from 'vitest';
import { modal, toastRegion } from '@heroui/react';
import config from './tailwind.config';

// #574: the onboarding wizard sat at 9990, above the windows and toasts that
// HeroUI renders outside it. The add form, the scan screen and every error
// toast opened from the wizard were hidden underneath it.
//
// HeroUI's levels are read from its own styles, so an upgrade that moves them
// fails here instead of hiding the wizard's windows again.

/** The plain `z-N` / `z-[N]` class in a HeroUI slot (variants like `before:z-[-1]` are skipped). */
function zIndexOf(classes: string): number {
  const match = classes.match(/(?:^|\s)z-(?:\[(\d+)\]|(\d+))(?=\s|$)/);
  if (!match) throw new Error(`no z-index class in "${classes}"`);
  return Number(match[1] ?? match[2]);
}

const windowSlots = modal();
const HEROUI_WINDOW = Math.min(
  zIndexOf(windowSlots.wrapper()),
  zIndexOf(windowSlots.base()),
  zIndexOf(windowSlots.backdrop()),
);
const HEROUI_TOASTS = zIndexOf(toastRegion().base());

const scale = config.theme?.extend?.zIndex as Record<'overlay' | 'wizard' | 'lock', string>;
const level = (name: keyof typeof scale) => Number(scale[name]);

describe('stacking order (#574)', () => {
  it('keeps the app overlays under the onboarding wizard', () => {
    expect(level('overlay')).toBeLessThan(level('wizard'));
  });

  it('opens HeroUI windows and toasts above the onboarding wizard', () => {
    expect(level('wizard')).toBeLessThan(HEROUI_WINDOW);
    expect(level('wizard')).toBeLessThan(HEROUI_TOASTS);
  });

  it('keeps the lock screen above an open window and its toasts', () => {
    expect(level('lock')).toBeGreaterThan(HEROUI_WINDOW);
    expect(level('lock')).toBeGreaterThan(HEROUI_TOASTS);
  });
});
