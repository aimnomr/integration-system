import { apiFetch } from './client';
import type { OeeAvailability, OeeCycle, OeeSummary } from '@/types/api';

export function getOeeSummary(serial: string) {
  return apiFetch<OeeSummary>(
    `/robots/${encodeURIComponent(serial)}/oee/summary`,
  );
}

export function getOeeCycles(serial: string, limit = 50) {
  return apiFetch<{ cycles: OeeCycle[] }>(
    `/robots/${encodeURIComponent(serial)}/oee/cycles`,
    { query: { limit } },
  );
}

export function getOeeAvailability(serial: string) {
  return apiFetch<OeeAvailability>(
    `/robots/${encodeURIComponent(serial)}/oee/availability`,
  );
}
