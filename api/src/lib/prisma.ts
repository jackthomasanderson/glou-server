import { PrismaClient } from "@prisma/client";
import { logger } from "../utils/logger.js";

/**
 * Prisma Client Singleton
 * 
 * This ensures we only create one instance of PrismaClient across the application.
 * Creating multiple instances can exhaust database connections.
 */

// Prevent multiple instances of Prisma Client in development
const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
};

export const prisma =
    globalForPrisma.prisma ??
    new PrismaClient({
        log: process.env.NODE_ENV === "development"
            ? ["query", "error", "warn"]
            : ["error"],
    });

// Log Prisma queries in development
if (process.env.NODE_ENV === "development") {
    logger.info("Prisma Client initialized with query logging");
}

if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prisma;
}

/**
 * Gracefully disconnect Prisma on application shutdown
 */
export async function disconnectPrisma() {
    await prisma.$disconnect();
    logger.info("Prisma disconnected");
}

// Handle process termination
process.on("beforeExit", async () => {
    await disconnectPrisma();
});
