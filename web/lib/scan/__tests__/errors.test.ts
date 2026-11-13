import { describe, it, expect } from 'vitest';
import { scanErrorCause } from '../errors';

describe('scanErrorCause', () => {
  it('says a photo the API cannot read to its end is damaged (#886)', () => {
    expect(scanErrorCause('IMAGE_DAMAGED')).toBe('photoDamaged');
  });

  it('still says a file that is not an image is rejected', () => {
    expect(scanErrorCause('INVALID_FILE_TYPE')).toBe('photoRejected');
  });
});
