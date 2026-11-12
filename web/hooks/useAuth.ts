'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { clearOfflineData } from '@/lib/offline/db';
import { apiErrorFrom, client, request } from '@/lib/api';
import { isNetworkFailure } from '@/lib/auth/error-message';
import { notifyError, notifySuccess } from '@/lib/toast';
import { clearQuickLock } from '@/lib/quick-lock-storage';
import { resetReviewBanner } from '@/lib/review/banner';
import { DEFAULT_LANDING, postLoginPath } from '@/lib/auth/next-path';
import type { ExportCategory, PublicUser as PublicUserContract } from '@shared/auth';
import type { Wire } from '@shared/wire';
import type { OnboardingState } from '@shared/onboarding';
import { qk } from '@/lib/queryKeys';

/** The signed-in member as the API sends it (#466: declared once in shared/auth.ts). */
export type PublicUser = Wire<PublicUserContract>;

const ME_KEY = qk.auth.me;
// FEAT-90: "Later" belongs to one sign-in, so a new sign-in drops the cached state.
const ONBOARDING_STATE_KEY = qk.auth.onboarding;
const SESSIONS_KEY = qk.auth.sessions;
// #766: whether this device skips the 2FA code.
const TRUSTED_DEVICE_KEY = qk.auth.trustedDevice;
// #638: how many 2FA backup codes are left.
const BACKUP_CODES_KEY = qk.auth.backupCodes;

export interface SessionInfo {
  id: string;
  device: { browser: string | null; os: string | null };
  location: { city: string | null; country: string | null } | null;
  createdAt: string;
  lastActiveAt: string;
  rememberMe: boolean;
  isCurrent: boolean;
}

// ─── useMe ──────────────────────────────────────────────────────────────────

export function useMe() {
  return useQuery<PublicUser | null>({
    queryKey: ME_KEY,
    queryFn: async ({ signal }) => {
      // Only "the server answered: not authenticated" means "no user".
      // Network failures, timeouts (#619) and 5xx errors must propagate so the
      // guard says the server cannot be reached rather than bouncing a
      // signed-in member to /login during a brief outage (#341).
      const res = await request('/user/me', { signal });
      if (res.status === 401 || res.status === 403) return null;
      if (!res.ok) throw await apiErrorFrom(res);
      const json = (await res.json()) as { data?: PublicUser };
      return json.data as PublicUser;
    },
    // #619: a server that does not answer is said after one deadline (15 s),
    // not three; a 5xx is still tried again.
    retry: (failureCount, error) => !isNetworkFailure(error) && failureCount < 2,
    staleTime: Infinity,
  });
}

// ─── useLogin ────────────────────────────────────────────────────────────────

export function useLogin() {
  const queryClient = useQueryClient();
  const router = useRouter();
  return useMutation<PublicUser & { requires2fa?: boolean }, Error, { identifier: string; password: string; rememberMe?: boolean }>({
    // Said by the sign-in form.
    meta: { handlesError: true },
    mutationFn: async (data) => (await client.post<PublicUser & { requires2fa?: boolean }>('/auth/login', data)).data,
    onSuccess: (data) => {
      if (data.requires2fa) {
        // Will be handled by the component
        return;
      }
      queryClient.setQueryData<PublicUser | null>(ME_KEY, data);
      queryClient.removeQueries({ queryKey: ONBOARDING_STATE_KEY });
      clearQuickLock();
      // #471 (QP5): "Plus tard" on the review banner lasts until the next sign-in.
      resetReviewBanner();
      router.push(postLoginPath(window.location.search));
    },
  });
}

// ─── useRegister ─────────────────────────────────────────────────────────────

export function useRegister() {
  const queryClient = useQueryClient();
  const router = useRouter();
  return useMutation<
    PublicUser,
    Error,
    { username: string; email: string; password: string; language?: 'FR' | 'EN' }
  >({
    // Said by the sign-up form.
    meta: { handlesError: true },
    mutationFn: async (data) =>
      (await client.post<PublicUser>('/auth/register', data)).data,
    onSuccess: (user) => {
      queryClient.setQueryData<PublicUser | null>(ME_KEY, user);
      queryClient.removeQueries({ queryKey: ONBOARDING_STATE_KEY });
      resetReviewBanner();
      router.push(DEFAULT_LANDING);
    },
  });
}

// ─── useLogout ───────────────────────────────────────────────────────────────

/**
 * Shared-device safety: the Service Worker (FEAT-16/23, see next.config.mjs)
 * caches GET /api/inventory|cellars|collections responses in Cache Storage
 * (cache name `glou-inventory-data`, plus next-pwa's default runtime caches
 * for other same-origin GETs) for up to 24h, and the offline IndexedDB
 * mirror (web/lib/offline/db.ts) keeps its own copy. Neither is cleared by
 * React Query's in-memory cache reset alone, so on a shared household device
 * that data would remain readable after sign-out. We delete every Cache
 * Storage entry (simplest reliable way to guarantee no residual
 * inventory/API data survives — cheaper to let Workbox repopulate static
 * asset caches on next load than to risk missing a cache name) and wipe the
 * IndexedDB stores. Never throws: cache-clearing failures must not block
 * logging the user out.
 */
async function clearOfflineCaches(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch (err) {
    console.error('[logout] Failed to clear Cache Storage:', err);
  }
  try {
    await clearOfflineData();
  } catch (err) {
    console.error('[logout] Failed to clear offline IndexedDB store:', err);
  }
}

export function useLogout() {
  const queryClient = useQueryClient();
  const router = useRouter();
  return useMutation<void, Error, void>({
    // Signed out on this device whatever the server answers: nothing to say.
    meta: { handlesError: true },
    mutationFn: async () => {
      try {
        await client.post('/auth/logout');
      } finally {
        // Always purge local caches, even if the server-side call failed —
        // on a shared device the local data must not linger either way.
        await clearOfflineCaches();
      }
    },
    onSettled: () => {
      queryClient.setQueryData(ME_KEY, null);
      queryClient.clear();
      clearQuickLock();
      // #471 (QP5): "Plus tard" on the review banner lasts until the next sign-in.
      resetReviewBanner();
      router.push('/login');
    },
  });
}

// ─── useUpdateProfile ────────────────────────────────────────────────────────

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation<PublicUser, Error, { displayName?: string | null; appName?: string | null; appSlogan?: string | null }>({
    meta: { handlesError: true },
    mutationFn: async (data) =>
      (await client.patch<PublicUser>('/user/profile', data)).data,
    onSuccess: (updatedUser) => {
      queryClient.setQueryData<PublicUser | null>(ME_KEY, updatedUser);
    },
    // Success is already acknowledged inline by the profile page; only the
    // failure path was silent (ISSUE_120).
    onError: () => notifyError('profile.saveError'),
  });
}

// ─── useUploadAvatar ─────────────────────────────────────────────────────────

export function useUploadAvatar() {
  const queryClient = useQueryClient();
  return useMutation<PublicUser, Error, File>({
    // Said by AvatarUploader.
    meta: { handlesError: true },
    mutationFn: async (file) => {
      const formData = new FormData();
      formData.append('avatar', file);
      return (await client.upload<PublicUser>('/user/avatar', formData, { codeByStatus: { 413: 'FILE_TOO_LARGE' } })).data;
    },
    onSuccess: (updatedUser) => {
      queryClient.setQueryData<PublicUser | null>(ME_KEY, updatedUser);
    },
  });
}

// ─── useDeleteAvatar ─────────────────────────────────────────────────────────

export function useDeleteAvatar() {
  const queryClient = useQueryClient();
  return useMutation<PublicUser, Error, void>({
    // Said by AvatarUploader.
    meta: { handlesError: true },
    mutationFn: async () => (await client.delete<PublicUser>('/user/avatar')).data,
    onSuccess: (updatedUser) => {
      queryClient.setQueryData<PublicUser | null>(ME_KEY, updatedUser);
    },
  });
}
// ─── useUpdateEmail ──────────────────────────────────────────────────────────

export function useUpdateEmail() {
  const queryClient = useQueryClient();
  // The current password is required server-side (ISSUE_042): changing the
  // account email reroutes the password-reset channel.
  return useMutation<PublicUser, Error, { email: string; currentPassword: string }>({
    // Said by the form (AccountSecurity).
    meta: { handlesError: true },
    mutationFn: async (data) =>
      (await client.patch<PublicUser>('/user/email', data)).data,
    onSuccess: (updatedUser) => {
      queryClient.setQueryData<PublicUser | null>(ME_KEY, updatedUser);
    },
  });
}

// ─── useUpdateUsername ───────────────────────────────────────────────────────

// #911: the username is a sign-in identifier: the password is asked for, like
// for the e-mail.
export function useUpdateUsername() {
  const queryClient = useQueryClient();
  return useMutation<PublicUser, Error, { username: string; currentPassword: string }>({
    // Said by the form (AccountSecurity).
    meta: { handlesError: true },
    mutationFn: async (data) =>
      (await client.patch<PublicUser>('/user/username', data)).data,
    onSuccess: (updatedUser) => {
      queryClient.setQueryData<PublicUser | null>(ME_KEY, updatedUser);
    },
  });
}

// ─── useUpdatePassword ───────────────────────────────────────────────────────

export function useUpdatePassword() {
  const queryClient = useQueryClient();
  return useMutation<{ success: boolean }, Error, { currentPassword: string; newPassword: string }>({
    // Said by the form (AccountSecurity, ForcedPasswordChange).
    meta: { handlesError: true },
    mutationFn: async (data) =>
      (await client.patch<{ success: boolean }>('/user/password', data)).data,
    // #766: the server revoked every trusted device.
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRUSTED_DEVICE_KEY });
    },
  });
}

// ─── useUpdatePreferences ───────────────────────────────────────────────────

export function useUpdatePreferences() {
  const queryClient = useQueryClient();
  return useMutation<
    PublicUser,
    Error,
    {
      theme?: 'LIGHT' | 'DARK' | 'SYSTEM';
      language?: 'FR' | 'EN';
      tempUnit?: 'CELSIUS' | 'FAHRENHEIT';
      accentColor?: string;
      dateFormat?: 'SYSTEM' | 'H24' | 'H12';
      autoLockDelayMin?: 5 | 15 | 30 | null;
      expertMode?: boolean;
    }
  >({
    meta: { handlesError: true },
    mutationFn: async (data) =>
      (await client.patch<PublicUser>('/user/preferences', data)).data,
    onSuccess: (updatedUser) => {
      queryClient.setQueryData<PublicUser | null>(ME_KEY, updatedUser);
    },
    onError: () => notifyError('profile.saveError'),
  });
}

// ─── 2FA Methods ────────────────────────────────────────────────────────────

export function useGenerate2fa() {
  return useMutation<{ qrCodeUrl: string; secret: string }, Error, void>({
    // Said by TwoFactorSettings.
    meta: { handlesError: true },
    mutationFn: async () => (await client.post<{ qrCodeUrl: string; secret: string }>('/auth/2fa/generate')).data,
  });
}

export function useTurnOn2fa() {
  const queryClient = useQueryClient();
  // #603: the password too, checked by the API.
  return useMutation<{ backupCodes: string[] }, Error, { password: string; code: string }>({
    // Said by TwoFactorSettings.
    meta: { handlesError: true },
    mutationFn: async (data) => (await client.post<{ backupCodes: string[] }>('/auth/2fa/turn-on', data)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ME_KEY });
      queryClient.invalidateQueries({ queryKey: BACKUP_CODES_KEY });
      // #766: devices trusted before are revoked by the server.
      queryClient.invalidateQueries({ queryKey: TRUSTED_DEVICE_KEY });
    },
  });
}

export function useTurnOff2fa() {
  const queryClient = useQueryClient();
  return useMutation<{ success: boolean }, Error, { password: string; code?: string }>({
    // Said by TwoFactorSettings.
    meta: { handlesError: true },
    mutationFn: async (data) => (await client.post<{ success: boolean }>('/auth/2fa/turn-off', data)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ME_KEY });
      queryClient.invalidateQueries({ queryKey: BACKUP_CODES_KEY });
      // #766: turning 2FA off revokes the trusted devices: nothing cached may come back.
      queryClient.removeQueries({ queryKey: TRUSTED_DEVICE_KEY });
    },
  });
}

/** #638: unused backup codes left, only asked for while 2FA is on. */
export function useBackupCodesCount(enabled: boolean) {
  return useQuery<number>({
    queryKey: BACKUP_CODES_KEY,
    queryFn: async () => (await client.get<{ remaining: number }>('/user/backup-codes')).data.remaining,
    enabled,
  });
}

/** #638: new backup codes (the old ones stop working), returned once. */
export function useRegenerateBackupCodes() {
  const queryClient = useQueryClient();
  return useMutation<{ backupCodes: string[] }, Error, { password: string; code: string }>({
    // Said by the dialog.
    meta: { handlesError: true },
    mutationFn: async (data) => (await client.post<{ backupCodes: string[] }>('/auth/2fa/backup-codes', data)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BACKUP_CODES_KEY });
    },
  });
}

export function useVerify2faLogin() {
  const queryClient = useQueryClient();
  const router = useRouter();
  return useMutation<PublicUser, Error, { code: string; trustDevice?: boolean }>({
    // Said by the sign-in form.
    meta: { handlesError: true },
    mutationFn: async (data) => (await client.post<PublicUser>('/auth/2fa/verify-login', data)).data,
    onSuccess: (user) => {
      queryClient.setQueryData<PublicUser | null>(ME_KEY, user);
      queryClient.removeQueries({ queryKey: ONBOARDING_STATE_KEY });
      clearQuickLock();
      // #471 (QP5): "Plus tard" on the review banner lasts until the next sign-in.
      resetReviewBanner();
      router.push(postLoginPath(window.location.search));
    },
  });
}

// ─── Sessions & Trusted Devices (FEAT-25) ───────────────────────────────────

export function useSessions() {
  return useQuery<SessionInfo[]>({
    queryKey: SESSIONS_KEY,
    queryFn: async () => (await client.get<SessionInfo[]>('/auth/sessions')).data,
  });
}

export function useRevokeSession() {
  const queryClient = useQueryClient();
  return useMutation<{ ok: boolean }, Error, string>({
    mutationFn: async (sessionId) => (await client.delete<{ ok: boolean }>(`/auth/sessions/${sessionId}`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SESSIONS_KEY });
    },
  });
}

// #766: whether this device skips the 2FA code, and until when (ISO date or
// null) — the trusted-device cookie is httpOnly. Asked only with 2FA on.
export function useTrustedDevice(enabled: boolean) {
  return useQuery<{ trustedUntil: string | null }>({
    queryKey: TRUSTED_DEVICE_KEY,
    queryFn: async () => (await client.get<{ trustedUntil: string | null }>('/auth/trust-device')).data,
    enabled,
  });
}

// ISSUE_045: a trusted device is a lasting (30-day, self-renewing) 2FA
// bypass — minting one now re-confirms identity (password, plus a TOTP/
// backup code when 2FA is enabled) the same way turning 2FA off does.
export function useTrustDevice() {
  const queryClient = useQueryClient();
  return useMutation<{ ok: boolean }, Error, { password: string; code?: string }>({
    // Said by TrustedDeviceSettings.
    meta: { handlesError: true },
    mutationFn: async (body) => (await client.post<{ ok: boolean }>('/auth/trust-device', body)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRUSTED_DEVICE_KEY });
    },
  });
}

export function useUntrustDevice() {
  const queryClient = useQueryClient();
  return useMutation<{ ok: boolean }, Error, void>({
    // Said by TrustedDeviceSettings.
    meta: { handlesError: true },
    mutationFn: async () => (await client.delete<{ ok: boolean }>('/auth/trust-device')).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRUSTED_DEVICE_KEY });
    },
  });
}

// ─── RGPD (FEAT-38) ──────────────────────────────────────────────────────────

// FEAT-18: categories are optional — omitted/empty means "export everything",
// preserving the original FEAT-38 full-export behavior. The list itself is in
// shared/auth.ts (#466).
export type { ExportCategory };

export function useExportData() {
  return useMutation<void, Error, ExportCategory[] | void>({
    mutationFn: async (categories) => {
      const query = categories && categories.length > 0 ? `?categories=${categories.join(',')}` : '';
      const { blob } = await client.blob(`/user/export${query}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'glou-export.json';
      a.click();
      URL.revokeObjectURL(url);
    },
  });
}

export function useRequestAccountDeletion() {
  const queryClient = useQueryClient();
  // #603: the password is checked by the API; refusals are said by the dialog.
  return useMutation<void, Error, { password: string }>({
    meta: { handlesError: true },
    mutationFn: async (data) => { await client.post('/user/delete-account', data); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ME_KEY });
    },
  });
}

export function useCancelAccountDeletion() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, void>({
    mutationFn: async () => { await client.post('/user/cancel-delete'); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ME_KEY });
    },
  });
}

// ─── Quick Lock & Auto-Lock (FEAT-30) ───────────────────────────────────────
// Client-side lock only: unlocking never re-authenticates and never touches
// the session/JWT — it's a pure password/PIN check (see auth.service.ts).

export function useSetPin() {
  const queryClient = useQueryClient();
  return useMutation<{ ok: boolean }, Error, { password: string; pin: string }>({
    // Said by the form (AccountSecurity).
    meta: { handlesError: true },
    mutationFn: async (data) => (await client.post<{ ok: boolean }>('/auth/pin', data)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ME_KEY });
    },
  });
}

export function useRemovePin() {
  const queryClient = useQueryClient();
  return useMutation<{ ok: boolean }, Error, { password: string }>({
    // Said by the form (AccountSecurity).
    meta: { handlesError: true },
    mutationFn: async (data) => (await client.delete<{ ok: boolean }>('/auth/pin', data)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ME_KEY });
    },
  });
}

export function useUnlock() {
  return useMutation<{ ok: boolean }, Error, { password?: string; pin?: string }>({
    // Said by the lock screen.
    meta: { handlesError: true },
    mutationFn: async (data) => (await client.post<{ ok: boolean }>('/auth/unlock', data)).data,
  });
}

// ─── Setup Wizard d'Onboarding (FEAT-56) ────────────────────────────────────

export function useCompleteOnboarding() {
  const queryClient = useQueryClient();
  return useMutation<PublicUser, Error, { skipped: boolean }>({
    meta: { handlesError: true },
    mutationFn: async (data) =>
      (await client.post<PublicUser>('/user/onboarding/complete', data)).data,
    onSuccess: (updatedUser, variables) => {
      queryClient.setQueryData<PublicUser | null>(ME_KEY, updatedUser);
      // FEAT-90: "Don't show again" — say where the wizard can be found. Here
      // rather than at the call site: the wizard has already closed by now.
      if (variables.skipped) notifySuccess('onboarding.dontShowAgainToast');
    },
    onError: () => notifyError('toast.onboarding.completeError'),
  });
}


/**
 * FEAT-89/FEAT-90: what the setup wizard needs when it opens — postponed for
 * this sign-in, joining a cellar filled by others, the cellar it created.
 */
export function useOnboardingState(enabled: boolean) {
  return useQuery<OnboardingState>({
    queryKey: ONBOARDING_STATE_KEY,
    queryFn: async () => (await client.get<OnboardingState>('/user/onboarding')).data,
    enabled,
    staleTime: Infinity,
  });
}

/** FEAT-90 "Later": the wizard stays closed until the next sign-in. */
export function usePostponeOnboarding() {
  const queryClient = useQueryClient();
  return useMutation<{ postponed: boolean }, Error, void>({
    meta: { handlesError: true },
    mutationFn: async () => (await client.post<{ postponed: boolean }>('/user/onboarding/postpone')).data,
    onSuccess: () => {
      queryClient.setQueryData<OnboardingState>(ONBOARDING_STATE_KEY, (old) => (old ? { ...old, postponed: true } : old));
    },
    onError: () => notifyError('toast.onboarding.postponeError'),
  });
}
