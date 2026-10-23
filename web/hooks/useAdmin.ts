import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { client as api } from '../lib/api';
import { notifyError, notifySuccess } from '../lib/toast';
import { maturityReferenceClient } from '../lib/maturity-references/client';
import { MaturityReference, MaturityReferenceInput } from '../lib/maturity-references/types';
import type { PurgeResponse } from '@shared/maintenance';

export interface AdminUser {
    id: string;
    username: string;
    email: string;
    displayName: string | null;
    isAdmin: boolean;
    isActive: boolean;
    createdAt: string;
}

export interface AuditLogEntry {
    id: number;
    userId: string;
    user: { username: string; displayName: string | null };
    bottleId: string | null;
    action: string;
    status: string;
    ip: string;
    details: Record<string, unknown> | null;
    createdAt: string;
}

export interface AuditLogMeta {
    page: number;
    limit: number;
    total: number;
    pages: number;
}

export interface AuditLogResponse {
    items: AuditLogEntry[];
    meta: AuditLogMeta;
}

// Fetch all users
export function useAdminUsers() {
    return useQuery({
        queryKey: ['admin_users'],
        queryFn: async (): Promise<AdminUser[]> => {
            const response = await api.get<AdminUser[]>('/admin/users');
            return response.data;
        },
    });
}

// Toggle a user's role
export function useUpdateUserRole() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ userId, isAdmin }: { userId: string; isAdmin: boolean }) => {
            const response = await api.post<AdminUser>(`/admin/users/${userId}/role`, { isAdmin });
            return response.data;
        },
        onError: () => notifyError('toast.admin.roleError'),
        onSuccess: () => {
            notifySuccess('toast.admin.roleSuccess');
            queryClient.invalidateQueries({ queryKey: ['admin_users'] });
        },
    });
}

// Activate or deactivate a user account
export function useUpdateUserStatus() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ userId, isActive }: { userId: string; isActive: boolean }) => {
            const response = await api.patch<AdminUser>(`/admin/users/${userId}/status`, { isActive });
            return response.data;
        },
        onError: (error) => {
            const code = (error as { response?: { data?: { error?: string } } }).response?.data?.error;
            notifyError(code === 'CANNOT_DEACTIVATE_LAST_ADMIN' ? 'admin.users.deactivateLastAdmin' : 'toast.admin.statusError');
        },
        onSuccess: () => {
            notifySuccess('toast.admin.statusSuccess');
            queryClient.invalidateQueries({ queryKey: ['admin_users'] });
        },
    });
}

// #336: no-SMTP account recovery — generates a one-time temporary password,
// shown to the admin exactly once by the caller.
export function useResetUserPassword() {
    return useMutation({
        mutationFn: async (userId: string) => {
            const response = await api.post<{ tempPassword: string }>(`/admin/users/${userId}/reset-password`);
            return response.data;
        },
        onError: () => notifyError('toast.admin.resetPasswordError'),
    });
}

// Fetch paginated audit logs
export interface AuditLogFilters {
    q?: string;
    status?: string;
    from?: string;
    to?: string;
}

export function useAdminAuditLogs(page = 1, limit = 50, filters: AuditLogFilters = {}) {
    return useQuery({
        queryKey: ['admin_audit_logs', page, limit, filters],
        queryFn: async (): Promise<AuditLogResponse> => {
            const params = new URLSearchParams({ page: String(page), limit: String(limit) });
            for (const [key, value] of Object.entries(filters)) {
                if (value) params.set(key, value);
            }
            const response = await api.get<AuditLogResponse>(`/admin/audit-logs?${params.toString()}`);
            return response.data;
        },
        staleTime: 30_000,
    });
}

// Purge all data
export function usePurgeData() {
    const queryClient = useQueryClient();

    return useMutation({
        // #489: the admin's password is re-checked server-side; `confirmation`
        // is the protocol keyword, whatever the UI language.
        mutationFn: async ({ password }: { password: string }) => {
            const response = await api.post<PurgeResponse>('/admin/maintenance/purge', { confirmation: 'SUPPRIMER', password });
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries();
        },
    });
}

// ─── Maturity References ──────────────────────────────────────────────────────

export type { MaturityReference, MaturityReferenceInput };

export function useMaturityReferences() {
    return useQuery({
        queryKey: ['admin_maturity_references'],
        queryFn: () => maturityReferenceClient.list(),
        staleTime: 60_000,
    });
}

export function useCreateMaturityReference() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (input: MaturityReferenceInput) => maturityReferenceClient.create(input),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin_maturity_references'] });
        },
    });
}

export function useUpdateMaturityReference() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, patch }: { id: string; patch: Partial<MaturityReferenceInput> }) =>
            maturityReferenceClient.update(id, patch),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin_maturity_references'] });
        },
    });
}

export function useDeleteMaturityReference() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => maturityReferenceClient.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin_maturity_references'] });
        },
    });
}

// FEAT-86: rewrite the whole cascade priority order in one call. Optimistic —
// the table reorders instantly, rolling back to the server list on failure.
export function useReorderMaturityReferences() {
    const queryClient = useQueryClient();
    const key = ['admin_maturity_references'];
    return useMutation({
        mutationFn: (ids: string[]) => maturityReferenceClient.reorder(ids),
        onMutate: async (ids: string[]) => {
            await queryClient.cancelQueries({ queryKey: key });
            const previous = queryClient.getQueryData<MaturityReference[]>(key);
            if (previous) {
                const byId = new Map(previous.map((r) => [r.id, r]));
                const reordered = ids
                    .map((id, index) => {
                        const ref = byId.get(id);
                        return ref ? { ...ref, priority: ids.length - index } : null;
                    })
                    .filter((r): r is MaturityReference => r !== null);
                queryClient.setQueryData<MaturityReference[]>(key, reordered);
            }
            return { previous };
        },
        onError: (_err, _ids, context) => {
            if (context?.previous) queryClient.setQueryData(key, context.previous);
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: key });
        },
    });
}
