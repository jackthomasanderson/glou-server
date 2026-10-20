import { describe, it, expect } from 'vitest';
import { downscaleImage } from './image-resize';

// #494: the resize step must never get in the way of an upload — whatever it
// cannot handle goes through untouched.
describe('downscaleImage', () => {
  it('leaves GIFs alone (animation)', async () => {
    const gif = new File(['GIF89a'], 'a.gif', { type: 'image/gif' });
    expect(await downscaleImage(gif)).toBe(gif);
  });

  it('returns the original file when the browser cannot decode it', async () => {
    const broken = new File(['not an image'], 'a.jpg', { type: 'image/jpeg' });
    expect(await downscaleImage(broken)).toBe(broken);
  });
});
