import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { bottlesClient, createBottle, deleteBottle, updateBottle } from "./client";
import { BottleInput, BottleRecord } from "./schema";

const BOTTLES_QUERY_KEY = ["bottles"];
const CELLARS_QUERY_KEY = ["cellars"];

type BottlesContext = {
    previousBottles?: BottleRecord[];
    previousBottle?: BottleRecord;
    tempId?: string;
    bottleId?: string;
};

export function useBottles() {
    return useQuery({
        queryKey: BOTTLES_QUERY_KEY,
        queryFn: () => bottlesClient.list(),
    });
}

export function useBottlesByCellar(cellarId: string) {
    return useQuery({
        queryKey: [...BOTTLES_QUERY_KEY, "cellar", cellarId],
        queryFn: () => bottlesClient.listByCellar(cellarId),
        enabled: !!cellarId,
    });
}

export function useCreateBottle() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (input: BottleInput) => createBottle(input),
        onMutate: async (input: BottleInput) => {
            await queryClient.cancelQueries({ queryKey: BOTTLES_QUERY_KEY });
            const previousBottles = queryClient.getQueryData<BottleRecord[]>(BOTTLES_QUERY_KEY);

            const tempId = `temp-${Date.now()}`;
            const now = new Date().toISOString();
            const optimistic: BottleRecord = {
                ...(input as any), // Cast because input doesn't have all fields like id, createdAt
                id: tempId,
                createdAt: now,
                updatedAt: now,
            };

            queryClient.setQueryData<BottleRecord[]>(BOTTLES_QUERY_KEY, (current = []) => [optimistic, ...current]);
            return { previousBottles, tempId } satisfies BottlesContext;
        },
        onError: (_error, _variables, context) => {
            if (context?.previousBottles) {
                queryClient.setQueryData(BOTTLES_QUERY_KEY, context.previousBottles);
            }
        },
        onSuccess: (created, _variables, context) => {
            queryClient.setQueryData<BottleRecord[]>(BOTTLES_QUERY_KEY, (current = []) => {
                const withoutTemp = context?.tempId ? current.filter((b) => b.id !== context.tempId) : current;
                return [created, ...withoutTemp];
            });
            // Invalidate cellars to update counts
            queryClient.invalidateQueries({ queryKey: CELLARS_QUERY_KEY });
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: BOTTLES_QUERY_KEY });
        },
    });
}

export function useUpdateBottle() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, input }: { id: string; input: Partial<BottleInput> }) =>
            updateBottle(id, input),
        onMutate: async ({ id, input }) => {
            await queryClient.cancelQueries({ queryKey: BOTTLES_QUERY_KEY });
            const previousBottles = queryClient.getQueryData<BottleRecord[]>(BOTTLES_QUERY_KEY);

            queryClient.setQueryData<BottleRecord[]>(BOTTLES_QUERY_KEY, (current = []) =>
                current.map((b) => (b.id === id ? { ...b, ...input, updatedAt: new Date().toISOString() } as BottleRecord : b))
            );

            return { previousBottles } satisfies BottlesContext;
        },
        onError: (_error, _variables, context) => {
            if (context?.previousBottles) {
                queryClient.setQueryData(BOTTLES_QUERY_KEY, context.previousBottles);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: BOTTLES_QUERY_KEY });
        },
    });
}

export function useDeleteBottle() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => deleteBottle(id),
        onMutate: async (id: string) => {
            await queryClient.cancelQueries({ queryKey: BOTTLES_QUERY_KEY });
            const previousBottles = queryClient.getQueryData<BottleRecord[]>(BOTTLES_QUERY_KEY);

            queryClient.setQueryData<BottleRecord[]>(BOTTLES_QUERY_KEY, (current = []) =>
                current.filter((b) => b.id !== id)
            );

            return { previousBottles } satisfies BottlesContext;
        },
        onError: (_error, _variables, context) => {
            if (context?.previousBottles) {
                queryClient.setQueryData(BOTTLES_QUERY_KEY, context.previousBottles);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: BOTTLES_QUERY_KEY });
            queryClient.invalidateQueries({ queryKey: CELLARS_QUERY_KEY });
        },
    });
}
