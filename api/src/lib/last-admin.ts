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
  // NO KEY UPDATE: still serialises the callers of this function, without
  // blocking another admin's inserts that reference their row (FK key-share).
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "isAdmin" = true FOR NO KEY UPDATE`;
  return countOtherAdmins(tx, userId);
}

/** The same count, unlocked: the early check made before a step-up, so a refusal spends no backup code. */
export function countOtherAdmins(client: PrismaClientOrTx, userId: string): Promise<number> {
  return client.user.count({
    where: { isAdmin: true, isActive: true, deletionRequestedAt: null, id: { not: userId } },
  });
}
