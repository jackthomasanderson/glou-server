import { describe, it, expect, vi, beforeEach } from 'vitest';

const addToast = vi.fn((..._args: unknown[]) => 'k1');
vi.mock('@heroui/react', () => ({ addToast: (...a: unknown[]) => addToast(...a), closeToast: vi.fn(), Button: () => null }));
vi.mock('@/lib/i18n', () => ({
  default: { t: (key: string, values?: Record<string, unknown>) => (values ? `${key} ${JSON.stringify(values)}` : key) },
}));

import { notifyError } from '@/lib/toast';
import { ApiError } from '@/lib/api';

beforeEach(() => addToast.mockClear());

// #1039: an action refused because of the rate limit says why, under its own message.
describe('notifyError with the failure behind it', () => {
  it('adds the wait under the message when the request was throttled', () => {
    notifyError('toast.createError', undefined, new ApiError('TOO_MANY_REQUESTS', 429, 30));
    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({
      title: 'toast.createError',
      description: 'status.rateLimitedSeconds {"count":30}',
      color: 'danger',
    }));
  });

  it('adds nothing for any other failure, or none', () => {
    notifyError('toast.createError', undefined, new ApiError('HTTP 500', 500));
    notifyError('toast.createError');
    for (const [arg] of addToast.mock.calls as unknown as [Record<string, unknown>][]) expect(arg).not.toHaveProperty('description');
  });
});
