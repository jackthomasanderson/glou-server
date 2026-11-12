import { describe, it, expect, vi, afterEach } from 'vitest';
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

  // #662: redrawing in a canvas is what removes EXIF (GPS position, camera
  // details); a JPEG must therefore always come out redrawn, even when the
  // redrawn file is not lighter than the original.
  describe('metadata removal', () => {
    const realBitmap = globalThis.createImageBitmap;
    afterEach(() => {
      globalThis.createImageBitmap = realBitmap;
      vi.restoreAllMocks();
    });

    // Minimal JPEG: SOI, optional APP1 "Exif" segment carrying a GPS-like payload, EOI.
    const jpeg = (withExif: boolean, padding = 0) => {
      const exif = new TextEncoder().encode('Exif\0\0GPSLatitude=48.85;GPSLongitude=2.35');
      const parts: number[] = [0xff, 0xd8];
      if (withExif) parts.push(0xff, 0xe1, (exif.length + 2) >> 8, (exif.length + 2) & 0xff, ...exif);
      parts.push(...new Array(padding).fill(0), 0xff, 0xd9);
      return new Uint8Array(parts);
    };
    const hasApp1 = (bytes: Uint8Array) => bytes.some((b, i) => b === 0xff && bytes[i + 1] === 0xe1);

    it('drops the APP1 segment of a small JPEG even when the redrawn file is not lighter', async () => {
      globalThis.createImageBitmap = vi.fn().mockResolvedValue({ width: 800, height: 600, close() {} });
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage() {} } as never);
      // The re-encoded file is bigger than the original, which used to make the original win.
      vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) =>
        cb(new Blob([jpeg(false, 500)], { type: 'image/jpeg' })),
      );
      const original = new File([jpeg(true)], 'label.jpg', { type: 'image/jpeg' });
      expect(hasApp1(new Uint8Array(await original.arrayBuffer()))).toBe(true);

      const out = await downscaleImage(original);

      expect(out).not.toBe(original);
      expect(out.type).toBe('image/jpeg');
      expect(hasApp1(new Uint8Array(await out.arrayBuffer()))).toBe(false);
    });
  });
});
