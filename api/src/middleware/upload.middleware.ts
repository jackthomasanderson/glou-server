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
