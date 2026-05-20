import { useQuery } from '@tanstack/react-query';
import { getSystemStatus } from '@/api/system';

/**
 * Polls /system/status every 5 s. The query failing is itself a signal —
 * consumers can read `isError` to mean "API unreachable".
 */
export function useSystemStatus() {
  return useQuery({
    queryKey: ['system', 'status'],
    queryFn: ({ signal }) => getSystemStatus(signal),
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
    staleTime: 0,
    retry: 0, // failure = pill goes red; don't paper over it with retries
  });
}
