import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cavesClient } from "./client";
import { Cave, CreateCaveInput, UpdateCaveInput } from "@/types/caves";

const CAVES_QUERY_KEY = ["caves"];

export function useCaves() {
  return useQuery({
    queryKey: CAVES_QUERY_KEY,
    queryFn: () => cavesClient.getCaves(),
  });
}

export function useCaveById(caveId: string) {
  return useQuery({
    queryKey: [...CAVES_QUERY_KEY, caveId],
    queryFn: () => cavesClient.getCaveById(caveId),
    enabled: !!caveId,
  });
}

export function useCreateCave() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateCaveInput) => cavesClient.createCave(input),
    onSuccess: (newCave) => {
      queryClient.setQueryData(CAVES_QUERY_KEY, (oldData: Cave[] | undefined) => [
        ...(oldData || []),
        newCave,
      ]);
    },
  });
}

export function useUpdateCave() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ caveId, input }: { caveId: string; input: UpdateCaveInput }) =>
      cavesClient.updateCave(caveId, input),
    onSuccess: (updatedCave) => {
      queryClient.setQueryData(CAVES_QUERY_KEY, (oldData: Cave[] | undefined) =>
        oldData?.map((cave) => (cave.id === updatedCave.id ? updatedCave : cave)) || []
      );
      queryClient.invalidateQueries({ queryKey: [...CAVES_QUERY_KEY, updatedCave.id] });
    },
  });
}

export function useDeleteCave() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (caveId: string) => cavesClient.deleteCave(caveId),
    onSuccess: (_, caveId) => {
      queryClient.setQueryData(CAVES_QUERY_KEY, (oldData: Cave[] | undefined) =>
        oldData?.filter((cave) => cave.id !== caveId) || []
      );
      queryClient.removeQueries({ queryKey: [...CAVES_QUERY_KEY, caveId] });
    },
  });
}
