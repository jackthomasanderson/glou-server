import { describe, it, expect } from 'vitest';
import { inspectImage } from '../../src/lib/upload';
import { IMAGES } from '../support/images';

// #886: a photo is stored only when its bytes are those of an image AND the
// file can be read to its end — a download cut short, or a file renamed
// `.jpg`, used to be stored and then shown as a broken photo.

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

  it.each([
    ['a text file renamed .jpg', Buffer.from('Château Margaux 2015, 6 bottles\n')],
    ['an HTML page', Buffer.from('<!DOCTYPE html><html></html>')],
    ['an empty file', Buffer.alloc(0)],
    ['a PDF', Buffer.from('%PDF-1.7\n%âãÏÓ\n1 0 obj\n')],
  ])('refuses %s as not an image', async (_label, bytes) => {
    expect(await inspectImage(bytes)).toEqual({ ok: false, reason: 'NOT_AN_IMAGE' });
  });
});
