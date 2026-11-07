import { describe, it, expect } from 'vitest';
import { detectImageExtension } from '../../src/lib/upload';

// #862: a downloaded photo is stored only when its bytes are those of an image.

const ftyp = (major: string, ...compatible: string[]) => {
  const brands = [major, '\0\0\0\0', ...compatible].join('');
  const box = Buffer.alloc(8 + brands.length);
  box.writeUInt32BE(box.length, 0);
  box.write('ftyp', 4, 'latin1');
  box.write(brands, 8, 'latin1');
  return Buffer.concat([box, Buffer.alloc(16)]);
};

describe('detectImageExtension (#862)', () => {
  it.each([
    ['jpg', Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0, 0])],
    ['png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])],
    ['gif', Buffer.from('GIF89a\x01\x00', 'latin1')],
    ['webp', Buffer.from('RIFF\x10\x00\x00\x00WEBPVP8 ', 'latin1')],
    ['avif', ftyp('avif', 'mif1')],
    ['avif', ftyp('mif1', 'miaf', 'avif')],
  ])('recognises a %s file', (ext, bytes) => {
    expect(detectImageExtension(bytes)).toBe(ext);
  });

  it.each([
    ['an HTML page', Buffer.from('<!DOCTYPE html><html></html>')],
    ['an empty file', Buffer.alloc(0)],
    ['a HEIC photo (not served by the app)', ftyp('heic', 'mif1')],
    ['a cut-off PNG signature', Buffer.from([0x89, 0x50, 0x4e])],
  ])('refuses %s', (_label, bytes) => {
    expect(detectImageExtension(bytes)).toBeNull();
  });
});
