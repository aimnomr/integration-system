import { useQuery } from '@tanstack/react-query';
import { getFleet } from '@/api/fleet';

export function useFleet() {
  return useQuery({
    queryKey: ['fleet'],
    queryFn: ({ signal }) => getFleet(signal),
  });
}
