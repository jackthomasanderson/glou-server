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
    // disk after processing rather than deleted here — deleting files is
    // explicitly avoided in this environment/workflow. A future retention
    // pass (mirroring MaintenanceService's pattern for Sessions/TrustedDevice
    // in FEAT-39) could purge old scan photos; out of scope for this feature.
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
};
