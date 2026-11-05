import { describe, it, expect, vi, beforeEach } from 'vitest';

type ToastOptions = { timeout?: number; title?: string; description?: unknown; endContent?: unknown };
const addToast = vi.fn<(options: ToastOptions) => string>(() => 'toast-1');
vi.mock('@heroui/react', () => ({
  addToast: (options: ToastOptions) => addToast(options),
  closeToast: vi.fn(),
  Button: () => null,
}));
vi.mock('@/lib/i18n', () => ({ default: { t: (key: string) => key } }));

import { notifyUndoable } from '@/lib/toast';

describe('notifyUndoable (decision #471 point 71)', () => {
  beforeEach(() => addToast.mockClear());

  it('keeps « Annuler » on screen for 8 seconds', () => {
    notifyUndoable('stockMove.opened', undefined, () => {});
    expect(addToast).toHaveBeenCalledTimes(1);
    expect(addToast.mock.calls[0][0].timeout).toBe(8000);
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
