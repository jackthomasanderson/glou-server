import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { client as api } from '../lib/api';
import { maturityReferenceClient } from '../lib/maturity-references/client';
import { MaturityReference, MaturityReferenceInput } from '../lib/maturity-references/types';

export interface AdminUser {
    id: string;
    username: string;
    email: string;
    displayName: string | null;
    isAdmin: boolean;
    isActive: boolean;
    createdAt: string;
}

export interface PurgeResult {
    success: boolean;
    counts: {
        bottles: number;
        cellars: number;
        auditLogs: number;
    };
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
        onSuccess: () => {
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
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin_users'] });
        },
    });
}

// Fetch paginated audit logs
export function useAdminAuditLogs(page = 1, limit = 50) {
    return useQuery({
        queryKey: ['admin_audit_logs', page, limit],
        queryFn: async (): Promise<AuditLogResponse> => {
            const response = await api.get<AuditLogResponse>(
                `/admin/audit-logs?page=${page}&limit=${limit}`,
            );
            return response.data;
        },
        staleTime: 30_000,
    });
}

// Purge all data
export function usePurgeData() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (confirmation: string) => {
            const response = await api.post<PurgeResult>('/admin/maintenance/purge', { confirmation });
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
