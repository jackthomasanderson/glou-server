'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

export interface PublicUser {
  id: string;
  username: string;
  email: string;
  displayName: string | null;
  slogan: string | null;
  theme: 'LIGHT' | 'DARK';
  language: 'FR' | 'EN';
  tempUnit: 'CELSIUS' | 'FAHRENHEIT';
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
  return useMutation<PublicUser, Error, { identifier: string; password: string }>({
    mutationFn: (data) => apiFetch<PublicUser>('/api/auth/login', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: (user) => {
      queryClient.setQueryData<PublicUser | null>(ME_KEY, user);
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
    { username: string; email: string; password: string; displayName?: string }
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
  return useMutation<PublicUser, Error, { displayName?: string | null; slogan?: string | null }>({
    mutationFn: (data) =>
      apiFetch<PublicUser>('/api/user/profile', { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: (updatedUser) => {
      queryClient.setQueryData<PublicUser | null>(ME_KEY, updatedUser);
    },
  });
}

// ─── useUpdatePreferences ───────────────────────────────────────────────────

export function useUpdatePreferences() {
  const queryClient = useQueryClient();
  return useMutation<
    PublicUser,
    Error,
    { theme?: 'LIGHT' | 'DARK'; language?: 'FR' | 'EN'; tempUnit?: 'CELSIUS' | 'FAHRENHEIT' }
  >({
    mutationFn: (data) =>
      apiFetch<PublicUser>('/api/user/preferences', { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: (updatedUser) => {
      queryClient.setQueryData<PublicUser | null>(ME_KEY, updatedUser);
    },
  });
}
