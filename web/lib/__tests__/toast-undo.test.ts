import { describe, it, expect, vi, beforeEach } from 'vitest';

type ToastOptions = { timeout?: number; title?: string; description?: unknown; endContent?: unknown };
const addToast = vi.fn<(options: ToastOptions) => string>(() => 'toast-1');
vi.mock('@heroui/react', () => ({
  addToast: (options: ToastOptions) => addToast(options),
  closeToast: vi.fn(),
  Button: () => null,
}));
vi.mock('@/lib/i18n', () => ({ default: { t: (key: string) => key } }));

import { notifyUndoable, UNDO_TIMEOUT_MS } from '@/lib/toast';

describe('notifyUndoable (decision #471 point 71)', () => {
  beforeEach(() => addToast.mockClear());

  // The countdown itself (8 s, paused on hover and keyboard focus, #651) is
  // checked on the rendered message in toast-undo-timing.test.tsx.
  it('keeps « Annuler » on screen for 8 seconds, with its own countdown instead of HeroUI\'s', () => {
    notifyUndoable('stockMove.opened', undefined, () => {});
    expect(addToast).toHaveBeenCalledTimes(1);
    expect(UNDO_TIMEOUT_MS).toBe(8000);
    expect(addToast.mock.calls[0][0].timeout).toBe(0);
  });

  // Recette v3: beside two buttons the message was a word wide, cut mid-word
  // on a phone (« 1 / bout / eille / bue »): they go under it.
  it('puts a second action and « Annuler » under the message, never beside it', () => {
    notifyUndoable('openDrink.done.drink', undefined, () => {}, { labelKey: 'shares.guest.tasting.action', onPress: () => {} });
    const options = addToast.mock.calls[0][0];
    expect(options.endContent).toBeUndefined();
    expect(options.description).toBeDefined();
  });

  it('keeps a lone « Annuler » beside the message', () => {
    notifyUndoable('stockMove.opened', undefined, () => {});
    expect(addToast.mock.calls[0][0].endContent).toBeDefined();
  });
});
