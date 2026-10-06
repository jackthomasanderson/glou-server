import { describe, it, expect, afterEach, vi } from 'vitest';
import { copyText } from '../clipboard';

describe('copyText (#213)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('uses the async clipboard API when present', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    await expect(copyText('https://x/y')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('https://x/y');
  });

  it('falls back to execCommand when navigator.clipboard is missing (plain HTTP)', async () => {
    vi.stubGlobal('navigator', {});
    const exec = vi.fn().mockReturnValue(true);
    (document as unknown as { execCommand: typeof exec }).execCommand = exec;
    await expect(copyText('hello')).resolves.toBe(true);
    expect(exec).toHaveBeenCalledWith('copy');
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('resolves false when every method fails', async () => {
    vi.stubGlobal('navigator', {});
    (document as unknown as { execCommand: () => boolean }).execCommand = () => false;
    await expect(copyText('hello')).resolves.toBe(false);
  });
});
