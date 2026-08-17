/**
 * Upload validation for guest-supplied images.
 *
 * A public file upload is the highest-risk surface in this app, so nothing
 * here trusts the browser. The declared Content-Type is ignored entirely — it
 * is a string the client picks — and the decision is made from the bytes.
 */

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export type ImageKind = 'jpeg' | 'png' | 'webp';

const SIGNATURES: { kind: ImageKind; test: (b: Buffer) => boolean }[] = [
  {
    kind: 'jpeg',
    test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    kind: 'png',
    test: (b) =>
      b.length > 8 &&
      b[0] === 0x89 &&
      b[1] === 0x50 &&
      b[2] === 0x4e &&
      b[3] === 0x47 &&
      b[4] === 0x0d &&
      b[5] === 0x0a &&
      b[6] === 0x1a &&
      b[7] === 0x0a,
  },
  {
    kind: 'webp',
    test: (b) =>
      b.length > 12 &&
      b.toString('ascii', 0, 4) === 'RIFF' &&
      b.toString('ascii', 8, 12) === 'WEBP',
  },
];

/** Returns the real image type, or null if the bytes are not one we accept. */
export function sniffImage(buffer: Buffer): ImageKind | null {
  for (const sig of SIGNATURES) {
    if (sig.test(buffer)) return sig.kind;
  }
  return null;
}

export interface ProcessedImage {
  data: Buffer;
  contentType: 'image/jpeg';
  extension: 'jpg';
  width: number;
  height: number;
}

/**
 * Re-encodes an uploaded image to a clean JPEG.
 *
 * This is the security step, not a cosmetic one. Decoding and re-encoding
 * discards EXIF (which carries the guest's GPS coordinates and device id),
 * strips any appended payload riding along after the image data, and
 * guarantees the stored file really is the image type it claims to be.
 */
export async function processUpload(input: Buffer): Promise<ProcessedImage> {
  const kind = sniffImage(input);
  if (!kind) {
    throw new UploadError('ไฟล์ต้องเป็นรูปภาพ JPG, PNG หรือ WebP เท่านั้น');
  }
  if (input.length > MAX_UPLOAD_BYTES) {
    throw new UploadError('ไฟล์ใหญ่เกิน 5MB');
  }

  const sharp = (await import('sharp')).default;

  // `limitInputPixels` caps decompression-bomb images: a 100MB PNG can expand
  // to gigabytes of raw pixels and take the function down.
  const pipeline = sharp(input, { limitInputPixels: 50_000_000, failOn: 'error' });

  const metadata = await pipeline.metadata();
  if (!metadata.width || !metadata.height) {
    throw new UploadError('ไม่สามารถอ่านไฟล์รูปภาพนี้ได้');
  }

  const data = await pipeline
    .rotate() // apply EXIF orientation before we throw the EXIF away
    .resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();

  return {
    data,
    contentType: 'image/jpeg',
    extension: 'jpg',
    width: metadata.width,
    height: metadata.height,
  };
}

export class UploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UploadError';
  }
}
