import { prisma, PrismaClientOrTx } from '../lib/prisma';

/**
 * #661: the data personal to a member — their wishlist, consumption goals,
 * bulk-action presets, scan history, reset links, sessions, trusted devices
 * and guest links. What a deleted account must not leave
 * behind, whichever way it goes: the 30-day request (the account is then
 * anonymised, authService.purgeDueAccountDeletions) or an administrator
 * deleting it for good (#695, {@link deleteMemberForGood}).
 *
 * Not touched: the shared inventory, tastings, counts, humidor readings,
 * budget envelopes (household-wide, ISSUE_142) and collections (#476: shared
 * by the household), which stay for everyone.
 *
 * Rows only: the scan photos returned are deleted by the caller once the
 * transaction has committed (#183).
 */
export async function deletePersonalData(
  userIds: string[],
  client: PrismaClientOrTx = prisma,
): Promise<{ scanImagePaths: string[] }> {
  const where = { userId: { in: userIds } };
  const scans = await client.scanJob.findMany({ where, select: { imagePath: true } });
  await client.scanJob.deleteMany({ where });
  await client.wishlistItem.deleteMany({ where });
  await client.consumptionGoal.deleteMany({ where });
  await client.bulkPreset.deleteMany({ where });
  await client.passwordResetToken.deleteMany({ where });
  await client.session.deleteMany({ where });
  await client.trustedDevice.deleteMany({ where });
  await client.guestShare.deleteMany({ where });
  return { scanImagePaths: scans.map((scan) => scan.imagePath) };
}

/**
 * #695: an administrator deletes a member's account for good (the checks —
 * not themselves, not the last admin, their own password — are the route's).
 *
 * - What the member created in the shared inventory (cellars, wines and
 *   bottles, tastings, counts, humidor readings, budget envelopes) is attributed to the
 *   deleting admin: `userId` is an audit field there, and those rows refuse
 *   the deletion otherwise (onDelete: Restrict, ISSUE_098).
 * - Their audit and configuration history stays, detached from the account
 *   (onDelete: SetNull), with the name it was shown under kept in `actorName`.
 * - Their personal data goes ({@link deletePersonalData}); collections they
 *   created stay, without an author (#476).
 *
 * Returns the files to delete once committed (avatar, scan photos).
 */
export async function deleteMemberForGood(
  memberId: string,
  adminId: string,
): Promise<{ username: string; avatarPaths: string[]; scanImagePaths: string[] }> {
  return prisma.$transaction(async (tx) => {
    const member = await tx.user.findUniqueOrThrow({
      where: { id: memberId },
      select: { username: true, displayName: true, avatarUrl: true },
    });
    const author = { where: { userId: memberId } };
    const actorName = member.displayName ?? member.username;
    await tx.auditLog.updateMany({ ...author, data: { actorName } });
    await tx.configChangeLog.updateMany({ ...author, data: { actorName } });

    const toAdmin = { ...author, data: { userId: adminId } };
    await tx.cellar.updateMany(toAdmin);
    await tx.product.updateMany(toAdmin);
    await tx.inventoryItem.updateMany(toAdmin);
    await tx.tastingNote.updateMany(toAdmin);
    await tx.inventoryCountSession.updateMany(toAdmin);
    await tx.humidorReading.updateMany(toAdmin);
    await tx.budgetEnvelope.updateMany(toAdmin);

    const { scanImagePaths } = await deletePersonalData([memberId], tx);
    await tx.user.delete({ where: { id: memberId } });
    return {
      username: member.username,
      avatarPaths: member.avatarUrl ? [member.avatarUrl] : [],
      scanImagePaths,
    };
  });
}
