import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { client as api } from '../lib/api';

export interface AdminUser {
    id: string;
    username: string;
    email: string;
    displayName: string | null;
    isAdmin: boolean;
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
            // Refresh the users list
            queryClient.invalidateQueries({ queryKey: ['admin_users'] });
        },
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
            // Invalidate everything to clear caches
            queryClient.invalidateQueries();
        },
    });
}
