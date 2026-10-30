import { notifyError } from '@/lib/toast';

/**
 * Runs the collection changes of one save together (adds and removals in
 * parallel). A failure is reported once, however many requests failed, then
 * rethrown so the caller keeps its form open.
 */
export async function applyCollectionChanges(changes: Promise<unknown>[]): Promise<void> {
  try {
    await Promise.all(changes);
  } catch (err) {
    notifyError('toast.collection.updateError');
    throw err;
  }
}
