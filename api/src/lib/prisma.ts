import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 2000;

function toNum(value: Prisma.Decimal | null) {
  return value === null ? null : value.toNumber();
}

function createPrismaClient() {
  // Prisma 7 is "Rust-free" and requires an explicit driver adapter — the
  // connection string now lives in application code (and prisma.config.ts for
  // the CLI), no longer in schema.prisma's datasource block.
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' });

  const client = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development'
      ? ['query', 'info', 'warn', 'error']
      : ['warn', 'error'],
  });

  // ISSUE_172: these columns are NUMERIC(12,2) in Postgres, which the
  // driver maps to Prisma.Decimal rather than `number`. Every caller in
  // this codebase (and the whole API response contract) expects a plain
  // JS number, same as before the Float→Decimal migration — overriding
  // these fields here means the ~15 InventoryService methods, the
  // wishlist CRUD, etc. don't each need their own conversion.
  //
  // This does NOT cover aggregate queries (`_sum`/`_avg`/...) — those
  // still return a raw Decimal and must be converted at the call site via
  // `lib/decimal.ts`'s `toNumber`.
  //
  // shares.service.ts's conditional `purchasePrice`/`estimatedValue`
  // select (hidden from guest shares) is NOT relied upon alone for that
  // redaction — see the explicit post-fetch `delete` there — so this
  // extension computing the field regardless of the caller's `select`
  // cannot reopen that confidentiality gap.
  return client.$extends({
    name: 'money-fields-as-number',
    result: {
      inventoryItem: {
        purchasePrice: { needs: { purchasePrice: true }, compute: (item) => toNum(item.purchasePrice) },
        estimatedValue: { needs: { estimatedValue: true }, compute: (item) => toNum(item.estimatedValue) },
      },
      wishlistItem: {
        maxPrice: { needs: { maxPrice: true }, compute: (item) => toNum(item.maxPrice) },
        lastSeenPrice: { needs: { lastSeenPrice: true }, compute: (item) => toNum(item.lastSeenPrice) },
      },
      budgetEnvelope: {
        amount: { needs: { amount: true }, compute: (item) => item.amount.toNumber() },
      },
    },
  });
}

const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof createPrismaClient> };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

/**
 * The interactive-transaction callback's `tx` parameter, derived from the
 * extended client rather than the raw `Prisma.TransactionClient` — so
 * functions accepting either `prisma` or a `tx` (e.g. for a caller that
 * already holds a transaction) see the same money-fields-as-number result
 * types on both.
 */
export type PrismaTransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
export type PrismaClientOrTx = typeof prisma | PrismaTransactionClient;

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
