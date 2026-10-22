import { describe, it, expect } from 'vitest';
import config from './tailwind.config';

// #574: the onboarding wizard sat at 9990, above the windows and toasts that
// HeroUI renders outside it. The add form, the scan screen and every error
// toast opened from the wizard were hidden underneath it.
//
// HeroUI's own levels, read in @heroui/theme 2.4.26: Modal/Drawer `wrapper`,
// `base` and `backdrop` are `z-50`; the toast region is `z-[100]`.
const HEROUI_WINDOW = 50;
const HEROUI_TOASTS = 100;

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
