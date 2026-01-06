import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cellarsClient } from "./client";
import { CellarWithStats, CreateCellarInput, UpdateCellarInput } from "@/types/cellars";

const CELLARS_QUERY_KEY = ["cellars"];

type CellarsContext = {
  previousCellars?: CellarWithStats[];
  previousCellar?: CellarWithStats;
  tempId?: string;
  cellarId?: string;
};

function createTempId(): string {
  const cryptoAny = (globalThis as unknown as { crypto?: { randomUUID?: () => string } }).crypto;
  return cryptoAny?.randomUUID?.() ?? `temp-${Date.now()}`;
}

export function useCellars() {
  return useQuery({
    queryKey: CELLARS_QUERY_KEY,
    queryFn: () => cellarsClient.getCellars(),
  });
}

export function useCellarById(cellarId: string) {
  return useQuery({
    queryKey: [...CELLARS_QUERY_KEY, cellarId],
    queryFn: () => cellarsClient.getCellarById(cellarId),
    enabled: !!cellarId,
  });
}

export function useCreateCellar() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateCellarInput) => cellarsClient.createCellar(input),
    onMutate: async (input: CreateCellarInput) => {
      await queryClient.cancelQueries({ queryKey: CELLARS_QUERY_KEY });
      const previousCellars = queryClient.getQueryData<CellarWithStats[]>(CELLARS_QUERY_KEY);

      const tempId = createTempId();
      const now = new Date().toISOString();
      const optimistic: CellarWithStats = {
        id: tempId,
        userId: "",
        name: input.name,
        description: input.description ?? null,
        cellarType: input.cellarType,
        locationDescription: input.locationDescription ?? null,
        createdAt: now,
        updatedAt: now,
        bottleCount: 0,
      };

      queryClient.setQueryData<CellarWithStats[]>(CELLARS_QUERY_KEY, (current = []) => [optimistic, ...current]);
      return { previousCellars, tempId } satisfies CellarsContext;
    },
    onError: (_error, _variables, context) => {
      if (context?.previousCellars) {
        queryClient.setQueryData(CELLARS_QUERY_KEY, context.previousCellars);
      }
    },
    onSuccess: (created, _variables, context) => {
      queryClient.setQueryData<CellarWithStats[]>(CELLARS_QUERY_KEY, (current = []) => {
        const withoutTemp = context?.tempId ? current.filter((cellar) => cellar.id !== context.tempId) : current;
        return [created, ...withoutTemp];
      });
      queryClient.setQueryData<CellarWithStats>([...CELLARS_QUERY_KEY, created.id], created);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: CELLARS_QUERY_KEY }),
  });
}

export function useUpdateCellar() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ cellarId, input }: { cellarId: string; input: UpdateCellarInput }) =>
      cellarsClient.updateCellar(cellarId, input),
    onMutate: async ({ cellarId, input }) => {
      await queryClient.cancelQueries({ queryKey: CELLARS_QUERY_KEY });
      await queryClient.cancelQueries({ queryKey: [...CELLARS_QUERY_KEY, cellarId] });

      const previousCellars = queryClient.getQueryData<CellarWithStats[]>(CELLARS_QUERY_KEY);
      const previousCellar = queryClient.getQueryData<CellarWithStats>([...CELLARS_QUERY_KEY, cellarId]);

      const now = new Date().toISOString();
      queryClient.setQueryData<CellarWithStats[]>(CELLARS_QUERY_KEY, (current = []) =>
        current.map((cellar) =>
          cellar.id === cellarId
            ? {
                ...cellar,
                ...input,
                description: input.description === undefined ? cellar.description : input.description ?? null,
                locationDescription:
                  input.locationDescription === undefined
                    ? cellar.locationDescription
                    : input.locationDescription ?? null,
                updatedAt: now,
              }
            : cellar
        )
      );

      queryClient.setQueryData<CellarWithStats | undefined>([...CELLARS_QUERY_KEY, cellarId], (current) =>
        current
          ? {
              ...current,
              ...input,
              description: input.description === undefined ? current.description : input.description ?? null,
              locationDescription:
                input.locationDescription === undefined
                  ? current.locationDescription
                  : input.locationDescription ?? null,
              updatedAt: now,
            }
          : current
      );

      return { previousCellars, previousCellar, cellarId } satisfies CellarsContext;
    },
    onError: (_error, _variables, context) => {
      if (context?.previousCellars) {
        queryClient.setQueryData(CELLARS_QUERY_KEY, context.previousCellars);
      }
      if (context?.cellarId && context.previousCellar) {
        queryClient.setQueryData([...CELLARS_QUERY_KEY, context.cellarId], context.previousCellar);
      }
    },
    onSuccess: (updatedCellar) => {
      queryClient.setQueryData<CellarWithStats[]>(CELLARS_QUERY_KEY, (current = []) =>
        current.map((cellar) => (cellar.id === updatedCellar.id ? updatedCellar : cellar))
      );
      queryClient.setQueryData<CellarWithStats>([...CELLARS_QUERY_KEY, updatedCellar.id], updatedCellar);
    },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: CELLARS_QUERY_KEY });
      if (variables?.cellarId) {
        queryClient.invalidateQueries({ queryKey: [...CELLARS_QUERY_KEY, variables.cellarId] });
      }
    },
  });
}

export function useDeleteCellar() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (cellarId: string) => cellarsClient.deleteCellar(cellarId),
    onMutate: async (cellarId: string) => {
      await queryClient.cancelQueries({ queryKey: CELLARS_QUERY_KEY });
      await queryClient.cancelQueries({ queryKey: [...CELLARS_QUERY_KEY, cellarId] });

      const previousCellars = queryClient.getQueryData<CellarWithStats[]>(CELLARS_QUERY_KEY);
      const previousCellar = queryClient.getQueryData<CellarWithStats>([...CELLARS_QUERY_KEY, cellarId]);

      queryClient.setQueryData<CellarWithStats[]>(CELLARS_QUERY_KEY, (current = []) =>
        current.filter((cellar) => cellar.id !== cellarId)
      );
      queryClient.removeQueries({ queryKey: [...CELLARS_QUERY_KEY, cellarId] });

      return { previousCellars, previousCellar, cellarId } satisfies CellarsContext;
    },
    onError: (_error, _variables, context) => {
      if (context?.previousCellars) {
        queryClient.setQueryData(CELLARS_QUERY_KEY, context.previousCellars);
      }
      if (context?.cellarId && context.previousCellar) {
        queryClient.setQueryData([...CELLARS_QUERY_KEY, context.cellarId], context.previousCellar);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: CELLARS_QUERY_KEY }),
  });
}
