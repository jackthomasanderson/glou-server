import { safeReadStorage, safeRemoveStorage, safeWriteStorage } from './safe-storage';

// FEAT-30 quick lock. #487: the state lives in localStorage (shared by every
// tab and by the installed app across restarts), not sessionStorage, so
// opening a new tab no longer brings back an unlocked app.
export const LOCK_STORAGE_KEY = 'glou:locked';
export const ACTIVITY_STORAGE_KEY = 'glou:last-activity';

export function readStoredLock(): boolean {
  return safeReadStorage('local', LOCK_STORAGE_KEY) === 'true';
}

export function writeStoredLock(locked: boolean): void {
  if (locked) safeWriteStorage('local', LOCK_STORAGE_KEY, 'true');
  else safeRemoveStorage('local', LOCK_STORAGE_KEY);
}

export function readStoredActivity(): number {
  const raw = safeReadStorage('local', ACTIVITY_STORAGE_KEY);
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : Date.now();
}

export function writeStoredActivity(at: number): void {
  safeWriteStorage('local', ACTIVITY_STORAGE_KEY, String(at));
}

/** A fresh sign-in (or a sign-out) starts unlocked: a lock belongs to a session. */
export function clearQuickLock(): void {
  writeStoredLock(false);
  writeStoredActivity(Date.now());
}
