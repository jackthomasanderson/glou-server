const TRASH_RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export const getDaysUntilPermanentDelete = (deletedAt: string | null): number | null => {
  if (!deletedAt) return null;
  const now = Date.now();
  const deletedTime = new Date(deletedAt).getTime();
  const remaining = TRASH_RETENTION_MS - (now - deletedTime);
  if (remaining <= 0) return null;
  return Math.ceil(remaining / (24 * 60 * 60 * 1000));
};

export const trashRetentionMs = TRASH_RETENTION_MS;
