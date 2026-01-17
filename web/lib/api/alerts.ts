import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchWithAuth } from './fetchWithAuth';

export interface Notification {
    id: string;
    userId: string;
    type: string;
    title: string;
    message?: string;
    data?: any;
    read: boolean;
    createdAt: Date;
}

export interface AlertPreferences {
    userId: string;
    daysBeforePeak: number;
    enableEmail: boolean;
    enableInApp: boolean;
    quietHoursStart?: string;
    quietHoursEnd?: string;
}

/**
 * Hook to fetch notifications for current user
 */
export function useNotifications(options?: {
    read?: boolean;
    type?: string;
    limit?: number;
}) {
    return useQuery({
        queryKey: ['notifications', options],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (options?.read !== undefined) params.append('read', String(options.read));
            if (options?.type) params.append('type', options.type);
            if (options?.limit) params.append('limit', String(options.limit));

            const res = await fetchWithAuth(`/api/alerts?${params.toString()}`);
            if (!res.ok) throw new Error('Failed to fetch notifications');
            const data = await res.json();
            return data.data as Notification[];
        },
    });
}

/**
 * Hook to get count of unread notifications
 */
export function useUnreadCount(options?: { enabled?: boolean }) {
    return useQuery({
        queryKey: ['notifications', 'unread-count'],
        queryFn: async () => {
            const res = await fetchWithAuth('/api/alerts/unread-count');
            if (!res.ok) throw new Error('Failed to fetch unread count');
            const data = await res.json();
            return data.data.count as number;
        },
        refetchInterval: 30000, // Refetch every 30 seconds
        enabled: options?.enabled !== false,
    });
}

/**
 * Hook to mark notification as read
 */
export function useMarkNotificationRead() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (notificationId: string) => {
            const res = await fetchWithAuth(`/api/alerts/${notificationId}/read`, {
                method: 'PUT',
            });
            if (!res.ok) throw new Error('Failed to mark notification as read');
            return await res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['notifications'] });
        },
    });
}

/**
 * Hook to delete notification
 */
export function useDismissNotification() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (notificationId: string) => {
            const res = await fetchWithAuth(`/api/alerts/${notificationId}`, {
                method: 'DELETE',
            });
            if (!res.ok) throw new Error('Failed to dismiss notification');
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['notifications'] });
        },
    });
}

/**
 * Hook to get alert preferences
 */
export function useAlertPreferences() {
    return useQuery({
        queryKey: ['alert-preferences'],
        queryFn: async () => {
            const res = await fetchWithAuth('/api/alerts/preferences');
            if (!res.ok) throw new Error('Failed to fetch alert preferences');
            const data = await res.json();
            return data.data as AlertPreferences;
        },
    });
}

/**
 * Hook to update alert preferences
 */
export function useUpdateAlertPreferences() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (preferences: Partial<AlertPreferences>) => {
            const res = await fetchWithAuth('/api/alerts/preferences', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(preferences),
            });
            if (!res.ok) throw new Error('Failed to update alert preferences');
            const data = await res.json();
            return data.data as AlertPreferences;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['alert-preferences'] });
        },
    });
}

/**
 * Hook to manually refresh alert statuses
 */
export function useRefreshAlerts() {
    return useMutation({
        mutationFn: async () => {
            const res = await fetchWithAuth('/api/alerts/refresh', {
                method: 'POST',
            });
            if (!res.ok) throw new Error('Failed to refresh alerts');
            const data = await res.json();
            return data.data as { updated: number; errors: number };
        },
    });
}

/**
 * Hook to create a custom notification
 */
export function useCreateNotification() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: { title: string; message?: string; type?: string; data?: any }) => {
            const res = await fetchWithAuth('/api/alerts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            if (!res.ok) {
                const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
                throw new Error(errorData.error || 'Failed to create notification');
            }
            return await res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['notifications'] });
        },
    });
}
