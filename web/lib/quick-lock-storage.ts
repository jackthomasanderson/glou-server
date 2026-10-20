import { safeReadStorage, safeRemoveStorage, safeWriteStorage } from './safe-storage';

// FEAT-30 quick lock. #487: the state lives in localStorage (shared by every
// tab and by the installed app across restarts), not sessionStorage, so
// opening a new tab no longer brings back an unlocked app.
export const LOCK_STORAGE_KEY = 'glou:locked';
export const ACTIVITY_STORAGE_KEY = 'glou:last-activity';

function store(): Storage | null {
  return typeof window === 'undefined' ? null : window.localStorage;
}

export function readStoredLock(): boolean {
  const s = store();
  return s ? safeReadStorage(s, LOCK_STORAGE_KEY) === 'true' : false;
}

export function writeStoredLock(locked: boolean): void {
  const s = store();
  if (!s) return;
  if (locked) safeWriteStorage(s, LOCK_STORAGE_KEY, 'true');
  else safeRemoveStorage(s, LOCK_STORAGE_KEY);
}

export function readStoredActivity(): number {
  const s = store();
  const raw = s ? safeReadStorage(s, ACTIVITY_STORAGE_KEY) : null;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : Date.now();
}

export function writeStoredActivity(at: number): void {
  const s = store();
  if (s) safeWriteStorage(s, ACTIVITY_STORAGE_KEY, String(at));
}

/** A fresh sign-in (or a sign-out) starts unlocked: a lock belongs to a session. */
export function clearQuickLock(): void {
  writeStoredLock(false);
  writeStoredActivity(Date.now());
}
