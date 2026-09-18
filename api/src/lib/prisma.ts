import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 2000;

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient(): PrismaClient {
  // Prisma 7 is "Rust-free" and requires an explicit driver adapter — the
  // connection string now lives in application code (and prisma.config.ts for
  // the CLI), no longer in schema.prisma's datasource block.
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' });

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development'
      ? ['query', 'info', 'warn', 'error']
      : ['warn', 'error'],
  });
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/**
 * Connect with exponential retry logic.
 * Implements the "5 retries × 2s" pattern from design.md infrastructure spec.
 */
export async function connectWithRetry(): Promise<void> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await prisma.$connect();
      console.info(`[prisma] Connected to database (attempt ${attempt})`);
      return;
    } catch (error) {
      console.warn(`[prisma] Connection attempt ${attempt}/${MAX_RETRIES} failed:`, error);
      if (attempt === MAX_RETRIES) {
        throw new Error(`[prisma] Could not connect after ${MAX_RETRIES} attempts. Aborting.`);
      }
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
}
