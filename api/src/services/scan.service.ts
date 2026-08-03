import fs from 'fs/promises';
import { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { analyzeLabelImage, OcrExtractedData } from './ocr.service';
import { FieldSource } from './inventory.service';

// ─── FEAT-04: Scan Étiquette & Ajout Express — DB-persisted job queue ────────
// design.md mandates "Traitement asynchrone (Job Queue)" for the OCR
// pipeline but does not mandate a specific broker. This instance has no
// Redis/BullMQ (or any message broker) in its stack, and a self-hosted
// home-lab single-node deployment doesn't warrant adding one just for
// "process one label photo at a time, in-process": a `ScanJob` row polled by
// the client every ~1.5s (see web/hooks/useScan.ts) fills the same role with
// zero new infrastructure, consistent with the fire-and-forget pattern
// already used by audit.service.ts#auditLog and index.ts's startup tasks.

type ScanJob = Awaited<ReturnType<typeof prisma.scanJob.findFirst>> extends infer T | null ? NonNullable<T> : never;

export const scanService = {
  async createJob(userId: string, imagePath: string): Promise<ScanJob> {
    const job = await prisma.scanJob.create({
      data: { userId, imagePath, status: 'pending' },
    });
    // Not awaited: POST /api/scan responds 202 immediately, processing
    // continues in the background. Errors are persisted onto the job row
    // itself (see processJob's catch) rather than thrown here.
    void this.processJob(job.id).catch((err) => {
      console.error('[scan] Unexpected processJob failure:', err);
    });
    return job;
  },

  async processJob(jobId: string): Promise<void> {
    const job = await prisma.scanJob.findUnique({ where: { id: jobId } });
    if (!job) return;

    await prisma.scanJob.update({ where: { id: jobId }, data: { status: 'processing' } });

    try {
      const buffer = await fs.readFile(job.imagePath);
      const base64 = buffer.toString('base64');
      const extracted = await analyzeLabelImage(base64);
      await prisma.scanJob.update({
        where: { id: jobId },
        data: { status: 'done', extractedData: extracted as Prisma.InputJsonValue, errorMessage: null },
      });
    } catch (error) {
      await prisma.scanJob.update({
        where: { id: jobId },
        data: { status: 'failed', errorMessage: error instanceof Error ? error.message : String(error) },
      });
    }
    // NOTE: the uploaded photo (uploads/scans/*) is intentionally kept on
    // disk after processing — it isn't deleted here. It is purged later,
    // once older than 24h, by `purgeExpiredScanFiles` below (wired into
    // MaintenanceService.runRetentionCleanup, FEAT-39 pattern).
  },

  /**
   * Scoped by userId — see the `ScanJob` model comment in schema.prisma:
   * this is "whose scanning session is this", not an inventory access
   * filter, so it does not violate the design.md userId-is-audit-only
   * invariant (which governs InventoryItem/Cellar/etc., not this transient
   * per-session processing artifact).
   */
  async getJob(userId: string, id: string, client: Prisma.TransactionClient | PrismaClient = prisma): Promise<ScanJob | null> {
    return client.scanJob.findFirst({ where: { id, userId } });
  },

  /**
   * Used by POST /api/inventory when the client passes `scanJobId`: re-reads
   * the job's extracted data server-side and returns a `fieldSources` map
   * (FEAT-05) tagging exactly the fields it actually populated as 'ocr'. The
   * client never supplies this map directly — only the job id — so it can't
   * spoof provenance on a field the job didn't really extract.
   * Returns undefined (no tagging, not a hard failure) if the job is
   * missing, not owned by this user, or not yet done.
   */
  async computeOcrFieldSources(
    userId: string,
    scanJobId: string,
    category: string,
  ): Promise<Partial<Record<string, FieldSource>> | undefined> {
    const job = await this.getJob(userId, scanJobId);
    if (!job || job.status !== 'done' || !job.extractedData) return undefined;

    const extracted = job.extractedData as OcrExtractedData;
    const sources: Partial<Record<string, FieldSource>> = {};

    if (extracted.name) sources.name = 'ocr';
    if (extracted.producer) sources.producer = 'ocr';
    if (extracted.vintage) sources.vintage = 'ocr';
    if (extracted.category) sources.category = 'ocr';
    if (extracted.contenance) sources[category === 'cigar' ? 'format' : 'bottleSize'] = 'ocr';

    return Object.keys(sources).length > 0 ? sources : undefined;
  },

  /**
   * Delete on-disk scan photos (uploads/scans/*) older than `retentionHours`
   * and mark their ScanJob row as 'expired' so it's visibly distinguished
   * from a live job whose file still exists. Reuses the existing free-form
   * `status` String column — ScanJob.status is a plain String in
   * schema.prisma, not a Prisma enum, so no schema change is needed to add
   * this value. `imagePath` is deliberately left untouched (it's a
   * non-nullable column): a schema change to null it out or add a dedicated
   * "purgedAt" field is left for a follow-up (schema.prisma is out of scope
   * here — another agent owns it in parallel).
   * Called by MaintenanceService.runRetentionCleanup (FEAT-39 pattern), can
   * participate in the same `$transaction` via the `client` param.
   */
  async purgeExpiredScanFiles(
    retentionHours = 24,
    client: Prisma.TransactionClient | PrismaClient = prisma,
  ): Promise<number> {
    const cutoff = new Date(Date.now() - retentionHours * 60 * 60 * 1000);
    const staleJobs = await client.scanJob.findMany({
      where: { createdAt: { lt: cutoff }, status: { not: 'expired' } },
      select: { id: true, imagePath: true },
    });
    if (staleJobs.length === 0) return 0;

    for (const job of staleJobs) {
      try {
        await fs.unlink(job.imagePath);
      } catch (err) {
        // ENOENT (file already gone) is expected and fine. Anything else is
        // logged but must not block marking the row 'expired', otherwise a
        // permission error would make this job retried forever.
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
          console.error(`[scan] Failed to purge scan file ${job.imagePath}:`, err);
        }
      }
    }

    const result = await client.scanJob.updateMany({
      where: { id: { in: staleJobs.map((j) => j.id) } },
      data: { status: 'expired', errorMessage: 'Scan photo purged after the 24h retention window.' },
    });
    return result.count;
  },
};
