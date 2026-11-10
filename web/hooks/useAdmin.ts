import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { client as api } from '../lib/api';
import { notifyError, notifySuccess } from '../lib/toast';
import { maturityReferenceClient } from '../lib/maturity-references/client';
import { MaturityReference, MaturityReferenceInput } from '../lib/maturity-references/types';
import type { PurgeResponse } from '@shared/maintenance';
import type { AdminGuestShare } from '@shared/shares';
import { configClient } from '../lib/config/client';

export interface AdminUser {
    id: string;
    username: string;
    email: string;
    displayName: string | null;
    isAdmin: boolean;
    isActive: boolean;
    /** #638: resetting such a member's password asks for the admin's own password. */
    isTwoFactorEnabled: boolean;
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
        meta: { handlesError: true },
        // #638, #603: every change carries the admin's own password (and
        // code); refusals are said by the confirmation dialog.
        mutationFn: async ({ userId, ...body }: { userId: string; isAdmin: boolean; password?: string; code?: string }) => {
            const response = await api.post<AdminUser>(`/admin/users/${userId}/role`, body);
            return response.data;
        },
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
        // #603: carries the admin's own password (and code); refusals are
        // said by the caller (useMemberChanges).
        meta: { handlesError: true },
        mutationFn: async ({ userId, ...body }: { userId: string; isActive: boolean; password?: string; code?: string }) => {
            const response = await api.patch<AdminUser>(`/admin/users/${userId}/status`, body);
            return response.data;
        },
        onSuccess: () => {
            notifySuccess('toast.admin.statusSuccess');
            queryClient.invalidateQueries({ queryKey: ['admin_users'] });
        },
    });
}

// #336: no-SMTP account recovery — generates a one-time temporary password,
// shown to the admin exactly once by the caller. #638: `password`/`code` are
// the admin's own, asked for every reset (the API refuses it without them).
export function useResetUserPassword() {
    return useMutation<{ tempPassword: string }, Error, { userId: string; password?: string; code?: string }>({
        // Said by the reset dialog.
        meta: { handlesError: true },
        mutationFn: async ({ userId, ...reauth }) => {
            const response = await api.post<{ tempPassword: string }>(`/admin/users/${userId}/reset-password`, reauth);
            return response.data;
        },
    });
}

// Fetch paginated audit logs
export interface AuditLogFilters {
    q?: string;
    status?: string;
    /** #698: action types, any of which matches; sent comma-separated. */
    actions?: string[];
    from?: string;
    to?: string;
}

export function useAdminAuditLogs(page = 1, limit = 50, filters: AuditLogFilters = {}) {
    return useQuery({
        queryKey: ['admin_audit_logs', page, limit, filters],
        queryFn: async (): Promise<AuditLogResponse> => {
            const params = new URLSearchParams({ page: String(page), limit: String(limit) });
            for (const [key, value] of Object.entries(filters)) {
                const text = Array.isArray(value) ? value.join(',') : value;
                if (text) params.set(key, text);
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
        // Said by the purge dialog (its own error line).
        meta: { handlesError: true },
        // #489 / #890: the admin's password and code are checked server-side;
        // `confirmation` is the protocol keyword, whatever the UI language.
        mutationFn: async (reauth: { password: string; code?: string }) => {
            const response = await api.post<PurgeResponse>('/admin/maintenance/purge', { confirmation: 'SUPPRIMER', ...reauth });
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

// ─── Backups state (#756) ─────────────────────────────────────────────────────

export const ADMIN_BACKUP_HEALTH_KEY = ['admin_backup_health'];

/** Whether backups run and when one last succeeded: the admin page warns when there is no recovery point. */
export function useAdminBackupHealth() {
    return useQuery({
        queryKey: ADMIN_BACKUP_HEALTH_KEY,
        queryFn: () => configClient.getBackupHealth(),
        staleTime: 30_000,
    });
}

// ─── Guest links (#486) ───────────────────────────────────────────────────────

export type { AdminGuestShare };

/** Every member's guest links still in force — never the links themselves. */
export function useAdminShares() {
    return useQuery({
        queryKey: ['admin_shares'],
        queryFn: async (): Promise<AdminGuestShare[]> => (await api.get<AdminGuestShare[]>('/admin/shares')).data,
    });
}

export function useRevokeAdminShare() {
    const queryClient = useQueryClient();
    return useMutation({
        meta: { handlesError: true },
        mutationFn: async (id: string) => (await api.delete<{ id: string; revokedAt: string }>(`/admin/shares/${id}`)).data,
        onError: () => notifyError('admin.shares.revokeError'),
        onSuccess: () => notifySuccess('admin.shares.revoked'),
        onSettled: () => queryClient.invalidateQueries({ queryKey: ['admin_shares'] }),
    });
}
