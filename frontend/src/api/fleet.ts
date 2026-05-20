import { apiFetch } from './client';
import type { FleetResponse } from '@/types/api';

export function getFleet(signal?: AbortSignal) {
  return apiFetch<FleetResponse>('/fleet', { signal });
}

export interface FleetConfigPatch {
  interface_name: string;
  major_version: string;
  version: string;
  manufacturer: string;
}

export function updateFleet(body: FleetConfigPatch) {
  return apiFetch<FleetConfigPatch>('/fleet', { method: 'PUT', body });
}
