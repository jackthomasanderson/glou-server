/**
 * #494: photos were stored exactly as taken. A phone photo is often 5-8 MB
 * (over the 5 MB upload limit) and the list shows it as a 120 px thumbnail.
 * Downscale in the browser before uploading: longest side `maxSide`, JPEG
 * stays JPEG, anything else becomes WebP (keeps transparency) when the
 * browser can encode it. No new dependency; the original file is returned
 * untouched whenever resizing is impossible or would not make it smaller.
 * GIFs are left alone (animation).
 */
const RESIZABLE = /^image\/(jpeg|png|webp)$/i;
const EXTENSION: Record<string, string> = { 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/png': 'png' };

export async function downscaleImage(file: File, maxSide = 1200, quality = 0.82): Promise<File> {
  if (!RESIZABLE.test(file.type) || typeof createImageBitmap !== 'function' || typeof document === 'undefined') {
    return file;
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return file;
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const targetType = /jpe?g/i.test(file.type) ? 'image/jpeg' : 'image/webp';
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, targetType, quality));
  // Unsupported encoder falls back to PNG; keep whichever file is smaller.
  if (!blob || blob.size >= file.size || !EXTENSION[blob.type]) return file;
  const name = `${file.name.replace(/\.[^.]+$/, '') || 'photo'}.${EXTENSION[blob.type]}`;
  return new File([blob], name, { type: blob.type, lastModified: Date.now() });
}
