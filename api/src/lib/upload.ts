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
