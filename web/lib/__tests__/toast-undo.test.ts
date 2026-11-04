import { describe, it, expect, vi, beforeEach } from 'vitest';

const addToast = vi.fn<(options: { timeout?: number }) => string>(() => 'toast-1');
vi.mock('@heroui/react', () => ({
  addToast: (options: { timeout?: number }) => addToast(options),
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
});
