import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError, client } from '@/lib/api';
import i18n from '@/lib/i18n';
import { notifyError, notifySuccess } from '@/lib/toast';
import { SLOTS_OUTSIDE_GRID, type SlotsOutsideGridDetails } from '@shared/product';
import { invalidateAfterInventoryChange, qk } from '@/lib/queryKeys';

import { Cellar, CellarGridData, CreateCellarInput, UpdateCellarInput } from '@/lib/cellars/types';

/**
 * Hook to fetch all cellars for the current user
 */
export function useCellars() {
  return useQuery<Cellar[]>({
    queryKey: qk.cellars.all,
    queryFn: async () => {
      const { data } = await client.get<Cellar[]>('/cellars');
      return data;
    },
  });
}

/**
 * Hook to fetch a single cellar by ID
 */
export function useCellar(id: string) {
  return useQuery<Cellar>({
    queryKey: qk.cellars.detail(id),
    queryFn: async () => {
      const { data } = await client.get<Cellar>(`/cellars/${id}`);
      return data;
    },
    enabled: !!id,
  });
}

/**
 * Hook to fetch grid data for a cellar (config + all items with slot assignments)
 */
export function useCellarGrid(cellarId: string) {
  return useQuery<CellarGridData>({
    queryKey: qk.cellars.grid(cellarId),
    queryFn: async () => {
      const { data } = await client.get<CellarGridData>(`/cellars/${cellarId}/grid`);
      return data;
    },
    enabled: !!cellarId,
  });
}

/**
 * Hook to create a new cellar
 */
export function useCreateCellar() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { handlesError: true },
    mutationFn: async (data: CreateCellarInput) => {
      const response = await client.post<Cellar>('/cellars', data);
      return response.data;
    },
    onSuccess: () => {
      // The cellars and their badge in the menu.
      void queryClient.invalidateQueries({ queryKey: qk.cellars.all });
      void queryClient.invalidateQueries({ queryKey: qk.sidebarCounts });
      notifySuccess('toast.cellar.createSuccess');
    },
    onError: () => notifyError('toast.cellar.createError'),
  });
}

/**
 * Hook to update a cellar
 */
export function useUpdateCellar() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { handlesError: true },
    mutationFn: async ({ id, data }: { id: string; data: UpdateCellarInput }) => {
      const response = await client.patch<Cellar>(`/cellars/${id}`, data);
      return response.data;
    },
    onSuccess: () => {
      // The cellars and their badge in the menu.
      void queryClient.invalidateQueries({ queryKey: qk.cellars.all });
      void queryClient.invalidateQueries({ queryKey: qk.sidebarCounts });
      notifySuccess('toast.cellar.updateSuccess');
    },
    onError: (error) => {
      // #852: a smaller grid would hide the bottles placed in the cells it
      // removes — the API names those cells, to empty or move first.
      if (error instanceof ApiError && error.message === SLOTS_OUTSIDE_GRID) {
        const { slots } = error.details as SlotsOutsideGridDetails;
        const cells = slots.map(({ column, row, name }) => i18n.t('cellars.grid.cellOutside', { col: column, row, name }));
        notifyError('toast.cellar.slotsOutsideGrid', { count: slots.length, cells: cells.join(', ') });
        return;
      }
      notifyError('toast.cellar.updateError');
    },
  });
}

/**
 * Hook to delete a cellar
 */
export function useDeleteCellar() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { handlesError: true },
    mutationFn: async (id: string) => {
      await client.delete<void>(`/cellars/${id}`);
    },
    onSuccess: () => {
      // The cellars and their badge in the menu.
      void queryClient.invalidateQueries({ queryKey: qk.cellars.all });
      void queryClient.invalidateQueries({ queryKey: qk.sidebarCounts });
      notifySuccess('toast.cellar.deleteSuccess');
    },
    onError: () => notifyError('toast.cellar.deleteError'),
  });
}

/**
 * FEAT-93: places one more copy of a line in a cell of the plan
 * (POST /api/inventory/:id/slots). Throws an Error with message
 * 'SLOT_OCCUPIED' when the cell is taken, 'NO_UNPLACED_COPY' when every copy
 * of the line is already placed.
 */
export function useAssignSlot() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { itemId: string; column: number; row: number }>({
    // Said by the grid's assign dialog.
    meta: { handlesError: true },
    mutationFn: async ({ itemId, column, row }) => {
      await client.post(`/inventory/${itemId}/slots`, { column, row });
    },
    // A refusal too: the plan was out of date (a cell or a copy taken from another device).
    onSettled: () => invalidateAfterInventoryChange(queryClient),
  });
}

/** FEAT-93: takes a copy out of its cell (DELETE /api/slots/:slotId); it stays in stock, unplaced. */
export function useRemoveSlot() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { slotId: string }>({
    // Said by the drawer (FamilyDrawer).
    meta: { handlesError: true },
    mutationFn: async ({ slotId }) => {
      await client.delete(`/slots/${slotId}`);
    },
    // A refusal too (SLOT_NOT_FOUND: taken out or drunk on another device): the plan and the drawer catch up.
    onSettled: () => invalidateAfterInventoryChange(queryClient),
  });
}
