import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Request } from 'express';

const uploadDir = path.join(process.cwd(), 'uploads', 'avatars');

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req: Request, file, cb) => {
        const ext = path.extname(file.originalname);
        const userId = req.userId || 'unknown';
        cb(null, `${userId}-${Date.now()}${ext}`);
    }
});

export const avatarUpload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (_req, file, cb) => {
        if (file.mimetype === 'image/svg+xml') {
            cb(new Error('SVG_NOT_ALLOWED'));
        } else if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('INVALID_FILE_TYPE'));
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
            cb(new Error('INVALID_FILE_TYPE'));
        }
    }
});

export { csvUpload };
