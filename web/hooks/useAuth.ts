'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

export interface PublicUser {
  id: string;
  username: string;
  email: string;
  avatarUrl: string | null;
  appName: string | null;
  appSlogan: string | null;
  theme: 'LIGHT' | 'DARK';
  language: 'FR' | 'EN';
  tempUnit: 'CELSIUS' | 'FAHRENHEIT';
  accentColor: string;
  dateFormat: 'SYSTEM' | 'H24' | 'H12';
  isAdmin: boolean;
  isTwoFactorEnabled?: boolean;
  createdAt: string;
}

const ME_KEY = ['auth', 'me'];

async function apiFetch<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  const json = (await res.json()) as { data?: T; error?: string; details?: string };
  if (!res.ok) throw new Error(json.error ?? 'UNEXPECTED_ERROR');
  return json.data as T;
}

// ─── useMe ──────────────────────────────────────────────────────────────────

export function useMe() {
  return useQuery<PublicUser | null>({
    queryKey: ME_KEY,
    queryFn: async () => {
      try {
        return await apiFetch<PublicUser>('/api/user/me');
      } catch {
        return null;
      }
    },
    staleTime: Infinity,
    retry: false,
  });
}

// ─── useLogin ────────────────────────────────────────────────────────────────

export function useLogin() {
  const queryClient = useQueryClient();
  const router = useRouter();
  return useMutation<PublicUser & { requires2fa?: boolean }, Error, { identifier: string; password: string }>({
    mutationFn: (data) => apiFetch<PublicUser & { requires2fa?: boolean }>('/api/auth/login', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: (data) => {
      if (data.requires2fa) {
        // Will be handled by the component
        return;
      }
      queryClient.setQueryData<PublicUser | null>(ME_KEY, data);
      router.push('/bottles');
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
    { username: string; email: string; password: string }
  >({
    mutationFn: (data) =>
      apiFetch<PublicUser>('/api/auth/register', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: (user) => {
      queryClient.setQueryData<PublicUser | null>(ME_KEY, user);
      router.push('/bottles');
    },
  });
}

// ─── useLogout ───────────────────────────────────────────────────────────────

export function useLogout() {
  const queryClient = useQueryClient();
  const router = useRouter();
  return useMutation<void, Error, void>({
    mutationFn: () => apiFetch<void>('/api/auth/logout', { method: 'POST' }),
    onSettled: () => {
      queryClient.setQueryData(ME_KEY, null);
      queryClient.clear();
      router.push('/login');
    },
  });
}

// ─── useUpdateProfile ────────────────────────────────────────────────────────

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation<PublicUser, Error, { username?: string; avatarUrl?: string | null; appName?: string | null; appSlogan?: string | null }>({
    mutationFn: (data) =>
      apiFetch<PublicUser>('/api/user/profile', { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: (updatedUser) => {
      queryClient.setQueryData<PublicUser | null>(ME_KEY, updatedUser);
    },
  });
}

// ─── useUploadAvatar ─────────────────────────────────────────────────────────

export function useUploadAvatar() {
  const queryClient = useQueryClient();
  return useMutation<PublicUser, Error, File>({
    mutationFn: async (file) => {
      const formData = new FormData();
      formData.append('avatar', file);

      const res = await fetch('/api/user/avatar', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'UNEXPECTED_ERROR');
      return json.data as PublicUser;
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
    mutationFn: () => apiFetch<PublicUser>('/api/user/avatar', { method: 'DELETE' }),
    onSuccess: (updatedUser) => {
      queryClient.setQueryData<PublicUser | null>(ME_KEY, updatedUser);
    },
  });
}
// ─── useUpdateEmail ──────────────────────────────────────────────────────────

export function useUpdateEmail() {
  const queryClient = useQueryClient();
  return useMutation<PublicUser, Error, { email: string }>({
    mutationFn: (data) =>
      apiFetch<PublicUser>('/api/user/email', { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: (updatedUser) => {
      queryClient.setQueryData<PublicUser | null>(ME_KEY, updatedUser);
    },
  });
}

// ─── useUpdatePassword ───────────────────────────────────────────────────────

export function useUpdatePassword() {
  return useMutation<{ success: boolean }, Error, { currentPassword: string; newPassword: string }>({
    mutationFn: (data) =>
      apiFetch<{ success: boolean }>('/api/user/password', { method: 'PATCH', body: JSON.stringify(data) }),
  });
}

// ─── useUpdatePreferences ───────────────────────────────────────────────────

export function useUpdatePreferences() {
  const queryClient = useQueryClient();
  return useMutation<
    PublicUser,
    Error,
    {
      theme?: 'LIGHT' | 'DARK';
      language?: 'FR' | 'EN';
      tempUnit?: 'CELSIUS' | 'FAHRENHEIT';
      accentColor?: string;
      dateFormat?: 'SYSTEM' | 'H24' | 'H12';
    }
  >({
    mutationFn: (data) =>
      apiFetch<PublicUser>('/api/user/preferences', { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: (updatedUser) => {
      queryClient.setQueryData<PublicUser | null>(ME_KEY, updatedUser);
    },
  });
}

// ─── 2FA Methods ────────────────────────────────────────────────────────────

export function useGenerate2fa() {
  return useMutation<{ qrCodeUrl: string; secret: string }, Error, void>({
    mutationFn: () => apiFetch<{ qrCodeUrl: string; secret: string }>('/api/auth/2fa/generate', { method: 'POST' }),
  });
}

export function useTurnOn2fa() {
  const queryClient = useQueryClient();
  return useMutation<{ backupCodes: string[] }, Error, { code: string }>({
    mutationFn: (data) => apiFetch<{ backupCodes: string[] }>('/api/auth/2fa/turn-on', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ME_KEY });
    },
  });
}

export function useTurnOff2fa() {
  const queryClient = useQueryClient();
  return useMutation<{ success: boolean }, Error, { password: string; code?: string }>({
    mutationFn: (data) => apiFetch<{ success: boolean }>('/api/auth/2fa/turn-off', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ME_KEY });
    },
  });
}

export function useVerify2faLogin() {
  const queryClient = useQueryClient();
  const router = useRouter();
  return useMutation<PublicUser, Error, { code: string }>({
    mutationFn: (data) => apiFetch<PublicUser>('/api/auth/2fa/verify-login', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: (user) => {
      queryClient.setQueryData<PublicUser | null>(ME_KEY, user);
      router.push('/bottles');
    },
  });
}
