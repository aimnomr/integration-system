import { apiFetch } from './client';
import type { SystemStatus } from '@/types/api';

export function getSystemStatus(signal?: AbortSignal) {
  return apiFetch<SystemStatus>('/system/status', { signal });
}
