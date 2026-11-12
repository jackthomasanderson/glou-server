import type { PrismaClientOrTx } from './prisma';

/**
 * Review of #975: the "not the last admin" checks counted the admins before
 * their write. Two admins deleting, deactivating or demoting each other at
 * the same moment both saw the other one stay, and the instance was left with
 * none. Called inside the write's transaction: locks every admin row until
 * it ends (a concurrent caller waits here, then counts what the first one
 * committed), and returns how many active admins other than `userId`, not
 * leaving (#603), remain.
 */
export async function countOtherAdminsLocked(tx: PrismaClientOrTx, userId: string): Promise<number> {
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "isAdmin" = true FOR UPDATE`;
  return tx.user.count({
    where: { isAdmin: true, isActive: true, deletionRequestedAt: null, id: { not: userId } },
  });
}
