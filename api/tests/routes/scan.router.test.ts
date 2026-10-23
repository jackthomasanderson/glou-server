import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// #639: without the `scan` profile, a photo was uploaded, stored, counted against
// the quota, then failed. The upload is now refused up front, and the quota
// answer is a JSON code the client can explain.

vi.mock('../../src/middleware/auth.middleware', () => ({
  // The scan quota is kept per member for the whole file: a test that counts
  // against it uses its own member.
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.userId = req.header('x-test-user') ?? 'u1';
    next();
  },
  getClientIp: () => '127.0.0.1',
}));
const uploadSingle = vi.fn();
vi.mock('../../src/middleware/upload.middleware', () => ({
  scanUpload: {
    single: () => (req: express.Request, _res: express.Response, next: express.NextFunction) => {
      uploadSingle();
      req.file = { path: '/uploads/scans/a.jpg' } as Express.Multer.File;
      next();
    },
  },
}));
vi.mock('../../src/services/scan.service', () => ({
  scanService: { createJob: vi.fn(), getJob: vi.fn() },
}));
vi.mock('../../src/services/ocr.service', () => ({ isScanAvailable: vi.fn() }));
vi.mock('../../src/services/audit.service', () => ({ auditLog: vi.fn() }));

import { scanRouter } from '../../src/routes/scan.router';
import { scanService } from '../../src/services/scan.service';
import { isScanAvailable } from '../../src/services/ocr.service';

const app = express();
app.use(express.json());
app.use('/api/scan', scanRouter);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(scanService.createJob).mockResolvedValue({ id: 'j1' } as never);
});

describe('GET /api/scan/status', () => {
  it('says the scan is available when the service is up', async () => {
    vi.mocked(isScanAvailable).mockResolvedValue(true);
    const res = await request(app).get('/api/scan/status');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { available: true } });
  });

  it('says the scan is unavailable on a standard install', async () => {
    vi.mocked(isScanAvailable).mockResolvedValue(false);
    const res = await request(app).get('/api/scan/status');
    expect(res.body).toEqual({ data: { available: false } });
  });
});

describe('POST /api/scan', () => {
  it('refuses the photo before storing it when the service is off', async () => {
    vi.mocked(isScanAvailable).mockResolvedValue(false);
    const res = await request(app).post('/api/scan');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'SCAN_UNAVAILABLE' });
    expect(uploadSingle).not.toHaveBeenCalled();
    expect(scanService.createJob).not.toHaveBeenCalled();
  });

  it('accepts the photo when the service is up', async () => {
    vi.mocked(isScanAvailable).mockResolvedValue(true);
    const res = await request(app).post('/api/scan');
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ data: { jobId: 'j1' } });
    expect(scanService.createJob).toHaveBeenCalledWith('u1', '/uploads/scans/a.jpg');
  });

  it('does not count refused uploads against the quota, and answers the quota with a JSON code', async () => {
    const asQuotaMember = () => request(app).post('/api/scan').set('x-test-user', 'quota-member');
    vi.mocked(isScanAvailable).mockResolvedValue(false);
    for (let i = 0; i < 12; i++) await asQuotaMember();

    vi.mocked(isScanAvailable).mockResolvedValue(true);
    for (let i = 0; i < 10; i++) {
      expect((await asQuotaMember()).status).toBe(202);
    }
    const res = await asQuotaMember();
    expect(res.status).toBe(429);
    expect(res.body).toEqual({ error: 'SCAN_RATE_LIMITED' });
  });
});
