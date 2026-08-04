import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { client } from '@/lib/api';

// ─── Task 4: Humidor Hygrometric Monitoring ──────────────────────────────────
// Follows the same direct-`client` pattern as useCellars.ts (no separate
// web/lib/humidor/client.ts wrapper — this domain is small enough that a
// dedicated client module would just be indirection).

export type HumidorReadingSource = 'manual' | 'sensor';
export type HumidorDriftStatus = 'in_range' | 'out_of_range' | 'unconfigured';

export interface HumidorReading {
  id: string;
  cellarId: string;
  userId: string;
  humidityPercent: number;
  temperatureCelsius: number | null;
  source: HumidorReadingSource;
  recordedAt: string;
}

export interface HumidorHistory {
  cellar: {
    id: string;
    targetHumidityMin: number | null;
    targetHumidityMax: number | null;
  };
  readings: HumidorReading[];
  latest: HumidorReading | null;
  drift: HumidorDriftStatus;
}

/**
 * History + latest drift status for a cellar's humidor readings.
 */
export function useHumidorHistory(cellarId: string, enabled = true) {
  return useQuery<HumidorHistory>({
    queryKey: ['humidor', cellarId, 'readings'],
    queryFn: async () => {
      const { data } = await client.get<HumidorHistory>(`/humidor/cellars/${cellarId}/readings`);
      return data;
    },
    enabled: enabled && !!cellarId,
  });
}

/**
 * Record a manual humidity/temperature reading for a cellar.
 */
export function useRecordHumidorReading(cellarId: string) {
  const queryClient = useQueryClient();
  return useMutation<
    { reading: HumidorReading; drift: HumidorDriftStatus },
    Error,
    { humidityPercent: number; temperatureCelsius?: number | null }
  >({
    mutationFn: async (input) => {
      const { data } = await client.post<{ reading: HumidorReading; drift: HumidorDriftStatus }>('/humidor/readings', {
        cellarId,
        humidityPercent: input.humidityPercent,
        temperatureCelsius: input.temperatureCelsius ?? null,
        source: 'manual',
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['humidor', cellarId] });
    },
  });
}
