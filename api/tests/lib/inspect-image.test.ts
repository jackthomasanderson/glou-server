import { describe, it, expect } from 'vitest';
import zlib from 'zlib';
import { inspectImage } from '../../src/lib/upload';
import { IMAGES } from '../support/images';

// #886: a photo is stored only when its bytes are those of an image AND the
// file can be read to its end — a download cut short, or a file renamed
// `.jpg`, used to be stored and then shown as a broken photo.

/** A PNG with the given IHDR and `raw` (filter bytes included) as its pixels. */
function png(width: number, height: number, raw: Buffer, { colorType = 2, bitDepth = 8, interlace = 0 } = {}): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, 'latin1');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(Buffer.concat([head.subarray(4), data])), 0);
    return Buffer.concat([head, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = bitDepth; ihdr[9] = colorType; ihdr[12] = interlace;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

const ALL = Object.entries(IMAGES) as Array<[keyof typeof IMAGES, Buffer]>;
const extOf = (name: string) => (name === 'jpgProgressive' ? 'jpg' : name);

describe('inspectImage (#886)', () => {
  it.each(ALL)('accepts a complete %s file under its own extension', async (name, bytes) => {
    expect(await inspectImage(bytes)).toEqual({ ok: true, ext: extOf(name) });
  });

  it.each(ALL)('refuses a %s file cut short as damaged', async (_name, bytes) => {
    for (const keep of [0.5, 0.9]) {
      const cut = bytes.subarray(0, Math.floor(bytes.length * keep));
      expect(await inspectImage(cut)).toEqual({ ok: false, reason: 'DAMAGED' });
    }
  });

  it.each(ALL)('refuses a %s file missing only its last bytes', async (_name, bytes) => {
    expect(await inspectImage(bytes.subarray(0, bytes.length - 2))).toEqual({ ok: false, reason: 'DAMAGED' });
  });

  it('refuses a PNG whose compressed pixels are corrupted', async () => {
    const png = Buffer.from(IMAGES.png);
    // Inside the IDAT data (after signature 8 + IHDR 25 + IDAT header 8).
    png[8 + 25 + 8 + 4] ^= 0xff;
    expect(await inspectImage(png)).toEqual({ ok: false, reason: 'DAMAGED' });
  });

  it('accepts a PNG whose pixels are exactly the size its header declares', async () => {
    // 3x2 RGB, 8 bits: each row is 1 filter byte + 9 bytes.
    expect(await inspectImage(png(3, 2, Buffer.alloc(2 * 10)))).toEqual({ ok: true, ext: 'png' });
    // 4x4 grey 1-bit interlaced (Adam7): 7 passes of 1 filter byte + 1 byte per row.
    expect(await inspectImage(png(4, 4, Buffer.alloc(14), { colorType: 0, bitDepth: 1, interlace: 1 }))).toEqual({ ok: true, ext: 'png' });
  });

  it('refuses a PNG whose pixels inflate past what its header declares (decompression bomb)', async () => {
    // Declared 1x1, holding 64 MB of zeros (about 64 KB compressed).
    const started = Date.now();
    expect(await inspectImage(png(1, 1, Buffer.alloc(64 * 1024 * 1024)))).toEqual({ ok: false, reason: 'DAMAGED' });
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('refuses a PNG with fewer pixels than its header declares', async () => {
    expect(await inspectImage(png(3, 2, Buffer.alloc(10)))).toEqual({ ok: false, reason: 'DAMAGED' });
  });

  it.each([
    ['wider than 16384 pixels', 16385, 1],
    ['over 50 megapixels', 8000, 8000],
  ])('refuses a PNG %s before inflating it', async (_label, width, height) => {
    expect(await inspectImage(png(width, height, Buffer.alloc(10)))).toEqual({ ok: false, reason: 'DAMAGED' });
  });

  it.each([
    ['a text file renamed .jpg', Buffer.from('Château Margaux 2015, 6 bottles\n')],
    ['an HTML page', Buffer.from('<!DOCTYPE html><html></html>')],
    ['an empty file', Buffer.alloc(0)],
    ['a PDF', Buffer.from('%PDF-1.7\n%âãÏÓ\n1 0 obj\n')],
  ])('refuses %s as not an image', async (_label, bytes) => {
    expect(await inspectImage(bytes)).toEqual({ ok: false, reason: 'NOT_AN_IMAGE' });
  });
});
