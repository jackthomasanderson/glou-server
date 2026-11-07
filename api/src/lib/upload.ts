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
