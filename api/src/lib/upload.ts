import zlib from 'zlib';

/**
 * Shared across every upload point (avatars, scans, product images):
 * ISSUE_049 — the stored file extension MUST be derived from the validated
 * mimetype, never from the client-supplied filename. Otherwise a file
 * declared `image/png` but named `x.html` would be stored as `.html` and
 * served as-is by `express.static`, serving arbitrary content under the
 * instance's own domain.
 */
export const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/pjpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

/**
 * #862: the image type read from the file's first bytes, or null when they are
 * not those of a JPEG, PNG, GIF, WebP or AVIF image. A remote host's
 * content-type is not proof: hotlink protection answers an HTML page, a CDN a
 * truncated or empty body, and such a file was stored as a broken photo.
 */
export function detectImageExtension(bytes: Buffer): string | null {
  const ascii = (start: number, end: number) => bytes.subarray(start, end).toString('latin1');
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a') return 'gif';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp';
  // ISO-BMFF: a `ftyp` box whose major or compatible brands name AVIF.
  if (ascii(4, 8) === 'ftyp') {
    const boxEnd = Math.min(bytes.readUInt32BE(0), bytes.length);
    for (let at = 8; at + 4 <= boxEnd; at += 4) {
      const brand = ascii(at, at + 4);
      if (brand === 'avif' || brand === 'avis') return 'avif';
    }
  }
  return null;
}

export type ImageInspection =
  | { ok: true; ext: string }
  /** `NOT_AN_IMAGE`: not a JPEG, PNG, GIF, WebP or AVIF; `DAMAGED`: one, but it cannot be read to its end. */
  | { ok: false; reason: 'NOT_AN_IMAGE' | 'DAMAGED' };

/**
 * #886: the one check every stored photo goes through — downloaded from a
 * search result, picked on the device (product photo, avatar) or sent for a
 * label scan. The type comes from the first bytes (never from the declared
 * content type or the file name); the file must then be readable from start
 * to end: a download cut short, or a file renamed `.jpg`, used to be stored
 * and shown as a broken photo.
 *
 * Limit: the API has no image decoder (#494 resizes photos in the browser),
 * and adding one (sharp, libvips) is a heavy native dependency. So the check
 * walks each format's structure: every segment, chunk or box must fit in the
 * file, the image must have non-zero dimensions and the format's end marker
 * must be there. A PNG's pixels are inflated (zlib, CRC of each chunk) and
 * must be exactly the size its header declares, within PNG_MAX_SIDE and
 * PNG_MAX_PIXELS; the filtered rows themselves are not decoded.
 * The compressed pixels of a JPEG, GIF, WebP or AVIF are not decoded: a file
 * complete in length but corrupted inside still passes, a truncated one never.
 */
export async function inspectImage(bytes: Buffer): Promise<ImageInspection> {
  const ext = detectImageExtension(bytes);
  if (!ext) return { ok: false, reason: 'NOT_AN_IMAGE' };
  let complete: boolean;
  try {
    complete = await STRUCTURE_CHECKS[ext](bytes);
  } catch {
    // A read past the end of the buffer: the file stops in the middle.
    complete = false;
  }
  return complete ? { ok: true, ext } : { ok: false, reason: 'DAMAGED' };
}

const STRUCTURE_CHECKS: Record<string, (bytes: Buffer) => boolean | Promise<boolean>> = {
  jpg: isCompleteJpeg,
  png: isCompletePng,
  gif: isCompleteGif,
  webp: isCompleteWebp,
  avif: isCompleteAvif,
};

/** Segments up to the first scan, a frame header with dimensions, then the end-of-image marker after the scan. */
function isCompleteJpeg(bytes: Buffer): boolean {
  let at = 2;
  let hasFrame = false;
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) return false;
    const marker = bytes[at + 1];
    if (marker === 0xff) { at += 1; continue; } // fill byte
    if (marker === 0xd9) return false; // end of image before any scan
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { at += 2; continue; }
    const length = bytes.readUInt16BE(at + 2);
    const end = at + 2 + length;
    if (length < 2 || end > bytes.length) return false;
    // SOF0-SOF15, except DHT (C4), JPG (C8) and DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (length < 7 || bytes.readUInt16BE(at + 5) === 0 || bytes.readUInt16BE(at + 7) === 0) return false;
      hasFrame = true;
    }
    if (marker === 0xda) {
      // Compressed data cannot hold FF D9 (FF bytes are stuffed): the end
      // marker after the first scan is the end of the image.
      return hasFrame && bytes.lastIndexOf(Buffer.from([0xff, 0xd9])) >= end;
    }
    at = end;
  }
  return false;
}

/**
 * #886 review: a PNG is refused (as damaged) past these dimensions, before its
 * pixels are inflated. 16384 px per side and 50 megapixels hold any camera
 * photo (a 48 MP phone sensor included) and keep the inflated data under
 * 400 MB even at 16 bits per channel with alpha. Photos picked in the app are
 * resized in the browser first (#494), so only a crafted file comes near.
 */
export const PNG_MAX_SIDE = 16384;
export const PNG_MAX_PIXELS = 50_000_000;

/** Channels per PNG colour type (grey, RGB, palette, grey + alpha, RGBA). */
const PNG_CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
/** Adam7 passes: x start, y start, x step, y step. */
const ADAM7 = [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]];

/** The exact size of a PNG's inflated pixels (a filter byte per row), from its header; null when out of bounds. */
function pngRawSize(ihdr: Buffer): number | null {
  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  const bitDepth = ihdr[8];
  const channels = PNG_CHANNELS[ihdr[9]];
  if (!channels || width === 0 || height === 0) return null;
  if (width > PNG_MAX_SIDE || height > PNG_MAX_SIDE || width * height > PNG_MAX_PIXELS) return null;
  const rows = (w: number, h: number) => (w === 0 || h === 0 ? 0 : h * (1 + Math.ceil((w * channels * bitDepth) / 8)));
  if (ihdr[12] === 0) return rows(width, height);
  return ADAM7.reduce((total, [x0, y0, dx, dy]) =>
    total + rows(Math.ceil(Math.max(0, width - x0) / dx), Math.ceil(Math.max(0, height - y0) / dy)), 0);
}

/**
 * Every chunk inside the file with a correct CRC, IHDR first, IEND last, and
 * the pixels inflated to exactly the size the header declares — the inflate
 * stops as soon as it goes past it (a small file declaring 1x1 can otherwise
 * inflate to gigabytes).
 */
async function isCompletePng(bytes: Buffer): Promise<boolean> {
  let at = 8;
  const pixels: Buffer[] = [];
  let rawSize: number | null = null;
  while (at + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(at);
    const type = bytes.toString('latin1', at + 4, at + 8);
    const end = at + 12 + length;
    if (end > bytes.length) return false;
    if (zlib.crc32(bytes.subarray(at + 4, at + 8 + length)) !== bytes.readUInt32BE(at + 8 + length)) return false;
    if (rawSize === null) {
      if (type !== 'IHDR' || length !== 13) return false;
      rawSize = pngRawSize(bytes.subarray(at + 8, at + 21));
      if (rawSize === null) return false;
    }
    if (type === 'IDAT') pixels.push(bytes.subarray(at + 8, at + 8 + length));
    if (type === 'IEND') return pixels.length > 0 && inflatesTo(Buffer.concat(pixels), rawSize);
    at = end;
  }
  return false;
}

/** Inflates to the end without keeping the output, true when it is exactly `size` bytes. */
function inflatesTo(data: Buffer, size: number): Promise<boolean> {
  return new Promise((resolve) => {
    const inflate = zlib.createInflate();
    let total = 0;
    const settle = (result: boolean) => {
      inflate.removeAllListeners();
      inflate.on('error', () => undefined);
      inflate.destroy();
      resolve(result);
    };
    inflate.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > size) settle(false);
    });
    inflate.on('end', () => settle(total === size));
    inflate.on('error', () => settle(false));
    inflate.end(data);
  });
}

/** Screen descriptor, then extensions and images block by block up to the trailer. */
function isCompleteGif(bytes: Buffer): boolean {
  if (bytes.readUInt16LE(6) === 0 || bytes.readUInt16LE(8) === 0) return false;
  const colorTable = (flags: number) => (flags & 0x80 ? 3 * 2 ** ((flags & 0x07) + 1) : 0);
  let at = 13 + colorTable(bytes[10]);
  let hasImage = false;
  const skipSubBlocks = () => {
    for (;;) {
      if (at >= bytes.length) throw new RangeError('GIF cut short');
      const size = bytes[at];
      at += 1 + size;
      if (size === 0) return;
    }
  };
  while (at < bytes.length) {
    const block = bytes[at];
    if (block === 0x3b) return hasImage;
    if (block === 0x21) {
      at += 2; // introducer + label
      skipSubBlocks();
    } else if (block === 0x2c) {
      if (at + 10 > bytes.length) return false;
      at += 10 + colorTable(bytes[at + 9]) + 1; // descriptor + local table + LZW code size
      skipSubBlocks();
      hasImage = true;
    } else {
      return false;
    }
  }
  return false;
}

/** The RIFF length inside the file, its chunks inside the RIFF, an image frame among them. */
function isCompleteWebp(bytes: Buffer): boolean {
  const riffEnd = 8 + bytes.readUInt32LE(4);
  if (riffEnd > bytes.length) return false;
  let at = 12;
  let hasFrame = false;
  while (at + 8 <= riffEnd) {
    const type = bytes.toString('latin1', at, at + 4);
    const size = bytes.readUInt32LE(at + 4);
    const end = at + 8 + size + (size % 2);
    if (at + 8 + size > riffEnd) return false;
    if ((type === 'VP8 ' || type === 'VP8L' || type === 'ANMF') && size > 0) hasFrame = true;
    at = end;
  }
  return hasFrame && at >= riffEnd;
}

/** Top-level boxes laid end to end to the end of the file, with the metadata and the media data. */
function isCompleteAvif(bytes: Buffer): boolean {
  let at = 0;
  const seen = new Set<string>();
  while (at < bytes.length) {
    if (at + 8 > bytes.length) return false;
    let size = bytes.readUInt32BE(at);
    const type = bytes.toString('latin1', at + 4, at + 8);
    if (size === 1) {
      if (at + 16 > bytes.length) return false;
      size = Number(bytes.readBigUInt64BE(at + 8));
    } else if (size === 0) {
      size = bytes.length - at; // the last box runs to the end of the file
    }
    if (size < 8 || at + size > bytes.length) return false;
    seen.add(type);
    at += size;
  }
  return seen.has('meta') && seen.has('mdat');
}
