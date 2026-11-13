import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors';
import { ALLOWED_IMAGE_TYPES, inspectImage } from '../lib/upload';

// A rejected upload is the caller's mistake, so every `fileFilter` below hands
// back an AppError carrying its own 400; multer's own LIMIT_FILE_SIZE becomes a
// 413 in error.middleware.ts. Neither is a 500 any more (ISSUE_105).
const uploadDir = path.join(process.cwd(), 'uploads', 'avatars');

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, uploadDir);
    },
    // ISSUE_050: `${userId}-${Date.now()}` is not a secret — the user id is
    // known to every member and appears in API responses, and the filename
    // is recoverable by sweeping a millisecond time range. Random, like
    // search.router.ts's product-image upload already does; the owning
    // user lives in the database (the column this path is stored into),
    // never in the filename itself.
    filename: (_req, file, cb) => {
        const ext = ALLOWED_IMAGE_TYPES[file.mimetype.toLowerCase()] ?? 'jpg';
        cb(null, `${crypto.randomUUID()}.${ext}`);
    }
});

export const avatarUpload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (_req, file, cb) => {
        if (file.mimetype === 'image/svg+xml') {
            cb(new AppError(400, 'SVG_NOT_ALLOWED'));
        } else if (file.mimetype.toLowerCase() in ALLOWED_IMAGE_TYPES) {
            cb(null, true);
        } else {
            cb(new AppError(400, 'INVALID_FILE_TYPE'));
        }
    }
});

// ─── FEAT-56: CSV Import (Onboarding Setup Wizard) ───────────────────────────
// Memory storage only — the file is parsed in-memory and never written to
// disk, both at /preview (no persistence at all) and /confirm (the client
// re-sends the already-parsed rows, not the file itself).
const csvUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB limit — onboarding convenience import, not a bulk tool
    fileFilter: (_req, file, cb) => {
        const isCsv =
            file.mimetype === 'text/csv' ||
            file.mimetype === 'application/vnd.ms-excel' || // Excel on Windows often reports CSV as this mimetype
            file.originalname.toLowerCase().endsWith('.csv');
        if (isCsv) {
            cb(null, true);
        } else {
            cb(new AppError(400, 'INVALID_FILE_TYPE'));
        }
    }
});

// ─── FEAT-04: Scan Étiquette & Ajout Express ─────────────────────────────────
// Disk storage (not memory): the image is handed to the OCR/vision service
// (ocr.service.ts) from the background job, not inline in the request, and
// `ScanJob.imagePath` persists the path for the lifetime of the job so it
// survives a process step boundary the same way avatarUpload's files do.
const scanUploadDir = path.join(process.cwd(), 'uploads', 'scans');

if (!fs.existsSync(scanUploadDir)) {
    fs.mkdirSync(scanUploadDir, { recursive: true });
}

const scanUpload = multer({
    storage: multer.diskStorage({
        destination: (_req, _file, cb) => cb(null, scanUploadDir),
        // ISSUE_050: same reasoning as avatarUpload's storage above.
        filename: (_req, file, cb) => {
            const ext = ALLOWED_IMAGE_TYPES[file.mimetype.toLowerCase()] ?? 'jpg';
            cb(null, `${crypto.randomUUID()}.${ext}`);
        },
    }),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB — label photos from a phone camera
    fileFilter: (_req, file, cb) => {
        if (file.mimetype === 'image/svg+xml') {
            cb(new AppError(400, 'SVG_NOT_ALLOWED'));
        } else if (file.mimetype.toLowerCase() in ALLOWED_IMAGE_TYPES) {
            cb(null, true);
        } else {
            cb(new AppError(400, 'INVALID_FILE_TYPE'));
        }
    },
});

export { csvUpload, scanUpload };

/**
 * #886: runs after an image upload (avatar, label scan, product photo). The
 * `fileFilter`s above only see the declared type: the stored bytes are now
 * judged like a downloaded photo (`inspectImage`). A file that is not an
 * image (400 INVALID_FILE_TYPE) or cannot be read to its end (422
 * IMAGE_DAMAGED) is deleted at once; a real image declared under another
 * type is renamed to the extension of what it really is.
 */
export async function verifyStoredImage(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const file = req.file;
  if (!file) return next();
  const inspection = await inspectImage(await fs.promises.readFile(file.path));
  if (!inspection.ok) {
    await fs.promises.rm(file.path, { force: true });
    throw inspection.reason === 'DAMAGED' ? new AppError(422, 'IMAGE_DAMAGED') : new AppError(400, 'INVALID_FILE_TYPE');
  }
  if (path.extname(file.filename) !== `.${inspection.ext}`) {
    const filename = `${path.basename(file.filename, path.extname(file.filename))}.${inspection.ext}`;
    const renamed = path.join(path.dirname(file.path), filename);
    await fs.promises.rename(file.path, renamed);
    file.filename = filename;
    file.path = renamed;
  }
  next();
}
